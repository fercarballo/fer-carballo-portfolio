---
title: "Evaluación manual, matriz de tecnologías asistivas y la ficha de un defecto de accesibilidad"
description: "Lo que la automatización no ve. Cómo definir una matriz de navegador/SO/tecnología asistiva según tu audiencia, ejecutar un protocolo manual sobre el flujo de transferencias y documentar un defecto de accesibilidad con trazabilidad y evidencia sin PII."
pubDate: 2026-07-09
tags: ["accesibilidad", "a11y", "evaluacion-manual", "lector-de-pantalla", "wcag-2.2", "defectos", "sdet"]
cluster: "09"
clusterTitle: "Accesibilidad como calidad"
type: "satelite"
order: 4
icon: "check"
iconHue: 175
readingLevel: "Intermedio"
prerequisites: "Requiere práctica de QA y nociones de tecnologías asistivas."
---
> **Alcance.** Cubre la parte humana de la evaluación: matriz de tecnologías asistivas, protocolo manual y documentación de defectos. **No** reemplaza una auditoría formal ni una evaluación con personas usuarias reales, y **no** declara conformidad. Ejemplos ficticios para **Nexo Finanzas**; sin datos personales reales. Satélite del [artículo pilar](/blog/accesibilidad-como-calidad-arquitectura-pruebas/).

## El problema: la máquina dijo verde, la persona quedó sin saber qué pasó

En Nexo, el pipeline de accesibilidad está verde ([artículo 3](/blog/automatizar-accesibilidad-ci-axe-playwright/)) y la semántica del formulario es correcta ([artículo 2](/blog/semantica-primero-html-nativo-vs-aria/)). Sin embargo, una persona que usa lector de pantalla confirma una transferencia y **no recibe ningún anuncio del resultado**: la pantalla cambió, apareció "Transferencia realizada", pero el foco se quedó en el botón y la región de estado no era *live*, así que la AT nunca lo leyó. La persona no sabe si la operación se hizo. En un producto financiero, esa ambigüedad es grave.

Ningún escáner detecta esto de forma confiable, porque "¿la persona se enteró del resultado?" es una pregunta **experiencial**. El W3C es explícito en que las herramientas no determinan accesibilidad, solo asisten ([W3C, "Selecting Web Accessibility Evaluation Tools"](https://www.w3.org/WAI/test-evaluate/tools/selecting/)). Este artículo es sobre cómo cubrir ese vacío con método, y cómo convertir un hallazgo en un defecto que el equipo pueda arreglar y **no volver a introducir**.

## Prerrequisitos y glosario

- **Lector de pantalla**: software que convierte la UI en voz/braille. Principales: **NVDA** (Windows, gratuito, NV Access), **JAWS** (Windows, comercial), **VoiceOver** (macOS/iOS, Apple), **TalkBack** (Android, Google).
- **Árbol de accesibilidad**: la representación que el navegador expone a la AT (rol, nombre, estado). Es distinto del DOM visual y es la mejor evidencia de "qué escucha" la AT.
- **Journey crítico** y **estados**: recorrido completo y sus variaciones (vacío, error, carga, éxito, sesión vencida, modal).
- **Severidad contextual**: impacto del defecto *en este journey y para estas personas*, no una etiqueta genérica.

## Por qué la evaluación humana sigue siendo necesaria

La automatización cubre lo estructural y a escala; el juicio humano cubre lo experiencial:

- ¿El **orden de foco** tiene sentido para la tarea, o salta de forma confusa?
- ¿El **texto alternativo** o el mensaje de error es *correcto y útil*, no solo *presente*?
- ¿El lector de pantalla **anuncia** el error, el cambio de estado, el resultado?
- ¿El **reflow al 400 %** deja la tarea usable, o el contenido se corta?
- ¿La navegación completa por teclado permite **completar la tarea sin perder datos**?

Esto no es "opinión": son verificaciones de criterios WCAG concretos que requieren observación. La automatización *reduce* el trabajo manual (descarta lo estructural), pero no lo elimina.

## Cómo definir la matriz de tecnologías asistivas

No existe una combinación de navegador + SO + lector de pantalla "correcta" universal. Fijar una arbitrariamente es tan erróneo como no probar. La matriz se **deriva** de:

1. **Personas usuarias y su tecnología**, informada por analítica **permitida** (respetando privacidad) y por datos de industria como la *WebAIM Screen Reader User Survey* — útil como referencia, con la salvedad de que es una muestra autoseleccionada, no un censo ([WebAIM, Screen Reader Survey](https://webaim.org/projects/screenreadersurvey/)).
2. **Plataformas soportadas** por el producto (¿web desktop? ¿mobile web? ¿app nativa?).
3. **Riesgo del journey**: la transferencia de dinero justifica una matriz más amplia que una página informativa.
4. **Combinaciones reales**: ciertos lectores conviven con ciertos navegadores (p. ej. NVDA se usa mucho con Firefox/Chrome; VoiceOver con Safari). Probá combinaciones que la gente **realmente** usa.

**Ejemplo de matriz mínima para el journey de transferencia** *(ilustrativa; ajustala a tu audiencia y datos, no la copies como verdad)*:

| Plataforma | SO | Navegador | Lector de pantalla | Prioridad |
|-----------|----|-----------|--------------------|-----------|
| Web desktop | Windows | Chrome | NVDA | Alta |
| Web desktop | macOS | Safari | VoiceOver | Alta |
| Mobile web | iOS | Safari | VoiceOver | Media |
| Mobile web | Android | Chrome | TalkBack | Media |

*(Decisión de diseño, no norma: esta matriz prioriza dos combinaciones desktop de alta cobertura y suma mobile por el peso del canal. Documentá el criterio que usaste.)*

## El protocolo manual (runbook resumido)

Este es el esqueleto de `docs/runbooks/prueba-manual-a11y.md`. Cada pasada busca una clase distinta de defecto y se ejecuta sobre **el journey completo y sus estados**.

**Pasada 1 — Solo teclado (sin mouse).**
- Recorré el flujo con `Tab`/`Shift+Tab`/`Enter`/`Espacio`/`Esc`.
- Verificá: foco siempre visible ([2.4.7](https://www.w3.org/WAI/WCAG22/Understanding/focus-visible)); sin *keyboard traps* ([2.1.2](https://www.w3.org/WAI/WCAG22/Understanding/no-keyboard-trap)); el foco no queda oculto tras barras/modales ([2.4.11 *Focus Not Obscured*, nuevo en 2.2](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum)); al abrir el modal el foco entra y al cerrarlo se restaura.

**Pasada 2 — Lector de pantalla.**
- Con la AT de la matriz, recorré el flujo escuchando.
- Verificá: cada control anuncia **rol + nombre + estado**; el error se anuncia y se asocia al campo; el **resultado de la transferencia se anuncia** (región *live* / [4.1.3 *Status Messages*](https://www.w3.org/WAI/WCAG22/Understanding/status-messages)); se puede **corregir sin perder** lo ya ingresado.

**Pasada 3 — Zoom y reflow.**
- Zoom del navegador al 200 % ([1.4.4 *Resize Text*](https://www.w3.org/WAI/WCAG22/Understanding/resize-text)) y reflow a viewport angosto equivalente a 320 px ([1.4.10 *Reflow*](https://www.w3.org/WAI/WCAG22/Understanding/reflow)).
- Verificá: sin scroll en dos dimensiones, sin contenido cortado, la tarea sigue completable.

**Pasada 4 — Estados.**
- Repetí lo anterior en: vacío, validación con error, carga, éxito, **sesión vencida** (¿se avisa de forma perceptible y se puede recuperar sin perder datos, respetando [3.3.7 *Redundant Entry*](https://www.w3.org/WAI/WCAG22/Understanding/redundant-entry)?), y modal abierto.

## Mobile web y app nativa (nexo-wallet-mobile)

En mobile la matriz y los criterios cambian de acento:

- **Tamaño de objetivo**: [2.5.8 *Target Size (Minimum)* (AA, nuevo en 2.2)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum) pide objetivos de al menos **24×24 px CSS**; en mobile conviene apuntar más alto por ergonomía táctil.
- **Entradas redundantes**: [3.3.7 *Redundant Entry*](https://www.w3.org/WAI/WCAG22/Understanding/redundant-entry) — no re-pedir datos ya ingresados (p. ej. tras reautenticarse por timeout).
- **Autenticación accesible**: [3.3.8](https://www.w3.org/WAI/WCAG22/Understanding/accessible-authentication-minimum) — biometría/passkey como alternativa a recordar y transcribir.
- **IDs de accesibilidad**: en la app nativa, asigná identificadores de accesibilidad estables (`accessibilityIdentifier`/`contentDescription`) que sirven tanto a la AT como a los selectores de prueba. *(Nota: los criterios WCAG aplican a contenido web; para apps nativas se usan además las guías de plataforma de Apple/Google, que conviene citar por separado de WCAG.)*

## La ficha de un defecto de accesibilidad de alto valor

Un hallazgo sin ficha se pierde y vuelve. Esta es la plantilla —y un ejemplo con el defecto del inicio— que vive en `nexo-quality-control-tower`.

**Ejemplo — Ficha de defecto (datos ficticios, sin PII).**

```yaml
id: A11Y-142
journey: "Transferencia > Confirmación"
criterio_wcag: "4.1.3 Status Messages (AA)"   # verificado en la norma, no inventado
estado_ui: "éxito (post-confirmación)"
plataforma: "Web desktop / Windows / Chrome / NVDA 2025.x"  # de la matriz
pasos:
  - "Completar importe (1500) y cuenta destino"
  - "Activar 'Confirmar transferencia' con Enter"
  - "Confirmar en el diálogo"
resultado_esperado: >
  El resultado ('Transferencia realizada') se anuncia por la AT
  mediante una región live, sin depender de mover el foco.
resultado_observado: >
  La pantalla muestra el éxito pero NVDA no anuncia nada;
  el foco permanece en el botón y no hay región live.
impacto: >
  La persona no puede saber si la operación se completó.
  Alto en un journey financiero: ambigüedad sobre movimiento de dinero.
severidad_contextual: "Alta (journey crítico, sin workaround para la AT)"
evidencia:
  - "Grabación de la pasada con NVDA (audio) — sin PII, cuenta ficticia"
  - "Captura del árbol de accesibilidad mostrando la región sin aria-live"
  - "Versión: build 2026.07.03, entorno staging efímero"
dueño: "equipo-web-banking"
prueba_de_regresion: >
  Test E2E que verifica presencia y actualización de la región
  aria-live tras la confirmación (ver artículo 3), más una
  verificación manual con NVDA/VoiceOver en la próxima release.
```

Por qué cada campo:

- **`criterio_wcag` verificado**: se cita el criterio real y su nivel, no una etiqueta vaga. Si no podés mapear a un criterio, quizás sea un problema de usabilidad, no de conformidad — distinguilo.
- **`severidad_contextual`**: alta *porque* es un journey de dinero sin alternativa para la AT. La misma falla en una página de ayuda tendría severidad menor. La severidad se argumenta, no se hereda de una tabla genérica.
- **`evidencia` sin PII**: video/árbol de accesibilidad/salida de herramienta/captura **con versión y entorno**, siempre con datos ficticios. Nunca publiques cuentas, importes o datos reales.
- **`prueba_de_regresion`**: sin ella, el defecto vuelve en tres sprints. Combina lo automatizable (región *live* presente) con lo manual (que *realmente* se anuncie).

## Métricas de la práctica (sin reducir a un score)

Las mismas señales del [pilar](/blog/accesibilidad-como-calidad-arquitectura-pruebas/), instrumentadas desde la evaluación manual:

- **% de journeys críticos** evaluados contra la matriz (no % de páginas).
- **Defectos por tipo**: teclado, foco, semántica, formularios, contraste, contenido, compatibilidad.
- **Cobertura de estados** realmente probados por journey.
- **Tiempo de detección / remediación** y **repetición** del mismo criterio.
- **Límite explícito**: estas métricas describen *esfuerzo y hallazgos*, no conformidad. La conformidad requiere el alcance formal de [WCAG-EM](https://www.w3.org/WAI/test-evaluate/conformance/wcag-em/).

## Anti-patrones (causa · consecuencia · alternativa)

- **Reporte sin dueño, criterio, fecha ni prueba de regresión.** *Causa*: registrar el síntoma y seguir. *Consecuencia*: el defecto reaparece y nadie lo posee. *Alternativa*: la ficha completa de arriba.
- **Probar solo la pantalla inicial.** *Causa*: es lo primero que se ve. *Consecuencia*: errores, modales, sesión vencida y confirmación quedan sin evaluar — justo donde falla la accesibilidad. *Alternativa*: la pasada 4 sobre estados.
- **Fijar una matriz "correcta" universal.** *Causa*: querer una respuesta simple. *Consecuencia*: probás con AT que tu audiencia no usa. *Alternativa*: derivar la matriz de personas, analítica permitida, plataformas y riesgo.
- **Confundir "sin violaciones de axe" con "usable con AT".** *Causa*: apoyarse solo en la herramienta. *Consecuencia*: defectos experienciales en prod. *Alternativa*: pasada manual con lector de pantalla sobre el journey.

## Conexión con el portfolio Nexo Finanzas

- **nexo-quality-control-tower**: trazabilidad criterio → defecto → evidencia → estado de remediación; aloja fichas como A11Y-142.
- **nexo-wallet-mobile**: matriz específica de mobile e IDs de accesibilidad.
- **docs/runbooks/prueba-manual-a11y.md**: el protocolo de las cuatro pasadas.
- **Evidencia vs. hipótesis vs. validación con usuarios**: la ficha con video/árbol de accesibilidad **es evidencia** de un defecto reproducible; que "el arreglo mejora la experiencia real" es una **hipótesis** que idealmente se **valida con personas usuarias** — algo que este protocolo no reemplaza.

## Qué aprendimos y próximos pasos

- La evaluación humana cubre lo experiencial que la automatización no ve: anuncios, sentido del foco, reflow, corrección sin pérdida.
- La matriz de AT se deriva de la audiencia; no hay una combinación "correcta" universal.
- Un defecto de alto valor tiene criterio verificado, severidad argumentada, evidencia sin PII, dueño y prueba de regresión.
- Ni el protocolo ni la automatización reemplazan la validación con personas usuarias.

Repasá el **[pilar](/blog/accesibilidad-como-calidad-arquitectura-pruebas/)** para el ciclo completo, la **[semántica](/blog/semantica-primero-html-nativo-vs-aria/)** para construir de origen y la **[automatización](/blog/automatizar-accesibilidad-ci-axe-playwright/)** para las regresiones.

## Checklist de evaluación manual y defectos

- [ ] La matriz de AT está derivada de la audiencia y documentada (no fijada al azar).
- [ ] Se ejecutan las cuatro pasadas (teclado, lector de pantalla, zoom/reflow, estados).
- [ ] Cada defecto mapea a un criterio WCAG verificado (o se marca como usabilidad).
- [ ] La severidad es contextual y argumentada, no una etiqueta genérica.
- [ ] La evidencia incluye versión y entorno, y **no** contiene PII ni datos reales.
- [ ] Cada defecto tiene dueño y prueba de regresión (automatizable + manual).
- [ ] Se distingue evidencia, hipótesis y lo que requiere validación con usuarios.

---

### Fuentes (consultadas el 9 de julio de 2026)

- [W3C — Selecting Web Accessibility Evaluation Tools](https://www.w3.org/WAI/test-evaluate/tools/selecting/) · [WCAG-EM](https://www.w3.org/WAI/test-evaluate/conformance/wcag-em/) · [Easy Checks](https://www.w3.org/WAI/test-evaluate/easy-checks/)
- WCAG 2.2 Understanding: [2.1.2 No Keyboard Trap](https://www.w3.org/WAI/WCAG22/Understanding/no-keyboard-trap) · [2.4.7 Focus Visible](https://www.w3.org/WAI/WCAG22/Understanding/focus-visible) · [2.4.11 Focus Not Obscured (Min)](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum) · [2.5.8 Target Size (Min)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum) · [3.3.7 Redundant Entry](https://www.w3.org/WAI/WCAG22/Understanding/redundant-entry) · [3.3.8 Accessible Authentication](https://www.w3.org/WAI/WCAG22/Understanding/accessible-authentication-minimum) · [4.1.3 Status Messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages) · [1.4.4 Resize Text](https://www.w3.org/WAI/WCAG22/Understanding/resize-text) · [1.4.10 Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow)
- [WebAIM — Screen Reader User Survey](https://webaim.org/projects/screenreadersurvey/) (muestra autoseleccionada, referencia)

