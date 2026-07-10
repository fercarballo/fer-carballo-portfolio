---
title: "Ruta de estudio para SDET: prerrequisitos, orden y cómo verificar que estás listo"
description: "Un currículum con dependencias explícitas para pasar de QA Automation a Quality Engineering: qué estudiar en cada etapa, qué podés posponer, qué construir para probar dominio y cómo verificar que estás listo para la siguiente."
pubDate: 2026-07-09
tags: ["sdet", "aprendizaje", "roadmap", "quality-engineering", "portfolio", "carrera"]
cluster: "00"
clusterTitle: "Mapa de estudio y arquitectura de calidad"
type: "satelite"
order: 2
icon: "grad"
iconHue: 145
readingLevel: "Básico–Intermedio"
prerequisites: "Sirve tanto si recién automatizás como si querés ordenar lagunas."
---
> Satélite del pilar **[De QA Automation a Quality Engineering: el mapa](/blog/de-qa-automation-a-quality-engineering-mapa/)**.
> El pilar responde *"¿cómo diseño una arquitectura de calidad?"*. Este artículo responde una
> pregunta distinta: **"¿en qué orden aprendo a hacerlo y cómo sé que estoy listo para avanzar?"**

> **Convención de honestidad.** <span class="em em--hecho">HECHO</span> (fuente primaria citada), <span class="em em--inferencia">INFERENCIA</span> (razonamiento
> propio), <span class="em em--decision">DECISIÓN</span> (elección con costo), <span class="em em--opinion">OPINIÓN</span> (juicio discutible). *Nexo Finanzas*
> es una fintech **ficticia**. **No hay aquí promesas de empleabilidad, salarios ni plazos
> garantizados**: los tiempos son estimaciones y dependen de tu punto de partida.

---

## 1. El problema: la parálisis del roadmap

Buscás "roadmap SDET" y encontrás una imagen con setenta iconos: Java, Python, Selenium, Cypress,
Playwright, Postman, RestAssured, Docker, Kubernetes, Jenkins, GitLab, k6, JMeter, Grafana,
Prometheus, Pact, Appium, Cucumber, Terraform. Ningún orden, ninguna dependencia, ninguna forma de
saber si ya sabés algo.

<span class="em em--inferencia">INFERENCIA</span> El problema de esos roadmaps no es que les sobren herramientas. Es que **confunden
inventario con currículum**. Un currículum tiene tres cosas que un inventario no tiene:

1. **Dependencias**: no podés aprender contratos de API sin entender HTTP.
2. **Criterios de verificación**: una forma de saber si dominás algo, distinta de "hice el tutorial".
3. **Permiso explícito para posponer**: qué *no* estudiar todavía.

Este artículo es un currículum. Cada etapa declara **qué**, **por qué ahora**, **qué construir para
probarlo**, **cómo verificar que estás listo** y **qué podés posponer**. Y como cada etapa tiene su
colección profunda en este blog, funciona también como índice de lectura.

**[OPINIÓN] El síntoma que esta ruta intenta curar** es lo que llamo *automatización de culto a la
carga*: tests que existen, que corren en verde, y que nadie —incluido quien los escribió— sabe qué
riesgo cubren.

---

## 2. Cómo verificar dominio (el criterio que uso en todo el artículo)

Antes de la ruta, el método. <span class="em em--decision">DECISIÓN</span> En cada etapa uso tres niveles de verificación, en orden
creciente de honestidad:

| Nivel | Prueba | Por qué no alcanza el nivel anterior |
|---|---|---|
| **Reconocer** | Podés explicar el concepto con tus palabras | Reconocer no es poder hacer |
| **Construir** | Podés construir algo pequeño que lo use, desde cero, sin tutorial | Construir con guía no prueba comprensión |
| **Diagnosticar** | Podés **romperlo a propósito**, predecir el síntoma y explicar la causa | Es el único nivel que te sirve en un incidente |

> **[INFERENCIA] El nivel que importa es "diagnosticar".** Un incidente de producción no te pide
> escribir código nuevo: te pide entender por qué el código existente se comporta distinto de lo que
> creías. Toda la ruta está diseñada para llegar ahí.

Un atajo práctico para autoevaluarte: **si no podés romper algo a propósito y anticipar el error
exacto, todavía no lo entendés.**

---

## 3. La ruta, con sus dependencias

<figure class="diagram">
  <img src="/blog/diagrams/ruta-de-estudio-sdet-prerrequisitos-verificacion-1.svg" alt="Diagrama: ruta-de-estudio-sdet-prerrequisitos-verificacion (1)" loading="lazy" decoding="async" />
</figure>

**Cómo leer el diagrama.** Las flechas sólidas son **dependencias duras**: la etapa siguiente no se
entiende sin la anterior. La flecha punteada es el bucle: la evidencia que recolectás en la etapa 7
te devuelve a replantear el riesgo (etapa 1). <span class="em em--inferencia">INFERENCIA</span> Nadie "termina" esta ruta; se recorre
en espiral, con más profundidad cada vuelta.

**Por qué este orden y no otro** <span class="em em--decision">DECISIÓN</span>:

- **Riesgo antes que frameworks**, porque elegir herramienta antes de entender el riesgo es el
  anti-patrón más caro del oficio (ver el pilar, §9).
- **APIs y contratos antes que UI**, porque en sistemas distribuidos el riesgo vive en los bordes
  entre servicios, y porque una UI se prueba mejor cuando la capa de abajo ya es confiable.
- **CI/CD antes que performance**, porque una prueba de carga sin entorno reproducible **no mide el
  sistema: mide el ruido**.
- **Liderazgo al final**, porque el liderazgo técnico sin criterio técnico es gestión de tickets.

---

## 4. Etapa 0 — Fundamentos

Seis áreas. Para cada una: por qué importa *en calidad* (no en abstracto) y cómo verificar.

| Área | Por qué importa aquí | Verificación (nivel "diagnosticar") |
|---|---|---|
| **Lenguaje de propósito general** (Java u otro): tipos, objetos, colecciones, excepciones, dependencias, testing | Los tests, los stubs y las herramientas **son código**. Sin esto, automatizás por copia y no podés mantener nada | Escribís una clase con un test que use un doble de prueba y afirme sobre una **excepción**; sabés por qué un `equals` mal implementado rompe una aserción de colección |
| **HTTP, JSON, REST; authn vs. authz** | La mayor parte del riesgo en producto digital vive en las APIs | Explicás la diferencia entre **401 y 403** y por qué devolver 404 en lugar de 403 puede ser una decisión de seguridad deliberada |
| **SQL, transacciones, modelado relacional** | La integridad del dinero se defiende en la base de datos, no en el test | Provocás una violación de `UNIQUE` a propósito y explicás qué pasa con la transacción; sabés qué hace un `ROLLBACK` a medio camino |
| **Git, terminal, variables de entorno, logs** | La evidencia es versionada y reproducible; sin esto no hay trazabilidad | Encontrás un `traceId` en un log y lo correlacionás con la petición que lo generó |
| **Docker, redes, volúmenes, Compose** | Los entornos reproducibles son el sustrato de todo lo demás | Levantás una API + su base con `docker compose up`, la rompés quitando el volumen y explicás por qué se perdieron los datos |
| **Criterios de aceptación, análisis de riesgo, valores límite, regresión** | Es el vocabulario con el que se **decide** qué probar | Dado un requisito, derivás 3 casos de borde y 1 de regresión, y **justificás cuál dejarías fuera** si tuvieras la mitad del tiempo |

### 4.1. Ruta de recuperación si te faltan varios

<span class="em em--opinion">OPINIÓN</span> No los estudies en paralelo. Prioridad, en este orden:

1. **HTTP/REST + SQL/transacciones.** Es donde vive el riesgo. Sin esto no entendés ni idempotencia
   ni autorización, que son los dos riesgos de mayor impacto del pilar.
2. **Docker Compose.** Sin entornos reproducibles, todo lo que sigue es anécdota.
3. **Lenguaje + Git.** Se aprenden bien *construyendo* los tests de los puntos anteriores.

**Podés posponer sin culpa:** Kubernetes, Terraform, service mesh, arquitectura de datos avanzada,
performance profunda y accesibilidad avanzada. <span class="em em--inferencia">INFERENCIA</span> No podés posponer autorización ni
transacciones: son los cimientos de los ejemplos de todo este blog.

**Entregable de la etapa:** un repo con una API mínima + Postgres en `docker-compose.yml` y un test
de integración que verifica una `UNIQUE constraint`. Pequeño, tuyo, reproducible.

---

## 5. Etapa 1 — Riesgo y arquitectura

**Qué.** Convertir riesgos de negocio en un portafolio de controles. Aprender a escribir un riesgo
en lenguaje de negocio ("un cliente puede ver dos transferencias iguales") y no de implementación
("falta un índice único").

**Por qué ahora.** Porque determina **todo lo que viene después**. Si elegís el framework antes que
el riesgo, vas a automatizar lo que es fácil de automatizar, no lo que importa.

**Qué construir:** una `risk-matrix.md` con **cinco** riesgos de un producto que conozcas, con las
seis columnas del pilar (riesgo, control preventivo, prueba o señal, momento de ejecución, evidencia,
dueño colaborativo).

**Verificación.** *Diagnosticar*: tomás un incidente real o público, y **reconstruís hacia atrás**
qué riesgo no estaba nombrado, qué control faltaba y en qué capa se habría detectado más barato.

**Podés posponer:** SLOs formales, threat modeling estructurado.

📖 **Profundidad:** [Arquitectura de QE orientada a riesgo](/blog/arquitectura-quality-engineering-orientada-a-riesgo/) ·
[Quality Engineering en fintech: probar dinero no es probar formularios](/blog/probar-dinero-no-es-probar-formularios/)

---

## 6. Etapa 2 — APIs, contratos y datos

**Qué.** Pruebas de API, idempotencia, evolución de contratos, contract testing consumer-driven,
datos de prueba aislados.

**Por qué ahora.** En un sistema distribuido, **la integración es el riesgo**. Un ejército de tests
unitarios no toca el borde entre dos servicios. Además, esta es la capa con mejor relación entre
velocidad, fidelidad y calidad de diagnóstico (ver pilar, §6).

**Qué construir:** un test que reenvía la misma petición con la misma clave de idempotencia y afirma
que existe **un** solo registro. Después, un contrato consumer-driven entre dos servicios tuyos.

**Verificación.** *Diagnosticar*: agregás un campo al proveedor y explicás **por qué no rompe** al
consumidor; después quitás un campo que el consumidor sí lee y predecís exactamente en qué job del
pipeline falla y con qué mensaje.

> **[INFERENCIA] El error clásico de esta etapa** es adoptar contract testing donde hay **un solo
> consumidor que se despliega junto al proveedor**. Ahí es sobre-ingeniería: un test de integración
> directo cuesta menos y dice lo mismo. La técnica paga cuando hay consumidores independientes.

**Podés posponer:** mensajería asincrónica avanzada, event sourcing.

📖 **Profundidad:** **Contratos de API y sistemas distribuidos** ·
[Consumer-Driven Contract Testing: cuándo sí, cuándo no](/blog/consumer-driven-contract-testing-cuando-si-cuando-no/) ·
[Idempotencia, dinero y eventos](/blog/idempotencia-dinero-eventos-transferencia-una-sola-vez/)

---

## 7. Etapa 3 — Frameworks de UI y mobile

**Qué.** Tratar el framework de automatización como un **producto interno**: selectores sostenibles,
aislamiento de datos, paralelismo, diagnóstico de flakiness.

**Por qué ahora.** Porque recién ahora sabés **qué poco** debe vivir en esta capa. Quien llega acá
sin las etapas 1 y 2 escribe 500 E2E y llama a eso "cobertura".

**Qué construir:** tres tests de UI del flujo más crítico, con datos aislados y sin `sleep`.
Y —más importante— un cuarto test que **falle de forma intermitente a propósito**, para que aprendas
a instrumentar el diagnóstico.

**Verificación.** *Diagnosticar*: ante un test rojo, podés decir en menos de cinco minutos si se
rompió el producto, el test, el dato o el entorno. <span class="em em--opinion">OPINIÓN</span> Esta es la habilidad que más
separa a un automatizador de un SDET.

**Sobre herramientas** <span class="em em--hecho">HECHO</span>, al 2026-07-09: Selenium está en su línea **4.x**
([Downloads](https://www.selenium.dev/downloads/)); la línea activa de Appium es **3.x** y
**Appium 2 llegó a fin de vida** ([Releases](https://github.com/appium/appium/releases)). Verificá
vigencia antes de comprometer un stack. **Ninguna herramienta es "la mejor" fuera de un contexto**;
el método para decidir sin coronar un ganador universal está en
[«Katalon vs Selenium» no tiene ganador universal](/blog/adr-seleccion-herramienta-katalon-selenium/).

**Podés posponer:** visual testing, cross-browser exhaustivo, device farms.

📖 **Profundidad:** [Framework engineering como producto interno](/blog/framework-engineering-suite-producto-interno/) ·
[Selectores sostenibles](/blog/selectores-sostenibles-contratos-ui/) ·
[Confiabilidad, diagnóstico y flakiness](/blog/confiabilidad-diagnostico-flakiness-evidencia/)

---

## 8. Etapa 4 — CI/CD y entornos

**Qué.** Pipelines que **publican artefactos**, quality gates proporcionales al riesgo, entornos
efímeros, gestión de secretos.

**Por qué ahora.** Un control que no corre automáticamente en el momento correcto no es un control:
es una intención. <span class="em em--hecho">HECHO</span> Los pipelines de GitLab se definen en `.gitlab-ci.yml` y los jobs
pueden publicar artefactos ([GitLab CI/CD](https://docs.gitlab.com/ci/pipelines/), consultado
2026-07-09).

**Qué construir:** un pipeline donde el job de tests **suba el reporte como artefacto**, y un gate
que falle por una condición **atada a un riesgo de tu matriz**, no a un umbral inventado.

**Verificación.** *Diagnosticar*: alguien pregunta "¿por qué bloqueó este merge?" y podés señalar
el riesgo específico de la matriz que el gate protege. Si no podés, el gate es arbitrario.

> **[INFERENCIA] El gate técnico informa la decisión de release; no la reemplaza.** Un pipeline verde
> significa "los controles implementados pasaron", no "la matriz de riesgo está completa".

**Podés posponer:** despliegue progresivo, canary, SLSA/SBOM (hasta que el pipeline básico sea
confiable).

📖 **Profundidad:** [Continuous quality: pipeline basado en riesgo](/blog/continuous-quality-pipeline-basado-en-riesgo/) ·
[Quality gates auditables y policy as code](/blog/quality-gates-auditables-policy-as-code/) ·
[Quality gates proporcionales al riesgo](/blog/quality-gates-proporcionales-al-riesgo/) ·
[Publicar evidencia sin filtrar secretos](/blog/publicar-evidencia-sin-filtrar-secretos/)

---

## 9. Etapa 5 — Performance, observabilidad y seguridad

Tres disciplinas que comparten una idea: **medir el comportamiento real en vez de suponerlo**.

### Performance
**Qué.** De la prueba de carga a una **decisión**: hipótesis, experimento reproducible, percentiles,
capacidad.
**Verificación.** *Diagnosticar*: distinguís una degradación del sistema de un artefacto de tu
generador de carga. <span class="em em--inferencia">INFERENCIA</span> Si no podés, tu número no significa nada.
**Trampa habitual:** reportar un promedio. Los promedios ocultan la cola, y la cola es la
experiencia de tus peores usuarios.

📖 [Performance engineering: de la carga a una decisión](/blog/performance-engineering-de-la-carga-a-una-decision/) ·
[Hipótesis medible, experimento reproducible](/blog/hipotesis-medible-experimento-reproducible/) ·
[Percentiles, capacidad y quality gates](/blog/percentiles-capacidad-quality-gates/)

### Observabilidad y SLOs
**Qué.** Trazas, métricas y logs; definir un SLI con su ventana y un SLO con su error budget.
<span class="em em--hecho">HECHO</span> El SLI es "una medida cuantitativa cuidadosamente definida de algún aspecto del nivel de
servicio" y el SLO, "un valor o rango objetivo medido por un SLI"; lo que distingue a un SLA es que
incorpora **consecuencias** ([Google SRE](https://sre.google/sre-book/service-level-objectives/),
consultado 2026-07-09).
<span class="em em--hecho">HECHO</span> OpenTelemetry es un **proyecto graduado de la CNCF** desde mayo de 2026, con trazas,
métricas y logs estables ([OpenTelemetry](https://opentelemetry.io/docs/what-is-opentelemetry/),
[Status](https://opentelemetry.io/status/), consultados 2026-07-09).
**Verificación.** *Diagnosticar*: instrumentás una señal, la ves fallar y correlacionás el fallo con
una traza concreta.

📖 [SLIs, SLOs y error budgets](/blog/slis-slos-error-budgets-sin-autoenganarse/) ·
**Observabilidad para Quality Engineering**

### Seguridad y accesibilidad
**Qué.** Threat modeling aplicado a QA; pruebas negativas de autorización; accesibilidad como
requisito, no como auditoría final.
<span class="em em--hecho">HECHO</span> *Broken Access Control* es la categoría **A01** del
[OWASP Top 10:2025](https://owasp.org/Top10/2025/) (consultado 2026-07-09); esa edición absorbió
SSRF dentro de A01 e incorporó *Software Supply Chain Failures* y *Mishandling of Exceptional
Conditions*. OWASP es material de **concientización**, no una certificación.
<span class="em em--hecho">HECHO</span> WCAG **2.2** es la Recomendación W3C vigente y norma ISO/IEC 40500:2025; **WCAG 3.0 sigue
en Working Draft**, sin Recomendación esperada antes de 2028
([WCAG 2 Overview](https://www.w3.org/WAI/standards-guidelines/wcag/),
[WCAG 3 Introduction](https://www.w3.org/WAI/standards-guidelines/wcag/wcag3-intro/), consultados
2026-07-09). **Objetivo de conformidad: 2.2 nivel AA.**
**Verificación.** *Diagnosticar*: escribís el test negativo que demuestra que el usuario A **no**
puede leer el recurso de B, y explicás por qué un 200 con cuerpo vacío sería un fallo peor que un 403.

📖 **Threat modeling para QA** ·
[BOLA, BFLA, idempotencia y pruebas negativas](/blog/bola-bfla-idempotencia-pruebas-negativas-api/) ·
**Accesibilidad como calidad** ·
[Resiliencia y chaos engineering](/blog/resiliencia-chaos-engineering-evidencia-y-gobernanza/)

> **Aviso.** Las menciones a OWASP, WCAG y PCI DSS son informativas, delimitadas por versión y
> jurisdicción, y **no constituyen asesoramiento legal ni de cumplimiento**.

---

## 10. Etapas 6 y 7 — Liderazgo y mejora continua

**Qué.** Operating model de calidad, triage de defectos sin culpables, métricas que enseñan en vez
de castigar, postmortems sin culpa, y la disciplina de **escribir decisiones, no pasos**.

**Por qué al final.** <span class="em em--opinion">OPINIÓN</span> El liderazgo técnico sin criterio técnico degenera en gestión de
tickets. Recién cuando podés diagnosticar un flaky, defender una capa y explicar un SLO, tu opinión
sobre el proceso tiene peso.

**Qué construir:** un ADR con **consecuencias** y una *señal de revisión* (qué observarías que te
haría reabrir la decisión). Y un postmortem de un incidente —real o simulado— que no nombre culpables.

**Verificación.** *Diagnosticar*: alguien que no estuvo en la decisión lee tu ADR y puede explicar
**por qué** se eligió esa opción y **qué costo** se aceptó. Si solo puede explicar *qué* se hizo,
documentaste pasos, no decisiones.

**El bucle (etapa 7).** La evidencia que producís —artefactos de CI, trazas de producción,
postmortems— **realimenta la matriz de riesgo**. Si el contador de colisiones de idempotencia sube,
el riesgo necesita un control más fuerte, no un test más.

📖 **Profundidad:** [Operating model de calidad](/blog/liderar-calidad-sin-ser-cuello-de-botella-operating-model/) ·
[Triage de defectos sin culpables](/blog/triage-defectos-sin-culpables-taxonomia-fallos/) ·
[Métricas de calidad que enseñan y que dañan](/blog/metricas-de-calidad-que-ensenan-y-que-danan/) ·
[Escribir sobre calidad con evidencia](/blog/escribir-sobre-calidad-con-evidencia-metodo-editorial/)

---

## 11. Anti-patrones de aprendizaje

| Anti-patrón | Causa | Consecuencia | Alternativa |
|---|---|---|---|
| **Tutorial hell** | El tutorial da una sensación de progreso sin fricción | Sabés *reconocer*, no *construir* ni *diagnosticar* | Construí algo pequeño **sin** tutorial y rompelo a propósito |
| **Herramienta primero** | Las ofertas de empleo listan herramientas, no criterio | Aprendés la sintaxis de un framework y no el riesgo que cubre | Etapa 1 antes que etapa 3, siempre |
| **Coleccionar certificaciones** | Son legibles para un filtro de CV | No prueban capacidad de diagnóstico | Un repo con ADRs y evidencia reproducible dice más <span class="em em--opinion">OPINIÓN</span> |
| **Estudiar en paralelo todo** | Miedo a quedarse atrás | Ninguna etapa llega a nivel "diagnosticar" | Respetá las dependencias del §3 |
| **Portfolio de capturas** | Es rápido de producir | Una captura no prueba reproducibilidad | Publicá comandos, versión, entorno y limitaciones |
| **Confundir seniority con antigüedad** | Es la métrica más fácil | Años repitiendo la etapa 3 | Verificá cada etapa con el criterio del §2 |

---

## 12. Plan de 30 / 60 / 90 días de *aprendizaje*

<span class="em em--decision">DECISIÓN</span> Distinto del plan de adopción del pilar (que es para tu equipo). Este es para vos.
<span class="em em--hipotesis">HIPÓTESIS</span> Los plazos suponen unas 5–7 horas semanales sostenidas; ajustalos a tu realidad.
**No son una promesa.**

| Ventana | Foco | Entregable verificable |
|---|---|---|
| **30 días** | Cerrar huecos de Etapa 0 + escribir la Etapa 1 | Repo con `docker-compose.yml`, una API mínima, un test que verifica una `UNIQUE constraint`, y una `risk-matrix.md` con 5 riesgos |
| **60 días** | Etapa 2 completa + empezar Etapa 4 | Test de idempotencia; un contrato consumer-driven entre dos servicios tuyos; pipeline que **publica el reporte como artefacto** |
| **90 días** | Etapa 3 con criterio + primer ADR | Tres tests de UI con datos aislados; un test flaky diagnosticado y arreglado con evidencia; un ADR con consecuencias y señal de revisión |

<span class="em em--opinion">OPINIÓN</span> Lo que hace empleable este plan no es la lista de tecnologías: es que al día 90 tenés
un repositorio donde **cada test apunta a un riesgo nombrado** y **cada decisión está documentada con
su costo**. Eso es exactamente lo que un revisor senior busca y casi nadie muestra.

---

## 13. Checklist de la ruta

- [ ] Sé explicar, para cada cosa que uso, **qué riesgo cubre**.
- [ ] Puedo **romper a propósito** cada componente de mi etapa actual y predecir el síntoma.
- [ ] No pasé a la etapa siguiente sin el entregable de la anterior.
- [ ] Tengo permiso explícito (mío) de **posponer** lo que no necesito todavía.
- [ ] Mi portfolio muestra **decisiones y evidencia**, no capturas.
- [ ] Al menos un ADR mío tiene **consecuencias negativas** escritas.
- [ ] Puedo diagnosticar un test rojo en menos de cinco minutos: producto, test, dato o entorno.
- [ ] Marco mis afirmaciones: hecho, inferencia, decisión, hipótesis, opinión.

---

## 14. Qué aprendimos

Un roadmap de setenta iconos no te dice nada porque no tiene **dependencias**, **verificación** ni
**permiso para posponer**. Un currículum sí.

El orden importa por una razón concreta: **el riesgo decide la herramienta, y no al revés**. Y el
nivel de dominio que buscás no es "hice el tutorial" sino "puedo romperlo a propósito y explicar
qué pasa". Todo lo demás —el stack, las certificaciones, la cantidad de tests— es consecuencia.

### Sigue leyendo

- **El mapa completo:** [De QA Automation a Quality Engineering](/blog/de-qa-automation-a-quality-engineering-mapa/)
- **Para empezar la Etapa 1 hoy:** [Arquitectura de QE orientada a riesgo](/blog/arquitectura-quality-engineering-orientada-a-riesgo/)
- **Para que lo que publiques sume:** [Escribir sobre calidad con evidencia](/blog/escribir-sobre-calidad-con-evidencia-metodo-editorial/)

---

> **Avisos.** *Nexo Finanzas* es ficticio. Este artículo **no promete resultados de empleabilidad,
> salarios ni plazos**: los tiempos son hipótesis dependientes de tu punto de partida. Las versiones
> de herramientas y estándares fueron verificadas el **2026-07-09**; verificá vigencia antes de
> comprometer un stack. Las menciones a OWASP, WCAG o PCI DSS son informativas y **no constituyen
> asesoramiento legal ni de cumplimiento**. Los diagramas Mermaid fueron revisados por sintaxis pero
> **no renderizados** en el entorno de redacción.

