---
title: "Semánticas de entrega y consumidores idempotentes"
description: "At-most-once, at-least-once y el alcance real de exactly-once. Duplicados, orden, particiones y concurrencia. Consumidor idempotente en Java con restricción única sobre eventId."
pubDate: 2026-07-10
tags: ['event-driven', 'idempotencia', 'at-least-once', 'exactly-once', 'particiones', 'sdet']
cluster: 'a01'
clusterTitle: "Event-driven y contratos asíncronos"
type: satelite
order: 2
readingLevel: "Avanzado"
prerequisites: "Requiere SQL con restricciones únicas y transacciones."
icon: 'bell'
iconHue: 25
---

> **Aviso.** Nexo Finanzas es **ficticio**. El pseudocódigo es didáctico y **no es código listo para producción**: omite manejo de errores, métricas, tracing y detalles del driver. No se ejecutó ningún broker ni test.

> **Promesa del artículo.** Al terminar vas a poder explicar, sin recurrir a marketing, por qué "exactly-once" es una afirmación con alcance y no una propiedad; vas a poder escribir un consumidor idempotente cuya corrección dependa de una restricción de la base y no de una condición de carrera; y vas a saber qué probar para demostrarlo.

> Este artículo asume el modelo, el glosario y el threat model del pilar: [Recibir un mensaje no es procesarlo](/blog/recibir-un-mensaje-no-es-procesarlo/).

## El duplicado no es un bug: es la única opción sana

Imaginá el consumidor de `TransferCreated`. Procesa el evento —actualiza el saldo proyectado— y tiene que decirle al broker "listo". Dos órdenes posibles:

**Opción A: confirmar primero, procesar después.**

```text
recibir(evento) -> ack() -> procesar(evento)
```

Si el proceso muere entre `ack()` y `procesar()`, el broker cree que terminó. El evento **se perdió para siempre**, y nadie lo sabe. Esto es **at-most-once**: cero o una entrega.

**Opción B: procesar primero, confirmar después.**

```text
recibir(evento) -> procesar(evento) -> ack()
```

Si el proceso muere entre `procesar()` y `ack()`, el broker no recibió confirmación y **reentrega**. El evento se procesa **dos veces**. Esto es **at-least-once**: una o más entregas.

No hay una tercera opción, y no es un problema de ingeniería mediocre. Es una consecuencia del **problema de los dos generales**: dos partes que se comunican por un canal no confiable no pueden llegar a un acuerdo garantizado sobre un hecho en un número finito de mensajes. Alguien tiene que actuar primero, y ese alguien asume el riesgo.

<figure class="diagram">
  <img src="/blog/diagrams/semanticas-de-entrega-y-consumidores-idempotentes-1.svg" width="535" height="721" alt="Diagrama: semanticas-de-entrega-y-consumidores-idempotentes (1)" loading="lazy" decoding="async" />
</figure>

Para dinero ficticio o real, perder una transferencia es peor que procesarla dos veces —porque lo segundo lo podés hacer inofensivo y lo primero no. Por eso, en la práctica, **elegís at-least-once y hacés que el duplicado no importe**. Esa es toda la conversación.

## El alcance real de "exactly-once"

Vas a ver "exactly-once semantics" en la portada de varios brokers. La afirmación no es mentira, pero tiene letra chica que rara vez se lee.

Lo que algunos brokers ofrecen, bajo configuración específica, es una operación atómica **dentro de su propio ecosistema**: consumir de un topic, producir a otro topic, y commitear el offset, todo o nada. Es real, es útil, y es una propiedad transaccional del broker.

Lo que **no** ofrece ningún broker:

- Atomicidad entre el broker y **tu base de datos**.
- Atomicidad entre el broker y un `POST` a un servicio externo.
- Atomicidad entre el broker y el envío de un mail, una notificación push o una impresión.

En el instante en que el efecto de tu consumidor **sale del broker**, volvés a at-least-once y necesitás idempotencia. Y el efecto de un consumidor de transferencias siempre sale del broker: escribe en una base.

La formulación honesta, la que deberías poder escribir en un ADR:

> "El broker ofrece atomicidad para el ciclo consumir-producir-commitear dentro de sus propios topics, bajo la configuración X. Nuestro consumidor escribe en PostgreSQL, fuera de esa frontera. Por lo tanto, asumimos **at-least-once** y garantizamos **effectively-once** mediante una restricción única sobre `eventId` en la tabla de inbox."

Eso es un ingeniero senior hablando. "Usamos Kafka, tiene exactly-once" no lo es.

## Idempotencia de API vs idempotencia de consumidor

Cuidado con esta trampa de vocabulario, porque las dos cosas se llaman igual y se resuelven distinto.

| | Idempotencia de **API** | Idempotencia de **consumidor** |
|---|---|---|
| ¿Quién genera la clave? | El **cliente**, una por intención | El **productor**, una por evento |
| ¿Cómo se llama? | `Idempotency-Key` (header) | `eventId` (campo del payload) |
| ¿Qué protege? | Un reintento HTTP tras timeout | Una reentrega del broker |
| ¿Hay que detectar reuso? | **Sí**: misma clave + body distinto = `422` | No: el `eventId` identifica un hecho inmutable |
| ¿Se guarda la respuesta? | Sí, para reemitirla idéntica | No hay respuesta que reemitir |

En Nexo Finanzas conviven las dos. Ya cubrimos la primera en [Idempotencia y reintentos en transferencias](/blog/idempotencia-y-reintentos-en-transferencias/). Este artículo trata **solo la segunda**, y no repite la primera.

La diferencia práctica más importante: en la API tenés que preocuparte por el **fingerprint del body**, porque un cliente puede reusar una clave para otra operación. En el consumidor, no: `eventId` identifica un hecho que ya ocurrió y es inmutable. Si llega el mismo `eventId` con contenido distinto, no es un conflicto semántico del consumidor, es una **corrupción del productor**, y merece una alerta, no un `422`.

## El consumidor idempotente: la corrección vive en la base

El patrón se llama **inbox** (o *idempotent consumer*). La idea es simple y la implementación tiene una sola trampa.

**Idea:** antes de procesar, registrá el `eventId` en una tabla con restricción única. Si el `INSERT` falla por violación de unicidad, ya lo procesaste: descartá y confirmá.

**Trampa:** el registro del `eventId` y el efecto de negocio deben ocurrir en **la misma transacción local**. Si están en transacciones distintas, existe una ventana en la que registraste el evento pero no aplicaste el efecto (o al revés), y el reintento no te salva.

```sql
-- Tabla de inbox. La restriccion UNIQUE es donde vive la correccion.
CREATE TABLE processed_event (
    event_id      UUID PRIMARY KEY,
    event_type    TEXT        NOT NULL,
    processed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

`PRIMARY KEY` ya impone unicidad. No hace falta más.

```java
// Pseudocodigo didactico. NO es codigo listo para produccion.
// Omite manejo de errores, metricas, tracing y detalles del driver.
public void onTransferCreated(EventEnvelope envelope) {

    // El contexto de traza se extrae del mensaje ANTES de abrir la transaccion,
    // para que el span cubra el trabajo real. Ver articulo 4.
    try (Scope scope = tracer.extractAndActivate(envelope.headers())) {

        // Una sola transaccion local: marca + efecto.
        transactionTemplate.execute(tx -> {

            // 1) Reclamo del evento. Insert-first, NO check-then-act.
            boolean firstTime = inbox.tryInsert(envelope.eventId(), envelope.type());

            if (!firstTime) {
                // Ya procesado. Descartar en silencio es correcto y esperado.
                log.debug("evento duplicado descartado eventId={}", envelope.eventId());
                return null; // el ack se emite afuera, igual
            }

            // 2) Efecto de negocio, en la MISMA transaccion.
            TransferCreated payload = envelope.payload(TransferCreated.class);
            balanceProjection.applyDebit(payload.fromAccount(), payload.amountMinor());
            balanceProjection.applyCredit(payload.toAccount(), payload.amountMinor());

            return null;
        });
    }
    // 3) ack DESPUES del commit. Si morimos aca, el broker reentrega
    //    y el paso 1 descarta. Effectively-once.
    consumer.acknowledge(envelope);
}
```

Tres decisiones cargan todo el peso:

- **`tryInsert` es insert-first, no check-then-act.** El patrón `if (inbox.exists(id)) return; inbox.insert(id);` tiene una condición de carrera: dos hilos leen "no existe", ambos insertan (uno falla), ambos ya decidieron procesar. Insert-first delega la atomicidad a la base, que es la única que puede darla. Si el `INSERT` lanza violación de unicidad, es un duplicado: capturala y devolvé `false`.
- **La misma transacción envuelve marca y efecto.** Si `applyCredit` falla, la transacción revierte *también* el `INSERT` del `eventId`, y la reentrega vuelve a intentar. Es exactamente lo que querés.
- **El `ack` va después del commit.** Si el proceso muere entre el commit y el `ack`, el broker reentrega, el paso 1 descarta, y el `ack` se emite. Efecto: uno. Eso es *effectively-once*.

### Cuándo el inbox no alcanza

El inbox garantiza "un efecto por evento". No garantiza "un efecto por intención de negocio". Si el productor publica dos eventos con `eventId` distintos para la misma transferencia (por un bug de outbox mal implementado, por ejemplo), el consumidor los procesará como dos hechos y hará bien.

La protección contra eso vive en el productor —el outbox escribe una fila por transferencia, dentro de la transacción— y en la reconciliación, que detecta lo que ambos dejaron pasar. Ninguna capa se salva sola.

## Crecimiento del inbox: la parte aburrida que muerde

La tabla `processed_event` crece para siempre. Sin una política de retención, en un año tenés cientos de millones de filas y un índice que no entra en memoria.

La decisión: **¿cuánto tiempo puede un broker reentregar un evento?** Ese es el piso del TTL. Si tu broker garantiza que no reentrega después de 7 días de retención, un TTL de 30 días es holgado y seguro.

```sql
-- Propuesta, no resultado. Ejecutar como job periodico con lote acotado.
DELETE FROM processed_event
WHERE processed_at < now() - INTERVAL '30 days'
  AND event_id IN (
      SELECT event_id FROM processed_event
      WHERE processed_at < now() - INTERVAL '30 days'
      LIMIT 10000
  );
```

**Trade-off explícito:** TTL corto ahorra espacio y reduce la ventana de protección; TTL largo protege ante replays tardíos y cuesta almacenamiento. Escribilo en el ADR con el número que elijas y **la razón**. Un TTL sin justificación es un número mágico esperando a romperse.

## Orden, particiones y concurrencia

Acá se concentran los bugs más difíciles de reproducir.

**Regla general:** el orden se garantiza **dentro de una partición**, no entre particiones. Y la clave de partición es una decisión de **negocio**.

Para Nexo Finanzas:

- **Particionar por `transferId`:** todos los eventos de una misma transferencia van a la misma partición y llegan en orden. `TransferCreated` antes que `TransferCompleted`. Perfecto para el ciclo de vida de una transferencia. **No** te da orden entre transferencias de la misma cuenta.
- **Particionar por `accountId`:** todos los eventos de una cuenta van juntos y en orden. Te da consistencia por cuenta, a costa de una **hot partition** si una cuenta ficticia concentra el tráfico.

No hay respuesta universal. Hay una pregunta: **¿qué invariante necesita orden?** Si tu proyección de saldos suma y resta importes, la suma es conmutativa y **no necesitás orden en absoluto**. Si tu máquina de estados rechaza `COMPLETED` sobre una transferencia que no existe, sí lo necesitás —o necesitás tolerar el desorden.

### Consumidor tolerante a orden

La alternativa a exigir orden es diseñar para no necesitarlo. Dos técnicas:

- **Conmutatividad.** Si el efecto es `saldo += delta`, el orden es irrelevante. Preferí modelar efectos conmutativos siempre que puedas.
- **Buffering con versión.** Si `TransferCompleted` llega antes que `TransferCreated`, el consumidor detecta que no conoce esa `transferId`, guarda el evento en una tabla de pendientes y lo reprocesa cuando llegue el que falta. Añade complejidad; usalo solo cuando la invariante lo exija.

**Lo que no debés hacer:** ordenar con un `sleep` "para dar tiempo a que llegue el otro". Eso convierte una condición de carrera en una condición de carrera lenta.

### Concurrencia dentro de una partición

Si escalás el consumidor a N hilos sobre la misma partición, perdiste el orden que la partición te daba, y ganaste contención sobre las mismas filas de saldo. Dos consumidores actualizando `balance` de la misma cuenta al mismo tiempo necesitan bloqueo o un `UPDATE ... SET balance = balance + ?` atómico.

**Regla:** paralelizá entre particiones, no dentro. Y si necesitás más paralelismo, agregá particiones —lo cual cambia el mapeo de claves y requiere un plan de migración. Escribilo en el ADR antes de necesitarlo.

## Matriz de pruebas

Estas son las pruebas que demuestran los controles de este artículo. Todas usan datos **sintéticos** y verifican el **efecto de negocio**, no el `ack`.

| # | Caso | Cómo se provoca | Resultado esperado (diseño) |
|---|---|---|---|
| 1 | Duplicado exacto | Publicar el mismo `eventId` dos veces | 1 fila en `processed_event`; saldo aplicado **una** vez |
| 2 | Pérdida de `ack` | Matar el consumidor entre commit y `ack` | El broker reentrega; el efecto sigue siendo uno |
| 3 | Fuera de orden | Publicar `TransferCompleted` antes que `TransferCreated` | Sin excepción no controlada; el evento queda pendiente o se descarta con log explícito |
| 4 | Consumidor caído | Detener el consumidor, publicar N eventos, reiniciar | Drena los N; ningún efecto duplicado |
| 5 | Concurrencia | N hilos consumen la misma partición con el mismo `eventId` | Exactamente un `INSERT` exitoso; el resto captura violación de unicidad |
| 6 | `eventId` repetido con payload distinto | Publicar dos payloads con el mismo `eventId` | Se descarta el segundo **y se emite una alerta**: es corrupción del productor |

El caso 5 merece un comentario: es el que más veces revela un `check-then-act` escondido. Ejecutalo con repetición (10–20 iteraciones) porque una condición de carrera no falla siempre.

Ejemplo de expectativa de diseño (no es una medición):

```text
# Propuesta reproducible. Entorno: compose local, commit <SHA>, fecha <YYYY-MM-DD>.
# Caso 1: duplicado exacto
$ publicar-evento --file evento-TransferCreated-sintetico.json   # x2

# Resultado ESPERADO:
#   SELECT count(*) FROM processed_event WHERE event_id = '<uuid>';  -> 1
#   SELECT balance_minor FROM balance_projection WHERE account='acc_00002'; -> +10000 (una vez)
```

## Trade-offs

- **Inbox en la base vs deduplicación en el broker.** El inbox funciona con cualquier broker y protege el efecto real; cuesta una escritura por evento. La deduplicación del broker es más barata pero solo cubre la frontera del broker.
- **Restricción única vs bloqueo pesimista.** `PRIMARY KEY` escala mejor y es más simple de razonar. `SELECT ... FOR UPDATE` serializa y es más fácil de explicar, pero sufre bajo contención.
- **Conmutatividad vs buffering.** Modelar efectos conmutativos elimina la necesidad de orden y de buffering. Cuando es posible, es la opción claramente superior.
- **TTL del inbox.** Ver arriba. No hay número correcto; hay número justificado.

## Anti-patrones

- **`ack` antes de procesar.** *Causa:* querer bajar la latencia. *Consecuencia:* pérdida silenciosa, la peor clase de fallo. *Alternativa:* `ack` después del commit.
- **`check-then-act` sobre el inbox.** *Causa:* el código se lee mejor. *Consecuencia:* doble efecto bajo concurrencia, reproducible solo en producción. *Alternativa:* insert-first y capturar la violación de unicidad.
- **Marca del evento y efecto en transacciones distintas.** *Consecuencia:* eventos marcados como procesados cuyo efecto nunca ocurrió. *Alternativa:* una sola transacción local.
- **Citar "exactly-once" sin alcance.** *Consecuencia:* el equipo deja de implementar idempotencia. *Alternativa:* escribir la frase completa con la configuración y la frontera.
- **Paralelizar dentro de una partición.** *Consecuencia:* perdés el orden que justificaba particionar y ganás contención. *Alternativa:* más particiones.
- **Inbox sin política de retención.** *Consecuencia:* la tabla se convierte en el cuello de botella. *Alternativa:* TTL justificado y job de limpieza por lotes.

## Qué publicar en GitHub

- `docs/adr/ADR-001-event-delivery-semantics.md`: qué semántica asumís, con qué broker, con qué configuración, y **la frase completa** sobre exactly-once.
- `docs/adr/ADR-003-particionamiento.md`: clave de partición elegida, invariante que protege, riesgo de hot partition, plan de repartición.
- `src/.../IdempotentConsumer.java` + migración SQL del inbox.
- `tests/integration/DuplicateDeliveryTest.java` con los 6 casos de la matriz, sin `sleep`.

## Qué aprendimos / próximos pasos

- El duplicado es la consecuencia de elegir no perder mensajes. Es la opción correcta.
- *Exactly-once* es una propiedad con frontera, no una garantía global.
- La corrección del consumidor idempotente vive en una restricción de la base, no en un `if`.
- El orden es una necesidad del **negocio**, no del broker. Preguntá qué invariante lo requiere antes de exigirlo.

**Siguiente:** [Outbox, inbox, DLQ y replay seguro](/blog/outbox-inbox-dlq-y-replay-seguro/), el lado del productor y de la recuperación.

## Checklist final

- [ ] El `ack` se emite después del commit del efecto.
- [ ] El reclamo del `eventId` es insert-first sobre una restricción única.
- [ ] Marca y efecto viven en la misma transacción local.
- [ ] El ADR declara el alcance exacto de las garantías del broker.
- [ ] La clave de partición está justificada por una invariante de negocio.
- [ ] No hay paralelismo dentro de una partición sin un control de concurrencia explícito.
- [ ] El inbox tiene TTL y job de limpieza.
- [ ] La prueba de concurrencia se ejecuta con repetición.
- [ ] Ninguna prueba usa `sleep`.

---

## Fuentes (consultadas 2026-07-10)

- [AsyncAPI Documentation](https://www.asyncapi.com/docs)
- [RFC 9110 — HTTP Semantics, métodos idempotentes](https://www.rfc-editor.org/rfc/rfc9110#name-idempotent-methods) — para contrastar idempotencia de método y de aplicación.
- [IETF `draft-ietf-httpapi-idempotency-key-header`](https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/) — el header `Idempotency-Key` de la columna izquierda de la tabla. Es un **Internet-Draft, no un RFC**: adoptalo como convención, no lo cites como norma cerrada.
- Documentación oficial del broker elegido, para el **alcance exacto** de sus garantías transaccionales. Este artículo deliberadamente no cita una porque la afirmación depende de la configuración, no del producto.
- [Verificación de fuentes de la serie](/blog/verificacion-de-fuentes-serie-avanzada/)
