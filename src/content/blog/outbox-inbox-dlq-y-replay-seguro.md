---
title: "Outbox, inbox, DLQ y replay seguro"
description: "Transactional outbox con esquema SQL y máquina de estados, patrón inbox, dead-letter queue con política de reintentos, y un runbook de replay idempotente y autorizado."
pubDate: 2026-07-10
tags: ['outbox', 'dlq', 'replay', 'event-driven', 'postgresql', 'runbook', 'sdet']
cluster: 'a01'
clusterTitle: "Event-driven y contratos asíncronos"
type: satelite
order: 3
readingLevel: "Avanzado"
prerequisites: "Requiere SQL, transacciones y nociones de operación."
icon: 'bell'
iconHue: 25
---

> **Aviso.** Nexo Finanzas es **ficticio**. El SQL y el pseudocódigo son didácticos y **no son código listo para producción**. No se ejecutó ningún broker, base ni pipeline: los comandos son propuestas reproducibles.

> **Promesa del artículo.** Al terminar vas a poder implementar un transactional outbox y defender su esquema en un review; vas a saber por qué una DLQ sin política es un cementerio; y vas a tener un runbook de replay que otra persona puede ejecutar sin duplicar dinero ficticio.

> Este artículo asume el modelo del pilar ([Recibir un mensaje no es procesarlo](/blog/recibir-un-mensaje-no-es-procesarlo/)) y el patrón inbox del artículo anterior ([Semánticas de entrega](/blog/semanticas-de-entrega-y-consumidores-idempotentes/)).

## El problema de la doble escritura

Volvamos al fallo A2 del threat model: el servicio commitea la transferencia y muere antes de publicar el evento. El dinero ficticio se movió, y ningún consumidor se entera.

El código que lo produce es el más natural del mundo:

```java
// INCORRECTO. Este es el bug, no la solucion.
@Transactional
public void createTransfer(TransferRequest req) {
    Transfer t = transferRepository.save(req.toTransfer());  // (1) base
    eventPublisher.publish(new TransferCreated(t));          // (2) broker
}
```

`@Transactional` cubre (1). **No cubre (2)**, porque el broker no participa de la transacción de PostgreSQL. Cuatro escenarios:

| | Commit (1) | Publish (2) | Resultado |
|---|---|---|---|
| a | OK | OK | Correcto |
| b | OK | **falla** | Transferencia sin evento. **Pérdida silenciosa.** |
| c | **falla** | OK | Evento sin transferencia. **Hecho inventado.** |
| d | falla | falla | Correcto (nada pasó) |

El caso (c) es peor de lo que parece: si `publish` va antes del commit, un consumidor puede procesar un evento sobre una transferencia que la base va a revertir. Habrás actualizado un saldo por algo que nunca ocurrió.

**La solución no es una transacción distribuida.** Two-phase commit sobre un broker es caro, frágil, raramente soportado y bloquea recursos ante fallos del coordinador. La solución es más simple: **mover la publicación adentro de la transacción que sí tenés.**

## Transactional outbox

Escribí el evento en una **tabla de la misma base**, en la misma transacción. Después, un proceso separado lee esa tabla y publica.

<figure class="diagram">
  <img src="/blog/diagrams/outbox-inbox-dlq-y-replay-seguro-1.svg" width="1051" height="499" alt="Diagrama: outbox-inbox-dlq-y-replay-seguro (1)" loading="lazy" decoding="async" />
</figure>

Ahora los cuatro escenarios colapsan en dos: o se guardaron transferencia **y** evento, o ninguno de los dos. El caso (b) desaparece porque el evento quedó persistido y el publisher lo va a tomar. El caso (c) desaparece porque no hay forma de publicar sin haber commiteado.

**Lo que ganaste:** la publicación pasó de ser *at-most-once, sin red* a ser *at-least-once, garantizada*.
**Lo que pagaste:** el publisher puede publicar el mismo evento dos veces (si muere entre publicar y marcar). Por eso el consumidor es idempotente. Las dos piezas son un sistema.

### Esquema del outbox

```sql
CREATE TABLE outbox_event (
    -- eventId: viaja en el mensaje. Es la clave que el inbox del consumidor deduplica.
    event_id        UUID        PRIMARY KEY,

    -- Agrupacion y orden. La clave de particion se deriva de aggregate_id.
    aggregate_type  TEXT        NOT NULL,          -- 'transfer'
    aggregate_id    TEXT        NOT NULL,          -- transferId
    event_type      TEXT        NOT NULL,          -- 'TransferCreated'
    schema_version  TEXT        NOT NULL,          -- '1.0.0'

    payload         JSONB       NOT NULL,
    headers         JSONB       NOT NULL,          -- correlationId, traceparent

    -- Maquina de estados de publicacion
    status          TEXT        NOT NULL DEFAULT 'PENDING',
    attempts        INT         NOT NULL DEFAULT 0,
    last_error      TEXT,

    occurred_at     TIMESTAMPTZ NOT NULL,          -- cuando ocurrio el hecho
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    published_at    TIMESTAMPTZ,

    CONSTRAINT outbox_status_valid
        CHECK (status IN ('PENDING','PUBLISHING','PUBLISHED','FAILED'))
);

-- El indice que hace viable el polling: solo filas pendientes.
CREATE INDEX outbox_pending_idx
    ON outbox_event (created_at)
    WHERE status IN ('PENDING','FAILED');
```

Dos detalles que se pasan por alto:

- **El índice parcial (`WHERE status IN (...)`)**. Sin él, el `SELECT` de pendientes escanea una tabla que crece sin límite. Con él, el índice solo contiene las filas que importan, y se vacía solo.
- **`occurred_at` es distinto de `created_at`.** El primero es cuándo ocurrió el hecho de negocio; el segundo, cuándo se escribió la fila. Los consumidores razonan sobre el primero. Confundirlos rompe cualquier ventana temporal aguas abajo. Volvemos sobre esto en el [capítulo de data quality](/blog/coleccion/a05/).

### Estados de publicación

<figure class="diagram">
  <img src="/blog/diagrams/outbox-inbox-dlq-y-replay-seguro-2.svg" width="493" height="495" alt="Diagrama: outbox-inbox-dlq-y-replay-seguro (2)" loading="lazy" decoding="async" />
</figure>

`PUBLISHING` no es decorativo: evita que dos instancias del publisher tomen la misma fila. Se reclama con `SELECT ... FOR UPDATE SKIP LOCKED`, que permite a N publishers trabajar en paralelo sin bloquearse entre sí.

```sql
-- Propuesta. Reclamo de un lote por un publisher, sin contencion entre instancias.
BEGIN;
  SELECT event_id, event_type, payload, headers
  FROM outbox_event
  WHERE status IN ('PENDING','FAILED')
    AND attempts < 10
  ORDER BY created_at
  LIMIT 100
  FOR UPDATE SKIP LOCKED;
  -- ... publicar cada uno ...
  UPDATE outbox_event SET status='PUBLISHED', published_at=now() WHERE event_id = ANY($1);
COMMIT;
```

**`SKIP LOCKED` es la razón por la que esto escala.** Sin él, dos publishers se serializan sobre las mismas filas.

### Escritura del evento, en la misma transacción

```java
// Pseudocodigo didactico. NO es codigo listo para produccion.
@Transactional
public Transfer createTransfer(TransferRequest req) {
    Transfer t = transferRepository.save(req.toTransfer());

    // MISMA transaccion. Si esto falla, la transferencia tampoco existe.
    outboxRepository.append(OutboxEvent.builder()
        .eventId(UUID.randomUUID())          // clave de deduplicacion del consumidor
        .aggregateType("transfer")
        .aggregateId(t.id())
        .eventType("TransferCreated")
        .schemaVersion("1.0.0")
        .occurredAt(t.createdAt())
        .correlationId(RequestContext.correlationId())
        .traceparent(Span.current().toW3cTraceparent())  // ver articulo 4
        .payload(TransferCreatedPayload.from(t))
        .build());

    return t;
}
```

Lo importante no es el builder. Es que **no hay ninguna llamada al broker en este método.** El servicio de transferencias no conoce al broker. Eso también es una mejora de testabilidad: podés probar la creación de la transferencia y del evento sin levantar mensajería.

### Polling vs Change Data Capture

Dos formas de sacar el evento de la tabla:

| | Polling del publisher | CDC (leer el WAL) |
|---|---|---|
| Complejidad operativa | Baja | Alta (conector, offsets, esquemas) |
| Latencia | Intervalo de polling | Cercana a tiempo real |
| Carga sobre la base | `SELECT` periódico | Lectura del log de replicación |
| Acoplamiento | Ninguno extra | Al motor y su versión |
| Bueno para | Empezar; volumen moderado | Volumen alto; latencia estricta |

**Recomendación para un portfolio:** empezá con polling. Es comprensible, se depura con `SELECT`, y no arrastra un componente más al `docker compose`. Escribí en el ADR que CDC es el camino de escala y **qué señal** te haría cambiar (por ejemplo: latencia p99 de publicación sostenidamente por encima del intervalo aceptable). Introducir CDC en un demo sin esa señal es exactamente el anti-patrón de "agregar tecnología para nombrarla".

## Dead-letter queue: el cementerio con reglas

Un mensaje **envenenado** es uno que falla siempre: payload corrupto, un campo que no parsea, una precondición de negocio que nunca se va a cumplir. Reintentarlo eternamente tiene dos costos: consume capacidad, y en brokers con orden por partición, **bloquea todo lo que viene detrás**.

La DLQ es donde va después de agotar los reintentos. Y ahí empiezan las decisiones reales.

### Política de reintentos

Tres parámetros, tres justificaciones:

- **Máximo de intentos.** No hay número universal. La pregunta es: *¿cuánto tarda en recuperarse la falla transitoria más lenta que espero?* Si tu base tarda 30 s en reelegir primario, y tu backoff llega a 30 s al quinto intento, cinco intentos es defendible. Escribí el razonamiento, no el número.
- **Backoff exponencial con jitter.** Sin jitter, N consumidores que fallaron juntos reintentan juntos y crean una estampida. El jitter (aleatorizar el delay) la desarma. Es la diferencia entre un pico y una recuperación.
- **Clasificación del error.** Un `SocketTimeoutException` es transitorio: reintentá. Un `JsonParseException` es permanente: mandalo a la DLQ **en el primer intento**. Reintentar un error permanente es puro desperdicio, y retrasa el diagnóstico.

```java
// Pseudocodigo. La clasificacion del error es la decision, no el backoff.
if (error instanceof PermanentError) {
    deadLetter.send(envelope, error);      // sin reintentos
} else if (envelope.attempts() >= maxAttempts) {
    deadLetter.send(envelope, error);      // agoto reintentos
} else {
    retryWithBackoffAndJitter(envelope);
}
```

### Qué debe llevar un mensaje a la DLQ

Un mensaje en la DLQ sin contexto es basura. Preservá, como headers o metadatos:

- El `eventId` y el payload **original, sin modificar**.
- El `correlationId` y el `traceparent`, para poder ir a la traza.
- El **motivo**: excepción, mensaje, stack trace acotado.
- Cuántos intentos hubo y cuándo fue el último.
- La **versión del consumidor** que falló. Sin esto no podés saber si un deploy nuevo arregla el problema.

## Replay: una operación privilegiada

Reprocesar la DLQ suena inofensivo. No lo es: es **reintroducir efectos de negocio en el sistema, a mano**. Si el consumidor no es idempotente, duplicás dinero ficticio. Si cualquiera puede hacerlo, tenés un canal de escritura sin auditoría.

Tres reglas, no negociables:

1. **El replay usa exactamente el mismo camino que la entrega normal**, con el mismo consumidor idempotente. Si escribís un script especial que "aplica el efecto directamente", perdiste la protección del inbox.
2. **El replay es autorizado y auditado.** Quién lo pidió, quién lo aprobó, qué rango de eventos, cuándo. En un portfolio esto se demuestra con un comando que exige un ticket y deja registro, no con un `curl` suelto.
3. **El replay se ensaya.** Un runbook que nunca se ejecutó es una hipótesis.

### Runbook: replay de eventos en dead-letter

> Guardar como `docs/runbooks/replay-dead-letter-events.md`. **Este runbook nunca fue ejecutado en un entorno real; es un procedimiento propuesto para el sandbox local.**

**Cuándo se usa.** Hay mensajes en la DLQ cuya causa raíz ya fue corregida y desplegada.

**Precondiciones (todas obligatorias):**

- [ ] La causa raíz está identificada y **el fix está desplegado**. Reprocesar contra el mismo bug vuelve a llenar la DLQ.
- [ ] El consumidor destino tiene inbox idempotente **activo** y verificado.
- [ ] Existe un ticket con la aprobación de la persona responsable del servicio.
- [ ] Se conoce el **rango exacto**: `eventId`s o ventana temporal. "Reprocesar todo" no es un rango.
- [ ] Hay una estimación del volumen y del impacto de carga.

**Procedimiento:**

1. **Inventariar.** Contar y clasificar los mensajes por motivo de fallo. Si hay más de un motivo, tratarlos por separado.
   ```text
   # Propuesta. El comando concreto depende del broker.
   dlq-inspect --topic transfers.DLQ --group-by error_type
   ```
2. **Muestrear.** Elegir **un** mensaje y reprocesarlo solo. Verificar el efecto de negocio en la proyección, no el `ack`.
3. **Verificar idempotencia en vivo.** Reprocesar **el mismo mensaje otra vez**. El efecto debe seguir siendo uno. Si cambia, **abortar**: el inbox no está funcionando.
4. **Reprocesar por lotes acotados**, con pausa entre lotes, observando latencia del consumidor y profundidad de la cola principal. Un replay que satura el consumidor genera el incidente que querías evitar.
5. **Reconciliar.** Comparar totales antes y después contra la fuente de verdad. La cantidad de efectos nuevos debe coincidir con la cantidad de eventos que **no** estaban en el inbox.
6. **Cerrar.** Registrar en el ticket: rango reprocesado, volumen, duración, discrepancias encontradas.

**Condiciones de aborto:**

- El paso 3 muestra un efecto duplicado.
- La profundidad de la cola principal crece durante el replay.
- Aparece un error nuevo, distinto del que se estaba corrigiendo.

**Si algo salió mal.** El replay **no tiene rollback automático**: los efectos ya se aplicaron. La recuperación es una corrección compensatoria (un asiento inverso, con audit trail), nunca un `DELETE`. Por eso los pasos 2 y 3 existen: para descubrir el problema con un mensaje, no con diez mil.

## Matriz de pruebas del outbox

| # | Caso | Cómo se provoca | Resultado esperado (diseño) |
|---|---|---|---|
| 1 | Fallo entre commit y publish | Matar el publisher tras el commit | La fila queda `PENDING`; al reiniciar, se publica |
| 2 | Publisher publica dos veces | Matar entre `publish` y `UPDATE status` | El consumidor idempotente descarta el segundo |
| 3 | Rollback de la transferencia | Forzar excepción tras `outboxRepository.append` | **Cero** filas en `outbox_event`: no hay evento inventado |
| 4 | Dos publishers concurrentes | Levantar 2 instancias | Ningún evento publicado dos veces por reclamo simultáneo (`SKIP LOCKED`) |
| 5 | Mensaje envenenado | Publicar payload que no parsea | Va a DLQ **al primer intento**, no tras 10 |
| 6 | Replay idempotente | Reprocesar un mensaje ya aplicado | Efecto de negocio sin cambios |

El caso 3 es el más valioso y el que menos gente escribe. Es la prueba de que no inventás hechos.

## Anti-patrones

- **Publicar dentro de `@Transactional` creyendo que está cubierto.** *Consecuencia:* pérdida silenciosa o hecho inventado, según el orden. *Alternativa:* outbox.
- **Outbox sin índice parcial.** *Consecuencia:* el `SELECT` de pendientes degrada a medida que la tabla crece; el sistema se frena solo. *Alternativa:* índice parcial sobre los estados no terminales.
- **DLQ sin política ni contexto.** *Causa:* configurarla porque el broker la ofrece. *Consecuencia:* un cementerio que nadie mira y del que nadie puede diagnosticar nada. *Alternativa:* alerta sobre profundidad, contexto completo en el mensaje, y dueño.
- **Reintentar errores permanentes.** *Consecuencia:* desperdicio y retraso del diagnóstico. *Alternativa:* clasificar el error antes de decidir.
- **Backoff sin jitter.** *Consecuencia:* estampida sincronizada al recuperarse la dependencia. *Alternativa:* jitter.
- **Replay por fuera del consumidor.** *Causa:* "es más rápido aplicar el efecto directo". *Consecuencia:* te salteaste el inbox y duplicaste. *Alternativa:* replay por el mismo camino, siempre.
- **Replay sin autorización ni auditoría.** *Consecuencia:* un canal de escritura sin trazabilidad sobre datos financieros. *Alternativa:* ticket, aprobación, registro.
- **CDC en un demo local sin una señal que lo justifique.** *Consecuencia:* complejidad sin valor. *Alternativa:* polling + ADR que nombra el disparador de la migración.

## Qué publicar en GitHub

- `docs/adr/ADR-002-outbox-pattern.md`: polling vs CDC vs publicación directa, con la señal concreta que dispararía la migración a CDC.
- Migración SQL de `outbox_event` **con el índice parcial** y el `CHECK` de estados.
- `docs/runbooks/replay-dead-letter-events.md`: el runbook de arriba, con la nota de que no fue ejecutado en producción.
- `tests/integration/OutboxTest.java` con los 6 casos, especialmente el 3.
- Una métrica de **antigüedad del evento pendiente más viejo** (`max(now() - created_at) WHERE status='PENDING'`). Es la señal que revela un publisher muerto. La profundidad de la tabla no lo hace: un publisher muerto con poco tráfico deja pocas filas y mucha antigüedad.

## Qué aprendimos / próximos pasos

- La doble escritura se resuelve moviendo la publicación adentro de la transacción que ya tenés, no agregando una transacción distribuida.
- Outbox y consumidor idempotente son **una sola solución en dos mitades**. Ninguna sirve sola.
- Una DLQ sin política, contexto y dueño es un cementerio.
- El replay es una operación privilegiada: idempotente, autorizada, auditada y ensayada.

**Siguiente:** [Contratos AsyncAPI y estrategia de pruebas por frontera](/blog/contratos-asyncapi-y-estrategia-de-pruebas-por-frontera/).

## Checklist final

- [ ] Ninguna llamada al broker ocurre dentro de la transacción de negocio.
- [ ] `outbox_event` tiene índice parcial sobre estados no terminales.
- [ ] `occurred_at` y `created_at` son campos distintos y significan cosas distintas.
- [ ] El reclamo de filas usa `FOR UPDATE SKIP LOCKED`.
- [ ] Existe un test que demuestra que un rollback **no** deja evento.
- [ ] Los errores se clasifican en transitorios y permanentes antes de reintentar.
- [ ] El backoff tiene jitter y límite.
- [ ] Los mensajes en DLQ conservan `correlationId`, motivo, intentos y versión del consumidor.
- [ ] El runbook de replay exige verificar idempotencia con un mensaje antes del lote.
- [ ] Hay una métrica de **antigüedad** del pendiente más viejo, no solo de cantidad.

---

## Fuentes (consultadas 2026-07-10)

- [AsyncAPI Documentation](https://www.asyncapi.com/docs)
- [PostgreSQL — `SELECT ... FOR UPDATE SKIP LOCKED`](https://www.postgresql.org/docs/current/sql-select.html#SQL-FOR-UPDATE-SHARE)
- [OpenTelemetry Documentation](https://opentelemetry.io/docs/) — propagación de contexto a través del mensaje.
- Documentación oficial del broker elegido, para el comportamiento concreto de su DLQ y su política de reintentos.
- [Verificación de fuentes de la serie](/blog/verificacion-de-fuentes-serie-avanzada/)
