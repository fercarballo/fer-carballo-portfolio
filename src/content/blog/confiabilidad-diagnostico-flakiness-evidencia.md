---
title: "Confiabilidad y diagnóstico: flakiness sin maquillaje"
description: "Dejá de esconder flakiness con Thread.sleep y retries. Esperas observables, clasificación de fallas, correlation-id y evidencia sanitizada para diagnosticar."
pubDate: 2026-07-09
tags: ["flakiness", "observabilidad", "sincronizacion", "test-automation", "sre"]
cluster: "03"
clusterTitle: "Framework engineering para automatización"
type: "satelite"
order: 4
repo: "flakiness-hunting-playwright"
icon: "bot"
iconHue: 210
readingLevel: "Intermedio–Avanzado"
prerequisites: "QA Automation / SDET / SRE"
---
> **Subtítulo:** Esperas por condición observable, clasificación de fallas antes de reintentar, correlation-id, evidencia sanitizada y un runbook de triage.

**Fecha de verificación de fuentes:** 2026-07-09.

---

## Resumen ejecutivo

- `Thread.sleep` y los retries globales no arreglan flakiness: la **maquillan**, y esconden carreras y degradaciones reales.
- Esperá por **condición observable** (un estado que la app expone), no por tiempo fijo.
- Antes de reintentar, **clasificá la falla**: producto, entorno, dato u observabilidad. El retry es una medida transitoria con evidencia de transitoriedad, no un default.
- Un **correlation-id** que atraviesa test, logs y trazas es lo que baja el tiempo hasta diagnóstico útil.
- La evidencia debe estar **sanitizada**: nada de PII, credenciales ni tokens en screenshots o logs.

## Nota de alcance

Guía de diseño con ejemplos ilustrativos. No es asesoramiento de seguridad ni de cumplimiento. Las referencias a manejo de PII/secretos son buenas prácticas generales; validá los requisitos legales y regulatorios de tu jurisdicción con quien corresponda. Nexo Finanzas es ficticio.

---

## 1. El test que "a veces falla"

En Nexo Finanzas hay un test de transferencia que falla 1 de cada 8 corridas con `element not found` en el comprobante. La "solución" histórica fue esto:

```java
// Anti-patrón: dormir y rezar
driver.findElement(By.cssSelector("[data-testid='submit-transfer']")).click();
Thread.sleep(3000); // "a veces tarda"
WebElement receipt = driver.findElement(By.cssSelector("[data-testid='transfer-receipt']"));
```

El `Thread.sleep(3000)` tiene dos problemas: es **lento** cuando la app responde en 200 ms (regalás 2.8 s por test) y es **insuficiente** cuando la app tarda 3.5 s (falla igual). Además, esconde la pregunta importante: *¿por qué a veces tarda 3.5 s?* Puede ser una carrera en el frontend, una dependencia lenta o una degradación real que el test debería visibilizar, no ocultar.

## 2. Esperar por condición observable

La alternativa es esperar a que la aplicación esté en un **estado observable** concreto, con un timeout acotado:

```java
// Ilustrativo. Selenium 4.45 (docs consultadas 2026-07-09).
WebDriverWait wait = new WebDriverWait(driver, Duration.ofSeconds(10));
driver.findElement(By.cssSelector("[data-testid='submit-transfer']")).click();
WebElement receipt = wait.until(ExpectedConditions.visibilityOfElementLocated(
    By.cssSelector("[data-testid='transfer-receipt']")));
```

**Análisis por bloques:**

- **Responsabilidad:** esperar hasta que el comprobante sea *visible*, con un techo de 10 s. Si aparece en 200 ms, el test sigue en 200 ms.
- **Por qué es mejor:** la espera se resuelve por **evento observable**, no por reloj. Es rápida cuando puede y falla con diagnóstico cuando la condición no se cumple.
- **Riesgo a evitar:** mezclar esperas implícitas y explícitas de Selenium puede producir tiempos impredecibles; la [documentación de Selenium sobre waits](https://www.selenium.dev/documentation/webdriver/waits/) recomienda no combinarlas sin cuidado. No inventes reglas no documentadas: apoyate en la doc oficial y en el estado que tu app realmente expone.
- **Límite honesto:** una espera explícita bien hecha reduce flakiness de sincronización, pero **no elimina** la inestabilidad de fondo si su causa es una carrera real. Ahí el test cumplió su función: exponer el problema.

> **Anti-patrón:** subir el `Thread.sleep` hasta que "deje de fallar". Enmascara la señal. La alternativa es esperar por condición y, si sigue fallando, **investigar la causa**, no aumentar el tiempo.

## 3. Clasificar la falla antes de reintentar

Un retry ciego convierte un bug intermitente de producto en verde. La disciplina es **clasificar** primero:

```text
function classifyFailure(result, telemetry, environmentHealth):
  if result.assertionFailed and telemetry.businessStateIsUnexpected:
    return PRODUCT_DEFECT
  if environmentHealth.dependencyUnavailable:
    return ENVIRONMENT_INCIDENT
  if result.timeout and telemetry.missingCorrelation:
    return TEST_OR_OBSERVABILITY_GAP
  return NEEDS_TRIAGE
```

**Cómo usarla:**

- **`PRODUCT_DEFECT`:** la assertion falló y la telemetría muestra un estado de negocio inesperado. **No se reintenta**: es un bug. Se abre ticket con la evidencia.
- **`ENVIRONMENT_INCIDENT`:** una dependencia estaba caída. Un retry puede ser legítimo **si** hay evidencia de que el incidente fue transitorio; se registra el motivo.
- **`TEST_OR_OBSERVABILITY_GAP`:** hubo timeout y no hay correlación para saber qué pasó. La acción no es reintentar: es **mejorar la observabilidad** para poder clasificar la próxima vez.
- **`NEEDS_TRIAGE`:** no hay suficiente información; va a revisión humana.

> **Regla sobre retries:** un retry solo puede ser una **medida transitoria con evidencia de transitoriedad**, y siempre debe **registrar el motivo**. Un retry global que reintenta todo N veces y reporta verde es maquillaje: esconde defectos de producto y degradaciones. Los tests flaky no se ocultan; se convierten en **trabajo priorizado** en el backlog.

## 4. Correlation-id: la costura entre test y sistema

Para clasificar hace falta ver qué hizo el sistema durante el test. Eso requiere una costura: un **correlation-id** generado por el test (ver [artículo de datos](/blog/datos-aislados-paralelismo-seguro/)) que viaja en las requests y aparece en logs y trazas del backend.

<figure class="diagram">
  <img src="/blog/diagrams/confiabilidad-diagnostico-flakiness-evidencia-1.svg" width="1051" height="435" alt="Diagrama: confiabilidad-diagnostico-flakiness-evidencia (1)" loading="lazy" decoding="async" />
</figure>

**Cómo leer el diagrama:**

- El **CI Runner** arranca un contexto de test **aislado** (datos y recursos propios).
- El **Test Worker** crea datos sintéticos en el **Test Data Service** y ejecuta el journey contra la **Application**.
- La aplicación **emite telemetría correlacionada** hacia **Observability**; el worker **adjunta el correlation-id** a la evidencia.
- El resultado vuelve al CI con **evidencia sanitizada**.

La clave es el correlation-id: cuando el test falla, permite reconstruir en la telemetría del backend qué pasó exactamente en ese request, distinguiendo un defecto de producto de un problema de ambiente. Para propagarlo de forma estándar, conviene alinear con **OpenTelemetry** y el estándar **W3C Trace Context** ([OpenTelemetry docs](https://opentelemetry.io/docs/), consultado 2026-07-09).

```java
// Ilustrativo. Propagar el correlation-id como header.
Response r = http.post("/transfers", body,
    Map.of("X-Correlation-Id", ctx.correlationId())); // mismo id en logs/trazas del backend
```

> **Decisión razonada:** no hace falta instrumentar todo con OpenTelemetry desde el día uno. El mínimo viable es un header de correlación consistente y logs del backend que lo incluyan. La instrumentación completa de trazas es una mejora incremental que se justifica cuando el MTTD sigue alto.

## 5. Evidencia sanitizada: útil y segura

Una evidencia que solo dice "falló" no sirve; una que expone datos sensibles es un incidente de seguridad. El equilibrio: **evidencia rica y sanitizada**.

Artefactos recomendados (todos sintéticos y saneados):

- **Reporte de test** (por ejemplo, salida JUnit) con el nombre del escenario y el resultado.
- **Screenshot en fallo**, si el ambiente lo permite y no expone datos sensibles.
- **Log sanitizado**: sin tokens, sin credenciales, sin PII; con el correlation-id.
- **Vínculo a la traza** (por correlation-id), en lugar de pegar payloads crudos.
- **HAR/DOM** solo si está permitido y **enmascarado**.
- **Semilla de datos y commit**: `runId`, identificadores sintéticos y SHA del código, para reproducir.

Gobierno de la evidencia (buenas prácticas, no asesoramiento legal):

- **Retención acotada:** la evidencia se conserva un tiempo definido y luego se elimina de forma segura.
- **Acceso restringido:** no todo el mundo necesita ver artefactos de ejecución.
- **Sanitización por defecto:** el pipeline enmascara antes de guardar, no después.

> **Contexto regulatorio (informativo, no asesoramiento legal ni de cumplimiento):** en un dominio financiero, loguear datos de tarjeta o PII como evidencia puede entrar en el alcance de estándares como PCI DSS (versión vigente v4.0.1 según el [PCI Security Standards Council](https://www.pcisecuritystandards.org/)) o de normas de protección de datos según la jurisdicción. Delimitá versión y jurisdicción con tu equipo legal/compliance. La regla técnica simple: **nunca** loguees credenciales, tokens, payloads sensibles ni PII como evidencia de test.

**Anti-patrón:** guardar como evidencia un screenshot con datos reales de un cliente o un log con el token de sesión. Consecuencia: fuga de datos y posible incumplimiento. Alternativa: datos sintéticos + masking + vínculo por correlation-id en lugar de payload crudo.

## 6. Runbook de investigación de fallos

Un runbook convierte el diagnóstico en un proceso repetible, no en intuición individual:

1. **Leer el resultado y la clasificación** (`classifyFailure`). ¿Producto, entorno, dato u observabilidad?
2. **Abrir la evidencia** por correlation-id: log sanitizado, traza, screenshot.
3. **Reproducir con la semilla** (`runId` + commit) en local o CI.
4. **Decidir:**
   - Producto → ticket de bug con evidencia.
   - Entorno → registrar incidente; retry solo con evidencia de transitoriedad.
   - Dato → arreglar fixture/cleanup (ver [artículo 3](/blog/datos-aislados-paralelismo-seguro/)).
   - Observabilidad → mejorar correlación/logging; **no** reintentar a ciegas.
5. **Registrar** la causa y la acción en la torre de control de calidad para ver **tendencia de flakiness**.

## 7. Indicadores de confiabilidad

Dos métricas de esta colección se anclan acá (el marco completo está en el [artículo pilar](/blog/framework-engineering-suite-producto-interno/)):

| Indicador | Fórmula | Ventana | Sesgo a vigilar | Decisión que habilita |
|---|---|---|---|---|
| Tasa de flakiness | Cambios de resultado sin cambio relevante confirmado / ejecuciones | 7–14 días | Requiere triage para confirmar "sin cambio relevante" | Priorizar estabilización en el backlog |
| MTTD (tiempo a diagnóstico útil) | Desde fallo hasta evidencia que distingue producto/entorno/dato/test | Por incidente | No es tiempo de corrección | Invertir en correlación/evidencia |

> **Honestidad intelectual:** no fijo umbrales ("flakiness < 1%") porque dependen del contexto y no tengo datos reales de Nexo Finanzas. Estas fórmulas son un marco propuesto; los valores objetivo los define cada equipo con su historial.

## 8. Anti-patrones y salidas

| Anti-patrón | Consecuencia | Alternativa concreta |
|---|---|---|
| `Thread.sleep` fijo | Lento y a la vez insuficiente; esconde carreras | Espera por condición observable con timeout acotado |
| Retry global que reporta verde | Esconde defectos de producto y degradaciones | Clasificar antes de reintentar; retry solo con evidencia de transitoriedad |
| Reporte que solo dice "falló" | Diagnóstico imposible; MTTD alto | Evidencia sanitizada + correlation-id + traza |
| Loguear PII/credenciales/tokens | Fuga de datos, posible incumplimiento | Datos sintéticos, masking, vínculo por correlation-id |
| Flaky ocultos como "known issues" | Erosión de confianza en la suite | Convertir flaky en trabajo priorizado y medir la tendencia |

## Qué aprendimos y próximos pasos

La confiabilidad no se compra con más `sleep` ni con más retries: se construye esperando por lo que la aplicación realmente expone, clasificando cada falla antes de actuar y produciendo evidencia sanitizada que un correlation-id vuelve rastreable. Un retry sin evidencia de transitoriedad no es robustez; es maquillaje que te va a costar caro cuando esconda un defecto real.

Continuá con:

- De dónde sale el `correlationId` y el aislamiento que hace reproducible la evidencia → [Datos aislados y paralelismo seguro](/blog/datos-aislados-paralelismo-seguro/).
- Cómo la selección de selectores estables reduce una de las causas de flakiness → [Selectores sostenibles](/blog/selectores-sostenibles-contratos-ui/).
- El marco completo de gobierno y medición → [Framework engineering: tu suite es un producto interno](/blog/framework-engineering-suite-producto-interno/).

## Checklist final

- [ ] No uso `Thread.sleep` como estrategia de sincronización.
- [ ] Espero por condiciones observables con timeouts acotados.
- [ ] Clasifico la falla (`classifyFailure`) antes de reintentar.
- [ ] Los retries registran motivo y solo aplican con evidencia de transitoriedad.
- [ ] Cada ejecución propaga un correlation-id a logs/trazas.
- [ ] La evidencia está sanitizada: sin PII, credenciales ni tokens.
- [ ] Tengo un runbook de triage y mido flakiness y MTTD.

---

*Prerrequisitos: sincronización y asincronía en apps web/SPA, HTTP/JSON, nociones de logs/trazas/métricas (observabilidad), y manejo básico de datos sensibles. Enlazamos documentación oficial junto a cada API; no reemplaza esos manuales ni asesoramiento de seguridad/cumplimiento.*

