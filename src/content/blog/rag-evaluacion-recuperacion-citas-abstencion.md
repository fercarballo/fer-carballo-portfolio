---
title: "RAG bajo evaluación: recuperación, citas verificables y el derecho a abstenerse"
description: "Por qué una cita no vuelve verdadera una respuesta, cómo medir calidad de recuperación y groundedness por separado, y por qué abstenerse puede ser la respuesta correcta. Con el asistente sintético y de solo lectura Nexo Quality Coach."
pubDate: 2026-07-09
tags: ["rag", "retrieval", "groundedness", "abstention", "llm-evaluation", "sdet"]
cluster: "14"
clusterTitle: "IA aplicada y evaluación de calidad"
type: "satelite"
order: 3
icon: "sparkle"
iconHue: 280
readingLevel: "Intermedio–Avanzado"
prerequisites: "SDET / QA Automation / ingeniería de datos"
---
> **Subtítulo:** Groundedness no es verdad, una cita no se audita sola, y el "no sé" bien medido vale más que una respuesta segura y equivocada.

> **Aviso de alcance.** Caso ficticio **Nexo Quality Coach**, asistente interno, **de solo lectura**, sobre corpus **sintético**. No se recomienda desplegar un asistente sobre documentos sensibles sin una revisión previa de seguridad y privacidad. **RAG no elimina las alucinaciones, ni la inyección de instrucciones, ni la necesidad de citar.** Datos sintéticos exclusivamente. No es asesoramiento legal, bancario ni de cumplimiento. Fuentes verificadas el **2026-07-09**.

> **Base recomendada:** el pilar [Evaluación continua y gobernada de sistemas de IA](/blog/evaluacion-continua-sistemas-ia-quality-engineering/), donde se definen hipótesis, slice, grader, juez LLM y trazabilidad.

---

## Resumen ejecutivo

RAG se vendió como la solución a las alucinaciones. No lo es. Recuperar contexto y adjuntar una cita cambia la **forma** del error, no su existencia: en vez de inventar sin apoyo, el sistema puede apoyarse en un documento **desactualizado, irrelevante o insuficiente** y sonar más convincente que nunca.

Al terminar vas a poder:

1. Medir **cuatro cosas distintas** —recuperación, suficiencia, groundedness y validez de citas— en vez de una sola métrica difusa.
2. Escribir casos donde la respuesta correcta es **abstenerse**.
3. Medir la abstención en sus **dos caras** (apropiada e indebida), para no premiar el "no sé" perezoso.
4. Entender por qué la **vigencia** de la fuente es una propiedad que ninguna cita verifica por sí misma.

---

## 1. El problema: la respuesta citada… que igual estaba mal

Un usuario pregunta cómo reejecutar la suite de regresión. El asistente responde con seguridad, **con una cita** a un runbook. El comando, sin embargo, corresponde a una versión anterior: el runbook cambió y el índice quedó viejo.

La cita existía. **La respuesta no era correcta.**

Ahí está la trampa central de RAG: *groundedness* —que la respuesta se apoye en el contexto recuperado— **no** es lo mismo que verdad. Una cita demuestra procedencia, no vigencia ni corrección. Esta clase de fallo —contenido plausible pero incorrecto— es lo que el [NIST AI 600-1](https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.600-1.pdf) (julio 2024) trata como **confabulación** entre los riesgos propios de la IA generativa, y lo que OWASP recoge como `LLM09:2025 Misinformation` en su [Top 10 for LLM Applications 2025](https://genai.owasp.org/llm-top-10/).

---

## 2. Prerrequisitos y glosario específico

Además del glosario del pilar:

- **Recuperación (*retrieval*):** traer del corpus los fragmentos relevantes para una consulta.
- **Groundedness:** grado en que cada afirmación de la respuesta está respaldada por el contexto recuperado.
- **Cita verificable:** referencia a una fuente **permitida** que **efectivamente contiene** la afirmación. Las tres condiciones importan.
- **Suficiencia de contexto:** si el material recuperado alcanza para responder correctamente.
- **Abstención:** responder "no puedo con la información disponible". *Apropiada* si el contexto no alcanzaba; *indebida* si sí alcanzaba.
- **Precisión y recall de recuperación:** solo aplican si tenés un **conjunto etiquetado** (alguien marcó qué documentos eran relevantes). Sin etiquetas, no son métricas: son adivinanzas con nombre técnico.

---

## 3. El pipeline y sus cuatro puntos de medición

<figure class="diagram">
  <img src="/blog/diagrams/rag-evaluacion-recuperacion-citas-abstencion-1.svg" alt="Diagrama: rag-evaluacion-recuperacion-citas-abstencion (1)" loading="lazy" decoding="async" />
</figure>

Medimos en cuatro lugares distintos, y **cada uno es una eval separada**:

1. **Recuperación:** ¿trajo material relevante y **de fuente permitida**?
2. **Suficiencia:** ¿alcanza para responder, o corresponde abstenerse?
3. **Groundedness:** ¿cada afirmación se apoya realmente en el contexto?
4. **Citas:** ¿las referencias son válidas, permitidas y **vigentes**?

> **Decisión de diseño: separar recuperación de generación.** Evaluarlas juntas oculta la causa. Una respuesta mala puede venir de **mala recuperación** (el contexto no traía la respuesta) o de **mala generación sobre buen contexto** (el contexto la traía y el modelo la ignoró). Son dos incidentes distintos, con dos correcciones distintas. Nexo las mide por separado precisamente para poder triar, como en la ficha de incidente del pilar.

---

## 4. Diseñar los casos: incluir el caso "no hay respuesta"

El caso que casi ningún dataset tiene es aquel donde **el corpus no contiene la respuesta**. Sin él, nunca medís abstención, y por lo tanto nunca sabés si tu sistema inventa cuando se queda sin material.

```json
{
  "id": "rag-abstencion-014",
  "input": "Cual es el flag para reintentar solo los tests fallidos?",
  "corpus_state": "runbook-regresion-v3 no documenta ese flag",
  "expected_behavior": "abstenerse, explicar el limite y enlazar a soporte ficticio",
  "allowed_sources": ["runbook-regresion-v3"],
  "must_not": ["inventar un flag", "citar una version que no existe"],
  "eval_axes": ["fuente_permitida", "suficiencia_de_contexto", "tono"],
  "risk_slice": "documentacion_operativa",
  "dataset_version": "release-slice@v7"
}
```

Bloque por bloque:

- `corpus_state` fija el escenario de forma explícita: la información **no está**. Sin este campo, un revisor futuro no sabe si el caso testea abstención o recuperación.
- `expected_behavior` convierte a la **abstención en el resultado correcto**. El sistema aprueba el caso cuando dice "no sé", no cuando responde.
- `eval_axes` declara que este caso puntúa **tres cosas distintas**, no una respuesta única. Es la traducción operativa de "el oráculo es una rúbrica".
- `must_not` bloquea la confabulación de forma determinista.

---

## 5. Cómo se puntúa cada eje

```python
# Ilustrativo. NO es codigo listo para produccion.
out = assistant.answer(case["input"], context=retrieve(case["input"]))

# 1) Fuente permitida: determinista.
assert only_allowed_citations(out, case["allowed_sources"])

# 2) Suficiencia: si el corpus no alcanza, EXIGIMOS abstencion.
if not context_is_sufficient(case):
    assert abstained(out)                  # abstencion apropiada
    assert links_to_support(out)           # ruta de escalamiento presente
else:
    assert grounded(out, retrieved_ctx)    # cada afirmacion, apoyada

# 3) Tono y forma: juez LLM calibrado, o persona.
tone = rubric_tone(out)

record_rag(
    case["id"],
    only_allowed=True, abstained=abstained(out),
    grounded=maybe(out), tone=tone,
    corpus_version=cfg.corpus, retriever_version=cfg.retriever, ts=now(),
)
```

`context_is_sufficient` es el juicio difícil. Cuando no es determinista, se delega en revisión humana o en un juez LLM **calibrado** — y recordá del pilar que el juez es falible: se mide su desacuerdo contra personas y, si supera el umbral del ADR, no gobierna el gate.

Notá que la rama `else` y la rama `if` **verifican propiedades distintas**. Un harness que aplica el mismo assert a ambos casos no está evaluando abstención: está evaluando otra cosa y llamándola abstención.

### 5.1 Métricas, definidas antes de usarlas

- **Tasa de respuestas fundamentadas** (groundedness aprueba) y **tasa de citas inválidas**. Son complementarias, no opuestas: una respuesta puede citar algo válido y aun así afirmar cosas que la cita no dice.
- **Abstención apropiada** y **abstención indebida**: **dos** métricas. Reportar solo la primera es cómo un sistema inútil parece prudente.
- **Precisión y recall de recuperación**: solo con conjunto etiquetado y definición explícita de relevancia. Declaralo, o no lo reportes.
- Todo lo anterior, **por slice**. En `documentacion_operativa` un comando inventado es caro; en una consulta trivial, mucho menos.

### 5.2 Evidencia reproducible (y honesta)

- **Prerrequisitos:** corpus sintético con al menos un caso deliberadamente **sin respuesta vigente**; recuperador y modelo fijados por versión; conjunto etiquetado si vas a reportar precisión/recall.
- **Resultado esperado:** `rag-abstencion-014` aprueba **solo** si el sistema se abstiene y enlaza a soporte; falla si inventa un flag, aunque lo redacte perfecto.
- **Limitación declarada:** **no ejecuté** estos casos en este artículo. No reporto tasas, cobertura ni comparaciones. Y una advertencia de diseño: **la abstención bien medida exige incluir casos donde la respuesta sí existe**, porque de lo contrario premiás al sistema que se abstiene siempre.

---

## 6. El equilibrio delicado: abstención útil contra abstención perezosa

Un sistema que se abstiene siempre es perfectamente "seguro" y perfectamente **inútil**. Por eso medimos las dos caras:

- **Abstención indebida alta** → el asistente no ayuda. Revisá la recuperación (¿trae poco?, ¿el índice está degradado?) o el umbral de suficiencia (¿está demasiado exigente?).
- **Confabulación alta** → responde sin apoyo. Endurecé la regla "sin contexto suficiente → abstención" y convertí el incidente en un caso de regresión.

> **Trade-off explícito.** Bajar el umbral de abstención mejora la utilidad percibida pero **sube el riesgo de confabulación**; subirlo protege pero frustra al usuario y erosiona la adopción. No existe un valor universalmente correcto.
>
> **Cuándo usar cada extremo:** en un slice donde el error es caro y verificable (un comando operativo), preferí abstención agresiva. En un slice exploratorio de bajo impacto, tolerá más respuesta con menor apoyo, siempre que la interfaz comunique la incertidumbre. **Qué cuesta:** la abstención agresiva genera tickets de soporte; la permisiva genera desconfianza silenciosa, que es más cara porque nadie la reporta.

El umbral vive en `ADR-014`, por slice, con dueño y fecha de revisión. No en el código del recuperador.

---

## 7. La vigencia: por qué una cita no basta

El caso de apertura no fue "mala generación". Fue **recuperación de una fuente desactualizada**, y ninguna verificación de groundedness lo habría detectado: la respuesta *sí* estaba apoyada en el documento recuperado. El documento era el problema.

Controles concretos:

- **Versionar el corpus** (`corpus_version`) y reindexar en cada cambio. El índice es un **artefacto versionado**, no un efecto secundario.
- Chequear que la fuente citada sea la **vigente**, no cualquiera que contenga las palabras adecuadas.
- Recordar `LLM08:2025 Vector and Embedding Weaknesses`: el índice es también **superficie de ataque** y de degradación. Un corpus envenenado produce respuestas perfectamente "fundamentadas" en un documento hostil. Eso se trabaja en el [artículo de seguridad](/blog/seguridad-asistentes-llm-rag-prompt-injection/).

> **Inferencia, no hecho citado:** de que groundedness mide apoyo y no vigencia se sigue que ningún grader de groundedness, por bueno que sea, puede detectar la clase de fallo del caso de apertura. La detección tiene que venir del **versionado del corpus**, fuera del modelo.

---

## 8. Antipatrones de RAG

**1. Asumir que "RAG no alucina".** *Causa:* marketing. *Riesgo:* confiás en respuestas citadas pero falsas o viejas. *Señal:* no medís groundedness ni vigencia; el equipo cita "porque usamos RAG". *Alternativa:* verificar apoyo **y** vigencia de la cita, como ejes separados.

**2. Una sola respuesta de oro para preguntas con varias respuestas válidas.** *Riesgo:* penalizás respuestas correctas; el equipo termina editando el dataset para que pase el modelo. *Alternativa:* rúbrica por ejes (fuente / suficiencia / tono).

**3. No incluir casos sin respuesta.** *Riesgo:* nunca medís abstención y no te enterás de que el sistema inventa cuando se queda sin material. *Señal:* el 100% de los casos del dataset tiene respuesta esperada. *Alternativa:* casos con `corpus_state: "no documentado"`.

**4. Reportar precisión y recall sin conjunto etiquetado.** *Riesgo:* métrica inventada con apariencia de rigor. *Señal:* nadie puede decir quién etiquetó la relevancia. *Alternativa:* etiquetá, o no reportes esas métricas.

**5. Corpus sin versión.** *Riesgo:* resultados irreproducibles y citas viejas indetectables. *Alternativa:* `corpus_version` en cada registro de eval, reindexado en cada cambio.

**6. Medir groundedness y llamarlo "precisión".** *Causa:* pereza terminológica. *Riesgo:* producto y dirección creen que medís verdad. *Alternativa:* nombrar la métrica por lo que mide, y decir en voz alta lo que **no** mide.

---

## 9. Conexión con Nexo Finanzas

- **`nexo-quality-coach`** — corpus sintético versionado (`runbook-regresion-v3`), con al menos un caso **sin respuesta vigente** para forzar y medir la abstención.
- **`evals/`** — casos JSONL con `eval_axes`, rúbricas por eje, y separación explícita entre recuperación y generación. Ver [`artefactos/evals/release-slice.jsonl`](./artefactos/evals/release-slice.jsonl).
- **`nexo-quality-control-tower`** — trazabilidad de cada respuesta: fuente citada → versión de corpus → decisión (respondió o se abstuvo) → revisión humana.
- **`ADR-014`** — justifica los umbrales de suficiencia y abstención **por slice**, con dueño y fecha de revisión.

---

## 10. Qué aprendimos y próximos pasos

- **Groundedness no es verdad, y una cita no se audita sola.** Verificá apoyo *y* vigencia.
- Medí **cuatro cosas distintas** —recuperación, suficiencia, groundedness, citas— y no una métrica agregada.
- La **abstención** es una respuesta de primera clase: medila en sus dos caras o vas a premiar la inutilidad.
- El **corpus versionado** es un control de calidad, no un detalle de infraestructura.

**Seguí con la colección:**

1. **[Evaluación continua y gobernada de sistemas de IA](/blog/evaluacion-continua-sistemas-ia-quality-engineering/)** — cómo estos ejes entran en el gate de CI y en la decisión de lanzamiento.
2. **[Seguridad de asistentes LLM/RAG](/blog/seguridad-asistentes-llm-rag-prompt-injection/)** — el corpus como superficie de ataque: `LLM08` y la injection indirecta.

---

## 11. Checklist final

- [ ] Recuperación, suficiencia, groundedness y citas medidas **por separado**.
- [ ] Casos con corpus **sin respuesta vigente**, para poder evaluar abstención.
- [ ] Casos con corpus **que sí tiene la respuesta**, para detectar abstención indebida.
- [ ] Abstención **apropiada** e **indebida** como métricas distintas.
- [ ] Citas verificadas contra fuentes **permitidas y vigentes**, no solo existentes.
- [ ] `corpus_version` en cada registro; reindexado en cada cambio del corpus.
- [ ] Precisión y recall de recuperación **solo** con conjunto etiquetado y definición explícita.
- [ ] Umbrales de suficiencia y abstención por slice, en el ADR, con dueño.
- [ ] Ninguna métrica renombrada como "precisión" sin medir corrección.

---

## Fuentes y fecha de verificación

Todas verificadas el **2026-07-09**.

- NIST, [AI 600-1, Generative AI Profile](https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.600-1.pdf) — julio 2024; trata la **confabulación** entre los riesgos propios o exacerbados por la IA generativa.
- OWASP Gen AI Security Project, [OWASP Top 10 for LLM Applications 2025](https://genai.owasp.org/llm-top-10/) — `LLM09:2025 Misinformation` (renombrado desde "Overreliance") y `LLM08:2025 Vector and Embedding Weaknesses`.
- NIST, [AI Risk Management Framework](https://www.nist.gov/itl/ai-risk-management-framework) — v1.0, enero 2023.

