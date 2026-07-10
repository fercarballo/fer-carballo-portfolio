---
title: "Contratos de API en una plataforma de transferencias: qué garantizan y qué no"
description: "Diseñá contratos de API verificables para transferencias: diferencias entre especificación, contrato, prueba y monitoreo, con OpenAPI, Pact y AsyncAPI."
pubDate: 2026-07-09
tags: ["contract-testing", "openapi", "sistemas-distribuidos", "quality-engineering", "apis"]
cluster: "02"
clusterTitle: "API contract testing y sistemas distribuidos"
type: "pilar"
order: 1
repo: "nexo-transfer-api"
icon: "braces"
iconHue: 28
readingLevel: "Intermedio–Avanzado"
---
**Subtítulo:** Cómo convertir los supuestos entre servicios en artefactos verificables — y por qué eso reduce fallas de integración sin garantizar que una transferencia sea correcta.

> *Nexo Finanzas, sus cuentas e IDs son un ejemplo ficticio con fines didácticos. Ningún dato es real.*

## El problema, no la definición

Un martes cualquiera, el equipo de **Web Banking** de Nexo Finanzas despliega un cambio menor: el campo `amount` de una transferencia pasa de string `"100.00"` a número `100.0` "para simplificar el frontend". Los tests unitarios de ambos lados pasan. En producción, el **Mobile Wallet** —que valida `amount` como string con dos decimales— empieza a rechazar la confirmación de transferencias ya creadas. El *Ledger* recibe el evento, pero **Reconciliation** lo interpreta con otro tipo y descuadra un reporte. Nadie mintió; simplemente cada servicio creía algo distinto sobre la frontera que comparten.

Ese es el fallo que los contratos atacan: **la integración es una frontera de supuestos**, y los supuestos no versionados se rompen en silencio. Este artículo te da el marco para encuadrar una estrategia de contratos en una frontera de transferencias. No promociona OpenAPI, Pact ni AsyncAPI: enseña a decidir *qué artefacto usar, qué prueba corre en qué capa y qué evidencia dejás* antes de una entrega.

## Lectura rápida (no reemplaza el artículo)

1. Un contrato reduce **una clase** de fallas (forma y semántica de la frontera), no todas. No valida cálculo contable, autorización sobre el objeto ni disponibilidad.
2. Hay **cuatro artefactos** que se confunden: especificación, contrato, implementación y evidencia de ejecución. Cada uno detecta cosas distintas.
3. Elegí la **capa de prueba** por la pregunta: un *mock* prueba tu expectativa del proveedor, no al proveedor real. La verificación de contrato y la integración real son complementarias, no sustitutas.
4. El valor aparece cuando el contrato incluye **semántica** (idempotencia, dinero, estados, errores), **estrategia de compatibilidad** y **datos representativos** — y cuando deja **evidencia trazable** en CI.

## Prerrequisitos y glosario mínimo

**Imprescindible para seguir el ejemplo:** HTTP (métodos, status codes, headers — [RFC 9110](https://www.rfc-editor.org/rfc/rfc9110)); JSON y JSON Schema (tipo vs. requerido vs. formato vs. regla de negocio); nociones de sistemas distribuidos (timeout, retry, duplicado, consistencia eventual). **Consulta diferida (no bloquea la lectura):** internals de Kafka/AMQP, OAuth/JWT, detalles de Pact JVM. Este artículo **no** es una introducción a microservicios: asumimos una frontera entre servicios, sin importar si es un monolito modular o no.

| Término | Definición operativa en este artículo |
|---|---|
| **Provider** | El servicio que *expone* la operación (aquí, la Transfer API). |
| **Consumer** | El servicio o canal que *depende* de esa operación (Web Banking, Mobile Wallet, Reconciliation). |
| **Esquema (schema)** | La *forma* de un mensaje: campos, tipos, requeridos, formatos. |
| **Semántica** | El *significado*: qué implica `201` vs. `409`, qué es "idempotente", qué estado sigue a `PENDING`. |
| **Compatibilidad** | Que un cambio no rompa a un consumidor existente (hacia atrás) o futuro (hacia adelante). |
| **Idempotencia** | Que repetir la misma operación tenga el mismo efecto que ejecutarla una vez ([RFC 9110 §9.2.2](https://www.rfc-editor.org/rfc/rfc9110#section-9.2.2)). |
| **Eventual consistency** | Los estados convergen con el tiempo, no de forma inmediata ni ordenada. |
| **Mock** | Doble programado con expectativas: responde lo que *vos creés* que el proveedor responde. |
| **Stub** | Doble que devuelve respuestas fijas para aislar una dependencia; no verifica interacción. |

## La integración es una frontera de supuestos

El siguiente diagrama muestra las fronteras de una transferencia ficticia en Nexo. Cada flecha es un lugar donde dos partes *acuerdan algo* — y por lo tanto un lugar donde ese acuerdo puede romperse.

<figure class="diagram">
  <img src="/blog/diagrams/contratos-api-transferencias-sistemas-distribuidos-1.svg" width="760" height="256" alt="Diagrama: contratos-api-transferencias-sistemas-distribuidos (1)" loading="lazy" decoding="async" />
</figure>

**Qué evidencia se produce en cada frontera:**

- `WEB/MOB → API`: contrato **HTTP síncrono**. Evidencia: verificación de contrato (esquema + semántica de status/headers) en CI del proveedor y del consumidor.
- `API → LED`: frontera *interna* de negocio (integridad contable). **Ningún contrato de esquema la cubre**; requiere pruebas de integración con datos sintéticos.
- `API → EVT → NOT/REC`: contrato **de evento asíncrono**. Evidencia: validación de esquema del mensaje + prueba de integración del *efecto* del consumidor (una notificación enviada, una conciliación registrada).
- `API → TEL`: trazabilidad. Evidencia: `correlation-id`/`traceparent` propagado y correlacionable ([W3C Trace Context](https://www.w3.org/TR/trace-context/)).

La conclusión de diseño (opinión fundamentada): **el contrato de esquema es necesario pero insuficiente**. Las fronteras `API → LED` y el *efecto* de `EVT → REC` no se prueban con un JSON Schema.

## Cuatro artefactos que no son lo mismo

Confundirlos es la raíz de la mayoría de las discusiones estériles sobre "¿ya tenemos contract testing?".

| Artefacto | Quién lo escribe | Quién lo consume | Qué detecta | Qué **no** detecta |
|---|---|---|---|---|
| **Especificación** (OpenAPI/AsyncAPI) | Diseño de API / provider | Humanos y herramientas | Forma esperada, semántica documentada | Que la implementación *cumpla* la spec |
| **Contrato** (spec gobernada o pacto consumer-driven) | Provider y/o consumer | CI de ambos | Que un cambio rompa lo acordado | Reglas de negocio no expresadas en el contrato |
| **Implementación** | Provider | Consumidores en runtime | — (es el sistema real) | Nada por sí sola; hay que ejercitarla |
| **Evidencia de ejecución** (reportes, logs, trazas) | Pipeline / entorno | Auditoría, release, incidentes | Qué pasó realmente en una verificación | El futuro; sólo registra lo ejecutado |

> **Distinción explícita (estándar de veracidad):** "OpenAPI describe la operación" es un *hecho citado*. "Un contrato de esquema no valida integridad contable" es una *inferencia* derivada de su alcance. "Nexo debería empezar por un endpoint y un evento" es una *decisión de diseño*. No hay *resultados experimentales* reales en este artículo: todo número es plantilla.

## Cuatro tipos de contrato (no un solo "contrato")

Sostener la estrategia exige distinguir qué estás acordando:

1. **Contrato de esquema.** La forma del request/response o del mensaje. Barato, automatizable, detecta cambios de tipo/campo. Punto ciego: no dice *qué significa* un `422` ni si el saldo se descuenta una vez.
2. **Contrato de comportamiento.** La semántica: idempotencia, transición de estados, códigos y su significado, headers de correlación. Requiere estados del proveedor y datos controlados.
3. **Contrato de evento.** El mensaje asíncrono y su *garantía de entrega* (at-least-once vs. exactly-once), que depende de la plataforma, no del esquema.
4. **Contrato operacional.** Lo que se espera en runtime: latencia, disponibilidad, límites de tasa. Se cubre con SLOs y monitoreo, **no** con contract testing.

**Decisión (trade-off):** empezá por esquema + comportamiento del endpoint de mayor riesgo. El contrato de evento suma cuando hay consumidores desacoplados; el operacional es dominio de observabilidad. Sobre-invertir en los cuatro a la vez es un anti-patrón de gobernanza.

## Contratos HTTP con semántica, no sólo con JSON

Un contrato útil expresa la **semántica de RFC 9110**, no sólo la forma:

- **Métodos e idempotencia.** `GET/PUT/DELETE` son idempotentes; `POST` no ([RFC 9110 §9.2.2](https://www.rfc-editor.org/rfc/rfc9110#section-9.2.2)). Crear una transferencia con `POST` exige un mecanismo explícito de idempotencia (lo desarrollamos en *Idempotencia, dinero y eventos*).
- **Status codes con significado acordado.** `201` (creada), `409` (conflicto), `422` (contenido semánticamente inválido, [§15.5.21](https://www.rfc-editor.org/rfc/rfc9110#section-15.5.21)). El significado debe ser *coherente con la documentación de producto*, no improvisado.
- **Headers de correlación.** `X-Correlation-Id` o `traceparent` para unir petición, dependencias y evidencia ([W3C Trace Context](https://www.w3.org/TR/trace-context/)).

**Regla de negocio que queda fuera del contrato de esquema:** "no permitir transferencia si el titular no es dueño de la cuenta origen". Eso es **autorización sobre el objeto** (BOLA, API1:2023 en [OWASP API Security Top 10 2023](https://owasp.org/API-Security/)). Un JSON Schema válido puede describir una petición perfectamente formada y **maliciosa**. El contrato *complementa* controles de autorización; no los reemplaza.

## La estrategia de pruebas alrededor del contrato

Aquí se juega el criterio senior: **cada capa responde una pregunta distinta**; duplicarlas es desperdicio y omitirlas es un hueco.

| Capa | Pregunta que responde | Qué **no** prueba |
|---|---|---|
| **Unitario** | ¿La lógica de una unidad es correcta? | La frontera con otros servicios |
| **Componente** | ¿El servicio se comporta bien con sus dependencias *dobladas*? | Al proveedor/consumidor real |
| **Contrato** | ¿La forma+semántica acordada se sostiene entre provider y consumer? | Reglas de negocio no contratadas; concurrencia; UX |
| **Integración real** | ¿Los servicios reales colaboran con datos sintéticos? | Escala productiva; todos los estados |
| **End-to-end / UI** | ¿El journey de usuario funciona de punta a punta? | Causas raíz (es caro y frágil para eso) |
| **Monitoreo sintético** | ¿La frontera sigue viva *después* del despliegue? | Prevención antes del release |

**Diferencia crítica que hay que explicitar:**

- Una **prueba de contrato** verifica que provider y consumer *coinciden en la frontera*, usando estados controlados. **Un mock no prueba al proveedor real**: prueba tu creencia sobre él. Si esa creencia está desactualizada, tu suite verde miente.
- Una **prueba de integración** ejercita servicios reales con datos sintéticos.
- Un **end-to-end** valida el journey completo (caro, lento; reservalo para pocos flujos de alto riesgo).
- El **monitoreo sintético** corre en producción y detecta degradación que ninguna verificación previa al release puede anticipar.

## Verificación de contrato en el ciclo de cambio

El flujo mínimo para que un contrato *bloquee* un cambio rompiente antes de producción:

<figure class="diagram">
  <img src="/blog/diagrams/contratos-api-transferencias-sistemas-distribuidos-2.svg" width="850" height="435" alt="Diagrama: contratos-api-transferencias-sistemas-distribuidos (2)" loading="lazy" decoding="async" />
</figure>

**Qué evidencia produce cada frontera:** el `Consumer` publica una **expectativa versionada**; el `Provider CI` la busca y la **verifica** contra un entorno con estados controlados; el entorno devuelve **logs sanitizados**; el resultado se publica en el registro y habilita (o bloquea) el despliegue. Esta es la mecánica que un flujo consumer-driven automatiza — y **cuándo conviene o no** es el tema de *Consumer-Driven Contract Testing*.

## Evidencia, medición y trazabilidad

Proponé una **matriz de evidencia** por cambio (no inventes valores; llenala en CI):

| cambio | consumer afectado | contrato | verificación | ambiente | commit | artefacto | limitación | owner | fecha revisión |
|---|---|---|---|---|---|---|---|---|---|
| *(ej.)* agrega `note` opcional | Web Banking | `transfers@2.3` | passed | `int-eu` | `<sha>` | `report.xml` | no cubre concurrencia | equipo-transfers | 2026-07-09 |

**Métricas — con definición, no con promesas** (entregá plantilla + comando, no cifras ficticias):

- **Tiempo p50/p95 de verificación desde un PR.** Fuente: timestamps de CI. Sesgo: colas del runner. Decisión que habilita: presupuesto de feedback.
- **Cambios rompientes detectados antes del release.** Definí "rompiente" (ver *Evolución de contratos*). Sesgo: sólo cuenta consumidores *con* contrato.
- **Proporción de consumers conocidos con contrato/integración explícita.** *No cubre consumidores desconocidos* — decláralo siempre.
- **Falsos positivos de contrato / fallas de ambiente tras triage.** Fuente: etiquetas de incidentes de CI.
- **% de eventos con `correlation-id`/`eventId` trazable en test.** Aclarar límites de privacidad y muestreo.

> Comando de reproducción (plantilla, sin resultado inventado):
> ```bash
> # Reemplazá <tool> por tu verificador; guardá el reporte como artefacto
> <tool> verify --provider transfers --pact-dir ./pacts --out ./reports/verification.xml
> ```

## Plan incremental para Nexo Finanzas

**Primera entrega mínima (una sola frontera):**

1. `nexo-transfer-api`: publicar un **OpenAPI versionado** para `POST /v1/transfers` y `GET /v1/transfers/{id}`, con tests de componente/API.
2. `nexo-web-banking-e2e` y `nexo-wallet-mobile`: consumir **sólo la API documentada**; cubrir journeys de alto riesgo, no internals.
3. `nexo-cross-channel-regression`: un smoke que crea la transferencia desde un canal y verifica el estado desde otro — **no reemplaza** contratos ni pruebas de API.
4. `nexo-quality-platform`: correr verificación de contratos **antes de integrar** y guardar reportes **sanitizados** como artefactos.
5. `nexo-quality-control-tower`: relacionar riesgo ↔ contrato ↔ ejecución ↔ evidencia ↔ defecto, **sin copiar datos sensibles**.

**Extensiones maduras (después):** contratos de error, autorización negativa, eventos de transferencia, reconciliación y telemetría.

## Anti-patrones (marco general)

| Anti-patrón | Síntoma | Raíz probable | Impacto | Alternativa |
|---|---|---|---|---|
| **OpenAPI generado post-código y nunca revisado** | La spec "existe" pero nadie la gobierna | Se trata como documentación, no como contrato | Cambios rompientes pasan sin aviso | Revisar la spec en el PR; *diff* de contrato como gate |
| **Validar sólo schemas** | Suite verde, bugs de negocio en prod | Confundir forma con significado | Falsa confianza | Sumar contrato de comportamiento + integración |
| **Mockear todos los proveedores, cero integración real** | "Todo pasa" en aislamiento | Miedo a entornos costosos | La frontera real nunca se ejercita | Al menos un happy-path de integración por frontera crítica |
| **Contrato como sustituto de observabilidad** | Sin monitoreo posdespliegue | Creer que el gate previo alcanza | Degradación invisible en prod | Monitoreo sintético + trazas correlacionadas |

## Qué aprendimos / próximos pasos

- Un contrato **versiona supuestos** y bloquea una clase concreta de fallas — no es una garantía de corrección.
- Distinguí **artefacto** (spec/contrato/implementación/evidencia) y **capa** (unit/contrato/integración/e2e/sintético) antes de escribir un solo test.
- Empezá por **una frontera de alto riesgo**, con evidencia trazable.

**Enlaces internos sugeridos (misma colección):**
- ¿Adoptar Pact o alcanza un OpenAPI gobernado? → *Consumer-Driven Contract Testing: cuándo vale la pena*.
- La semántica fina de una transferencia → *Idempotencia, dinero y eventos: cómo hacer que una transferencia ocurra una sola vez*.
- Cambiar sin romper → *Evolución de contratos y cambios rompientes*.

## Checklist final

- [ ] Distinguí especificación, contrato, mock, integración y e2e antes de elegir herramienta.
- [ ] Identifiqué la frontera de mayor riesgo y su(s) consumidor(es) conocido(s).
- [ ] El contrato incluye semántica (status/headers/estados), no sólo forma.
- [ ] Cada capa de prueba responde una pregunta distinta; no hay duplicación inútil.
- [ ] La evidencia (commit, contrato, ambiente, reporte, limitación, owner) queda trazable.
- [ ] Las métricas tienen definición, período y sesgo — no prometen cobertura total.
- [ ] Fuentes oficiales verificadas y fechadas.

