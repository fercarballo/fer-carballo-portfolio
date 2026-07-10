---
title: "'Katalon vs Selenium' no tiene ganador universal: cómo escribir una ADR de selección de herramienta"
description: "Cómo convertir la pregunta 'Katalon o Selenium' en una ADR contextual que compara objetivo, costo, mantenibilidad, habilidades y cobertura, sin declarar un ganador universal. Incluye plantilla MADR reutilizable."
pubDate: 2026-07-09
tags: ["adr", "decision-record", "selenium", "katalon", "automatizacion", "trade-offs", "sdet", "documentacion"]
cluster: "15"
clusterTitle: "Investigación técnica y escritura basada en evidencia"
type: "satelite"
order: 3
repo: "nexo-cross-channel-regression"
icon: "book"
iconHue: 220
readingLevel: "Intermedio"
prerequisites: "QA/SDET con Git y experiencia en automatización de UI"
---
> Satélite del pilar **[Escribir sobre calidad con evidencia](/blog/escribir-sobre-calidad-con-evidencia-metodo-editorial/)**. Cubre los claims de tipo **"decisión de diseño"**: cómo documentarlos para que sobrevivan a una revisión de pares. Etiquetas: <span class="em em--hecho">HECHO</span>, <span class="em em--inferencia">INFERENCIA</span>, <span class="em em--decision">DECISIÓN</span>, <span class="em em--opinion">OPINIÓN</span>.

## El problema: el post que corona un ganador universal

*"Katalon es mejor que Selenium."* (o al revés). Es uno de los claims más repetidos y menos defendibles en blogs de QA. <span class="em em--inferencia">INFERENCIA</span> El problema no es la conclusión, es la **forma**: presenta como un hecho universal algo que es, en realidad, una **decisión dependiente del contexto**. La misma elección puede ser correcta para un equipo y equivocada para otro que tiene otros objetivos, otro presupuesto y otras habilidades.

La herramienta editorial correcta para este tipo de claim no es un post de "versus", sino una **ADR (Architecture/Any Decision Record)**: un documento breve, versionado, que registra *qué* se decidió, *en qué contexto*, *qué alternativas* se evaluaron, *con qué criterios* y *qué consecuencias* trae. En este artículo escribimos una ADR real para el equipo ficticio de **Nexo Finanzas** y, en el proceso, mostramos por qué "el ganador universal" es un anti-patrón.

---

## Prerrequisitos y glosario

- **ADR:** documento corto que captura una decisión arquitectónica/técnica y su justificación. <span class="em em--hecho">HECHO</span> El formato nace de la comunidad de *architecture decision records*; una plantilla ampliamente usada es **MADR** (*Markdown Any Decision Records*). Fuentes: [adr.github.io](https://adr.github.io/) y el repositorio [MADR](https://github.com/adr/madr).
- **Estado de una ADR:** `Proposed` → `Accepted` → (con el tiempo) `Deprecated` o `Superseded` por otra ADR.
- **Selenium:** <span class="em em--hecho">HECHO</span> proyecto open source de automatización de navegadores; su API `WebDriver` implementa el estándar W3C. Línea actual 4.x. Fuente primaria: [selenium.dev](https://www.selenium.dev/) y [downloads/releases](https://www.selenium.dev/downloads/).
- **Katalon:** <span class="em em--hecho">HECHO</span> plataforma comercial de automatización (con edición gratuita y planes pagos) construida históricamente sobre Selenium/Appium. Fuente primaria: [docs.katalon.com](https://docs.katalon.com/).

> <span class="em em--hecho">HECHO</span> Verificá versiones y modelo de licenciamiento el día de publicar: Selenium libera con frecuencia (línea 4.x, releases mensuales) y los planes/edición gratuita de Katalon cambian. Comprobé ambas fuentes el 2026-07-09; no fijo un número de versión exacto porque se mueve rápido — remito a las páginas oficiales de releases.

---

## Concepto: por qué "el mejor" es un error de categoría

**[OPINIÓN, fundamentada]** Decir "X es la mejor herramienta" comete un error de categoría: trata una función de varias variables (objetivo, presupuesto, skills del equipo, tipo de app, horizonte de mantenimiento) como si fuera una constante. La pregunta bien planteada nunca es *"¿cuál es mejor?"* sino *"¿cuál es mejor **para nosotros, dado este contexto y estos criterios**?"*.

Una ADR fuerza esa reformulación porque su primera sección obligatoria es el **contexto**. Sin contexto, no hay decisión: hay preferencia.

<figure class="diagram">
  <img src="/blog/diagrams/adr-seleccion-herramienta-katalon-selenium-1.svg" width="1795" height="85" alt="Diagrama: adr-seleccion-herramienta-katalon-selenium (1)" loading="lazy" decoding="async" />
</figure>

El último nodo importa: <span class="em em--decision">DECISIÓN</span> una ADR no es permanente. Se revisa cuando cambia el contexto (el equipo aprende TypeScript, el presupuesto se recorta, la app pasa de web a móvil). Por eso lleva estado y fecha.

---

## Concepto: los criterios, sin ganador preasignado

Estos son los criterios que el prompt pide comparar, definidos operativamente. <span class="em em--inferencia">INFERENCIA</span> La clave es que **ninguno gana solo**: cada uno tiene un peso que depende del equipo.

| Criterio | Pregunta que responde | Por qué puede inclinar la balanza a un lado u otro |
|---|---|---|
| **Objetivo** | ¿Qué tenemos que automatizar? (web, API, móvil, e2e) | Determina si necesitás una plataforma integrada o control de código fino. |
| **Costo (TCO)** | ¿Licencias + infraestructura + tiempo de setup + mantenimiento? | Una herramienta "gratis" puede costar más en horas de mantenimiento; una paga puede ahorrar setup. |
| **Mantenibilidad** | ¿Cómo envejece la suite? ¿Diff en Git, refactors, revisión en PR? | Código plano se versiona y revisa mejor; proyectos binarios/propietarios son más opacos en un diff. |
| **Habilidades del equipo** | ¿El equipo programa o es mayormente manual/low-code? | Selenium exige programar; Katalon baja la barrera con grabación/low-code. |
| **Cobertura** | ¿Navegadores, plataformas, integraciones, reportes, CI? | Define qué podés probar de verdad y qué queda fuera. |

<span class="em em--opinion">OPINIÓN</span> No pongas números de "puntaje" inventados en estas celdas. Los rankings numéricos falsos ("Selenium 8/10, Katalon 9/10") aparentan rigor y no lo tienen. Preferí describir el trade-off en prosa y, si ponderás, **declará quién ponderó y con qué justificación**.

---

## Implementación: la ADR contextual (plantilla + ejemplo)

Adoptamos la plantilla **MADR** por ser Markdown puro, versionable y revisable en un PR. Fuente: [MADR](https://github.com/adr/madr). Este es el archivo `docs/adr/0003-framework-automatizacion-ui.md` para Nexo Finanzas (contexto **ficticio**):

```markdown
# 0003 - Framework de automatización de UI para el checkout de pagos

- Estado: Accepted
- Fecha: 2026-07-09
- Decisores: equipo QA de Nexo Finanzas (rol Staff QE como facilitador)
- Reemplaza a: —
- Reemplazada por: —

## Contexto y problema

Necesitamos automatizar los flujos de UI del checkout de pagos (web,
Chrome + Firefox) para regresión en cada release. Restricciones REALES
del equipo (ficticias para este ejemplo):
- 3 QA: 2 con Java/JS, 1 mayormente manual.
- Presupuesto de herramientas: limitado; preferencia por open source.
- La suite debe vivir en el monorepo y revisarse en pull requests.
- Horizonte: mantener la suite >= 2 años.

## Criterios de decisión

1. Se integra al monorepo y se revisa en PR (diff legible).
2. Costo total de propiedad bajo (licencias + mantenimiento).
3. Aprovecha las habilidades actuales del equipo (Java/JS).
4. Cobertura de Chrome + Firefox y ejecución en CI headless.
5. Curva de adopción tolerable para la persona con perfil manual.

## Opciones consideradas

### Opción A - Selenium (WebDriver, W3C) + Java/JS
- A favor: código plano versionable; estándar W3C; sin costo de licencia;
  máximo control; gran comunidad.
- En contra: más código base propio (esperas, page objects, reportes);
  curva alta para el perfil manual; el setup de reporting/paralelismo es
  responsabilidad del equipo.

### Opción B - Katalon Studio
- A favor: grabación/low-code que baja la barrera al perfil manual;
  reportes e integraciones "de fábrica"; setup inicial rápido.
- En contra: proyecto con formato propietario (diffs menos legibles en PR);
  el modelo de licenciamiento de features avanzadas puede implicar costo;
  menor control fino sobre esperas/arquitectura.

## Decisión

Elegimos **Opción A (Selenium)** PARA ESTE CONTEXTO, porque los criterios
1 (diff en PR) y 3 (skills Java/JS) pesan más para este equipo, y el costo
de licencia es una restricción dura. Aceptamos el costo de construir
nuestra capa de esperas, page objects y reporting.

Esta decisión NO afirma que Selenium sea "mejor" que Katalon en general.
Para un equipo mayormente manual, sin presupuesto de tiempo para construir
framework y con tolerancia a formato propietario, la Opción B sería
razonable o preferible.

## Consecuencias

- Positivas: suite versionada y revisable; cero costo de licencia; control total.
- Negativas / costos: debemos invertir ~X sprints en la capa base
  (esperas, page objects, reporte JUnit para CI); la persona manual
  necesita acompañamiento en JS. (X = estimación del equipo, no dato medido.)
- Riesgos: si el equipo pierde a los perfiles con código, revisar esta ADR.

## Revisión

Revisar si: (a) cambia la composición del equipo, (b) aparece requerimiento
móvil nativo, (c) el costo de mantenimiento del framework propio supera
el de una licencia. 
```

Explicación de las secciones que más se omiten (y no deberían):

- **Contexto** → es lo que convierte una preferencia en una decisión. Es la sección que un post de "versus" nunca tiene.
- **La decisión declara su propio alcance** → la frase *"NO afirma que Selenium sea mejor en general"* es la vacuna contra el ganador universal. <span class="em em--decision">DECISIÓN</span> Incluirla explícitamente es lo que separa una ADR honesta de un post disfrazado de ADR.
- **Consecuencias con costos** → toda decisión buena cuesta algo. Si tu ADR solo lista ventajas, no es una decisión, es publicidad.
- **Revisión** → nombra las condiciones bajo las cuales la decisión deja de valer.

---

## Verificación: ¿tu ADR resiste una revisión de pares?

Antes de publicar, pasá la ADR por estas preguntas:

1. **¿Un lector de otro equipo entendería por qué esta decisión podría no aplicarle?** Si no, te falta contexto o alcance.
2. **¿Cada "a favor / en contra" es verificable o es marketing?** "Estándar W3C" es verificable ([WebDriver W3C](https://www.w3.org/TR/webdriver/)); "es más rápido" sin medición no lo es —y si querés sostenerlo, necesitás un [experimento](/blog/hipotesis-medible-experimento-reproducible/).
3. **¿Distinguiste hechos de la herramienta (licencia, estándar) de tus inferencias (mantenibilidad)?** El pilar exige esa separación.
4. **¿La sección de consecuencias incluye costos, no solo beneficios?**

---

## Límites y trade-offs de las ADR

- <span class="em em--opinion">OPINIÓN</span> Una ADR **no reemplaza** una prueba de concepto. Documenta la decisión, no la valida empíricamente. Si el criterio decisivo es rendimiento o estabilidad, necesitás además un experimento.
- **Puede envejecer en silencio.** Una ADR `Accepted` que nadie revisa se vuelve folklore. Por eso el estado y la sección "Revisión" son parte del contrato.
- **El exceso de ADRs también es deuda.** No documentes con una ADR cada `npm install`. Reservalas para decisiones con alternativas reales y consecuencias que otro querría entender.

---

## Anti-patrones (causa → consecuencia → alternativa)

- **Coronar un ganador universal** ("Katalon es mejor que Selenium").
  *Causa:* generalizar la propia experiencia. *Consecuencia:* el claim se cae ante cualquier equipo con otro contexto. *Alternativa:* ADR contextual con alcance declarado.

- **Citar una herramienta para justificar una decisión que depende del contexto.**
  *Causa:* usar "la comunidad usa X" como criterio único. *Consecuencia:* la popularidad no es adecuación a *tu* problema. *Alternativa:* ponderá criterios propios (objetivo, costo, skills, cobertura) y declará los pesos.

- **Puntajes numéricos inventados** ("8/10 vs 9/10").
  *Causa:* simular rigor cuantitativo. *Consecuencia:* falsa precisión que nadie puede reproducir. *Alternativa:* trade-offs en prosa; si medís algo, hacelo con un experimento reproducible y su fuente.

- **ADR sin consecuencias negativas.**
  *Causa:* querer "vender" la decisión. *Consecuencia:* oculta el costo real y sorprende al equipo después. *Alternativa:* obligate a listar al menos un costo y un riesgo.

---

## Conexión accionable con Nexo Finanzas

```text
docs/adr/
  0000-template.md                      # plantilla MADR
  0003-framework-automatizacion-ui.md   # la ADR de este artículo
  0007-idempotency-key-store.md         # referenciada desde el pilar
CONTRIBUTING.md                          # regla: decisiones técnicas => ADR
```

Acciones:

1. Copiá la plantilla MADR a `docs/adr/0000-template.md` y numerá secuencialmente.
2. Agregá a `CONTRIBUTING.md`: *"Toda elección entre herramientas o frameworks se documenta como ADR con contexto, alternativas y consecuencias; no se aceptan posts de 'X vs Y' sin ADR."*
3. Enlazá cada ADR desde la tabla de claims del [pilar](/blog/escribir-sobre-calidad-con-evidencia-metodo-editorial/) como respaldo de los claims de tipo "decisión".

> **Nota de cobertura y seguridad de API.** Si la ADR incluye "cobertura" para pruebas de API, anclá el alcance a un estándar: por ejemplo, qué riesgos del **[OWASP API Security Top 10 (2023)](https://owasp.org/API-Security/)** cubren tus pruebas y cuáles no. Eso convierte "buena cobertura" (opinión) en un claim verificable contra una referencia. Esto no es asesoramiento de cumplimiento; es trazabilidad técnica.

---

## Qué aprendimos / próximos pasos

- "¿Cuál es mejor?" es la pregunta equivocada; "¿cuál es mejor para nosotros, con estos criterios?" es la correcta.
- Una ADR convierte una preferencia en una decisión auditable: contexto → criterios → opciones → decisión con alcance → consecuencias → revisión.
- El antídoto contra el ganador universal es una frase: declarar explícitamente **para qué contexto** vale la decisión y para cuál no.

**Continuá con:**
- El **[pilar](/blog/escribir-sobre-calidad-con-evidencia-metodo-editorial/)** para registrar esta decisión en la tabla de claims.
- El **[satélite de experimentos](/blog/hipotesis-medible-experimento-reproducible/)** si tu criterio decisivo (velocidad, estabilidad) necesita medición, no solo argumento.
- El **[satélite de seguridad](/blog/publicar-evidencia-sin-filtrar-secretos/)** antes de publicar cualquier captura o reporte de tu suite.

---

## Checklist final

- [ ] La ADR tiene contexto explícito (equipo, presupuesto, restricciones).
- [ ] Hay al menos dos opciones reales con "a favor" y "en contra".
- [ ] La decisión **declara su alcance**: para qué contexto vale y para cuál no.
- [ ] Las consecuencias incluyen costos y riesgos, no solo beneficios.
- [ ] Los hechos de la herramienta (licencia, estándar, versión) están enlazados a fuentes primarias y verificados por fecha.
- [ ] No hay puntajes numéricos inventados; los trade-offs están en prosa.
- [ ] La ADR tiene estado y condición de revisión.
- [ ] Si afirmás "cobertura", la anclaste a una referencia (p. ej. OWASP API Security Top 10).

---

*Nota de veracidad: el contexto de Nexo Finanzas es ficticio. Los hechos sobre Selenium (estándar W3C, línea 4.x, open source) y Katalon (plataforma comercial con edición gratuita) fueron verificados contra sus fuentes primarias el 2026-07-09; confirmá versiones y licenciamiento antes de publicar. Este artículo no es asesoramiento comercial ni de cumplimiento.*

