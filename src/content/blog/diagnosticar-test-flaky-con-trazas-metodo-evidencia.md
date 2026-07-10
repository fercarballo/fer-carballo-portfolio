---
title: "Diagnosticar un test flaky con trazas: método, evidencia y límites"
description: "Un método reproducible para triar una falla intermitente con observabilidad: clasificar, buscar contexto, validar datos/entorno, comparar control vs experimento y concluir con evidencia o declarar inconcluso. Incluye cómo enlazar CI con trazas y qué hacer cuando el sampling descarta la traza."
pubDate: 2026-07-09
tags: ["flaky-tests", "distributed-tracing", "diagnostico", "triage", "ci", "opentelemetry", "quality-engineering", "postmortem"]
cluster: "07"
clusterTitle: "Observabilidad para Quality Engineering"
type: "satelite"
order: 3
repo: "flakiness-hunting-playwright"
icon: "search"
iconHue: 265
readingLevel: "Intermedio–Avanzado"
prerequisites: "QA Automation / SDET, DevOps"
---
> **Bajada.** "Volvé a correrlo" no es un diagnóstico. Una falla intermitente que se re-ejecuta hasta que pasa puede estar ocultando un defecto real de idempotencia, una contención de datos de prueba o una degradación de dependencia. Este artículo propone un **método de triage** que usa observabilidad para convertir un flaky en una **clasificación con evidencia** —o, cuando la evidencia no alcanza, en un honesto "inconcluso" que repara la telemetría en vez de fingir una conclusión.

> **Nota.** Cierra la colección iniciada en el pilar [Observabilidad para Quality Engineering](/blog/observabilidad-quality-engineering-evidencia-explicable/) y apoyada por [El contrato de telemetría](/blog/contrato-de-telemetria-privacidad-cardinalidad-gobernanza/). El caso de falla es **simulado y explícitamente ficticio**: no describe un incidente real y **no inventa** métricas, trazas ni resultados de ejecución. Fuentes verificadas al **9 de julio de 2026**.

---

## Resumen ejecutivo

- Un flaky no es un veredicto ("el test es malo"); es una **pregunta sin evidencia**.
- El método: **clasificar → buscar contexto → validar datos/entorno → comparar control vs experimento → concluir o declarar inconcluso**.
- Antes de investigar la causa, verificá que exista **evidencia completa**. Si no la hay, el primer defecto es de **observabilidad**, no de producto.
- Enlazar el test con la traza requiere que CI registre `run_id`, `commit` y —cuando el diseño lo permite— `trace_id`.
- Si el **sampling** descartó la traza, "no está" **no** prueba que el test no llegó. Hay que decirlo, no adivinar.
- Correlación temporal **no** es causalidad: hace falta un contraste (control vs experimento).

**Índice**

1. [El flaky no es un veredicto](#1-el-flaky-no-es-un-veredicto)
2. [El método de triage en un diagrama](#2-el-metodo-de-triage-en-un-diagrama)
3. [Paso 0: ¿hay evidencia completa?](#3-paso-0-hay-evidencia-completa)
4. [Enlazar CI y test con evidencia operable](#4-enlazar-ci-y-test-con-evidencia-operable)
5. [Cuando el sampling se comió la traza](#5-cuando-el-sampling-se-comio-la-traza)
6. [Caso simulado: el timeout intermitente de transferencia](#6-caso-simulado-el-timeout-intermitente-de-transferencia)
7. [Criterios de evidencia y qué se puede afirmar](#7-criterios-de-evidencia-y-que-se-puede-afirmar)
8. [Métricas de salud del diagnóstico](#8-metricas-de-salud-del-diagnostico)
9. [Anti-patrones](#9-anti-patrones)
10. [Checklist](#10-checklist)
11. [Fuentes](#11-fuentes-consultadas-2026-07-09)

**Glosario mínimo**

| Término | Definición |
|---|---|
| **Flaky** | Test que pasa y falla sin cambios en el código bajo prueba. |
| **Control vs experimento** | Comparar una ejecución sana con la fallida para aislar la diferencia. |
| **Inconcluso** | Resultado válido cuando la evidencia no permite clasificar. |
| **run_id** | Identificador único de una ejecución de test/CI. |
| **Evidencia correlacionable** | Señales (traza/log/métrica) vinculadas a la misma ejecución por contexto. |

---

## 1. El flaky no es un veredicto

Cuando un test es intermitente, la reacción común es etiquetarlo `@flaky` y re-ejecutar. El problema: un flaky puede tener **causas legítimas y opuestas**:

- **Producto:** un bug real de concurrencia/idempotencia que solo aparece bajo cierto *timing*.
- **Datos de prueba:** dos ejecuciones compiten por el mismo registro y una gana.
- **Entorno:** una dependencia del ambiente de test se degrada esporádicamente.
- **Automatización:** un `wait` mal puesto, un selector frágil, un timeout demasiado corto.
- **Plataforma:** el runner de CI se quedó sin recursos.

Re-ejecutar hasta el verde trata a las cinco igual: las esconde. La observabilidad permite **distinguirlas con evidencia**. El objetivo del triage no es "arreglar el test", sino **clasificar la causa** para decidir la acción correcta (defecto vs. acción correctiva de datos/entorno).

---

## 2. El método de triage en un diagrama

<figure class="diagram">
  <img src="/blog/diagrams/diagnosticar-test-flaky-con-trazas-metodo-evidencia-1.svg" width="844" height="902" alt="Diagrama: diagnosticar-test-flaky-con-trazas-metodo-evidencia (1)" loading="lazy" decoding="async" />
</figure>

El diagrama codifica tres decisiones de disciplina:

1. **Primero la evidencia, después la causa** (`B`). Si no hay evidencia completa, no se investiga la causa: se repara la observabilidad. Investigar sin evidencia es adivinar.
2. **La clasificación se comprueba, no se supone** (`E`). "Parece de ambiente" no alcanza; hay que mostrar la traza/log que lo respalda.
3. **"Inconcluso" es una salida válida** (`D`). Es preferible un inconcluso honesto a un defecto mal clasificado que quema credibilidad.

---

## 3. Paso 0: ¿hay evidencia completa?

Antes de correlacionar nada, chequeá que la ejecución dejó lo mínimo para investigar:

| Evidencia | ¿Presente? | Si falta… |
|---|---|---|
| `run_id` + `commit` + ambiente | | No sabés **qué versión** falló. Reparar el reporte de CI. |
| Traza del journey (o razón de su ausencia) | | Puede ser sampling (§5) o instrumentación rota. |
| Logs con `trace_id` | | No podés saltar de log a traza. Reparar inyección de contexto. |
| Outcome de negocio del paso | | No sabés si fue error esperado o incidente. |

Si la primera columna tiene huecos, el hallazgo es: **"falla de observabilidad, no de producto"**. Se marca inconcluso y se crea la acción de reparar la telemetría. Esto no es rendirse: es no fabricar una conclusión sobre datos ausentes.

---

## 4. Enlazar CI y test con evidencia operable

Para que el Paso 0 pase, el test debe **producir** evidencia segura. La capa de test adjunta identificadores —nunca PII— al reporte.

**Ejemplo ilustrativo (pseudocódigo BDD).** Los headers/APIs dependen de tu stack; validá antes de usar.

```java
// Adjuntar evidencia REDACTADA a un escenario BDD
ScenarioEvidence evidence = new ScenarioEvidence(runId, commitSha);
ApiResponse response = transferClient.create(request);

evidence.attach("transfer_reference", request.reference());   // referencia SINTÉTICA de la corrida
evidence.attach("trace_id", response.header("trace-id-or-safe-correlation-header"));
evidence.attach("outcome", response.businessOutcome());       // ACCEPTED | REJECTED | TIMEOUT

// toRedactedJson() aplica la allowlist antes de escribir el artefacto
scenario.attach(evidence.toRedactedJson(), "application/json", "execution-evidence");
```

**Explicado:**

- `runId` + `commitSha` responden *qué versión, en qué corrida*. Son metadatos de ejecución, la **fuente de verdad** del reporte (ver la discusión de `test_run` en el [pilar §6](/blog/observabilidad-quality-engineering-evidencia-explicable/)).
- `transfer_reference` es **sintética** (`demo-run-42-007`): identifica la corrida, no a una persona.
- `trace_id` permite saltar del reporte a la traza —**si** el diseño lo permite (§5).
- `toRedactedJson()` aplica la **allowlist** del contrato antes de escribir el artefacto. Es donde el [contrato de telemetría](/blog/contrato-de-telemetria-privacidad-cardinalidad-gobernanza/) se hace cumplir en el lado del test.

> **¿Y si no se debe devolver un `trace_id` al cliente?** Exponer el `trace_id` en una respuesta al cliente puede ser indeseable (superficie de información). Alternativas: (a) registrar la correlación **del lado de test/backend** (el test conoce su `run_id`, el backend loguea `run_id ↔ trace_id`), o (b) usar un **vínculo temporal + metadatos controlados** (ventana de tiempo + `commit` + `channel`) para reconstruir la correlación sin devolver el ID. La elección depende de tu modelo de amenazas, no de conveniencia.

---

## 5. Cuando el sampling se comió la traza

Este es el matiz que separa un diagnóstico honesto de una conclusión apresurada.

Si buscás la traza del fallo y **no está**, hay al menos tres explicaciones, y no son intercambiables:

1. **El test no llegó al servicio** (fallo temprano: DNS, TLS, borde). → La ausencia *es* evidencia.
2. **La instrumentación falló** (span no cerrado, contexto no propagado). → Bug de observabilidad.
3. **El sampling la descartó** (head sampling la tiró antes del error). → La ausencia **no** es evidencia de nada.

> **Regla:** "no está la traza" **no** prueba "el test no se ejecutó". Antes de concluir, verificá la **política de sampling** documentada en el contrato (ver [artículo 2, §5](/blog/contrato-de-telemetria-privacidad-cardinalidad-gobernanza/)).

**Qué hacer cuando el sampling amenaza con perder el fallo:**

- **Correlación por logs:** si los logs (muestreados aparte o completos) llevan `trace_id`, podés reconstruir parte del journey aunque la traza se haya descartado.
- **Sampling dirigido en repro:** al reproducir de forma controlada, forzá `sampled=01` (o un tail sampling *keep-on-error*) para **garantizar** que la traza del fallo se conserve.
- **Declararlo:** si aun así no hay traza, el resultado es **inconcluso por telemetría**, no "el producto está bien".

---

## 6. Caso simulado: el timeout intermitente de transferencia

> **Este caso es ficticio y simulado.** No describe un incidente real. Los valores son ilustrativos y **no** son resultados de ejecución medidos.

**Síntoma.** El escenario "crear transferencia entre cuentas propias" de `nexo-web-banking-e2e` falla ~1 de cada 8 corridas con `timeout after 5000ms` en el paso final. En re-ejecución, pasa.

Aplicamos el método:

**Paso 0 — ¿evidencia completa?** El reporte de CI tiene `run_id`, `commit` y `outcome=TIMEOUT`. Los logs llevan `trace_id`. La traza existe (el contrato de staging usa *tail keep-on-error*, así que el fallo **se conserva**). → Hay evidencia; avanzamos.

**Clasificar.** El outcome es `TIMEOUT`, no `REJECTED`: no es un error de negocio esperado. Candidatos: producto (idempotencia/concurrencia), datos de prueba (contención), entorno (dependencia lenta).

**Buscar contexto.** Abrimos la traza del fallo por su `trace_id`. La lectura (ilustrativa): el span `transfer.create` está presente; su hijo `transfer.idempotency.check` es rápido; el hijo `ledger.reserve_funds` concentra casi todo el tiempo antes de que el cliente corte a los 5 s. → **Correlación**: el tiempo se fue en la dependencia ledger. (Correlación, no causa.)

**Validar datos/entorno.** Comparamos la referencia sintética de la corrida fallida con las de las corridas sanas: en la fallida, dos escenarios paralelos usaron **la misma cuenta ficticia de origen**. Hipótesis: contención de datos de prueba genera un bloqueo en el ledger.

**Control vs experimento.** Reproducimos dos veces con sampling forzado:
- *Experimento:* dos escenarios en paralelo sobre la **misma** cuenta ficticia → reaparece el `TIMEOUT` y el span `ledger.reserve_funds` largo.
- *Control:* dos escenarios sobre cuentas ficticias **distintas** → sin timeout.

**Concluir.** La evidencia (traza + referencia sintética + contraste control/experimento) respalda: **la causa es contención de datos de prueba** (dos corridas compiten por la misma cuenta), no un defecto de producto. → **Acción correctiva de datos de test** (aislar cuentas por corrida), no un defecto de `nexo-transfer-api`.

> **Qué NO afirmamos.** No afirmamos que el ledger "tiene un bug de performance": la lentitud fue **consecuencia** de la contención inducida por los datos, y desaparece en el control. Afirmar lo contrario sería confundir correlación con causa. Si el control **también** hubiera fallado, la hipótesis de datos caería y habría que investigar el ledger —o declarar inconcluso.

Este caso muestra el arco completo: **síntoma → correlación → hipótesis → contraste → conclusión clasificada**, con los límites dichos.

---

## 7. Criterios de evidencia y qué se puede afirmar

| Pregunta | Evidencia admisible | Límite que se declara |
|---|---|---|
| ¿La prueba alcanzó el servicio esperado? | Span/log correlacionado + metadato de ambiente y `commit`. | Ausencia de evidencia **no** prueba ausencia de ejecución si hay sampling/telemetría rota. |
| ¿Dónde cambió el comportamiento? | Trazas por dependencia + métricas de error/latencia + logs seguros. | Correlación **no** demuestra causalidad sin hipótesis y contraste. |
| ¿La señal es segura? | Schema/allowlist + prueba de redacción + revisión de acceso. | Un test **no** certifica cumplimiento legal total. |
| ¿La señal es sostenible? | Cardinalidad observada + retención + costo/volumen medidos. | Costos dependen del backend y tráfico **reales**. |
| ¿Qué acción sigue? | Clasificación + enlace a evidencia + owner + decisión documentada. | Una alerta/dashboard **no** cierra un incidente por sí sola. |

La columna derecha es la que distingue a un Senior: **cada afirmación viene con su límite**. Separá siempre *hecho citado* (la doc dice X), *resultado experimental* (en el repro controlado ocurrió Y), *inferencia* (por eso probablemente Z) y *opinión/decisión* (elegimos aislar datos).

---

## 8. Métricas de salud del diagnóstico

Se pueden medir —**tras establecer una línea de base**, sin inventar objetivos—:

- **% de fallas de test con evidencia correlacionable.** Mide si la observabilidad está haciendo su trabajo. Sube cuando reparás Paso 0.
- **Tiempo de diagnóstico**, medido desde una definición clara (p. ej. desde que el test se marca rojo hasta que se clasifica). Solo comparable contra tu propia base.
- **Tasa de señales que incumplen el contrato** (atributos prohibidos detectados, cardinalidad fuera de rango). Conecta con el [test de contrato](/blog/contrato-de-telemetria-privacidad-cardinalidad-gobernanza/).

> **Honestidad de métricas.** Los **objetivos** (SLO de diagnóstico, umbrales) se fijan **después** de medir una línea de base real. Publicar un "objetivo de 10 minutos" sin base es inventar. Aquí no hay números medidos: son métricas **propuestas**, no resultados.

**Qué aprendimos**

1. Un flaky es una **pregunta sin evidencia**, no un veredicto.
2. **Primero evidencia, después causa**: sin evidencia completa, el defecto es de observabilidad.
3. La correlación localiza *dónde*; la **causa** exige contraste **control vs experimento**.
4. "No está la traza" puede ser **sampling**, no ausencia de ejecución.
5. **Inconcluso** es un resultado profesional; un defecto mal clasificado, no.

**Enlaces internos**

- [Artículo 1 — Observabilidad para Quality Engineering (pilar)](/blog/observabilidad-quality-engineering-evidencia-explicable/)
- [Artículo 2 — El contrato de telemetría](/blog/contrato-de-telemetria-privacidad-cardinalidad-gobernanza/)

---

## 9. Anti-patrones

| # | Anti-patrón | Consecuencia | Detección | Alternativa |
|---|---|---|---|---|
| 1 | Re-ejecutar hasta el verde. | Oculta defectos reales de concurrencia/idempotencia. | Alta tasa de retries "exitosos". | Triar con evidencia; clasificar la causa. |
| 2 | Concluir causa desde correlación temporal. | Defecto mal atribuido. | "Pasó a la vez que X, entonces X lo causó". | Contraste control vs experimento. |
| 3 | Tratar "no hay traza" como "no se ejecutó". | Conclusión falsa. | Ignora la política de sampling. | Verificar sampling; declarar inconcluso. |
| 4 | Investigar la causa sin evidencia completa. | Adivinanza disfrazada de análisis. | Reporte sin `run_id`/`commit`/traza. | Paso 0: reparar observabilidad primero. |
| 5 | Forzar una clasificación para "cerrar" el ticket. | Credibilidad quemada; defecto reabre. | Defectos rechazados por dev como "ambiente". | Aceptar "inconcluso" como salida. |

---

## 10. Checklist

- [ ] Antes de investigar la causa, verifiqué **evidencia completa** (Paso 0).
- [ ] El reporte de CI tiene `run_id`, `commit`, `outcome` y (si el diseño lo permite) `trace_id`.
- [ ] La evidencia adjunta está **redactada** por allowlist; sin PII ni secretos.
- [ ] Antes de decir "no se ejecutó" por falta de traza, revisé la **política de sampling**.
- [ ] La clasificación se **comprobó** con traza/log, no se supuso.
- [ ] Distinguí **correlación** de **causa** y usé un **contraste** control/experimento.
- [ ] Cuando la evidencia no alcanzó, declaré **inconcluso** y abrí acción de observabilidad.
- [ ] Las métricas de diagnóstico se comparan contra una **línea de base**, sin objetivos inventados.

---

## 11. Fuentes consultadas (2026-07-09)

- OpenTelemetry — *Sampling* (head/tail, límites): https://opentelemetry.io/docs/concepts/sampling/
- OpenTelemetry — *Context Propagation*: https://opentelemetry.io/docs/concepts/context-propagation/
- OpenTelemetry — *Logs Data Model* (correlación log ↔ trace): https://opentelemetry.io/docs/specs/otel/logs/data-model/
- OpenTelemetry — *Trace Specification* (estable): https://opentelemetry.io/docs/specs/otel/trace/
- W3C — *Trace Context* (Recomendación): https://www.w3.org/TR/trace-context/

> **Aviso.** El caso de este artículo es **simulado y ficticio**. No representa un incidente real ni contiene métricas medidas. Material técnico-educativo, no asesoramiento legal ni de cumplimiento.

