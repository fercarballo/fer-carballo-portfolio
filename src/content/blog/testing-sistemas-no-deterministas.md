---
title: "Tests que a veces pasan: cómo cazar y matar la flakiness en Playwright"
description: "Un test que falla 1 de cada 20 corridas sin que cambie el código es peor que no tenerlo: enseña al equipo a ignorar el rojo. Cómo mido la flakiness, encuentro la causa raíz y la elimino en vez de tapar con reintentos."
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

Hay un tipo de bug que no está en el producto: está en tus tests. Es el test que pasa 19 veces y a la vigésima falla, sin que nadie haya tocado una línea de código. Lo volvés a correr, pasa, y seguís. Ese test es **flaky**, y es más peligroso de lo que parece.

¿Por qué peligroso, si "total, pasa"? Porque erosiona la única cosa que hace útil a una suite: **que le creas cuando está en rojo**. El día que un test flaky falla por un bug real, ya nadie lo mira — "ah, es ese que siempre falla, dale de nuevo". La flakiness no rompe tests, rompe la confianza en los tests.

Este post es el método que uso para cazarla, documentado en [`flakiness-hunting-playwright`](https://github.com/fercarballo/flakiness-hunting-playwright).

## Primero: medir, no adivinar

No se puede matar lo que no se mide. Antes de tocar un test "sospechoso", lo corro N veces y saco su **tasa de fallo**. Un test no es "flaky" por sensación; es flaky con un número.

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

Ese 8% es mi punto de partida y mi vara de éxito: cuando termine, tiene que ser 0/50. Sin la medición, "lo arreglé" es una opinión.

## Segundo: la taxonomía de causas (casi siempre es una de estas)

Después de cazar unas cuantas, la flakiness casi siempre cae en una de estas categorías. Tenerlas en la cabeza acelera el diagnóstico:

| Causa | Síntoma típico | La cura de fondo |
|---|---|---|
| **Espera mal hecha** | falla en CI (más lento) pero no local | esperar por *estado*, no por tiempo |
| **Orden / estado compartido** | falla solo cuando corre con otros tests | aislar datos por test |
| **Carrera con red/animación** | falla "a veces", sin patrón claro | esperar la condición real, no un `sleep` |
| **Datos no únicos** | falla al correr en paralelo | generar datos únicos por corrida |
| **Dependencia de reloj/orden externo** | falla a fin de mes, o en otra timezone | controlar el tiempo, no depender de él |

La número uno, lejos, es la primera: **esperar por tiempo en vez de por estado.**

## La causa raíz más común: `sleep` disfrazado

El anti-patrón que genera más flakiness es asumir que algo "ya tiene que estar listo" después de X milisegundos:

```typescript
// ❌ frágil: asume que 1 segundo alcanza. En CI, a veces no.
await page.waitForTimeout(1000);
await expect(page.locator('.total')).toHaveText('$1.500');
```

Funciona en tu máquina, que es rápida. En CI, que está cargado y es más lento, ese segundo a veces no alcanza y el test falla. La solución no es subir el timeout a 2 segundos (eso solo mueve el problema y hace la suite más lenta): es **esperar por la condición real**.

```typescript
// ✅ robusto: espera hasta que el estado sea el esperado, con timeout máximo
await expect(page.locator('.total')).toHaveText('$1.500', { timeout: 5000 });
```

La diferencia conceptual: el primero espera *tiempo*; el segundo espera *que pase la cosa*. Playwright tiene auto-waiting justo para esto, y sus `expect` son retriables. Usar `waitForTimeout` es, casi siempre, pelearse con la herramienta.

## Tercero: el reintento es una curita, no la cura

Playwright deja configurar reintentos, y está bien para amortiguar el ruido en CI:

```typescript
retries: process.env.CI ? 2 : 0,
```

Pero ojo con la trampa: **el reintento oculta la flakiness, no la elimina.** Si tapás todo con reintentos, un día un bug real se te escapa porque "reintentó y pasó". Mi regla:

> El reintento es para que un fallo aislado no rompa el pipeline mientras investigás. No es la solución. Si un test *necesita* reintentos para pasar, tenés un test roto, no un test lento.

Por eso Playwright marca los tests que pasaron *en reintento* como "flaky" en el reporte. Esa lista es mi backlog de caza, no algo para ignorar.

## La herramienta que lo cambió todo: el Trace Viewer

Cazar flakiness a ciegas es imposible: por definición, cuando vas a mirar, el test pasa. Lo que lo hace tratable es el **trace**: Playwright graba cada paso con snapshot del DOM, red y consola. Cuando el test falla en CI a las 3 de la mañana, a la mañana abro el trace de *esa* corrida y veo exactamente qué había en pantalla en el instante del fallo.

```text
  sin trace:  "falló el assert del total"  → ¿por qué? ni idea, andá a reproducirlo
  con trace:  ves que en ESA corrida el spinner todavía giraba
              → era una espera mal hecha. Diagnóstico en 30 segundos.
```

Configurarlo para que grabe solo en el primer reintento es gratis y te ahorra horas:

```typescript
use: { trace: 'on-first-retry' },
```

## El resultado que persigo

El objetivo no es "menos flaky". Es **cero**. En el repo documento el ciclo completo sobre un caso real: medir (tasa de fallo inicial), diagnosticar (con trace), corregir la causa raíz, y volver a medir hasta 0/50. Demostrar → medir → eliminar. No "creo que lo arreglé": *lo medí antes y después*.

Porque al final, la flakiness es una deuda de confianza. Y la confianza en la suite es, para mí, el activo más importante de todo el trabajo de automatización. Un test en el que el equipo cree cuando está en rojo vale por diez que "casi siempre pasan".

> El caso completo —medición, traces y las correcciones— está en [`flakiness-hunting-playwright`](https://github.com/fercarballo/flakiness-hunting-playwright).
