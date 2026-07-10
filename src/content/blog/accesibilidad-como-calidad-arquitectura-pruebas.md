---
title: "Accesibilidad como calidad: una arquitectura de pruebas para el flujo de transferencias de Nexo Finanzas"
description: "Accesibilidad no es una revisión visual al final del sprint. Guía de arquitectura de calidad para un flujo de transferencias: semántica, WCAG 2.2, automatización, evaluación manual y evidencia, sin prometer conformidad."
pubDate: 2026-07-09
tags: ["accesibilidad", "a11y", "wcag-2.2", "quality-engineering", "sdet", "definition-of-done", "testing"]
cluster: "09"
clusterTitle: "Accesibilidad como calidad"
type: "pilar"
order: 1
icon: "check"
iconHue: 175
readingLevel: "Intermedio–Avanzado"
prerequisites: "Requiere HTML/DOM, CI/CD y práctica de QA."
---
> **Alcance y advertencia (leer primero).** Este artículo usa un caso ficticio —el portal **Nexo Finanzas**— para enseñar una arquitectura de calidad de accesibilidad. **No** es una auditoría, **no** declara conformidad con WCAG y **no** es asesoramiento legal. Ninguna afirmación de "es accesible" o "cumple WCAG" es válida sin una evaluación con alcance completo (páginas/estados, tecnologías asistivas, fecha y evidencia), y el resultado de una herramienta automática nunca equivale a una declaración de conformidad. Todos los datos de Nexo son inventados.

## El problema, no la definición

Un usuario que navega solo con teclado abre Nexo Finanzas, completa una transferencia, y al llegar al diálogo de confirmación el foco queda "atrapado" detrás del modal: puede tabular pero nunca alcanza el botón *Confirmar*. La operación funciona perfecto con mouse. Pasó QA funcional, pasó el smoke, pasó el escáner automático que dio "0 errores críticos". Y aun así, un segmento de personas no puede terminar la tarea más importante del producto.

Ese es el punto de partida honesto: **la accesibilidad falla en los lugares que la automatización y la prueba visual no miran** —foco, orden, anuncios de estado, errores, modales, autenticación—. No es un problema de "casos extremos": es un atributo de calidad que decide si la tarea se puede completar o no.

Este es el artículo **pilar** de una colección de cuatro. Aquí construimos el marco: por qué accesibilidad es calidad de ingeniería, qué dice WCAG 2.2 (y qué *no* podés concluir de un score), y cómo se ve un ciclo de calidad que combina semántica, chequeos automáticos, revisión humana y evidencia. Los tres artículos satélite profundizan cada pieza:

- [Semántica primero: HTML nativo vs. ARIA](/blog/semantica-primero-html-nativo-vs-aria/)
- [Automatizar accesibilidad sin fabricar cobertura (axe-core + Playwright en CI)](/blog/automatizar-accesibilidad-ci-axe-playwright/)
- [Evaluación manual, matriz de tecnologías asistivas y la ficha de un defecto](/blog/evaluacion-manual-matriz-at-defecto-a11y/)

## Prerrequisitos y glosario mínimo

Para seguir el artículo conviene tener presente: **HTML semántico y DOM** (que un `<button>` "es" un botón para el navegador y para la tecnología asistiva, no solo visualmente); **nombre accesible** (el texto que una tecnología asistiva anuncia para un control, calculado a partir de `label`, contenido, `aria-label`, etc.); **foco** (el elemento que recibe el teclado en cada momento) y **orden de foco**; **selectores estables** para pruebas de UI; y **CI/CD** con reporte de defectos.

Glosario que usaremos en toda la colección:

- **WCAG**: *Web Content Accessibility Guidelines*, la norma del W3C. La versión vigente es **WCAG 2.2**, publicada como Recomendación el 5 de octubre de 2023 ([W3C, WCAG 2.2](https://www.w3.org/TR/WCAG22/)) y adoptada además como norma ISO/IEC 40500:2025.
- **POUR**: los cuatro principios de WCAG — **P**erceptible, **O**perable, **U**nderstandable (comprensible) y **R**obusto.
- **Criterio de éxito (SC)**: cada requisito verificable de WCAG (p. ej. 2.4.7 *Focus Visible*). Tiene un **nivel** A, AA o AAA.
- **Nivel A/AA/AAA**: no son puntajes ni un "porcentaje de accesibilidad". Son umbrales de conformidad acumulativos. **AAA no es una meta generalista**: el propio W3C aclara que no se recomienda exigir AAA para sitios enteros porque no siempre es posible cumplir todos sus criterios ([WCAG 2.2, "Understanding Levels of Conformance"](https://www.w3.org/WAI/WCAG22/Understanding/conformance)).
- **Tecnología asistiva (AT)**: software o hardware que media la interacción — lectores de pantalla (NVDA, JAWS, VoiceOver, TalkBack), ampliadores, control por voz, etc.
- **Semántica**: la información de *rol, nombre, estado y valor* que un elemento expone a la AT, más allá de su apariencia.

## Accesibilidad como atributo de calidad, riesgo de producto y práctica colaborativa

Vale distinguir tres lentes, porque cada una mueve a un rol distinto de la organización:

1. **Atributo de calidad.** Es un requisito no funcional verificable, igual que performance o seguridad. Se expresa en criterios de aceptación, se prueba y se mide. *(Decisión de diseño de esta guía: tratarla como parte del Definition of Done, no como una fase.)*
2. **Riesgo de producto.** Una barrera en el journey crítico —transferir dinero— no es un "nice to have": es tarea no completable, pérdida de cliente y, según jurisdicción, riesgo regulatorio. *(Ver la nota sobre marco legal más abajo; delimitá jurisdicción y no lo tomes como asesoramiento.)*
3. **Práctica colaborativa.** La mayoría de los defectos de accesibilidad nacen en **contenido y diseño** (orden de lectura, textos de error, contraste, patrones de interacción), no solo en el código. Por eso el ciclo empieza antes del desarrollo y no puede ser responsabilidad exclusiva de QA "al final".

*(Hecho citado vs. inferencia: que WCAG 2.2 es la norma vigente es un hecho verificable; que conviene tratarla como DoD es una decisión de diseño de este artículo, defendible pero no normativa.)*

## Modelo mental: personas, tareas, contexto, tecnología asistiva y estado

Antes de escribir una sola aserción, conviene modelar el problema en cinco ejes. No es teoría: es lo que define **qué** probás y **con qué**.

- **Personas** como sujetos de diseño, no como "casos límite": alguien que usa lector de pantalla, alguien que solo usa teclado, alguien con baja visión que amplía al 200–400 %, alguien con temblor que necesita objetivos táctiles grandes, alguien con carga cognitiva alta que necesita mensajes claros.
- **Tareas**: el journey crítico completo —iniciar transferencia → elegir cuenta → ingresar importe → confirmar—, no la pantalla inicial.
- **Contexto**: web responsive, sesión autenticada, posibilidad de sesión vencida, mobile con una mano.
- **Tecnología asistiva**: qué lectores de pantalla y navegadores importan *para esta audiencia* (lo definimos como matriz en el [artículo 4](/blog/evaluacion-manual-matriz-at-defecto-a11y/), no como una combinación "correcta" universal).
- **Variaciones de estado**: vacío, cargando, error, éxito, modal abierto, sesión vencida. La accesibilidad se rompe casi siempre en los estados, no en el "camino feliz".

## Fundamentos de WCAG 2.2 y los límites de una declaración de conformidad

WCAG 2.2 organiza sus criterios bajo POUR y agrega **nueve criterios nuevos** respecto de 2.1, varios directamente relevantes a un flujo de banca ([W3C, "What's New in WCAG 2.2"](https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/)):

| SC | Nombre | Nivel | Por qué importa en Nexo |
|----|--------|-------|--------------------------|
| 2.4.11 | Focus Not Obscured (Minimum) | AA | Barras fijas/modales no deben tapar el elemento con foco |
| 2.5.7 | Dragging Movements | AA | Toda acción con arrastre necesita alternativa sin arrastre |
| 2.5.8 | Target Size (Minimum) | AA | Objetivos táctiles de al menos **24×24 px CSS** |
| 3.2.6 | Consistent Help | A | Ayuda/soporte en ubicación consistente |
| 3.3.7 | Redundant Entry | A | No re-pedir datos ya ingresados en el mismo proceso |
| 3.3.8 | Accessible Authentication (Minimum) | AA | Login sin exigir resolver un puzzle cognitivo |

Además, WCAG 2.2 **eliminó el criterio 4.1.1 *Parsing***, que quedó obsoleto ([W3C, "What's New in WCAG 2.2"](https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/)). Es un buen recordatorio de por qué hay que **verificar la vigencia** antes de citar: la norma cambia.

Sobre el horizonte: **WCAG 3.0 sigue en *Working Draft*** (actualización de marzo de 2026), con un modelo de puntuación distinto; su Recomendación no se espera antes de 2028 y no debe usarse como base de conformidad hoy ([W3C, WCAG 3.0 Working Draft](https://www.w3.org/TR/wcag-3.0/)). **La norma accionable en 2026 es WCAG 2.2.**

**El límite crítico:** cumplir un criterio no es "sacar un puntaje". Una **declaración de conformidad** requiere alcance definido, muestra representativa de páginas y estados, tecnologías evaluadas, fecha y evidencia — es exactamente lo que describe la metodología **WCAG-EM** ([W3C, WCAG-EM](https://www.w3.org/WAI/test-evaluate/conformance/wcag-em/); hay un borrador de *WCAG-EM 2.0* de 2026 que extiende el método a apps, aún como Nota de grupo). Un escáner que dice "0 errores" en una página **no** es una declaración de conformidad. Volveremos sobre esto.

> **Nota de marco legal (delimitada, no es asesoramiento).** Según la jurisdicción puede existir obligación legal de accesibilidad. En la UE, la *European Accessibility Act* (Directiva (UE) 2019/882) exige accesibilidad en servicios como la banca electrónica, con obligaciones aplicables desde el 28 de junio de 2025. En Argentina, la Ley 26.653 aplica a organismos del Estado. Cada régimen define su propia norma técnica, versión y alcance: **verificá la fuente oficial de tu jurisdicción**. Nexo Finanzas es ficticio y nada aquí constituye asesoramiento legal ni de cumplimiento.

## La arquitectura: un ciclo, no una etapa

La idea central del pilar es que la calidad de accesibilidad es un **ciclo cerrado** que empieza en diseño/contenido y vuelve a él. Cada etapa detecta un tipo distinto de defecto; ninguna reemplaza a la siguiente.

<figure class="diagram">
  <img src="/blog/diagrams/accesibilidad-como-calidad-arquitectura-pruebas-1.svg" width="1153" height="98" alt="Diagrama: accesibilidad-como-calidad-arquitectura-pruebas (1)" loading="lazy" decoding="async" />
</figure>

Qué detecta —y qué **no**— cada etapa:

- **Diseño y contenido.** Detecta problemas de origen: orden de lectura, jerarquía de encabezados, contraste de paleta, textos de error comprensibles, patrones de interacción elegidos. **No** detecta errores de implementación. Es la etapa más barata y la más ignorada.
- **Componente semántico.** Al construir con HTML nativo y roles correctos se previenen clases enteras de defectos (nombre accesible, teclado gratis, estados). Es el tema del [artículo 2](/blog/semantica-primero-html-nativo-vs-aria/). **No** garantiza el comportamiento del journey completo.
- **Chequeos automáticos.** Detectan violaciones **estructurales y programáticas** a escala: falta de `label`, contraste insuficiente, atributos ARIA inválidos, imágenes sin `alt`. **No** detectan si el orden de foco tiene sentido, si el mensaje de error es útil, o si un lector de pantalla anuncia el resultado. El W3C es explícito: *las herramientas no pueden determinar accesibilidad, solo asistir* ([W3C, "Selecting Web Accessibility Evaluation Tools"](https://www.w3.org/WAI/test-evaluate/tools/selecting/)). Cómo hacerlo sin fabricar cobertura está en el [artículo 3](/blog/automatizar-accesibilidad-ci-axe-playwright/).
- **Revisión manual.** Detecta lo experiencial: navegación real por teclado, anuncios de un lector de pantalla, reflow al 400 %, sentido del foco tras cerrar un modal. Requiere protocolo y matriz — [artículo 4](/blog/evaluacion-manual-matriz-at-defecto-a11y/).
- **Evidencia y defecto.** Convierte hallazgos en artefactos accionables con criterio WCAG, impacto, severidad contextual, dueño y prueba de regresión. Cierra el ciclo devolviendo aprendizaje a diseño.

El diagrama incluye **contenido y diseño** a propósito: si el ciclo empieza en desarrollo, ya se importaron defectos de origen.

## El journey de transferencia: criterio funcional + criterio accesible

La palanca práctica más poderosa es escribir el criterio de aceptación **accesible** junto al funcional. Tomemos la historia "Como cliente quiero transferir dinero a otra cuenta".

**Ejemplo 1 — Criterios de aceptación accesibles (extracto).** Cada uno indica cómo se verifica.

```gherkin
# nexo-web-banking-e2e — features/transferencia.feature (extracto)
Escenario: Confirmar transferencia solo con teclado
  # Verificación: automática (foco/rol) + manual (lector de pantalla)
  Dado que inicié sesión y estoy en "Nueva transferencia"
  Cuando recorro el formulario usando solo Tab y Shift+Tab
  Entonces cada campo expone un nombre accesible asociado a su etiqueta
  Y el orden de foco sigue el orden visual y lógico
  Cuando ingreso un importe inválido y envío
  Entonces el error se asocia programáticamente al campo (aria-describedby)
  Y el foco se mueve al primer campo con error
  Y el mensaje es perceptible por un lector de pantalla   # manual
  Cuando confirmo la operación
  Entonces se abre el diálogo con el foco dentro del diálogo  # automática
  Y al cerrarlo el foco vuelve al control que lo abrió         # automática
  Y el resultado (éxito/fracaso) se anuncia y ofrece la siguiente acción  # manual
```

Observá la columna implícita "cómo se verifica": **teclado, foco y rol** se automatizan bien; **"perceptible por un lector de pantalla"** y **"mensaje útil"** requieren revisión humana. Equipararlos sería el error central que esta colección busca evitar.

El segundo diagrama de la colección modela la parte más frágil de este journey —error asociado al campo y anuncio de estado— y lo desarrollamos en el [artículo 2](/blog/semantica-primero-html-nativo-vs-aria/).

## Integración: diseño, pull request, CI y Definition of Done

Dónde "vive" cada control:

- **Diseño**: los mockups anotan orden de foco, nombres accesibles, estados de error y contraste. El defecto más barato es el que no se codifica.
- **Pull request**: una plantilla de PR con una sección **"Impacto accesible"** obliga a declarar si el cambio toca foco, teclado, formularios o anuncios, y qué se probó.
- **CI**: un job de smoke de accesibilidad sobre los journeys críticos, que **adjunta el reporte y no oculta hallazgos** ([artículo 3](/blog/automatizar-accesibilidad-ci-axe-playwright/)). El umbral es una **política revisable**, no una "nota de accesibilidad".
- **Definition of Done**: un ítem accesible por historia crítica, con evidencia. No "pasó el escáner", sino "el journey se completa por teclado y con lector de pantalla, con evidencia adjunta y sin PII".

## Medir sin reducir la accesibilidad a un score

Un número único ("92 % accesible") es a la vez falso y peligroso: sugiere conformidad donde no la hay. Medí en cambio un tablero de señales, cada una con su límite:

- **% de journeys críticos evaluados** contra la matriz manual definida (no % de páginas escaneadas).
- **Criterios automáticos aplicables ejecutados**, con hallazgos **confirmados / descartados / no cubiertos** (el "no cubierto" es la métrica más honesta).
- **Defectos por tipo**: teclado, foco, semántica, formularios, contraste, contenido, compatibilidad.
- **Tiempo de detección / de remediación / repetición** del mismo defecto.
- **Cobertura de estados**: vacío, error, carga, éxito, sesión vencida, modal.
- **Límite explícito**: ninguna de estas métricas prueba conformidad; la evaluación humana sigue siendo necesaria.

La trazabilidad de todo esto vive en `nexo-quality-control-tower` ([artículo 4](/blog/evaluacion-manual-matriz-at-defecto-a11y/)).

## Anti-patrones (panorama; el detalle en los satélites)

- **Un score automático como prueba de conformidad.** *Causa*: confundir herramienta con norma. *Consecuencia*: falsa seguridad. *Alternativa*: el escáner es una señal entre varias; la conformidad requiere WCAG-EM.
- **Dejar accesibilidad para el final del sprint.** *Causa*: tratarla como fase de QA. *Consecuencia*: reproceso caro en diseño/código. *Alternativa*: criterio accesible desde el refinamiento.
- **Reporte sin dueño, criterio, fecha ni prueba de regresión.** *Causa*: registrar síntomas. *Consecuencia*: el defecto vuelve. *Alternativa*: la ficha del [artículo 4](/blog/evaluacion-manual-matriz-at-defecto-a11y/).
- **`div` clickeable en vez de `button`, o ARIA para imitar HTML nativo.** Se desarma en el [artículo 2](/blog/semantica-primero-html-nativo-vs-aria/).

## Plan de adopción de 30 días

*(Propuesta razonable, no una garantía. Ajustá los tiempos a tu contexto.)*

- **Semana 1 — Alinear.** Definir el journey crítico (transferencia), la matriz mínima de AT y qué significa "hecho accesible" en el DoD. Correr una primera revisión no exhaustiva con [W3C Easy Checks](https://www.w3.org/WAI/test-evaluate/easy-checks/) para calibrar expectativas.
- **Semana 2 — Prevenir en el origen.** Escribir criterios de aceptación accesibles para la historia de transferencia. Redactar un ADR de "componentes semánticos" ([artículo 2](/blog/semantica-primero-html-nativo-vs-aria/)).
- **Semana 3 — Automatizar el piso.** Integrar el smoke de axe-core en CI sobre los journeys críticos, con reporte adjunto y umbral como política ([artículo 3](/blog/automatizar-accesibilidad-ci-axe-playwright/)).
- **Semana 4 — Verificar lo que la máquina no ve.** Ejecutar el protocolo manual sobre el journey completo y sus estados; registrar el primer defecto de alto valor con su ficha ([artículo 4](/blog/evaluacion-manual-matriz-at-defecto-a11y/)).

## Conexión con el portfolio Nexo Finanzas

- **nexo-web-banking-e2e**: criterios Cucumber accesibles (como el ejemplo 1), selectores por **rol/nombre** y pruebas de journey.
- **nexo-wallet-mobile**: IDs de accesibilidad y matriz específica de mobile.
- **nexo-quality-control-tower**: trazabilidad criterio → defecto → evidencia → estado de remediación.
- **nexo-quality-platform**: job de CI, artefactos y política de *quality gate*.

Archivos sugeridos para el repo: `docs/calidad/accesibilidad.md` (esta arquitectura), `docs/runbooks/prueba-manual-a11y.md`, un **ADR** de componentes semánticos y una **plantilla de PR** con sección de impacto accesible. Distinguí siempre **evidencia** (lo que probaste, con versión y sin PII), **hipótesis** (lo que creés que pasa) y **lo que requiere validación con personas usuarias**.

## Qué aprendimos y próximos pasos

- La accesibilidad es un atributo de calidad y un riesgo de producto, no una revisión visual final.
- WCAG 2.2 es la norma vigente (2026); un score automático **no** es una declaración de conformidad.
- El ciclo diseño → semántica → automático → manual → evidencia cierra sobre sí mismo, y cada etapa ve un defecto distinto.
- Automatización y evaluación humana se combinan; **no** se equiparan.

Seguí con: **[Semántica primero](/blog/semantica-primero-html-nativo-vs-aria/)** para construir de origen · **[Automatizar sin fabricar cobertura](/blog/automatizar-accesibilidad-ci-axe-playwright/)** para el CI · **[Evaluación manual y ficha de defecto](/blog/evaluacion-manual-matriz-at-defecto-a11y/)** para lo experiencial.

## Checklist del pilar

- [ ] El equipo distingue "pasó el escáner" de "hay declaración de conformidad".
- [ ] Existe un journey crítico definido con estados (vacío/error/carga/éxito/sesión vencida/modal).
- [ ] Cada historia crítica tiene criterio de aceptación **accesible** con su método de verificación.
- [ ] Hay un ciclo que empieza en diseño/contenido, no en QA.
- [ ] El DoD incluye un ítem accesible con evidencia sin PII.
- [ ] Las métricas incluyen "criterios no cubiertos", no solo un porcentaje.
- [ ] Ninguna comunicación promete conformidad legal a partir de una herramienta.

---

### Fuentes (consultadas el 9 de julio de 2026)

- [WCAG 2.2 (W3C Recommendation)](https://www.w3.org/TR/WCAG22/) · [What's New in WCAG 2.2](https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/) · [Understanding Conformance](https://www.w3.org/WAI/WCAG22/Understanding/conformance)
- [WCAG-EM (metodología de evaluación de conformidad)](https://www.w3.org/WAI/test-evaluate/conformance/wcag-em/)
- [Selecting Web Accessibility Evaluation Tools](https://www.w3.org/WAI/test-evaluate/tools/selecting/) · [Easy Checks](https://www.w3.org/WAI/test-evaluate/easy-checks/)
- [WCAG 3.0 Working Draft](https://www.w3.org/TR/wcag-3.0/) (informativo, no normativo)
- Marco legal (verificar por jurisdicción): [Directiva (UE) 2019/882 — European Accessibility Act](https://eur-lex.europa.eu/eli/dir/2019/882/oj) · Argentina, Ley 26.653. *No es asesoramiento legal.*

