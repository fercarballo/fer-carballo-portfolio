---
title: "La condición de parada: el requisito más subestimado de un agente"
description: "La condición de parada, el requisito que a AutoGPT le faltó: tipos de parada, presupuestos como SLO con corte duro, detección de no-progreso y cómo se testea."
pubDate: 2026-07-15
tags: ['agentes', 'guardrails', 'presupuestos', 'quality-engineering', 'sdet']
cluster: 'g01'
clusterTitle: "Anatomía del agente y workflows"
type: satelite
order: 3
readingLevel: "Intermedio–Avanzado"
prerequisites: "Nociones de loops de agente."
icon: 'set'
iconHue: 205
---

> **Subtítulo:** Por qué la condición de parada separa una demo de un sistema operable: los cuatro modos de terminar, los presupuestos como SLO con corte duro, la detección de no-progreso y cómo se testea que un agente pare bien.

> **Nota de alcance.** Ejemplos ilustrativos; el fragmento de código es esquemático, no una librería. Los límites concretos (cuántos pasos, cuántos tokens) dependen de tu caso y se calibran con datos, no se copian. Revalidá contra tu runtime.

---

## Resumen ejecutivo

- La condición de parada es el órgano del agente que no aparece en la demo y decide la factura: responde cuándo el loop deja de girar.
- **Su ausencia tiene nombre y fecha: los loops autónomos virales de 2023 (AutoGPT, BabyAGI) divagaban, se atascaban y quemaban presupuesto sin llegar a nada. Todo lo que vino después —presupuestos, cortes, evals— es en parte una respuesta a ese fracaso.**
- Un agente puede terminar de cuatro maneras —objetivo verificado, presupuesto agotado, sin progreso, escalada a humano— y un diseño serio contempla las cuatro, no solo la primera.
- Los presupuestos (pasos, tokens, tiempo, dinero) se tratan como SLO con corte duro en el runtime, no como pedido en el prompt: un límite en el prompt es una preferencia; en el código, una garantía.
- Se testea con tareas diseñadas para fallar: el criterio no es "terminó bien", es "paró bien" —por la razón correcta, dentro del presupuesto, con el log que lo explica—.

Al terminar vas a poder: distinguir las cuatro formas de parada, especificar presupuestos como cortes duros, detectar no-progreso, definir qué loguear en el evento de parada y diseñar los casos que prueban que un agente para bien.

---

## 1. El problema: AutoGPT y el loop que no sabía parar

En marzo y abril de 2023, AutoGPT y BabyAGI capturaron la imaginación de todos: un agente que se daba objetivos, los descomponía y trabajaba solo hasta cumplirlos. La demo hipnotizaba. El uso real decepcionaba, por una razón que entonces no tenía nombre: sin condición de parada ni forma de medir su propio progreso, esos loops autónomos divagaban, se atascaban en subtareas inútiles y quemaban presupuesto sin llegar a nada.

Esa fue la lección negativa fundacional de la era: la autonomía sin frenos no es una capacidad, es un riesgo. Y sin embargo, la condición de parada sigue siendo el requisito más subestimado de un agente, por un motivo simple: no aparece en la demo. La demo se arma con una tarea que termina bien, y una tarea que termina bien nunca ejercita el freno. El requisito se cobra después, en la factura de tokens o en el incidente de las tres de la mañana.

Una condición de parada contesta una pregunta que la demo esquiva: ¿cuándo este loop deja de girar? Terminar bien es solo una de las respuestas. Un sistema operable necesita también las otras: cuándo cortar aunque la tarea no esté terminada.

## 2. Cuatro formas de terminar

Un agente puede parar por cuatro razones, y las cuatro tienen que estar diseñadas, no solo la primera:

```text
 [1] objetivo verificado   un chequeo confirma el resultado — no "el modelo avisó que terminó"
 [2] presupuesto agotado   se acabaron los pasos / tokens / tiempo / dinero → corte duro
 [3] sin progreso          N vueltas sin cambio de estado → dejar de insistir
 [4] escalada a humano     ambigüedad o riesgo alto → parar y pedir una decisión
```

La distinción clave está en el modo [1]. "Terminado" no es que el modelo anuncie que terminó: es que un chequeo independiente lo valide (el archivo existe, el test pasa, el registro quedó como se esperaba). Confiar en el auto-reporte del modelo es volver a poner al zorro a cuidar el gallinero.

Los modos [2], [3] y [4] son los que a AutoGPT le faltaban: las salidas para cuando la cosa no va a terminar bien. Un agente que solo sabe parar por [1] es un agente que, cuando algo se tuerce, no para nunca.

## 3. Presupuestos como SLO: el corte duro

Cada corrida de un agente consume cuatro recursos medibles: pasos (vueltas del loop), tokens, tiempo de reloj y dinero (el costo agregado). Tratarlos como SLO significa fijarles un techo explícito antes de correr y cortar cuando se alcanza —no como sugerencia al modelo, sino como código externo que interrumpe el loop—.

```python
# El presupuesto vive en el runtime, no en el prompt.
# El modelo no puede "convencerse" de seguir: el corte es externo a él.
if pasos >= MAX_PASOS or tokens >= MAX_TOKENS or costo_usd >= MAX_USD:
    return parar(razon="presupuesto", pasos=pasos, tokens=tokens, costo=costo_usd)
```

La diferencia entre pedirlo en el prompt y ponerlo en el código es toda la diferencia. Un límite en el prompt ("no uses más de diez pasos") es una preferencia que el modelo puede ignorar, malinterpretar u olvidar cuando el contexto se satura. Un límite en el runtime es una garantía. El presupuesto duro es lo que convierte "el agente puede costar mucho" en "el agente cuesta, como máximo, esto".

## 4. Detección de no-progreso

El presupuesto corta lo que tarda de más; el no-progreso corta lo que no va a ningún lado antes de agotar el presupuesto. Son dos frenos distintos: uno mira el gasto, el otro mira el avance. Para la mayoría de los casos alcanzan dos señales baratas y observables:

- **Misma acción repetida.** El agente llama a la misma herramienta con los mismos argumentos dos o tres veces seguidas. Está en un loop cerrado.
- **Estado sin cambios.** Tras N vueltas, el estado relevante del mundo no se movió. Está girando en falso, gastando pasos sin producir nada.

La implementación es modesta: guardar una firma de cada paso —herramienta, argumentos y delta de estado— y cortar si la firma se repite o si el estado queda estancado K vueltas. No es sofisticado. Es, exactamente, el freno que a los loops de 2023 les faltaba.

## 5. Qué loguear: la auditoría del "por qué paró"

Cuando un agente para, la pregunta operativa siempre es la misma: ¿por qué paró acá? Un log que no la contesta vuelve imposible el postmortem y condena al equipo a adivinar. El evento de parada tiene que registrar, como mínimo:

- La razón de parada —cuál de los cuatro modos— y la regla concreta que la disparó.
- El estado del presupuesto al cortar: pasos, tokens, tiempo y dinero consumidos contra su techo.
- La última acción y su resultado.
- Si fue no-progreso, qué firma se repitió o qué estado quedó estancado.
- Si fue escalada, qué ambigüedad o qué riesgo la motivó.

La condición de parada no es solo un mecanismo de corte: es un evento de primera clase que se audita. "Terminó" y "se quedó sin pasos" son dos finales distintos, y el log tiene que distinguirlos sin ambigüedad. Si los dos se ven igual en la traza, no hay forma de saber si el agente está funcionando o fallando en silencio.

## 6. Cómo se testea: parar bien, no solo terminar bien

Acá está el giro de QA. Casi todo el testing de agentes pregunta "¿termina bien la tarea?". La condición de parada exige la pregunta complementaria, la que nadie hace en la demo: "¿para bien cuando la tarea no se puede terminar?". Un agente que solo se prueba con tareas resolubles nunca ejercita sus frenos, y un freno que no se probó es un freno que no existe.

El conjunto de pruebas de una condición de parada se arma con tareas diseñadas para fallar, cada una de una manera distinta:

| Caso de prueba | Qué se inyecta | Parada correcta esperada |
|---|---|---|
| Tarea imposible | Un objetivo inalcanzable con las herramientas dadas | Corte por presupuesto o no-progreso, sin girar para siempre |
| Herramienta rota | Una herramienta que devuelve error o cuelga | Detectar el no-progreso y parar o escalar, no reintentar infinito |
| Objetivo ambiguo | Una instrucción con lecturas incompatibles | Escalar a humano, no elegir una al azar y ejecutar |
| Trampa de loop | Un estado que invita a repetir la misma acción | Detectar la repetición y cortar |

El criterio de aprobación no es "terminó bien" —es "paró bien"—: por la razón correcta, dentro del presupuesto y con el log que lo explica. Parar bien es una capacidad testeable, y es una que la demo nunca muestra, porque la demo, por definición, no la necesita.

## 7. El requisito que separa la demo de la producción

La condición de parada es el órgano del agente que no se ve cuando todo sale bien y decide todo cuando algo sale mal. Un agente sin una condición de parada bien definida no está "casi listo": está a un caso raro de un incidente de costo, a una herramienta caída de un loop infinito, a una instrucción ambigua de una acción que nadie pidió.

Diseñarla es barato comparado con lo que evita. Cuatro modos de terminar, cuatro recursos con techo duro, dos señales de no-progreso y un log honesto: nada de eso es investigación de frontera. Es, otra vez, el criterio de siempre —desconfiar de la demo, diseñar para el caso que falla— aplicado a un sistema que actúa solo.

> Este requisito es uno de los seis órganos del [pilar de anatomía](/blog/anatomia-de-un-agente-seis-organos/). Medir que un agente para bien, y con qué frecuencia, es parte de [Evaluar agentes: trayectoria, outcome y pass^k](/blog/evaluar-agentes-trayectoria-outcome-pass-k/). Para calibrar cuánto rigor de parada exige cada agente según lo que puede romper, [Quality gates proporcionales al riesgo](/blog/quality-gates-proporcionales-al-riesgo/).
