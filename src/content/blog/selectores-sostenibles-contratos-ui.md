---
title: "Selectores sostenibles: cómo dejar de perseguir el DOM"
description: "Selectores que no se rompen: prioridad por semántica accesible, política de data-testid con ownership y revisión en PR. Guía práctica para Selenium y Appium."
pubDate: 2026-07-09
tags: ["selectores", "accesibilidad", "selenium", "appium", "test-automation"]
cluster: "03"
clusterTitle: "Framework engineering para automatización"
type: "satelite"
order: 2
icon: "bot"
iconHue: 210
readingLevel: "Intermedio"
prerequisites: "QA Automation"
---
> **Subtítulo:** Roles accesibles, `data-testid` con dueño compartido y revisión de selectores en PR, para que un rediseño no te rompa la suite.

**Fecha de verificación de fuentes:** 2026-07-09.

---

## Resumen ejecutivo

- El selector frágil es la causa #1 de mantenimiento en suites de UI; el problema no es el DOM, es **atarse a lo que cambia**.
- Priorizá selectores por **contrato**: primero semántica accesible (rol/nombre), luego `data-testid` acordado, y solo como último recurso CSS/XPath estructural.
- `data-testid` no es una etiqueta que agrega QA sola: es un **contrato con ownership compartido** entre desarrollo y QA, versionado y revisado.
- Selenium localiza por **DOM**, no tiene `ByRole` nativo; para semántica hay que usar atributos ARIA/roles vía CSS o `getAccessibleName()`. Es una limitación real que conviene conocer.
- Los selectores frágiles se atrapan en **revisión de PR**, no después de que rompen el pipeline.

## Nota de alcance

Guía de diseño con ejemplos ilustrativos. Los selectores semánticos **apoyan** la accesibilidad pero **no reemplazan** una evaluación de accesibilidad con personas y herramientas especializadas. Nexo Finanzas es ficticio; los `data-testid` son ejemplos.

---

## 1. El problema real: un rediseño rompió 40 tests

En Nexo Finanzas, el equipo de diseño movió el botón "Enviar" de transferencia dentro de un nuevo contenedor y le cambió la clase CSS. Cuarenta tests fallaron de golpe. Ninguno de esos cambios alteró el **comportamiento**: la transferencia funcionaba igual. Fallaron porque los selectores decían cosas como:

```java
// Anti-patrón: atado a layout, índices y texto inestable
driver.findElement(By.xpath("/html/body/div[2]/div/form/div[3]/button[1]"));
driver.findElement(By.cssSelector("div.card > div.footer > button.btn-primary"));
driver.findElement(By.xpath("//button[text()='Enviar']")); // rompe al traducir la UI
```

El síntoma es "40 tests rojos". La causa es que el selector describe **dónde está** el elemento y **cómo se ve**, no **qué es**. Cuando el layout o el estilo cambian —algo que pasa seguido y es legítimo— el selector miente.

## 2. Prioridad de selectores como contrato

La idea central: elegí selectores según **qué tan estable es lo que describen**. De más estable a menos:

<figure class="diagram">
  <img src="/blog/diagrams/selectores-sostenibles-contratos-ui-1.svg" alt="Diagrama: selectores-sostenibles-contratos-ui (1)" loading="lazy" decoding="async" />
</figure>

**Cómo leer esta jerarquía:**

- **Nivel 1 — semántica accesible.** Un botón es un `button` con nombre accesible "Enviar transferencia". Ese contrato cambia solo si cambia el *significado* del elemento, lo cual es raro y, si pasa, querés que el test lo note. Además, empujar a que los elementos tengan roles y nombres accesibles mejora la accesibilidad real del producto ([WCAG 2.2](https://www.w3.org/WAI/standards-guidelines/wcag/)).
- **Nivel 2 — `data-testid`.** Un atributo dedicado a testing, acordado. Es explícito, no colisiona con estilos y sobrevive rediseños. Su debilidad es que es un contrato *que hay que mantener* (ver sección 4).
- **Nivel 3 — atributos de negocio estables.** `name="amount"` en un input suele ser estable porque lo usa el backend.
- **Niveles 4 y 5 — CSS/XPath estructural.** Solo cuando no controlás el markup (por ejemplo, un widget de terceros). Acotalo lo máximo posible y documentá por qué.

> **Decisión razonada:** no existe "el selector correcto" universal. En un design system con roles bien puestos, el nivel 1 gana. En una app legada sin semántica, `data-testid` es más pragmático que pelear con el markup. Elegí según lo que tu producto realmente ofrece hoy.

## 3. La realidad de Selenium: DOM, no árbol de accesibilidad

Acá hace falta honestidad técnica. **Selenium localiza elementos por el DOM y no incorpora localizadores por rol del árbol de accesibilidad** (a diferencia de otras herramientas que sí lo hacen), y no hay planes de agregarlos al core en el corto plazo ([Locator strategies, Selenium](https://www.selenium.dev/documentation/webdriver/elements/locators/), consultado 2026-07-09). Esto tiene consecuencias prácticas.

Para aplicar el "nivel 1" en Selenium, se traduce la semántica a selectores de DOM que reflejan ARIA/roles, y se puede **verificar** el nombre accesible con `getAccessibleName()`:

```java
// Ilustrativo. Selenium 4.45 (docs consultadas 2026-07-09).
// Localiza por rol/atributo semántico expresado en el DOM...
WebElement submit = driver.findElement(
    By.cssSelector("button[type='submit'][aria-label='Enviar transferencia']"));

// ...y opcionalmente verifica el nombre accesible computado (W3C AccName).
String accName = submit.getAccessibleName();
assertThat(accName).isEqualTo("Enviar transferencia");
```

**Análisis por bloques:**

- **Responsabilidad:** localizar por lo semántico disponible en el DOM (`type`, `aria-label`, `role`), no por posición.
- **Limitación:** `getAccessibleName()` sirve para **verificar** accesibilidad, no como estrategia primaria de localización; y depende de que el markup tenga la semántica puesta. Si el equipo no usa ARIA, este camino no está disponible y caés al nivel 2.
- **Alternativa:** frameworks basados en el árbol de accesibilidad ofrecen `getByRole` nativo. Mencionarlo no significa migrar; significa saber qué te da y qué te cuesta cada herramienta antes de decidir. Verificá siempre contra la documentación oficial vigente.

## 4. `data-testid` como contrato con dueño compartido

El error más común es que QA agrega `data-testid` "por afuera", pidiéndole a desarrollo que los ponga sin acordar convenciones. El resultado: nombres inconsistentes, atributos que desaparecen en refactors y culpas cruzadas.

Un `data-testid` sostenible es un **contrato de colaboración** con estas reglas:

- **Ownership compartido:** desarrollo y QA acuerdan que estos atributos son parte del componente, como cualquier prop. Quitar uno es un cambio con impacto, no una limpieza libre.
- **Convención de nombres estable y semántica:** `submit-transfer`, `transfer-receipt`, `source-account`. No `btn1`, no `test-div-3`.
- **Scope acotado:** un `data-testid` por elemento interactuable relevante para journeys, no en cada `div`.
- **Versionado con la UI:** si un componente reusable cambia su `data-testid`, es un cambio documentado que puede romper tests aguas abajo.

Ejemplo de política breve (fragmento de un `CONTRIBUTING` o ADR):

```md
## Política de data-testid (Nexo web)
- Formato: kebab-case, prefijo por feature: `transfer-*`, `login-*`.
- Se agregan en elementos que un journey necesita accionar o leer.
- Cambiar o quitar un `data-testid` requiere aprobación de QA en el PR.
- No se usan para estilos ni para lógica de la app.
```

> **Trade-off honesto:** `data-testid` acopla el markup de producción a testing. El costo es tener atributos "de más" en el HTML. El beneficio es un contrato explícito y estable. Para la mayoría de las apps web ese trade-off vale la pena; en componentes públicos muy sensibles al tamaño del DOM, evaluá quitarlos en el build de producción con una herramienta de build (y documentá que tu suite corre contra un build que sí los incluye).

## 5. Mobile: selectores de accesibilidad, no coordenadas

En Appium el principio se mantiene, con matices de plataforma. La recomendación oficial es apoyarse en **identificadores de accesibilidad** (`accessibility id`), que mapean a `content-desc` en Android y a `accessibilityIdentifier` en iOS, en lugar de XPath sobre la jerarquía nativa, que es lento y frágil ([Appium docs](https://appium.io/docs/en/latest/), consultado 2026-07-09).

```java
// Ilustrativo. Appium 3.x (docs consultadas 2026-07-09).
// AppiumBy.accessibilityId funciona cross-plataforma si el equipo puso los ids.
WebElement submit = driver.findElement(AppiumBy.accessibilityId("submit-transfer"));
```

**Notas de vigencia:** Appium 3 (GA en 2025) requiere Node.js 20+ y cambió el prefijo de algunos feature flags a la forma `driver:flag` (por ejemplo `uiautomator2:adb_shell`) ([Migrating to Appium 3](https://appium.io/docs/en/3.1/guides/migrating-2-to-3/)). Si venís de Appium 2, revisá la guía de migración antes de tocar capacidades.

> **Anti-patrón mobile:** localizar por XPath absoluto sobre la jerarquía de vistas nativa. Se rompe con cualquier cambio de layout y es de los localizadores más lentos. La alternativa es coordinar `accessibility id` con desarrollo, igual que `data-testid` en web —y con el beneficio extra de mejorar la accesibilidad de la app.

## 6. Revisar selectores en el Pull Request

Los selectores frágiles no se arreglan cuando rompen el pipeline; se **previenen en revisión**. Preguntas concretas para el reviewer de un PR que agrega o cambia tests:

- ¿El selector describe **qué es** el elemento (rol/nombre/`data-testid`) o **dónde está** (índice/layout)?
- ¿Depende de **texto visible** que puede traducirse o reescribirse?
- ¿Introduce un `data-testid` nuevo? ¿Sigue la convención? ¿Está acordado con desarrollo?
- ¿Hay XPath por índice (`div[2]`, `button[1]`) que pueda reemplazarse por semántica?
- Si toca un componente reusable, ¿el cambio de selector impacta otros journeys?

Un pequeño helper puede **hacer visible la intención** y centralizar la política, de modo que un selector frágil "cante" en el diff:

```java
// Ilustrativo. Centraliza estrategia y facilita la revisión.
public final class Ui {
  public static By testId(String id) {
    return By.cssSelector("[data-testid='" + id + "']"); // id: constante controlada
  }
  // Sin métodos para XPath por índice: si alguien lo necesita, se ve en el PR.
}
```

**Por qué ayuda:** al no ofrecer un atajo para XPath por índice, cualquier selector frágil aparece como `By.xpath(...)` crudo en el diff y dispara la conversación en revisión. Es diseño para la revisabilidad, no una prohibición técnica.

## 7. Anti-patrones y salidas

| Anti-patrón | Consecuencia | Alternativa concreta |
|---|---|---|
| XPath absoluto (`/html/body/div[2]/...`) | Se rompe con cualquier cambio de estructura | `data-testid` o rol/nombre accesible |
| Selector por texto visible (`text()='Enviar'`) | Se rompe al traducir o reescribir copy | `data-testid` o `aria-label` estable |
| `data-testid` puestos por QA sin acuerdo | Desaparecen en refactors; culpas cruzadas | Contrato con ownership compartido y revisión en PR |
| CSS atado a clases de estilo (`.btn-primary`) | Se rompe con cambios de diseño | Atributo semántico o de testing dedicado |
| XPath sobre jerarquía nativa en mobile | Lento y frágil | `accessibility id` coordinado con desarrollo |

## Qué aprendimos y próximos pasos

Un selector es una afirmación sobre qué es un elemento; si en cambio afirma dónde está o cómo se ve, mentirá en cuanto el producto evolucione. La prioridad —semántica accesible, luego `data-testid` acordado, y estructural solo como último recurso— convierte el mantenimiento reactivo en un contrato explícito que se revisa en PR y que, de paso, empuja la accesibilidad del producto.

Continuá con:

- Cómo estos selectores viven dentro de adaptadores que no filtran a los escenarios → [Framework engineering: tu suite es un producto interno](/blog/framework-engineering-suite-producto-interno/).
- Por qué esperar a que un elemento sea *localizable y estable* es tan importante como el selector mismo → [Confiabilidad y diagnóstico](/blog/confiabilidad-diagnostico-flakiness-evidencia/).

## Checklist final

- [ ] Tengo una jerarquía de prioridad de selectores documentada.
- [ ] Mis selectores describen qué es el elemento, no dónde está.
- [ ] `data-testid` tiene convención de nombres y ownership compartido.
- [ ] Sé qué me da y qué no me da mi herramienta respecto de roles accesibles.
- [ ] En mobile uso `accessibility id`, no XPath sobre la jerarquía nativa.
- [ ] Los selectores frágiles se detectan en revisión de PR, no en el pipeline.

---

*Prerrequisitos: DOM y HTML semántico, nociones de ARIA/roles accesibles, selectores CSS y XPath básicos, y (para la sección mobile) selectores de accesibilidad en Android/iOS. Enlazamos la documentación oficial junto a cada API; no reemplaza esos manuales ni una evaluación de accesibilidad profesional.*

