---
title: "La calidad no se revisa al final: mi quality gate en cada Pull Request"
description: "Meter QA al final de un release es apagar incendios. Cómo armo un pipeline en GitHub Actions que corre lint, tests herméticos, contratos y E2E en cada PR, rápido y confiable, para que el defecto se frene antes de mergear."
pubDate: 2026-07-02
tags: ['ci-cd', 'quality-gates', 'github-actions', 'quality-engineering', 'sdet']
cluster: '04'
clusterTitle: "CI/CD y continuous quality"
type: satelite
order: 5
readingLevel: "Intermedio"
prerequisites: "CI/CD básico y control de versiones."
repo: "qa-automation-cicd-pipeline"
icon: 'infinity'
iconHue: 200
---

Hay una frase que repito seguido: **un bug encontrado en producción cuesta hasta diez veces más que uno detectado a tiempo.** Y "a tiempo" no es el día antes del release. Es en el Pull Request, antes de que el código se junte con el resto.

Meter testing solo al final es diseñar para el incendio: cuando el defecto aparece, ya está entreverado con veinte cambios más y encontrarlo cuesta el triple. La alternativa es correr la calidad **en cada PR**, automáticamente, como una puerta que no deja pasar lo que no cumple. Eso es un *quality gate*.

Este post es cómo lo armo, con el pipeline de [`qa-automation-cicd-pipeline`](https://github.com/fercarballo/qa-automation-cicd-pipeline) como referencia.

## El principio: shift-left de verdad, no de PowerPoint

"Shift-left" se dice mucho y se hace poco. En concreto significa una cosa: **mover la detección del defecto lo más cerca posible del momento en que se escribió.** Y el momento más temprano razonable es el push al PR.

```text
  ANTES (calidad al final)          AHORA (quality gate por PR)
  ──────────────────────            ─────────────────────────────
  dev → dev → dev → ... → QA        cada PR ─▶ [gate] ─▶ merge
                          │                       │
                     🔥 se encuentra           ✋ se frena acá,
                     todo junto, tarde          con 1 cambio de contexto
```

La diferencia no es tecnológica, es de *timing*. El mismo test corrido tres semanas después vale una fracción de lo que vale corrido hoy, porque hoy el autor todavía tiene el cambio fresco en la cabeza.

## La arquitectura del pipeline: rápido abajo, lento arriba

El error clásico es meter todo en un solo job gigante que tarda 20 minutos. Si el pipeline es lento, la gente lo esquiva. Así que lo ordeno por **costo y velocidad**, y lo que es barato corre primero y frena rápido:

```text
  push al PR
     │
     ▼
  ┌─────────────────────────────────────────────┐
  │ 1. LINT + FORMATO        (segundos)          │  ← falla en 10s si hay un typo
  ├─────────────────────────────────────────────┤
  │ 2. TESTS HERMÉTICOS      (segundos)          │  ← unit + contract, sin red
  │    matriz de versiones                       │     definen el estado del badge
  ├─────────────────────────────────────────────┤
  │ 3. E2E / INTEGRACIÓN     (minutos)           │  ← solo si lo de arriba pasó
  │    job separado                              │
  └─────────────────────────────────────────────┘
     │
     ▼
  ✅ merge habilitado   /   ❌ gate bloquea el PR
```

La regla de oro: **feedback rápido primero.** No tiene sentido levantar browsers para E2E si el lint ya encontró un error. Se falla barato antes de gastar caro.

## Lo que aprendí que hace o rompe un pipeline

### 1. Los tests de la base tienen que ser herméticos

Si tu job "rápido" depende de una API externa, no es rápido ni confiable: es lento e intermitente. La base del pipeline —los unitarios y de contrato— no debe tocar la red. Eso se logra con diseño (inyección de dependencias, dobles de prueba), y es lo que permite que ese job sea el que define si el PR pasa.

### 2. Lo que es frágil por naturaleza, va aislado y tolerante a fallos

Los tests que golpean servicios reales (una API pública, un entorno de staging) son valiosos pero frágiles por causas ajenas a tu código. Los pongo en un **job separado con `continue-on-error`**: si la API pública se cae, el badge del repo no se pone rojo por algo que no es culpa del código.

```yaml
integration:
  needs: hermetic          # solo corre si lo hermético pasó
  continue-on-error: true  # una caída externa NO rompe el pipeline
```

Distinguir "falló porque el código está mal" de "falló porque el mundo está caído" es la diferencia entre un pipeline en el que se confía y uno que se ignora.

### 3. Matriz de versiones para cazar lo que en tu máquina no ves

Correr la suite en varias versiones del runtime (por ejemplo Python 3.11, 3.12 y 3.13) atrapa regresiones que en tu entorno local nunca verías. Es barato y te ahorra el "en mi máquina anda".

### 4. Cancelar corridas viejas

Si alguien pushea tres veces seguidas, no tiene sentido correr el pipeline tres veces. Un detalle chico que ahorra minutos y plata de CI:

```yaml
concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true
```

## El gate que valida al gate

Un detalle del que estoy orgulloso, del pipeline de mi repo de calidad de datos: no alcanza con que el gate deje pasar lo bueno; hay que probar que **rechaza lo malo**. Así que el CI corre el gate contra un dataset intencionalmente roto y verifica que lo *rechace*:

```bash
# si el gate NO rechaza los datos malos, el step falla a propósito
if python -m dq datos_rotos.csv cuentas.csv; then
  echo "::error::el gate dejó pasar datos que debía frenar"
  exit 1
fi
```

Es meta-calidad: testear que tu control de calidad funciona. Un gate que nunca probaste que frena, no sabés si frena.

## El cambio de mentalidad

Al principio uno piensa la CI como "el lugar donde corren los tests". Con el tiempo la empecé a ver como lo que realmente es: **el contrato de calidad del equipo, ejecutable.** Todo lo que el equipo considera "no negociable" —que compile, que pase lint, que los tests estén verdes, que el esquema no se rompa— vive ahí, y se cumple solo, en cada cambio, sin depender de que alguien se acuerde.

Eso es lo que más me gusta de esto: la calidad deja de ser un momento (la fase de QA) y pasa a ser una propiedad continua del sistema. No se revisa al final. Se sostiene en cada PR.

> El pipeline completo está en [`qa-automation-cicd-pipeline`](https://github.com/fercarballo/qa-automation-cicd-pipeline). La idea del gate que se auto-valida está también en [`data-quality-testing`](https://github.com/fercarballo/data-quality-testing) y [`pytest-api-suite`](https://github.com/fercarballo/pytest-api-suite).
