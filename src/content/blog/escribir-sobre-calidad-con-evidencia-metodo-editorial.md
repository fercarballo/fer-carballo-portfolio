---
title: "Escribir sobre calidad con evidencia: el método editorial que convierte tu blog y tu GitHub en autoridad técnica"
description: "Un método editorial para SDET/QA: clasificar claims, jerarquizar fuentes, investigar antes de escribir y publicar evidencia reproducible. Deja de escribir opiniones con capturas."
pubDate: 2026-07-09
tags: ["quality-engineering", "technical-writing", "evidencia", "adr", "sdet", "documentacion", "credibilidad"]
cluster: "15"
clusterTitle: "Investigación técnica y escritura basada en evidencia"
type: "pilar"
order: 1
icon: "book"
iconHue: 220
readingLevel: "Intermedio"
prerequisites: "SDET / QA Automation con base en Git, Markdown y CI/CD"
---
> **Cómo leer las afirmaciones de este artículo.** A lo largo del texto marco cada afirmación relevante con una etiqueta: <span class="em em--hecho">HECHO</span> (verificable en una fuente primaria citada), <span class="em em--inferencia">INFERENCIA</span> (razonamiento propio a partir de hechos), <span class="em em--decision">DECISIÓN</span> (elección de diseño con alternativas y costo) y <span class="em em--opinion">OPINIÓN</span> (juicio profesional discutible). Es exactamente el hábito que este artículo enseña, aplicado a sí mismo.

## El problema: un blog que promete "mejores prácticas" y no prueba ninguna

Imaginá el blog típico de un perfil QA/SDET que busca su próximo rol. Tiene entradas con títulos como *"Por qué Cypress es mejor que Selenium"*, *"JMeter mejora el rendimiento de tu API"* o *"Las 10 mejores prácticas de automatización"*. Cada post abre con una definición de diccionario, sigue con dos capturas de pantalla sin sanear y cierra con una conclusión categórica. No hay versión de la herramienta, no hay hardware, no hay hipótesis, no hay datos, no hay contexto de negocio y no hay una sola fuente primaria.

Ese blog no es neutro: **resta** credibilidad. <span class="em em--inferencia">INFERENCIA</span> En una entrevista técnica o en una revisión de pares, un post con una afirmación categórica y sin evidencia es una invitación a preguntar *"¿comparado con qué, en qué condiciones, con qué datos?"* — y si no hay respuesta, el contenido se vuelve un pasivo. El objetivo de este artículo es darte un **método editorial reproducible** para que cada cosa que publiques sume: que un revisor pueda seguir tu razonamiento, repetir tu experimento y confiar en tus límites.

La tesis es simple y la vamos a defender con ejemplos:

> <span class="em em--opinion">OPINIÓN</span> La autoridad técnica no proviene de afirmar que algo funciona, sino de delimitar una hipótesis, ejecutar un método reproducible, conservar la evidencia, citar fuentes y explicar la incertidumbre.

Este es el **artículo pilar** de una colección de cuatro. Los tres satélites profundizan en piezas concretas del método:

- **[Experimento reproducible →](/blog/hipotesis-medible-experimento-reproducible/)** cómo pasar de *"JMeter mejora el performance"* a una hipótesis medible.
- **[ADR de selección de herramienta →](/blog/adr-seleccion-herramienta-katalon-selenium/)** cómo escribir la decisión *"Katalon vs Selenium"* sin declarar un ganador universal.
- **[Publicar evidencia sin filtrar secretos →](/blog/publicar-evidencia-sin-filtrar-secretos/)** cómo sanear reportes, capturas y artefactos en un repo público.

---

## Prerrequisitos y glosario mínimo

Para seguir este artículo necesitás poder leer y escribir Markdown, usar Git a nivel de commits y ramas, y entender qué es un pipeline de CI/CD. No necesitás dominar ninguna herramienta específica.

Glosario que usaremos:

| Término | Definición operativa |
|---|---|
| **Fuente primaria** | El origen autoritativo de una afirmación: el estándar, la especificación, la documentación oficial del proyecto, el repositorio oficial, el paper. Ejemplo: la documentación de Apache JMeter, no un tutorial de terceros sobre JMeter. |
| **Fuente secundaria** | Un intermediario que interpreta la primaria: un post de blog, un curso, un video. Útil para aprender, insuficiente para respaldar un claim. |
| **Claim (afirmación)** | Cualquier oración que sostiene que algo es cierto, mejor, más rápido o recomendable. |
| **Reproducible** | Que otra persona, con tu repositorio, tus comandos y tu descripción de entorno, puede obtener un resultado comparable. |
| **ADR** | *Architecture/Any Decision Record*: documento breve que registra una decisión, sus alternativas y sus consecuencias. |
| **SLI / SLO** | *Service Level Indicator / Objective*: una medida cuantitativa del servicio y su objetivo. Los definimos con la fuente primaria de Google SRE más abajo. |

Todos los ejemplos usan un portfolio ficticio llamado **Nexo Finanzas** (una fintech de pagos imaginaria). **Ningún dato, endpoint, credencial o métrica de Nexo Finanzas es real**: es un andamiaje para mostrar la estructura de repositorio y de evidencia.

---

## Concepto: qué cuenta como claim técnico y cómo clasificarlo

El primer músculo editorial es **no tratar todas tus oraciones igual**. Una guía honesta separa cinco tipos de afirmación, porque cada tipo se respalda distinto:

1. **Hecho externo** → se respalda **citando la fuente primaria**. Ejemplo: *"OpenTelemetry graduó en la CNCF."*
2. **Inferencia** → se respalda **mostrando el razonamiento y sus límites**. Ejemplo: *"Como el trazado ya es estable, migrar la instrumentación tiene bajo riesgo de romperse por cambios de spec."*
3. **Decisión de diseño** → se respalda con un **ADR**: alternativas consideradas, criterios y consecuencias.
4. **Resultado experimental** → se respalda **publicando método, datos y entorno** (ver el satélite de experimentos).
5. **Opinión / juicio profesional** → se declara **como tal**, idealmente con la experiencia o el principio que la sustenta.

Y hay un sexto elemento transversal que no es un claim sino una obligación: **la limitación**. Todo hecho medido, toda inferencia y toda decisión tienen un borde donde dejan de valer. Nombrarlo es parte de la evidencia, no una debilidad.

El siguiente diagrama es el árbol de decisión que aplico a cada oración dudosa antes de publicarla. **Nota sobre los diagramas:** están escritos en Mermaid con etiquetas sin acentos para maximizar compatibilidad entre renderers (GitHub, GitLab, Docusaurus). No pude renderizarlos en el entorno donde escribo, así que los mantengo simples y revisables a ojo; validá el render en tu plataforma antes de publicar.

<figure class="diagram">
  <img src="/blog/diagrams/escribir-sobre-calidad-con-evidencia-metodo-editorial-1.svg" width="1010" height="754" alt="Diagrama: escribir-sobre-calidad-con-evidencia-metodo-editorial (1)" loading="lazy" decoding="async" />
</figure>

### La tabla de claims (claims ledger)

La herramienta central de este método es una **tabla de claims**: un registro donde, antes de escribir el post, listás cada afirmación fuerte, la clasificás, indicás qué la respalda y con qué confianza. <span class="em em--decision">DECISIÓN</span> Elijo mantenerla como un archivo versionado (`docs/evidence/claims-ledger.md`) en vez de notas sueltas, porque así queda en el historial de Git junto al post y se puede revisar en un *pull request*.

Ejemplo real de tabla para un post sobre **idempotencia** en la API de pagos de Nexo Finanzas:

| # | Claim | Tipo | Evidencia / Fuente | Confianza | Verificado |
|---|---|---|---|---|---|
| 1 | "Una operación idempotente puede repetirse sin cambiar el resultado más allá de la primera aplicación" | Hecho (definición) | Definición estándar; enlazar a HTTP semantics (RFC 9110, sección de métodos idempotentes) | Alta | 2026-07-09 |
| 2 | "Un header `Idempotency-Key` permite reintentar un POST de pago sin duplicar el cobro" | Inferencia sobre patrón de diseño | Razonamiento + patrón documentado por proveedores de pagos; marcar que es patrón, no estándar HTTP | Media | 2026-07-09 |
| 3 | "En Nexo Finanzas elegimos deduplicar por clave en Redis con TTL de 24 h" | Decisión de diseño | `docs/adr/0007-idempotency-key-store.md` | — (es decisión) | 2026-07-09 |
| 4 | "Con la clave activada, 1.000 reintentos del mismo pago produjeron 1 sola transacción" | Resultado experimental | `docs/experiments/idempotency-retries/` (script + salida sintética) | Media (una corrida, entorno local) | 2026-07-09 |
| 5 | "Idempotencia es imprescindible en cualquier API de pagos" | Opinión | Juicio profesional; delimitar a APIs con reintentos automáticos | — | 2026-07-09 |

Observá el valor de la columna **Tipo**: obliga a que el claim #5 no se disfrace de hecho, y a que el #4 (medición propia) no se presente como verdad universal sino con su confianza y su límite ("una corrida, entorno local").

> <span class="em em--hecho">HECHO</span> La idempotencia de métodos HTTP está definida en la especificación de semántica HTTP (RFC 9110). Citá siempre la sección concreta, no "la RFC" a secas. Referencia primaria: [RFC 9110 — HTTP Semantics](https://www.rfc-editor.org/rfc/rfc9110.html).

---

## Concepto: la jerarquía de fuentes

No todas las fuentes pesan igual. **[OPINIÓN, basada en práctica de revisión de pares]** Esta es la jerarquía que uso, de mayor a menor autoridad para respaldar un claim técnico:

1. **Estándares y especificaciones** (IETF/RFC, W3C, ISO, PCI SSC, OWASP como estándar de facto de seguridad).
2. **Documentación oficial** del proyecto o herramienta.
3. **Repositorio oficial** (código, `CHANGELOG`, releases, issues) — útil para verificar comportamiento real, no solo lo documentado.
4. **Papers revisados** y reportes de organismos competentes.
5. **Postmortems públicos** de ingeniería (Google, Cloudflare, GitLab, etc.).
6. **Fuentes secundarias** (blogs, cursos, charlas).
7. **Opinión** (incluida la tuya).

Reglas de uso:

- <span class="em em--decision">DECISIÓN</span> Un claim de tipo "hecho" solo se publica si se apoya en niveles 1–5. Si lo único que encontrás es un blog de terceros, o subís de nivel o reformulás el claim como inferencia/opinión.
- **Verificá la vigencia.** Los estándares y versiones cambian. Ejemplos que verifiqué al escribir esto (2026-07-09):
  - <span class="em em--hecho">HECHO</span> El estándar de referencia para riesgos de API es la edición **2023** del OWASP API Security Top 10 — la vigente al momento de escribir. Fuente primaria: [OWASP API Security Project](https://owasp.org/API-Security/) y la [edición 2023](https://owasp.org/API-Security/editions/2023/en/0x11-t10/).
  - <span class="em em--hecho">HECHO</span> OpenTelemetry **graduó** en la CNCF (nivel de madurez más alto) en mayo de 2026; su especificación de *tracing* es estable con soporte de largo plazo. Fuentes: [What is OpenTelemetry](https://opentelemetry.io/docs/what-is-opentelemetry/), [Specification Status](https://opentelemetry.io/docs/specs/status/) y el [anuncio de graduación de la CNCF](https://www.cncf.io/announcements/2026/05/21/cloud-native-computing-foundation-announces-opentelemetrys-graduation-solidifying-status-as-the-de-facto-observability-standard/).
- **Enlazá cerca del claim, no en una bibliografía decorativa al final.** El lector debe poder ir de la afirmación a su respaldo en un clic.

Cuando una fuente que ibas a citar ya no está vigente o no dice lo que creías, la regla es dura: **eliminá o reformulá la afirmación**. No la sostengas con un enlace que no la respalda.

---

## Método: qué hacer *antes* de escribir

La mayor parte del trabajo de un buen post técnico ocurre antes de la primera oración. Este es el flujo, que también sirve de índice mental:

<figure class="diagram">
  <img src="/blog/diagrams/escribir-sobre-calidad-con-evidencia-metodo-editorial-2.svg" width="1829" height="63" alt="Diagrama: escribir-sobre-calidad-con-evidencia-metodo-editorial (2)" loading="lazy" decoding="async" />
</figure>

1. **Formulá una pregunta, no un título.** "¿Cuánto se degrada la latencia p95 del endpoint de pago cuando dedup por Redis está activo?" es investigable; "JMeter mejora el performance" no lo es.
2. **Convertí la pregunta en hipótesis falsable.** Con umbral y condición. (El satélite de experimentos hace esto en detalle.)
3. **Reuní fuentes primarias** para los hechos que vas a asumir, y anotalas en la tabla de claims.
4. **Diseñá el experimento** solo si tu post depende de una medición propia. Si no, no inventes números: escribí una guía o un ADR.
5. **Ejecutá y guardá la evidencia** (script, versión, entorno, salida) en el repo.
6. **Recién ahí escribís**, con la tabla de claims al lado.

---

## Implementación: cómo redactar cada formato

Distintos claims piden distintos formatos. Estos son los cuatro que todo blog de calidad necesita, con su función:

| Formato | Responde a | Núcleo de evidencia |
|---|---|---|
| **Tutorial / guía** | "¿Cómo hago X?" | Comandos reproducibles + versión + salida esperada |
| **ADR** | "¿Por qué elegimos X en vez de Y?" | Contexto, alternativas, criterios, consecuencias |
| **Experimento** | "¿Es cierto que X mejora Y, y cuánto?" | Hipótesis, método, datos, entorno, límites |
| **Postmortem (simulado)** | "¿Qué falló y qué aprendimos?" | Línea de tiempo, causa raíz, acciones, sin culpables |

Regla transversal: **el título promete exactamente lo que el cuerpo entrega**. Un título que dice "mejora" obliga a mostrar una medición; un título que dice "cómo" obliga a comandos que funcionen; un título que dice "elegimos" obliga a un ADR.

### Micro-ejemplo: front matter con trazabilidad

<span class="em em--decision">DECISIÓN</span> Propongo estandarizar el encabezado de cada post con metadatos que anclan el contenido a su evidencia. Bloque de ejemplo (YAML front matter):

```yaml
---
titulo: "Idempotencia en pagos: por que 1000 reintentos deben cobrar una vez"
slug: idempotencia-pagos-nexo-finanzas
fecha: 2026-07-09
tipo: experimento            # tutorial | adr | experimento | postmortem
claims_ledger: docs/evidence/claims-ledger.md
experimento: docs/experiments/idempotency-retries/
adr_relacionada: docs/adr/0007-idempotency-key-store.md
verificado_hasta: 2026-07-09  # fecha en que se revisaron las fuentes vivas
estado: vigente              # vigente | en-revision | corregido | obsoleto
---
```

Explicación por bloque:

- `tipo` fuerza al autor a decidir qué está escribiendo (y por tanto qué evidencia necesita).
- `claims_ledger`, `experimento` y `adr_relacionada` crean trazabilidad desde el post hacia el repositorio.
- `verificado_hasta` es honestidad temporal: le dice al lector cuándo fue la última vez que las fuentes vivas se comprobaron.
- `estado` habilita corregir públicamente (ver más abajo).

---

## Verificación: cómo revisás tu propio post antes de publicar

La verificación no es leerlo de nuevo; es **ejecutar el árbol de decisión de claims sobre cada afirmación fuerte**. En la práctica:

1. Subrayá cada oración que afirme algo comparativo, cuantitativo o categórico.
2. Para cada una, completá la fila en la tabla de claims. Si no podés, no publicás esa oración.
3. Comprobá que cada enlace resuelve y respalda lo que decís (no solo que "existe").
4. Confirmá que ninguna captura, log o config contiene secretos o PII (ver el [satélite de seguridad](/blog/publicar-evidencia-sin-filtrar-secretos/)).
5. Revisá que los diagramas describan la implementación **real**, no una idealizada.

---

## Límites de este método

<span class="em em--opinion">OPINIÓN</span> Este método tiene costos y no aplica a todo:

- **Es más lento.** Un post con tabla de claims y experimento reproducible cuesta días, no horas. Para notas de aprendizaje personal explícitamente marcadas como tales, es sobredimensionado.
- **No garantiza que tengas razón**, solo que tu razonamiento es auditable. Un experimento reproducible puede estar mal diseñado; por eso la sección de límites es obligatoria.
- **La reproducibilidad total es un ideal.** Hardware, versiones y datos cambian; apuntás a *comparable*, no a *idéntico*.

---

## Anti-patrones (causa → consecuencia → alternativa)

- **Definición de diccionario como introducción.**
  *Causa:* llenar espacio sin un problema real. *Consecuencia:* el lector no sabe por qué debería importarle. *Alternativa:* abrir con un problema concreto (como hicimos con el blog que resta credibilidad).

- **El claim categórico sin contexto** ("X es la mejor herramienta").
  *Causa:* confundir preferencia con hecho. *Consecuencia:* queda refutado con una sola pregunta en una entrevista. *Alternativa:* convertirlo en ADR contextual (ver [satélite de ADR](/blog/adr-seleccion-herramienta-katalon-selenium/)).

- **Bibliografía decorativa.**
  *Causa:* pegar una lista de links al final para "verse serio". *Consecuencia:* nadie puede mapear qué fuente respalda qué afirmación. *Alternativa:* enlazar cada fuente junto al claim que sostiene.

- **Contenido generado por IA sin verificar.**
  *Causa:* aceptar comandos, versiones o citas que un modelo produjo sin comprobarlos. *Consecuencia:* enlaces rotos, banderas de versión inexistentes, fuentes inventadas — el peor daño a la credibilidad. *Alternativa:* tratar toda salida de IA como borrador de fuente secundaria; ejecutar los comandos y verificar las fuentes primarias antes de publicar.

- **Diagrama que no representa la implementación.**
  *Causa:* dibujar el sistema "ideal" en vez del real. *Consecuencia:* engaña al lector y a tu yo futuro. *Alternativa:* diagramar lo que el código hace hoy; si diagramás una propuesta, rotulala como tal.

---

## Conexión accionable con Nexo Finanzas

Traducí el método a estructura de repositorio. Estos son los archivos que este pilar justifica crear en el repo `nexo-finanzas`:

```text
docs/
  evidence/
    claims-ledger.md        # tabla de claims global o por post
  adr/
    0000-template.md        # plantilla de ADR (ver satélite 3)
  experiments/
    README.md               # cómo se estructura un experimento (ver satélite 2)
  runbooks/
CONTRIBUTING.md             # define tipos de claim y exige tabla de claims en cada post
SECURITY.md                 # qué no se publica (ver satélite 4)
```

Acciones concretas:

1. Creá `docs/evidence/claims-ledger.md` con la tabla de idempotencia de arriba como primer ejemplo.
2. Agregá a `CONTRIBUTING.md` una regla: *"Todo post con una afirmación comparativa o cuantitativa debe incluir su fila en la tabla de claims; el PR no se aprueba sin ella."*
3. Estandarizá el front matter de posts con los campos de trazabilidad.

---

## Qué aprendimos / próximos pasos

- La credibilidad técnica es un **subproducto del método**, no del tono. Se construye clasificando claims, jerarquizando fuentes y publicando evidencia reproducible.
- La tabla de claims es la herramienta más barata y de mayor impacto: te obliga a ser honesto antes de escribir.
- Este método también es tu preparación para entrevistas y para contribuir a open source: quien practica evidencia reproducible en su blog escribe mejores *issues*, mejores PRs y mejores *design docs*.

**Seguí con los satélites de esta colección:**

- **[Cómo diseñar un experimento reproducible →](/blog/hipotesis-medible-experimento-reproducible/)** (para tus claims de tipo "resultado experimental").
- **[Cómo escribir una ADR de selección de herramienta →](/blog/adr-seleccion-herramienta-katalon-selenium/)** (para tus claims de tipo "decisión").
- **[Cómo publicar evidencia sin filtrar secretos →](/blog/publicar-evidencia-sin-filtrar-secretos/)** (para publicar sin exponer datos).

### Flujo editorial de una semana (plantilla)

| Día | Actividad | Salida |
|---|---|---|
| Lun | **Investigar**: pregunta, hipótesis, fuentes primarias | Tabla de claims inicial |
| Mar | **Prototipar**: script del experimento o borrador de ADR | Código en `docs/experiments/` o `docs/adr/` |
| Mié | **Medir**: ejecutar, guardar evidencia, anotar entorno | `evidence/README.md` con salida + límites |
| Jue | **Escribir**: redactar con la tabla de claims al lado | Borrador del post |
| Vie | **Revisar**: árbol de claims + saneo de secretos + render de diagramas | Post revisado |
| Lun sig. | **Publicar** y programar re-verificación de fuentes vivas | Post publicado + recordatorio de revisión |

---

## Checklist final (copiá y aplicá)

- [ ] El post abre con un problema realista, no con una definición.
- [ ] Cada afirmación fuerte está clasificada (hecho / inferencia / decisión / opinión / experimento).
- [ ] Cada "hecho" tiene una fuente primaria enlazada **junto** al claim y verificada en su fecha.
- [ ] Existe una tabla de claims versionada para el post.
- [ ] Los resultados experimentales incluyen método, versión, entorno y límites; no hay números inventados.
- [ ] Los diagramas representan la implementación real y renderizan en la plataforma destino.
- [ ] No hay secretos, PII ni capturas sin sanear.
- [ ] El front matter incluye `verificado_hasta` y `estado`.
- [ ] Hay un plan para corregir el post públicamente si una afirmación deja de ser válida.

---

*Nota de veracidad: los ejemplos de Nexo Finanzas usan datos ficticios. Las menciones a estándares (OWASP, OpenTelemetry, RFC 9110) fueron verificadas contra sus fuentes primarias el 2026-07-09; verificá su vigencia antes de reutilizarlas. Este artículo describe un método editorial, no constituye asesoramiento legal ni de cumplimiento.*

