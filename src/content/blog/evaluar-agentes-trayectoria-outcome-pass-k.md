---
title: "Evaluar agentes: trayectoria, outcome y por qué pass^k lo cambia todo"
description: "Evaluar un agente no es juzgar una respuesta: es juzgar una trayectoria que muta un entorno. No-determinismo compuesto, pass^k, outcome vs camino y costo como SLO."
pubDate: 2026-07-15
tags: ['evals', 'agentes', 'quality-engineering', 'llm-evaluation', 'sdet']
cluster: 'g05'
clusterTitle: "Evaluar agentes"
type: pilar
order: 1
readingLevel: "Intermedio–Avanzado"
prerequisites: "Haber leído sobre evals de LLM apps ayuda."
icon: 'flask'
iconHue: 145
---

> **Subtítulo:** Por qué evaluar un agente es más difícil que evaluar un LLM —el objeto ya no es una respuesta, es una trayectoria que muta un entorno— y las cuatro dimensiones que hay que medir: outcome, trayectoria, consistencia con pass^k y costo.

> **Nota de alcance.** Ejemplos ilustrativos sobre agentes ficticios. Los porcentajes de la sección 2 son un modelo simplificado con independencia asumida entre pasos, no benchmarks; los costos son órdenes de magnitud ilustrativos. El terreno de evaluación de agentes cambia rápido: revalidá contra tu versión de modelos y herramientas.

---

## Resumen ejecutivo

- Evaluar una aplicación con LLM es juzgar una **respuesta**; evaluar un agente es juzgar una **trayectoria**: una secuencia de decisiones y acciones que dejan el mundo distinto a como lo encontraron. Cambió el objeto de la prueba, y con él cambia todo lo demás.
- **El no-determinismo no se suma: se multiplica. Encadenar N pasos no deterministas hace que la confiabilidad de la tarea sea el producto de las confiabilidades de cada paso, y multiplicar números menores que 1 solo puede bajar.**
- Un agente puede llegar al estado final correcto por un camino inaceptable. Medir solo el outcome deja pasar al que "borró y recreó la base para que cuadre". Se evalúan las dos cosas: el resultado y el recorrido.
- El entorno es parte del test. Sin un mundo reproducible —contenedores, seeds, mocks, tiempo controlado— la eval no mide al agente: mide el ruido.
- Costo y latencia no son métricas de vanidad: son requisitos. Un agente correcto pero 30× más caro (ilustrativo) falla el test de negocio igual que uno que devuelve mal.

Al terminar vas a poder explicar por qué un agente es más difícil de evaluar que una LLM app, calcular el efecto del no-determinismo compuesto con `pass^k`, separar outcome de trayectoria, tratar el entorno como fixture y poner el presupuesto de tokens como un SLO.

---

## 1. El problema: el objeto de la prueba dejó de ser una respuesta

El artículo sobre [evals de aplicaciones con LLM](/blog/evaluar-aplicaciones-llm/) resolvió un problema concreto: cuando "correcto" deja de ser un string exacto, se deja de testear salidas puntuales y se mide comportamiento agregado de las **respuestas**. Un agente vuelve a romper el supuesto, en otro eje. La salida ya no es texto: es una **secuencia de acciones con efectos**.

Un caso. "Reembolsá la orden 4021." La versión LLM app devuelve un texto que hay que puntuar. La versión agente llama herramientas: consulta la orden, valida la política, escribe en la base, dispara un correo. Dos corridas de la misma instrucción pueden producir dos secuencias de acciones distintas, y las dos ser aceptables. O una puede llegar al estado final correcto por un camino que en producción sería un incidente.

```text
  LLM app                          Agente
  ─────────────────────           ──────────────────────────────────
  input ─► [modelo] ─► texto       objetivo
                        │            │
                        ▼            ├─► decidir ─► actuar ─► observar ─┐
                 ¿la respuesta       │      ▲                          │
                  es aceptable?      │      └──────────(loop)──────────┘
                                     ▼
                          el entorno quedó mutado:
                          archivos, base de datos, correos, tickets
                                     │
                                     ▼
                          ¿estado final correcto? ¿y el camino?
```

La pregunta que este artículo responde es qué significa "aprobar" cuando lo que se evalúa no es un texto sino un recorrido que cambia un entorno. La respuesta corta: hay que medir cuatro cosas donde antes se medía una.

## 2. No-determinismo compuesto: la confiabilidad se multiplica

Una LLM app tiene un solo punto no determinista: la generación de la respuesta. Un agente tiene uno por paso. Y los pasos se encadenan. Si cada paso sale bien con probabilidad `p`, la tarea completa —que exige que **todos** salgan bien— sale bien con `p` elevado a la cantidad de pasos.

Ese producto es demoledor. Con una confiabilidad por paso de 0.9 —que para un modelo suena buena— una tarea de diez pasos ronda 0.35 de éxito. No porque el modelo sea malo: porque 0.9 multiplicado por sí mismo diez veces es 0.35.

| Pasos (k) | Éxito de tarea con p = 0.9 por paso |
|---|---|
| 1 | 0.90 |
| 2 | 0.81 |
| 5 | 0.59 |
| 10 | 0.35 |

Es un **modelo simplificado, con independencia asumida** entre pasos —los pasos reales están correlacionados, y un buen diseño de agente los hace menos frágiles—, pero la dirección es exacta: cada paso de autonomía que se agrega es un factor menor que 1 que entra al producto. Aun con un optimista `p = 0.99` por paso, `0.99` elevado a 10 da ≈ 0.90: uno de cada diez recorridos todavía falla (aritmética del mismo modelo simplificado).

De acá sale la distinción métrica que ordena toda la colección:

```text
 pass@k  →  ¿pasó AL MENOS UNA de k corridas?   premia la suerte
 pass^k  →  ¿pasaron LAS k corridas?            mide la consistencia
```

`pass@k` es la métrica del que muestra la demo: corré cinco veces, quedate con la que salió bien. `pass^k` es la métrica del que va a producción: si el agente actúa sobre el mundo, lo que importa no es que **pueda** acertar, sino cuán seguido acierta cuando nadie está mirando. Para un sistema con efectos, la métrica honesta es `pass^k`. El satélite de simuladores retoma este número en el caso conversacional, donde cada turno agrega un factor más al producto.

## 3. Outcome no es trayectoria: el estado correcto por el camino equivocado

El **outcome** es el estado final del entorno. La **trayectoria** es el camino que lo produjo. No son lo mismo, y evaluar solo el primero es una trampa cómoda.

El ejemplo canónico: se le pide a un agente que deje la base de datos en un estado consistente. La deja consistente, sí —borró la tabla entera y la recreó vacía "para que cuadre". El verificador de outcome que solo comprueba "la base valida" lo aprueba. En producción, eso es pérdida de datos. El estado final era correcto; la trayectoria, inaceptable.

Los caminos malos que un chequeo de outcome no ve son varios y todos reales: tocar archivos fuera del workspace asignado, repetir la misma acción en loop hasta que por azar funciona, usar una herramienta prohibida, resolver la tarea en cuarenta pasos cuando debía tomar cinco. Nada de eso aparece si solo se mira el estado final.

Por eso una eval de agente mide en varias dimensiones a la vez:

| Dimensión | Qué se mide | Cómo se verifica |
|---|---|---|
| Outcome | El estado final del entorno es el esperado | Verificador programático sobre el mundo: el archivo existe, el CSV quedó ordenado, la API devuelve X |
| Trayectoria | El camino fue aceptable | Aserciones sobre la traza de acciones: no borró fuera del workspace, no repitió, no superó N pasos |
| Consistencia | Cuán seguido acierta al repetir | `pass^k` sobre k corridas idénticas |
| Costo | Tokens y dinero por tarea | Presupuesto como SLO; contador de tokens con techo |
| Latencia | Tiempo y pasos hasta terminar | Techo de pasos y de wall-clock por tarea |

El outcome se verifica con código determinista contra el estado del mundo —el tema del [satélite sobre golden tasks y verificadores de estado](/blog/golden-tasks-y-verificadores-de-estado/)—. La trayectoria se verifica con aserciones sobre la traza de lo que el agente hizo. Las dos son necesarias: sin trayectoria, aprobás al que rompe todo pero deja el resultado prolijo.

## 4. El entorno es parte del test: reproducibilidad como fixture del mundo

En una LLM app, el test es la entrada y la salida. En un agente, el test incluye **el mundo sobre el que actúa**. Si ese mundo cambia entre corridas, la variabilidad que se observa no es la del agente: es la del entorno. Y entonces la eval no atribuye nada, porque no se sabe si un fallo fue del modelo o de que hoy la API tardó distinto, el reloj marcaba otra fecha o la base tenía otra fila.

La reproducibilidad de una eval de agente es, literalmente, un **fixture del mundo**: el entorno arranca idéntico en `t0` para cada corrida. Eso se logra con las herramientas de siempre —contenedores para aislar, seeds para fijar lo aleatorio, mocks para las dependencias externas, tiempo congelado para lo que dependa del reloj— y con un workspace efímero que se destruye y se recrea entre tareas. Es el terreno de [entornos y datos de prueba reproducibles](/blog/entornos-y-datos-de-prueba-reproducibles/), aplicado a un sujeto que además muta ese entorno mientras lo recorre.

No es casualidad que los benchmarks serios de agentes se hayan construido como entornos, no como preguntas: SWE-bench (Jimenez et al., 2023) usa issues reales de GitHub, WebArena (Zhou et al., 2023) y OSWorld (Xie et al., 2024) montan una web y un escritorio completos, GAIA (Mialon et al., 2023) plantea tareas fáciles para un humano y duras para un agente. En todos, lo que se puntúa es el estado final de un entorno controlado. La lección para una suite propia es la misma: **una eval de agente es tan reproducible como su entorno**.

## 5. Costo y latencia son requisitos, no notas al pie

Un agente correcto puede ser inviable. Si resuelve la tarea pero consume treinta veces más tokens que la alternativa (número ilustrativo), falló el test de negocio con la misma contundencia que si hubiera devuelto mal. La corrección sin presupuesto no es un aprobado: es un problema caro.

Por eso el costo entra a la eval como un **SLO** —service level objective, el objetivo de nivel de servicio que el sistema se compromete a cumplir—, no como una curiosidad del reporte. El presupuesto de tokens por tarea es un techo, y superarlo es un fallo, no un aviso. Lo mismo la latencia: un techo de pasos y de wall-clock que, si se cruza, cuenta como no terminar. Esa condición de parada explícita es un requisito de diseño antes que de evaluación, y tiene su propio desarrollo en [condición de parada y presupuestos del agente](/blog/condicion-de-parada-y-presupuestos-del-agente/).

El orden de magnitud no es teórico. Anthropic reportó que su sistema de investigación multi-agente consume del orden de 15× los tokens de un chat común. Un patrón que multiplica el costo por quince puede seguir siendo la decisión correcta —si la tarea lo justifica— pero solo si la eval lo mide y lo pone sobre la mesa. Un agente que nadie puede pagar es un agente que no pasa.

## 6. Por qué esto es Quality Engineering

Las [evals de LLM apps](/blog/evaluar-aplicaciones-llm/) trajeron una idea central: la calidad de un sistema probabilístico no es un semáforo, es control estadístico —se corre contra muchos casos y se observa un puntaje en el tiempo, no un pasa/falla—. Evaluar agentes eleva esa misma idea un piso: el control estadístico ya no es sobre respuestas, es sobre **trayectorias**. La unidad que se agrega, se promedia y se compara contra un baseline pasó de "el texto que devolvió" a "el recorrido que ejecutó y el estado que dejó".

El resto es el trabajo de siempre. Definir qué es calidad para esta tarea, diseñar casos que cubran el riesgo, medir comportamiento agregado, desconfiar de la corrida que salió bien una vez. La disciplina que sabe hacer eso —y que sabe que una demo no es evidencia— es exactamente la que este terreno necesita. Lo que cambia es el objeto: cuatro dimensiones donde antes había una, y un producto de probabilidades que castiga cada paso de autonomía que se agrega sin ganar confiabilidad.

> La implementación de referencia de esta colección —golden tasks con un workspace efímero, verificador de estado y `pass^k` con cota inferior— vive en el satélite [Golden tasks y verificadores de estado](/blog/golden-tasks-y-verificadores-de-estado/), sobre el repositorio [`agent-evals-lab`](https://github.com/fercarballo/agent-evals-lab). Para el marco de evaluación del que esto es la versión agéntica, ver [evals para aplicaciones con LLM](/blog/evaluar-aplicaciones-llm/).
