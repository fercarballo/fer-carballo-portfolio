---
title: "SLIs que se parecen a la experiencia: definir SLOs y error budgets sin autoengañarse"
description: "Cómo elegir un SLI que represente la experiencia real, escribir un SLO defendible con su error budget, y medirlo con histogramas de Prometheus y el modelo de métricas de OpenTelemetry sin caer en trampas de cardinalidad ni de agregación de percentiles."
pubDate: 2026-07-09
tags: ["slo", "sli", "error-budget", "prometheus", "opentelemetry", "observability", "sre"]
cluster: "06"
clusterTitle: "Performance engineering, SLO y capacidad"
type: "satelite"
order: 2
icon: "chart"
iconHue: 12
readingLevel: "Intermedio–Avanzado"
repo: "telco-reliability-lab"
---
> **Bajada.** Un SLO no es "el p95 que salió en el último test". Es un acuerdo entre producto, ingeniería y operaciones sobre qué nivel de servicio se le promete al usuario, medido con un indicador que *se parece a su experiencia*. Este satélite del pilar [Performance Engineering: de la carga a una decisión](/blog/performance-engineering-de-la-carga-a-una-decision/) explica cómo definir el SLI, cómo escribir el SLO y su error budget, y cómo medirlo sin que la instrumentación te mienta.

**Resumen ejecutivo.** Vas a aprender a distinguir eventos buenos de totales, a filtrar tráfico sintético, a separar errores de negocio de fallas técnicas, y a escribir una plantilla de SLO con su presupuesto de error. Después bajamos a la medición: histogramas clásicos vs. nativos en Prometheus, el modelo de datos de métricas de OpenTelemetry, y por qué **no se puede promediar un percentil**. Todos los números son **datos ficticios ilustrativos**.

## Índice

1. [El problema: un SLO copiado del último gráfico](#1-el-problema-un-slo-copiado-del-último-gráfico)
2. [Qué hace bueno a un SLI](#2-qué-hace-bueno-a-un-sli)
3. [Eventos buenos sobre totales: la forma de un SLI de request](#3-eventos-buenos-sobre-totales-la-forma-de-un-sli-de-request)
4. [SLO y error budget: una conversación, no un número](#4-slo-y-error-budget-una-conversación-no-un-número)
5. [Medir el SLI: histogramas en Prometheus](#5-medir-el-sli-histogramas-en-prometheus)
6. [Instrumentar sin explotar la cardinalidad: OpenTelemetry](#6-instrumentar-sin-explotar-la-cardinalidad-opentelemetry)
7. [Nexo Finanzas: SLI del journey "crear transferencia"](#7-nexo-finanzas-sli-del-journey-crear-transferencia)
8. [Anti-patrones de SLO](#8-anti-patrones-de-slo)
9. [Qué aprendimos y próximos pasos](#9-qué-aprendimos-y-próximos-pasos)
10. [Checklist](#10-checklist)

## Prerrequisitos y glosario

Necesitás: entender request/response HTTP y estados 2xx/4xx/5xx, y haber visto alguna vez una métrica en un dashboard. Del [artículo pilar](/blog/performance-engineering-de-la-carga-a-una-decision/) reutilizamos SLI, SLO, SLA, error budget y percentiles.

- **Ventana (window):** el período sobre el que se evalúa el SLO (p. ej., 30 días *rolling*).
- **Histograma:** una métrica que agrupa observaciones (p. ej., latencias) en *buckets* para poder estimar percentiles.
- **Cardinalidad:** la cantidad de series temporales distintas que genera una métrica; crece con cada combinación de etiquetas.
- **Burn rate:** la velocidad a la que se consume el error budget.

## 1. El problema: un SLO copiado del último gráfico

Escena típica: alguien corre una prueba de carga, ve que el p95 dio 480 ms (dato ficticio ilustrativo) y propone: *"El SLO es p95 < 500 ms"*. Se ve profesional y está roto por tres motivos:

1. **El objetivo salió de la métrica más fácil, no de lo que el usuario necesita.** ¿500 ms es bueno para confirmar una transferencia? ¿Y para ver el historial? Son experiencias distintas.
2. **No hay ventana ni umbral de cumplimiento.** ¿p95 < 500 ms *siempre*? ¿El 99 % del tiempo? ¿Medido dónde?
3. **Mezcla salud técnica con éxito de negocio.** Un p95 lindo con 3 % de transferencias que responden 200 pero no se registran es un desastre disfrazado.

El SRE Book lo pone al revés: *primero* se decide qué aspecto del servicio le importa al usuario, *después* se elige el indicador ([Google SRE Book, "Service Level Objectives"](https://sre.google/sre-book/service-level-objectives/), consultado 2026-07-09).

## 2. Qué hace bueno a un SLI

Un buen SLI cumple, idealmente, cuatro propiedades:

- **Se parece a la experiencia.** Mide algo que el usuario *sentiría*. La latencia de confirmar una transferencia lo hace; el uso de CPU del pod, no (es un proxy, y a veces malo).
- **Se mide en el lugar correcto.** Si la experiencia es distribuida (cliente → API → base), medir el SLI *desde un único proceso* puede mentir. El p95 del servidor no incluye red ni cola del cliente; a veces querés medir lo más cerca del usuario posible.
- **Tiene numerador y denominador claros.** "Eventos buenos / eventos totales" (sección 3). Esto lo hace agregable y comparable.
- **Excluye lo que no cuenta.** Tráfico sintético (¡como tus propias pruebas de carga!), health checks, y errores del cliente que no son culpa del servicio.

> **Decisión de diseño.** Elegir *dónde* se mide un SLI (cliente, borde, servidor) es una decisión con trade-offs: más cerca del usuario = más fiel pero más ruidoso y difícil de atribuir. Declaralo; no lo dejes implícito.

## 3. Eventos buenos sobre totales: la forma de un SLI de request

La forma canónica de un SLI basado en peticiones es una proporción:

```text
SLI = eventos_buenos / eventos_totales   (en una ventana, con filtros explícitos)
```

Para el journey "crear transferencia", conviene separar **dos SLIs** en vez de mezclarlos:

- **SLI de latencia (experiencia):**
  `peticiones de creación con duración ≤ umbral / peticiones de creación válidas`
- **SLI de corrección/disponibilidad (negocio):**
  `transferencias con outcome de negocio válido / intentos de creación`

La distinción clave: un `200 OK` **no** es automáticamente un "evento bueno" de negocio. Hay que definir los *allowed business outcomes*: por ejemplo, "transferencia registrada e idempotente" y "rechazo esperado por regla de negocio" cuentan como funcionamiento correcto; en cambio, "200 sin registro", "duplicado por reintento" o "5xx" no. Esto conecta con la idea del pilar de que la evidencia de negocio (duplicados, integridad) es una categoría propia.

```text
# Clasificación de un intento (pseudocódigo)
if status in {5xx, timeout}:            -> falla_tecnica
elif status == 2xx and not persisted:   -> falla_negocio        # 2xx mentiroso
elif status == 2xx and duplicated:      -> falla_negocio
elif status in rechazos_esperados:      -> exito_negocio        # regla de negocio, no error
elif status == 2xx and persisted_once:  -> exito_negocio
```

> **Distinción honesta.** Este pseudocódigo es una **decisión de diseño** para el laboratorio ficticio, no un contrato de `nexo-transfer-api`. Los estados reales deben salir del contrato de la API.

## 4. SLO y error budget: una conversación, no un número

El SLO es el objetivo sobre el SLI, con **umbral, ventana y objetivo de cumplimiento**. Y no lo fija QA en soledad: es un acuerdo de producto + ingeniería + operaciones. El SRE Book enmarca el error budget como el mecanismo que vuelve esa conversación productiva: como el 100 % es un objetivo equivocado, se acuerda una tasa de fallo tolerada y se la administra ([Google SRE Book, "Embracing Risk"](https://sre.google/sre-book/embracing-risk/), consultado 2026-07-09).

**Plantilla de SLO (ejemplo con datos ficticios ilustrativos, no un compromiso):**

```yaml
slo:
  journey: create-transfer
  descripcion: "Confirmar una transferencia se siente rápido y correcto"
  sli_latencia:
    definicion: "share de creaciones válidas con duración <= 800ms"   # umbral ficticio
    medido_en: "borde del servicio (server-side), route=/v1/transfers"
    objetivo: 99.0%          # ficticio
    ventana: "30d rolling"
  sli_correccion:
    definicion: "share de intentos con allowed business outcome"
    objetivo: 99.9%          # ficticio
    ventana: "30d rolling"
  error_budget:
    latencia: "1.0% de las creaciones pueden exceder el umbral"
    correccion: "0.1% de los intentos pueden fallar de negocio"
  consecuencia_operativa:
    - "si el budget de corrección se agota: congelar cambios de riesgo hasta recuperar"
    - "burn rate alto sostenido: escalar y revisar release reciente"
  no_es: "Esto NO es un SLA. No implica compromiso contractual ni penalidad."
```

**Aritmética del error budget (ficticia).** Si el SLO de corrección es 99,9 % sobre 30 días y (dato ficticio) hubo 1.000.000 de intentos, el presupuesto es 0,1 % = 1.000 fallos de negocio tolerados en la ventana. Si en la primera semana ya se consumieron 900, el *burn rate* es insostenible y eso es *información para decidir un release*, no para castigar a nadie.

> **Trade-off.** Un SLO muy exigente (99,99 %) suena responsable pero puede costar arquitectura y velocidad de entrega desproporcionadas; uno laxo no protege al usuario. El punto correcto es una **negociación con evidencia**, no una aspiración. Este es exactamente el input del gate del [artículo 4](/blog/percentiles-capacidad-quality-gates/).

## 5. Medir el SLI: histogramas en Prometheus

Para el SLI de latencia necesitás percentiles, y los percentiles salen de **histogramas**. Dos familias, y la elección importa.

**Histograma clásico.** Expone series `_bucket{le="..."}`, `_sum` y `_count`. El percentil se estima con `histogram_quantile` sobre la *tasa* de los buckets:

```promql
# p95 de latencia server-side de creación de transferencias (histograma clásico)
histogram_quantile(
  0.95,
  sum by (le) (
    rate(http_server_request_duration_seconds_bucket{route="/v1/transfers"}[5m])
  )
)
```

Puntos finos, todos verificables en la doc oficial:

- **`sum by (le)` antes de `histogram_quantile`.** No se promedian percentiles: se **agregan los buckets** y *después* se calcula el cuantil. Promediar el p95 de dos instancias da un número sin significado.
- **La precisión depende de los límites de bucket.** Si no tenés un bucket cerca del percentil que te importa, la estimación es pobre. Elegí los `le` pensando en tus umbrales.
- **Server-side ≠ client-side.** Esta consulta mide el servidor; no incluye red ni la cola del cliente. Puede diferir del p95 que percibe el usuario (y de la *coordinated omission* del generador, ver [artículo 4](/blog/percentiles-capacidad-quality-gates/)).

**Histograma nativo (native histograms).** Usan buckets exponenciales de resolución dinámica: más precisos y más eficientes en almacenamiento (un bucket sin observaciones no ocupa espacio). La sintaxis de `histogram_quantile` es más simple (sin `le`):

```promql
# p95 con histograma nativo (no se agrupa por le)
histogram_quantile(0.95, sum(rate(http_server_request_duration_seconds[5m])))
```

Recomendación **vigente** de Prometheus: *si tu librería de instrumentación soporta histogramas nativos, probablemente prefieras usarlos sobre los clásicos*; y para quien sigue con clásicos existe NHCB (*Native Histograms with Custom Buckets*) para ingerirlos como una forma especial de histograma nativo ([Prometheus, "Histograms and summaries"](https://prometheus.io/docs/practices/histograms/), consultado 2026-07-09). Al momento de la consulta (2026-06 según la doc), el soporte de histogramas nativos existe en varias librerías oficiales pero **aún no es universal** y suele requerir exposición vía protobuf, así que verificá el soporte en tu stack antes de comprometerte.

> **Verificá antes de copiar.** El nombre `http_server_request_duration_seconds` no es arbitrario: proviene de las convenciones semánticas HTTP de OpenTelemetry, estables desde semconv v1.23.0, con unidad en **segundos** (cambió desde milisegundos en versiones previas) ([OpenTelemetry, "HTTP metrics semantic conventions"](https://opentelemetry.io/docs/specs/semconv/http/http-metrics/), consultado 2026-07-09). Si tu instrumentación usa otro nombre o unidad, la consulta de arriba no aplica tal cual.

## 6. Instrumentar sin explotar la cardinalidad: OpenTelemetry

El modelo de datos de métricas de OpenTelemetry define instrumentos (counter, histogram, gauge, etc.), puntos de datos, atributos y temporalidad ([OpenTelemetry, "Metrics Data Model"](https://opentelemetry.io/docs/specs/otel/metrics/data-model/), consultado 2026-07-09). Para nombres, unidades y comportamiento, la guía de instrumentación de Prometheus sigue siendo una referencia sólida y agnóstica de backend ([Prometheus, "Instrumentation"](https://prometheus.io/docs/practices/instrumentation/), consultado 2026-07-09).

El error que arruina una buena definición de SLI es la **cardinalidad descontrolada**:

- **Etiquetá con `route` (plantilla), no con `path` (valor).** `/v1/transfers` está bien; `/v1/transfers/8f3a...` (un id por transferencia) genera una serie por transferencia y hace explotar costo y consultas.
- **No metas el `idempotency_key`, el `user_id` ni el `run_id` como label de métrica.** Esos van en trazas/logs, no en series de métricas.
- **Elegí buckets pensando en tus umbrales de SLO.** Las convenciones HTTP de OTel definen buckets explícitos por defecto (0.005 … 10 s); alinealos con el umbral que vas a evaluar.

```text
# Regla mnemónica de cardinalidad
serie_temporal = metrica × combinacion(labels)
# cada label de alta cardinalidad MULTIPLICA el costo y degrada la calidad
```

> **Consecuencia práctica.** Una mala cardinalidad no solo encarece: puede volver la métrica inutilizable (consultas lentas, series recortadas). La cardinalidad es una decisión de calidad, no un detalle de ops.

## 7. Nexo Finanzas: SLI del journey "crear transferencia"

Aterrizándolo en el laboratorio ficticio, con responsabilidades repartidas como en el pilar:

- **`nexo-transfer-api`** expone la latencia server-side y el outcome de negocio (registrado/duplicado/rechazo esperado). El SLI de corrección **debe** apoyarse en esos outcomes, no en el status HTTP.
- **`nexo-quality-platform`** publica el SLI calculado por ejecución (commit, seed, perfil, ventana, resultado) **sin PII ni secretos**, con enlace a trazas.
- El **tráfico sintético** de `nexo-performance-lab` debe poder **excluirse** del cómputo del SLO productivo (etiqueta de sintético o ventana separada): tus pruebas no deberían gastar el error budget real.

Definición propuesta (decisión de diseño, datos ficticios):

```yaml
sli_transfer:
  latencia:
    numerador: "creaciones válidas con http_server_request_duration_seconds <= 0.8"
    denominador: "creaciones válidas (excluye synthetic=true y health checks)"
    fuente: "prometheus (native histogram si disponible, si no clásico + NHCB)"
  correccion:
    numerador: "intentos con business_outcome in {registered_once, expected_rejection}"
    denominador: "intentos de creación (excluye synthetic=true)"
    fuente: "eventos de negocio de nexo-transfer-api, correlacionados por trace_id"
  exclusiones:
    - "synthetic=true"      # las pruebas de carga NO cuentan para el SLO productivo
    - "health/readiness checks"
```

## 8. Anti-patrones de SLO

| Anti-patrón | Causa | Consecuencia | Alternativa |
|---|---|---|---|
| **SLO = último p95 del test** | Se elige la métrica fácil | Objetivo sin relación con la experiencia | Partir de la necesidad del usuario y acordar umbral/ventana |
| **Contar 2xx como éxito de negocio** | Confundir salud técnica con corrección | Duplicados y "200 mentirosos" pasan el SLO | Definir *allowed business outcomes* explícitos |
| **Promediar percentiles entre instancias** | Malentendido estadístico | p95 agregado sin significado | Agregar buckets y luego `histogram_quantile` |
| **Alta cardinalidad (path, id, user)** | Etiquetar con valores únicos | Costo y consultas rotas | Etiquetar con plantillas (`route`), ids en trazas |
| **Medir solo server-side y llamarlo "experiencia"** | Es lo más fácil de instrumentar | Ignora red/cola del cliente | Declarar dónde se mide; medir cerca del usuario si importa |
| **Incluir tráfico sintético en el SLO productivo** | No filtrar las pruebas | Las pruebas gastan el error budget real | Etiqueta `synthetic` y exclusión explícita |

## 9. Qué aprendimos y próximos pasos

- Un SLI bueno se parece a la experiencia, tiene numerador/denominador claros, se mide en el lugar correcto y excluye lo que no cuenta.
- El SLO es un acuerdo con umbral, ventana y objetivo; el error budget lo vuelve accionable.
- La medición tiene trampas técnicas concretas: agregación de percentiles, cardinalidad y elección de histograma clásico vs. nativo.

**Continuá con:**

- **[Diseñar un experimento de carga responsable con JMeter](/blog/experimento-carga-responsable-jmeter/)** — cómo generar la demanda que alimenta estos SLIs sin sesgar la medición.
- **[Leer resultados: percentiles, coordinated omission, capacidad y quality gates](/blog/percentiles-capacidad-quality-gates/)** — cómo convertir el SLO en un gate defendible (ADR-004).
- Volvé al pilar: **[Performance Engineering: de la carga a una decisión](/blog/performance-engineering-de-la-carga-a-una-decision/)**.

## 10. Checklist

- [ ] El SLI parte de la necesidad del usuario, no de la métrica más fácil.
- [ ] Separaste SLI de latencia (experiencia) de SLI de corrección (negocio).
- [ ] Definiste *allowed business outcomes*; un 2xx no es éxito automático.
- [ ] El SLO tiene umbral, ventana y objetivo, y está rotulado como objetivo ficticio (no SLA).
- [ ] Calculaste el error budget y su consecuencia operativa.
- [ ] Agregás buckets antes de `histogram_quantile` (no promediás percentiles).
- [ ] Verificaste soporte de histogramas nativos en tu stack; si usás clásicos, elegiste buckets alineados a los umbrales.
- [ ] Las etiquetas de métrica son de baja cardinalidad; los ids viven en trazas/logs.
- [ ] El tráfico sintético queda excluido del SLO productivo.

---

### Fuentes (consultadas 2026-07-09)

- Google SRE Book — [Service Level Objectives](https://sre.google/sre-book/service-level-objectives/), [Embracing Risk](https://sre.google/sre-book/embracing-risk/).
- Prometheus — [Histograms and summaries](https://prometheus.io/docs/practices/histograms/), [Instrumentation](https://prometheus.io/docs/practices/instrumentation/).
- OpenTelemetry — [Metrics Data Model](https://opentelemetry.io/docs/specs/otel/metrics/data-model/), [HTTP metrics semantic conventions](https://opentelemetry.io/docs/specs/semconv/http/http-metrics/) (estables desde semconv v1.23.0, unidad en segundos).

> *Nota:* todos los umbrales, objetivos y volúmenes son datos ficticios ilustrativos. Nada aquí constituye un SLA ni asesoramiento de cumplimiento. Verificá nombres, unidades y soporte de histogramas en tu instrumentación real antes de aplicar las consultas.

