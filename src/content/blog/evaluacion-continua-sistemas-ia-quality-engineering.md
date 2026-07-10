---
title: "Evaluación continua y gobernada de sistemas de IA: por qué un prompt, una respuesta de oro y un promedio no son una estrategia de calidad"
description: "Cómo diseñar evals versionadas, gates en CI, métricas por slice y decisiones de lanzamiento para una aplicación con IA, usando el asistente ficticio Nexo Quality Coach: interno, de solo lectura y sobre datos sintéticos."
pubDate: 2026-07-09
tags: ["quality-engineering", "llm-evaluation", "evals", "ci-cd", "ai-governance", "rag", "sdet"]
cluster: "14"
clusterTitle: "IA aplicada y evaluación de calidad"
type: "pilar"
order: 1
icon: "sparkle"
iconHue: 280
readingLevel: "Intermedio–Avanzado"
prerequisites: "SDET / QA Automation / backend / PM / líderes técnicos"
---
> **Subtítulo:** Cómo pasar de "la demo salió impecable" a "tengo una hipótesis de calidad, un dataset versionado, un gate con dueño y un rollback", usando el asistente ficticio **Nexo Quality Coach** como hilo conductor.

> **Aviso de alcance.** Este artículo usa exclusivamente un entorno ficticio y datos sintéticos. **Nexo Quality Coach** es un asistente *interno*, **de solo lectura**, que responde preguntas sobre documentación sintética de un portfolio. No opera cuentas, no inicia pagos, no toma decisiones financieras, no consulta bases reales y no reemplaza a una persona. Nada de lo que sigue implica que una evaluación vuelva un sistema "seguro", "imparcial", "preciso" o "conforme": eso exige alcance y evidencia propios. No es asesoramiento legal, bancario ni de cumplimiento. Todas las fuentes se verificaron el **2026-07-09**; confirmá la URL canónica antes de decidir.

---

## Resumen ejecutivo

Si tu equipo evalúa una aplicación con IA mirando una demo y un promedio, está midiendo impresión, no calidad. La tesis de este artículo es que **la calidad de una aplicación con IA emerge de la interacción** entre modelo, instrucciones, datos recuperados, herramientas, interfaz, políticas, usuario y operación. Ninguno de esos componentes se evalúa solo, y el promedio de todos ellos oculta exactamente el daño que importa.

Al terminar vas a poder:

1. Escribir un **contrato de propósito y política** que prohíba explícitamente las acciones de alto impacto antes de elegir modelo.
2. Convertir el oráculo de "respuesta exacta" en una **rúbrica de propiedades** verificable.
3. Construir un **dataset de evals versionado**, segmentado por slice de riesgo.
4. Meter un **gate en CI** cuyo umbral vive en un ADR, con dueño, excepción, fecha de revisión y **rollback**.
5. Triar una regresión sin atribuir causalidad sin evidencia.

---

## 1. El problema: la demo que convenció y el ticket que no debió existir

Una demo salió perfecta. El asistente explicó cómo correr la suite de regresión, citó el runbook y sonó experto. Dos semanas después, un compañero preguntó lo mismo con otras palabras y recibió un comando que **no existe**, presentado con la misma seguridad.

No hubo error de red. No hubo excepción. No hubo un test en rojo. El sistema hizo exactamente aquello para lo que está construido: **generar texto plausible**. Lo que faltó no fue un modelo mejor. Faltó un **sistema de evaluación**.

Este artículo trata de construir ese sistema: un proceso **explícito, versionado, segmentado por riesgo y repetible** que permita afirmar —con evidencia— si una versión del asistente puede salir a producción, y revertirla cuando no.

> **Cinco registros que no hay que mezclar.** A lo largo de la colección distingo: *hecho citado* (lo respalda una fuente primaria), *inferencia* (se deduce de hechos), *decisión de diseño* (una elección nuestra, reversible), *resultado experimental* (sale de ejecutar algo — en este artículo **no reporto ninguno**) y *opinión* (juicio profesional). Confundirlos es la primera falla de calidad, y es la más común en el discurso sobre IA.

---

## 2. Prerrequisitos

Deberías estar cómodo con:

- **Testing de software:** hipótesis, **oráculo** (cómo decidís si un resultado es correcto), datos de prueba, regresión, observabilidad y CI/CD.
- **Fundamentos de LLM:** tokens, ventana de contexto, instrucciones, salida estructurada, **no determinismo** y límites de conocimiento.
- **RAG a nivel conceptual:** ingestión → fragmentación → embedding → recuperación → contexto → generación. Lo profundizamos en el [satélite de RAG](/blog/rag-evaluacion-recuperacion-citas-abstencion/).
- **Privacidad y secretos:** control de acceso, trazabilidad y minimización de datos.
- **Riesgo de automatización:** una recomendación de bajo impacto **no** se gobierna igual que una acción que afecta una transferencia.

### 2.1 Tres cosas distintas que la gente llama "evaluar IA"

| | Qué mide | Quién la usa | Qué **no** te dice |
|---|---|---|---|
| **Evaluación de modelo** | Capacidad general de un modelo (benchmarks públicos) | Quien elige proveedor | Nada sobre *tu* corpus, *tu* prompt y *tus* usuarios |
| **Evaluación de aplicación** | Comportamiento del sistema completo en *tus* casos | El equipo de producto/QE | Qué pasa con tráfico real no visto |
| **Monitoreo de producción** | Comportamiento observado en vivo | Operación | Qué habría pasado con la versión alternativa |

Los tres son necesarios y **ninguno sustituye a otro**. Presentar un benchmark público como prueba de desempeño en el caso Nexo sería un error de categoría.

---

## 3. Glosario mínimo (compartido por la colección)

- **Eval:** procedimiento repetible que mide un comportamiento del sistema frente a un dataset y un criterio explícito. No es un test unitario ni un número de marketing.
- **Benchmark:** dataset o leaderboard público y estandarizado. Sirve para comparar modelos *en general*; **no** prueba desempeño en tu caso.
- **Golden set / respuesta de oro:** conjunto de casos con respuesta de referencia. Útil cuando existe una respuesta correcta; tóxico cuando hay muchas válidas.
- **Grader:** lo que puntúa una respuesta. Puede ser **determinista** (regla, parser, comparación) o un **juez LLM**.
- **Juez LLM:** un modelo que evalúa las salidas de otro. Falible; debe **calibrarse contra personas**.
- **Evaluación humana:** revisión por personas con una rúbrica. Es el oráculo de referencia cuando no hay uno determinista.
- **Red teaming:** búsqueda adversarial, estructurada y *autorizada*, de fallos de seguridad y política. Ver el [satélite de seguridad](/blog/seguridad-asistentes-llm-rag-prompt-injection/).
- **Prompt injection:** entrada —del usuario o de un documento recuperado— que altera el comportamiento previsto.
- **Groundedness:** grado en que la respuesta se apoya en el contexto recuperado. **No es sinónimo de verdad.**
- **Abstención:** que el sistema responda "no puedo con la información disponible" cuando corresponde. A veces es la respuesta *correcta*.
- **Slice:** segmento del dataset (por intención, riesgo, idioma, tipo de documento) que se mide **por separado**.
- **Drift:** cambio de comportamiento entre versiones de modelo, prompt, corpus, recuperador o herramientas.
- **Trazabilidad:** poder reconstruir qué dataset, commit, versiones, configuración, evaluador y fecha produjeron un resultado.
- **Error budget:** cuánto comportamiento fuera de objetivo se tolera antes de frenar cambios. Concepto tomado de SRE, aplicado **por slice**.

> Ningún término de marketing ("seguro por diseño", "sin alucinaciones", "alineado") entra en este glosario como medida objetiva, porque no lo es.

---

## 4. Qué cambia cuando la salida no es completamente determinista

En testing clásico asumimos un oráculo estable: `assert suma(2, 2) == 4`. Con un LLM, la misma entrada puede producir salidas distintas y, peor todavía para nuestros hábitos, **muchas de esas salidas pueden ser igualmente válidas**: "corré la suite con el target de regresión del Makefile" y "ejecutá `make regression`" dicen lo mismo.

Esto rompe tres supuestos del testing tradicional:

1. **El oráculo deja de ser una igualdad.** Pasa a ser una **rúbrica sobre propiedades**: ¿cita una fuente permitida? ¿evita inventar un comando? ¿mantiene el tono? ¿se abstiene si no hay información suficiente?
2. **Un caso ya no basta.** Necesitás una **distribución** de casos por slice y medir **tasas**, no anécdotas. Una corrida verde no es evidencia; una tasa con tamaño de muestra sí.
3. **El sistema es mucho más grande que el modelo.** Cambian el prompt, el corpus, el recuperador, las herramientas y la política de salida. Cada uno es una **versión** que puede degradar la calidad de forma independiente.

> **Decisión de diseño de Nexo.** Fijamos temperatura baja y salida estructurada para reducir varianza, pero **no** asumimos determinismo. Seguimos midiendo por tasas y guardamos la semilla y la configuración de cada corrida para trazabilidad. Bajar la temperatura reduce la varianza; **no** convierte al sistema en determinista ni elimina la confabulación.

---

## 5. Arquitectura del sistema completo (no solo "el modelo")

<figure class="diagram">
  <img src="/blog/diagrams/evaluacion-continua-sistemas-ia-quality-engineering-1.svg" width="1754" height="224" alt="Diagrama: evaluacion-continua-sistemas-ia-quality-engineering (1)" loading="lazy" decoding="async" />
</figure>

Cada caja es simultáneamente **una superficie de fallo** y **una superficie de versión**. Evaluar "el modelo" ignora que la política de entrada, el recuperador y el manejo de la salida producen buena parte de los incidentes reales.

El marco de referencia para estructurar estos riesgos es el [NIST AI Risk Management Framework](https://www.nist.gov/itl/ai-risk-management-framework) (v1.0, enero 2023) y, específicamente para IA generativa, su [Generative AI Profile, NIST AI 600-1](https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.600-1.pdf) (publicado el 26 de julio de 2024), que enumera categorías de riesgo propias o exacerbadas por GAI —entre ellas la **confabulación**: contenido seguro en tono pero falso en sustancia— y prácticas sugeridas para gestionarlas.

Para el ciclo de vida del software que rodea a esto, la referencia es el [NIST Secure Software Development Framework, SP 800-218](https://csrc.nist.gov/pubs/sp/800/218/final) (v1.1) con su perfil comunitario para IA generativa, [SP 800-218A](https://csrc.nist.gov/pubs/sp/800/218/a/final) (final, julio 2024).

### 5.1 El ciclo de evaluación: por qué no termina en verde

La arquitectura de arriba describe **el sistema**. Este otro diagrama describe **el proceso** que lo mantiene honesto, y es la columna vertebral del resto del artículo:

<figure class="diagram">
  <img src="/blog/diagrams/evaluacion-continua-sistemas-ia-quality-engineering-2.svg" width="1245" height="98" alt="Diagrama: evaluacion-continua-sistemas-ia-quality-engineering (2)" loading="lazy" decoding="async" />
</figure>

Leelo como un ciclo, no como una tubería. Dos consecuencias que casi siempre se pasan por alto:

1. **El ciclo no termina con una ejecución exitosa.** La flecha `M --> H` no es decorativa: el monitoreo de producción **genera hipótesis nuevas**. Una corrida verde significa "no encontré los fallos que sé buscar", no "no hay fallos". Un equipo que despliega y cierra el ticket rompió el ciclo en la flecha más importante.
2. **Cada flecha debe conservar versión, fecha y evidencia.** Si pasás de `E` a `R` sin registrar qué dataset y qué versiones produjeron ese resultado, la revisión humana está juzgando un artefacto irrepetible. Si pasás de `R` a `G` sin registrar quién revisó y cuándo, la decisión de gate no es auditable. La trazabilidad no es un extra al final: vive **en las flechas**.

Las secciones que siguen recorren el ciclo en orden: hipótesis y dataset (§7), evaluación y graders (§8-9), revisión humana (§9), gate (§10) y monitoreo con drift (§11).

---

## 6. Riesgo y propósito: el contrato antes que el modelo

Antes de elegir modelo, definimos **qué puede hacer el sistema, qué debe rechazar y cuándo escalar a una persona**. Esto es un contrato ejecutable, no una declaración de intenciones.

### Contrato de propósito y política (datos sintéticos)

| Intención permitida | Intención denegada | Evidencia requerida | Acción del sistema | Ruta de escalamiento |
|---|---|---|---|---|
| Explicar cómo correr una suite y citar el runbook | Ejecutar una transferencia o "mover dinero" | Fuente permitida citada | Responder con cita | — |
| Resumir un ADR de QA sintético | Revelar el system prompt o cualquier secreto | ADR dentro del corpus permitido | Responder con cita | — |
| Aclarar un paso de un journey de transferencias (informativo) | Decidir un crédito o dar consejo financiero personalizado | Contexto suficiente | Responder, o pedir aclaración | Canal de soporte ficticio |
| — | Solicitud fuera de alcance o sin contexto suficiente | Insuficiente | **Abstención** + enlace a soporte | Persona de guardia |

> **Por qué esto es criterio senior, y no burocracia.** El nivel de gobierno se decide por **impacto**, no por vistosidad. Nexo Quality Coach es **de solo lectura por diseño**, y esa restricción arquitectónica elimina de raíz la categoría de riesgo más cara: el **exceso de agencia** (`LLM06:2025` en la taxonomía de OWASP, ver el [satélite de seguridad](/blog/seguridad-asistentes-llm-rag-prompt-injection/)). Ningún prompt defiende tan bien como una capacidad que no existe.

---

## 7. Fundamentos de evaluación

Una eval empieza por una **hipótesis de calidad falsable**:

> *"En el slice `documentacion_operativa`, el asistente cita una fuente permitida en al menos el umbral acordado en ADR-014 y nunca inventa un comando."*

Sin hipótesis, medís ruido y lo llamás resultado.

### 7.1 El registro de eval versionado

Nótese lo que **no** hay: una "respuesta exacta" como único oráculo. Hay comportamiento esperado, fuentes permitidas y prohibiciones duras.

```json
{
  "id": "rag-citas-001",
  "input": "Como ejecuto la suite de regresion?",
  "expected_behavior": "explica el comando y cita el runbook sintetico",
  "risk_slice": "documentacion_operativa",
  "allowed_sources": ["runbook-regresion-v3"],
  "must_not": ["inventar un comando", "pedir secretos"],
  "rubric_ref": "rubrics/operativa.md#v2",
  "dataset_version": "release-slice@v7"
}
```

Bloque por bloque:

- `risk_slice` habilita medir **por segmento** y fijar umbrales distintos según impacto.
- `allowed_sources` define qué cuenta como *fundamentado*. Sin esta lista, "citó algo" no significa nada.
- `must_not` son **restricciones duras** que un grader **determinista** verifica *antes* de invocar cualquier juez LLM. Son baratas, rápidas y explicables.
- `rubric_ref` y `dataset_version` son trazabilidad: sin ellas no podés reproducir ni comparar.

### 7.2 Línea de base y orden de los graders

- **Baseline:** la versión hoy en producción. Toda comparación es *contra* la baseline, nunca contra el vacío.
- **Orden de graders:** primero reglas deterministas (¿cita una fuente permitida?, ¿aparece un comando fuera de la lista sintética conocida?); después, y solo si hace falta, un juez LLM para lo genuinamente subjetivo (tono, suficiencia).

Invertir ese orden es caro y opaco: pagás inferencia para responder preguntas que resolvía un `if`.

---

## 8. Taxonomía de evals

No se mide todo junto. Cada familia tiene dataset, grader y umbral propios:

| Familia | Pregunta que responde | Grader típico | Dónde se profundiza |
|---|---|---|---|
| **Funcional** | ¿Responde la intención permitida? | Rúbrica + juez calibrado | Este artículo |
| **Recuperación y citas** | ¿El contexto alcanza y las citas son válidas? | Determinista + humano | [Satélite de RAG](/blog/rag-evaluacion-recuperacion-citas-abstencion/) |
| **Seguridad y política** | ¿Resiste injection, fuga, abuso de herramientas? | Determinista (sí/no) | [Satélite de seguridad](/blog/seguridad-asistentes-llm-rag-prompt-injection/) |
| **Confiabilidad, latencia y costo** | ¿Disponible, dentro de latencia, a costo aceptable? | Métrico | Este artículo |
| **Abstención** | ¿Se abstiene cuando debe y responde cuando puede? | Determinista + humano | [Satélite de RAG](/blog/rag-evaluacion-recuperacion-citas-abstencion/) |
| **Evaluación humana** | ¿Coinciden nuestros graders con las personas? | Personas + rúbrica | Este artículo |

---

## 9. El juez LLM: útil, pero falible por diseño

Un juez LLM escala la evaluación de propiedades subjetivas. También **es parte del sistema a evaluar**. Tiene sesgos documentables (tiende a premiar respuestas largas y tono seguro) y comete errores **correlacionados** con los del modelo evaluado: si ambos comparten familia y datos de entrenamiento, el juez puede validar precisamente el error que el modelo comete.

> **Regla de Nexo (decisión de diseño).** Ningún juez LLM entra en un gate sin un **plan de calibración**: una muestra de casos revisada por personas y una métrica explícita de **desacuerdo grader-humano**. Si el desacuerdo supera el umbral de ADR-014, el juez **no gobierna**: se degrada a triaje, es decir, solo decide qué va a revisión humana.

Esta es la diferencia entre usar un juez LLM y **delegarle** la decisión de calidad. Lo primero es ingeniería; lo segundo es fe.

### 9.1 Harness de evaluación

```python
# Ilustrativo. NO es codigo listo para produccion. Supone Python 3.12.
result = assistant.answer(case.input, context=case.allowed_sources)

# 1) Reglas deterministas primero: baratas, rapidas, explicables.
assert has_only_allowed_citations(result, case.allowed_sources)
assert violates_policy(result, case.must_not) is False

# 2) Solo entonces, el grader subjetivo (juez LLM calibrado, o persona).
score = rubric_score(case.expected_behavior, result)

# 3) Evidencia minimizada + trazabilidad de TODAS las versiones.
record(
    case_id=case.id, score=score,
    model_version=cfg.model, prompt_version=cfg.prompt,
    corpus_version=cfg.corpus, retriever_version=cfg.retriever,
    seed=cfg.seed, evaluator=cfg.evaluator, ts=now(),
)

# 4) Desacuerdo o baja confianza -> cola de revision humana.
if grader_uncertain(score) or disagreement(score, prior_human_label):
    enqueue_human_review(case.id, redact(result))
```

`redact()` no es cosmético: es la política de minimización. Guardamos lo necesario para reproducir el caso, **no** PII ni secretos. Registrar prompts, respuestas y trazas sin política de minimización y retención convierte al sistema de evaluación en una nueva superficie de fuga.

---

## 10. Evals en CI: gate explicable, canary y rollback

La regresión se vuelve accionable cuando corre en CI con una **muestra fija** del dataset, un **reporte por slice** y umbrales con **dueño**.

```yaml
# Ilustrativo. Adaptar al CI de tu equipo (GitLab CI, GitHub Actions, otro).
ai_regression_eval:
  stage: verify
  script:
    - python evals/run.py --dataset evals/release-slice.jsonl
    - python evals/check_gate.py --policy docs/adr/ADR-014-evals.md
  artifacts:
    when: always            # la evidencia se publica tambien cuando falla
    paths:
      - reports/evals/      # reporte por slice + trazabilidad de versiones
```

Fijate en lo que **no** está: no hay un número mágico hardcodeado en el pipeline. El umbral vive en `ADR-014`, versionado, con dueño y fecha de revisión. Un umbral incrustado en un YAML es un umbral que nadie puede defender ni cambiar sin arqueología de git.

### 10.1 Evidencia reproducible (y honesta)

- **Prerrequisitos:** Python 3.12; dataset `release-slice.jsonl@v7`; configuración con `model`, `prompt`, `corpus` y `retriever` fijados por versión.
- **Resultado esperado:** un directorio `reports/evals/` con tasa por slice y trazabilidad, y un *exit code* distinto de cero si algún slice de alto riesgo cae por debajo de su umbral.
- **Limitación declarada:** en este artículo **no ejecuté** el pipeline. No muestro números, tasas, cobertura ni capturas, porque no los tengo. Cualquier métrica concreta debe salir de **tu** corrida y quedar como artefacto versionado.

### 10.2 Canary y rollback

- **Canary:** liberar la versión nueva a un porcentaje pequeño del tráfico y comparar **por slice** contra la baseline antes de ampliar.
- **Rollback:** una condición explícita y automática —por ejemplo, una violación de política en un slice sensible— que revierte a la versión anterior sin discusión.

> Un gate **sin** rollback es teatro. Detecta el problema y no hace nada con él.

---

## 11. Métricas por slice, incertidumbre y decisión de lanzamiento

Un **promedio global puede esconder daño**. Subir dos puntos en la métrica general mientras el slice `journey_transferencias` empeora **es una regresión**, no una mejora, por más que el número grande sea verde.

Métricas mínimas, **cada una con definición, segmento y limitación**:

- **Tasa de comportamiento correcto** por intención y por nivel de riesgo, con tamaño de muestra declarado.
- **Tasa de respuestas fundamentadas** en fuentes permitidas y **tasa de citas inválidas**.
- **Precisión y recall de recuperación**, *solo* si existe un conjunto etiquetado y una definición explícita de relevancia. Si no lo tenés, no lo reportes.
- **Abstención apropiada** y **abstención indebida**: son **dos métricas distintas**, nunca una sola.
- **Violaciones de política** y cobertura de casos adversariales seguros.
- **Desacuerdo entre grader automático y evaluación humana**, con plan de calibración.
- **Latencia, disponibilidad y costo por interacción**, con contexto de carga.
- **Drift** entre versiones de modelo, prompt, corpus, recuperador y herramientas.
- **Trazabilidad por ejecución:** dataset, commit, versiones, configuración, evaluador y fecha.

### 11.1 Incertidumbre: la parte que casi todos se saltean

Cuando compares dos versiones, mostrá **intervalo de incertidumbre o tamaño de muestra**. Una diferencia de dos puntos sobre cuarenta casos no es una mejora: es ruido con buena prensa. Si no podés distinguir la señal del ruido con tu tamaño de muestra actual, la decisión honesta es **agrandar la muestra o no decidir**, no redondear a favor.

> **No propongas un quality gate sin:** dueño, justificación (ADR), mecanismo de excepción, fecha de revisión y rollback. Los cinco. Faltando uno, el gate se vuelve inaplicable o ingobernable.

---

## 12. Triage de una regresión: plausible pero no fundamentada

### Ficha de incidente de calidad (sintética)

| Campo | Contenido |
|---|---|
| **Síntoma** | Ante "¿cómo reejecuto solo los tests fallidos?", el asistente respondió con un flag inexistente, con tono seguro y **sin cita**. |
| **Impacto potencial** | Un colega pierde tiempo con un comando inválido; erosión de confianza en la herramienta. Impacto bajo (sistema de solo lectura), **no** financiero. |
| **Causa probable (clasificada, NO confirmada)** | *Hipótesis:* un cambio de `corpus_version` dejó el runbook fuera del índice → recuperación vacía → generación sin apoyo. **Pendiente de evidencia.** |
| **Evidencia** | Traza `run-4821`: `retriever_hits=0`, `citations=[]`, `abstuvo=false`. |
| **Corrección** | Reindexar corpus. Y una **regla dura**: si `retriever_hits == 0` en un slice operativo → **abstención**, no generación. |
| **Regresión** | Nuevo caso `rag-abstencion-014` incorporado a `release-slice.jsonl`. |
| **Owner / revisión** | QE de guardia; revisar en la próxima release. |

La lección del incidente no es "el modelo alucinó". Es que **el sistema generó sin contexto y no se abstuvo**. La corrección, por lo tanto, es una **regla del sistema más un caso de regresión**, no "un prompt mejor". Notá también que la causa está marcada como *hipótesis*: `retriever_hits=0` es consistente con esa explicación, pero no la prueba por sí solo.

---

## 13. Antipatrones y *governance theater*

Para cada uno: causa → riesgo → señal de detección → alternativa.

**1. Aceptar una demo como evaluación.** *Causa:* presión por mostrar avance. *Riesgo:* cero garantía en producción. *Señal:* no existe dataset ni tasas, solo capturas. *Alternativa:* eval versionada con reporte por slice.

**2. Una única respuesta de oro para problemas con múltiples respuestas válidas.** *Riesgo:* penalizás respuestas correctas y optimizás hacia la redacción, no hacia la verdad. *Señal:* falsos negativos altos, el equipo "arregla" el dataset. *Alternativa:* rúbrica de propiedades.

**3. Juez LLM sin calibrar contra personas.** *Riesgo:* estás midiendo el sesgo del juez. *Señal:* nadie sabe cuál es el desacuerdo grader-humano. *Alternativa:* muestreo humano y métrica de desacuerdo publicada.

**4. Cambiar modelo, prompt, corpus y herramienta a la vez.** *Riesgo:* no podés atribuir la regresión a nada. *Señal:* diffs enormes sin versionado por componente. *Alternativa:* una variable por vez, cada componente versionado.

**5. Usar datos reales o sensibles "para hacerlo más realista".** *Riesgo:* la propia evaluación se convierte en una fuga de PII. *Señal:* nadie sabe qué retiene el sistema de trazas. *Alternativa:* datos sintéticos y canarios sintéticos.

**6. Medir solo el promedio.** *Riesgo:* ocultás deterioro en el slice de mayor riesgo. *Señal:* el reporte tiene un número grande y verde. *Alternativa:* reporte por slice, con umbral propio por nivel de impacto.

**7. Asumir que RAG elimina alucinaciones, inyección o la necesidad de citar.** *Riesgo:* confianza infundada en respuestas citadas pero falsas o desactualizadas. *Alternativa:* medir groundedness **y vigencia** ([satélite de RAG](/blog/rag-evaluacion-recuperacion-citas-abstencion/)).

**8. Dejar que el asistente ejecute acciones de alto impacto sin autorización verificable.** *Riesgo:* exceso de agencia. *Alternativa:* no otorgar la capacidad; si es imprescindible, autorización humana verificable fuera del canal del modelo.

**9. Registrar prompts, respuestas y trazas sin minimización ni retención.** *Riesgo:* el sistema de calidad se vuelve la brecha. *Alternativa:* `redact()` + política de retención con fecha.

**10. Declarar "segura" una aplicación porque bloqueó algunos prompts adversariales.** *Riesgo:* falsa confianza; N casos bloqueados no dicen nada sobre el caso N+1. *Alternativa:* regresión (lo conocido) **más** red teaming (lo nuevo).

**11. No versionar datasets, políticas ni configuraciones de evaluación.** *Riesgo:* resultados irreproducibles; imposible saber si mejoraste. *Alternativa:* todo bajo control de versiones, con `dataset_version` en cada registro.

### 13.1 *Governance theater*

Es el antipatrón que engloba a los demás: documentos, comités y checklists que **parecen** gobierno pero no frenan nada.

**Señales de detección:** gates que nunca fallan; umbrales sin dueño; ADRs sin fecha de revisión; excepciones que se otorgan verbalmente; un dashboard que nadie mira antes de desplegar.

**Alternativa:** un gate que efectivamente bloqueó un merge al menos una vez y tiene el rollback probado; excepciones **registradas por escrito** con vencimiento; y una auditoría periódica de decisiones tomadas contra evidencia.

### 13.2 Cómo comunicar límites a producto

No digas "el asistente es preciso". Decí: *"En el slice `documentacion_operativa`, sobre N casos sintéticos, la tasa de respuestas fundamentadas fue X con un intervalo de Y; no tenemos evidencia sobre preguntas fuera de ese slice; el sistema se abstiene ante contexto insuficiente; y esto no cubre tráfico adversarial no visto."* Es más largo, es menos vendible, y es lo único defendible.

---

## 14. Plan incremental de 30 días para un equipo QA/SDET

- **Semana 1 — Propósito y riesgo.** Escribir el contrato de propósito y política (§6). Definir slices por intención y nivel de riesgo. *Entregable:* borrador de `ADR-014`.
- **Semana 2 — Dataset y oráculo.** Entre 30 y 50 casos JSONL sintéticos por slice, con rúbricas. Reglas deterministas para los `must_not`. *Entregable:* `evals/release-slice.jsonl@v1`.
- **Semana 3 — Harness y CI.** Harness que fija versiones y minimiza evidencia; gate en CI que lee umbrales del ADR; reporte por slice. *Entregable:* pipeline `ai_regression_eval`.
- **Semana 4 — Humano en el loop y monitoreo.** Cola de revisión, métrica de desacuerdo grader-humano, canary con rollback, vista de trazabilidad. *Entregable:* runbook de regresiones de IA.

Cada entregable es **reversible y con dueño**. El objetivo de los 30 días no es "conectar un modelo": es tener **evidencia repetible** para decidir si se lanza o no.

---

## 15. Conexión con Nexo Finanzas (portfolio)

- **`nexo-quality-coach`** — el asistente sintético, de solo lectura, con el contrato de propósito de §6 y el corpus versionado.
- **`nexo-quality-platform`** — hospeda el gate explicable de §10, sin secretos ni datos reales.
- **`nexo-quality-control-tower`** — vista de trazabilidad: caso → versión → resultado → revisión humana → decisión.
- **`ADR-014`** — justifica umbrales, dueños, excepciones, fecha de revisión y rollback.
- **`CONTRIBUTING.md`** — cómo agregar un caso sin degradar la evidencia (slice obligatorio, rúbrica referenciada, revisión previa).

Los artefactos de referencia están en [`artefactos/`](./artefactos/) de esta colección, y el plan completo en **IMPLEMENTACION-GITHUB.md**.

> **Qué demuestra criterio senior aquí.** No es haber conectado un modelo. Es: límites explícitos, decisiones reversibles, ownership nominado, evidencia reproducible, aprendizaje compartido y priorización por riesgo. Un asistente de solo lectura, bien gobernado, dice más de tu criterio profesional que un agente autónomo sin evals.

---

## 16. Qué aprendimos y próximos pasos

- La calidad de un producto con IA es una **propiedad del sistema**, no del modelo.
- El oráculo es una **rúbrica de propiedades**; el promedio miente; el gate necesita **dueño y rollback**.
- El juez LLM ayuda, pero **se calibra**; el dataset, las políticas y la configuración **se versionan**.
- Una evaluación exitosa **no cierra el ciclo**: alimenta la siguiente hipótesis.

**Seguí con la colección:**

1. **[Seguridad de asistentes LLM/RAG: prompt injection, fuga de datos y abuso de herramientas](/blog/seguridad-asistentes-llm-rag-prompt-injection/)** — la rama de seguridad del diagrama de arquitectura, en profundidad, con la taxonomía OWASP 2025.
2. **[RAG bajo evaluación: recuperación, citas verificables y el derecho a abstenerse](/blog/rag-evaluacion-recuperacion-citas-abstencion/)** — por qué una cita no vuelve verdadera una respuesta y cómo medir la abstención en sus dos caras.

---

## 17. Checklist final

- [ ] Contrato de propósito con acciones de alto impacto **prohibidas explícitamente**.
- [ ] Slices definidos por intención y **nivel de riesgo**, no por conveniencia.
- [ ] Dataset JSONL versionado; oráculo = rúbrica, no respuesta única.
- [ ] Reglas deterministas para los `must_not`, **antes** de cualquier juez LLM.
- [ ] Juez LLM con plan de calibración y métrica de desacuerdo publicada.
- [ ] Gate en CI con umbral en el ADR, reporte por slice, canary y **rollback probado**.
- [ ] Métricas por slice con tamaño de muestra o intervalo de incertidumbre.
- [ ] Trazabilidad por corrida: dataset, commit, versiones, evaluador, fecha.
- [ ] Sin PII ni secretos; evidencia minimizada con política de retención.
- [ ] Ninguna afirmación de "seguro", "imparcial", "preciso" o "conforme" sin evidencia y alcance.

---

## Fuentes y fecha de verificación

Todas verificadas el **2026-07-09**.

- NIST, [AI Risk Management Framework](https://www.nist.gov/itl/ai-risk-management-framework) — v1.0 (enero 2023), vigente.
- NIST, [AI RMF: Generative AI Profile — NIST AI 600-1](https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.600-1.pdf) — publicado 2024-07-26.
- NIST, [AI Resource Center](https://airc.nist.gov/).
- NIST, [Secure Software Development Framework, SP 800-218](https://csrc.nist.gov/pubs/sp/800/218/final) (v1.1) y [SP 800-218A](https://csrc.nist.gov/pubs/sp/800/218/a/final) (perfil GenAI, final).
- ISO/IEC, [42001:2023 — Sistema de gestión de IA](https://www.iso.org/standard/42001) — ficha oficial. Norma de pago: **no se infiere su contenido** en este artículo.
- OpenAI, [Working with evals](https://developers.openai.com/api/docs/guides/evals) — citado **solo como ejemplo de plataforma de proveedor**. Advertencia verificada: la plataforma Evals está en deprecación (solo lectura desde 2026-10-31, cierre previsto 2026-11-30). Razón adicional para mantener las evals en formatos abiertos y portables.

