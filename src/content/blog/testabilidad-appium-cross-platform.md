---
title: "Testabilidad y Appium moderno: contratos de identificadores y journeys que no se rompen"
description: "Cómo hacer testeable una app mobile con contratos de accessibility IDs y escribir journeys Appium cross-platform estables (waits explícitos, evidencia al fallar) sin duplicar la pirámide, con un ADR de asignación de cobertura."
pubDate: 2026-07-09
tags: ["appium", "accessibility-id", "testability", "android", "ios", "xcuitest", "uiautomator2", "adr"]
cluster: "10"
clusterTitle: "Mobile Quality Engineering"
type: "satelite"
order: 2
icon: "phone"
iconHue: 300
readingLevel: "Intermedio–Avanzado"
---
## El problema: la suite que se rompe con cada rediseño

Cada vez que diseño cambia el texto de un botón o mueve un campo, media suite Appium de Nexo se cae. La causa raíz no es Appium: son **localizadores frágiles** —XPath absoluto, texto visible, posición— y una app que nunca se diseñó para ser verificada.

Antes de escribir un solo `findElement`, hay que ganar **testabilidad**. Este artículo es el "cómo" del [pilar de estrategia](/blog/calidad-mobile-por-riesgo/).

## Prerrequisitos y glosario

Necesitás la [estrategia por riesgo del pilar](/blog/calidad-mobile-por-riesgo/), Java 11+ y nociones de Selenium 4 (WebDriver W3C).

Verificado a julio de 2026: **Appium 3.x** ([releases](https://github.com/appium/appium/releases), cadencia trimestral) con arquitectura de **drivers instalables** (`appium driver install uiautomator2`), y **Appium Java client 9.x** ([java-client](https://github.com/appium/java-client)), donde `AppiumBy` reemplaza al antiguo `MobileBy` y `UiAutomator2Options` reemplaza a `DesiredCapabilities`.

- **Accessibility ID:** identificador estable y semántico que expone la app. En Android es `contentDescription` o `testTag`; en iOS, `accessibilityIdentifier`. Appium lo consulta con `AppiumBy.accessibilityId` ([documentación de Appium](https://appium.io/docs/en/latest/)).
- **Wait explícito:** espera condicionada (elemento clickeable, visible) en lugar de un `sleep` de duración fija.

## Contrato de identificadores: el cimiento

Un accessibility ID es un **contrato** entre la app y la suite, no un detalle de implementación. La convención propuesta para Nexo es `dominio.entidad.rol`: minúsculas, separado por puntos, estable entre versiones e idiomas.

```text
transfer.amount.input
transfer.recipient.selector
transfer.confirm.button
transfer.result.reference
```

Qué **no** debe formar parte de un ID:

- **PII o datos de negocio.** Nunca `transfer.recipient.juan_perez`.
- **Valores dinámicos:** montos, timestamps, identificadores de sesión.
- **Texto de UI traducible.** El ID debe sobrevivir a i18n y a cambios de copy.

Por qué las alternativas son frágiles:

**XPath absoluto** (`/hierarchy/.../android.widget.Button[3]`) se rompe ante cualquier cambio del árbol de vistas. La consecuencia son falsos rojos masivos tras un refactor cosmético. La alternativa es el accessibility ID.

**Texto visible** (`"Confirmar"`) se rompe con internacionalización y pruebas A/B de copy. La alternativa es un ID semántico invariante al idioma.

**Posición o índice** se rompe con reordenamientos y densidades de pantalla distintas. La alternativa es un ID por rol.

> **Decisión de diseño.** El contrato de IDs se versiona junto al código de la app y cambiarlo requiere revisión, igual que una API pública. Ver **el contrato completo**.

## Cómo exponer los IDs en cada plataforma

Bloques **ilustrativos**; ajustá a la versión de framework que tengas instalada.

```kotlin
// Android · Jetpack Compose: testTag se expone como resource-id / accessibility
Button(
  onClick = ::confirmTransfer,
  modifier = Modifier.testTag("transfer.confirm.button")
) { Text(stringResource(R.string.confirm)) }
```

```swift
// iOS · SwiftUI: accessibilityIdentifier es estable e independiente del texto visible
Button(action: confirmTransfer) { Text("confirm") }
  .accessibilityIdentifier("transfer.confirm.button")
```

En Android, para que `testTag` sea visible a UiAutomator2 y a Appium puede requerirse habilitar la semántica de test (`testTagsAsResourceId`). Confirmá el detalle contra la documentación de [Compose testing](https://developer.android.com/develop/ui/compose/testing) de tu versión.

## Una prueba Appium Java corta y estable

Journey mínimo con **waits explícitos**, **datos sintéticos** y **evidencia al fallar**. No usa `sleep` fijo.

Está rotulado como **ejemplo**: el nombre de las capabilities, el driver y las versiones deben confirmarse contra la documentación de la versión que tengas instalada.

```java
// Ejemplo (Appium 3.x / java-client 9.x / Selenium 4). Confirmar versiones instaladas.
UiAutomator2Options options = new UiAutomator2Options()
    .setDeviceName("emulator-5554")           // ajustar al device/emulador real
    .setAppPackage("com.nexo.wallet")
    .setAppActivity(".MainActivity")
    .setAutomationName("UiAutomator2");        // driver instalable en Appium 2/3

AndroidDriver driver = new AndroidDriver(
    new URL("http://127.0.0.1:4723/"), options); // en Appium 2/3 el basepath ya no es /wd/hub

WebDriverWait wait = new WebDriverWait(driver, Duration.ofSeconds(10));
try {
    // datos sinteticos: NUNCA credenciales, cuentas o montos reales
    wait.until(ExpectedConditions.elementToBeClickable(
        AppiumBy.accessibilityId("transfer.amount.input"))).sendKeys("1500");

    driver.findElement(AppiumBy.accessibilityId("transfer.recipient.selector")).click();

    wait.until(ExpectedConditions.elementToBeClickable(
        AppiumBy.accessibilityId("transfer.confirm.button"))).click();

    String ref = wait.until(ExpectedConditions.visibilityOfElementLocated(
        AppiumBy.accessibilityId("transfer.result.reference"))).getText();
    assertThat(ref).isNotBlank(); // la unicidad de la operacion se verifica en el Articulo 3
} catch (Throwable t) {
    // evidencia al fallar: screenshot saneado (sin PII ni tokens en pantalla)
    File shot = ((TakesScreenshot) driver).getScreenshotAs(OutputType.FILE);
    Files.copy(shot.toPath(), Path.of("artifacts/mobile/failure.png"),
        StandardCopyOption.REPLACE_EXISTING);
    throw t;
} finally {
    driver.quit();
}
```

Explicación por bloques:

1. `UiAutomator2Options` declara las capabilities de forma tipada, en lugar del viejo mapa de `DesiredCapabilities`.
2. En Appium 2 y 3 el endpoint por defecto ya **no** es `/wd/hub`. Confirmalo contra tu server antes de copiar.
3. `WebDriverWait` sincroniza por **condición**, no por tiempo transcurrido.
4. El `catch` produce evidencia reproducible, pero **saneada**: si la pantalla mostrara datos sensibles, el screenshot los filtraría al artefacto de CI.

Por qué waits explícitos y no `sleep`: la sincronización por condición es el patrón recomendado en WebDriver ([Selenium · Waits](https://www.selenium.dev/documentation/webdriver/waits/)). Un `sleep(5000)` o bien duplica la duración de la suite, o bien es demasiado corto y produce flakiness. Suele ser ambas cosas en distintos runners.

## Android e iOS bajo Appium: una capa, dos stacks

Appium unifica el *journey*, pero por debajo usa **UiAutomator2** en Android ([driver](https://github.com/appium/appium-uiautomator2-driver)) y **XCUITest** en iOS ([driver](https://github.com/appium/appium-xcuitest-driver)).

Implicancias prácticas: las capabilities y las estrategias de localización difieren entre plataformas; el mismo accessibility ID debe existir en ambas apps —por eso el **contrato** es cross-platform y no un detalle de Android—; y hay gestos y estados que cada driver resuelve de manera distinta.

No falsees equivalencia. Un test verde en Android no implica verde en iOS, y Swift Testing no cubre UI tests: en iOS el E2E sigue siendo XCUITest ([Swift Testing](https://developer.apple.com/documentation/testing)).

## ADR de cobertura: qué va a Appium y qué no

El resumen de la decisión (el documento completo está en **ADR-002**):

- **Dominio** (montos, sesión, máquina de estados) → unit, en JVM o Swift.
- **Contratos, `401` → refresh, idempotencia** → integración con la API.
- **Estado de pantalla, permisos, rotación** → UI nativa (Espresso/Compose, XCUITest).
- **Solo dos journeys cross-platform van a Appium:** login más transferencia feliz, y transferencia con red degradada más verificación de no-duplicación.

La alternativa descartada fue cubrir todo con Appium, rechazada por costo de feedback y fragilidad.

## Anti-patrones

**`sleep` fijo para sincronizar.** *Causa:* es el atajo más rápido de escribir. *Consecuencia:* suites lentas o flakiness intermitente, según el runner. *Alternativa:* waits explícitos por condición.

**Depender de texto visual o XPath absoluto.** *Causa:* la app no expone IDs, y nadie los pidió. *Consecuencia:* rotura ante cualquier rediseño o traducción. *Alternativa:* contrato de accessibility IDs, versionado con el código.

**Duplicar en Appium lo que ya valida un unit test.** *Causa:* desconfianza en los niveles bajos. *Consecuencia:* suites redundantes que tardan minutos en decir lo que un test de milisegundos ya dijo. *Alternativa:* un ADR de asignación que declare el nivel dueño de cada verificación.

## Evidencia reproducible

- **Entorno:** Appium 3.x server; java-client 9.x; JDK 11+; driver UiAutomator2 o XCUITest instalado; emulador/simulador declarado explícitamente.
- **Comandos:** `appium driver list --installed`, `appium` para levantar el server, `./gradlew runMobileE2E -Pplatform=android`.
- **Resultado esperado:** el journey feliz completa y produce un valor en `transfer.result.reference`. Ante un fallo, se genera `artifacts/mobile/failure.png` saneado.
- **Limitaciones:** este artículo **no** valida la no-duplicación, que es responsabilidad del [Artículo 3](/blog/red-degradada-lifecycle-idempotencia/). Las versiones deben confirmarse contra la documentación instalada. No se incluyen resultados de corridas reales ni métricas medidas.

## Qué aprendimos y próximos pasos

La estabilidad de un E2E empieza **antes** de Appium: en un contrato de identificadores y en la decisión de qué **no** subir a E2E. Con eso resuelto, Appium se vuelve una herramienta de journeys selectos en lugar de una fábrica de flakiness.

- Marco general → **[Artículo 1: Calidad mobile por riesgo](/blog/calidad-mobile-por-riesgo/)**
- Verificar el journey de red y no-duplicación → **[Artículo 3](/blog/red-degradada-lifecycle-idempotencia/)**
- Ejecutar en CI y controlar flakiness → **[Artículo 4](/blog/ci-matriz-flakiness-evidencia/)**

## Checklist final

- [ ] Existe un contrato de accessibility IDs documentado y versionado.
- [ ] Los IDs no contienen PII, valores dinámicos ni texto traducible.
- [ ] Ningún test usa `sleep` fijo; todos usan waits explícitos.
- [ ] Cada test captura evidencia saneada al fallar.
- [ ] Un ADR justifica qué journeys van a Appium y cuáles no.
- [ ] Las versiones de Appium, driver y cliente se confirmaron contra la documentación instalada.

---

*Colección **Mobile Quality Engineering**. Fuentes verificadas al 2026-07-09; ver **Control de calidad editorial**.*

