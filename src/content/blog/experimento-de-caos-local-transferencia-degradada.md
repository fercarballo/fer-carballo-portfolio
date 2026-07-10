---
title: "Diseñar un experimento de caos local seguro: una transferencia con dependencia degradada"
description: "Tutorial de chaos engineering seguro en local: ficha de experimento, Toxiproxy en Docker Compose, observabilidad, tests deterministas, matriz de fallas, evidencia control/tratamiento, CI/CD y ADR-006 para Nexo Finanzas."
pubDate: 2026-07-09
tags: ["chaos-engineering", "fault-injection", "toxiproxy", "resilience-testing", "sdet", "docker-compose"]
cluster: "11"
clusterTitle: "Resiliencia y chaos engineering"
type: "satelite"
order: 3
icon: "refresh"
iconHue: 45
readingLevel: "Avanzado"
prerequisites: "Requiere Docker/Compose, HTTP/APIs, tests de integración y haber leído el pilar y el artículo de patrones."
---
> **Promesa del artículo.** Vas a poder diseñar y correr **un** experimento de resiliencia de punta a punta en tu máquina: una dependencia ficticia lenta, una política de timeout/retry/fallback bajo prueba, telemetría para interpretar, tests deterministas que verifican invariantes, evidencia que compara control vs. tratamiento, y un postmortem que produce una mejora. Todo **dentro de un entorno aislado**, con datos sintéticos y un blast radius mínimo.

> **Nota de honestidad intelectual.** Este artículo describe **cómo** correr el experimento; **no** reporta resultados de haberlo corrido. Donde digo "resultado esperado" es una **hipótesis a verificar**, no un dato. No hay screenshots inventados, ni métricas reales, ni cobertura declarada. *Nexo Finanzas* es ficticia; todos los datos son sintéticos. Los snippets son **ilustrativos**: validá sintaxis y versiones antes de usarlos.

> **Parte 3 de una colección de tres.** El [pilar](/blog/resiliencia-chaos-engineering-evidencia-y-gobernanza/) da el método científico y la gobernanza; el [artículo de patrones](/blog/patrones-de-resiliencia-con-trade-offs/) explica timeout/retry/idempotencia/circuit breaker. Este los pone a prueba.

---

## 1. El objetivo, en una frase

Queremos **evidencia** de que, cuando la validación de beneficiario está lenta, la `Transfer API` de *Nexo* (ficticia):

1. **no duplica** el movimiento (invariante 1),
2. **no informa éxito** con estado incierto (invariante 4),
3. **deja trazabilidad** (invariante 3),
4. y **le comunica al usuario** un estado honesto.

El siguiente diagrama muestra el journey y dónde inyectamos la falla (`Dependencia degradada`) y dónde vive la política que debe protegernos (`Timeout y politica de resiliencia`).

<figure class="diagram">
  <img src="/blog/diagrams/experimento-de-caos-local-transferencia-degradada-1.svg" alt="Diagrama: experimento-de-caos-local-transferencia-degradada (1)" loading="lazy" decoding="async" />
</figure>

> **Semántica del diagrama.** La falla se inyecta en `D` (la dependencia, controlada por nosotros). La protección vive en `E`. Todo lo que pasa se registra en `G` para poder **interpretar** el experimento (sin telemetría no hay experimento válido — ver [pilar §6](/blog/resiliencia-chaos-engineering-evidencia-y-gobernanza/)).

---

## 2. Prerrequisitos

- Docker y Docker Compose para levantar un entorno reproducible y aislado.
- Un **inyector de fallas de red** que controlás vos. Usaremos **Toxiproxy** (proxy TCP para simular latencia/cortes), de Shopify.
- La `nexo-transfer-api` (ficticia) con clave de idempotencia y estados explícitos (ver [pilar §9](/blog/resiliencia-chaos-engineering-evidencia-y-gobernanza/)).
- Haber leído los [patrones](/blog/patrones-de-resiliencia-con-trade-offs/): acá asumimos que entendés por qué el retry exige idempotencia.

> **Nota de versión (verificado 2026-07-09).** Toxiproxy está en su línea **2.x** (la última publicada que pude ver es **v2.12.0**, de 2025) y se distribuye como binario y como imagen `ghcr.io/shopify/toxiproxy` ([Shopify/toxiproxy — releases](https://github.com/Shopify/toxiproxy/releases), consultado 2026-07-09). Confirmá el tag exacto antes de fijarlo en tu Compose. Alternativas para inyección de fallas en Kubernetes son **Chaos Mesh** y **LitmusChaos**, ambos proyectos alojados por la **CNCF** ([Chaos Mesh en CNCF](https://www.cncf.io/projects/chaosmesh/), [Litmus en CNCF](https://www.cncf.io/projects/litmus/), consultado 2026-07-09); quedan fuera del alcance local de este tutorial pero son el camino natural al subir de nivel (ver [pilar §7](/blog/resiliencia-chaos-engineering-evidencia-y-gobernanza/)).

---

## 3. La ficha del experimento: planificar antes de inyectar

El experimento se **escribe antes** de tocar nada. Esta ficha (que vive en el repo, ver [artefactos/experimento-…](artefactos/experimento-RES-TRANSFER-DEPENDENCY-LATENCY-001.yaml)) obliga a declarar hipótesis, guardrails, condiciones de aborto y reversión.

```yaml
# Ilustrativo. Es un contrato de experimento, no configuracion de runtime.
experiment:
  id: RES-TRANSFER-DEPENDENCY-LATENCY-001
  environment: integration-isolated        # nunca "production" sin el regimen del pilar §6-7
  owner: quality-platform                   # persona con autoridad para aprobar/abortar
  business_invariant:
    - "A transfer is never duplicated for the same idempotency key"
    - "The user receives an explicit recoverable outcome"
  steady_state:
    - "authorized transfer outcomes are recorded"
    - "telemetry is available for the journey"
  hypothesis: "A bounded dependency delay preserves the declared invariants"
  injected_variable: "controlled latency in beneficiary validation"
  guardrails:
    - "synthetic data only"
    - "single isolated namespace or compose project"
    - "authorized concurrency cap"
  abort_conditions:
    - "telemetry pipeline unavailable"
    - "unexpected data integrity signal"
  rollback:
    - "remove fault injection"
    - "run reconciliation and cleanup"
  evidence:
    - "control and experiment traces"
    - "business outcome report"
    - "environment and revision metadata"
```

**Tres preguntas que la ficha te obliga a responder** (y que separan un experimento de un accidente):

- **¿Quién aprueba y quién aborta?** El `owner`. No es "el equipo": es una persona con autoridad. Sin owner nombrado, no se corre.
- **¿Cómo verificás el rollback?** No alcanza con "remover la inyección". Hay que **ejecutar la reconciliación** y confirmar, con datos, que el ledger sintético quedó consistente. Un rollback no ejecutado no es un rollback.
- **¿Por qué `environment: production` no es un cambio de texto?** Porque cambia el blast radius (usuarios reales), la autoridad requerida y la responsabilidad legal. Cambiar esa línea sin el régimen del [pilar §6–§7](/blog/resiliencia-chaos-engineering-evidencia-y-gobernanza/) es exactamente el anti-patrón que este material intenta prevenir.

---

## 4. El entorno: dependencia lenta con Toxiproxy en Compose

La idea: la `transfer-api` **no** habla directo con `beneficiary-validation`; habla a través de **Toxiproxy**, al que le pedimos que agregue latencia cuando queremos inyectar la falla.

```yaml
# docker-compose.yml — ILUSTRATIVO. Verificar tags/imagenes antes de usar.
services:
  transfer-api:
    build: ./nexo-transfer-api
    environment:
      # la API apunta al proxy, no al servicio real
      BENEFICIARY_VALIDATION_URL: "http://toxiproxy:8666"
    depends_on: [toxiproxy]

  beneficiary-validation:            # dependencia FICTICIA, propiedad del proyecto
    build: ./beneficiary-validation
    # datos sinteticos unicamente

  toxiproxy:
    image: ghcr.io/shopify/toxiproxy:2.12.0   # fijar el tag verificado
    ports: ["8474:8474"]             # API de control de Toxiproxy
```

Con el entorno arriba, se crea el proxy y se inyecta la latencia **como un paso explícito y reversible**:

```bash
# Ilustrativo. La sintaxis exacta depende de la version de toxiproxy-cli.
# 1) Crear el proxy que expone la dependencia ficticia
toxiproxy-cli create beneficiary \
  --listen 0.0.0.0:8666 \
  --upstream beneficiary-validation:9000

# 2) INYECTAR: agregar latencia ("toxic") -> esto es la variable de falla
toxiproxy-cli toxic add beneficiary \
  --type latency --attribute latency=9000 --attribute jitter=500

# 3) ROLLBACK: remover el toxic (parte de las abort_conditions/rollback)
toxiproxy-cli toxic remove beneficiary --toxicName latency_downstream
```

> **Qué prueba y qué no prueba este setup.** Prueba el comportamiento del sistema ante **una latencia de red controlada** hacia una dependencia. **No** reproduce todos los modos de falla (no es lo mismo que un 5xx, ni que un corte total, ni que una partición parcial). Por eso el experimento inyecta **una** variable por corrida (ver [pilar §5](/blog/resiliencia-chaos-engineering-evidencia-y-gobernanza/)) y la matriz de §7 enumera las demás como experimentos separados.

---

## 5. Observabilidad: sin señales, no hay conclusión

Antes de inyectar, verificá que el estado estable es observable. Durante el experimento, mirá **outcomes de negocio**, no solo CPU.

| Señal | Para qué sirve | Riesgo a cuidar |
|---|---|---|
| **Trazas** (control y tratamiento) | Ver el camino real: timeout, reintentos, fallback | Cardinalidad: no metas la `idempotency-key` cruda como *tag* de alta cardinalidad |
| **Métricas de negocio** | Tasa de outcomes recuperables, duplicados detectados | Definí la métrica **antes**; no inventes una meta |
| **Estado del circuit breaker** | Saber si abrió y cuándo | Correlacionar con el momento de inyección |
| **Retries por operación** | Detectar retry storm | Si sube con la degradación, tenés un problema (ver [patrones §4](/blog/patrones-de-resiliencia-con-trade-offs/)) |
| **Logs redactados** | Reconstruir qué pasó | **Nunca** PAN completo, credenciales ni PII sin sanear (ver nota de cumplimiento del [pilar §4](/blog/resiliencia-chaos-engineering-evidencia-y-gobernanza/)) |

> **Por qué la CPU sola no es criterio de éxito.** El pod puede estar al 20 % de CPU, "vivo" según su liveness probe, y aun así haber **duplicado** una transferencia o haberla dejado en estado opaco. El criterio de éxito es de **negocio** (invariantes), no de infraestructura. La documentación de Kubernetes es explícita en que las probes no sustituyen la resiliencia de la aplicación ([Kubernetes — Probes](https://kubernetes.io/docs/concepts/workloads/pods/probes/), consultado 2026-07-09).

---

## 6. Tests deterministas vs. experimento de sistema

**No confundas las dos capas.** Un test determinista verifica la **política** con una dependencia simulada; el experimento verifica el **sistema** con una dependencia realmente degradada. Necesitás ambos.

Este test de integración (ilustrativo) simula la lentitud y verifica invariantes —resultado, cantidad de invocaciones y **ausencia de duplicados**—, no solo el HTTP status:

```java
// Ilustrativo. Test DETERMINISTA de la politica (no es el experimento de sistema).
given(validationService.delaysFor("beneficiary-demo"));           // dependencia simulada

TransferResult result = api.createTransfer(commandWithFixedIdempotencyKey());

assertThat(result.status()).isEqualTo(PENDING_REVIEW);            // (a) estado honesto, no "exito"
assertThat(ledger.countByIdempotencyKey(command.key())).isEqualTo(1);  // (b) NO se duplico
assertThat(validationService.callsFor(command.safeReference()))
    .isLessThanOrEqualTo(configuredAttemptLimit());              // (c) no hubo retry storm
assertThat(evidence.traceExistsFor(command.safeReference())).isTrue();  // (d) hay trazabilidad
```

- **(b)** es el corazón: comprueba el invariante 1 contando movimientos por clave, no confiando en el status.
- **(c)** ata el test al [patrón de retry](/blog/patrones-de-resiliencia-con-trade-offs/): verifica que no reintentamos sin límite.

> **Qué es cada capa (y qué no prueba).** El test de arriba es **determinista y rápido**: ideal para correr en cada PR. Pero **simula** la lentitud; no prueba que el sistema real, con Toxiproxy, colas y concurrencia, preserve los invariantes bajo una degradación auténtica. **No declares "resiliencia probada" con solo este test.** El experimento de sistema (§4) cubre lo que el test no puede; el test cubre lo que el experimento no debería re-verificar en cada corrida.

---

## 7. Matriz de fallas y señales esperadas

Cada fila es un experimento independiente (una variable por corrida). Los valores de "resultado esperado" son **hipótesis a verificar**, no datos.

| Variable de falla | Riesgo | Estado estable | Señal de negocio | Señal técnica | Guardrail | Abort condition | Limpieza | Seguimiento |
|---|---|---|---|---|---|---|---|---|
| **Latencia acotada** en validación | Duplicado / estado opaco | Outcomes recuperables registrados | 0 duplicados; outcome `pending_review` | timeout dispara; retries ≤ límite | Datos sintéticos; concurrencia tope | Telemetría caída; señal de integridad | Remover toxic; reconciliar ledger | ADR/runbook + test de regresión |
| **5xx controlado** de validación | Tratar como válido lo no validado | ídem | 0 transferencias con beneficiario no validado | circuit breaker abre; fallback activo | Solo servicio propio | 5xx fuera del scope esperado | Remover inyección; reconciliar | Ajustar clasificación de errores |
| **Cola atrasada** (procesamiento diferido) | Informar éxito antes de tiempo | Trabajos encolados y visibles | Usuario ve "en proceso", no "listo" | *lag* de cola medido; sin *acks* falsos | Cola aislada del proyecto | *lag* supera umbral de aborto | Drenar/limpiar cola sintética | Revisar semántica de estados |
| **Pool saturado** (agotamiento de conexiones) | Cascada por espera | Servicio responde o rechaza limpio | Rechazos controlados, no cuelgues | bulkhead rechaza; sin threads bloqueados | Tope de concurrencia autorizado | Efecto sobre servicios vecinos | Liberar recursos; verificar límites | Ajustar bulkhead/timeout |

> **Regla de la matriz.** Ninguna fila sugiere impacto sobre sistemas no autorizados. Toda "señal de negocio" se **mide**, no se asume. Si no podés medir una señal, no podés concluir sobre esa fila.

---

## 8. Evidencia: control vs. tratamiento

La evidencia mínima para que el experimento sea **reproducible y creíble** compara la corrida sin falla (control) con la corrida con falla (tratamiento), y preserva metadatos.

| Pregunta | Evidencia necesaria | Decisión que habilita | Límite explícito |
|---|---|---|---|
| ¿El estado estable estaba presente? | SLI/telemetría pre-experimento, checks de datos, versión de entorno | Decidir si el experimento es válido | No prueba ausencia total de defectos |
| ¿La falla se inyectó como se planeó? | Registro del inyector (Toxiproxy) + trazas de la dependencia | No concluir sobre una variable que no ocurrió | No equivale a una falla real de todos los tipos |
| ¿Se preservó la regla de negocio? | Outcome de transferencia, conteo por idempotency-key, auditoría, reconciliación sintética | Priorizar defecto o aprobar hipótesis acotada | Un solo journey no cubre todos los flujos |
| ¿El blast radius se mantuvo? | Scope de entorno, concurrencia, métricas de vecinos, stop conditions | Mejorar guardrails o ampliar con aprobación | No justifica subir de ambiente automáticamente |
| ¿Qué se aprendió? | Conclusión, limitaciones, ADR/runbook, owner, test de seguimiento | Convertir evidencia en mejora | No ocultar resultado inconcluso o negativo |

**Metadatos mínimos a guardar con cada corrida:** id del experimento, commit/revisión del código y de la ficha, imagen/tag de cada servicio, semilla de datos sintéticos, ventana temporal, y el `owner` que aprobó. Sin esto, "lo corrimos y anduvo" no es reproducible.

---

## 9. En CI/CD sin convertir cada PR en un incidente

*Gates* proporcionados al riesgo. No todo corre en cada PR.

<figure class="diagram">
  <img src="/blog/diagrams/experimento-de-caos-local-transferencia-degradada-2.svg" alt="Diagrama: experimento-de-caos-local-transferencia-degradada (2)" loading="lazy" decoding="async" />
</figure>

- **En cada PR:** solo los **tests deterministas** de §6. Son rápidos, estables y no dependen de infraestructura frágil. Un PR **no** debe disparar un experimento de sistema completo.
- **Programado (nightly/semanal):** el **experimento con Toxiproxy** en integración aislada, con su ficha, evidencia y limpieza.
- **Game day periódico:** escenarios mayores, con roles, owner y comunicación (ver [pilar §7](/blog/resiliencia-chaos-engineering-evidencia-y-gobernanza/)).

> **Decisión de diseño.** Meter un experimento de caos como gate bloqueante de cada PR es un **anti-patrón**: introduce *flakiness* de infraestructura en el camino crítico de entrega y entrena al equipo a ignorar el rojo. El gate del PR verifica **política** (determinista); el experimento de **sistema** vive fuera del PR.

---

## 10. Resultados, decisiones y postmortem de aprendizaje

Cuando el experimento termina, se documenta —**incluso si refuta la hipótesis**—:

1. **Control vs. tratamiento:** qué se observó en cada uno.
2. **Conclusión:** ¿se sostuvieron los invariantes? Si no, **cuál** falló y con qué evidencia.
3. **Limitaciones:** una latencia no es todos los modos de falla; un journey no es todos los flujos; integración aislada no es producción.
4. **Remediación:** el cambio de diseño concreto (p. ej., "el timeout era mayor que el budget del journey; se ajustó a X, derivado del p99 medido").
5. **Prueba de seguimiento:** un test determinista nuevo que **fija** el aprendizaje para que no regrese.

> **Postmortem sin culpabilización.** Si el experimento reveló un duplicado, el output no es "quién escribió ese código". Es: ¿qué en el **diseño** lo permitió?, ¿qué **guardrail** faltaba?, ¿qué dice el **runbook** ahora? El objetivo es un sistema mejor, no un culpable. (Es una postura de cultura, no una afirmación sobre ninguna organización real.)

Todo esto se ancla en dos artefactos de gobernanza:

- ****ADR-006 — Experimentación de resiliencia con blast radius mínimo**.**
- Un **runbook** del experimento: cómo levantar el entorno, cómo inyectar, cómo abortar, cómo reconciliar y a quién avisar.

---

## 11. Qué aprendimos y próximos pasos

- Un experimento de resiliencia se puede correr **entero en local**, con datos sintéticos y blast radius mínimo.
- El **test determinista** y el **experimento de sistema** son capas distintas y complementarias; ninguna reemplaza a la otra.
- La **evidencia** compara control y tratamiento y admite resultados negativos o inconclusos.
- Los *gates* de CI se dimensionan al riesgo: determinista en PR, experimento fuera del PR.
- El experimento cierra con **remediación + prueba de seguimiento + postmortem**, no con "cerramos el ticket".

**Seguí / repasá:**

- **[El pilar](/blog/resiliencia-chaos-engineering-evidencia-y-gobernanza/)** — método científico, gobernanza y madurez.
- **[Patrones de resiliencia con trade-offs](/blog/patrones-de-resiliencia-con-trade-offs/)** — el detalle de timeout, retry, idempotencia, circuit breaker y bulkhead que este experimento pone a prueba.

---

## 12. Checklist final (aplicable)

- [ ] Escribí la **ficha del experimento** (hipótesis, guardrails, abort, rollback) **antes** de inyectar.
- [ ] El entorno es **aislado**, con **datos sintéticos** y **una** variable de falla por corrida.
- [ ] Verifiqué el **estado estable** y la **telemetría** antes de empezar (si no hay telemetría, no corro).
- [ ] Tengo **tests deterministas** que verifican invariantes (no solo HTTP status) y un **experimento de sistema** separado.
- [ ] La evidencia compara **control vs. tratamiento** y guarda **metadatos** para reproducir.
- [ ] El **rollback** (remover inyección + **reconciliar** datos sintéticos) se ejecutó y verifiqué el estado final.
- [ ] Los *gates* de CI son **proporcionados**: determinista en PR, experimento programado fuera del PR.
- [ ] Cerré con **remediación + prueba de seguimiento + postmortem** sin culpabilización, y actualicé **ADR/runbook**.

---

## 13. Fuentes (consultadas 2026-07-09)

- Shopify — [Toxiproxy (releases y documentación)](https://github.com/Shopify/toxiproxy/releases). Línea 2.x; imagen `ghcr.io/shopify/toxiproxy`.
- CNCF — [Chaos Mesh](https://www.cncf.io/projects/chaosmesh/), [Litmus](https://www.cncf.io/projects/litmus/) *(proyectos alojados por CNCF; verificar nivel de madurez vigente)*.
- Kubernetes — [Probes](https://kubernetes.io/docs/concepts/workloads/pods/probes/).
- Google, *SRE Book* — [Service Level Objectives](https://sre.google/sre-book/service-level-objectives/), [Addressing Cascading Failures](https://sre.google/sre-book/addressing-cascading-failures/).
- *Principles of Chaos Engineering* — [principlesofchaos.org](https://principlesofchaos.org/).
- Docker — [Compose](https://docs.docker.com/compose/).

> **Estado de verificación.** URLs consultadas el 2026-07-09. Toxiproxy: confirmada la línea **2.x** (última vista **v2.12.0**, 2025); fijá el tag exacto en tu Compose. Ningún snippet fue ejecutado para este artículo: los `docker-compose.yml`, comandos de `toxiproxy-cli` y tests son **ilustrativos** y deben validarse contra las versiones que uses. No se reportan resultados de ejecución, métricas ni cobertura.

