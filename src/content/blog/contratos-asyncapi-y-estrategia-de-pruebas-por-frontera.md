---
title: "Contratos AsyncAPI y estrategia de pruebas por frontera"
description: "AsyncAPI 3.0 para TransferCreated, compatibilidad de schema, consumer-driven contract testing asíncrono con Pact V4 y sus límites, matriz de pruebas por frontera, correlación y evidencia en CI."
pubDate: 2026-07-10
tags: ['asyncapi', 'contract-testing', 'pact', 'schema-evolution', 'opentelemetry', 'sdet']
cluster: 'a01'
clusterTitle: "Event-driven y contratos asíncronos"
type: satelite
order: 4
readingLevel: "Avanzado"
prerequisites: "Requiere JSON Schema, versionado semántico y CI."
icon: 'bell'
iconHue: 25
---

> **Aviso.** Nexo Finanzas es **ficticio**. Los fragmentos de contrato y código son didácticos y **no son código listo para producción**. No se ejecutó ningún test, broker ni pipeline: los comandos son propuestas reproducibles.

> **Promesa del artículo.** Al terminar vas a poder escribir un contrato de evento que sobreviva a su propia evolución, decidir qué prueba corresponde a cada frontera del sistema (y cuál es un desperdicio), y explicar con precisión qué **no** te dice un message pact.

> Cierra el capítulo. Asume el pilar y los dos satélites anteriores.

## El consumidor que no sabías que existía

En REST, cuando cambiás un contrato, sabés a quién le pegás: hay una lista de clientes, un `User-Agent`, un log de accesos.

En eventos, no. Publicás `TransferCreated` en un topic. Lo consumen la proyección de saldos, el motor de riesgo, el pipeline de analítica y —esto es lo que te muerde— **un consumidor que alguien creó el trimestre pasado y no documentó**. Agregás un campo obligatorio, y el consumidor no documentado se cae en runtime, a las 3 de la mañana, sin que tu suite de tests haya visto nada.

El desacoplamiento que hace atractivo al event-driven es exactamente lo que hace peligroso al cambio de contrato. El contrato es lo **único** que queda como acuerdo explícito.

## Anatomía de un evento bien diseñado

Antes del formato, el contenido. Un evento de Nexo Finanzas necesita cuatro clases de campo:

| Clase | Campos | Por qué |
|---|---|---|
| **Identidad** | `eventId` | Clave de deduplicación del inbox. Único, inmutable, generado por el productor |
| **Correlación** | `correlationId`, `traceparent` | Para seguir el hecho de punta a punta sin filtrar PII |
| **Tiempo** | `occurredAt` | Cuándo ocurrió **el hecho**, no cuándo se publicó |
| **Versión** | `schemaVersion` | Para que el consumidor sepa qué está leyendo |

Y un payload que trate el dinero con respeto:

```yaml
amount:
  minor: 10000          # entero. 10000 centavos = 100.00
  currency: "USD"       # ISO 4217
  scale: 2              # decimales implicitos
```

Nunca un `float`. Nunca `"100.00"` como string sin escala. Nunca un `amount` sin `currency`. La razón está desarrollada en [Cómo representar dinero sin perder centavos](/blog/representar-dinero-decimales-unidades-minimas/); acá lo damos por sabido, pero el contrato es donde la decisión se **congela**.

Y una regla de privacidad que el contrato debe hacer cumplir por construcción: **`correlationId` sí, `userId` no.** Un identificador de correlación es un opaco sin significado fuera del sistema. Un identificador de usuario o un número de documento en un evento que se persiste en un topic durante días es una decisión de retención de datos personales que probablemente nadie tomó conscientemente. Ver el [capítulo de privacidad](/blog/coleccion/a04/).

## El contrato en AsyncAPI

AsyncAPI es a los eventos lo que OpenAPI a REST: una descripción legible por máquinas del canal, el mensaje y su schema. La línea estable es **3.0.0**; el sitio oficial documenta además 3.1.0 (ver [verificación de fuentes](/blog/verificacion-de-fuentes-serie-avanzada/)). Fijá una versión en el archivo y revisala antes de congelar el contrato.

```yaml
# asyncapi.yaml — fragmento ilustrativo. Datos sinteticos.
asyncapi: 3.0.0

info:
  title: Nexo Finanzas — Eventos de transferencias
  version: 1.0.0
  description: |
    Dominio FICTICIO. Eventos publicados por nexo-transfer-api.
    Semantica de entrega: at-least-once. Los consumidores DEBEN ser idempotentes
    sobre `eventId`. Ver ADR-001.

channels:
  transferEvents:
    address: nexo.transfers.v1
    messages:
      transferCreated:
        $ref: '#/components/messages/TransferCreated'

operations:
  receiveTransferCreated:
    action: receive
    channel:
      $ref: '#/channels/transferEvents'

components:
  messages:
    TransferCreated:
      name: TransferCreated
      title: Una transferencia fue creada
      contentType: application/json
      headers:
        type: object
        properties:
          traceparent:
            type: string
            description: Contexto de traza W3C. Ver W3C Trace Context.
      payload:
        $ref: '#/components/schemas/TransferCreatedPayload'

  schemas:
    TransferCreatedPayload:
      type: object
      additionalProperties: false
      required: [eventId, schemaVersion, occurredAt, correlationId, transferId, amount, status]
      properties:
        eventId:
          type: string
          format: uuid
          description: |
            Identificador unico e inmutable de ESTE evento.
            Clave de deduplicacion del consumidor (patron inbox).
        schemaVersion:
          type: string
          pattern: '^\d+\.\d+\.\d+$'
          examples: ['1.0.0']
        occurredAt:
          type: string
          format: date-time
          description: |
            Instante en que ocurrio el HECHO, en UTC con offset explicito.
            NO es el instante de publicacion.
        correlationId:
          type: string
          format: uuid
          description: |
            Opaco. Correlaciona el hecho a traves de servicios.
            PROHIBIDO derivarlo de datos personales.
        transferId:
          type: string
          description: Identificador de la transferencia. Clave de particion.
        amount:
          type: object
          additionalProperties: false
          required: [minor, currency, scale]
          properties:
            minor:
              type: integer
              description: Importe en unidades minimas. Entero. Nunca float.
            currency:
              type: string
              pattern: '^[A-Z]{3}$'
              description: Codigo ISO 4217.
            scale:
              type: integer
              description: Decimales implicitos. Para USD, 2.
        status:
          type: string
          enum: [CREATED]
```

Tres decisiones cargadas de intención:

- **`additionalProperties: false`** en el nivel raíz. Convierte "el productor agregó un campo" en un fallo de validación **del contrato**, no en un silencio. Es más estricto que lo que muchos equipos toleran, y por eso hay que pensarlo: si querés permitir campos aditivos sin coordinación, ponelo en `true` y **decilo en el ADR**. Lo que no podés es no haber decidido.
- **El `description` de `eventId` explica su *rol*, no su tipo.** Un contrato que dice "identificador único" no le enseña nada a nadie. Uno que dice "clave de deduplicación del consumidor" evita que alguien lo regenere en un reintento.
- **`occurredAt` documenta explícitamente que no es el instante de publicación.** Esa frase previene una clase entera de bugs de ventana temporal aguas abajo.

## Schema evolution: qué es compatible y qué no

La compatibilidad se define **en dirección**, y confundir las direcciones es el error más común.

| Tipo | Significado | Cambios permitidos |
|---|---|---|
| **Backward** | Un consumidor **nuevo** lee datos **viejos** | Agregar campo opcional; eliminar campo opcional |
| **Forward** | Un consumidor **viejo** lee datos **nuevos** | Agregar campo opcional; eliminar campo **requerido** |
| **Full** | Ambas | Solo agregar/quitar campos opcionales con default |

En un sistema de eventos con consumidores desconocidos, lo que necesitás casi siempre es **forward compatibility**: el productor va a publicar algo nuevo antes de que todos los consumidores se actualicen. Esa es la asimetría fundamental.

**Cambios seguros (aditivos):**
- Agregar un campo **opcional** con default.
- Agregar un valor a un `enum` **que los consumidores tratan con un caso por defecto**. (Si el consumidor hace `switch` sin `default`, agregar un valor **es** un breaking change. El contrato no te salva de un consumidor mal escrito.)

**Cambios que rompen, sin excepción:**
- Agregar un campo requerido.
- Eliminar o renombrar un campo requerido.
- Cambiar el tipo de un campo (`integer` → `string`).
- Cambiar el significado de un campo sin cambiar su nombre. **Este es el peor**, porque ninguna herramienta lo detecta. Si `amount.minor` pasaba de significar "importe bruto" a "importe neto", todos los schemas validan y todos los consumidores están mal.

### El proceso de cambio

<figure class="diagram">
  <img src="/blog/diagrams/contratos-asyncapi-y-estrategia-de-pruebas-por-frontera-1.svg" width="1339" height="207" alt="Diagrama: contratos-asyncapi-y-estrategia-de-pruebas-por-frontera (1)" loading="lazy" decoding="async" />
</figure>

La caja `Migration plan` es donde vive el trabajo real. Un cambio incompatible en eventos **no se despliega**: se migra, y la única forma segura es la **expansión y contracción**:

1. **Expandir.** Publicar el evento nuevo en un canal nuevo (`nexo.transfers.v2`) **mientras** seguís publicando el viejo. Los dos conviven.
2. **Migrar.** Cada consumidor pasa a v2 a su ritmo. Nadie coordina un big bang.
3. **Observar.** Medir consumo del canal v1. Cuando llega a cero y se mantiene, el canal está muerto.
4. **Contraer.** Recién ahí, dejar de publicar v1.

El paso 3 es el que la gente saltea, y es el único que te dice si podés hacer el 4. **Sin métrica de consumo por canal, la contracción es una apuesta.**

### Consumer impact analysis

Antes de tocar un schema, necesitás saber quién lee. Mínimo viable:

- Un **registro de consumidores** en el repositorio del contrato: nombre, equipo, canal, versión de schema, contacto. Un archivo Markdown alcanza. Que exista importa más que dónde vive.
- Una **métrica de consumo por canal y versión**. Es la única fuente de verdad; el registro miente por omisión.

Un ADR que agrega un campo requerido sin nombrar a los consumidores afectados no está terminado.

## Estrategia de pruebas por frontera

Cada frontera tiene una prueba que le corresponde, y probar la frontera equivocada es la forma más común de suite lenta e inútil.

<figure class="diagram">
  <img src="/blog/diagrams/contratos-asyncapi-y-estrategia-de-pruebas-por-frontera-2.svg" width="264" height="680" alt="Diagrama: contratos-asyncapi-y-estrategia-de-pruebas-por-frontera (2)" loading="lazy" decoding="async" />
</figure>

| Frontera | Qué prueba | Qué **no** prueba | Coste |
|---|---|---|---|
| **Unit** | Modelo de dinero, máquina de estados, clasificación de errores | Nada de mensajería | Muy bajo |
| **Component** | Que `append` al outbox ocurre en la misma transacción; que un rollback no deja evento | Que el evento llegue | Bajo |
| **Contract (productor)** | Que el evento emitido valida contra el schema publicado | Que un consumidor lo entienda | Bajo |
| **Contract (consumidor)** | Que el handler procesa un mensaje conforme al contrato | **El broker, la serialización en el cable, el orden** | Bajo |
| **Integration** | DB + broker real + consumidor: duplicados, `ack` perdido, DLQ | Escala, latencia bajo carga | Medio |
| **Journey** | Un hecho de negocio observable de punta a punta | Casos de fallo | Medio |
| **Reconciliation** | Invariantes cruzadas entre transferencia, ledger, outbox y proyección | Causa raíz | Bajo, muy alto valor |

### El límite del message pact

Pact **V4** soporta *message pacts* para sistemas asíncronos ([docs.pact.io](https://docs.pact.io/)). Es útil y está bien mantenido. Pero hay que ser preciso sobre qué verifica:

> Un message pact verifica que **el handler del consumidor** puede procesar un mensaje que cumple el contrato, y que **el productor** puede emitir uno que lo cumple. Pact ocupa el lugar del intermediario.

Lo que **no** verifica, y hay que probar en integración:

- Que el broker esté configurado con la retención, particiones y política de DLQ que asumís.
- Que el serializador real (Jackson con su configuración real) produzca el mismo JSON que el mock.
- Que el orden de llegada sea el que tu consumidor supone.
- Que el consumidor sea **idempotente**. El pact entrega el mensaje una vez.

Un equipo que reemplaza pruebas de integración por message pacts porque "son más rápidos" se queda sin cobertura exactamente en las fronteras donde ocurren los bugs de este capítulo. Los pacts van **además**, no en lugar.

### La matriz de casos, otra vez

Consolidando las tres matrices del capítulo, lo mínimo que un `nexo-event-platform` serio debe demostrar:

| # | Caso | Frontera |
|---|---|---|
| 1 | Duplicado exacto → un efecto | Integration |
| 2 | Pérdida de `ack` → un efecto | Integration |
| 3 | Evento fuera de orden → sin excepción no controlada | Integration |
| 4 | Consumidor caído → drena sin duplicar | Integration |
| 5 | Rollback → cero eventos publicados | Component |
| 6 | Schema incompatible → el consumidor viejo falla de forma **detectable** | Contract |
| 7 | Replay de DLQ → efecto sin cambios | Integration |
| 8 | `correlationId` presente en toda la cadena | Journey |

El caso 6 tiene una sutileza: no querés que el consumidor viejo "funcione mal en silencio". Querés que falle ruidosamente y vaya a la DLQ. Un consumidor que ignora campos desconocidos y sigue puede estar procesando semántica que no entiende.

## Correlación y trazabilidad a través del broker

Un `traceId` que muere en el borde del broker convierte la depuración en arqueología.

La propagación se hace con **W3C Trace Context** (`traceparent`) transportado en los **headers del mensaje**, no en el payload. El productor inyecta el contexto al escribir en el outbox —importante: en ese momento, no en el momento de publicar, porque el hecho ocurrió ahí— y el consumidor lo extrae antes de abrir su transacción.

**Advertencia de estado, verificada al 2026-07-10:** las *semantic conventions* de **messaging** de OpenTelemetry siguen en estado `Development`, **no estables** (semconv 1.43.0). La transición usa la variable `OTEL_SEMCONV_STABILITY_OPT_IN` con valores `messaging` o `messaging/dup`. En la práctica esto significa:

- Podés usar los atributos `messaging.*`, pero **no los trates como una API estable**. Pueden cambiar de nombre.
- Si tenés dashboards o alertas construidos sobre ellos, `messaging/dup` te permite emitir ambos conjuntos durante la migración.
- **No** escribas en un artículo o un README que estás "siguiendo las convenciones estables de OpenTelemetry para messaging". Al día de hoy no existen.

La propagación de `traceparent` en sí, en cambio, es una recomendación del W3C independiente y estable.

## Evidencia en CI/CD

Un pipeline que corre tests no es evidencia. Evidencia es un artefacto que alguien más puede inspeccionar meses después.

Para este capítulo, el pipeline debería producir:

1. **Validación del contrato.** El `asyncapi.yaml` valida contra la especificación. Falla el build si no.
2. **Diff de compatibilidad.** Comparar el schema del PR contra el de la rama principal y **fallar si el cambio es incompatible sin un plan de migración enlazado**. Este es el gate que evita el incidente de las 3 de la mañana.
3. **Pacts publicados y verificados**, con el estado de cada consumidor conocido.
4. **Resultados de integración** con la matriz de 8 casos, cada uno nombrado por el riesgo que cubre (`duplicateDelivery_producesSingleEffect`, no `test7`).
5. **El contrato como artefacto versionado**, adjunto al release. Si el `asyncapi.yaml` solo vive en `main`, no podés saber qué contrato estaba vigente cuando ocurrió un incidente.

Sobre el punto 2: el gate de compatibilidad es de los pocos quality gates que se justifican como **bloqueantes**. La razón es asimétrica: el costo de un falso positivo (te obliga a escribir un plan de migración que igual necesitabas) es mucho menor que el costo de un falso negativo (rompés consumidores en runtime).

## Anti-patrones

- **Cambiar el significado de un campo sin cambiar su nombre.** *Consecuencia:* todo valida, todo está mal, nada lo detecta. *Alternativa:* campo nuevo, deprecación del viejo, contracción medida.
- **Desplegar un cambio incompatible en vez de migrarlo.** *Alternativa:* expandir, migrar, observar, contraer. Sin el "observar", no hay "contraer".
- **Contraer sin métrica de consumo.** *Consecuencia:* rompés al consumidor que no estaba en el registro. *Alternativa:* la métrica manda; el registro es un mapa, no el territorio.
- **Reemplazar integración por message pacts.** *Causa:* son más rápidos. *Consecuencia:* cero cobertura de duplicados, orden y broker. *Alternativa:* pacts **además** de integración.
- **`userId` o documento en el payload de un evento.** *Consecuencia:* datos personales retenidos en un topic durante días, sin política. *Alternativa:* `correlationId` opaco.
- **Afirmar convenciones estables de messaging en OpenTelemetry.** *Consecuencia:* una afirmación falsa en tu documentación. *Alternativa:* citar el estado real y `OTEL_SEMCONV_STABILITY_OPT_IN`.
- **`occurredAt` = `now()` en el publisher.** *Consecuencia:* el tiempo del hecho se pierde y toda ventana temporal aguas abajo es incorrecta. *Alternativa:* capturarlo en la transacción de negocio.

## Qué publicar en GitHub

```text
asyncapi.yaml                                  # versionado, con additionalProperties decidido
docs/adr/ADR-004-compatibilidad-de-schemas.md  # qué dirección de compatibilidad y por qué
docs/quality/event-test-strategy.md            # la tabla de fronteras
docs/quality/consumer-registry.md              # quién lee qué canal y qué versión
tests/contracts/                               # pacts de productor y consumidor
tests/integration/                             # los 8 casos, nombrados por riesgo
.gitlab-ci.yml                                 # gate de compatibilidad bloqueante
```

## Qué aprendimos / próximos pasos

- El contrato es el único acuerdo explícito que queda cuando el desacoplamiento borra la lista de clientes.
- La compatibilidad que necesitás en eventos es **forward**, porque el productor cambia primero.
- Un cambio incompatible se **migra** (expandir → migrar → observar → contraer), no se despliega.
- Un message pact prueba el handler. El broker, el orden y la idempotencia se prueban en integración.
- Las semantic conventions de messaging de OpenTelemetry **no son estables al 2026-07-10**. Decilo así.

**Cierre del capítulo.** El siguiente paso natural es la [reconciliación](/blog/coleccion/a05/): lo que detecta las inconsistencias que estos cuatro artículos no lograron prevenir. Y el [capítulo 13](/blog/coleccion/a13/) contiene un RFC completo para incorporar el outbox a `nexo-transfer-api`, escrito **antes** de implementarlo.

## Checklist final

- [ ] El evento lleva `eventId`, `correlationId`, `occurredAt` y `schemaVersion`.
- [ ] El dinero viaja como entero en unidades mínimas, con `currency` y `scale`.
- [ ] No hay identificadores personales en el payload.
- [ ] `additionalProperties` fue **decidido** y está en un ADR.
- [ ] La dirección de compatibilidad está declarada.
- [ ] Existe un registro de consumidores **y** una métrica de consumo por canal/versión.
- [ ] El pipeline falla ante un cambio incompatible sin plan de migración.
- [ ] Los message pacts están **además** de las pruebas de integración.
- [ ] `traceparent` viaja en headers, se inyecta al escribir el outbox y se extrae antes de la transacción del consumidor.
- [ ] Ninguna documentación afirma convenciones estables de messaging en OpenTelemetry.

---

## Fuentes (consultadas 2026-07-10)

- [AsyncAPI Documentation](https://www.asyncapi.com/docs) — línea estable 3.0.0; el sitio documenta también 3.1.0.
- [Pact Documentation](https://docs.pact.io/) y [Pact V4 y plugins](https://pactflow.io/blog/pact-v4-and-plugins/) — message pacts y su alcance.
- [OpenTelemetry semantic conventions 1.43.0](https://opentelemetry.io/docs/specs/semconv/) — messaging en estado `Development`.
- [OpenTelemetry — messaging spans](https://opentelemetry.io/docs/specs/semconv/messaging/messaging-spans/) — `OTEL_SEMCONV_STABILITY_OPT_IN`.
- [W3C Trace Context](https://www.w3.org/TR/trace-context/) — formato de `traceparent`.
- [Verificación de fuentes de la serie](/blog/verificacion-de-fuentes-serie-avanzada/)
