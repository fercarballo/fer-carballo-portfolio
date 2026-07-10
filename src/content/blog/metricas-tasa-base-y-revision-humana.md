---
title: "Métricas, tasa base y revisión humana"
description: "Matriz de confusión, paradoja de la tasa base, precision y recall con sus denominadores, human-in-the-loop simulado, drift de datos y reglas, y rollout seguro de un cambio de reglas."
pubDate: 2026-07-10
tags: ['metricas', 'matriz-de-confusion', 'tasa-base', 'human-in-the-loop', 'drift', 'riesgo']
cluster: 'a07'
clusterTitle: "Ingeniería de fraude y motores de reglas"
type: satelite
order: 3
readingLevel: "Avanzado"
prerequisites: "Requiere estadística descriptiva básica."
icon: 'search'
iconHue: 330
---

> **Aviso y límites.** Nexo Finanzas es **ficticio**. **Todas las matrices de confusión y todos los números son ILUSTRATIVOS**, elegidos para hacer visible un fenómeno estadístico. **No son mediciones de ningún sistema.** No hay guía de evasión de controles. La revisión humana descrita es **simulada**. **No se automatiza ninguna decisión sensible sin límites ni revisión.**

> **Promesa del artículo.** Al terminar vas a poder desarmar la frase "nuestro modelo tiene 99 % de accuracy" en treinta segundos, elegir la métrica correcta según el costo asimétrico de equivocarse, y diseñar una cola de revisión humana que no colapse.

> Cierra el capítulo. Asume el versionado del [pilar](/blog/riesgo-fraude-y-anomalia-no-son-lo-mismo/) y los datasets del [artículo 2](/blog/tablas-de-decision-golden-dataset-y-backtesting/).

## El detector perfecto que no detecta nada

Supongamos, con números **ilustrativos** sobre datos sintéticos, que 3 de cada 1.000 transferencias son de riesgo. La **tasa base** es 0,3 %.

Construyo un detector. Su código completo:

```java
public Outcome evaluate(FeatureSnapshot f) {
    return ALLOW;   // siempre
}
```

Este detector, que no mira nada, tiene una **accuracy del 99,7 %**. Acierta en las 997 transferencias legítimas de cada 1.000 y falla solo en las 3 de riesgo.

99,7 % de accuracy. Y detecta **cero** casos de riesgo.

Este es el fenómeno que hay que tener presente cada vez que alguien presenta accuracy sobre un problema de clase rara: **cuando la tasa base es baja, la accuracy está dominada por la clase mayoritaria y no dice nada sobre lo que te importa.**

La regla práctica: **si la tasa base es del 0,3 %, cualquier accuracy por debajo del 99,7 % es peor que no hacer nada.** El número que suena impresionante es en realidad el piso.

## La matriz de confusión, con sus cuatro nombres

Toda métrica sale de acá. **Números ilustrativos**, sobre el dataset sintético `distribution-sample` (100.000 casos, 300 de riesgo).

|  | **Riesgo real (300)** | **Legítimo real (99.700)** |
|---|---|---|
| **Sistema dice REVIEW/REJECT** | **VP** = 240 (verdadero positivo) | **FP** = 1.500 (falso positivo) |
| **Sistema dice ALLOW** | **FN** = 60 (falso negativo) | **VN** = 98.200 (verdadero negativo) |

Y las métricas, **cada una con su denominador explícito**, que es lo que casi nunca se dice:

| Métrica | Fórmula | Valor | Qué pregunta responde |
|---|---|---|---|
| **Accuracy** | `(VP + VN) ÷ total` | 98,4 % | *"¿Qué fracción de todo acerté?"* Casi siempre inútil acá |
| **Precision** | `VP ÷ (VP + FP)` | **13,8 %** | *"De los que marqué, ¿cuántos eran de riesgo?"* |
| **Recall (sensibilidad)** | `VP ÷ (VP + FN)` | **80,0 %** | *"De los de riesgo, ¿cuántos atrapé?"* |
| **Tasa de FP** | `FP ÷ (FP + VN)` | 1,5 % | *"¿A qué fracción de legítimos molesté?"* |

Miralo bien. **Precision del 13,8 %.** De cada 100 transferencias que el sistema envía a revisión, **86 son legítimas**.

Y sin embargo, la tasa de falsos positivos es de apenas 1,5 %, que suena excelente.

**Ambas son ciertas.** La razón es la tasa base: hay tantas transferencias legítimas que un 1,5 % de ellas (1.500) aplasta a los 240 verdaderos positivos. Cuando la clase que buscás es rara, **una tasa de falsos positivos excelente produce una precision terrible**. No hay forma de escapar a esa aritmética.

Es la misma matemática de las pruebas médicas para enfermedades raras, y sorprende a todo el mundo la primera vez.

### Cuál mirar

Depende de **qué te cuesta más equivocarte**, y eso es una decisión de negocio.

| Si el costo de... | ...es mayor | Optimizás | Sacrificás |
|---|---|---|---|
| Dejar pasar un caso de riesgo | Pérdida de dinero | **Recall** | Precision: más revisiones |
| Bloquear una operación legítima | Cliente que se va | **Precision** | Recall: más casos que pasan |

Para Nexo Finanzas (ficticio), la decisión y su costo:

> **Priorizamos recall sobre precision**, porque el costo de un falso negativo (dinero ficticio perdido, confianza dañada) es asimétricamente mayor que el de un falso positivo (una revisión adicional y una demora).
>
> **Y el costo lo pagamos en atención humana:** 1.740 casos por cada 100.000 llegan a la cola de revisión, de los cuales 1.500 son legítimos. Ese es el presupuesto que estamos comprometiendo, y hay que dimensionarlo antes de desplegar.

Esa segunda frase es la que casi nunca se escribe, y es la que conecta la métrica con la operación. **Un umbral que mejora el recall es una orden de contratación.**

## La cola de revisión no es infinita

`REVIEW` significa "una persona mira esto". Y ahí aparecen restricciones que ninguna métrica captura:

- **Tiene capacidad.** Si el equipo revisa 500 casos por día y el sistema envía 1.740, la cola crece sin límite. En una semana, la revisión "en tiempo real" tiene cinco días de retraso.
- **Tiene un SLA implícito.** Una persona ficticia esperando que su transferencia se apruebe no espera tres días.
- **Se degrada con el volumen.** Un revisor que ve 86 legítimos por cada caso real desarrolla, inevitablemente, un sesgo hacia aprobar. **La precision baja degrada la calidad de la revisión humana**, que era el control que compensaba la precision baja. Es un lazo de retroalimentación negativo.

Ese último punto es la trampa. Sesgás hacia recall porque hay revisión humana; la revisión humana se satura y se vuelve mecánica; y ahora ni el sistema ni el humano están decidiendo bien.

**Consecuencias de diseño:**

- **La tasa de revisión (`% enviado a revisión`) es un guardrail, no una métrica de observación.** Si un ruleset nuevo la duplica, no se despliega hasta que haya presupuesto. Es exactamente lo que el reporte de backtest del artículo 2 cuantificaba.
- **La cola necesita priorización.** No todos los casos de revisión son iguales: por monto, por antigüedad en la cola, por cantidad de reglas disparadas.
- **La cola necesita un comportamiento de desborde declarado.** Si crece más allá de `N`, ¿qué pasa? ¿Se auto-aprueban los de bajo monto? ¿Se rechazan? **Ambas opciones son malas y hay que elegir una antes del incidente**, no durante.

### Revisión humana simulada

En un portfolio, la revisión humana se **simula**, y hay que decirlo con todas las letras.

```java
// Simulacion de revision humana para el sandbox. NO es un sistema de revision real.
// Ninguna persona real revisa nada; ningun caso real es evaluado.
public ReviewOutcome simulateHumanReview(RiskDecision d) {
    // Politica de simulacion DECLARADA, no una heuristica escondida:
    // el revisor sintetico aprueba si no hay reglas de alta severidad.
    boolean hasHighSeverity = d.reasonCodes().stream()
                               .anyMatch(HIGH_SEVERITY_CODES::contains);

    return new ReviewOutcome(
        hasHighSeverity ? REJECTED : APPROVED,
        "SIMULATED",                       // marcador obligatorio
        d.ruleSetVersion(),
        Instant.now()
    );
}
```

El marcador `"SIMULATED"` viaja con el resultado y **se persiste**. Cualquier métrica calculada sobre revisiones simuladas queda identificable como tal para siempre. Sin ese marcador, seis meses después alguien va a calcular la tasa de aprobación de revisiones y va a estar midiendo un `if`.

Y en el README: *"la revisión humana está simulada; este proyecto no demuestra operar un equipo de revisión de riesgo."*

## Drift: el sistema envejece aunque no lo toques

Un ruleset que funcionaba deja de funcionar sin que nadie cambie una línea. Dos causas distintas:

| Tipo | Qué cambió | Ejemplo (ficticio) | Cómo se detecta |
|---|---|---|---|
| **Data drift** | La distribución de las **entradas** | Los montos suben con la inflación; el umbral fijo captura cada vez más | Monitorear la distribución de cada feature |
| **Concept drift** | La relación entre entradas y **resultado** | Lo que constituye comportamiento riesgoso cambia | Monitorear la distribución de **salidas** |

El data drift con un umbral absoluto es el caso más común y el más silencioso. `amountMinor > THRESHOLD` con un `THRESHOLD` fijo, en un contexto donde los montos crecen, envía cada mes más casos a revisión. Nadie cambió nada. La cola crece. Alguien culpa al equipo de revisión.

**Señales de drift, en orden de utilidad:**

1. **Distribución de `reasonCode` por semana.** Si `AMOUNT_ABOVE_THRESHOLD` pasó del 30 % al 60 % de los disparos, algo cambió en las entradas. **Esta es la señal más barata y la más informativa**, y solo es posible porque los reason codes son códigos estables y no texto libre.
2. **Tasa de revisión.** El agregado.
3. **Percentiles de cada feature numérica.** El p50 y el p95 del monto, por semana.
4. **Tasa de aprobación en revisión.** Si los revisores aprueban cada vez más, el sistema está marcando cada vez peor.

Y una decisión de diseño que previene el drift más común: **usar umbrales relativos donde tenga sentido.** `amountMinor > percentil95(historicoDeLaCuenta)` no envejece con la inflación. Cuesta más calcular y hay que guardarlo en el `featureSnapshot`, pero no requiere que alguien se acuerde de recalibrar.

No siempre es posible, y cuando no lo es, **el umbral absoluto necesita una fecha de revisión**, igual que un feature flag.

## Rollout de un cambio de reglas

Un cambio de ruleset es un cambio de comportamiento en producción. Se despliega como tal: con [entrega progresiva](/blog/coleccion/a03/).

<figure class="diagram">
  <img src="/blog/diagrams/metricas-tasa-base-y-revision-humana-1.svg" width="364" height="808" alt="Diagrama: metricas-tasa-base-y-revision-humana (1)" loading="lazy" decoding="async" />
</figure>

La secuencia concreta:

1. **Shadow mode.** El ruleset nuevo evalúa **todas** las transferencias y **registra** su decisión, pero la decisión que se aplica es la del ruleset viejo. Coste: cómputo. Beneficio: un backtest sobre datos vivos, sin riesgo.

   > **Shadow mode es la técnica más subestimada de este capítulo.** Te da la tabla de transiciones del backtest, pero sobre tráfico real y features calculadas en vivo. Corré en shadow al menos el tiempo que tarde en aparecer tu caso raro más lento.

2. **Canary por cohorte sintética.** El ruleset nuevo se aplica a una fracción. Guardrails:
   - Técnico: la tasa de revisión no supera el baseline en más de `<umbral>`.
   - Negocio: la tasa de completitud de transferencias no cae respecto al baseline.
3. **Rollout progresivo**, observando la profundidad de la cola de revisión —que es la señal que más rápido revela un problema.
4. **Kill switch.** Un flag operacional que vuelve al ruleset anterior. Su `degraded_behavior` está documentado y probado.

### Runbook: rollback de un ruleset

> `docs/runbooks/rule-rollback.md`. **Nunca ejecutado en producción real.**

**Cuándo.** La cola de revisión crece sin control, o el ruleset nuevo produce decisiones manifiestamente incorrectas.

**Quién.** On-call, **sin aprobación previa**. La revisión es posterior.

**Procedimiento:**

1. Apagar el flag `risk-ruleset-2026.07.01-3`. El motor vuelve a `2026.06.15-2`.
2. **Verificar por métrica**, no por la UI del proveedor de flags: la distribución de `ruleSetVersion` en los eventos de auditoría de los últimos minutos debe mostrar el ruleset viejo.
3. **No borrar las decisiones tomadas con el ruleset nuevo.** Son evidencia. Quedan con su `ruleSetVersion`, y eso es exactamente para lo que existe el campo.
4. **Los casos en la cola de revisión enviados por el ruleset nuevo se revisan igual.** Marcarlos, no descartarlos.
5. Registrar en el ticket: cuándo, por qué, cuántas decisiones se tomaron con el ruleset revertido.

**Lo que NO se hace:**
- **No se reevalúan retroactivamente** las decisiones ya tomadas. Una transferencia que se aprobó, se aprobó. Cambiar la historia rompe la auditoría, y el `featureSnapshot` existe para explicar por qué se decidió así, no para permitir rehacerlo.
- No se edita el ruleset en caliente. Se revierte al anterior, que es inmutable y está probado.

## Métricas del motor, con denominador

| Métrica | Fórmula | Ventana | Acción |
|---|---|---|---|
| **Precision** | `VP ÷ (VP + FP)` | 30 días | Si cae, la carga de revisión sube |
| **Recall** | `VP ÷ (VP + FN)` | 30 días, **con retraso de etiquetado** | Si cae, se escapan casos |
| **% enviado a revisión** | `REVIEW ÷ total` | Diaria | **Guardrail:** bloquea el rollout si sube más de `<umbral>` |
| **Tiempo de decisión** | p99 de latencia del motor | Continua | Si sube, el motor está en el camino crítico |
| **Distribución de `reasonCode`** | conteo por código ÷ total disparos | Semanal | Cambio abrupto ⇒ drift |
| **Decisiones sin `reasonCode`** | conteo | Continua | **Cualquier valor > 0 es un bug.** Una decisión sin motivo no es auditable |
| **Profundidad de la cola** | casos pendientes ÷ capacidad diaria | Continua | `> 1` ⇒ la cola crece; escalar o ajustar |

Tres advertencias sobre esta tabla:

- **`Recall` lleva un asterisco permanente.** Depende de etiquetas que llegan tarde y están sesgadas por tus propias decisiones. El recall de los últimos 30 días es siempre optimista, porque los falsos negativos de ese período todavía no se reportaron. **Calculalo con un desfase, y decilo.**
- **`Decisiones sin reasonCode` debe ser cero, siempre.** Es la métrica más simple y la que más rápido detecta un bug en el motor.
- **`Profundidad de la cola ÷ capacidad`** es la métrica que conecta el sistema con las personas. Un valor de 1,2 significa que la cola crece un 20 % por día, y en dos semanas es inmanejable.

## Anti-patrones

- **Presentar accuracy sobre una clase rara.** *Consecuencia:* un detector que devuelve siempre `ALLOW` parece excelente. *Alternativa:* precision, recall y tasa base, juntas.
- **Reportar precision sin la tasa base.** *Consecuencia:* el número no se puede interpretar. *Alternativa:* siempre la tasa base al lado.
- **Optimizar recall sin dimensionar la cola de revisión.** *Consecuencia:* un umbral es una orden de contratación que nadie firmó. *Alternativa:* el reporte de backtest con impacto operativo.
- **Ignorar que la precision baja degrada la revisión humana.** *Consecuencia:* lazo de retroalimentación negativo; ni el sistema ni el humano deciden bien. *Alternativa:* monitorear la tasa de aprobación de los revisores.
- **Cola de revisión sin comportamiento de desborde declarado.** *Consecuencia:* alguien improvisa durante un incidente. *Alternativa:* decidir antes.
- **Revisión simulada sin marcador.** *Consecuencia:* seis meses después alguien mide un `if`. *Alternativa:* `"SIMULATED"` persistido.
- **Umbrales absolutos sin fecha de revisión.** *Consecuencia:* data drift silencioso. *Alternativa:* umbrales relativos, o fecha de recalibración.
- **`reasonCode` como texto libre.** *Consecuencia:* perdés la señal de drift más barata que existe. *Alternativa:* códigos estables.
- **Desplegar un ruleset sin shadow mode.** *Consecuencia:* descubrís el impacto con usuarios. *Alternativa:* shadow, canary, rollout.
- **Reevaluar retroactivamente decisiones históricas.** *Consecuencia:* rompés la auditoría. *Alternativa:* la historia es inmutable; el `featureSnapshot` explica, no rehace.
- **Editar un ruleset en caliente durante un incidente.** *Alternativa:* revertir a uno inmutable y probado.
- **Confundir correlación con fraude.** *Alternativa:* ver la distinción del pilar.

## Qué publicar en GitHub

```text
docs/model-card-or-rule-card.md      # con tasa base, precision, recall Y sus límites
docs/quality/metricas-del-motor.md   # fórmula, denominador, ventana, acción
docs/runbooks/rule-rollback.md
evidence/backtests/                  # con impacto operativo
tests/MetricasTest.java              # verifica que no se calculen sobre metrics_valid: false
```

El `rule-card` debe incluir una sección **"Limitaciones conocidas"** que diga, textualmente: *el recall se calcula sobre etiquetas incompletas y sesgadas por las decisiones del propio sistema; es una estimación optimista.* Un rule card sin esa sección está vendiendo algo.

## Qué aprendimos / próximos pasos

- Con tasa base baja, la accuracy está dominada por la clase mayoritaria y no dice nada.
- Una tasa de falsos positivos excelente puede convivir con una precision terrible. Es aritmética, no un bug.
- La elección entre precision y recall es una decisión de **costo asimétrico**, y se paga en atención humana.
- La precision baja degrada la revisión humana que la compensaba. Es un lazo negativo.
- El drift ocurre sin que nadie toque el código; la distribución de reason codes es la señal más barata.
- Shadow mode da un backtest sobre tráfico real, sin riesgo. Es la técnica más subestimada del capítulo.
- La historia de decisiones es inmutable. No se reevalúa.

**Cierre del capítulo.** El siguiente es [platform engineering](/blog/coleccion/a08/): cómo se empaqueta todo lo aprendido para que otros equipos lo usen sin repetir el camino.

## Checklist final

- [ ] Ninguna presentación reporta accuracy sobre una clase rara.
- [ ] Toda precision se reporta junto a la tasa base.
- [ ] La elección precision/recall está justificada por costo asimétrico, escrito.
- [ ] El impacto en la cola de revisión está dimensionado antes de desplegar.
- [ ] `% enviado a revisión` es un **guardrail** que bloquea el rollout.
- [ ] La cola tiene priorización y comportamiento de desborde declarado.
- [ ] Se monitorea la tasa de aprobación de los revisores como señal de degradación.
- [ ] Toda revisión simulada lleva el marcador `SIMULATED` persistido.
- [ ] Los umbrales absolutos tienen fecha de recalibración; los relativos se prefieren donde es posible.
- [ ] Se monitorea la distribución de `reasonCode` por semana.
- [ ] `Decisiones sin reasonCode` es cero.
- [ ] El recall se calcula con desfase y se declara optimista.
- [ ] Todo cambio de ruleset pasa por shadow mode antes del canary.
- [ ] El runbook de rollback prohíbe reevaluar decisiones históricas.
- [ ] El `rule-card` tiene una sección de "Limitaciones conocidas".
- [ ] Ningún número publicado se presenta como medición.

---

## Fuentes (consultadas 2026-07-10)

- [NIST AI Risk Management Framework](https://www.nist.gov/itl/ai-risk-management-framework) — **AI RMF 1.0** (NIST AI 100-1, ene-2023). Relevante si se incorporara ML; este motor no lo usa.
- [NIST AI 600-1 — Generative AI Profile](https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.600-1.pdf) (2024-07-26).
- [NIST Privacy Framework](https://www.nist.gov/privacy-framework) — versión **1.0** final.
- Para las definiciones de precision, recall y tasa base, usar fuentes académicas o institucionales de estadística. **No se citan blogs de vendors como evidencia de efectividad antifraude.**
- [Verificación de fuentes de la serie](/blog/verificacion-de-fuentes-serie-avanzada/)
