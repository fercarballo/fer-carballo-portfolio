---
title: "El capstone acotado: invariantes primero, arquitectura después"
description: "Diseño del capstone Nexo Trusted Transfer Platform: dos opciones arquitectónicas con trade-offs, seis invariantes verificables, ocho capas de prueba, nueve incrementos y criterio de finalización."
pubDate: 2026-07-10
tags: ['capstone', 'arquitectura', 'invariantes', 'outbox', 'idempotencia', 'portfolio', 'sdet']
cluster: 'a12'
clusterTitle: "Capstone: Nexo Trusted Transfer Platform"
type: pilar
order: 1
readingLevel: "Avanzado"
prerequisites: "Requiere Java, PostgreSQL, Docker y los capítulos 01 a 08."
icon: 'flask'
iconHue: 12
---

> **Aviso.** Nexo Finanzas es **ficticio**. **Nada de lo descrito fue construido ni ejecutado.** Este artículo es el diseño previo al código. No se afirma escala, alta disponibilidad, cumplimiento ni experiencia productiva. Todos los datos son sintéticos.

> **Promesa del artículo.** Al terminar vas a tener un proyecto integral y **pequeño** que demuestra arquitectura distribuida, quality engineering, entrega segura y documentación, con una regla de alcance que impide que crezca hasta ahogarte.

## Por qué un capstone y no seis repos

Si ya tenés repositorios funcionando, este capítulo no es para vos: usá el [relevamiento](/blog/coleccion/a09/) y el [diseño de portfolio](/blog/coleccion/a10/).

Si estás empezando, un capstone acotado te da algo que seis repositorios nuevos no dan: **un sistema que funciona**. Un flujo completo, con sus fallos, su evidencia y su documentación. Después, si hay una necesidad demostrable, extraés componentes.

Extraer de un sistema que funciona es fácil. Integrar seis fragmentos que nunca corrieron juntos, no.

## La regla que lo mantiene chico

> **Si una capacidad no ayuda a demostrar uno de los invariantes o riesgos declarados, no entra en el MVP.** Va al backlog con una justificación.

Esta regla solo funciona si los invariantes se escriben **primero**. Por eso este artículo los pone antes de la arquitectura.

## Los seis invariantes

Un invariante es una afirmación que **debe ser verdadera siempre**, y que un test puede verificar. No es un requisito ni un objetivo: es una propiedad del sistema.

1. **Una `Idempotency-Key` no crea dos transferencias.**
2. **Débitos y créditos ficticios permanecen balanceados** en todo momento observable.
3. **Un evento se procesa como máximo una vez a nivel de efecto de negocio**, aunque se entregue más veces.
4. **Todas las decisiones de regla tienen `ruleSetVersion` y `reasonCode`.**
5. **La reconciliación puede explicar las diferencias**, no solo detectarlas.
6. **Logs y trazas no contienen secretos ni PII.**

Ahora, la parte útil: **cada invariante justifica exactamente los componentes que lo protegen, y ninguno más.**

| Invariante | Componentes que lo protegen | Componentes que NO se justifican |
|---|---|---|
| 1 | Tabla de idempotencia con `UNIQUE`, insert-first | Un servicio de idempotencia separado |
| 2 | Ledger de doble entrada, una transacción | Un motor contable |
| 3 | Outbox + inbox con `UNIQUE(eventId)` | Un broker con exactly-once |
| 4 | Ruleset inmutable + `featureSnapshot` | Un motor de reglas de terceros |
| 5 | Consultas de reconciliación + `tipo_discrepancia` | Un warehouse |
| 6 | Contrato de telemetría + test de patrones prohibidos | Un DLP |

**La columna derecha es la que salva el proyecto.** Cada vez que quieras agregar algo, buscá qué invariante protege. Si no protege ninguno, va al backlog.

> La correspondencia completa entre estos seis invariantes y los 22 riesgos de negocio de la serie está en la [matriz transversal](/blog/matriz-riesgo-control-evidencia/). Ahí se ve también qué invariante protege cada fila, y cuáles **no tienen prueba automatizada posible** y dependen enteramente de una señal en producción.

## Dos opciones arquitectónicas

El prompt exige presentar dos opciones con trade-offs antes de elegir. Acá están, y son opciones reales: la B es defendible.

### Opción A — Servicio modular con outbox y consumidor separado

<figure class="diagram">
  <img src="/blog/diagrams/capstone-alcance-invariantes-y-evidencia-1.svg" width="1330" height="223" alt="Diagrama: capstone-alcance-invariantes-y-evidencia (1)" loading="lazy" decoding="async" />
</figure>

Dos procesos: el servicio de transferencias (con las reglas de riesgo embebidas como librería) y el consumidor de reconciliación. Un broker local.

**A favor:** demuestra la frontera asíncrona de verdad. El consumidor es un proceso separado que puede morir, reiniciarse, recibir duplicados. Los invariantes 3 y 5 se prueban en condiciones reales.
**En contra:** dos procesos y un broker en el Compose. Más superficie operativa.

### Opción B — Monolito modular con outbox interno

Un solo proceso. El outbox se lee con un job interno y la proyección se actualiza en el mismo proceso, sin broker.

**A favor:** un contenedor y una base. Levanta en diez segundos. Todos los tests corren sin infraestructura.
**En contra:** **no demuestra la frontera asíncrona.** Sin un consumidor separado y un broker que reentrega, el invariante 3 es una afirmación sobre un `for` loop. Y ese invariante es el corazón conceptual de toda la serie.

### Recomendación: **Opción A**

Porque el invariante 3 es el que el capstone existe para demostrar, y la opción B lo simula sin probarlo.

**Pero con una condición explícita, y esto es lo que hace la decisión defendible:** el broker es un **detalle reemplazable**. El consumidor se prueba en aislamiento con un doble del broker; el broker real aparece solo en los tests de integración. Si el broker resulta ser el 40 % del esfuerzo del proyecto, degradá a la opción B y **escribí por qué**.

**Lo que la opción A no demuestra**, y va en el ADR: escalabilidad (una partición, un contenedor), alta disponibilidad (una instancia de todo), ni operación productiva.

## Alcance del MVP

**Incluir:**

- Un servicio Java de transferencias.
- PostgreSQL.
- Un broker local.
- OpenAPI y AsyncAPI.
- Un consumidor idempotente.
- Un reconciliador simple.
- Un rule engine deliberadamente pequeño.
- OpenTelemetry o instrumentación equivalente, local.
- Docker Compose.
- Pipeline con tests, SBOM y artefactos.
- Un feature flag local, para **una** regla.

**Excluir, con justificación:**

| Excluido | Por qué |
|---|---|
| Kubernetes, GitOps, canary real | No protegen ningún invariante. El [capítulo 03](/blog/coleccion/a03/) los cubre conceptualmente |
| Web y mobile completos | El invariante vive en el backend |
| IA / ML | El problema de las etiquetas no está resuelto. Ver [capítulo 07](/blog/coleccion/a07/) |
| Datos reales | Nunca |
| Alta disponibilidad, claims de escala | Un demo local no los prueba |
| Compliance / certificación | No se afirma |

## Las ocho capas de prueba

Cada capa prueba algo que las otras no pueden.

| Capa | Qué prueba | Invariante |
|---|---|---|
| **Unitarias** | Dinero, estados, reglas, idempotencia | 1, 2, 4 |
| **Componentes** | Persistencia y outbox en la misma transacción | 3 |
| **Contratos** | OpenAPI y AsyncAPI validan; el handler procesa | — |
| **Integración** | DB + broker + consumidor: duplicados, `ack` perdido, DLQ | 3 |
| **Journey** | Crear una transferencia y observarla de punta a punta | 5, 6 |
| **Seguridad** | Autorización por objeto (BOLA); datos sensibles | 6 |
| **Performance** | Baseline pequeño, **separado del CI rápido** | — |
| **Supply chain** | SBOM y verificación del artefacto | — |

**Los tres tests que más valen**, y que casi nadie escribe:

1. **`rollbackNoDejaEventoEnOutbox()`** — Forzar una excepción tras escribir el outbox. Cero filas. **Es la prueba de que no inventás hechos.**
2. **`entregaDuplicadaProduceUnSoloEfecto()`** — Publicar el mismo `eventId` dos veces. Un efecto. Ejecutado con repetición, porque las condiciones de carrera no fallan siempre.
3. **`logsYResponsesNoContienenPatronesProhibidos()`** — Ejercitando el **camino de error**, que es donde se filtra.

Y una regla que atraviesa todas: **ninguna prueba asíncrona usa `sleep`.** Se espera por una condición observable, con timeout y con un mensaje que diga qué se esperaba.

## Estructura

```text
apps/transfer-service/
apps/reconciliation-consumer/
contracts/openapi/
contracts/asyncapi/
infra/compose/
tests/contracts/
tests/integration/
tests/security/
docs/architecture/          # ACTUAL. La objetivo va aparte y rotulada
docs/adr/
docs/quality/
docs/runbooks/
evidence/
```

## Nueve incrementos

Cada uno termina en **código ejecutable, tests, ADR o documentación actualizada, y evidencia real**. Un incremento sin las cuatro cosas no está terminado, y no se pasa al siguiente.

| # | Incremento | Termina cuando |
|---:|---|---|
| 1 | **Modelo e invariantes con tests** | Los seis invariantes están escritos; los que se pueden probar sin infraestructura, pasan |
| 2 | **API y persistencia** | `POST /transfers` crea una transferencia; el contrato valida en CI |
| 3 | **Idempotencia** | Concurrencia con la misma clave produce **una** ejecución (test con repetición) |
| 4 | **Outbox y evento** | **Un rollback no deja fila en el outbox** |
| 5 | **Consumidor y reconciliación** | Entrega duplicada → un efecto. INV-3 devuelve cero filas |
| 6 | **Observabilidad** | Un `correlationId` cruza de la API al consumidor, a través del broker |
| 7 | **Regla versionada y flag** | Toda decisión tiene `ruleSetVersion` y `reasonCode`; el kill switch se ensayó |
| 8 | **Evidencia de supply chain** | Un artefacto no firmado **es rechazado**, y podés demostrarlo |
| 9 | **Documentación y demo reproducible** | Otra persona lo corre en una máquina limpia siguiendo el README |

**El incremento 1 es el que la gente saltea, y es el que hace posible a los demás.** Escribir los invariantes antes de escribir la API te obliga a saber qué estás construyendo. Y varios de ellos (dinero balanceado, estados válidos) se pueden probar sin ninguna infraestructura, en el primer día.

**El incremento 4 es el más valioso del proyecto.** El test de rollback es la diferencia entre un outbox que parece funcionar y uno que funciona.

**El incremento 9 no es documentación.** Es la verificación de que los otros ocho sirven. Borrá tu caché de Maven, cloná en un directorio nuevo, y seguí tu propio README línea por línea. Cada vez que tengas que "saber" algo que no está escrito, encontraste una dependencia oculta.

## Criterio de finalización del MVP

- [ ] Los **seis invariantes** tienen al menos un test cada uno.
- [ ] Una persona nueva lo ejecuta en una máquina limpia siguiendo el README.
- [ ] El flujo feliz **y los fallos críticos** (duplicado, rollback, DLQ) tienen pruebas.
- [ ] Hay evidencia real y fechada en `evidence/`.
- [ ] Los secretos están externalizados (`.env.example`, nunca `.env`).
- [ ] Existe al menos un ADR con la alternativa descartada y sus consecuencias negativas.
- [ ] El README declara **qué no demuestra** el proyecto.
- [ ] Hay un artículo técnico que explica una **decisión**, no un tutorial.
- [ ] Ninguna prueba asíncrona usa `sleep`.
- [ ] Ningún log, response ni artefacto contiene datos personales.

## Qué NO demuestra este proyecto

Copiar textualmente al README:

```markdown
## Qué NO demuestra este proyecto

- **No demuestra escalabilidad.** Un contenedor de broker, una partición.
  No se ejecutaron pruebas de carga y no se afirma ningún throughput.
- **No demuestra alta disponibilidad.** Una instancia de cada cosa.
- **No demuestra operación en producción.** Nunca tuvo usuarios ni un incidente real.
- **No demuestra cumplimiento regulatorio.** Nexo Finanzas es ficticio y no mueve dinero.
- **El motor de riesgo no detecta fraude.** Aplica una política declarada, sobre datos sintéticos.
- **La revisión humana está simulada.**
- **Los runbooks se ensayaron en el sandbox**, con fecha registrada; nunca bajo presión real.
```

Esa sección hace que el proyecto se vea **más** serio. Un entrevistador senior va a probar exactamente esos límites; que ya estén declarados mueve la conversación a las decisiones.

## Anti-patrones

- **Escribir la arquitectura antes que los invariantes.** *Consecuencia:* no tenés criterio para decidir qué entra. *Alternativa:* invariantes primero, y cada componente justifica el suyo.
- **Agregar una capacidad que no protege ningún invariante.** *Alternativa:* backlog, con justificación.
- **Elegir la opción B y afirmar que demuestra la frontera asíncrona.** *Consecuencia:* el invariante 3 es una afirmación sobre un `for`. *Alternativa:* opción A, o decir honestamente qué no demuestra.
- **Kubernetes en el MVP.** *Consecuencia:* nadie corre tu demo. *Alternativa:* Compose.
- **Saltear el incremento 1.** *Consecuencia:* construís sin saber qué estás protegiendo.
- **No escribir el test de rollback del outbox.** *Consecuencia:* tenés un outbox que parece funcionar.
- **`sleep` en pruebas asíncronas.** *Alternativa:* esperar por condición observable.
- **Probar solo el happy path del test de privacidad.** *Consecuencia:* el camino de error filtra. *Alternativa:* ejercitar el error.
- **README sin "qué NO demuestra".** *Alternativa:* declararlo suma credibilidad.
- **Un artículo que es el tutorial del repo.** *Alternativa:* explicá una decisión.

## Qué aprendimos / próximos pasos

- Los invariantes se escriben antes que la arquitectura, y cada componente justifica el suyo.
- La columna "componentes que NO se justifican" es lo que mantiene chico al capstone.
- La opción B es defendible y no demuestra el invariante 3. Decirlo es la decisión, no el diagrama.
- El test de rollback del outbox es el más valioso del proyecto.
- El incremento 9 no es documentación: es la verificación de los otros ocho.
- "Qué NO demuestra este proyecto" hace que el proyecto se vea más serio.

**Antes de escribir la primera línea de código:** completá la matriz de riesgos, el plan de datos sintéticos y los comandos de validación.

**Y escribí el RFC del outbox antes de implementarlo.** Está en el [capítulo 13](/blog/coleccion/a13/), completo, como ejemplo.

## Checklist final

- [ ] Los seis invariantes están escritos antes que la arquitectura.
- [ ] Cada componente del MVP protege un invariante nombrado.
- [ ] Existe una lista de capacidades excluidas, con justificación.
- [ ] El ADR de arquitectura presenta las **dos** opciones y explica la descartada.
- [ ] El ADR declara qué **no** demuestra el demo.
- [ ] Cada incremento termina en código, tests, documentación y evidencia.
- [ ] El incremento 1 (invariantes) se completó antes que el 2.
- [ ] Existe `rollbackNoDejaEventoEnOutbox()`.
- [ ] Existe `entregaDuplicadaProduceUnSoloEfecto()`, con repetición.
- [ ] Existe el test de patrones prohibidos, ejercitando el camino de error.
- [ ] Ninguna prueba asíncrona usa `sleep`.
- [ ] El README tiene la sección "Qué NO demuestra este proyecto".
- [ ] Otra persona ejecutó el proyecto en una máquina limpia.

---

## Fuentes (consultadas 2026-07-10)

- [AsyncAPI Documentation](https://www.asyncapi.com/docs) — línea estable 3.0.0.
- [OpenTelemetry Documentation](https://opentelemetry.io/docs/) — ver la advertencia sobre semconv de messaging en la [verificación de fuentes](/blog/verificacion-de-fuentes-serie-avanzada/).
- [RFC 9110 — métodos idempotentes](https://www.rfc-editor.org/rfc/rfc9110#name-idempotent-methods)
- [OWASP API Security Top 10 — API1:2023 Broken Object Level Authorization](https://owasp.org/API-Security/editions/2023/en/0xa1-broken-object-level-authorization/) — para la capa de pruebas de seguridad (invariante 6 y riesgo R-8 de la [matriz transversal](/blog/matriz-riesgo-control-evidencia/)).
- [CycloneDX](https://cyclonedx.org/specification/overview/) — v1.7 / ECMA-424, para el SBOM del incremento 8.
- [Sigstore](https://docs.sigstore.dev/) — cosign 2.4+, para la firma.
- [Verificación de fuentes de la serie](/blog/verificacion-de-fuentes-serie-avanzada/)
