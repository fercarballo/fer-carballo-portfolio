---
title: "Métricas y trazabilidad de calidad sin castigar personas"
description: "Métricas de Quality Engineering con definición, numerador, denominador, ventana y sesgo: cobertura por riesgo, feedback, flakiness y trazabilidad."
pubDate: 2026-07-09
tags: ["quality-metrics", "traceability", "goodhart", "slo", "sdet"]
cluster: "01"
clusterTitle: "Arquitectura de Quality Engineering"
type: "satelite"
order: 4
icon: "shield"
iconHue: 152
readingLevel: "Intermedio–Avanzado"
prerequisites: "Conviene leer antes el artículo pilar de arquitectura de QE."
---
> Artículo **satélite** de la colección. El marco general está en **[Arquitectura de Quality Engineering orientada a riesgo](/blog/arquitectura-quality-engineering-orientada-a-riesgo/)** (§8 y §11). Acá respondemos una pregunta con profundidad: **¿qué medimos para decidir, cómo lo definimos con honestidad, y cómo evitamos que la métrica se vuelva un instrumento de miedo?**

> **Convención de honestidad.** Distingo **hecho citado**, **decisión de diseño**, **hipótesis** y **ejemplo ficticio** (*Nexo Finanzas*, fintech inventada, datos sintéticos). **No presento ninguna métrica como resultado real**: donde no hay medición, va una plantilla vacía.

---

## 1. El problema: la métrica que se volvió el objetivo

En una retro de *Nexo Finanzas* (ficticio), alguien propone: *"pongamos como meta 90 % de automatización y midamos casos por sprint por persona"*. Suena a rigor. Seis semanas después, hay 400 casos nuevos, casi todos triviales, muchos duplicados, y el bug de duplicación de transferencias sigue sin control. ¿Qué pasó?

Pasó la **ley de Goodhart**, popularizada por la antropóloga Marilyn Strathern como *"cuando una medida se convierte en objetivo, deja de ser una buena medida"*. Al fijar "cantidad de casos" como meta individual, la gente optimizó el número —racionalmente— y no el riesgo. La métrica dejó de informar y empezó a distorsionar.

> **Tesis del artículo.** Las métricas de calidad sirven para **decidir sobre el sistema**, no para **rankear personas**. Una métrica bien definida responde una pregunta de diseño; una métrica mal usada produce el comportamiento que aparenta medir.

---

## 2. Antes de seguir: glosario mínimo

- **Numerador / denominador.** Toda tasa es una fracción; sin decir el denominador, un porcentaje no significa nada.
- **Ventana temporal.** El período sobre el que se calcula (últimos 30 días, últimas 200 corridas). Cambiar la ventana cambia el número.
- **Percentil (p50, p95).** p50 = mediana; p95 = valor bajo el cual está el 95 % de los casos. Los promedios esconden la cola; los percentiles la muestran.
- **Sesgo.** Distorsión sistemática de la medición (p. ej. contar solo lo que es fácil de contar).
- **SLI / SLO / SLA.** Indicador / objetivo / contrato de nivel de servicio ([Google SRE Book](https://sre.google/sre-book/service-level-objectives/), consultado 2026-07-09).
- **Goodhart.** Cuando una medida se vuelve objetivo, se degrada como medida.

---

## 3. Cómo definir una métrica con honestidad

Antes de cualquier número, exijo seis campos. Si falta uno, la métrica no está lista para usarse en una decisión:

1. **Pregunta que responde** (¿para qué decisión sirve?).
2. **Numerador** (qué contamos).
3. **Denominador** (sobre qué total).
4. **Ventana** (qué período/muestra).
5. **Sesgo conocido** (qué distorsiona este número).
6. **Uso de decisión** (qué hacemos distinto según el valor) — y explícitamente, **qué NO se hace** (rankear personas).

Usaremos esta plantilla para cada métrica siguiente. Y una regla dura: **si no la medimos, la celda de valor va vacía.** No hay "≈ 90 %" inventados en este artículo.

---

## 4. Cobertura ponderada por riesgo (no cobertura de líneas)

- **Pregunta:** ¿qué proporción de nuestros riesgos críticos tiene al menos un control con evidencia vigente?
- **Numerador:** riesgos críticos con ≥1 control cuya última evidencia está dentro de la ventana de validez.
- **Denominador:** total de riesgos críticos declarados en el `risk-register.yml`.
- **Ventana:** evidencia considerada "vigente" si es de las últimas N ejecuciones o M días (definir localmente).
- **Sesgo:** depende de que el registro de riesgos esté completo. Un riesgo no declarado no baja este número, aunque sea el más peligroso. Por eso la métrica **no** sustituye la revisión del mapa de riesgo.
- **Uso de decisión:** si un riesgo crítico queda sin evidencia vigente, es señal de bloqueo o de priorización; **no** es un dato para evaluar a una persona.
- **Valor:** *(plantilla — completar con medición real: fecha, muestra, registro consultado).*

**Por qué esta métrica y no cobertura de líneas.** La cobertura de líneas cuenta *código ejecutado*; puede ser 92 % y no tocar el reintento que duplica una transferencia (el caso del pilar). La cobertura ponderada por riesgo cuenta *riesgos con evidencia*, que es lo que importa para una decisión de release. *Hecho conceptual:* son métricas de cosas distintas; una alta cobertura de líneas **no** implica alta cobertura de riesgo.

---

## 5. Tiempo de feedback (p50 y p95, por etapa)

- **Pregunta:** ¿cuánto tarda un cambio en producir la señal relevante?
- **Numerador/serie:** tiempos desde el push hasta el resultado de cada etapa (PR, integración, nightly).
- **Denominador:** todas las ejecuciones de la etapa en la ventana.
- **Ventana:** últimos 30 días, por ejemplo.
- **Sesgo:** mezclar etapas arruina el número. Un nightly de performance de 40 min y un check de PR de 3 min promediados dan una mentira. **Separá siempre por etapa** y reportá p50 **y** p95 (la cola es donde vive la frustración).
- **Uso de decisión:** si el p95 del check de PR crece, es señal de invertir en paralelización o en mover controles de capa; **no** es un dato sobre "quién commiteó lento".
- **Valor:** *(plantilla por etapa — completar con medición: p50 y p95, fecha, muestra).*

**Por qué percentiles.** El [SRE Book](https://sre.google/sre-book/service-level-objectives/) insiste en esto para servicios, y aplica igual al pipeline: el promedio oculta que un 5 % de las corridas tarda muchísimo. Ese 5 % es el que hace que la gente deje de esperar el feedback y mergee "confiando".

---

## 6. Tasa de flakiness

- **Pregunta:** ¿qué proporción de nuestras señales es poco confiable?
- **Numerador:** ejecuciones que cambian de resultado **sin un cambio relevante comprobado**.
- **Denominador:** ejecuciones totales en la ventana.
- **Ventana:** últimas N corridas sobre el mismo commit base.
- **Sesgo:** la frase "sin cambio relevante" necesita una **definición local**. Si es laxa, subestimás el flaky; si es estricta, sobreestimás. Documentá tu definición.
- **Uso de decisión:** por encima del umbral (medido, no importado), un control va a cuarentena con dueño y fecha; y en el gate, dispara `review` (ver **[artículo de gates](/blog/quality-gates-proporcionales-al-riesgo/)**, §7). **No** se usa para señalar a quien escribió el test.
- **Valor:** *(plantilla — completar; no invento un porcentaje).*

**Anti-patrón asociado:** reintentar hasta el verde. Sube artificialmente la sensación de estabilidad y hunde este número real, escondiendo bugs. La alternativa es tratar el flaky como deuda visible, no como algo a silenciar con `retries`.

---

## 7. Confiabilidad del entorno

- **Pregunta:** ¿cuántos de nuestros fallos son culpa del ambiente/datos/dependencias, no del código bajo prueba?
- **Numerador:** fallos atribuibles a entorno/datos/dependencia **después de triage**.
- **Denominador:** ejecuciones totales en la ventana.
- **Ventana:** por ejemplo, últimos 30 días.
- **Sesgo:** requiere triage humano honesto; si se etiqueta todo como "ambiente" para no investigar, la métrica miente y encima esconde bugs. El triage es el punto débil: protegelo.
- **Uso de decisión:** un valor alto justifica invertir en aislamiento y entornos efímeros (ver **[datos y entornos](/blog/datos-y-entornos-de-prueba-reproducibles/)**). **No** evalúa personas.
- **Valor:** *(plantilla — completar tras triage; con fecha y muestra).*

**Relación con la confiabilidad total.** Flakiness (§6) y confiabilidad del entorno (§7) suelen solaparse: mucho flaky de ambiente es, en el fondo, un problema de datos/entornos. Medir ambos por separado ayuda a decidir *dónde* invertir: en el test o en el piso sobre el que corre.

---

## 8. Defectos escapados (con cautela extrema)

- **Pregunta:** ¿qué defectos llegaron a producción que nuestros controles deberían haber detectado?
- **Numerador:** defectos detectados en producción, de una severidad y período definidos, que un control existente debería haber atrapado.
- **Denominador:** difícil y honestamente ambiguo (¿por release? ¿por período? ¿por cambios?). Declaralo explícitamente.
- **Ventana:** período claro (p. ej. por trimestre), con severidad acotada.
- **Sesgo:** enorme. Depende de qué se reporta como defecto y de la atribución "debería haberlo atrapado". Es la métrica **más fácil de convertir en látigo** y la que más daño hace si se usa para evaluar personas: incentiva a *no* reportar.
- **Uso de decisión:** insumo para revisar el mapa de riesgo y el portafolio de controles (¿qué capa faltó?). **Nunca** para performance review individual.
- **Valor:** *(plantilla — completar con período, severidad y denominador explícito).*

> **Advertencia de diseño.** Si tu organización no puede prometer que "defectos escapados" no se usará contra individuos, es mejor **no** publicar esta métrica por persona ni por squad de forma comparativa. Una métrica que induce a ocultar información es peor que no tener la métrica.

---

## 9. SLO del journey (si hay telemetría suficiente)

- **Pregunta:** ¿el journey crítico cumple su objetivo de servicio para el usuario?
- **SLI (ejemplos para "transferencia a tercero"):** *éxito* (transferencias completadas sin error / iniciadas), *latencia* (p95 del tiempo de confirmación), *corrección* (transferencias sin duplicación ni reversa por defecto).
- **SLO:** objetivo para cada SLI (definido con Producto y Operaciones).
- **Sesgo:** requiere telemetría confiable ([OpenTelemetry](https://opentelemetry.io/docs/what-is-opentelemetry/), consultado 2026-07-09). Sin instrumentación, esto es aspiracional, no medible.
- **Uso de decisión:** un SLO en riesgo prioriza trabajo de calidad en ese journey. **No** rankea a nadie.
- **Valor:** *(plantilla — requiere telemetría; completar con SLI/SLO reales y su fuente).*

**Lección del pilar (§10):** medir *éxito, latencia y corrección* del journey, no "CPU" ni "porcentaje de tests verdes". El porcentaje de tests verdes es una métrica de tu proceso; el SLO del journey es una métrica de lo que el usuario experimenta. Las dos importan, pero no se confunden.

---

## 10. Trazabilidad: el hilo que conecta todo

Las métricas anteriores solo son auditables si podés seguir el hilo desde un requisito hasta la evidencia. Ese hilo es la **trazabilidad**, y su casa en el portfolio ficticio es `nexo-quality-control-tower`.

<figure class="diagram">
  <img src="/blog/diagrams/metricas-y-trazabilidad-de-calidad-1.svg" alt="Diagrama: metricas-y-trazabilidad-de-calidad (1)" loading="lazy" decoding="async" />
</figure>

**Lectura.** El valor no está en ninguna caja aislada sino en poder *recorrer el hilo* ante un incidente: *¿qué control debía atrapar esto? ¿corrió? ¿con qué datos? ¿qué decidimos y qué aprendimos?* La flecha `LE → RK` (aprendizaje que actualiza el riesgo) es la que convierte la trazabilidad en un sistema que mejora, no en un archivo muerto.

La tabla de trazabilidad mínima (del pilar, §12 Ejemplo C) tiene una regla de seguridad innegociable:

> **La trazabilidad guarda referencias e integridad (hashes, ids, URLs internas), nunca PII, secretos ni comprobantes reales.** Un `artifact_sha256` prueba que un reporte no fue alterado sin revelar su contenido. Campos como `pipeline_url` son internos y no deben exponerse públicamente. `data_set` siempre apunta a datos **sintéticos**.

**Decisión de diseño.** La trazabilidad vive **junto al código** (ids en los tests, artefactos en el CI), no en una herramienta paralela que hay que mantener a mano. Una planilla que alguien actualiza manualmente se desincroniza el primer día ocupado; los ids embebidos en el test y los artefactos generados por el pipeline no.

---

## 11. Baseline, contexto y revisión periódica

Tres reglas que evitan que las métricas mientan:

- **Baseline antes que umbral.** No fijes "el flaky debe ser < X" sin medir tu punto de partida. El umbral nace del baseline, no de un blog.
- **Contexto siempre.** Un número sin fecha, muestra y ventana no significa nada. Cada valor que publiques lleva *cuándo*, *sobre qué* y *con qué definición*.
- **Revisión periódica.** Las métricas caducan. Una que fue útil puede volverse Goodhart cuando el equipo aprende a jugarla. Revisá el *set* de métricas cada cierto tiempo y jubilá las que ya no informan.

> **Hipótesis honesta:** publicar métricas *de sistema* (no individuales) y revisarlas en equipo tiende a mejorar la conversación de calidad. Es coherente con la literatura de mejora de procesos y con mi experiencia, pero es una hipótesis sobre tu organización, no un hecho medido para vos.

---

## 12. Anti-patrones de métricas

1. **Métrica como objetivo individual.** *Síntoma:* metas de "casos por persona". *Impacto:* Goodhart; se optimiza el número, no el riesgo. *Alternativa:* métricas de sistema para decidir (§1, §3).
2. **Porcentaje sin denominador.** *Impacto:* números incomparables e inauditables. *Alternativa:* los seis campos del §3.
3. **Promedios donde importan las colas.** *Impacto:* se esconde el p95 doloroso. *Alternativa:* percentiles por etapa (§5).
4. **Cobertura de líneas como proxy de calidad.** *Impacto:* falsa seguridad. *Alternativa:* cobertura ponderada por riesgo (§4).
5. **"Defectos escapados" para evaluar personas.** *Impacto:* incentiva ocultar. *Alternativa:* usarlo para revisar controles, nunca para ranking (§8).
6. **Trazabilidad con PII/secretos/comprobantes.** *Impacto:* fuga. *Alternativa:* referencias e integridad, datos sintéticos (§10).
7. **Métricas sin fecha de revisión.** *Impacto:* números zombis que ya no informan. *Alternativa:* revisión periódica y jubilación (§11).

---

## 13. Conexión con Nexo Finanzas (ficticio)

- **`nexo-quality-control-tower`**: hogar de la trazabilidad y del cálculo de métricas. Sugerencia de estructura:

```
nexo-quality-control-tower/
  metrics/
    definitions.yml     # los 6 campos por métrica (pregunta, num, den, ventana, sesgo, uso)
    compute/            # scripts reproducibles; SALEN plantillas vacías si no hay datos
  traceability/
    schema.md           # campos permitidos y PROHIBIDOS (PII, secretos)
  docs/adr/
    0007-metrics-no-ranking.md   # ADR: las métricas no evalúan personas
```

**Artefactos mínimos a crear:**
- **`metrics/definitions.yml`**: cada métrica con sus seis campos del §3. Sin este archivo, cualquier número es folklore.
- **ADR "las métricas no rankean personas"**: hace explícito y revisable el compromiso del §8. Un compromiso no escrito no sobrevive a la primera presión de reporting.
- **`traceability/schema.md`**: la lista de campos permitidos y la lista negra (PII, secretos, comprobantes).

**Evidencia reproducible (procedimiento, sin resultados inventados):**

```bash
# Prerrequisitos: histórico de ejecuciones exportado (CSV/JSON) y definitions.yml.
# Entorno: python 3.11+; sin red.
python metrics/compute/feedback_time.py --stage pr --window 30d --input runs.csv
# Resultado esperado: p50 y p95 de la etapa PR en la ventana. Si el histórico está
# vacío o es insuficiente, el script debe DEVOLVER una plantilla vacía, no un número.
# Limitación: mide TU pipeline; los valores no son transferibles a otro contexto.
```

El comportamiento "si no hay datos, devolver plantilla vacía" es un requisito de diseño, no un detalle: encarna la regla de no inventar resultados.

---

## 14. Qué aprendimos y próximos pasos

- Las métricas de QE existen para decidir sobre el sistema, no para juzgar personas; usarlas como látigo las destruye (Goodhart).
- Toda métrica necesita seis campos: pregunta, numerador, denominador, ventana, sesgo y uso de decisión.
- Percentiles > promedios; cobertura de riesgo > cobertura de líneas.
- "Defectos escapados" es potente y peligrosa: nunca por persona.
- La trazabilidad conecta el hilo completo y guarda referencias, jamás PII ni secretos.
- Donde no hay medición, va una plantilla vacía. La honestidad sobre lo que no sabemos es parte de la evidencia.

**Enlaces internos:**
- Pilar: **[Arquitectura de Quality Engineering orientada a riesgo](/blog/arquitectura-quality-engineering-orientada-a-riesgo/)** (§8, §11).
- **[Quality gates proporcionales al riesgo](/blog/quality-gates-proporcionales-al-riesgo/)** — consume el flaky rate y la cobertura por riesgo como insumos de decisión.
- **[Datos y entornos de prueba reproducibles](/blog/datos-y-entornos-de-prueba-reproducibles/)** — mejora directamente la "confiabilidad del entorno" (§7).

---

## 15. Checklist de métricas y trazabilidad

- [ ] ¿Cada métrica tiene los seis campos (pregunta, numerador, denominador, ventana, sesgo, uso)?
- [ ] ¿Ningún número se usa para rankear o castigar personas, y eso está escrito en un ADR?
- [ ] ¿Reportás percentiles (p50/p95) por etapa, no promedios globales?
- [ ] ¿Distinguís cobertura ponderada por riesgo de cobertura de líneas?
- [ ] ¿La definición de "flaky" y "sin cambio relevante" está documentada localmente?
- [ ] ¿"Defectos escapados" declara su denominador y evita el uso individual?
- [ ] ¿La trazabilidad guarda referencias/hashes y prohíbe PII, secretos y comprobantes?
- [ ] ¿Los umbrales nacen de un baseline medido, con fecha y muestra?
- [ ] ¿Donde no hay medición, aparece una plantilla vacía en vez de un número inventado?
- [ ] ¿El set de métricas tiene fecha de revisión periódica?

---

### Fuentes (consultadas 2026-07-09)

- Google SRE Book, "Service Level Objectives" (SLI/SLO/SLA, percentiles). https://sre.google/sre-book/service-level-objectives/
- OpenTelemetry, "What is OpenTelemetry?" (telemetría como evidencia para SLOs). https://opentelemetry.io/docs/what-is-opentelemetry/
- Ley de Goodhart, formulación de Marilyn Strathern (1997), "'Improving ratings': audit in the British University system" — atribución de la máxima "when a measure becomes a target, it ceases to be a good measure". *(Fuente secundaria/interpretativa; verificá la cita original antes de publicar.)*

> *Aviso.* Los ejemplos usan datos ficticios de *Nexo Finanzas*. Ninguna métrica de este artículo es un resultado real; las plantillas vacías son deliberadas.

