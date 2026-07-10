---
title: "De QA Automation a Quality Engineering: el mapa de arquitectura, decisiones y evidencia"
description: "Una arquitectura de Quality Engineering no es una pila de herramientas: es un sistema socio-técnico de feedback. Mapa de componentes, matriz riesgo→control→evidencia y qué publicar en GitHub para demostrar madurez."
pubDate: 2026-07-09
tags: ["quality-engineering", "sdet", "arquitectura-de-calidad", "risk-based-testing", "evidencia", "ci-cd"]
cluster: "00"
clusterTitle: "Mapa de estudio y arquitectura de calidad"
type: "pilar"
order: 1
icon: "grad"
iconHue: 145
readingLevel: "Intermedio"
prerequisites: "Requiere testing básico, HTTP/REST y nociones de CI/CD."
---
> **Cómo leer las afirmaciones de este artículo.** Marco cada afirmación relevante como
> <span class="em em--hecho">HECHO</span> (verificable en la fuente primaria citada), <span class="em em--inferencia">INFERENCIA</span> (razonamiento propio a
> partir de hechos), <span class="em em--decision">DECISIÓN</span> (elección de diseño con alternativas y costo), <span class="em em--hipotesis">HIPÓTESIS</span>
> (plausible, pendiente de medición) y <span class="em em--opinion">OPINIÓN</span> (juicio profesional discutible).
> *Nexo Finanzas* es una fintech **ficticia** con datos sintéticos. Ninguna métrica proviene de un
> sistema real.

> **Qué es este artículo.** El **mapa** de la disciplina y el índice de este blog. Cada vez que un
> subtema tiene tratamiento profundo en otra colección, enlazo en vez de repetir. Si buscás la
> ingeniería fina de un componente, seguí los enlaces; si buscás entender cómo encajan entre sí,
> quedate acá.

---

## 1. El problema: la reunión después del incidente

Lunes, 9:00. Nexo Finanzas hace el postmortem de un incidente del viernes: una transferencia de
$85.000 salió **dos veces**. El cliente vio un *timeout*, reintentó, y el backend no tuvo forma de
saber que la segunda petición expresaba la misma intención que la primera. El pipeline estaba
verde: 3.200 tests, cobertura alta, badge impecable.

*(El análisis técnico de este incidente —idempotencia, claves de reintento, reconciliación— está
desarrollado en [Idempotencia y reintentos en transferencias](/blog/idempotencia-y-reintentos-en-transferencias/)
y en [Arquitectura de QE orientada a riesgo](/blog/arquitectura-quality-engineering-orientada-a-riesgo/).
Acá me interesa otra pregunta.)*

En la reunión, alguien pregunta lo obvio: *"¿por qué no lo agarramos?"*. Y la respuesta incómoda no
es "faltó un test". Es esta:

> **Nadie había convertido ese riesgo de negocio en un control.**

La suite verde era honesta. Probaba exactamente lo que alguien decidió probar. <span class="em em--inferencia">INFERENCIA</span> El
defecto no estuvo en la ejecución sino en el **sistema de decisiones** que determina qué merece ser
probado, en qué capa, en qué momento y con qué evidencia. Ese sistema tiene nombre: **arquitectura
de Quality Engineering**. Y no se arregla con más tests: se diseña.

Este artículo es el mapa de ese diseño, y la puerta de entrada a las demás colecciones del blog.

---

## 2. Prerrequisitos y glosario mínimo

Asumo que sabés qué es un caso de prueba. Si te falta alguno de estos fundamentos, la
[ruta de estudio](/blog/ruta-de-estudio-sdet-prerrequisitos-verificacion/) explica en qué orden
recuperarlos y cómo verificar que estás listo:

- Un lenguaje de propósito general (Java u otro): tipos, objetos, colecciones, excepciones,
  dependencias, testing.
- HTTP, JSON, REST; autenticación vs. autorización.
- SQL, transacciones, modelado relacional básico.
- Git, terminal, variables de entorno, lectura de logs.
- Docker, redes, volúmenes, Docker Compose.
- Criterios de aceptación, análisis de riesgo, valores límite, regresión.

**Glosario operativo** (los uso con este significado exacto):

| Término | Definición usada en este blog |
|---|---|
| **Control** | Cualquier mecanismo que previene, detecta o mitiga un riesgo. **No es solo un test**: también una `UNIQUE constraint`, un feature flag, un límite de tasa o una alerta. |
| **Evidencia** | Artefacto **versionado y reproducible** que respalda una afirmación de calidad. Un badge no lo es; un reporte publicado por el pipeline, sí. |
| **Portafolio de controles** | La mezcla de controles elegida por riesgo. Reemplaza a la idea de "pirámide fija". |
| **Quality gate** | Condición automatizada que un cambio debe cumplir para avanzar. Informa la decisión de release; no la reemplaza. |
| **SLI / SLO / SLA** | Indicador, objetivo y acuerdo de nivel de servicio. <span class="em em--hecho">HECHO</span> Definidos en el cap. 4 del SRE book de Google: el SLI es "una medida cuantitativa cuidadosamente definida de algún aspecto del nivel de servicio"; el SLO, "un valor o rango objetivo para un nivel de servicio medido por un SLI"; el SLA añade **consecuencias** ([Google SRE](https://sre.google/sre-book/service-level-objectives/), consultado 2026-07-09). |

---

## 3. Definición operativa: qué es y qué no es

> **[DECISIÓN] Definición operativa.** Una **arquitectura de Quality Engineering** es el conjunto
> de **decisiones, componentes y flujos de feedback** con el que un equipo convierte riesgos en
> controles con evidencia, los ejecuta en el momento adecuado y aprende del resultado —sin degradar
> la confianza en el producto.

La tesis que defiendo en todo este blog: **es un sistema socio-técnico de feedback**. Mitad técnica
(entornos, datos, pipelines, observabilidad) y mitad social (quién decide, quién es dueño, cómo se
documenta). Su valor no está en la cantidad de tests, sino en la **velocidad y fidelidad** con que
el equipo aprende si el producto se comporta como debe.

**[OPINIÓN] No existe una arquitectura universal.** La elección depende de dominio, riesgo,
arquitectura del producto, presupuesto de ejecución, frecuencia de entrega y capacidades del
equipo. Cualquiera que te venda una plantilla única te está vendiendo otra cosa.

**Qué NO es:**

- **No es una lista de herramientas.** Elegir Selenium, Playwright o Katalon antes de entender el
  riesgo es poner el carro delante del caballo (anti-patrón #3, más abajo).
- **No es "90% de cobertura".** La cobertura mide líneas ejecutadas, no comportamiento crítico
  verificado. <span class="em em--inferencia">INFERENCIA</span> Un test sin aserciones sube la cobertura y no prueba nada.
- **No es propiedad del equipo de QA.** Es una responsabilidad distribuida.

### 3.1. QA, testing, Quality Engineering, SDET y SRE

Estos términos significan cosas distintas en cada empresa. <span class="em em--decision">DECISIÓN</span> Los defino por **función**,
no por cargo, y no los presento como una jerarquía ni como títulos universales.

| Término | Función central | Pregunta que responde |
|---|---|---|
| **Testing** | Evaluar el producto ejecutándolo o inspeccionándolo | ¿Se comporta como esperamos en estos casos? |
| **QA (Quality Assurance)** | Enfoque en el proceso y la prevención de defectos | ¿Nuestro *proceso* produce calidad de forma repetible? |
| **Quality Engineering** | Diseñar el sistema de calidad como parte de la ingeniería | ¿Cómo hacemos que la calidad sea una propiedad de la arquitectura y no un paso final? |
| **SDET** | Construir la automatización y las herramientas de prueba como producto interno | ¿Cómo convierto controles en código mantenible, rápido y diagnosticable? |
| **SRE** | Confiabilidad en producción vía SLOs y error budgets | ¿El servicio cumple su objetivo y cuánto riesgo podemos gastar? |

<span class="em em--inferencia">INFERENCIA</span> QE y SRE comparten lenguaje: ambos razonan en **señales y objetivos**, no en
"pasa/no pasa". La diferencia práctica es el momento: QE trabaja sobre todo aguas arriba del
release; SRE, aguas abajo. La observabilidad y los SLOs son el puente entre ambos.

### 3.2. Qué NO cubre este artículo

No trato certificaciones, no doy una receta única de herramientas y no interpreto regulación
específica. Cuando menciono PCI DSS, OWASP o WCAG lo hago citando la fuente oficial y delimitando
versión y jurisdicción. **Nada de este blog es asesoramiento legal ni de cumplimiento.**

---

## 4. El mapa de componentes

Ocho componentes y, sobre todo, las relaciones entre ellos. Lo importante del diagrama no son las
cajas: es el **bucle** que las cierra.

<figure class="diagram">
  <img src="/blog/diagrams/de-qa-automation-a-quality-engineering-mapa-1.svg" alt="Diagrama: de-qa-automation-a-quality-engineering-mapa (1)" loading="lazy" decoding="async" />
</figure>

**Cómo leerlo.** El riesgo (`R`) alimenta la estrategia (`S`), que define un **portafolio** (`P`)
—no una pirámide fija— de controles en distintas capas. Ese portafolio no existe sin **datos y
entornos reproducibles** (`D`) y corre dentro de **CI/CD con quality gates** (`CI`)
(<span class="em em--hecho">HECHO</span> los pipelines de GitLab se configuran en `.gitlab-ci.yml` y pueden publicar artefactos
de los jobs, [GitLab CI/CD](https://docs.gitlab.com/ci/pipelines/), consultado 2026-07-09). La
**observabilidad** de producción (`O`) y los resultados de CI convergen en **evidencia** (`V`), que
**realimenta el riesgo** (`R`).

> **[INFERENCIA] La arista `V → R` es la que convierte una suite en una arquitectura.** Sin
> realimentación, no tenés un sistema de aprendizaje: tenés tests.

Dónde se profundiza cada componente en este blog:

| Componente | Colección que lo desarrolla |
|---|---|
| Estrategia y portafolio de controles | [Arquitectura de QE orientada a riesgo](/blog/arquitectura-quality-engineering-orientada-a-riesgo/) |
| API y contratos | **Contratos de API y sistemas distribuidos** |
| Frameworks de automatización | [Framework engineering](/blog/framework-engineering-suite-producto-interno/) |
| Calidad en mobile | **Mobile Quality Engineering** |
| Evaluación de sistemas de IA | **IA aplicada y evaluación de calidad** |
| CI/CD y quality gates | [Continuous quality](/blog/continuous-quality-pipeline-basado-en-riesgo/) |
| Observabilidad | **Observabilidad para QE** |
| Performance y SLOs | [Performance engineering](/blog/performance-engineering-de-la-carga-a-una-decision/) · [SLIs, SLOs y error budgets](/blog/slis-slos-error-budgets-sin-autoenganarse/) |
| Seguridad | **Threat modeling para QA** |
| Accesibilidad | **Accesibilidad como calidad** |
| Resiliencia | [Resiliencia y chaos engineering](/blog/resiliencia-chaos-engineering-evidencia-y-gobernanza/) |
| Liderazgo y operating model | [Operating model de calidad](/blog/liderar-calidad-sin-ser-cuello-de-botella-operating-model/) |
| Evidencia y escritura técnica | [Escribir sobre calidad con evidencia](/blog/escribir-sobre-calidad-con-evidencia-metodo-editorial/) |

**Prácticas de equipo.** El descubrimiento compartido importa tanto como la automatización.
<span class="em em--hecho">HECHO</span> BDD, según la documentación de Cucumber, se apoya en tres prácticas iterativas:
*Discovery* (explorar qué podría hacer el sistema), *Formulation* (documentar qué debería hacer) y
*Automation* (implementar qué hace realmente); y "hay mucho más en BDD que usar Cucumber"
([Cucumber — BDD](https://cucumber.io/docs/bdd/), consultado 2026-07-09). <span class="em em--opinion">OPINIÓN</span> El error más
común es saltar directo a *Automation* y llamar a eso "hacer BDD".

---

## 5. De riesgo de negocio a control y evidencia

El movimiento central de la disciplina, y el que faltó en el incidente de la sección 1:

**Riesgo de negocio → control preventivo → prueba o señal → momento de ejecución → evidencia → dueño.**

**Regla.** El riesgo se escribe en lenguaje de **negocio** ("un cliente puede ver dos transferencias
iguales"), nunca de implementación ("falta un índice único"). El control es la respuesta técnica;
la prueba es cómo sabés que el control funciona; la evidencia es lo que queda versionado.
<span class="em em--inferencia">INFERENCIA</span> Si no podés nombrar el riesgo, no sabés qué estás probando.

### 5.1. La matriz de Nexo Finanzas

Seis riesgos representativos. Los controles son <span class="em em--decision">DECISIÓN</span> ilustrativas; cualquier número está
marcado como <span class="em em--hipotesis">HIPÓTESIS</span> a medir, nunca como resultado.

| # | Riesgo (negocio) | Control preventivo | Prueba o señal | Momento | Evidencia | Dueño colaborativo |
|---|---|---|---|---|---|---|
| 1 | Una transferencia se duplica por reintento del cliente | Clave de idempotencia + `UNIQUE` en la tabla de transferencias | Test de integración que reenvía la misma request y espera **un** registro; señal: contador de colisiones de idempotencia | CI pre-merge + monitoreo en prod | Reporte JUnit publicado por el pipeline + query de conciliación | Backend + QE |
| 2 | Un usuario accede a la cuenta de otro | Autorización a nivel de recurso (*owner check*) | Test negativo de API: token de A pide `/accounts/{B}` y espera **403** | CI pre-merge + revisión de seguridad | Suite de tests negativos + hallazgos triados | Seguridad + Backend + QE |
| 3 | Cae una dependencia (proveedor de pagos) | Timeout + circuit breaker + degradación controlada | Escenario con la dependencia caída (stub/proxy de fallas); señal: tasa de error por dependencia | CI de integración + caos controlado en staging | Log del escenario + traza correlacionada por `traceId` | SRE + Backend |
| 4 | El servicio se degrada en el pico de cobros | Límites de recursos + backpressure + SLO de latencia | Prueba de carga contra un **SLO definido**; señal: consumo de error budget | Nightly / pre-release, entorno dedicado | Reporte de carga + definición del SLI y su ventana | SRE + QE |
| 5 | Un cambio de API rompe la app mobile | Contract testing consumer-driven | Verificación del contrato consumidor↔proveedor; gate `can-i-deploy` | CI de ambos lados | Contrato publicado + resultado de verificación | Backend + Mobile + QE |
| 6 | El flujo de transferencia no es operable por teclado | Diseño accesible conforme a criterios WCAG 2.2 AA | Test de navegación por teclado y foco visible + auditoría manual | CI de UI + auditoría por sprint | Reporte de a11y + checklist de criterios | Frontend + Diseño + QE |

**Notas de veracidad de la matriz:**

- **Riesgo 2.** <span class="em em--hecho">HECHO</span> *Broken Access Control* es la categoría **A01** del
  [OWASP Top 10:2025](https://owasp.org/Top10/2025/) (consultado 2026-07-09), edición que además
  **absorbió SSRF** dentro de esa categoría e incorporó *Software Supply Chain Failures* y
  *Mishandling of Exceptional Conditions*. OWASP es material de **concientización**, no una
  certificación ni un estándar de cumplimiento.
- **Riesgo 4.** Cualquier umbral de latencia es un objetivo a acordar con negocio, no un dato
  medido. <span class="em em--hecho">HECHO</span> Un SLO sin SLI, ventana y umbral no es interpretable
  ([Google SRE](https://sre.google/sre-book/service-level-objectives/)). Profundidad en
  [SLIs, SLOs y error budgets](/blog/slis-slos-error-budgets-sin-autoenganarse/).
- **Riesgo 5.** Ver [Consumer-Driven Contract Testing: cuándo sí, cuándo no](/blog/consumer-driven-contract-testing-cuando-si-cuando-no/).
- **Riesgo 6.** <span class="em em--hecho">HECHO</span> WCAG **2.2** es la Recomendación del W3C vigente (publicada el
  2023-10-05, con actualización en dic-2024) y es además norma ISO/IEC 40500:2025; **WCAG 3.0
  continúa como Working Draft** y no se espera Recomendación antes de 2028
  ([WCAG 2 Overview](https://www.w3.org/WAI/standards-guidelines/wcag/),
  [WCAG 3 Introduction](https://www.w3.org/WAI/standards-guidelines/wcag/wcag3-intro/), consultados
  2026-07-09). **El objetivo de conformidad es 2.2 nivel AA.**

### 5.2. Priorizar cuando no se puede cubrir todo

<span class="em em--opinion">OPINIÓN</span> Heurística barata: *impacto × probabilidad*, corregida por **detectabilidad** (¿cuánto
tardarías en enterarte si ocurre en producción?). Un riesgo de impacto medio que **el cliente
detecta antes que vos** sube de prioridad.

| Riesgo | Impacto | Probabilidad | Detectabilidad si falla | Prioridad (juicio declarado) |
|---|---|---|---|---|
| Transferencia duplicada | Alto (dinero) | Media | Baja | Máxima |
| Acceso a cuenta ajena | Muy alto (legal/confianza) | Baja | Muy baja | Máxima |
| Cambio incompatible de API | Alto | Media | Media | Alta |
| Caída de dependencia | Medio | Media-alta | Alta (alertas) | Alta |
| Degradación bajo carga | Medio | Estacional | Alta | Media |
| No operable por teclado | Medio (inclusión/legal) | Media | Baja | Media-alta |

Esta tabla es **juicio experto declarado**, no una medición. Su valor no es ser correcta: es ser
**explícita y discutible** con producto y seguridad, en vez de vivir en la cabeza de una persona.

---

## 6. Las capas y sus trade-offs (resumen)

<span class="em em--hecho">HECHO</span> *The Practical Test Pyramid*, de **Ham Vocke** (publicado en martinfowler.com el
2018-02-26), recomienda "escribir **muchos** tests unitarios pequeños y rápidos, **algunos** más
gruesos y **muy pocos** de alto nivel de extremo a extremo", y resume su moraleja en dos ideas:
"escribí tests con distinta granularidad" y "cuanto más alto el nivel, menos tests deberías tener"
([fuente](https://martinfowler.com/articles/practical-test-pyramid.html), consultado 2026-07-09).

**Es una heurística de proporción, no una cuota matemática.** Cada capa negocia cuatro variables:

| Capa | Velocidad | Fidelidad | Costo de mantenimiento | Diagnóstico (¿dice *qué* se rompió?) |
|---|---|---|---|---|
| Unitaria / componente | Alta | Baja | Bajo | Preciso |
| API / contrato | Media | Media-alta | Medio | Bueno |
| UI extremo a extremo | Baja | Alta | Alto | Difuso |

> **[INFERENCIA] "Más tests" no es "más confianza".** La confianza es *información útil por unidad
> de costo*. Quinientos E2E frágiles entregan información ambigua a costo alto y, peor, entrenan al
> equipo a **ignorar los rojos** ("otra vez el flaky"). Eso **resta** confianza. Treinta contract
> tests bien elegidos pueden entregar más.

La discusión completa —incluida la limitación de la pirámide en sistemas distribuidos, donde el
riesgo vive en los bordes entre servicios— está en
[la arquitectura por capas](/blog/arquitectura-quality-engineering-orientada-a-riesgo/#6-la-arquitectura-por-capas-velocidad-fidelidad-y-costo)
y en la colección de **contratos de API**.

### 6.1. Un ADR breve: propiedad de herramientas

Cuando varias herramientas cubren zonas solapadas, el anti-patrón es **implementar el mismo flujo en
todas**. La alternativa es asignar **propiedad** y documentarla.

```markdown
# ADR-0009: Propiedad de herramientas de prueba de UI y mobile
- Estado: Aceptada · Fecha: 2026-07-09
- Decisores: Lead QE, Backend Lead, Mobile Lead, EM

## Contexto
Nexo Finanzas prueba flujos en web y mobile. Katalon tiene bajo costo de autoría y buena cobertura
cross-channel; Selenium (web) y Appium (mobile) dan control fino. Sin una decisión explícita, cada
equipo reimplementa el mismo flujo en las tres: el mantenimiento se multiplica y las señales se
contradicen cuando una falla y la otra no.

## Decisión
- **Katalon es dueño del smoke cross-channel**: pocos flujos críticos (login, ver saldo, iniciar
  transferencia), ejecutados igual en web y mobile, como verificación rápida de "el producto está
  vivo en todos los canales".
- **Selenium y Appium son dueños de la regresión profunda**: casos de borde, estados de error,
  operabilidad por teclado, escenarios que exigen control fino del cliente.
- Un flujo vive en **una sola** capa de propiedad. La regresión cubre variaciones, no el happy path
  que ya cubre el smoke.

## Alternativas consideradas
1. Solo Selenium/Appium: máximo control, mayor costo de autoría del smoke cross-channel.
2. Solo Katalon: menor costo de entrada, menos control en bordes y dependencia de licenciamiento
   comercial para ejecutar en CI.
3. Las tres para todo (statu quo): rechazada por duplicación y señales contradictorias.

## Consecuencias
- (+) Menos duplicación; cada fallo apunta a un dueño claro.
- (−) Exige disciplina: revisar en cada PR que un flujo no se duplique entre capas.
- (−) Dependencia del licenciamiento de Katalon para el smoke en CI; revisar costo por release.
- **Señal de revisión**: si el smoke crece para cubrir bordes, la frontera se erosionó y hay que
  rediscutir este ADR.
```

<span class="em em--decision">DECISIÓN</span> Este ADR es ilustrativo y ficticio. **No afirmo que Katalon sea la elección correcta
para tu contexto.** El método para escribir la comparación sin coronar un ganador universal está en
[«Katalon vs Selenium» no tiene ganador universal](/blog/adr-seleccion-herramienta-katalon-selenium/), que incluye
una plantilla MADR reutilizable.

**Relación con otros ADRs del portfolio.** Este ADR decide **qué herramienta es dueña de qué
alcance**. Es complementario —no redundante— con
**ADR-002 de `nexo-wallet-mobile`**,
que decide **qué nivel de prueba es dueño de qué verificación** (unit / API / E2E). Uno reparte
herramientas; el otro reparte niveles. Aplicar solo uno de los dos deja abierta la puerta a la
duplicación.

**Estado de las herramientas al 2026-07-09** (verificar antes de reutilizar):
<span class="em em--hecho">HECHO</span> Selenium está en su línea **4.x** ([Downloads](https://www.selenium.dev/downloads/)).
<span class="em em--hecho">HECHO</span> La línea activa de Appium es **3.x**; **Appium 2 llegó a fin de vida**
([Releases](https://github.com/appium/appium/releases)) — para proyectos nuevos, Appium 3.x.
Sobre Katalon: <span class="em em--hecho">HECHO</span> existe un tier gratuito de autoría, mientras que la ejecución a escala
(Runtime Engine) y las capas Enterprise/TestOps son comerciales
([katalon.com/pricing](https://katalon.com/pricing)). **No publico cifras de precio**: las que
circulan en blogs de terceros y resellers no son oficiales.

---

## 7. La ruta de estudio (resumen)

Aprender esto tiene un orden, porque hay **dependencias de conocimiento**. No podés diseñar
contratos sin HTTP/JSON, ni razonar sobre idempotencia sin transacciones, ni optimizar performance
antes de tener entornos reproducibles.

<figure class="diagram">
  <img src="/blog/diagrams/de-qa-automation-a-quality-engineering-mapa-2.svg" alt="Diagrama: de-qa-automation-a-quality-engineering-mapa (2)" loading="lazy" decoding="async" />
</figure>

<span class="em em--inferencia">INFERENCIA</span> Saltarse los fundamentos produce *automatización de culto a la carga*: tests que
existen, que corren, y que nadie sabe qué riesgo cubren.

El desarrollo completo —qué estudiar en cada etapa, **cómo verificar que estás listo** para la
siguiente, qué podés posponer y qué construir para probar dominio— está en el artículo satélite:
**[Ruta de estudio para SDET: prerrequisitos, orden y verificación](/blog/ruta-de-estudio-sdet-prerrequisitos-verificacion/)**.

---

## 8. Qué demuestra madurez real (y qué solo la aparenta)

<span class="em em--inferencia">INFERENCIA</span> Un badge verde no prueba cobertura. Una captura no prueba reproducibilidad. Una
métrica sin definición no informa nada.

| Aparente evidencia | Qué **no** prueba | Por qué |
|---|---|---|
| Badge verde | Cobertura ni comportamiento crítico | Dice que *algo* pasó, no *qué* se probó ni si importa |
| Captura de la suite en verde | Reproducibilidad | Sin versión, entorno ni datos, no se puede repetir |
| "95% de cobertura" | Calidad | Mide líneas ejecutadas, no riesgos verificados |
| "Corrimos 3.000 casos" | Riesgo cubierto | Contar casos es una métrica de vanidad |

Lo que **sí** demuestra madurez en un repositorio:

- `docs/quality/test-strategy.md` — **decisiones**, no pasos.
- `docs/quality/risk-matrix.md` — la matriz riesgo→control→evidencia de la sección 5.
- `docs/adr/` — decisiones versionadas **con consecuencias**.
- `docs/architecture/quality-map.mmd` — el diagrama de la sección 4.
- Un pipeline que **publica artefactos** de prueba, no solo un semáforo.
- `docs/onboarding/quality-onboarding.md` — que una persona nueva reproduzca todo en un día.

Profundidad: [Escribir sobre calidad con evidencia](/blog/escribir-sobre-calidad-con-evidencia-metodo-editorial/),
[Publicar evidencia sin filtrar secretos](/blog/publicar-evidencia-sin-filtrar-secretos/) y
[Métricas y trazabilidad de calidad](/blog/metricas-y-trazabilidad-de-calidad/).

<span class="em em--hecho">HECHO</span> Para la evidencia de producción, OpenTelemetry es hoy el estándar de facto: es un
**proyecto graduado de la CNCF** desde mayo de 2026, con las señales de trazas, métricas y logs
estables ([OpenTelemetry](https://opentelemetry.io/docs/what-is-opentelemetry/),
[Status](https://opentelemetry.io/status/), consultados 2026-07-09).

---

## 9. Anti-patrones y señales de que la arquitectura necesita revisión

| Anti-patrón | Causa | Consecuencia | Alternativa concreta |
|---|---|---|---|
| Tratar la pirámide como regla numérica | Confundir heurística con cuota | Se escriben tests para cumplir un ratio, no para cubrir riesgo | Elegir capa por riesgo y por calidad de diagnóstico (§6) |
| Duplicar el mismo flujo en todas las herramientas | Miedo a "no cubrir" | Mantenimiento multiplicado; señales que se contradicen | ADR de propiedad de herramientas (§6.1) |
| Elegir herramientas antes de entender riesgo y producto | Presión por "empezar a automatizar ya" | Automatización que no mapea a ningún riesgo | Primero la matriz (§5), después el tooling |
| Medir casos automatizados en vez de comportamiento crítico cubierto | Contar casos es fácil | Métrica de vanidad; falsa sensación de seguridad | Medir riesgos cubiertos con señales confiables (§8) |
| Centralizar toda la calidad en una persona o equipo | "QA es responsable de la calidad" | Cuello de botella y difusión de responsabilidad | Dueños colaborativos por riesgo (§5.1) |
| Documentar pasos sin documentar decisiones ni consecuencias | Copiar plantillas a medias | Nadie entiende **por qué** se hizo así | ADRs con contexto, alternativas y consecuencias |

**Señales de que hay que revisar la arquitectura:** la suite tarda tanto que se corre "solo de
noche"; nadie confía en un rojo; se agregan tests después de cada incidente pero el riesgo nunca se
escribe; el smoke crece hasta parecerse a la regresión; una sola persona sabe levantar el entorno.

---

## 10. Checklist de autoevaluación

- [ ] Puedo **dibujar** mi arquitectura de calidad con relaciones, no listar herramientas.
- [ ] Cada control que mantengo responde a un **riesgo nombrado en lenguaje de negocio**.
- [ ] Sé qué capa cubre qué, y por qué (velocidad / fidelidad / costo / diagnóstico).
- [ ] Mis entornos y datos se levantan con **un comando** y son reproducibles.
- [ ] Mi pipeline **publica artefactos**, no solo un color.
- [ ] Tengo al menos un **ADR con consecuencias** y señal de revisión.
- [ ] Puedo correlacionar un fallo de producción con una traza.
- [ ] Cada riesgo tiene **dueños colaborativos**, no un único responsable.
- [ ] Todo número no medido está marcado como **hipótesis**.
- [ ] Existe la arista `evidencia → riesgo`: algo de producción realimenta la matriz.

---

## 11. Próximos pasos: 30 / 60 / 90 días

<span class="em em--decision">DECISIÓN</span> Plan incremental, pensado para hacerse **junto al equipo**, no en soledad.

| Ventana | Objetivo | Entregable verificable |
|---|---|---|
| **30 días** | Hacer explícito lo implícito | `test-strategy.md` + `risk-matrix.md` con 5 riesgos + entorno con `docker compose up` + 1 ADR |
| **60 días** | Convertir riesgo en control con evidencia | 3 riesgos con pruebas en CI que **publican artefactos** + 1 traza instrumentada + guía de onboarding reproducible |
| **90 días** | Cerrar el bucle | 1 SLO con su SLI y ventana + 1 quality gate atado a la matriz + revisión de arquitectura de calidad con producto, seguridad y desarrollo (no solo QA) |

Empezá con **cinco riesgos, no cincuenta**. La matriz es útil cuando se revisa, no cuando se archiva.

---

## 12. Qué aprendimos

Una suite verde es una afirmación sobre lo que **decidimos** probar. Quality Engineering es el
sistema que toma esas decisiones con criterio, las ejecuta en el momento correcto y **aprende del
resultado**. La automatización es una consecuencia de ese diseño, no su punto de partida.

El incidente de la sección 1 no se evita con más tests. Se evita nombrando el riesgo, eligiendo un
control preventivo (idempotencia), verificándolo en la capa correcta (integración, no E2E),
ejecutándolo en el momento correcto (pre-merge) y dejando evidencia que alguien más pueda reproducir.

### Sigue leyendo

- **En esta colección:** [Ruta de estudio para SDET: prerrequisitos, orden y verificación](/blog/ruta-de-estudio-sdet-prerrequisitos-verificacion/)
- **Profundidad en arquitectura y gates:** [Arquitectura de QE orientada a riesgo](/blog/arquitectura-quality-engineering-orientada-a-riesgo/)
- **Profundidad en contratos:** **Contratos de API y sistemas distribuidos**
- **Profundidad en evidencia:** [Escribir sobre calidad con evidencia](/blog/escribir-sobre-calidad-con-evidencia-metodo-editorial/)

---

> **Avisos.** *Nexo Finanzas* es ficticio; todos los datos, montos y tablas son sintéticos. Las
> versiones y estándares citados fueron verificados el **2026-07-09**: verificá vigencia antes de
> reutilizarlos. Las menciones a OWASP, WCAG, PCI DSS o cualquier organismo son informativas, están
> delimitadas por versión y jurisdicción, y **no constituyen asesoramiento legal ni de cumplimiento**.
> Los diagramas Mermaid fueron revisados por sintaxis pero **no renderizados** en el entorno de
> redacción.

