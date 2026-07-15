---
title: "La calidad no se revisa al final: un quality gate en cada Pull Request"
description: "Meter QA al final de un release es apagar incendios. Cómo se arma un pipeline en GitHub Actions que corre lint, tests herméticos, contratos y E2E en cada PR, rápido y confiable, para que el defecto se frene antes de mergear."
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

> **Subtítulo:** Shift-left concreto: un pipeline ordenado por costo (rápido abajo, lento arriba), tests herméticos que definen el badge, lo frágil aislado y tolerante a fallos, y un gate que se prueba a sí mismo.

> **Nota de alcance.** Fragmentos de YAML ilustrativos: adaptá permisos, runners, retención y versionado antes de usarlos. El pipeline de referencia vive en el repositorio [`qa-automation-cicd-pipeline`](https://github.com/fercarballo/qa-automation-cicd-pipeline). Las plataformas de CI cambian: revalidá contra tu versión.

---

## Resumen ejecutivo

- Un bug encontrado en producción cuesta mucho más que uno detectado a tiempo, y **"a tiempo" no es el día antes del release: es en el Pull Request**, antes de que el código se junte con el resto.
- Un *quality gate* por PR es una puerta que no deja pasar lo que no cumple. La diferencia con "correr los tests al final" no es tecnológica, es de *timing*: el mismo test vale una fracción tres semanas después.
- El pipeline se ordena por **costo y velocidad**: lo barato corre primero y frena rápido. No tiene sentido levantar browsers para E2E si el lint ya falló.
- La base del gate —unit y contrato— **debe ser hermética** (sin red). Lo frágil por naturaleza (APIs reales) va en un job separado y **tolerante a fallos**, para no pintar el badge de rojo por algo ajeno al código.
- Un gate que nunca se probó que frena, no se sabe si frena: hay que **testear al control de calidad** corriéndolo contra un caso malo a propósito.

Al terminar vas a poder ordenar un pipeline por costo, distinguir un fallo de código de una caída externa en el badge, usar una matriz de versiones para cazar el "en mi máquina anda" y montar un gate que se auto-valida.

---

## 1. El principio: shift-left concreto, no de PowerPoint

"Shift-left" se dice mucho y se hace poco. En concreto significa una cosa: **mover la detección del defecto lo más cerca posible del momento en que se escribió.** Y el momento más temprano razonable es el push al PR.

```text
  ANTES (calidad al final)          AHORA (quality gate por PR)
  ──────────────────────            ─────────────────────────────
  dev → dev → dev → ... → QA        cada PR ─▶ [gate] ─▶ merge
                          │                       │
                     🔥 se encuentra           ✋ se frena acá,
                     todo junto, tarde          con 1 cambio de contexto
```

La diferencia no es tecnológica, es de *timing*. El mismo test corrido tres semanas después vale una fracción de lo que vale corrido hoy, porque hoy quien lo escribió todavía tiene el cambio fresco en la cabeza.

## 2. La arquitectura: rápido abajo, lento arriba

El error clásico es meter todo en un solo job gigante que tarda 20 minutos. Si el pipeline es lento, la gente lo esquiva. Por eso se ordena por **costo y velocidad**, y lo barato corre primero y frena rápido:

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

## 3. Cuatro decisiones que hacen o rompen un pipeline

### 3.1. Los tests de la base tienen que ser herméticos

Si el job "rápido" depende de una API externa, no es rápido ni confiable: es lento e intermitente. La base del pipeline —los unitarios y de contrato— no debe tocar la red. Eso se logra con diseño (inyección de dependencias, dobles de prueba), y es lo que permite que ese job sea el que define si el PR pasa.

### 3.2. Lo frágil por naturaleza va aislado y tolerante a fallos

Los tests que golpean servicios reales (una API pública, un entorno de staging) son valiosos pero frágiles por causas ajenas al código. Van en un **job separado con `continue-on-error`**: si la API pública se cae, el badge del repo no se pone rojo por algo que no es culpa del código.

```yaml
integration:
  needs: hermetic          # solo corre si lo hermético pasó
  continue-on-error: true  # una caída externa NO rompe el pipeline
```

Distinguir "falló porque el código está mal" de "falló porque el mundo está caído" es la diferencia entre un pipeline en el que se confía y uno que se ignora.

### 3.3. Matriz de versiones para cazar lo que en tu máquina no se ve

Correr la suite en varias versiones del runtime (por ejemplo Python 3.11, 3.12 y 3.13) atrapa regresiones que en el entorno local nunca aparecerían. Es barato y evita el "en mi máquina anda".

### 3.4. Cancelar corridas viejas

Si alguien pushea tres veces seguidas, no tiene sentido correr el pipeline tres veces. Un detalle chico que ahorra minutos y costo de CI:

```yaml
concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true
```

## 4. El gate que valida al gate

No alcanza con que el gate deje pasar lo bueno; hay que probar que **rechaza lo malo**. Un patrón que vale la pena adoptar —tomado del pipeline de calidad de datos de referencia— es correr el gate contra un dataset intencionalmente roto y verificar que lo *rechace*:

```bash
# si el gate NO rechaza los datos malos, el step falla a propósito
if python -m dq datos_rotos.csv cuentas.csv; then
  echo "::error::el gate dejó pasar datos que debía frenar"
  exit 1
fi
```

Es meta-calidad: testear que el control de calidad funciona. Un gate que nunca se probó que frena, no se sabe si frena.

## 5. La CI como contrato de calidad ejecutable

Al principio se piensa la CI como "el lugar donde corren los tests". Con el tiempo se ve lo que realmente es: **el contrato de calidad del equipo, ejecutable.** Todo lo que el equipo considera no negociable —que compile, que pase lint, que los tests estén verdes, que el esquema no se rompa— vive ahí y se cumple solo, en cada cambio, sin depender de que alguien se acuerde.

Ese es el cambio de fondo: la calidad deja de ser un momento (la fase de QA) y pasa a ser una propiedad continua del sistema. No se revisa al final. Se sostiene en cada PR.

> El pipeline completo está en [`qa-automation-cicd-pipeline`](https://github.com/fercarballo/qa-automation-cicd-pipeline). La idea del gate que se auto-valida aparece también en [`data-quality-testing`](https://github.com/fercarballo/data-quality-testing) y [`pytest-api-suite`](https://github.com/fercarballo/pytest-api-suite). Para el marco de pipeline proporcional al riesgo, ver el pilar [Continuous Quality basado en riesgo](/blog/continuous-quality-pipeline-basado-en-riesgo/) y [Quality gates proporcionales al riesgo](/blog/quality-gates-proporcionales-al-riesgo/).
