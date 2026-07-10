---
title: "Matriz transversal: riesgo → control → prueba → evidencia → señal → runbook"
description: "El ciclo completo de la serie en una tabla: 22 riesgos de negocio con su control arquitectónico, la prueba que lo demuestra, la evidencia en CI, la señal en producción y el runbook. Una columna vacía es un riesgo sin controlar."
pubDate: 2026-07-10
tags: ['riesgo', 'evidencia', 'quality-engineering', 'gobernanza']
cluster: 'a00'
clusterTitle: "Mapa avanzado y priorización"
type: satelite
order: 3
readingLevel: "Transversal"
icon: 'command'
iconHue: 160
---

Fecha: **2026-07-10**. Dominio **ficticio**: Nexo Finanzas. Ningún número es una medición.

Este documento existe porque el prompt maestro pide un ciclo cerrado y los ocho capítulos lo recorren **por separado**. Acá está entero, en una tabla, para que se pueda auditar de una sola lectura.

<figure class="diagram">
  <img src="/blog/diagrams/matriz-riesgo-control-evidencia-1.svg" width="301" height="642" alt="Diagrama: matriz-riesgo-control-evidencia (1)" loading="lazy" decoding="async" />
</figure>

## Cómo se usa

1. **Un riesgo sin control es una preocupación.** Si la columna "control" está vacía, no tenés nada.
2. **Un control sin prueba es una intención.** Si la columna "prueba" está vacía, no sabés si el control funciona.
3. **Una prueba sin señal en producción es una esperanza.** Los tests no corren en producción. Si la columna "señal" está vacía, el día que el control falle nadie se va a enterar.
4. **Una señal sin runbook es una alarma que despierta a alguien que no sabe qué hacer.**

**La fila está completa cuando las seis columnas lo están.** Esa es la definición de "riesgo controlado" que esta serie sostiene.

---

## La matriz

Ordenada por prioridad. Los cinco primeros son los que definen el portfolio: si no los demostrás, no demostraste nada.

| # | Riesgo de negocio | Control arquitectónico | Prueba que lo demuestra | Evidencia en CI | Señal en producción | Runbook |
|---|---|---|---|---|---|---|
| **R-1** | Una transferencia se debita **dos veces** porque el cliente reintentó tras un timeout | Clave de idempotencia con reclamo atómico (`UNIQUE`, insert-first) | `concurrenciaMismaClaveProduceUnaEjecucion` (con repetición) | Reporte de test con `riskId: R-1` | Duplicados por clave de negocio `> 0` | [reconciliation-break](/blog/reconciliacion-por-operacion-y-por-totales/) |
| **R-2** | El dinero se **descuadra**: un débito sin su crédito | Ledger de doble entrada en **una** transacción local | `INV-1: suma de asientos por transferencia = 0` | Invariantes SQL ejecutadas en CI | Alerta sobre INV-1 en producción | reconciliation-break |
| **R-3** | La transferencia se guarda y el **evento nunca se publica**: pérdida silenciosa | Transactional outbox | `outboxSePublicaTrasReiniciarElPublisher` | Test de integración | **Antigüedad del pendiente más viejo** (no la cantidad) | outbox-backlog |
| **R-4** | Se publica un evento de una transferencia revertida: **hecho inventado** | Outbox (imposible por construcción) | `rollbackNoDejaEventoEnOutbox` | Test de componente | `INV-3` / `HUERFANO_EN_LEDGER` | reconciliation-break |
| **R-5** | El broker reentrega y el consumidor **acredita dos veces** | Inbox idempotente `UNIQUE(eventId)`, misma tx que el efecto | `entregaDuplicadaProduceUnSoloEfecto` (con repetición) | Test de integración | Duplicados por clave de negocio | replay-dead-letter-events |
| **R-6** | Un log o un response **filtra** un documento, un correo o un token | Contrato de telemetría; mensaje de log constante y campos declarados | `logsYResponsesNoContienenPatronesProhibidos` (**camino de error**) | El test corre en CI y reporta ubicación, nunca el valor | Hallazgos de PII por tipo, por semana | — |
| **R-7** | Se despliega un artefacto que **nadie construyó en este pipeline** | Firma keyless + gate con `--certificate-identity` + lectura de la provenance | `imagenFirmadaPorIdentidadNoAutorizadaEsRechazada` | Attestation + firma adjuntas al release | Firmas en Rekor de identidades fuera de la allowlist | desactivar-politica-admision |
| **R-8** | Una persona ficticia transfiere **desde una cuenta ajena** (BOLA) | Autorización por objeto en cada acceso | `transferirDesdeCuentaAjenaDevuelve403o404` | Test de seguridad en CI | Tasa de `403`/`404` por cuenta | — |
| **R-9** | Un mensaje **envenenado** bloquea la partición o se reintenta al infinito | Clasificación de errores + DLQ + backoff con jitter | `errorPermanenteVaADlqAlPrimerIntento` | Test de integración | Profundidad de la DLQ | replay-dead-letter-events |
| **R-10** | Un cambio de schema **rompe a un consumidor que no sabías que existía** | Compatibilidad **forward** + registro de consumidores + **métrica de consumo** | `consumidorViejoConSchemaNuevoFallaDeFormaDetectable` | **Gate bloqueante** de compatibilidad en el PR | Consumo por canal y versión de schema | — |
| **R-11** | Un cambio malo llega al **100 % de los usuarios** antes de que nadie mire una señal | Deployment ≠ release; canary con guardrails contra baseline | Smoke post-deploy sobre código desplegado y **apagado** | Hipótesis de release versionada | Guardrail **de negocio** (completitud), no solo CPU | disable-feature |
| **R-12** | El **rollback** se ejecuta por primera vez durante un incidente | Kill switch ejecutable por on-call, sin aprobación | Test del **camino degradado** de cada kill switch | `degraded_behavior` + `tested_in` en el registro de flags | Distribución de evaluaciones del flag | disable-feature (con **tabla de ensayos**) |
| **R-13** | Un flag de release se vuelve **permanente** y su combinatoria intestable | Registro de flags con `expires` obligatorio | `laConfiguracionRealDeProduccionPasaElJourney` | Job que abre ticket ante flags vencidos (**no rompe el build**) | Flags vencidos, en lista pública | — |
| **R-14** | El **reporte y la API** cuentan historias distintas y nadie puede explicar por qué | ADR de source of truth + tolerancias con razón escrita | Las cinco invariantes, nombradas por riesgo | Invariantes en CI contra el dataset sintético | `% reconciliado` **sin meta**: cualquier valor `< 100 %` es un ticket | reconciliation-break |
| **R-15** | El pipeline está **detenido** y todos los datos son perfectamente consistentes y viejos | Métrica de **freshness** por dataset | — (no se prueba: se monitorea) | SLO de freshness declarado | `now() - max(occurred_at)` **independiente** de la reconciliación | backfill |
| **R-16** | Un **backfill** duplica dinero porque el pipeline no es idempotente | `UPSERT` sobre clave natural, **restricción en el schema** (no `exists()` en la app) | `BackfillIdempotenteTest`: ejecutar dos veces, comparar | Test en CI | Silenciamiento de reconciliación **con TTL** | [backfill](/blog/tiempo-late-data-backfill-y-replay-idempotente/) |
| **R-17** | Una **decisión de riesgo** de hace tres meses no se puede reproducir ni explicar | `ruleSetVersion` + `featureSnapshot` congelado + `reasonCode` | `decisionHistoricaSeReproduceConSuSnapshot` | `backtestReport` **obligatorio** en el manifiesto del ruleset | **Decisiones sin `reasonCode` = 0** | rule-rollback |
| **R-18** | Un ruleset nuevo **duplica la carga** de revisión humana y se descubre el lunes | Shadow mode → canary → rollout | Backtest con **impacto operativo** en casos por cada 100.000 | Reporte de backtest en `evidence/` | `% enviado a revisión` como **guardrail bloqueante** | rule-rollback |
| **R-19** | Un umbral absoluto envejece con la inflación y la cola crece sin que nadie toque el código | Umbrales relativos donde es posible; si no, **fecha de recalibración** | — | — | **Distribución de `reasonCode` por semana** (la señal de drift más barata) | rule-rollback |
| **R-20** | Un test **flaky** consume horas de ingeniería que ninguna factura muestra | Espera por condición observable; prohibición de `sleep` | `grep -r 'Thread.sleep'` falla el build | `flakyHistory` viaja **con** cada resultado | Minutos desperdiciados por flakiness | — |
| **R-21** | Una **excepción de vulnerabilidad** aceptada nunca se revisa | Registro con owner y `expires_at`; VEX con justificación | `check-expired-exceptions.sh` | **Único gate bloqueante recomendado** del capítulo 02 | Excepciones vencidas `> 0` | — |
| **R-22** | Una **plataforma** rompe tres suites un martes con un cambio "menor" | En un componente de test, todo cambio que altere el resultado de un test existente es **MAJOR** | Suite de contrato del componente | `COMPATIBILITY.md` con `guarantees` y `not_guaranteed` | Fallos de plataforma vs de producto | deprecations/policy |

---

## Las seis invariantes, y qué fila las protege

Del [capstone](/blog/capstone-alcance-invariantes-y-evidencia/). Una invariante es una afirmación que debe ser verdadera **siempre**.

| Invariante | Filas que la protegen |
|---|---|
| 1. Una `Idempotency-Key` no crea dos transferencias | R-1 |
| 2. Débitos y créditos permanecen balanceados | R-2, R-14 |
| 3. Un evento se procesa como máximo una vez **a nivel de efecto de negocio** | R-3, R-4, R-5, R-9, R-16 |
| 4. Toda decisión de regla tiene versión y reason code | R-17, R-19 |
| 5. La reconciliación puede **explicar** las diferencias | R-14, R-15 |
| 6. Logs y trazas no contienen secretos ni PII | R-6 |

**Regla de alcance del capstone:** si una capacidad no protege una de estas seis invariantes ni una fila de la matriz, **no entra en el MVP**. Va al backlog con justificación.

---

## Las filas donde la señal de producción es la única defensa

Miralas de nuevo: **R-15 y R-19 no tienen prueba automatizada**, y no es un descuido.

- **R-15 (pipeline detenido).** Un pipeline que no corre pasa todas las validaciones de datos que sí corren. No hay test que detecte la ausencia de ejecución. La única defensa es una señal de freshness **independiente** de la reconciliación —porque si la reconciliación también está detenida, tampoco alerta.
- **R-19 (drift de umbral).** Nada cambió en el código. Ningún test puede fallar. La única defensa es observar la distribución de `reasonCode` a lo largo del tiempo.

Estas dos filas son la razón por la que la columna "señal en producción" existe en esta matriz. **Un Quality Engineer que solo piensa en tests deja estos dos riesgos completamente descubiertos**, y ambos son silenciosos.

---

## Las filas donde el control es *no hacer algo*

- **R-6:** el control más eficaz contra la fuga de datos es **no recolectar el dato**. Un dato que no existe no se filtra, no se retiene y no aparece en un incidente.
- **R-13:** el control contra la deuda de flags es **borrar el flag y el camino viejo**, no gestionarlos mejor.
- **R-20:** el control contra el costo del flakiness es **arreglar el flakiness**, no optimizar el pipeline que lo ejecuta.

Los tres son ejemplos del mismo principio: **la capacidad más barata de operar es la que no construiste.**

---

## Cómo se llena esta matriz en tu proyecto

1. Escribí los riesgos **en términos de lo que pierde el negocio**, no de lo que falta técnicamente.
   - ❌ *"No hay tests de idempotencia."* (Eso es el gap.)
   - ✅ *"Una transferencia podría debitarse dos veces si el cliente reintenta tras un timeout."*
2. Priorizá por `Impacto × Probabilidad`, no por `Impacto × Facilidad de arreglo`. La facilidad decide el **orden de ejecución**, no la prioridad.
3. La columna "prueba" **solo acepta un nombre de test que exista**. `"Hay tests"` no es una entrada válida.
4. La columna "señal" te va a estar vacía en la mitad de las filas la primera vez. **Ese es el hallazgo más valioso del ejercicio.**

Plantilla en blanco: `09-relevamiento-de-un-proyecto-existente/artefactos/matrices-de-diagnostico.md`.

---

## Fuentes

Cada fila se desarrolla en su capítulo, con sus fuentes primarias. Ver el [índice de la serie](/blog/coleccion/a00/) y la [verificación de fuentes](/blog/verificacion-de-fuentes-serie-avanzada/).

- [OWASP API Security Top 10 — API1:2023 Broken Object Level Authorization](https://owasp.org/API-Security/editions/2023/en/0xa1-broken-object-level-authorization/) — para R-8.
- [Google SRE — Service Level Objectives](https://sre.google/sre-book/service-level-objectives/) — para la columna de señales.
