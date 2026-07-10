---
title: "Automatizar accesibilidad sin fabricar cobertura: axe-core, Playwright y teclado en CI"
description: "Un score verde de accesibilidad en CI no prueba nada. Cómo integrar axe-core y Playwright para detectar regresiones estructurales y probar foco y teclado, sin confundir una herramienta con una declaración de conformidad."
pubDate: 2026-07-09
tags: ["accesibilidad", "a11y", "axe-core", "playwright", "ci-cd", "automatizacion", "sdet"]
cluster: "09"
clusterTitle: "Accesibilidad como calidad"
type: "satelite"
order: 3
icon: "check"
iconHue: 175
readingLevel: "Intermedio–Avanzado"
prerequisites: "Requiere Node.js, Playwright y pipelines de CI."
---
> **Alcance.** Muestra cómo automatizar chequeos de accesibilidad como parte del pipeline. **La automatización detecta un subconjunto de los problemas y no determina conformidad.** Ejemplos ficticios para **Nexo Finanzas**. Es el satélite de implementación del [artículo pilar](/blog/accesibilidad-como-calidad-arquitectura-pruebas/).

## El problema: verde en CI, roto en producción

El pipeline de Nexo corre un escáner de accesibilidad y publica un badge: **"A11y: 100"**. El equipo lo celebra. Dos semanas después, soporte reporta que las personas que usan solo teclado quedan atrapadas en el modal de confirmación de transferencia: el foco cicla dentro del *backdrop* y nunca llega a *Confirmar*. El escáner nunca lo vio, porque **un keyboard trap en un flujo interactivo no es una violación estructural detectable en un DOM estático**.

La lección no es "la automatización no sirve". Es que la automatización sirve **para lo que sirve** —regresiones estructurales, a escala, baratas— y que presentarla como cobertura total fabrica una falsa sensación de seguridad. El W3C lo dice en su guía de herramientas: *las herramientas de evaluación no pueden determinar accesibilidad; solo asisten a una persona a hacerlo* ([W3C, "Selecting Web Accessibility Evaluation Tools"](https://www.w3.org/WAI/test-evaluate/tools/selecting/)).

## Prerrequisitos y versiones (verificadas el 9 de julio de 2026)

- **Node.js** y un proyecto con **Playwright**. Versión estable al momento de escribir: **Playwright 1.61** (junio de 2026), que incorpora un *WebAuthn virtual authenticator* útil para probar autenticación con passkeys ([Playwright, Release notes](https://playwright.dev/docs/release-notes)).
- **@axe-core/playwright**, la integración oficial de Deque. Versión al momento de escribir: **4.12.1** ([npm, @axe-core/playwright](https://www.npmjs.com/package/@axe-core/playwright)). El paquete versiona según el `axe-core` que empaqueta (motor **4.12.x**).
- Familiaridad con selectores por **rol/nombre** (ver [artículo 2](/blog/semantica-primero-html-nativo-vs-aria/)) y con tu sistema de CI.

> Verificá versiones en el momento de implementar: tanto Playwright como axe-core publican con frecuencia y la API puede cambiar.

## Qué detecta la automatización y qué no

**Detecta bien** (violaciones programáticas en el DOM renderizado): imágenes sin `alt`, campos sin `label`, contraste de texto insuficiente, `id` duplicados, atributos ARIA inválidos o roles sin los atributos requeridos, orden de encabezados roto, landmarks faltantes.

**No detecta** (requiere juicio humano): si el orden de foco *tiene sentido*, si el texto alternativo es *correcto* (no solo presente), si un mensaje de error es *comprensible*, si un lector de pantalla *anuncia* el resultado, si un keyboard trap rompe el journey, si el reflow al 400 % es usable.

Deque —autora de axe-core— comunica que su motor puede detectar una parte de los problemas de WCAG de forma automática y evita reportar falsos positivos; el número exacto depende de la fuente y del sitio, y **no debe leerse como "cobertura de accesibilidad"** *(dato de proveedor, no norma; trátalo como orientación, no como métrica de conformidad)* ([Deque, axe-core](https://github.com/dequelabs/axe-core)). La conclusión operativa: automatizá el piso estructural y **medí explícitamente lo no cubierto**.

## Ejemplo 1 — Escaneo con axe-core sobre un journey, sin ocultar hallazgos

```js
// tests/a11y/transferencia.a11y.spec.js
// Playwright 1.61 + @axe-core/playwright 4.12.1
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs';

test('Transferencia: escaneo axe en estados clave', async ({ page }, testInfo) => {
  await page.goto('/transferencias/nueva'); // entorno LOCAL/efímero, no prod

  // Escaneamos etiquetando por reglas WCAG 2.2 A y AA (evitamos "best-practice"
  // mezclado con norma; separar norma de heurística es clave para el reporte).
  const builder = new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']);

  const resultados = await builder.analyze();

  // 1) NUNCA ocultar hallazgos: se persiste el reporte completo como artefacto.
  fs.mkdirSync('reports/accessibility', { recursive: true });
  fs.writeFileSync(
    'reports/accessibility/transferencia-nueva.json',
    JSON.stringify(resultados, null, 2),
  );
  await testInfo.attach('axe-transferencia', {
    body: JSON.stringify(resultados.violations, null, 2),
    contentType: 'application/json',
  });

  // 2) El umbral es una POLÍTICA revisable, no un "puntaje".
  //    Aquí: cero violaciones nuevas de impacto critical/serious en este journey.
  const bloqueantes = resultados.violations.filter(
    (v) => v.impact === 'critical' || v.impact === 'serious',
  );
  expect(bloqueantes, JSON.stringify(bloqueantes, null, 2)).toEqual([]);
});
```

Decisiones explicadas por bloque:

- **`withTags([...])`** limita las reglas a criterios WCAG 2.2 A/AA. No mezclamos las reglas `best-practice` de axe con la norma: son útiles, pero no son WCAG, y confundirlas contamina el reporte.
- **Persistir + adjuntar el reporte completo** materializa la regla "no ocultar hallazgos". El artefacto queda auditable aunque el test pase.
- **El `expect` filtra por impacto**, y ese filtro **es una política** que el equipo revisa, no una nota. `critical/serious` bloquean; `moderate/minor` se registran y se priorizan, no se esconden.

**Evidencia reproducible (esperada, no ejecutada aquí):** con el servicio local levantado, `npx playwright test tests/a11y/transferencia.a11y.spec.js` genera `reports/accessibility/transferencia-nueva.json` y adjunta las `violations` al reporte de Playwright. **Limitación:** un resultado sin violaciones **no** significa "accesible"; significa "sin violaciones *detectables por axe* en *ese* DOM". No se incluyen aquí resultados de una corrida real ni métricas inventadas.

## Ejemplo 2 — Prueba de teclado y foco en el modal

Esto es lo que el escáner no ve. Recorremos el flujo con teclado, abrimos el diálogo y verificamos el foco y su **restauración** al cerrar.

```js
// tests/a11y/transferencia.teclado.spec.js
import { test, expect } from '@playwright/test';

test('Confirmar transferencia por teclado: foco entra y se restaura', async ({ page }) => {
  await page.goto('/transferencias/nueva');

  // Selección por ROL/NOMBRE: estable y además verifica semántica de paso.
  await page.getByRole('textbox', { name: 'Importe a transferir' }).fill('1500');
  await page.getByRole('combobox', { name: 'Cuenta destino' }).selectOption('AR-001');

  const abrir = page.getByRole('button', { name: 'Confirmar transferencia' });
  await abrir.focus();
  await page.keyboard.press('Enter'); // se opera con teclado, no con click

  // 1) El foco debe entrar al diálogo (no quedar detrás del backdrop).
  const dialogo = page.getByRole('dialog', { name: 'Confirmar transferencia' });
  await expect(dialogo).toBeVisible();
  const focoDentro = await dialogo.evaluate((el) => el.contains(document.activeElement));
  expect(focoDentro, 'El foco debe estar dentro del diálogo al abrir').toBe(true);

  // 2) Al cerrar, el foco vuelve al control que lo abrió (2.4.3 orden de foco).
  await page.getByRole('button', { name: 'Cancelar' }).press('Enter');
  await expect(abrir).toBeFocused();
});
```

Por qué importa —y su límite honesto:

- Verifica **comportamiento**, no apariencia: que el foco entre al diálogo y se restaure. Cubre parte de [2.4.3 *Focus Order*](https://www.w3.org/WAI/WCAG22/Understanding/focus-order) y detecta el keyboard trap del inicio.
- **Una aserción de foco no prueba la experiencia con lector de pantalla.** Que `document.activeElement` esté dentro del diálogo no dice si NVDA/VoiceOver **anuncia** el nombre del diálogo, su rol de "diálogo", ni el contenido. Eso se verifica manualmente ([artículo 4](/blog/evaluacion-manual-matriz-at-defecto-a11y/)). La automatización *reduce el espacio de búsqueda* de la prueba manual; no la reemplaza.

## Ejemplo 3 — El job de CI: política revisable, no puntuación

Reusamos —y comentamos— el patrón del pilar:

```yaml
# nexo-quality-platform — .ci/accessibility.yml (extracto)
accessibility_smoke:
  stage: verify
  script:
    - npm run test:a11y:critical-journeys   # corre los specs de arriba
  artifacts:
    when: always            # el reporte se publica AUNQUE el job falle
    paths:
      - reports/accessibility/
    expire_in: 30 days
  # 'allow_failure' se decide como POLÍTICA del equipo, documentada en un ADR:
  #  - journeys críticos: el job bloquea el merge (allow_failure: false)
  #  - resto del sitio: informa, no bloquea, mientras se salda la deuda
  allow_failure: false
```

Claves de gobernanza:

- **`when: always`**: el artefacto se publica pase o falle el job. Ocultar el reporte cuando falla es la forma más sutil de "fabricar cobertura".
- **`allow_failure` como decisión documentada**: bloquear el merge solo en journeys críticos evita el anti-patrón opuesto (un gate tan estricto que el equipo lo apaga). La política vive en un ADR, no en la cabeza de quien configuró el pipeline.
- **Nada de "score"**: el pipeline reporta *violaciones por impacto y por journey*, no un número de 0 a 100. Un número invita a redondearlo hacia "cumple".

## Autenticación accesible y passkeys en CI

WCAG 2.2 agregó [3.3.8 *Accessible Authentication (Minimum)* (AA)](https://www.w3.org/WAI/WCAG22/Understanding/accessible-authentication-minimum): el login no debe exigir resolver un *puzzle cognitivo* (recordar y transcribir, resolver un captcha de reconocimiento) sin alternativa. Las **passkeys/WebAuthn** son una alternativa alineada con ese criterio. Playwright 1.61 incorpora un **WebAuthn virtual authenticator**, lo que permite automatizar el flujo de passkey sin hardware físico ([Playwright, Release notes](https://playwright.dev/docs/release-notes)). *(Decisión de diseño: probar el flujo de auth accesible en CI reduce el riesgo de regresiones en el login, pero la usabilidad real con AT sigue requiriendo prueba manual.)*

## Dónde correr cada prueba (trade-offs)

- **Prueba de componente** (axe sobre un componente aislado, p. ej. el formulario): rápida, estable, ideal para regresiones de semántica. Límite: no ve el journey.
- **E2E con axe + teclado** (lo de arriba): cubre el journey y el foco. Costo: más lenta y más propensa a *flakiness*; acotala a los journeys críticos.
- **Prueba manual con AT**: irremplazable para anuncios y experiencia. Costo: tiempo humano; por eso se prioriza por riesgo del journey.

Anti-patrón de costo: correr axe sobre **cada** página en cada commit vuelve el pipeline lento y ruidoso, y empuja al equipo a ignorar el reporte. Mejor: **journeys críticos en cada PR**, barrido más amplio en nightly.

## Anti-patrones (causa · consecuencia · alternativa)

- **Score automático como evidencia de conformidad.** *Causa*: querer un número tranquilizador. *Consecuencia*: falsa conformidad; defectos experienciales en prod. *Alternativa*: reportar violaciones por impacto + medir "no cubierto"; la conformidad requiere WCAG-EM ([pilar](/blog/accesibilidad-como-calidad-arquitectura-pruebas/)).
- **Probar solo la pantalla inicial.** *Causa*: es la más fácil de scriptear. *Consecuencia*: errores, modales, sesión vencida y confirmación quedan sin ver. *Alternativa*: escanear estados (vacío/error/carga/éxito/modal).
- **Ocultar hallazgos cuando el job pasa** (o cuando falla). *Causa*: pipeline "verde". *Consecuencia*: se pierde trazabilidad. *Alternativa*: `when: always` + artefacto persistido.
- **Mezclar reglas `best-practice` con WCAG.** *Causa*: usar el preset por defecto. *Consecuencia*: ruido que erosiona la confianza en el reporte. *Alternativa*: etiquetar por criterio WCAG y separar heurísticas.

## Conexión con el portfolio Nexo Finanzas

- **nexo-quality-platform**: aloja el job `accessibility_smoke`, la política de *quality gate* (ADR) y la retención de artefactos.
- **nexo-web-banking-e2e**: aloja los specs de journey (ejemplos 1 y 2) con selectores por rol/nombre, reutilizando los criterios Cucumber accesibles del [pilar](/blog/accesibilidad-como-calidad-arquitectura-pruebas/).
- **Evidencia vs. hipótesis**: el JSON de axe y el reporte de Playwright **son evidencia** (con versión de herramienta y entorno). "El flujo es accesible" es una **hipótesis** hasta sumar la prueba manual del [artículo 4](/blog/evaluacion-manual-matriz-at-defecto-a11y/).

## Qué aprendimos y próximos pasos

- La automatización detecta regresiones estructurales a escala; **no** determina conformidad ni cubre lo experiencial.
- El umbral es una política revisable por impacto y journey, no un puntaje.
- Las pruebas de teclado/foco cubren comportamiento, pero no reemplazan al lector de pantalla.
- Persistir el reporte siempre y separar WCAG de heurísticas mantiene la confianza en el pipeline.

Seguí con **[Evaluación manual, matriz de AT y ficha de defecto](/blog/evaluacion-manual-matriz-at-defecto-a11y/)** para lo que la máquina no ve. Repasá la **[semántica](/blog/semantica-primero-html-nativo-vs-aria/)** que hace estables los selectores por rol, y el **[pilar](/blog/accesibilidad-como-calidad-arquitectura-pruebas/)** para el marco.

## Checklist de automatización

- [ ] Los escaneos etiquetan reglas por criterio WCAG (sin mezclar `best-practice`).
- [ ] El reporte completo se persiste y adjunta **siempre** (`when: always`).
- [ ] El umbral es una política documentada por impacto y por journey.
- [ ] Hay pruebas de teclado/foco además del escáner (entra al modal y restaura foco).
- [ ] Se escanean estados, no solo la pantalla inicial.
- [ ] El pipeline **no** publica un "score de accesibilidad".
- [ ] Cada evidencia registra versión de herramienta y entorno, sin PII.

---

### Fuentes (consultadas el 9 de julio de 2026)

- [Playwright — Release notes](https://playwright.dev/docs/release-notes) (v1.61, WebAuthn virtual authenticator)
- [@axe-core/playwright (npm)](https://www.npmjs.com/package/@axe-core/playwright) · [axe-core (GitHub, Deque)](https://github.com/dequelabs/axe-core)
- [W3C — Selecting Web Accessibility Evaluation Tools](https://www.w3.org/WAI/test-evaluate/tools/selecting/)
- WCAG 2.2 Understanding: [2.4.3 Focus Order](https://www.w3.org/WAI/WCAG22/Understanding/focus-order) · [3.3.8 Accessible Authentication (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/accessible-authentication-minimum)

