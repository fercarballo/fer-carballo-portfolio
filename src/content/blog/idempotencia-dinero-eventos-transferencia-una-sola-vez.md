---
title: "Idempotencia, dinero y eventos: cómo hacer que una transferencia ocurra una sola vez"
description: "Diseñá una transferencia segura de reintentar: Idempotency-Key, códigos 409/422, dinero como decimal, estados y deduplicación de eventos con eventId."
pubDate: 2026-07-09
tags: ["idempotencia", "apis", "eventos", "consistencia-eventual", "quality-engineering"]
cluster: "02"
clusterTitle: "API contract testing y sistemas distribuidos"
type: "satelite"
order: 3
icon: "braces"
iconHue: 28
readingLevel: "Avanzado"
---
**Subtítulo:** La semántica que un contrato debe expresar para que un reintento no cobre dos veces.

> *Nexo Finanzas, sus cuentas e IDs son ficticios. Los fragmentos son ilustrativos; validá su sintaxis contra la versión vigente de cada especificación.*

## El problema

Un cliente de Nexo toca "Transferir". La red se cae *después* de que el servidor creó la transferencia pero *antes* de que llegara la respuesta. La app reintenta. Sin diseño, se crean **dos** transferencias por $100. Este es el escenario que define una API de dinero: **no controlás la red, controlás la semántica**. Este artículo desarma cómo lograr que "la misma transferencia" ocurra exactamente una vez —en el request síncrono y en el evento que dispara—.

Asumo el marco del pilar (*Contratos de API en una plataforma de transferencias*). Aquí bajamos a la semántica fina.

## Idempotencia: por qué POST necesita ayuda

`POST` **no es idempotente** según [RFC 9110 §9.2.2](https://www.rfc-editor.org/rfc/rfc9110#section-9.2.2): repetirlo puede crear recursos duplicados. La convención emergente es una **clave de idempotencia** que el cliente genera y envía; el servidor la usa para reconocer reintentos.

**Estado del "estándar" (verificado 2026-07-09):** `Idempotency-Key` es un **Internet-Draft**, no un RFC — `draft-ietf-httpapi-idempotency-key-header-07` (15-oct-2025, Standards Track) ([datatracker](https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/)). Es una convergencia de la industria, **puede cambiar**; usar el header hoy es adoptar una práctica emergente bien fundada, no un estándar cerrado.

### Ejemplo A — fragmento OpenAPI (ilustrativo, desarmado)

```yaml
openapi: 3.1.0
paths:
  /v1/transfers:
    post:
      operationId: createTransfer
      parameters:
        - name: Idempotency-Key
          in: header
          required: true
          schema: { type: string, minLength: 16 }
        - name: X-Correlation-Id
          in: header
          required: false
          schema: { type: string }
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [sourceAccountId, destinationAccountId, amount, currency]
              properties:
                sourceAccountId: { type: string }
                destinationAccountId: { type: string }
                amount: { type: string, pattern: '^[0-9]+\.[0-9]{2}$' }
                currency: { type: string, pattern: '^[A-Z]{3}$' }
      responses:
        '201': { description: Transfer created or idempotent replay }
        '409': { description: Same key reused while original is still processing }
        '422': { description: Same key reused with a different payload, or business rule rejected }
```

**Bloque por bloque:**
- `Idempotency-Key required, minLength: 16`: obliga una clave suficientemente única. El contrato **no** dice cuánto vive la clave — falta la política de expiración (ver abajo).
- `amount: string, pattern ^[0-9]+\.[0-9]{2}$`: representa dinero como **string decimal con dos posiciones**. Es didáctico y *parcial*: no impone la escala de decimales correcta por moneda (JPY no usa 2), ni reglas contables. **No sustituye** una regla de negocio de límites o saldos.
- `currency: ^[A-Z]{3}$`: forma de un código ISO 4217, **no** valida que la moneda exista o esté habilitada.

> **Nota de edición 3.1.0 → 3.2.0:** la edición vigente de OpenAPI es **3.2.0** (2025). El fragmento usa 3.1.x por amplitud de tooling y su alineación con JSON Schema 2020-12; verificá tu edición en [spec.openapis.org](https://spec.openapis.org/oas/latest.html).

### Corrección de semántica de status codes (hecho citado)

El prompt original mapeaba `409` = "clave reusada con distinto payload" y `422` = "regla de negocio". **El draft-07 recomienda lo inverso:**

- **Misma clave + payload distinto → `422` Unprocessable Content** ("*the resource SHOULD reply with a HTTP 422 status code*"). En RFC 9110, 422 significa contenido semánticamente inválido ([§15.5.21](https://www.rfc-editor.org/rfc/rfc9110#section-15.5.21)).
- **Reintento mientras la original todavía procesa → `409` Conflict** ("*retried before the original request completed… SHOULD respond with a resource conflict*"). ([draft-07](https://datatracker.ietf.org/doc/html/draft-ietf-httpapi-idempotency-key-header-07))

Por eso el ejemplo de arriba ya usa el mapeo del draft. **Lección de diseño:** el significado de un código es *parte del contrato de comportamiento*; elegilo alineado a una fuente citable y sé coherente con tu documentación de producto.

### Qué le falta al fragmento (puntos ciegos)

- **Expiración/fingerprint de la clave.** El draft dice que el recurso "MAY require time-based keys" y "SHOULD define such expiration policy". Sin ella, no sabés cuánto recordás una clave.
- **Idempotent replay.** `201` cubre "creada" y "reproducción idempotente": el contrato debe aclarar que un replay devuelve **la misma** representación, no una nueva transferencia.
- **Concurrencia real.** El esquema no prueba dos requests simultáneos con la misma clave; eso se valida en **integración** (abajo).

## Dinero: por qué `float` es un anti-patrón didáctico

Representar dinero como `float` (binario IEEE-754) introduce errores de redondeo: `0.1 + 0.2 ≠ 0.3`. En una transferencia eso es inaceptable. **Alternativas** (decisión de diseño, con trade-offs):

- **String decimal** (`"100.00"`) en el contrato + tipo decimal exacto en el backend (p. ej. `BigDecimal`/`NUMERIC`). Ventaja: sin pérdida; explícito. Costo: parsing y validación de escala por moneda.
- **Entero de unidad mínima** (centavos: `10000`). Ventaja: aritmética entera exacta. Costo: hay que conocer los decimales de cada moneda (ISO 4217) y documentarlo.

**Ambos exigen moneda explícita.** El `pattern` de dos decimales del ejemplo es *ilustrativo*: monedas sin decimales o con tres lo romperían. **Anti-patrón:** usar `float` en un ejemplo que pretende enseñar precisión financiera.

## Estados: una transferencia no es un booleano

Un contrato de comportamiento debe fijar la **máquina de estados** y qué transiciones son válidas:

<figure class="diagram">
  <img src="/blog/diagrams/idempotencia-dinero-eventos-transferencia-una-sola-vez-1.svg" width="351" height="271" alt="Diagrama: idempotencia-dinero-eventos-transferencia-una-sola-vez (1)" loading="lazy" decoding="async" />
</figure>

`REJECTED` (regla de negocio: p. ej. saldo insuficiente → típicamente `422`) es distinto de `FAILED` (error operacional). Campos como `transferId` y `createdAt` son **inmutables**; `status` es la parte que evoluciona. El contrato debe declarar qué transiciones **no** ocurren (no se vuelve de `SETTLED` a `PENDING`).

## Eventos: el mismo problema, en asíncrono

Cuando la transferencia dispara un evento, la deduplicación reaparece — ahora en el consumidor.

### Ejemplo C — contrato de evento (AsyncAPI, ilustrativo)

```yaml
asyncapi: 3.0.0
channels:
  transfer.created:
    messages:
      transferCreated:
        payload:
          type: object
          required: [eventId, transferId, occurredAt, status]
          properties:
            eventId: { type: string }
            transferId: { type: string }
            occurredAt: { type: string, format: date-time }
            status: { type: string, enum: [PENDING] }
```

> Edición vigente de AsyncAPI: **3.1.0** (31-ene-2026), sin cambios rompientes sobre 3.0.0 ([asyncapi.com](https://www.asyncapi.com/docs/reference/specification/latest)). El ejemplo 3.0.0 sigue siendo válido.

**El esquema NO define la garantía de entrega.** *At-least-once* vs. *exactly-once* depende de la **plataforma** (Kafka, AMQP) y del diseño, no del contrato de mensaje. En la práctica, la mayoría entrega **at-least-once**: el consumidor **debe** deduplicar.

### Pseudocódigo de consumidor con deduplicación (ilustrativo)

```text
funcion onTransferCreated(evento):
    si store.existe(evento.eventId):        # ya procesado -> replay
        return ACK                          # idempotente: no re-ejecuta efecto
    con transaccion:
        aplicarEfecto(evento)               # p. ej. registrar en reconciliation
        store.guardar(evento.eventId)       # persistir DENTRO de la misma transaccion
    return ACK
```

**Bloque por bloque:** persistir `eventId` **dentro de la misma transacción** que el efecto evita la ventana donde el efecto se aplica pero la marca no (o viceversa). **El esquema valida la forma; la deduplicación efectiva se prueba en integración**, no con un JSON Schema.

## Verificación: qué capa prueba qué (evidencia)

| Propiedad | Cómo se verifica | Qué NO prueba esa capa |
|---|---|---|
| Forma del request/evento | Validación de esquema (OpenAPI/AsyncAPI) | Que el efecto ocurra una sola vez |
| Replay idempotente (misma clave, mismo body → misma respuesta) | Prueba de contrato de comportamiento con estado controlado | Concurrencia real |
| Dos requests simultáneos, misma clave | **Integración** con concurrencia | UX del reintento |
| Dedup de evento duplicado | **Integración**: publicar `eventId` dos veces, verificar un solo efecto | Escala productiva |

> Evidencia reproducible (plantilla, sin resultado inventado):
> ```bash
> # Enviar el mismo evento dos veces y verificar un único efecto en el consumidor sintético
> ./scripts/publish-event.sh --file fixtures/transfer.created.synthetic.json --times 2
> ./scripts/assert-single-effect.sh --transfer-id trf-synthetic-001
> ```
> Conservá: versión de contrato, commit, entorno, logs **sanitizados** y resultado.

## Anti-patrones

| Anti-patrón | Síntoma | Raíz | Impacto | Alternativa |
|---|---|---|---|---|
| **`float` para dinero** | Descuadres de centavos | Confiar en binario IEEE-754 | Pérdida contable | Decimal exacto / entero de unidad mínima + moneda explícita |
| **Reintentar sin idempotencia/dedup ni límite** | Transferencias/efectos duplicados | Asumir "exactly-once" del transporte | Doble cobro | `Idempotency-Key`, `eventId`, límite de reintentos |
| **PII/tokens/cuentas reales en fixtures/logs** | Datos sensibles en el repo | Copiar payloads de prod | Fuga y riesgo de cumplimiento | Datos **sintéticos**; logs sanitizados |

> **Nota de cumplimiento (no es asesoramiento legal):** manejar dinero y datos de cuentas puede caer bajo marcos como PCI DSS o regulación local (p. ej. BCRA en Argentina) y protección de datos (GDPR en la UE). La versión, jurisdicción y aplicabilidad **deben confirmarse con las fuentes oficiales vigentes y con un especialista**. Este artículo usa sólo datos ficticios.

## Qué aprendimos / próximos pasos

- No controlás la red; controlás la **semántica**: clave de idempotencia, replay definido, dedup por `eventId`.
- El **esquema valida forma; el efecto único se prueba en integración**.
- Dinero = decimal exacto + moneda explícita. `float` no.

**Enlaces internos:** el marco general en el **pilar**; cómo estos contratos se verifican entre equipos en *Consumer-Driven Contract Testing*; cómo cambiar `status`/campos sin romper consumidores en *Evolución de contratos y cambios rompientes*.

## Checklist final

- [ ] `Idempotency-Key` requerida, con política de expiración documentada.
- [ ] Semántica de `409`/`422` alineada con el draft y coherente con producto.
- [ ] Dinero como decimal/entero exacto + moneda explícita (no `float`).
- [ ] Máquina de estados y campos inmutables definidos en el contrato.
- [ ] Consumidor de eventos deduplica por `eventId` en la misma transacción que el efecto.
- [ ] Dedup y concurrencia verificadas en **integración**, no sólo por esquema.
- [ ] Fixtures 100% sintéticos; logs sanitizados.

