---
title: "Cómo se testea algo que no siempre responde igual: evals para aplicaciones con LLM"
description: "Un LLM puede dar dos respuestas distintas a la misma pregunta y las dos estar bien. Así armé un harness de evaluación con golden dataset, scorers y LLM-as-judge para ponerle una vara de calidad medible."
pubDate: 2026-07-13
tags: ['evals', 'llm-evaluation', 'quality-engineering', 'ci-cd', 'sdet']
cluster: '14'
clusterTitle: "IA aplicada y evaluación de calidad"
type: satelite
order: 4
readingLevel: "Intermedio–Avanzado"
prerequisites: "Nociones de LLMs y de testing automatizado."
repo: "llm-evals-harness"
icon: 'flask'
iconHue: 280
---

La primera vez que me tocó pensar cómo asegurar la calidad de una feature con un modelo de lenguaje adentro, se me cayó la caja de herramientas. Todo lo que uso a diario asume una cosa: que ante la misma entrada, el sistema responde lo mismo. Un `assertEquals` vive de eso.

Un LLM rompe ese supuesto de entrada. Le preguntás dos veces lo mismo y te da dos textos distintos. Y —acá está lo incómodo— **los dos pueden estar bien**. ¿Cómo escribís un test cuando "correcto" ya no es un string exacto sino un rango de respuestas aceptables?

La respuesta corta que encontré: dejás de testear *strings* y empezás a testear *comportamiento agregado*. Eso son las **evals**. Este artículo es cómo las armé.

> Todo lo que sigue está implementado en mi repo [`llm-evals-harness`](https://github.com/fercarballo/llm-evals-harness): golden dataset, scorers y el juez LLM, con reportes reproducibles.

## El cambio de mentalidad: de test binario a métrica

Un test tradicional es binario: pasa o falla. Una eval no. Una eval corre el sistema contra muchos casos y te devuelve un **puntaje agregado**: "el 92% de las respuestas cumplen el criterio". La calidad deja de ser un semáforo y pasa a ser un número que podés mirar en el tiempo.

```text
  Test tradicional            Eval de LLM
  ─────────────────           ─────────────────────────────
  input → output              dataset → [correr N casos]
  output == esperado?               │
      ✓ / ✗                         ▼
                              cada caso → scorer → puntaje 0..1
                                    │
                                    ▼
                              agregado: media, % que pasa, regresión
                                    │
                                    ▼
                              ¿bajó respecto del baseline? → alerta
```

La pieza mental que más me costó soltar: **una eval no te dice "está bien", te dice "está mejor o peor que antes"**. Es control estadístico de calidad, no una aserción.

## Pieza 1: el golden dataset

Todo arranca con un conjunto curado de casos: entrada + lo que consideramos una buena salida (o los criterios que una buena salida debe cumplir). Es el equivalente a los casos de prueba, pero pensados para un sistema probabilístico.

```json
{
  "id": "refund-tone-01",
  "input": "Quiero mi plata de vuelta, esto es un desastre",
  "criteria": {
    "must_include": ["disculpa", "pasos"],
    "must_not_include": ["no podemos hacer nada"],
    "tone": "empático y resolutivo"
  }
}
```

Lo que aprendí armándolo: **el golden dataset es el activo más valioso de todo esto**, más que el código. Un dataset chico pero bien elegido —con los casos borde reales, los que rompen en producción— vale más que mil casos autogenerados. Es exactamente el mismo criterio que aplico eligiendo casos de prueba manuales: cubrir el riesgo, no inflar el número.

## Pieza 2: los scorers (tres niveles de exigencia)

No todo se evalúa igual. Armé una escalera de scorers, de barato a caro:

| Scorer | Cómo funciona | Costo | Cuándo lo uso |
|---|---|---|---|
| **Exacto / determinista** | comparación literal o regex | gratis | formato, presencia de campos, que NO diga algo prohibido |
| **Similitud semántica** | distancia de embeddings vs. la respuesta ideal | bajo | "¿dice lo mismo aunque con otras palabras?" |
| **LLM-as-judge** | otro modelo puntúa contra una rúbrica | alto | tono, coherencia, criterios difusos que solo un humano (o un juez) evalúa |

La regla que sigo es la misma pirámide de siempre: **todo lo que pueda resolver un scorer determinista, no se lo doy al juez caro**. El check de "la respuesta incluye el número de ticket" es un regex, no una llamada a un modelo. Bajás costo y ganás velocidad y estabilidad.

```text
        ╱╲          LLM-as-judge   ← caro, para lo difuso (tono, coherencia)
       ╱  ╲
      ╱────╲        similitud       ← "¿dice lo mismo?"
     ╱      ╲
    ╱────────╲      determinista    ← formato, prohibiciones, campos (la base)
   ╱__________╲
```

## Pieza 3: LLM-as-judge, sin creerle de más

Usar un modelo para juzgar a otro suena a truco de magia, y tiene su trampa: el juez también es no determinista. Dos cosas que hago para que sea confiable:

1. **Rúbrica explícita, no "¿está bien?".** Al juez no le pregunto una opinión; le doy una escala y criterios: *"Puntuá de 1 a 5 la empatía. 5 = reconoce la molestia y ofrece pasos concretos. 1 = ignora la emoción."* Una rúbrica clara reduce la varianza del juez casi tanto como reduciría la de un evaluador humano.

2. **El juez también se testea.** Le paso casos con puntaje conocido (unos claramente buenos, otros claramente malos) y verifico que los ordene bien. Si el juez no distingue un 5 de un 1 en casos obvios, no le puedo creer los casos grises. Es meta-testing: testear al que testea.

## El número que de verdad importa: la regresión

Una eval aislada dice poco. Lo que la vuelve accionable es correrla **contra un baseline**. Guardo el puntaje de la versión actual, y en cada cambio de prompt o de modelo comparo:

```text
  baseline (prompt v3):  0.92 aprobación · 0.88 empatía media
  candidato (prompt v4):  0.94 aprobación · 0.79 empatía media
                                              ▲
                          subió la aprobación pero CAYÓ la empatía
                          → el cambio tiene un costo oculto, no mergear a ciegas
```

Ese caso —mejorás una métrica y sin querer rompés otra— es invisible sin evals. Con evals, salta en el reporte antes del merge. Es el mismo valor que una regresión automatizada me da en una app tradicional, trasladado al mundo probabilístico.

## Lo que no funcionó (para que no lo sufras)

- **Querer un umbral de "pasa/no pasa" absoluto.** Perdí tiempo buscando "el sistema debe sacar 0.9". No existe ese número mágico; lo que importa es *no bajar respecto de ayer*. La vara es relativa.
- **Un golden dataset gigante autogenerado.** Mucho ruido, poca señal. Volví a 40 casos elegidos a mano y la señal mejoró.
- **Creerle al juez sin validarlo.** Hasta que no lo puse a prueba con casos conocidos, estaba midiendo con una regla de goma.

## Por qué esto es QA y no "cosa de data scientists"

Lo pienso así: evaluar un sistema con IA es exactamente mi trabajo de siempre —definir qué es calidad, diseñar casos que cubran el riesgo, medir y detectar regresiones— aplicado a un sistema que no responde igual dos veces. El dominio es nuevo; el criterio es el mismo.

Y es, honestamente, el pedazo de QA que más me entusiasma ahora mismo: cada vez más productos meten un modelo adentro, y muy poca gente sabe todavía cómo ponerle una vara de calidad medible. Ahí quiero estar.

> El código completo —scorers, juez con rúbrica y los reportes de regresión— está en [`llm-evals-harness`](https://github.com/fercarballo/llm-evals-harness). Si lo mirás y algo se puede hacer mejor, escribime: sigo iterándolo.
