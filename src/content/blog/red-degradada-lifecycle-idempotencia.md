---
title: "Red degradada, ciclo de vida e idempotencia: el journey que no debe duplicar una transferencia"
description: "Cómo verificar el journey de una transferencia bajo pérdida de red, background/kill y reintentos, distinguiendo el retry del cliente de la garantía de idempotencia del servidor para que una operación no se duplique."
pubDate: 2026-07-09
tags: ["idempotency", "offline", "mobile-lifecycle", "resilience", "appium", "api-testing", "gherkin"]
cluster: "10"
clusterTitle: "Mobile Quality Engineering"
type: "satelite"
order: 3
icon: "phone"
iconHue: 300
readingLevel: "Avanzado"
---
## El problema: un reintento que cobró dos veces

En `nexo-wallet-mobile`, al perder señal justo después de tocar "Confirmar", la app reintenta al recuperar la red y el *ledger* sintético registra **dos** operaciones.

El síntoma aparece en la UI, pero la causa vive en la **frontera cliente-servidor**. Este artículo verifica el journey obligatorio del [pilar](/blog/calidad-mobile-por-riesgo/): perder red, recuperarla y confirmar **una sola** operación.

## Prerrequisitos y glosario

Conviene haber leído la [estrategia por riesgo](/blog/calidad-mobile-por-riesgo/) y el artículo de [testabilidad y Appium](/blog/testabilidad-appium-cross-platform/).

Necesitás distinguir dos garantías que se confunden con frecuencia:

- **Retry de cliente:** la app reenvía la solicitud. Por sí solo, **no** garantiza unicidad.
- **Idempotencia de servidor:** ante la **misma clave de idempotencia**, la API aplica la operación **una única vez** y devuelve la misma referencia. Esta es la garantía real de no-duplicación.
- **Clave de idempotencia:** identificador único por *intento lógico* —no por reintento— que el servidor usa para deduplicar.

Que esta distinción esté clara es la diferencia entre un sistema que no duplica y uno que parece no duplicar hasta que la red se pone mala.

## El flujo correcto

<figure class="diagram">
  <img src="/blog/diagrams/red-degradada-lifecycle-idempotencia-1.svg" width="850" height="435" alt="Diagrama: red-degradada-lifecycle-idempotencia (1)" loading="lazy" decoding="async" />
</figure>

Lecturas clave del diagrama:

1. La app encola la solicitud junto con su clave de idempotencia.
2. Al reintentar, envía **la misma** clave, no una nueva.
3. El servidor deduplica y registra **una** operación en el ledger.
4. Devuelve una **única** referencia de confirmación.

> **Advertencia de diseño.** La cola local **no debe almacenar secretos ni datos sensibles** sin un esquema de protección específico (MASVS-STORAGE, [MASVS](https://mas.owasp.org/MASVS/)). Guardá el mínimo indispensable: la clave y un payload no sensible.

> **Límite del modelo.** Una implementación real puede variar en *backoff*, expiración de la clave y ventana de deduplicación. El diagrama es el contrato conceptual, no una prescripción.

## El ciclo de vida agrava el problema

Perder red rara vez ocurre de forma limpia. El usuario cambia de aplicación, el sistema operativo termina el proceso por presión de memoria, y más tarde la app se relanza. Cada una de esas transiciones puede disparar un reintento.

<figure class="diagram">
  <img src="/blog/diagrams/red-degradada-lifecycle-idempotencia-2.svg" width="391" height="341" alt="Diagrama: red-degradada-lifecycle-idempotencia (2)" loading="lazy" decoding="async" />
</figure>

Por eso la verificación no es solamente "cortar la red". Es **cortar la red, mandar la app a background, matar el proceso, relanzar** y confirmar que sigue habiendo **una** operación.

En Android, los cambios de configuración y estado del dispositivo se pueden ejercitar con la [Espresso Device API](https://developer.android.com/studio/test/espresso-api). En iOS, con XCUITest ([Apple · XCTest](https://developer.apple.com/documentation/xctest)). El *toggle* de red se hace siempre sobre un **entorno controlado** —emulador o proxy—, nunca deshabilitando los radios de un dispositivo compartido.

## Dos pruebas, dos responsabilidades

**Prueba A — Idempotencia de la API (rápida, sin UI).** Envía la misma clave dos veces contra la API sintética y verifica que el ledger registre **una** operación y devuelva la **misma** referencia. Esta es la prueba que **garantiza** la no-duplicación. Es barata y corre pre-merge.

**Prueba B — E2E de red degradada (Appium, cara).** Verifica que la **app** encole, reintente y muestre una sola referencia bajo pérdida real de conectividad y transiciones de ciclo de vida. No reemplaza a la Prueba A: confirma la **integración**, no la garantía de deduplicación.

Confundir B con A es exactamente el error que produjo el doble cargo.

### Escenario en Gherkin

Ejemplo sobre entorno controlado:

```gherkin
Feature: Transferencia resiliente a perdida de red
  Scenario: La operacion no se duplica si se corta la red durante el envio
    Given una cuenta de prueba con saldo sintetico suficiente
    And una transferencia preparada a un beneficiario sintetico
    When se corta la conectividad justo despues de enviar la solicitud
    And la app pasa a background y el SO termina el proceso
    And se restablece la conectividad y se relanza la app
    And el cliente reintenta con la MISMA clave de idempotencia
    Then el ledger sintetico registra exactamente una operacion
    And la app muestra una unica referencia de confirmacion
```

### Pseudocódigo del control de red

Ejemplo; ajustá al proveedor de dispositivos y al entorno.

```text
preparar_transferencia(cuenta_test, beneficiario_test, monto=1500)
red.cortar()                      # proxy o emulador, entorno controlado
app.enviar()                      # queda encolada con idempotency-key K
app.background(); so.terminar()   # ciclo de vida hostil
app.relanzar(); red.restaurar()
app.reintentar()                  # reenvia con la MISMA K
assert ledger.operaciones(K) == 1
assert app.referencias_visibles() == 1
```

## Postmortem simulado: por qué el bug escapó

> **Simulación de diagnóstico con fines didácticos**, no un incidente real. No se ejecutó ninguna suite ni se midió ninguna métrica.

La suite original tenía seis tests Appium de transferencia. Todos corrían con **red ideal y app en foreground**. La Prueba A **no existía**: nadie verificaba la idempotencia del servidor.

El cliente reintentaba correctamente. El servidor **no** deduplicaba por clave. Bajo red inestable, el resultado era una doble operación.

La corrección real fue de **servidor** —deduplicación por clave en `nexo-transfer-api`— y la corrección de calidad fue **agregar la Prueba A**, que es barata, además del E2E que ya existía.

La moraleja: un E2E que solo prueba el camino feliz produce **falsa** confianza. Su color verde no es información sobre la resiliencia del sistema, porque nunca la ejercitó.

## Anti-patrones

**Probar solo red ideal, foreground y permisos concedidos.** *Causa:* es el camino cómodo, y el happy path siempre pasa. *Consecuencia:* los bugs de resiliencia escapan a producción, donde la red sí falla. *Alternativa:* una matriz de estados hostiles: offline, background/kill, permiso denegado.

**Confiar la no-duplicación al retry del cliente.** *Causa:* confundir reintento con unicidad. *Consecuencia:* doble cargo, con impacto financiero. *Alternativa:* idempotencia de servidor, verificada por la Prueba A.

**Cortar la red deshabilitando los radios de un dispositivo compartido.** *Causa:* es el atajo disponible. *Consecuencia:* resultados no reproducibles y colisiones entre corridas paralelas. *Alternativa:* proxy o emulador en un entorno controlado y aislado.

## Evidencia reproducible

- **Entorno:** API sintética `nexo-transfer-api` con endpoint de datos de prueba; emulador o proxy con control de red; Appium 3.x.
- **Comandos (ejemplo):** `POST /transfers` con header `Idempotency-Key: K`, ejecutado dos veces; luego `GET /ledger?key=K`, que debe devolver exactamente **1**.
- **Resultado esperado:** ledger con una operación; una sola referencia visible en la app.
- **Limitaciones:** depende de que el servidor implemente deduplicación. El ejemplo **no** incluye resultados de corridas reales ni métricas medidas. La ventana de deduplicación y la expiración de la clave son decisiones de diseño del backend, no verdades universales.

## Qué aprendimos y próximos pasos

La no-duplicación es una propiedad del **servidor**, y es verificable de forma barata. El E2E confirma la **integración** bajo un ciclo de vida hostil, que es otra cosa. Separar ambas responsabilidades es lo que evita el doble cargo.

- Marco de riesgo → **[Artículo 1](/blog/calidad-mobile-por-riesgo/)**
- Estabilidad de los E2E → **[Artículo 2](/blog/testabilidad-appium-cross-platform/)**
- Cómo corre esto en CI y con qué evidencia → **[Artículo 4](/blog/ci-matriz-flakiness-evidencia/)**

## Checklist final

- [ ] Existe una prueba de idempotencia a nivel API: misma clave, una sola operación.
- [ ] El E2E ejercita offline, background/kill y relaunch, no solo red ideal.
- [ ] El control de red usa un entorno controlado, no los radios de un device compartido.
- [ ] La cola local no almacena secretos ni PII sin protección explícita.
- [ ] La documentación distingue retry de cliente de garantía de servidor.

---

*Colección **Mobile Quality Engineering**. Fuentes verificadas al 2026-07-09; ver **Control de calidad editorial**.*

