---
title: "Recibir un mensaje no es procesarlo: calidad en sistemas event-driven"
description: "Pilar de event-driven Quality Engineering: diferencia entre comando y evento, dónde termina la transacción, el modelo de amenaza de una transferencia asíncrona y por qué el ack no prueba nada."
pubDate: 2026-07-10
tags: ['event-driven', 'mensajeria', 'sdet', 'arquitectura-distribuida', 'idempotencia', 'asyncapi']
cluster: 'a01'
clusterTitle: "Event-driven y contratos asíncronos"
type: pilar
order: 1
readingLevel: "Avanzado"
prerequisites: "Requiere REST, SQL, transacciones ACID y Docker Compose."
icon: 'bell'
iconHue: 25
---

> **Aviso.** Nexo Finanzas es un dominio **ficticio**. Importes, cuentas, eventos y usuarios son sintéticos. El pseudocódigo es didáctico y **no es código listo para producción**. En este artículo **no se ejecutó ningún broker, pipeline ni test**: los comandos son propuestas reproducibles, no resultados.

> **Promesa del artículo.** Al terminar vas a poder explicar por qué un `ack` no prueba que el negocio ocurrió, dónde termina exactamente la transacción cuando publicás un evento, y qué preguntas hace un Quality Engineer frente a un diagrama de mensajería que un tester de API no haría. No vas a encontrar una defensa de ningún broker.

## El bug que no vas a encontrar con tests de API

En Nexo Finanzas, `POST /transfers` responde `201 Created` y devuelve un `transferId`. Tus tests de contrato pasan. Tu test de idempotencia pasa. Tu test de autorización por objeto pasa.

Y sin embargo, el saldo del destinatario no se actualizó.

¿Por qué? Porque `POST /transfers` escribió la transferencia en su base y **publicó un evento** `TransferCreated` que otro servicio consume para actualizar la proyección de saldos. Entre esos dos hechos hay un abismo donde viven, como mínimo, estos fallos:

- El servicio escribió en la base y **murió antes de publicar**. La transferencia existe; el evento no. Nadie actualiza saldos.
- El servicio publicó y **murió antes de commitear**. El evento existe; la transferencia no. El consumidor actualiza un saldo por una transferencia fantasma.
- El broker entregó el evento **dos veces**. El consumidor sumó el importe dos veces.
- El consumidor recibió el evento, respondió `ack`, y **falló procesándolo**. El broker cree que terminó. Nadie lo reintenta.
- Llegó `TransferCompleted` **antes** que `TransferCreated`, porque viajaron por particiones distintas.

Ninguno de esos cinco fallos se detecta con más tests de la clase que ya escribís. Todos se previenen con **controles arquitectónicos**. Y todos se prueban, pero solo si sabés qué buscar.

Esta es la tesis del capítulo:

> **En un sistema asíncrono, recibir un mensaje no equivale a procesarlo correctamente.** La calidad depende de contratos evolutivos, consumidores idempotentes, observabilidad y reconciliación de resultados. No depende del broker.

## Prerrequisitos y glosario

Antes de seguir conviene tener presente:

- **HTTP, OpenAPI y contratos síncronos.** Sabés qué es un breaking change en un contrato REST.
- **Transacciones ACID y límites transaccionales.** Sabés qué garantiza un `COMMIT` y hasta dónde llega.
- **JSON Schema y versionado semántico**, al menos conceptualmente.
- **Docker Compose, logs y correlation IDs.**

Glosario mínimo, porque estas palabras se usan mal todo el tiempo:

- **Comando:** una *intención* dirigida a un destinatario específico. `RegisterTransfer`. Puede ser rechazado. Tiene un dueño que decide.
- **Evento:** un *hecho consumado*, en pasado, sin destinatario específico. `TransferCreated`. No se puede rechazar: ya ocurrió.
- **Consistencia eventual:** el sistema converge a un estado coherente, pero hay una ventana en la que dos vistas del mismo hecho difieren legítimamente.
- **`ack` (acknowledgement):** una señal de transporte que le dice al broker "no me lo mandes de nuevo". **No es** una señal de negocio.
- **Effectively-once:** procesar N entregas con **un solo efecto de negocio**. Es lo alcanzable. *Exactly-once* de punta a punta, no.
- **Idempotencia (de consumidor):** procesar el mismo evento N veces produce el mismo estado que procesarlo una.

## Comando y evento no son sinónimos, y confundirlos rompe el diseño

Esta distinción parece pedantería académica hasta que te muerde.

| | Comando | Evento |
|---|---|---|
| Tiempo verbal | Imperativo (`CreateTransfer`) | Pasado (`TransferCreated`) |
| Destinatario | Uno, conocido | N, desconocidos |
| ¿Se puede rechazar? | Sí | No: ya pasó |
| ¿Quién decide el resultado? | El receptor | Nadie; ya está decidido |
| Acoplamiento | El emisor conoce al receptor | El emisor no conoce a los consumidores |

**El error clásico:** publicar `TransferCreated` en un topic y que un consumidor lo use para *decidir* si la transferencia procede. Eso no es un evento, es un comando disfrazado. Y trae consecuencias concretas:

- El "evento" ahora tiene un consumidor obligatorio. Si ese consumidor está caído, el negocio se detiene, pero el emisor no lo sabe.
- Agregar un segundo consumidor cambia la semántica: ¿ahora dos servicios deciden?
- No podés reprocesar el histórico de eventos sin volver a ejecutar decisiones.

**Regla práctica para el review:** si borrar todos los consumidores de un mensaje cambia si el hecho ocurrió, ese mensaje es un comando. Nombralo como tal y dale un destinatario.

## Dónde termina la transacción

Esta es la pregunta central de todo el capítulo, y la que más veces se responde mal.

<figure class="diagram">
  <img src="/blog/diagrams/recibir-un-mensaje-no-es-procesarlo-1.svg" width="315" height="853" alt="Diagrama: recibir-un-mensaje-no-es-procesarlo (1)" loading="lazy" decoding="async" />
</figure>

Todo lo que está **dentro** de `TX` es atómico: o pasan las dos escrituras o ninguna. Todo lo que está **después** del `Commit` es un sistema distribuido, con sus propias fallas, y **ninguna** de esas flechas es atómica respecto de la anterior.

De acá salen dos conclusiones que ordenan el resto del capítulo:

1. **No podés escribir en la base y publicar en el broker atómicamente.** Son dos sistemas. La solución no es una transacción distribuida (cara, frágil, y casi nunca disponible): es mover la publicación **dentro** de la transacción de la base, escribiendo el evento en una tabla. Eso es el *transactional outbox*, y tiene su [propio artículo](/blog/outbox-inbox-dlq-y-replay-seguro/).
2. **El `ack` es la última flecha, y solo habla del transporte.** Que el consumidor haya confirmado no dice nada sobre si el saldo se actualizó, si la regla de riesgo corrió, o si el asiento contable quedó balanceado.

> **El anti-patrón más caro de esta lista:** usar el `ack` como prueba de resultado de negocio. Un dashboard de "0 mensajes sin ack" puede convivir perfectamente con un ledger descuadrado.

## Modelo de amenaza de una transferencia asíncrona

Un threat model no es solo para seguridad. Acá lo uso para enumerar sistemáticamente qué puede salir mal entre "el usuario apretó Transferir" y "el dinero ficticio se movió y todos los sistemas coinciden".

Recorré cada frontera y preguntá: *¿qué pasa si esto se duplica, se pierde, se reordena o se demora?*

| # | Frontera | Amenaza | Efecto de negocio | Control |
|---|---|---|---|---|
| A1 | API → DB | El commit falla tras responder `201` | El cliente cree que transfirió; no hay nada | Responder **después** del commit; idempotencia de API |
| A2 | DB → Broker | Se commitea la transferencia, no se publica el evento | Saldo nunca actualizado; **pérdida silenciosa** | Transactional outbox |
| A3 | DB → Broker | Se publica el evento, falla el commit | Saldo actualizado por una transferencia inexistente | Outbox (imposible por construcción) |
| A4 | Broker → Consumidor | Entrega duplicada (at-least-once) | **Doble crédito** | Consumidor idempotente (`eventId` único) |
| A5 | Broker → Consumidor | Reordenamiento entre particiones | `TransferCompleted` procesado antes que `TransferCreated` | Clave de partición por `transferId`; consumidor tolerante a orden |
| A6 | Consumidor | `ack` emitido antes de procesar | Pérdida sin rastro | `ack` después del efecto; o inbox |
| A7 | Consumidor | Envenenamiento: un mensaje siempre falla | Bloqueo de la partición o reintento infinito | DLQ con política y límite |
| A8 | Contrato | Se agrega un campo obligatorio | Consumidores viejos rompen en runtime | Compatibilidad + consumer impact analysis |
| A9 | Replay | Se reprocesa la DLQ sin control | Duplicación masiva de efectos | Replay idempotente **y autorizado** |
| A10 | Telemetría | El `correlationId` no cruza el broker | Imposible depurar de punta a punta | Propagación de contexto obligatoria en el contrato |

Esta tabla es el índice real del capítulo. Los artículos 2, 3 y 4 son, respectivamente, los controles de A4/A5, A2/A3/A7/A9 y A8/A10.

**Cómo usar esto en un review:** cuando alguien te muestre un diagrama de mensajería, no preguntes "¿qué broker es?". Preguntá: *"¿qué pasa si este mensaje llega dos veces?"*. La calidad de la respuesta te dice todo sobre la madurez del diseño.

## Las cuatro invariantes que el sistema debe sostener

Un control existe para proteger una invariante. Si no podés nombrar la invariante, el control es decorativo.

Para Nexo Finanzas:

1. **Una intención de transferencia produce como máximo un movimiento de dinero**, sin importar cuántas veces se reintente el request o se entregue el evento.
2. **Débitos y créditos ficticios permanecen balanceados** en todo momento observable.
3. **Todo evento publicado corresponde a un hecho commiteado**, y todo hecho commiteado termina publicado (eventualmente).
4. **Toda diferencia entre dos vistas del mismo hecho es explicable**: o es la ventana de consistencia eventual, o es un incidente.

La cuarta es la más subestimada. Un sistema event-driven **siempre** tendrá momentos en que la API dice una cosa y la proyección otra. Eso no es un bug. El bug es no poder distinguir esa ventana normal de una inconsistencia real. Ahí es donde entra la [reconciliación](/blog/coleccion/a05/).

## Lo que el broker no resuelve

Una parte importante del trabajo senior acá es defender al equipo de las promesas de las hojas de producto.

- **"Nuestro broker garantiza exactly-once."** Con alcance y configuración específicos, algunos brokers ofrecen semánticas transaccionales *dentro de su propio ecosistema* (leer de un topic, escribir en otro topic, commitear offset, todo atómico). Eso **no** se extiende a tu base de datos, ni a un `POST` a un tercero, ni a un mail. En el momento en que el efecto sale del broker, volvés a at-least-once, y necesitás idempotencia. La frase honesta es: *"efectivamente una vez, para este conjunto de operaciones, bajo esta configuración"*.
- **"El orden está garantizado."** Dentro de una partición, típicamente sí. Entre particiones, no. Y elegir la clave de partición es una decisión de **negocio**, no de infraestructura: particionar por `transferId` te da orden por transferencia y ninguna garantía entre transferencias de la misma cuenta.
- **"Los reintentos lo resuelven."** Un reintento sin idempotencia **duplica** el efecto. Un reintento infinito convierte un fallo transitorio en una caída sostenida.

No hay tecnología que te exima de diseñar la idempotencia. Elegí el broker por operabilidad, ecosistema y costo, no por una garantía cuyo alcance no podés citar.

## Qué pruebas aparecen que antes no existían

Con REST, tu matriz de pruebas era: happy path, validaciones, autorización, errores. Con eventos, se agregan clases enteras:

- **Duplicado.** Entregar el mismo evento dos veces. Efecto: uno.
- **Pérdida de `ack`.** El consumidor procesa, muere antes de confirmar, el broker reentrega. Efecto: uno.
- **Fuera de orden.** Procesar `TransferCompleted` antes que `TransferCreated`.
- **Consumidor caído.** El productor sigue publicando; al volver, el consumidor drena sin duplicar.
- **Schema incompatible.** Un consumidor viejo recibe un evento nuevo.
- **Replay.** Reprocesar N eventos de la DLQ sin duplicar efectos.

Cada una tiene un artículo que la desarrolla. Y todas comparten una regla de oro:

> **Nunca uses `sleep` para sincronizar una prueba asíncrona.** Un `Thread.sleep(2000)` es una apuesta, no una aserción. Esperá por una **condición observable** (el registro apareció en la proyección; la métrica se incrementó; el `eventId` está en el inbox) con un timeout y un mensaje de error que diga qué se esperaba. El `sleep` es la causa número uno de suites asíncronas flaky, y la razón por la que después nadie confía en ellas.

## Qué publicar en GitHub

Estructura mínima de `nexo-event-platform` para que este pilar sea revisable:

```text
asyncapi.yaml
docs/adr/ADR-001-event-delivery-semantics.md
docs/adr/ADR-002-outbox-pattern.md
docs/quality/event-test-strategy.md
docs/quality/threat-model-transferencia-asincrona.md
docs/runbooks/replay-dead-letter-events.md
tests/contracts/
tests/integration/
```

El ADR-001 tiene una obligación especial: **declarar qué garantía ofrece el broker elegido, con qué configuración, y por qué el demo local no prueba escalabilidad productiva.** Un ADR que dice "elegimos X porque es el estándar de la industria" no es un ADR.

## Anti-patrones

- **Confundir evento con comando.** *Causa:* nombrar todo en pasado para que "suene event-driven". *Consecuencia:* consumidores obligatorios y acoplamiento oculto. *Alternativa:* la prueba de borrado — si sacar los consumidores cambia si el hecho ocurrió, es un comando.
- **Confiar en el `ack` como prueba de resultado de negocio.** *Consecuencia:* métricas verdes con ledger descuadrado. *Alternativa:* medir el efecto (registro en la proyección), no el transporte.
- **Retries infinitos.** *Causa:* miedo a perder un mensaje. *Consecuencia:* un mensaje envenenado tumba la partición. *Alternativa:* backoff con límite y DLQ.
- **Cambiar schemas sin consumer impact analysis.** *Consecuencia:* rompés en runtime a un consumidor que no sabías que existía. *Alternativa:* registro de consumidores y compatibilidad declarada.
- **Reprocesar la DLQ sin idempotencia ni autorización.** *Consecuencia:* duplicación masiva, y esta vez a propósito. *Alternativa:* replay con las mismas garantías que la entrega normal, y con alguien que apriete el botón.
- **`sleep` para sincronizar pruebas asíncronas.** *Consecuencia:* flakiness que erosiona la confianza en toda la suite. *Alternativa:* esperar por condición observable.

## Qué aprendimos / próximos pasos

- La transacción termina en el `COMMIT` de la base. Todo lo demás es un sistema distribuido.
- El `ack` es transporte, no negocio.
- Comando y evento son cosas distintas; el nombre en pasado no alcanza.
- La pregunta que ordena un review de mensajería es *"¿qué pasa si llega dos veces?"*.

**Siguiente:** [Semánticas de entrega y consumidores idempotentes](/blog/semanticas-de-entrega-y-consumidores-idempotentes/), donde explico por qué los duplicados no son un bug del broker sino una consecuencia inevitable, y cómo hacer que dejen de importar.

## Checklist final

- [ ] Cada mensaje del sistema está clasificado como comando o evento, y el nombre lo refleja.
- [ ] Existe un diagrama que marca explícitamente la frontera transaccional.
- [ ] Ninguna métrica de salud usa `ack` como proxy de éxito de negocio.
- [ ] El threat model enumera duplicación, pérdida, reordenamiento y demora en **cada** frontera.
- [ ] Las cuatro invariantes están escritas y cada control apunta a una.
- [ ] El ADR del broker declara el **alcance exacto** de las garantías que cita.
- [ ] Ninguna prueba asíncrona usa `sleep`.

---

## Fuentes (consultadas 2026-07-10)

- [AsyncAPI Documentation](https://www.asyncapi.com/docs) — línea estable 3.0.0; ver [verificación de fuentes](/blog/verificacion-de-fuentes-serie-avanzada/).
- [OpenTelemetry Documentation](https://opentelemetry.io/docs/) — propagación de contexto; las semantic conventions de *messaging* **no son estables** al 2026-07-10.
- [RFC 9110 — HTTP Semantics, métodos idempotentes](https://www.rfc-editor.org/rfc/rfc9110#name-idempotent-methods) — para la distinción entre idempotencia de método y de aplicación.
- Documentación oficial del broker que elijas. Este artículo deliberadamente **no** recomienda uno.
