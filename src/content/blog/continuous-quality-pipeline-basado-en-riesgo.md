---
title: "Continuous Quality: pipeline de evidencia proporcional al riesgo"
description: "Diseñá un pipeline de Continuous Quality para un sistema financiero: feedback proporcional al riesgo, evidencia trazable y decisiones de release honestas."
pubDate: 2026-07-09
tags: ["continuous-quality", "ci-cd", "gitlab-ci", "quality-engineering", "release-engineering"]
cluster: "04"
clusterTitle: "CI/CD y continuous quality"
type: "pilar"
order: 1
icon: "infinity"
iconHue: 200
readingLevel: "Intermedio–Avanzado"
prerequisites: "(QA/SDET, DevOps, EM). Requiere Git, Docker y nociones de testing."
---
> **Advertencia de uso.** Ningún fragmento de YAML, Groovy o shell de este artículo es directamente productivo. Todos son ilustrativos: debés adaptar permisos, runners, retención, versionado, imágenes fijadas por *digest* y contexto organizacional antes de usarlos. Verifiqué la sintaxis contra la documentación oficial vigente el **2026-07-09**, pero las plataformas cambian: revalidá contra tu versión.

## Resumen ejecutivo

- Un *pipeline verde* no prueba que el producto sea seguro, cumpla regulaciones ni esté listo para todos los usuarios. Prueba que **los controles que decidiste ejecutar** pasaron, en el entorno que definiste, con la evidencia que conservaste.
- **Continuous Quality** no es "correr todos los tests en cada cambio": es diseñar un flujo de evidencia rápida, trazable y **proporcional al riesgo**, donde cada control corre en el momento y el entorno que mejor equilibran costo, confianza y velocidad de aprendizaje.
- El pipeline es un **producto interno**: tiene usuarios (quien espera feedback), SLOs (tiempo de feedback), seguridad, costo de mantenimiento, *ownership* y documentación. GitLab CI y Jenkins son mecanismos de ejecución, no la estrategia.
- Separá con precisión: **CI**, **entrega continua**, **despliegue continuo**, **quality gate** y **release decision**. Confundirlos produce pipelines que "aprueban" cosas que ningún automatismo puede garantizar.
- La evidencia (reportes, digests, provenance, decisión de release) importa tanto como el resultado: sin trazabilidad, un rojo o un verde no son investigables.
- El post-deploy es parte del pipeline: un release no termina en "deploy ok" sino en **señal de impacto** (SLI/SLO, checks sintéticos) y un camino de rollback/mitigación.
- Empezá chico y honesto. La madurez (SBOM, provenance, entornos efímeros, performance programada) se gana por necesidad demostrada, no por moda.

---

## 1. El problema: un check verde que no diagnostica nada

En Nexo Finanzas (fintech ficticia; **todos los datos son sintéticos**) llega un cambio pequeño a la API de transferencias: agregar un campo opcional `reference` a la orden de transferencia. Es "una línea". El equipo lo mergea porque *el pipeline está verde*.

Tres días después, un cliente reporta que las transferencias con `reference` muy largo se rechazan con un `500` en vez de un `400`. ¿El pipeline mintió? No: **nunca se le pidió** que verificara ese caso. El check verde significaba "compila y pasan los unit tests que existen", no "el journey de transferencia es correcto y seguro".

Ese es el síntoma central que ataca este artículo: pipelines que producen **un semáforo pero ningún diagnóstico**. El objetivo de Continuous Quality es lo contrario: que cada rojo diga *qué falló, con qué evidencia y quién decide*, y que cada verde declare *qué alcance cubrió y qué quedó fuera*.

> **Distinción (opinión fundamentada).** "Cobertura de tests" mide líneas ejecutadas; "cobertura de riesgo" mide si los riesgos que importan tienen evidencia. Un proyecto con 90 % de cobertura de líneas puede tener 0 % de cobertura del riesgo "una transferencia se ejecuta dos veces".

---

## 2. Definiciones operativas para no mezclar decisiones

Estas definiciones son **decisiones de vocabulario** de este artículo, alineadas con el uso estándar de la industria. Las mantengo separadas a propósito.

| Término | Qué es | Quién lo posee | Evidencia que necesita |
|---|---|---|---|
| **Integración continua (CI)** | Integrar y verificar cambios pequeños y frecuentes de forma automática. | Equipo de desarrollo + QE | Build reproducible, tests rápidos, reportes |
| **Entrega continua (Continuous Delivery)** | Mantener el software **siempre desplegable**; el deploy a producción es una decisión humana. | Equipo + release owner | Artefacto versionado listo, gates verdes |
| **Despliegue continuo (Continuous Deployment)** | Cada cambio que pasa los controles **se despliega automáticamente** a producción, sin paso humano. | Equipo con gates muy fuertes | Todo lo anterior + observabilidad y rollback automáticos |
| **Quality gate (gate técnico)** | Regla automatizable que bloquea o permite avanzar según controles requeridos por la clase de cambio. | QE / plataforma | Estado de controles requeridos, política versionada |
| **Release decision** | Decisión (a veces humana) de liberar a usuarios reales, considerando evidencia técnica **y** contexto no automatizable (negocio, riesgo, timing). | Release owner | Gates + contexto + registro de excepción si aplica |

Dos consecuencias prácticas:

1. **Entrega continua ≠ despliegue continuo.** Un banco puede querer entrega continua (siempre desplegable) pero *no* despliegue continuo automático a producción para flujos de dinero. Confundirlos lleva a automatizar decisiones que alguien debe firmar.
2. **Gate ≠ release decision ≠ aprobación de negocio.** El gate dice "los controles requeridos pasaron". La release decision dice "decidimos liberar". La aprobación de negocio o de cumplimiento puede ser un control externo *no* automatizable. Un pipeline no puede firmar por un cumplimiento regulatorio.

> Fuentes para anclar estos términos: la [documentación de GitLab CI/CD](https://docs.gitlab.com/ci/) (consultada 2026-07-09) distingue pipelines, environments y aprobaciones; el [SRE Book de Google, capítulo *Service Level Objectives*](https://sre.google/sre-book/service-level-objectives/) fundamenta por qué medimos con SLIs/SLOs y percentiles, no promedios.

---

## 3. Diseñar el flujo desde el riesgo y el tiempo de feedback

La pregunta correcta no es "¿qué tests corro?" sino "**¿qué evidencia necesito, con qué velocidad, para cada clase de cambio?**".

"Todo en cada commit" es caro y suele **degradar la señal**: pipelines de 40 minutos empujan a la gente a ignorar rojos, reintentar hasta el verde y saltarse revisiones. El costo no es solo tiempo de máquina; es la **confianza** en el semáforo.

La herramienta central es una **matriz de decisión** que asigna cada control al momento y entorno donde su relación costo/confianza es mejor. Ejemplo (plantilla; los presupuestos de tiempo son objetivos a validar con mediciones reales, no resultados medidos):

| Clase de cambio | Riesgo dominante | Control | Etapa | Presupuesto (objetivo) | Evidencia | Fallback si falla |
|---|---|---|---|---|---|---|
| Documentación | Enlaces rotos | lint + link-check | PR | < 2 min | log de lint | corregir doc |
| Lógica de dominio | Regresión funcional | unit + component | PR | < 5 min | JUnit | arreglar y re-push |
| Contrato API | Ruptura de consumidores | contract test | PR | < 8 min | reporte contrato | bloquear merge |
| Flujo de transferencia | Doble ejecución / autorización | smoke integración (efímero) | rama default | < 15 min | JUnit failsafe | bloquear release |
| Regresión amplia | Efectos cruzados | suite completa | nightly | sin límite estricto | reporte agregado | crear ticket, no bloquear PR |
| Performance | Degradación de latencia | prueba de carga | scheduled | ventana dedicada | baseline + hipótesis | revisar antes de release grande |

La lógica: **el PR paga solo controles rápidos y de alta señal**; los controles caros y de señal difusa (regresión total, performance, matriz mobile) se mueven a `nightly`/`scheduled` con presupuesto explícito. Esto es una **decisión de diseño**, no una ley: si un flujo es crítico y barato de verificar, subilo al PR.

---

## 4. Arquitectura de referencia para Nexo Finanzas

El siguiente diagrama es el **flujo de Continuous Quality**. Distingo controles **bloqueantes** (detienen el avance) de **informativos** (registran evidencia pero no bloquean), y muestro cómo cada fase alimenta un repositorio de evidencia.

<figure class="diagram">
  <img src="/blog/diagrams/continuous-quality-pipeline-basado-en-riesgo-1.svg" alt="Diagrama: continuous-quality-pipeline-basado-en-riesgo (1)" loading="lazy" decoding="async" />
</figure>

**Lectura del diagrama:**

- `BLD`, `CTR`, `SMK` y `GATE` son **bloqueantes** para la clase "flujo crítico de transferencia": si fallan, el cambio no avanza a `DEP`.
- `OBS` (revisión de SLI/telemetría) es **posterior al deploy**: no bloquea el merge, pero es parte del release —sin señal de impacto, el release no está "terminado".
- Cada flecha hacia `ART` significa "esta fase **deposita evidencia sanitizada**" (reportes JUnit, digests, decisión de release). La evidencia no es un subproducto: es lo que hace investigable un incidente.

Qué corre **en el PR / integración** (rápido, alta señal): build Java, unit/component, API/contrato, empaquetado del artefacto, smoke crítico en entorno efímero, análisis de seguridad rápido (dependencias/secretos).

Qué se difiere a **nightly/scheduled**: regresión amplia, matriz mobile por dispositivo, performance/carga, escaneos profundos (imagen completa, SAST extenso). Esto no es "menos importante": es **más caro y de señal más difusa**, y merece su propio presupuesto y *ownership*.

> El detalle de **qué controla el gate y cómo se auditan las excepciones** lo desarrollo en el satélite [Quality gates auditables: policy-as-code, excepciones y quién decide el release](/blog/quality-gates-auditables-policy-as-code/).

---

## 5. GitLab CI como fuente de verdad del ejemplo

Elijo **GitLab CI/CD** como pipeline principal del caso porque integra reportes, artifacts y environments en un solo modelo. Es una decisión del ejemplo, no una recomendación universal.

```yaml
# .gitlab-ci.yml  (ILUSTRATIVO — validar contra tu versión de GitLab)
workflow:
  rules:
    - if: '$CI_PIPELINE_SOURCE == "merge_request_event"'
    - if: '$CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH'

stages: [verify, package, integration, decision]

unit_and_api:
  stage: verify
  # Pinnear por digest en produccion, no solo por tag:
  image: eclipse-temurin:21-jdk@sha256:<DIGEST>
  script:
    - ./mvnw -B test -Dgroups="unit,api"
  artifacts:
    when: always            # conservar evidencia AUNQUE falle
    reports:
      junit: target/surefire-reports/TEST-*.xml
    paths:
      - target/surefire-reports/

contract_verify:
  stage: verify
  needs: [unit_and_api]
  script:
    - ./mvnw -B verify -Pcontracts
  artifacts:
    when: always
    paths:
      - target/contract-reports/

integration_smoke:
  stage: integration
  rules:
    - if: '$CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH'
  # Este job SOLO se crea en la rama default. Otros jobs que lo
  # referencien en `needs` deben marcarlo `optional` (ver abajo).
  script:
    - ./scripts/start-ephemeral-environment.sh
    - ./mvnw -B verify -Psmoke
  artifacts:
    when: always
    reports:
      junit: target/failsafe-reports/TEST-*.xml

quality_decision:
  stage: decision
  needs:
    - unit_and_api
    - contract_verify
    - job: integration_smoke
      optional: true          # evita error cuando `rules` no crea el job
  script:
    - ./scripts/evaluate-quality-evidence.sh
```

**Puntos que hay que entender por bloque:**

- **`workflow.rules`** evita el clásico *pipeline duplicado*: sin él, un push a una rama con MR abierto puede disparar dos pipelines (branch + merge_request). Se define **un disparador por commit**.
- **`stages` vs `needs` (DAG).** `stages` es orden secuencial; `needs` crea un grafo de dependencias que permite paralelismo real. Regla clave: **si un job aparece en `needs` pero `rules` no lo creó, el pipeline falla**, salvo que lo marques `optional: true`. Ese es exactamente el caso de `integration_smoke`, que solo existe en la rama default. Verificá el mecanismo vigente en la [referencia de `needs` de GitLab](https://docs.gitlab.com/ci/yaml/#needs) (consultada 2026-07-09).
- **`artifacts` vs `cache` (¡no son lo mismo!).** *Artifacts* son salidas que querés **conservar y ver** (reportes, binarios): sobreviven al job y se muestran en la UI. *Cache* es una optimización para **reusar dependencias** entre jobs; es descartable y no es evidencia. Confundirlos hace que pierdas los reportes que explican un fallo. Ver [artifacts](https://docs.gitlab.com/ci/jobs/job_artifacts/) y [caching](https://docs.gitlab.com/ci/caching/).
- **`artifacts:reports:junit`** hace que GitLab muestre los tests en el MR. Requisitos vigentes: XML JUnit, **< 30 MB por archivo** y **< 100 MB por job** (ver [tipos de reportes](https://docs.gitlab.com/ci/yaml/artifacts_reports/), consultado 2026-07-09).
- **`when: always`** en artifacts es deliberado: si no conservás la evidencia **cuando el job falla**, perdés justo el reporte que necesitás para diagnosticar.
- **Pinnear imágenes por `@sha256:<digest>`**, no solo por tag: `eclipse-temurin:21-jdk` es un tag mutable; el digest es inmutable. (Temurin 21 sigue siendo LTS soportado en 2026; 25 es el LTS más nuevo —ver [releases de Adoptium](https://adoptium.net/temurin/releases). Elegí versión por soporte, no por novedad.)
- **`evaluate-quality-evidence.sh`** no debe ser una caja negra. Un script de decisión que "a veces pone verde" sin explicar la política es un anti-patrón. La política debe estar **versionada y legible** (lo veremos en el satélite de gates).

Sobre **retención y acceso**: los artifacts tienen expiración (`expire_in`) y permisos. La evidencia sensible (aunque sanitizada) debe tener retención definida y acceso mínimo. No guardes secretos ni PII en reportes.

---

## 6. Jenkins: alternativa, no autoridad duplicada

Muchas organizaciones tienen Jenkins heredado. La regla de oro es **una sola fuente de verdad por commit**: si GitLab y Jenkins evalúan el mismo commit y llegan a veredictos distintos, nadie sabe qué es cierto.

Este es un tema con suficiente profundidad propia; lo desarrollo entero —incluyendo el `Jenkinsfile` mínimo, cómo evitar despliegues simultáneos y patrones de migración— en el satélite [GitLab CI y Jenkins sin autoridad duplicada](/blog/gitlab-ci-jenkins-fuente-de-verdad-por-commit/). Acá solo dejo la regla: **decidí y documentá cuál sistema decide el release** para cada repositorio; el otro, si existe, es informativo o está en migración.

---

## 7. Entornos y datos: reproducibilidad antes de sofisticación

Orden de complejidad recomendado (subí un escalón solo cuando el anterior no alcanza):

1. **Local / Docker Compose**: levantar dependencias (base de datos, broker) de forma declarativa para desarrollo y algunos tests. Ver [Docker Compose](https://docs.docker.com/compose/).
2. **Testcontainers**: dependencias reales, efímeras, gestionadas desde el propio test (arranca y limpia el contenedor). Ideal para integración determinista sin infra compartida. Ver [Testcontainers](https://testcontainers.com/).
3. **Entorno efímero de integración**: se crea por pipeline, se destruye al terminar. Nombres únicos por ejecución para evitar colisiones.
4. **Kubernetes**: **solo** cuando la topología distribuida lo exija (varios servicios, red realista). No lo uses por moda: un proyecto que valida su hipótesis con Compose o Testcontainers no necesita un cluster. Ver [Kubernetes Deployments](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/) para entender la abstracción y sus límites.

Reglas de datos: **seeds sintéticos**, limpieza garantizada (idealmente el entorno es descartable), **nombres únicos** por ejecución, y **separación estricta de ambientes**. Nunca uses datos reales de clientes ni copias de producción sin anonimizar.

---

## 8. Post-deploy: de "deploy ok" a señal de impacto

El segundo diagrama muestra la **decisión de release y la evidencia** como una secuencia, incluyendo lo que pasa *después* del deploy.

<figure class="diagram">
  <img src="/blog/diagrams/continuous-quality-pipeline-basado-en-riesgo-2.svg" alt="Diagrama: continuous-quality-pipeline-basado-en-riesgo (2)" loading="lazy" decoding="async" />
</figure>

**Lectura:** el desarrollador empuja un cambio; CI publica **reportes y provenance** en el repositorio de evidencia; la evidencia le muestra al *release owner* el estado de los controles requeridos; el owner **despliega o registra una excepción** (no hay "deploy silencioso"); el entorno devuelve **telemetría y checks sintéticos**; y el bucle se cierra con feedback trazable hacia quien hizo el cambio.

La clave es que el pipeline **no termina en el deploy**. Después necesitás:

- **SLIs del journey**: tasa de éxito de transferencias, latencia p95, tasa de errores 5xx. Definilos como en el [SRE Book](https://sre.google/sre-book/service-level-objectives/): con percentiles, ventana y objetivo (SLO).
- **Checks sintéticos**: un journey mínimo ejecutado periódicamente contra el ambiente para detectar caídas antes que el usuario.
- **Correlación de evidencia**: logs, trazas y métricas conectados. [OpenTelemetry](https://opentelemetry.io/docs/) (consultado 2026-07-09) es el estándar abierto para instrumentar y correlacionar señales; permite unir "este release" con "esta traza".
- **Rollback / mitigación contextual**: canary, feature flags o rollback según el riesgo. Para dinero, muchas veces se prefiere *feature flag* + rollback rápido antes que despliegue continuo puro.

> **Separá tres señales que suelen confundirse:** (1) resultado de *test* (¿el control pasó?), (2) *salud del producto* (¿los usuarios pueden operar?), (3) *alerta operativa* (¿hay que despertar a alguien?). Un test verde no implica producto sano; una alerta no siempre implica un bug de código.

---

## 9. El pipeline es un producto: métricas que mejoran el sistema (no miden personas)

Cada métrica necesita **fórmula, ventana, fuente, sesgo, owner y acción** cuando se degrada. No inventes números: si no tenés datos, publicá la plantilla vacía.

| Métrica | Fórmula (resumen) | Ventana | Sesgo a vigilar | Acción si se degrada |
|---|---|---|---|---|
| Tiempo de feedback p50/p95 | tiempo push→evidencia relevante, por clase de control | 30 días | mezclar build rápido con nightly falsea el p95 | dividir pipeline, paralelizar con `needs` |
| Estabilidad de pipeline | (fallos confirmados **no** relacionados al cambio, tras triage) / ejecuciones | 30 días | contar bugs de producto como "inestabilidad" | atacar flakiness/entorno, no el test |
| Cobertura de controles por riesgo | clases de riesgo con evidencia requerida / total de clases | por release | tratarlo como "% de calidad" | agregar control a la clase descubierta |
| Tiempo de recuperación de pipeline | incidente de runner/entorno → flujo confiable | por incidente | depende de observabilidad disponible | runbook + monitoreo del propio CI |
| Tasa/antigüedad de excepciones | excepciones activas por clase, con expiración | continua | usarlas para ocultar deuda | revisar y vencer excepciones |
| Integridad de evidencia | releases con commit+artefacto+entorno+reportes vinculables / total | por release | límites de acceso/retención | cerrar el eslabón faltante |

> **Regla ética (opinión firme).** Estas métricas miden el **sistema**, no a las personas. Medir "deploys por dev" o "tests por persona" incentiva gaming y castiga la honestidad. El objetivo es acortar el aprendizaje del equipo, no rankear individuos.

---

## 10. Anti-patrones (síntoma → causa → costo → alternativa)

1. **Regresión total + performance + matriz mobile en cada commit.** *Síntoma:* pipelines de 40+ min, gente reintentando. *Causa:* no hay presupuesto por clase de cambio. *Costo:* se erosiona la confianza en el semáforo. *Alternativa:* matriz de riesgo (§3); mover lo caro a nightly/scheduled.
2. **GitLab y Jenkins como doble fuente de verdad.** *Costo:* veredictos contradictorios, doble deploy. *Alternativa:* una fuente de verdad por commit (satélite 4).
3. **Tags mutables (`latest`) para build/deploy.** *Costo:* builds irreproducibles. *Alternativa:* pinnear por `@sha256:<digest>`.
4. **Confundir cache con artifact.** *Costo:* perdés los reportes que explican el fallo. *Alternativa:* reportes en `artifacts` con `when: always`.
5. **Secretos en YAML/logs/imágenes/fixtures.** *Alternativa:* variables protegidas/enmascaradas, gestor de secretos o identidad de workload (OIDC). Ver satélite 3.
6. **Gate binario opaco.** *Costo:* nadie sabe por qué está rojo ni cómo recuperarse. *Alternativa:* política versionada con owner y excepción (satélite 2).
7. **Reintentar hasta el verde.** *Costo:* enmascara flakiness/incidentes. *Alternativa:* clasificar (flaky vs. incidente vs. bug) y arreglar la causa.
8. **Deploy sin versión trazable ni rollback.** *Alternativa:* artefacto versionado, provenance cuando se requiera, plan de rollback (satélite 3).
9. **Kubernetes por moda.** *Alternativa:* Compose/Testcontainers hasta que la topología lo exija.
10. **Tratar el resultado de un scanner como garantía de seguridad.** *Alternativa:* el scanner es una señal, no un veredicto; sumá revisión humana (satélite 3).
11. **No observar tras desplegar.** *Alternativa:* cerrar el bucle con SLI/checks sintéticos (§8).
12. **Medir personas en vez del sistema (§9).**

---

## 11. Hoja de ruta incremental para el portfolio Nexo Finanzas

> Los repositorios de Nexo Finanzas son **ficticios**; si no existen aún, tratá esto como diseño objetivo (condicional). Todos los datos son sintéticos.

Mapa de repositorios y qué evidencia integra cada uno:

| Repositorio | Controles y evidencia |
|---|---|
| `nexo-transfer-api` | Build Java, unit/component/API, contratos OpenAPI, reportes JUnit, imagen versionada y SBOM cuando se implemente |
| `nexo-web-banking-e2e` | Smoke web de journeys críticos en ambiente efímero; evidencia sanitizada, correlación con API |
| `nexo-wallet-mobile` | Smoke por plataforma en pipeline scheduled; matriz de dispositivos con presupuesto explícito |
| `nexo-cross-channel-regression` | Control cross-channel *pequeño* en integración, no la regresión total por PR |
| `nexo-performance-lab` | Baseline y carga en ejecución programada; reportes, hipótesis y entorno declarados |
| `nexo-quality-control-tower` | Enlaces riesgo → ejecución → evidencia → excepción → defecto → aprendizaje |
| `nexo-quality-platform` | Política de pipeline, Docker/Compose, config CI, templates, runbooks, ADRs |

Etapas de madurez (cada una declara **qué hipótesis valida y qué NO resuelve todavía**):

1. **Base.** Build reproducible, unit/API rápidos, reportes y `README` de ejecución local. *Valida:* "podemos verificar el núcleo en minutos". *No resuelve:* integración real ni seguridad de cadena.
2. **Integración.** Contratos, Compose/Testcontainers y smoke crítico sobre datos sintéticos. *Valida:* "los journeys críticos funcionan integrados". *No resuelve:* gobernanza de excepciones ni provenance.
3. **Gobierno.** Policy-as-code de gates, evidencia trazable, excepciones con vencimiento y runbook. *Valida:* "las decisiones de release son auditables". *No resuelve:* aún puede faltar firma/SBOM.
4. **Madurez.** SBOM/provenance según necesidad, entorno efímero, performance programada, telemetría post-deploy y revisión de SLOs. *Valida:* "podemos explicar y defender cada release".

---

## 12. Qué aprendimos y próximos pasos

- Un pipeline es evidencia proporcional al riesgo, no un semáforo binario.
- Los términos (CI, entrega, despliegue, gate, release decision) **no** son sinónimos; mezclarlos automatiza decisiones que alguien debe firmar.
- La evidencia y la observabilidad post-deploy son parte del pipeline, no un extra.

**Enlaces internos de esta colección:**

- [Quality gates auditables: policy-as-code, excepciones y quién decide el release](/blog/quality-gates-auditables-policy-as-code/) — cómo el gate decide y cómo se auditan las excepciones.
- [Cadena de suministro en el pipeline: SBOM, provenance (SLSA v1.2) y firma sin humo](/blog/cadena-de-suministro-pipeline-sbom-slsa-provenance/) — dependencias, SBOM, provenance, firma e imágenes inmutables.
- [GitLab CI y Jenkins sin autoridad duplicada: una sola fuente de verdad por commit](/blog/gitlab-ci-jenkins-fuente-de-verdad-por-commit/) — evitar doble pipeline y doble deploy.

## Checklist de una entrega explicable

- [ ] Distingo CI, entrega continua, despliegue continuo, gate y release decision.
- [ ] El pipeline parte de riesgo/tiempo de feedback/evidencia, no de una lista de herramientas.
- [ ] Hay **un** disparador por commit (sin pipelines duplicados).
- [ ] Reportes en `artifacts` con `when: always`; entiendo cache ≠ artifact.
- [ ] Imágenes pinneadas por digest; versiones LTS elegidas por soporte.
- [ ] Los diagramas Mermaid renderizan y cada etapa declara qué evidencia produce.
- [ ] Post-deploy: SLI/SLO, checks sintéticos y camino de rollback.
- [ ] Métricas con fórmula, ventana, sesgo, owner y acción; miden el sistema, no personas.
- [ ] Ningún secreto/PII en YAML, logs, imágenes o evidencia.
- [ ] Nexo Finanzas se mantiene ficticio y la hoja de ruta es incremental.

---

*Este artículo describe prácticas de ingeniería de calidad. No constituye asesoramiento legal, de cumplimiento ni de seguridad regulatoria. Un pipeline verde no certifica cumplimiento de PCI DSS, GDPR, normativa del BCRA ni ningún estándar: esos requieren controles y auditorías fuera del alcance de este texto. Verificá siempre contra la fuente oficial vigente y tu jurisdicción.*

