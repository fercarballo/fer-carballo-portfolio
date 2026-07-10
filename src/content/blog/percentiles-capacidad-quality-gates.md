---
title: "Leer resultados de performance: percentiles, coordinated omission, capacidad y quality gates"
description: "Por qué el promedio miente, qué es la coordinated omission y cómo distorsiona tus percentiles, cómo leer series por fase, tratar la capacidad como una relación (no un número) y diseñar un quality gate defendible en CI, con la plantilla de ADR-004 para Nexo Finanzas."
pubDate: 2026-07-09
tags: ["percentiles", "coordinated-omission", "capacity", "quality-gates", "ci", "adr", "performance-engineering"]
cluster: "06"
clusterTitle: "Performance engineering, SLO y capacidad"
type: "satelite"
order: 4
icon: "chart"
iconHue: 12
readingLevel: "Avanzado"
repo: "performance-testing-k6"
---
> **Bajada.** Un informe de performance con un promedio y un "pasó/falló" es peor que no tener informe: da falsa confianza. Este satélite del pilar [Performance Engineering: de la carga a una decisión](/blog/performance-engineering-de-la-carga-a-una-decision/) enseña a leer la evidencia con honestidad —percentiles, coordinated omission, series por fase, saturación— y a convertirla en un **quality gate defendible**, con la plantilla de **ADR-004** para Nexo Finanzas.

**Resumen ejecutivo.** Vas a entender por qué el promedio esconde las colas, qué es la *coordinated omission* y por qué tu p99 puede ser mentira, cómo tratar la capacidad como una relación entre demanda, latencia, errores y recursos (no como un número fijo), y cómo diseñar un gate en CI que no bloquee por ruido de ambiente ni deje pasar regresiones reales. Todos los números son **datos ficticios ilustrativos**.

## Índice

1. [Por qué el promedio miente](#1-por-qué-el-promedio-miente)
2. [Percentiles: qué son y qué no prometen](#2-percentiles-qué-son-y-qué-no-prometen)
3. [Coordinated omission: cuando tu p99 es optimista](#3-coordinated-omission-cuando-tu-p99-es-optimista)
4. [Leer series por fase, no un total](#4-leer-series-por-fase-no-un-total)
5. [Saturación, backpressure y el punto de quiebre](#5-saturación-backpressure-y-el-punto-de-quiebre)
6. [Capacidad como relación, no como número](#6-capacidad-como-relación-no-como-número)
7. [Quality gates que sobreviven al ruido](#7-quality-gates-que-sobreviven-al-ruido)
8. [ADR-004 — Performance gates basados en evidencia comparable](#8-adr-004--performance-gates-basados-en-evidencia-comparable)
9. [Matriz de decisiones para un gate](#9-matriz-de-decisiones-para-un-gate)
10. [Qué aprendimos y próximos pasos](#10-qué-aprendimos-y-próximos-pasos)
11. [Checklist](#11-checklist)

## Prerrequisitos y glosario

Necesitás: haber leído el [pilar](/blog/performance-engineering-de-la-carga-a-una-decision/) (vocabulario, evidencia), y conviene el satélite de [SLOs](/blog/slis-slos-error-budgets-sin-autoenganarse/) (histogramas) y el de [experimento con JMeter](/blog/experimento-carga-responsable-jmeter/) (modelo abierto/cerrado).

- **Percentil (pN):** el valor por debajo del cual cae el N % de las observaciones.
- **Coordinated omission:** sesgo por el cual un generador deja de medir las peticiones que "tocaban" durante un stall, subestimando la latencia de cola.
- **Headroom:** margen entre la demanda actual y el punto donde el sistema empieza a degradar.
- **Knee (codo):** la zona donde la latencia crece de forma no lineal al aumentar la carga.
- **Baseline:** una referencia versionada contra la cual se compara una corrida nueva.

## 1. Por qué el promedio miente

El promedio comprime la distribución en un solo número y borra justo lo que importa: la cola. Ejemplo con **datos ficticios ilustrativos**:

| Escenario | Promedio | p50 | p95 | p99 |
|---|---|---|---|---|
| A | 120 ms | 110 ms | 180 ms | 210 ms |
| B | 120 ms | 60 ms | 480 ms | 2.400 ms |

Mismo promedio (120 ms), experiencias opuestas. En B, el 1 % peor tarda 2,4 s: para un banco con muchos usuarios/día, eso son miles de personas con una confirmación de transferencia dolorosamente lenta. Reportar solo el promedio de B es, en la práctica, ocultar el problema.

> **Distinción honesta.** El promedio no está "prohibido"; simplemente **no alcanza** como único indicador. Se acompaña con distribución, percentiles y errores de negocio (anti-patrón n.º 2 del pilar).

## 2. Percentiles: qué son y qué no prometen

Un p95 de 480 ms significa: *el 95 % de las observaciones fue ≤ 480 ms* (y el 5 % peor, más). No es magia estadística, pero tiene límites concretos:

- **No son aditivos ni promediables.** No podés promediar el p95 de dos instancias. En Prometheus se **agregan los buckets** y luego se calcula el cuantil (ver [artículo 2](/blog/slis-slos-error-budgets-sin-autoenganarse/)). Promediar percentiles produce números sin sentido.
- **La precisión depende de los buckets.** Con histogramas de buckets fijos, si no hay un bucket cerca de tu umbral, el p95 es una estimación grosera. Los histogramas nativos de Prometheus mitigan esto con resolución dinámica ([Prometheus, "Histograms and summaries"](https://prometheus.io/docs/practices/histograms/), consultado 2026-07-09).
- **p99 y p99.9 son ruidosos.** Cuanto más a la cola, menos observaciones y más varianza. Un p99.9 sobre pocas muestras es casi anecdótico.
- **Cliente ≠ servidor.** El p95 server-side no incluye red ni la cola del cliente. Y —clave para la próxima sección— el p95 *del generador* puede estar sesgado por coordinated omission.

## 3. Coordinated omission: cuando tu p99 es optimista

La *coordinated omission* es un sesgo descrito por Gil Tene (autor de HdrHistogram). Ocurre cuando el sistema de medición se "coordina" involuntariamente con el sistema medido y **deja de tomar muestras justo cuando el sistema está lento**.

Mecánica: en un generador de **modelo cerrado** (ver [artículo 3](/blog/experimento-carga-responsable-jmeter/)), un VU que está esperando una respuesta lenta **no lanza** las peticiones que, según el plan, debían salir durante ese stall. Esas peticiones "omitidas" habrían tenido latencia alta (el sistema estaba lento), pero nunca se registran. Resultado: el reporte muestra p95/p99 **mejores de lo que la experiencia real fue**.

<figure class="diagram">
  <img src="/blog/diagrams/percentiles-capacidad-quality-gates-1.svg" width="264" height="494" alt="Diagrama: percentiles-capacidad-quality-gates (1)" loading="lazy" decoding="async" />
</figure>

Mitigaciones documentadas:

- **Corrección por intervalo esperado.** HdrHistogram permite compensar la omisión cuando existe un intervalo esperado entre muestras (`recordValues(value, expectedIntervalBetweenValueSamples)`), reconstruyendo las muestras faltantes ([HdrHistogram, proyecto de referencia](https://github.com/HdrHistogram/HdrHistogram), consultado 2026-07-09).
- **Generadores de tasa constante.** Herramientas como `wrk2` (fork de `wrk` de Gil Tene) sostienen una tasa de llegada e incluyen en la latencia el tiempo que la petición esperó en cola antes de emitirse (*intended-start-time correction*) ([wrk2, GitHub](https://github.com/giltene/wrk2), consultado 2026-07-09).
- **Preferir modelo abierto** cuando la fidelidad de la cola importa.

> **Inferencia, no dogma.** No todo reporte de modelo cerrado es inservible: para cargas lejos de la saturación, el sesgo es pequeño. Pero cerca del punto de quiebre —justo donde más te importa— la coordinated omission puede hacerte declarar "OK" un sistema que en realidad colapsa. Declará qué modelo usaste y cómo tratás el sesgo.

## 4. Leer series por fase, no un total

Un único número final aplasta la historia. La evidencia útil muestra **series temporales o una tabla por fase**: warm-up (se descarta), estado estable (se mide) y ramp-down.

| Fase | Qué mirar | Señal de problema |
|---|---|---|
| **Warm-up** | Latencia decreciente al calentar caches/JIT/pools | Si no baja, algo no calienta (o no hay warm-up real) |
| **Estado estable** | p50/p95/p99, error rate, saturación **estables** | Deriva ascendente de p99 = degradación o fuga |
| **Ramp-down** | Recuperación al bajar carga | Latencia que no baja = cola persistente/leak |

Ejemplo de lectura (datos ficticios ilustrativos): un p99 que en estado estable pasa de 300 ms → 900 ms → 2.500 ms a carga *constante* no es "ruido": es una **degradación temporal** (memoria, cola creciente, dependencia que se satura). Eso solo se ve en la serie, no en el total. Por eso un **soak/endurance** existe: fenómenos que aparecen a los 40 minutos son invisibles en 5.

## 5. Saturación, backpressure y el punto de quiebre

A medida que sube la carga, un sistema recorre zonas:

1. **Zona lineal:** más carga → más throughput, latencia casi constante.
2. **Codo (knee):** la latencia empieza a crecer no linealmente; algún recurso se acerca a saturación (CPU, pool de conexiones, colas).
3. **Saturación:** el throughput se aplana (o cae) y la latencia se dispara. Aquí, sin protección, el sistema puede entrar en **cascading failure**.
4. **Punto de quiebre:** errores masivos, timeouts, colapso.

Dos conceptos que definen si el sistema **falla bien o mal**:

- **Backpressure:** rechazar/encolar con límite en vez de aceptar trabajo que no se puede procesar. Un sistema con backpressure degrada de forma predecible; uno sin él acumula trabajo hasta caer.
- **Protección de sobrecarga:** el SRE Book desarrolla por qué la carga admisible y el rechazo elegante son parte del diseño, y cómo la falta de ellos produce fallas en cascada ([Google SRE Book, "Handling Overload"](https://sre.google/sre-book/handling-overload/) y ["Addressing Cascading Failures"](https://sre.google/sre-book/addressing-cascading-failures/), consultados 2026-07-09).

> **Consecuencia para el reporte.** "Encontramos el punto de quiebre en X" es un resultado de **estrés**, no una medida de **capacidad** operable. Mezclarlos es el anti-patrón n.º 1.

## 6. Capacidad como relación, no como número

"La capacidad es 5.000 req/s" es casi siempre falso o incompleto. La capacidad es una **relación** entre demanda, latencia, errores, recursos y dependencias, sujeta a un objetivo:

```text
Capacidad ≈ la máxima demanda que sostiene el SLO
           dado (entorno, mezcla, datos, dependencias) declarados
```

Cómo razonarla honestamente:

- **Headroom.** ¿Cuánto margen hay entre la demanda actual y el codo? Reportá headroom, no un tope teórico.
- **Degradación gradual.** ¿Cómo se comporta *antes* de romper? Un sistema que degrada suave es más operable que uno que aguanta más pero colapsa de golpe.
- **Dependencia lenta.** A veces el límite no es tu servicio: es una dependencia (base, tercero). La telemetría de dependencias ([artículo 3](/blog/experimento-carga-responsable-jmeter/)) lo revela.
- **Nada de extrapolación lineal sin datos.** Que a 200 req/s el p95 sea 300 ms **no** implica que a 400 req/s sea 600 ms. Cerca del codo, la latencia explota. Extrapolar linealmente es el error clásico.

> **No-alcance recordado.** No se dimensiona capacidad productiva con una laptop, un solo test o un entorno desconocido. Un entorno no productivo **no** prueba capacidad productiva salvo que documentes las diferencias (anti-patrón n.º 8). Todo *forecast* es una **inferencia** condicionada, no una garantía.

## 7. Quality gates que sobreviven al ruido

Un gate de performance mal diseñado hace una de dos cosas malas: bloquea por ruido de ambiente (y el equipo lo desactiva) o deja pasar regresiones (y no sirve). El diseño defendible tiene tres ideas:

1. **Comparar contra un baseline versionado**, no contra un número absoluto grabado a mano.
2. **Tolerancias justificadas** y **muestra comparable** (mismo entorno, misma mezcla, tamaño suficiente).
3. **Revisión humana** para cambios relevantes; el gate *marca*, no bloquea a ciegas.

```text
# Regla de gate (pseudocódigo)
if observability_is_incomplete:
    mark_experiment("inconclusive")            # sin telemetría no hay veredicto
elif regression_exceeds_agreed_tolerance and sample_is_comparable:
    require_human_review("performance-regression")  # marca, no bloquea ciego
else:
    publish_trend_with_limitations()           # archiva evidencia y sigue
```

Por qué así:

- **`inconclusive` es un estado de primera clase.** Un experimento sin telemetría no "pasa": es inconcluso. Esconder eso es el peor anti-patrón (categoría *Decisión* del pilar).
- **`sample_is_comparable`** evita el falso positivo por variabilidad: si el ambiente estaba distinto (vecino ruidoso, dataset diferente), no se dispara la alarma.
- **`require_human_review`** en vez de `fail`: una regresión de performance suele necesitar criterio (¿es real?, ¿vale la pena?), no un `exit 1` automático. Convertir un test de estrés en un gate ciego por PR es el anti-patrón n.º 6.

> **Trade-off.** Un gate estricto detecta más regresiones pero genera más falsos positivos y fricción; uno laxo molesta menos pero protege menos. La tolerancia correcta se **acuerda con evidencia** y se revisa. No hay número universal.

## 8. ADR-004 — Performance gates basados en evidencia comparable

Un gate es una decisión de arquitectura y merece un ADR. Plantilla propuesta para Nexo Finanzas (ficticia):

```markdown
# ADR-004 — Performance gates basados en evidencia comparable

## Estado
Propuesto

## Contexto
El journey "crear transferencia" (nexo-transfer-api) tiene SLOs de latencia y
corrección (ver artículo de SLOs). Necesitamos decidir cuándo un cambio puede
degradar performance sin que el gate bloquee por ruido de ambiente ni deje
pasar regresiones reales. El .jmx vive en nexo-performance-lab; los metadatos
en nexo-quality-platform.

## Decisión
- Comparar cada corrida contra un BASELINE versionado por entorno.
- Métricas del gate: p95 y p99 server-side de creación; error de negocio;
  tasa efectivamente generada; recursos del generador.
- El gate MARCA (require_human_review), no bloquea a ciegas.
- Sin telemetría completa => estado "inconclusive" (no "pass").

## Métricas elegidas y por qué
- p95/p99 (no promedio): representan la cola que siente el usuario.
- error de negocio (no solo 2xx): un 2xx mentiroso no es éxito.
- tasa generada y recursos del generador: descartan que midamos el generador.

## Tolerancias iniciales (FICTICIAS, a calibrar con trend)
- p95 server-side: regresión relevante si supera baseline +15% con muestra comparable.
- error de negocio: cualquier aumento sostenido sobre el error budget => review.
(Estos números son ilustrativos; se recalibran con histórico real.)

## Alternativas consideradas
- Umbral absoluto fijo: rechazado (frágil ante cambios de entorno).
- Bloqueo duro por PR: rechazado (falsos positivos, se termina desactivando).
- Sin gate: rechazado (regresiones invisibles hasta producción).

## Costo de ejecución
Tiempo de pipeline, entorno dimensionado y mantenimiento de baselines.
No se corre estrés completo por PR: baseline acotado + soak programado aparte.

## Riesgos
- Falsos positivos por variabilidad => mitigado con sample_is_comparable.
- Falsos negativos por baseline viejo => baselines versionados y revisados.
- Coordinated omission => declarar modelo de carga y método de medición.

## Condición de revisión
Recalibrar tolerancias tras N corridas de trend; revisar si cambia el entorno,
la mezcla o el contrato de la API.
```

## 9. Matriz de decisiones para un gate

| Situación observada | Muestra comparable | Telemetría completa | Decisión |
|---|---|---|---|
| Dentro de tolerancia | Sí | Sí | `pass` + publicar trend |
| Regresión > tolerancia | Sí | Sí | `require_human_review` |
| Regresión > tolerancia | No (entorno distinto) | Sí | `inconclusive` + investigar entorno |
| Cualquier resultado | — | No | `inconclusive` (sin veredicto) |
| Mejora inesperada grande | Sí | Sí | Revisar: ¿coordinated omission / menos carga real? |
| Error de negocio sube | Sí | Sí | `block/review` (corrección > latencia) |

> Nótese la última fila-trampa: una **mejora** demasiado buena también merece sospecha. Si de golpe el p99 "mejoró" 60 %, revisá que el generador no haya mandado menos carga (coordinated omission) o que la mezcla no haya cambiado.

## 10. Qué aprendimos y próximos pasos

- El promedio miente; los percentiles ayudan pero no son promediables ni infalibles.
- La coordinated omission puede volver optimista tu p99 justo cerca del quiebre.
- La capacidad es una relación condicionada, no un número; no extrapoles linealmente.
- Un gate defendible compara contra baseline, tolera el ruido, admite "inconcluso" y marca para revisión humana.
- El ADR-004 vuelve todo eso una decisión explícita y revisable.

**Cerrá el recorrido de la colección:**

- Volvé al pilar: **[Performance Engineering: de la carga a una decisión](/blog/performance-engineering-de-la-carga-a-una-decision/)**.
- Repasá cómo se define el objetivo: **[SLIs que se parecen a la experiencia](/blog/slis-slos-error-budgets-sin-autoenganarse/)**.
- Repasá cómo se genera la carga: **[Diseñar un experimento de carga responsable con JMeter](/blog/experimento-carga-responsable-jmeter/)**.

**Próximos experimentos sugeridos:** soak de larga duración para fugas; spike test con foco en recuperación; comparación de un cambio de arquitectura (pool de conexiones) contra baseline.

## 11. Checklist

- [ ] El reporte muestra distribución y percentiles, no solo promedio.
- [ ] Agregás buckets antes de calcular percentiles (no promediás p95).
- [ ] Declaraste el modelo de carga y cómo tratás la coordinated omission.
- [ ] Mostrás series por fase (warm-up/estable/ramp-down), no un total.
- [ ] Distinguís punto de quiebre (estrés) de capacidad operable (SLO).
- [ ] La capacidad se reporta como relación con headroom, sin extrapolación lineal.
- [ ] El gate compara contra baseline versionado con tolerancia justificada.
- [ ] "Inconcluso" es un resultado válido cuando falta telemetría o la muestra no es comparable.
- [ ] Escribiste/actualizaste el ADR-004 con métricas, tolerancias, riesgos y condición de revisión.

---

### Fuentes (consultadas 2026-07-09)

- Google SRE Book — [Handling Overload](https://sre.google/sre-book/handling-overload/), [Addressing Cascading Failures](https://sre.google/sre-book/addressing-cascading-failures/).
- Prometheus — [Histograms and summaries](https://prometheus.io/docs/practices/histograms/).
- Coordinated omission — [HdrHistogram](https://github.com/HdrHistogram/HdrHistogram) y [wrk2](https://github.com/giltene/wrk2) (Gil Tene): origen del término y mitigaciones (corrección por intervalo esperado, tasa constante).

> *Nota:* todas las cifras (promedios, percentiles, tolerancias) son datos ficticios ilustrativos, no mediciones ni SLAs. El ADR-004 es una plantilla ficticia para el portfolio Nexo Finanzas. Verificá el comportamiento de tus histogramas y generadores antes de aplicar estas reglas.

