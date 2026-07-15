---
title: "Los cinco workflows que van antes del agente"
description: "Los cinco workflows de 'Building effective agents' —chaining, routing, parallelization, orchestrator-workers, evaluator-optimizer— y el gate de cada uno."
pubDate: 2026-07-15
tags: ['agentes', 'workflows', 'arquitectura', 'quality-engineering', 'sdet']
cluster: 'g01'
clusterTitle: "Anatomía del agente y workflows"
type: satelite
order: 2
readingLevel: "Intermedio"
prerequisites: "Haber leído la anatomía del agente ayuda."
icon: 'set'
iconHue: 205
---

> **Subtítulo:** Los cinco patrones de "Building effective agents" —prompt chaining, routing, parallelization, orchestrator-workers y evaluator-optimizer—, cuándo alcanza cada uno, su trampa típica y, sobre todo, qué gate distinto testea cada uno.

> **Nota de alcance.** Ejemplos ilustrativos. La taxonomía es la de "Building effective agents" (Anthropic, diciembre de 2024); los nombres se usan como en esa fuente. Los diagramas son esquemáticos, no arquitecturas literales. Revalidá contra tu framework, que suele rebautizar estos patrones.

---

## Resumen ejecutivo

- Antes de construir un agente conviene descartar cinco workflows más simples. La taxonomía de "Building effective agents" (Anthropic, 2024) los nombra: **prompt chaining, routing, parallelization, orchestrator-workers y evaluator-optimizer**.
- **La diferencia con un agente es una sola: en un workflow el LLM decide el contenido de cada paso, pero el control de flujo lo decide el código. Eso los vuelve más baratos de testear, porque los caminos se pueden enumerar antes de correr.**
- Cada workflow tiene un gate de prueba distinto: en chaining son los checks entre eslabones; en routing, el clasificador; en parallelization, la lógica de agregación. Testear sin saber cuál es el gate es testear a ciegas.
- La tesis operativa: si uno de estos cinco alcanza, un agente no es ambición, es riesgo innecesario.

Al terminar vas a poder: reconocer los cinco workflows por su diagrama, elegir el que corresponde a una tarea, anticipar su trampa típica y nombrar el gate de prueba específico de cada uno.

---

## 1. El problema: "necesito un agente" cuando alcanzaba un workflow

La escena se repite. Una tarea llega con la etiqueta "esto necesita un agente", y la etiqueta arrastra todo lo que un agente trae: un loop autónomo, un presupuesto que vigilar, trayectorias imposibles de enumerar y una superficie de pruebas que se dispara. Semanas después, alguien nota que la tarea tenía pasos fijos y conocidos de antemano. Nunca hizo falta un agente; alcanzaba con encadenar tres llamadas.

El costo de esa confusión no es solo de construcción: es de testing. Un agente se evalúa por trayectorias y comportamiento agregado; un workflow, por casos fijos y la integración entre pasos. Confundirlos hace que se pruebe de más lo que era simple o —peor— que se pruebe como simple lo que no lo era.

"Building effective agents" (Anthropic, diciembre de 2024) ordenó este terreno con una taxonomía de cinco workflows que cubren la enorme mayoría de los casos, precedida por una regla: empezá por el más simple que resuelva la tarea. Los cinco comparten una propiedad que conviene tener presente desde ya: **el LLM decide qué dice cada paso, pero el código decide qué paso viene después.**

## 2. Prompt chaining: la línea de montaje

Descompone la tarea en pasos fijos; la salida de cada uno alimenta al siguiente, con un chequeo programático de por medio.

```text
 entrada ─►[ paso 1 ]─► check ─►[ paso 2 ]─► check ─►[ paso 3 ]─► salida
```

**Cuándo conviene.** La tarea se parte en subtareas fijas y conocidas de antemano (redactar y después traducir; extraer y después formatear). Cambia latencia por precisión: cada paso hace una cosa y la hace mejor.

**La trampa típica.** Encadenar de más. Cada eslabón multiplica su tasa de error por la de los que siguen, y una cadena de diez pasos "casi perfectos" puede terminar poco confiable. La otra trampa es meter un paso que en realidad depende de datos que no existen hasta ejecutar.

**Qué se testea.** Cada eslabón por separado (entrada conocida, salida esperada) y —el gate propio del patrón— los checks programáticos entre eslabones: la validación que decide si la cadena sigue o corta. Ese gate es código, y se testea como código.

## 3. Routing: el clasificador que reparte

Clasifica la entrada y la manda al camino especializado.

```text
                    ┌─►[ manejo A ]
 entrada ─►[ router ]┼─►[ manejo B ]
                    └─►[ manejo C ]
```

**Cuándo conviene.** Entradas de categorías distintas que conviene tratar por separado: tickets de soporte (reembolso, bug, consulta general), donde cada categoría rinde mejor con su propio prompt o hasta su propio modelo.

**La trampa típica.** La clasificación errónea silenciosa: un caso mal ruteado se maneja con el prompt equivocado y nadie se entera, porque el sistema igual responde algo. Y las categorías que se solapan, donde el router duda con razón.

**Qué se testea.** El gate es el clasificador. Se testea como una matriz de confusión: precisión y cobertura por categoría, con foco en los casos límite y en el camino "ninguna de las anteriores". Un router sin caso de escape fuerza toda entrada rara dentro de una casilla que no le corresponde.

## 4. Parallelization: dividir o votar

Corre varias llamadas en paralelo y agrega. Tiene dos formas: *sectioning* parte la tarea en piezas independientes; *voting* corre la misma tarea varias veces y decide por consenso.

```text
 sectioning (piezas independientes):
   in ─┬─►[ parte 1 ]─┐
       ├─►[ parte 2 ]─┼─►[ unir ]─► out
       └─►[ parte 3 ]─┘

 voting (misma tarea, consenso):
   in ─┬─►[ intento 1 ]─┐
       ├─►[ intento 2 ]─┼─►[ votar ]─► out
       └─►[ intento 3 ]─┘
```

**Cuándo conviene.** Sectioning, cuando la tarea tiene partes que no dependen entre sí (revisar un código por seguridad, estilo y performance a la vez). Voting, cuando importa la confianza y varias corridas dan una señal más robusta que una sola ("¿esto viola la política?", tres veces, mayoría gana).

**La trampa típica.** Agregar mal. Un agregador que promedia lo que debería vetar, o una mayoría simple en una tarea donde una sola señal de peligro tendría que alcanzar para frenar. Y asumir independencia entre corridas que comparten el mismo sesgo del modelo: tres votos del mismo modelo no son tres opiniones.

**Qué se testea.** Cada rama en aislamiento y —el gate del patrón— la lógica de agregación: ¿mayoría, unanimidad, veto? Esa política de decisión es código puro, y es donde el patrón se gana o se pierde. Un test que solo mira las ramas y no el agregador deja el corazón del workflow sin cubrir.

## 5. Orchestrator-workers: descomponer en tiempo de ejecución

Un LLM central descompone la tarea sobre la marcha y delega subtareas a workers, cuyo resultado sintetiza.

```text
                      ┌─►[ worker ]─┐
 in ──►[ orquestador ]┼─►[ worker ]─┼─►[ sintetizar ]─► out
                      └─►[ worker ]─┘
```

**Cuándo conviene.** Cuando las subtareas no se conocen de antemano: el orquestador decide en tiempo de ejecución cuántos workers lanza y qué hace cada uno (un cambio de código que toca una cantidad variable de archivos, imposible de fijar antes de mirar el repo).

**La trampa típica.** Acá empieza la frontera con el agente. El orquestador decide control de flujo, y esa es justo la definición de agente. Si las subtareas eran predecibles, esto es un agente donde alcanzaba un chain: complejidad pagada de más. La otra trampa es la síntesis final que pierde información de los workers.

**Qué se testea.** El gate se corre hacia el comportamiento: ya no alcanza con casos fijos. Hay que testear si el orquestador descompone bien (trayectorias), la calidad de la síntesis y —porque decide cuánto trabajo genera— el presupuesto: cuántos workers puede lanzar antes de que algo corte. Es el workflow que más se parece a lo que viene en las colecciones de ejecución y evaluación.

## 6. Evaluator-optimizer: generar y criticar en loop

Un LLM genera, otro evalúa y devuelve feedback, y el ciclo se repite hasta que la salida pasa o se agota el límite.

```text
 in ─►[ generar ]─►[ evaluar ]─► ¿pasa? ─sí─► salida
           ▲                       │ no
           └──── feedback ◄────────┘
```

**Cuándo conviene.** Cuando hay criterios de evaluación claros y el feedback iterativo mejora el resultado de forma medible (una traducción que se pule contra observaciones concretas, una búsqueda que se refina). La condición es que el evaluador pueda articular por qué algo todavía no alcanza.

**La trampa típica.** El loop sin condición de parada dura: sin un límite de iteraciones, hereda el riesgo del agente, que es girar sin converger. Y un evaluador más débil que el generador, que aprueba basura o rechaza lo bueno: el patrón no puede ser mejor que su crítico.

**Qué se testea.** El evaluador es el gate, literalmente: si el evaluador se equivoca, todo el patrón se degrada con él. Se lo testea contra un conjunto etiquetado (golden set), midiendo si su juicio coincide con el humano, y se testea el límite de iteraciones: que el loop pare. Un evaluator-optimizer sin tope de vueltas es un agente sin condición de parada con otro nombre.

## 7. La tabla, y la tesis

| Workflow | Cuándo conviene | Trampa típica | Qué se testea (el gate) |
|---|---|---|---|
| Prompt chaining | Subtareas fijas y conocidas | Encadenar de más; error que se propaga | Cada eslabón + los checks entre eslabones |
| Routing | Entradas de categorías distintas | Clasificación errónea silenciosa | El clasificador; casos límite y escape |
| Parallelization | Piezas independientes o consenso | Agregación mal diseñada | La lógica de agregación o de voto |
| Orchestrator-workers | Subtareas no conocidas de antemano | Ya roza el agente; síntesis que pierde info | Trayectorias del orquestador; presupuesto |
| Evaluator-optimizer | Criterios claros y feedback útil | Loop sin corte; evaluador débil | El evaluador (golden set); límite de vueltas |

La columna que más importa es la última, y no por casualidad. En los cinco, el LLM decide el contenido de cada paso, pero el control de flujo lo decide el código escrito antes de ejecutar. Por eso el gate de cada workflow es concreto y distinto: se puede señalar con el dedo dónde se rompe y qué prueba lo cubre. Un agente no ofrece ese lujo: su control de flujo lo decide el modelo en tiempo de ejecución, así que no hay un gate fijo que testear, sino trayectorias que evaluar.

De ahí la tesis, que es a la vez de arquitectura y de calidad: **si un workflow alcanza, un agente sobra.** No por conservadurismo, sino porque el workflow es más barato de construir, más barato de operar y —sobre todo— testeable en los términos de siempre. Subir al agente se justifica cuando el camino no se conoce de antemano; hasta ese punto, cada uno de estos cinco patrones es una victoria.

> El vocabulario que esto usa —modelo, contexto, herramientas, condición de parada— lo arma el pilar de la colección: [Anatomía de un agente](/blog/anatomia-de-un-agente-seis-organos/). Para meter estos gates en un pipeline que corre en cada cambio, con la prueba proporcional a lo que cada paso puede romper, [Un pipeline de calidad continua basado en riesgo](/blog/continuous-quality-pipeline-basado-en-riesgo/).
