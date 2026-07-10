---
title: "Quality gates de seguridad proporcionales en CI/CD: qué bloquea un merge y quién decide las excepciones"
description: "Cómo llevar las pruebas de autorización e idempotencia a un pipeline con un gate proporcional al riesgo: qué falla el build, qué queda como hallazgo, cómo se gobiernan las excepciones y qué evidencia se publica sin exponer secretos."
pubDate: 2026-07-09
tags: ["ci-cd", "quality-gates", "devsecops", "api-security", "evidencia", "sdet"]
cluster: "08"
clusterTitle: "Seguridad y threat modeling para QA"
type: "satelite"
order: 3
repo: "devsecops-pipeline"
icon: "shield"
iconHue: 0
readingLevel: "Intermedio–Avanzado"
prerequisites: "SDET / DevOps / líderes técnicos"
---
> **Artículo satélite.** El marco de amenazas está en el [pilar](/blog/threat-modeling-para-qa-api-transferencias/); las pruebas concretas, en el [satélite de BOLA/BFLA e idempotencia](/blog/bola-bfla-idempotencia-pruebas-negativas-api/). Acá resolvemos: **¿cómo corre esto en cada cambio, qué frena un merge y quién decide las excepciones?**

> **Alcance.** Ejemplos ilustrativos sobre **Nexo Finanzas** (ficticio, datos sintéticos). Los YAML usan placeholders; no son configuraciones listas para producción. No prometemos "cumplimiento" ni "seguridad garantizada" por tener un gate verde.

---

## El problema: dos formas de arruinar un gate de seguridad

Hay dos maneras simétricas de fracasar cuando llevás seguridad al pipeline:

1. **El gate que bloquea todo.** Cualquier hallazgo de cualquier escáner frena el merge. Resultado: el equipo aprende a desactivar el gate, a marcar todo como falso positivo, o a odiar seguridad. El control muere por exceso de celo.
2. **El gate decorativo.** Corre un escáner, publica un reporte que nadie lee, y nunca falla el build. Da la ilusión de control sin control. Es *security theater*.

El objetivo de este artículo es el punto medio con criterio: un gate **proporcional al riesgo**, donde lo que bloquea un merge está definido y acotado, lo que no bloquea queda como hallazgo con dueño, y las excepciones se gobiernan en lugar de acumularse.

Esto se alinea con la práctica *PW.7 / PW.8* (revisar y probar el código) y con la respuesta gobernada a vulnerabilidades del **NIST SP 800-218 (SSDF v1.1)** ([NIST SP 800-218](https://csrc.nist.gov/pubs/sp/800/218/final), consultado 2026-07-09): el framework pide *verificar* y *responder*, no "bloquear todo" ni "ignorar todo".

---

## Prerrequisitos

- Entendés CI/CD, artefactos de pipeline y secretos a nivel conceptual.
- Leíste el [satélite técnico](/blog/bola-bfla-idempotencia-pruebas-negativas-api/): sabés que tenemos pruebas negativas de autorización e idempotencia listas para ejecutar.
- Tenés un entorno **efímero** donde desplegar la API para probarla (contenedor levantado y destruido por el pipeline).

**Glosario:**

| Término | Definición |
|---|---|
| **Gate / quality gate** | Punto del pipeline que decide si un cambio avanza según criterios objetivos. |
| **Bloqueante vs. hallazgo** | Bloqueante = frena el merge. Hallazgo = se registra, se prioriza, no necesariamente frena. |
| **Excepción (waiver)** | Decisión explícita de aceptar temporalmente un hallazgo, con dueño y fecha de revisión. |
| **Entorno efímero** | Instancia desechable creada para una corrida y destruida después. |

---

## Principio 1: no todo bloquea igual

La decisión de qué bloquea no es técnica, es de **riesgo**. Una asignación razonable para el journey de transferencia (decisión de Nexo, no norma universal):

| Categoría de verificación | ¿Bloquea el merge? | Por qué |
|---|---|---|
| Prueba negativa de **autorización** (BOLA/BFLA) falla | **Sí, bloqueante** | Un fallo acá es acceso indebido a dinero/datos. Es el núcleo del riesgo. |
| Prueba de **idempotencia** falla | **Sí, bloqueante** | Doble débito es pérdida directa. |
| Ruptura de **contrato** (OpenAPI) en un endpoint sensible | **Sí, bloqueante** | Cambia la superficie de forma no acordada. |
| Hallazgo de **SAST** severidad alta con contexto confirmado | Bloqueante **condicional** | Alto ≠ automáticamente explotable; requiere triage rápido, no bloqueo ciego. |
| Hallazgo de **SAST/DAST** severidad media/baja | **No** — hallazgo con dueño | Se prioriza en backlog; bloquear todo entrena a ignorar. |
| **Dependencia** con vulnerabilidad conocida (SBOM) | Depende de alcance y explotabilidad | Una CVE en una lib no usada en runtime no tiene el mismo peso. |

> **La distinción clave:** un test de autorización que falla es **determinista y de negocio** ("Ana leyó la cuenta de Bruno") → bloquea. Un hallazgo de escáner es **probabilístico y necesita contexto** ("posible inyección en X") → triage antes de bloquear. Tratar ambos igual es el error de raíz.

---

## Principio 2: el gate ilustrativo

Este es el ejemplo mínimo del enunciado, anotado. Es **ilustrativo**: usa placeholders y debe ajustarse a tu plataforma (el ejemplo es sintaxis GitLab CI; el patrón se traslada a otras).

```yaml
# ILUSTRATIVO — placeholders. Ajustá comandos, umbrales y nombres a tu repo.
security_api_tests:
  stage: verify
  needs: ["deploy_ephemeral"]     # requiere un entorno efímero ya desplegado
  script:
    - ./gradlew securityApiTest   # corre las pruebas BOLA/BFLA + idempotencia
  artifacts:
    when: always                  # publicá evidencia incluso si falla
    paths:
      - build/reports/security-api/
```

Qué decisiones encierra este bloque, ampliado con lo que importa:

```yaml
# Versión ampliada — sigue siendo ilustrativa.
security_api_tests:
  stage: verify
  needs: ["deploy_ephemeral"]
  script:
    - ./gradlew securityApiTest
  artifacts:
    when: always
    paths:
      - build/reports/security-api/    # reportes de ejecución (sin secretos)
    reports:
      junit: build/reports/security-api/junit.xml   # resultados legibles por la plataforma
  # El "gate" real: este job DEBE fallar el pipeline si las pruebas
  # bloqueantes fallan. Los hallazgos no-bloqueantes se publican como
  # artefacto y se rutean a backlog por un job separado (allow_failure).
  allow_failure: false
```

**Puntos de diseño:**

1. **`needs: ["deploy_ephemeral"]`.** Las pruebas de autorización necesitan la API *corriendo*, no mocks. El pipeline despliega una instancia efímera de Nexo con datos sintéticos, prueba contra ella y la destruye. Nunca contra un entorno compartido con datos reales.
2. **`when: always`.** La evidencia se publica *aunque* el job falle. Un gate que borra la evidencia cuando falla es inútil para el postmortem. (Ver el [satélite de postmortem](/blog/postmortem-sin-culpas-antipatrones-liderazgo-qa/).)
3. **`allow_failure: false` para bloqueantes.** Este job frena el merge si las pruebas de autorización/idempotencia caen. Un job *separado* con `allow_failure: true` puede correr escáneres cuyos hallazgos van a backlog sin frenar.
4. **Feedback rápido.** Si este gate tarda 40 minutos, la gente lo evita. Medí el *tiempo de feedback del gate* y tratalo como un requisito: un gate lento es un gate que se saltea.

> **Placeholder honesto.** `./gradlew securityApiTest` y `build/reports/security-api/` son nombres inventados para el ejemplo. No afirmo que exista tal task ni tal reporte; documentá los tuyos reales en el README del repo. **No inventamos resultados de ejecución.**

---

## Principio 3: la matriz de trazabilidad es lo que el gate produce

Un gate que solo dice "verde/rojo" es pobre. El valor está en la **evidencia trazable** que deja. Cada corrida debería poder responder, para cada amenaza modelada, "¿qué la controla, qué caso la prueba y dónde está la ejecución?":

| Amenaza (del pilar) | Control | Caso | Ejecución | Evidencia publicada |
|---|---|---|---|---|
| TM-01 (BOLA) | Autorización por objeto | `unaPersonaNoPuedeOperarLaCuentaDeOtra` | pipeline #482, commit `abc123` | `security-api/junit.xml` + ID correlación |
| TM-02 (idempotencia) | Clave idempotente | `reenvioNoDuplicaLedger` | pipeline #482, commit `abc123` | conteo ledger + evento auditoría |

**Qué se publica como evidencia:** reportes JUnit/HTML, logs estructurados, IDs de correlación, hashes de artefactos y la decisión (verde/rojo + waivers).
**Qué jamás se publica:** tokens, contraseñas, PII, payloads sensibles ni capturas sin sanear. La sanitización ocurre en la capa de prueba, *antes* de escribir el reporte.

> **Anti-patrón: pipeline verde = seguro.**
> **Causa:** se confunde "todos los jobs pasaron" con "el producto es seguro".
> **Daño:** decisiones de release basadas en una señal necesaria pero no suficiente. Cobertura alta + escaneos + verde **no** equivale a riesgo cero.
> **Alternativa:** el gate reporta *qué se verificó y qué no*. El release lo decide una persona con esa información, no el color del pipeline.

---

## Principio 4: gobernar las excepciones (waivers)

Toda organización real acepta hallazgos temporalmente. El problema no es aceptarlos: es aceptarlos **sin dueño ni fecha**, de modo que la excepción se vuelve permanente y nadie recuerda por qué.

Un waiver sano tiene forma de registro auditable:

```yaml
# ILUSTRATIVO — un waiver como dato versionado en el repo.
waivers:
  - id: WV-2026-014
    hallazgo: "SAST: posible open redirect en /v1/callback (severidad media)"
    justificacion: "Endpoint no expuesto en el journey de transferencia; validado en threat model TM-07."
    aceptado_por: "líder de seguridad del squad"     # rol, no nombre real
    fecha_aceptacion: 2026-06-15
    fecha_revision: 2026-07-15                        # OBLIGATORIA: caduca
    evidencia: "enlace al análisis, sin PII"
```

Reglas de gobierno (decisión de Nexo):

1. **Todo waiver tiene dueño y fecha de revisión.** Sin fecha de caducidad, no es un waiver: es una deuda oculta.
2. **El dueño es un rol, no "el equipo".** "El equipo" no rinde cuentas; una persona sí.
3. **Se revisan periódicamente.** Un job del pipeline puede *avisar* (no bloquear) cuando un waiver caducó, convirtiéndolo de nuevo en hallazgo activo.
4. **Quién puede aprobar excepciones bloqueantes está definido de antemano**, no negociado bajo la presión de un release.

> **Anti-patrón: la excepción que se vuelve solución permanente.**
> **Causa:** se acepta un hallazgo "por ahora" sin fecha de revisión.
> **Daño:** a los seis meses nadie sabe si sigue vigente; la excepción es ahora arquitectura de facto.
> **Alternativa:** fecha de revisión obligatoria + job que reactiva el hallazgo al caducar. Una excepción sin caducidad no se aprueba.

> **Anti-patrón: aceptar falsos positivos sin dueño, fecha ni evidencia.**
> **Causa:** "eso es un falso positivo" dicho en un thread, sin registro.
> **Daño:** el próximo release repite la discusión; si era un verdadero positivo, se escapa.
> **Alternativa:** un falso positivo también es un waiver con dueño, evidencia del análisis y fecha de revisión.

---

## Principio 5: un ADR para las decisiones que no se re-litigan

Las decisiones estructurales —"¿qué código devuelve una denegación?", "¿qué bloquea el merge?"— merecen un **Architecture Decision Record**: un documento corto que fija contexto, decisión, alternativas, consecuencias y fecha de revisión, para no rediscutirlas en cada PR.

```markdown
# ADR-007: Contrato de denegación y política de bloqueo del gate de seguridad

## Contexto
El journey de transferencia expone endpoints de cuenta. Necesitamos un contrato
de denegación coherente y una política de qué frena un merge, para evitar
decisiones ad hoc bajo presión de release.

## Decisión
1. Las consultas a objetos ajenos (BOLA) se deniegan con `404` para no revelar
   existencia del recurso; las operaciones no permitidas por rol (BFLA) con `403`.
2. Las pruebas negativas de autorización e idempotencia son **bloqueantes**.
3. Los hallazgos de SAST/DAST de severidad < alta son **no bloqueantes** y van a
   backlog con dueño; los de severidad alta requieren triage en < 48 h.

## Alternativas consideradas
- Denegar todo con `403` (rechazada: filtra existencia del objeto → enumeración).
- Bloquear con cualquier hallazgo de escáner (rechazada: entrena a ignorar el gate).

## Consecuencias
- Positiva: el equipo sabe de antemano qué frena un release.
- Negativa: `404` en BOLA complica el debugging legítimo → mitigado con logs
  internos correlacionados por ID (sin exponer datos al cliente).

## Evidencia
- Pruebas: `unaPersonaNoPuedeOperarLaCuentaDeOtra`, matriz BFLA, idempotencia.
- Reportes en artefactos del pipeline.

## Fecha de revisión: 2026-10-01
```

Un ADR es también **evidencia de portfolio**: muestra que sabés *decidir con trade-offs y dejar rastro*, no solo escribir tests.

---

## Métricas del gate: qué mirar sin engañarte

Proponé una **línea de base** y acordá objetivos por criticidad; no copies umbrales de nadie como si fueran universales. Señales útiles:

- **Tiempo de feedback del gate** (si sube, la gente lo evita).
- **% de pipelines con evidencia disponible** (si un release no dejó evidencia, no ocurrió a efectos de auditoría).
- **Pruebas de autorización por rol/objeto/función**, separadas de cobertura de líneas.
- **Hallazgos por severidad/contexto, tiempo de triage y edad de hallazgos aceptados** (waivers viejos = deuda).
- **Tasa de pruebas inestables** con causa clasificada: producto / ambiente / dato / automatización / dependencia. Un gate flaky se ignora tanto como uno lento.

Y la advertencia que repetimos en toda la colección: **cobertura de código + cantidad de escaneos + pipeline verde ≠ riesgo cero.** Son insumos para una decisión humana, no un veredicto.

---

## Qué aprendimos / próximos pasos

- Un gate de seguridad útil es **proporcional**: bloquea lo determinista de negocio (autorización, idempotencia, contrato) y rutea a backlog lo probabilístico (hallazgos de escáner).
- Publicá evidencia **siempre**, saneada, y hacela trazable amenaza→control→caso→ejecución.
- Gobierná las excepciones con **dueño y fecha de revisión obligatoria**; una excepción eterna es deuda oculta.
- Documentá las decisiones estructurales en **ADRs** para no re-litigarlas.

**Continuá:**
- **[Postmortem sin culpas y antipatrones](/blog/postmortem-sin-culpas-antipatrones-liderazgo-qa/)** — qué hacés cuando el gate *no atrapó* algo, sin buscar culpables.
- Volvé al **[pilar](/blog/threat-modeling-para-qa-api-transferencias/)** o al **[satélite técnico](/blog/bola-bfla-idempotencia-pruebas-negativas-api/)**.

---

## Checklist final

- [ ] Definiste **qué bloquea** un merge y **qué es hallazgo**, por riesgo, no por herramienta.
- [ ] Las pruebas de autorización e idempotencia corren contra un entorno **efímero** con datos sintéticos.
- [ ] La evidencia se publica **siempre** (`when: always`) y **saneada** (sin secretos/PII).
- [ ] Cada corrida deja una matriz trazable amenaza→control→caso→ejecución→evidencia.
- [ ] Los waivers tienen **dueño, justificación y fecha de revisión obligatoria**.
- [ ] Quién aprueba excepciones bloqueantes está definido **antes** del release.
- [ ] Documentaste las decisiones estructurales en un **ADR** con fecha de revisión.
- [ ] Medís tiempo de feedback y tasa de flakiness del gate.
- [ ] Comunicaste que verde ≠ seguro: el release lo decide una persona informada.

---

## Fuentes y vigencia

Consultadas el **2026-07-09**.

- NIST SP 800-218, SSDF v1.1 (verificar y responder): https://csrc.nist.gov/pubs/sp/800/218/final
- OWASP API Security Top 10 (2023): https://owasp.org/API-Security/
- OpenAPI Specification v3.2.0 (contratos): https://spec.openapis.org/oas/latest.html
- OWASP ASVS v5.0.0 (requisitos verificables, para derivar criterios de gate): https://owasp.org/www-project-application-security-verification-standard/

> *YAML y ADR ilustrativos con nombres ficticios. No es configuración de producción ni asesoramiento de cumplimiento. Se distinguen decisiones de Nexo Finanzas de recomendaciones de estándares.*

