---
title: "Tests que a veces pasan: cómo cazar y matar la flakiness en Playwright"
description: "Un test que falla 1 de cada 20 corridas sin que cambie el código es peor que no tenerlo: enseña al equipo a ignorar el rojo. Cómo se mide la flakiness, se encuentra la causa raíz y se elimina en vez de taparla con reintentos."
pubDate: 2026-07-06
tags: ['flakiness', 'playwright', 'test-automation', 'ci-cd', 'sdet']
cluster: '07'
clusterTitle: "Observabilidad para Quality Engineering"
type: satelite
order: 4
readingLevel: "Intermedio"
prerequisites: "Playwright o automatización E2E."
repo: "flakiness-hunting-playwright"
icon: 'refresh'
iconHue: 265
---

> **Subtítulo:** Medir antes de tocar, una taxonomía de causas, la cura de fondo (esperar por estado, no por tiempo), el reintento como curita y el trace como la evidencia que hace tratable lo intermitente.

> **Nota de alcance.** Guía de método con ejemplos ilustrativos. El ciclo completo sobre un caso real —medición inicial, traces y correcciones hasta 0/50— está documentado en el repositorio [`flakiness-hunting-playwright`](https://github.com/fercarballo/flakiness-hunting-playwright).

---

## Resumen ejecutivo

- Hay un tipo de bug que no está en el producto: está en los tests. El test que pasa 19 veces y falla la vigésima, sin que nadie tocara el código, es **flaky**.
- Es peligroso no porque falle, sino porque **erosiona lo único que hace útil a una suite: que se le crea cuando está en rojo.** La flakiness no rompe tests, rompe la confianza en los tests.
- No se puede matar lo que no se mide: un test es flaky **con un número** (tasa de fallo sobre N corridas), no por sensación.
- La causa raíz número uno es **esperar por tiempo en vez de por estado**. La cura no es subir el timeout, es esperar la condición observable.
- El **reintento** amortigua ruido en CI, pero oculta la flakiness; no la elimina. Si un test *necesita* reintentos para pasar, es un test roto, no lento. El **trace** es lo que vuelve diagnosticable un fallo que, por definición, no se reproduce cuando lo vas a mirar.

Al terminar vas a poder medir la tasa de flakiness de un test, ubicar su causa en una taxonomía, reemplazar esperas por tiempo con esperas por estado, usar el reintento sin que tape bugs y leer un trace para diagnosticar en segundos.

---

## 1. El problema: la flakiness es una deuda de confianza

Un test flaky pasa 19 veces y a la vigésima falla, sin que nadie haya tocado una línea. Se lo vuelve a correr, pasa, y se sigue. La pregunta razonable es: si "total, pasa", ¿por qué es peligroso?

Porque erosiona la única cosa que hace útil a una suite: **que se le crea cuando está en rojo**. El día que un test flaky falla por un bug real, ya nadie lo mira — "ah, es ese que siempre falla, dale de nuevo". El costo no es el test perdido: es que la suite entera deja de ser una señal.

## 2. Primero: medir, no adivinar

No se puede matar lo que no se mide. Antes de tocar un test "sospechoso", se lo corre N veces y se saca su **tasa de fallo**. Un test no es flaky por sensación; es flaky con un número.

```bash
# correr el mismo test 50 veces y contar cuántas falla
npx playwright test flujo-checkout.spec.ts --repeat-each=50
```

```text
  50 corridas del mismo test, mismo código
  ██████████████████░░  46 pass / 4 fail  → 8% de flakiness
                        ▲
              esto NO es "mala suerte", es una señal
```

Ese 8 % es el punto de partida y la vara de éxito: al terminar tiene que ser 0/50. Sin la medición, "lo arreglé" es una opinión, no un resultado.

## 3. La taxonomía de causas

Después de diagnosticar varios casos, la flakiness casi siempre cae en una de estas categorías. Tenerlas presentes acelera el diagnóstico:

| Causa | Síntoma típico | La cura de fondo |
|---|---|---|
| **Espera mal hecha** | falla en CI (más lento) pero no local | esperar por *estado*, no por tiempo |
| **Orden / estado compartido** | falla solo cuando corre con otros tests | aislar datos por test |
| **Carrera con red/animación** | falla "a veces", sin patrón claro | esperar la condición real, no un `sleep` |
| **Datos no únicos** | falla al correr en paralelo | generar datos únicos por corrida |
| **Dependencia de reloj/orden externo** | falla a fin de mes, o en otra timezone | controlar el tiempo, no depender de él |

La número uno, lejos, es la primera: **esperar por tiempo en vez de por estado.**

## 4. La causa raíz más común: `sleep` disfrazado

El anti-patrón que genera más flakiness es asumir que algo "ya tiene que estar listo" después de X milisegundos:

```typescript
// ❌ frágil: asume que 1 segundo alcanza. En CI, a veces no.
await page.waitForTimeout(1000);
await expect(page.locator('.total')).toHaveText('$1.500');
```

Funciona en una máquina rápida. En CI, cargado y más lento, ese segundo a veces no alcanza y el test falla. La solución no es subir el timeout a 2 segundos —eso solo mueve el problema y hace la suite más lenta—: es **esperar por la condición real**.

```typescript
// ✅ robusto: espera hasta que el estado sea el esperado, con timeout máximo
await expect(page.locator('.total')).toHaveText('$1.500', { timeout: 5000 });
```

La diferencia conceptual: el primero espera *tiempo*; el segundo espera *que pase la cosa*. Playwright tiene auto-waiting justo para esto, y sus `expect` son retriables. Usar `waitForTimeout` es, casi siempre, pelearse con la herramienta.

## 5. El reintento es una curita, no la cura

Playwright permite configurar reintentos, y está bien para amortiguar el ruido en CI:

```typescript
retries: process.env.CI ? 2 : 0,
```

Pero hay una trampa: **el reintento oculta la flakiness, no la elimina.** Si se tapa todo con reintentos, un día un bug real se escapa porque "reintentó y pasó". La regla:

> El reintento es para que un fallo aislado no rompa el pipeline mientras se investiga. No es la solución. Si un test *necesita* reintentos para pasar, hay un test roto, no un test lento.

Por eso Playwright marca los tests que pasaron *en reintento* como "flaky" en el reporte. Esa lista es el backlog de caza, no algo para ignorar.

## 6. El trace: evidencia de lo que no se reproduce

Cazar flakiness a ciegas es imposible: por definición, cuando se va a mirar, el test pasa. Lo que lo vuelve tratable es el **trace**: Playwright graba cada paso con snapshot del DOM, red y consola. Cuando el test falla en CI de madrugada, después se abre el trace de *esa* corrida y se ve exactamente qué había en pantalla en el instante del fallo.

```text
  sin trace:  "falló el assert del total"  → ¿por qué? ni idea, andá a reproducirlo
  con trace:  se ve que en ESA corrida el spinner todavía giraba
              → era una espera mal hecha. Diagnóstico en 30 segundos.
```

Configurarlo para que grabe solo en el primer reintento es gratis y ahorra horas:

```typescript
use: { trace: 'on-first-retry' },
```

## 7. El resultado que se persigue

El objetivo no es "menos flaky". Es **cero**. El ciclo es siempre el mismo: medir (tasa de fallo inicial), diagnosticar (con trace), corregir la causa raíz y volver a medir hasta 0/50. Demostrar → medir → eliminar. No "creo que lo arreglé": medido antes y después.

Porque al final la flakiness es una deuda de confianza, y la confianza en la suite es el activo más importante de la automatización. Un test en el que el equipo cree cuando está en rojo vale por diez que "casi siempre pasan".

> El caso completo —medición, traces y las correcciones— está en [`flakiness-hunting-playwright`](https://github.com/fercarballo/flakiness-hunting-playwright). Para el ángulo de causa raíz por clasificación de fallas y correlation-id, ver [Confiabilidad: diagnóstico de flakiness con evidencia](/blog/confiabilidad-diagnostico-flakiness-evidencia/); para diagnosticar con trazas distribuidas, [Diagnosticar un test flaky con trazas](/blog/diagnosticar-test-flaky-con-trazas-metodo-evidencia/).
