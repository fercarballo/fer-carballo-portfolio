---
title: "Cómo se testea algo que no siempre responde igual: evals para aplicaciones con LLM"
description: "Un LLM puede dar dos respuestas distintas a la misma pregunta y las dos estar bien. Cómo se construye un harness de evaluación con golden dataset, scorers y LLM-as-judge para ponerle una vara de calidad medible."
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

> **Subtítulo:** De la aserción binaria al control estadístico de calidad: golden dataset, una escalera de scorers, un juez que también se testea y la regresión contra un baseline como número accionable.

> **Nota de alcance.** Ejemplos ilustrativos sobre un asistente de atención ficticio; los datos son sintéticos y los umbrales, ejemplos. La implementación de referencia —scorers, juez con rúbrica y reportes de regresión— vive en el repositorio [`llm-evals-harness`](https://github.com/fercarballo/llm-evals-harness). Herramientas y APIs de modelos cambian: revalidá contra tu versión.

---

## Resumen ejecutivo

- Ante la misma entrada, un LLM puede devolver dos textos distintos y **los dos ser correctos**. Un `assertEquals` vive de lo contrario, así que la caja de herramientas del testing determinista no aplica tal cual.
- La respuesta no es testear *strings*, es medir **comportamiento agregado**. Eso son las **evals**: correr el sistema contra muchos casos y observar un puntaje, no un semáforo.
- Una eval no dice "está bien"; dice **"está mejor o peor que antes"**. Es control estadístico de calidad, no una aserción.
- El **golden dataset** curado es el activo más valioso del sistema, más que el código. Los **scorers** se ordenan de barato a caro y se usa el juez costoso solo para lo difuso. El **LLM-as-judge** se valida con casos de puntaje conocido antes de creerle.
- El número que vuelve todo accionable es la **regresión contra un baseline**: detecta el cambio que mejora una métrica y rompe otra sin que nadie lo note.

Al terminar vas a poder distinguir una eval de un test, diseñar un golden dataset por riesgo, elegir el scorer adecuado para cada criterio, validar a un juez LLM y montar una comparación contra baseline que frene regresiones antes del merge.

---

## 1. El problema: cuando "correcto" deja de ser un string exacto

Casi toda la automatización de pruebas asume una cosa: que ante la misma entrada, el sistema responde lo mismo. Un `assertEquals` depende por completo de ese supuesto.

Un modelo de lenguaje lo rompe de entrada. Se le hace dos veces la misma pregunta y devuelve dos textos distintos. Y lo incómodo es que **los dos pueden ser válidos**. La pregunta que este artículo responde es: cómo se escribe una prueba cuando "correcto" ya no es un string exacto, sino un rango de respuestas aceptables.

La salida es dejar de testear *salidas puntuales* y empezar a medir *comportamiento agregado*. Ese cambio de objeto es lo que convierte el testing de un sistema probabilístico en algo tratable.

## 2. El cambio de mentalidad: de aserción binaria a métrica agregada

Un test tradicional es binario: pasa o falla. Una eval no. Una eval corre el sistema contra muchos casos y devuelve un **puntaje agregado**: "el 92 % de las respuestas cumplen el criterio". La calidad deja de ser un semáforo y pasa a ser un número que se observa en el tiempo.

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

La pieza conceptual que cuesta soltar: **una eval no dice "está bien", dice "está mejor o peor que antes"**. Es control estadístico de calidad, no una aserción. Todo lo que sigue son las tres piezas que hacen falta para construirla.

## 3. Pieza 1: el golden dataset

Todo arranca con un conjunto curado de casos: entrada más lo que se considera una buena salida (o los criterios que una buena salida debe cumplir). Es el equivalente a los casos de prueba, pensado para un sistema probabilístico.

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

La regla central: **el golden dataset es el activo más valioso del sistema**, más que el código. Un dataset chico pero bien elegido —con los casos borde reales, los que rompen en producción— vale más que mil casos autogenerados. Es el mismo criterio de elegir casos de prueba manuales: cubrir el riesgo, no inflar el número.

## 4. Pieza 2: los scorers (tres niveles de exigencia)

No todo se evalúa igual. Conviene una escalera de scorers, de barato a caro:

| Scorer | Cómo funciona | Costo | Cuándo se usa |
|---|---|---|---|
| **Exacto / determinista** | comparación literal o regex | gratis | formato, presencia de campos, que NO diga algo prohibido |
| **Similitud semántica** | distancia de embeddings vs. la respuesta ideal | bajo | "¿dice lo mismo aunque con otras palabras?" |
| **LLM-as-judge** | otro modelo puntúa contra una rúbrica | alto | tono, coherencia, criterios difusos |

La regla es la pirámide de siempre: **todo lo que pueda resolver un scorer determinista no se le da al juez caro**. El check de "la respuesta incluye el número de ticket" es un regex, no una llamada a un modelo. Se baja costo y se gana velocidad y estabilidad.

```text
        ╱╲          LLM-as-judge   ← caro, para lo difuso (tono, coherencia)
       ╱  ╲
      ╱────╲        similitud       ← "¿dice lo mismo?"
     ╱      ╲
    ╱────────╲      determinista    ← formato, prohibiciones, campos (la base)
   ╱__________╲
```

## 5. Pieza 3: LLM-as-judge, sin creerle de más

Usar un modelo para juzgar a otro tiene una trampa evidente: el juez también es no determinista. Dos prácticas lo vuelven confiable:

1. **Rúbrica explícita, no "¿está bien?".** Al juez no se le pide una opinión; se le da una escala y criterios: *"Puntuá de 1 a 5 la empatía. 5 = reconoce la molestia y ofrece pasos concretos. 1 = ignora la emoción."* Una rúbrica clara reduce la varianza del juez casi tanto como reduciría la de un evaluador humano.

2. **El juez también se testea.** Se le pasan casos con puntaje conocido —unos claramente buenos, otros claramente malos— y se verifica que los ordene bien. Si el juez no distingue un 5 de un 1 en casos obvios, no se le pueden creer los grises. Es meta-testing: testear al que testea.

## 6. El número que importa: la regresión contra un baseline

Una eval aislada dice poco. Lo que la vuelve accionable es correrla **contra un baseline**. Se guarda el puntaje de la versión actual y, en cada cambio de prompt o de modelo, se compara:

```text
  baseline (prompt v3):  0.92 aprobación · 0.88 empatía media
  candidato (prompt v4):  0.94 aprobación · 0.79 empatía media
                                              ▲
                          subió la aprobación pero CAYÓ la empatía
                          → el cambio tiene un costo oculto, no mergear a ciegas
```

Ese caso —mejorar una métrica y romper otra sin querer— es invisible sin evals. Con evals, salta en el reporte antes del merge. Es el mismo valor que una regresión automatizada aporta en una app tradicional, trasladado al mundo probabilístico.

## 7. Errores comunes al empezar

- **Buscar un umbral absoluto de "pasa / no pasa".** No existe el "el sistema debe sacar 0.9". Lo que importa es *no bajar respecto de ayer*: la vara es relativa, no absoluta.
- **Un golden dataset gigante autogenerado.** Mucho ruido, poca señal. Un conjunto de ~40 casos elegidos a mano rinde mejor que miles sintéticos.
- **Creerle al juez sin validarlo.** Hasta que no se lo prueba con casos conocidos, se está midiendo con una regla de goma.

## 8. Por qué esto es Quality Engineering

Evaluar un sistema con IA es el trabajo de siempre —definir qué es calidad, diseñar casos que cubran el riesgo, medir y detectar regresiones— aplicado a un sistema que no responde igual dos veces. El dominio es nuevo; el criterio es el mismo.

Y es, además, un frente en expansión: cada vez más productos incorporan un modelo, y todavía es raro el equipo que sabe ponerle una vara de calidad medible. Quien traiga la disciplina del testing a ese terreno tiene una ventaja concreta.

> El código completo —scorers, juez con rúbrica y los reportes de regresión— está en [`llm-evals-harness`](https://github.com/fercarballo/llm-evals-harness). Para el marco conceptual más amplio (contrato de propósito, slices de riesgo y gate en CI), ver el pilar [Evaluación continua de sistemas con IA](/blog/evaluacion-continua-sistemas-ia-quality-engineering/).
