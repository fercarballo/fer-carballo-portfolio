---
title: "Semántica primero: cuándo usar HTML nativo y cuándo un patrón ARIA está justificado"
description: "El abuso de ARIA rompe accesibilidad más de lo que la arregla. Cuándo alcanza el HTML nativo, cuándo un patrón ARIA está justificado, y cómo construir el formulario de transferencia de Nexo Finanzas con nombre accesible y errores bien asociados."
pubDate: 2026-07-09
tags: ["accesibilidad", "a11y", "html-semantico", "aria", "formularios", "wcag-2.2", "frontend"]
cluster: "09"
clusterTitle: "Accesibilidad como calidad"
type: "satelite"
order: 2
icon: "check"
iconHue: 175
readingLevel: "Intermedio"
prerequisites: "Requiere HTML/CSS/JS o JSX y nociones de DOM."
---
> **Alcance.** Artículo técnico de construcción de componentes accesibles. No reemplaza una auditoría ni declara conformidad. Ejemplos ficticios para **Nexo Finanzas**; los datos son inventados. Es el satélite del [artículo pilar](/blog/accesibilidad-como-calidad-arquitectura-pruebas/); si venís sin contexto, empezá por ahí.

## El problema: un botón que no es un botón

En una revisión del formulario de transferencia de Nexo aparece esto:

```html
<!-- Anti-patrón real, más común de lo que parece -->
<div class="btn" onclick="confirmar()">Confirmar transferencia</div>
```

Se ve como un botón. Con mouse, funciona. Pero para un lector de pantalla **no tiene rol de botón**, no es alcanzable con `Tab`, no responde a `Enter` ni a `Barra espaciadora`, y no anuncia su nombre como "botón". El "arreglo" habitual empeora las cosas:

```html
<!-- "Solución" que multiplica el trabajo y sigue siendo frágil -->
<div class="btn" role="button" tabindex="0"
     onclick="confirmar()" onkeydown="...">Confirmar transferencia</div>
```

Ahora hay que reimplementar a mano el foco, el manejo de teclado (`Enter` y `Space` se comportan distinto), el estado `disabled`, la semántica de formulario… todo lo que `<button>` ya trae gratis. Esta es la tesis del artículo: **la semántica nativa es la primera —y casi siempre la mejor— herramienta de accesibilidad; ARIA es un complemento para lo que el HTML no puede expresar, no un sustituto de lo que sí puede.**

## Prerrequisitos y glosario

- **Rol, nombre, estado, valor**: las cuatro cosas que un control expone a la tecnología asistiva. WCAG 2.2 las exige en el criterio [4.1.2 *Name, Role, Value* (A)](https://www.w3.org/WAI/WCAG22/Understanding/name-role-value).
- **Nombre accesible**: el texto que la AT anuncia para un elemento. Se calcula con un algoritmo estándar, el *Accessible Name and Description Computation* ([W3C, `accname`](https://www.w3.org/TR/accname/)), que combina `<label>`, contenido, `aria-labelledby`, `aria-label`, etc., en ese orden de prioridad.
- **HTML nativo**: elementos que ya traen rol, teclado y estados (`button`, `a`, `input`, `select`, `details`, `dialog`…).
- **ARIA** (*WAI-ARIA*): atributos (`role`, `aria-*`) que **describen** semántica cuando el HTML no alcanza. La versión vigente es **WAI-ARIA 1.2** (Recomendación W3C, junio de 2023); la 1.3 sigue en borrador ([W3C, WAI-ARIA](https://www.w3.org/WAI/standards-guidelines/aria/)).
- **APG** (*ARIA Authoring Practices Guide*): guía **informativa** con patrones de referencia ([W3C, APG](https://www.w3.org/WAI/ARIA/apg/)). Útil, pero **no es la norma**: no cites la APG como si fuera WCAG.

## La regla número uno de ARIA

El propio W3C la enuncia sin rodeos: *"Si podés usar un elemento HTML nativo o un atributo con la semántica y el comportamiento que necesitás ya incorporados, en lugar de reasignar un elemento y agregarle ARIA, hacelo"* ([W3C, "Using ARIA", First Rule of ARIA Use](https://www.w3.org/TR/using-aria/#firstrule)). Y el corolario incómodo: **"No ARIA is better than Bad ARIA"** — ARIA mal puesto es peor que no poner nada, porque *miente* a la tecnología asistiva sobre lo que el control es o hace.

Tres niveles de decisión, en orden:

1. **¿Existe un elemento HTML que ya tenga esta semántica?** → usalo. (`<button>`, `<a href>`, `<input type="…">`, `<nav>`, `<dialog>`.)
2. **¿Existe pero necesito ajustar un matiz de accesibilidad?** → HTML + un atributo ARIA puntual (`aria-describedby`, `aria-invalid`, `aria-expanded`).
3. **¿No existe un elemento nativo para este patrón?** (combobox con autocompletado, tabs, tree) → recién ahí un patrón ARIA completo, siguiendo la APG y **probándolo con lectores de pantalla reales**.

## El formulario de transferencia, hecho bien

Veamos el campo de importe con HTML nativo y ARIA solo donde aporta.

**Ejemplo — Campo semántico con ayuda y error asociados.**

```html
<label for="importe">Importe a transferir</label>
<p id="ayuda-importe">Ingresá un importe mayor que cero.</p>

<input id="importe" name="importe" inputmode="decimal"
       aria-describedby="ayuda-importe error-importe"
       aria-invalid="true">

<!-- El error se muestra SOLO cuando existe; ver la nota crítica abajo -->
<p id="error-importe" role="alert">Ingresá un importe válido.</p>
```

Por qué cada pieza:

- **`<label for="importe">`**: da el **nombre accesible** por el camino nativo, el de mayor prioridad y menor riesgo. El *label* visible cumple además [3.3.2 *Labels or Instructions* (A)](https://www.w3.org/WAI/WCAG22/Understanding/labels-or-instructions). Un `placeholder` **no** es una etiqueta: desaparece al escribir y suele fallar contraste.
- **`inputmode="decimal"`**: en mobile muestra el teclado numérico correcto. Es UX y también reduce fricción cognitiva.
- **`aria-describedby="ayuda-importe error-importe"`**: asocia *programáticamente* la ayuda y el error al campo, así el lector de pantalla los anuncia junto al nombre. Esto conecta el error con el campo, que es lo que exige [3.3.1 *Error Identification* (A)](https://www.w3.org/WAI/WCAG22/Understanding/error-identification).
- **`aria-invalid="true"`**: expone el *estado* de error. Debe alternarse dinámicamente: `true` solo cuando hay error.

**La nota crítica que el ejemplo obliga a hacer explícita:** `role="alert"` implica una *live region assertive* — el lector de pantalla interrumpe y lee su contenido en cuanto aparece o cambia. Eso es deseable **una vez**, cuando el error se produce; es hostil si el nodo está siempre presente y se re-anuncia en cada render o en cada tecla. Reglas de implementación:

- Renderizá el `<p id="error-importe">` **solo cuando hay error** (o mantenelo vacío y llenalo al validar), para que la aparición del texto sea lo que dispare el anuncio.
- No repitas el anuncio en cada pulsación: validá en `blur`/`submit`, no en cada `input`.
- Si preferís controlar el momento del anuncio con más precisión, una región `aria-live="polite"` con el error puede ser mejor que `role="alert"`; *polite* espera a que el usuario haga una pausa.

*(Decisión de diseño, no norma: elegir `polite` vs. `assertive` depende de cuán interruptivo deba ser el mensaje. Documentalo en el ADR.)*

## El journey del formulario, modelado

Este es el segundo diagrama obligatorio de la colección. Modela la secuencia error→campo→anuncio→corrección, que es donde más se rompe la accesibilidad de un formulario.

<figure class="diagram">
  <img src="/blog/diagrams/semantica-primero-html-nativo-vs-aria-1.svg" width="850" height="452" alt="Diagrama: semantica-primero-html-nativo-vs-aria (1)" loading="lazy" decoding="async" />
</figure>

Qué verificar en cada flecha:

- **`P → F`**: cada campo tiene **nombre accesible** vía `<label>`; el orden de foco sigue el orden visual ([2.4.3 *Focus Order*, A](https://www.w3.org/WAI/WCAG22/Understanding/focus-order)).
- **`V → F`**: el error se **asocia al campo** (`aria-describedby`, `aria-invalid`), no es un texto suelto arriba de todo.
- **`F → P`**: el **foco se mueve** al primer campo con error y el mensaje es **perceptible** por la AT — sin perder los datos ya ingresados. No depender solo de color o de un ícono ([1.4.1 *Use of Color*, A](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color)).
- **`R → P`**: el resultado (éxito/fracaso) se **anuncia** y ofrece la siguiente acción; para un cambio de estado que no mueve el foco, el patrón correcto es [4.1.3 *Status Messages* (AA)](https://www.w3.org/WAI/WCAG22/Understanding/status-messages) con una región *live*.

La verificación de "foco correcto" es automatizable ([artículo 3](/blog/automatizar-accesibilidad-ci-axe-playwright/)); la de "mensaje realmente perceptible por un lector de pantalla" es manual ([artículo 4](/blog/evaluacion-manual-matriz-at-defecto-a11y/)).

## Cuándo ARIA sí está justificado

ARIA no es el enemigo: es imprescindible cuando el HTML no tiene un elemento para el patrón. Casos legítimos en Nexo:

- **Combobox de destinatario con autocompletado**: no hay un elemento nativo equivalente. Se implementa con el patrón *Combobox* de la APG (`role="combobox"`, `aria-expanded`, `aria-controls`, `aria-activedescendant`) — y se prueba con lector de pantalla, porque es fácil de romper ([APG, Combobox Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/)).
- **Diálogo de confirmación**: preferí el elemento nativo `<dialog>` (con foco gestionado por el navegador). Si el diseño exige un modal custom, el patrón *Dialog (Modal)* de la APG define `role="dialog"`, `aria-modal="true"`, `aria-labelledby` y la gestión de foco ([APG, Dialog Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)).
- **Región de estado** para el resultado de la transferencia: `aria-live="polite"` es exactamente lo que ARIA aporta y el HTML no.

En los tres, la regla es la misma: **ARIA describe; vos seguís siendo responsable del comportamiento** (foco, teclado, cierre). ARIA no agrega comportamiento por sí solo.

## Anti-patrones (causa · consecuencia · alternativa)

- **`<div>` clickeable en vez de `<button>`.** *Causa*: control total del estilo. *Consecuencia*: sin rol, sin teclado, sin estado. *Alternativa*: `<button type="button">` y estilarlo con CSS; se puede resetear la apariencia sin perder la semántica.
- **ARIA para imitar HTML nativo** (`<div role="button">`, `<span role="heading">`). *Causa*: creer que ARIA "hace accesible". *Consecuencia*: reimplementás a mano lo que el nativo ya da, con bugs. *Alternativa*: usar el elemento nativo.
- **Eliminar el foco visible** (`outline: none`). *Causa*: estética. *Consecuencia*: viola [2.4.7 *Focus Visible* (AA)](https://www.w3.org/WAI/WCAG22/Understanding/focus-visible); nadie que use teclado sabe dónde está. *Alternativa*: estilá `:focus-visible` con un indicador de alto contraste; nunca lo quites, redíseñalo.
- **Anunciar todo** con `aria-live="assertive"` en cada cambio. *Causa*: "que se entere de todo". *Consecuencia*: ruido que tapa lo importante. *Alternativa*: `polite` por defecto; `assertive` solo para lo urgente; anunciar una vez.
- **`placeholder` como etiqueta.** *Causa*: diseño minimalista. *Consecuencia*: sin nombre accesible estable, bajo contraste. *Alternativa*: `<label>` visible y persistente.

## Trade-offs

- **HTML nativo + CSS** te da accesibilidad barata, pero a veces menos control fino sobre la interacción (p. ej. estilar `<select>` nativo es limitado). Es un costo aceptable en la enorme mayoría de los casos.
- **Componente ARIA custom** te da control total, al costo de mantener foco/teclado/estados a mano y de una deuda de pruebas manuales permanente. Reservalo para patrones sin equivalente nativo, y presupuestá la prueba con AT.
- **Regla práctica**: si tu componente custom reimplementa algo que un elemento nativo ya hace, estás pagando de más y probablemente introduciendo bugs de accesibilidad.

## Conexión con el portfolio Nexo Finanzas

- **ADR sugerido — `docs/adr/000X-componentes-semanticos.md`**: registrar la decisión "HTML nativo primero; ARIA solo para patrones sin equivalente nativo, con prueba de AT obligatoria". Incluir la política de `:focus-visible` y de regiones *live* (`polite` por defecto).
- **nexo-web-banking-e2e**: como el HTML es semántico, los selectores de prueba pueden ser **por rol y nombre accesible** (`getByRole('button', { name: 'Confirmar transferencia' })`), que son más estables y además *verifican* semántica de paso. Detalle en el [artículo 3](/blog/automatizar-accesibilidad-ci-axe-playwright/).
- **Evidencia vs. hipótesis**: "el combobox se implementó con el patrón APG" es una decisión de diseño; "es usable con NVDA/VoiceOver" es una **hipótesis** hasta que se prueba con esas AT y se adjunta evidencia. No lo declares accesible antes de verificarlo.

## Qué aprendimos y próximos pasos

- La semántica nativa da rol, nombre, teclado y estados gratis; ARIA describe lo que el HTML no puede.
- La primera regla de ARIA: no uses ARIA si hay un elemento nativo.
- Errores y estados se asocian al campo; `role="alert"`/`aria-live` se usan con cuidado para no re-anunciar.
- ARIA sin comportamiento (foco, teclado) no sirve: sos responsable del comportamiento.

Seguí con **[Automatizar accesibilidad sin fabricar cobertura](/blog/automatizar-accesibilidad-ci-axe-playwright/)** para probar foco y regresiones, y **[Evaluación manual](/blog/evaluacion-manual-matriz-at-defecto-a11y/)** para verificar los anuncios con lector de pantalla. Volvé al **[pilar](/blog/accesibilidad-como-calidad-arquitectura-pruebas/)** para el marco completo.

## Checklist de semántica

- [ ] Cada control interactivo usa el elemento nativo correcto (`button`, `a`, `input`…).
- [ ] Ningún `<div>`/`<span>` recibe `role` para imitar algo que HTML ya ofrece.
- [ ] Todo campo tiene `<label>` visible y asociado (no `placeholder` como etiqueta).
- [ ] Los errores se asocian con `aria-describedby`/`aria-invalid` y no dependen solo del color.
- [ ] `role="alert"`/`aria-live` anuncian una vez, en el momento correcto, sin repetición.
- [ ] `:focus-visible` está estilado; nunca se eliminó el foco visible.
- [ ] Cada patrón ARIA custom se probó con al menos un lector de pantalla y se documentó.

---

### Fuentes (consultadas el 9 de julio de 2026)

- [WAI-ARIA Overview (W3C)](https://www.w3.org/WAI/standards-guidelines/aria/) · [Using ARIA — Rules of ARIA Use](https://www.w3.org/TR/using-aria/#firstrule) · [ARIA Authoring Practices Guide (informativa)](https://www.w3.org/WAI/ARIA/apg/)
- [Accessible Name and Description Computation (accname)](https://www.w3.org/TR/accname/)
- WCAG 2.2 Understanding: [4.1.2 Name, Role, Value](https://www.w3.org/WAI/WCAG22/Understanding/name-role-value) · [3.3.1 Error Identification](https://www.w3.org/WAI/WCAG22/Understanding/error-identification) · [3.3.2 Labels or Instructions](https://www.w3.org/WAI/WCAG22/Understanding/labels-or-instructions) · [2.4.7 Focus Visible](https://www.w3.org/WAI/WCAG22/Understanding/focus-visible) · [4.1.3 Status Messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages)

