---
title: "Observabilidad para Quality Engineering: cómo convertir un test rojo en evidencia explicable"
description: "Un test que falla no es evidencia si nadie puede reconstruir qué pasó. Guía vendor-neutral para instrumentar journeys de calidad con OpenTelemetry, propagar contexto y enlazar una prueba con evidencia operable, sin filtrar datos."
pubDate: 2026-07-09
tags: ["observabilidad", "quality-engineering", "opentelemetry", "distributed-tracing", "sdet", "testing", "telemetria"]
cluster: "07"
clusterTitle: "Observabilidad para Quality Engineering"
type: "pilar"
order: 1
repo: "telco-reliability-lab"
icon: "search"
iconHue: 265
readingLevel: "Intermedio–Avanzado"
prerequisites: "QA Automation / SDET, Dev, DevOps"
---
> **Bajada.** Un `AssertionError` no explica nada por sí solo. Cuando un test de extremo a extremo dice "timeout al crear transferencia", el equipo todavía no sabe si el backend recibió la solicitud, qué dependencia se degradó, qué versión estaba desplegada o si el resultado es un defecto de producto, un problema de datos, un bug de automatización o ruido de plataforma. Este artículo trata la observabilidad como un **contrato de evidencia**: instrumentar los comportamientos que importan, conservar el contexto mínimo para investigar y enlazar una expectativa de negocio con señales técnicas **sin filtrar datos** ni convertir cada test en una búsqueda manual.

> **Nota de honestidad intelectual.** Los ejemplos, IDs, servicios y datos de **Nexo Finanzas** son **ficticios** y sirven de ilustración. Ningún snippet es "listo para producción": cada uno debe validarse contra la versión exacta de tu SDK/Collector antes de usarlo. No hay métricas, trazas ni incidentes reales inventados en este texto. Las afirmaciones sobre estándares están verificadas contra fuentes primarias con fecha de consulta **9 de julio de 2026**.

---

## Resumen ejecutivo

- La observabilidad **sirve a calidad**, no solo a operaciones: convierte una falla de test en un artefacto que se puede clasificar (producto / datos / entorno / automatización / plataforma) en lugar de discutir.
- Las tres señales —**logs, métricas y trazas**— responden preguntas distintas. Confundirlas produce dashboards inútiles y logs que no se pueden correlacionar.
- El puente entre "criterio de aceptación" y "telemetría" es un **contrato**: qué spans, atributos, eventos y métricas emitimos, qué está prohibido, y cómo lo verificamos con un test.
- La correlación se sostiene sobre **propagación de contexto** (W3C Trace Context). Si se rompe en async o en una cola, no hay backend que la reconstruya "mágicamente".
- Instrumentar **no reemplaza** el diseño de pruebas, un dashboard no reemplaza una hipótesis, y correlación temporal **no es** causalidad.

**Índice**

1. [El test rojo que no explica nada](#1-el-test-rojo-que-no-explica-nada)
2. [Observabilidad, monitoreo y debugging: parecidos, propósitos distintos](#2-observabilidad-monitoreo-y-debugging-parecidos-propositos-distintos)
3. [Las tres señales y sus preguntas](#3-las-tres-senales-y-sus-preguntas)
4. [Del criterio de aceptación al contrato de telemetría](#4-del-criterio-de-aceptacion-al-contrato-de-telemetria)
5. [Context propagation de extremo a extremo](#5-context-propagation-de-extremo-a-extremo)
6. [Diseño de spans y atributos semánticos](#6-diseno-de-spans-y-atributos-semanticos)
7. [Logs estructurados que cooperan con trazas](#7-logs-estructurados-que-cooperan-con-trazas)
8. [Métricas para calidad, no solo para infraestructura](#8-metricas-para-calidad-no-solo-para-infraestructura)
9. [El Collector y el pipeline de telemetría](#9-el-collector-y-el-pipeline-de-telemetria)
10. [Caso Nexo Finanzas: una transferencia trazable sin datos sensibles](#10-caso-nexo-finanzas-una-transferencia-trazable-sin-datos-sensibles)
11. [Madurez y siguiente paso](#11-madurez-y-siguiente-paso)
12. [Anti-patrones](#12-anti-patrones)
13. [Checklist](#13-checklist)
14. [Fuentes](#14-fuentes-consultadas-2026-07-09)

**Glosario mínimo**

| Término | Definición operativa |
|---|---|
| **Señal (signal)** | Tipo de telemetría: log, métrica o traza. |
| **Trace / Span** | Una traza es el árbol de operaciones de una transacción; un span es una operación con inicio, fin, atributos, eventos y estado. |
| **Context propagation** | Transportar el identificador de traza entre procesos para que los spans de distintos servicios pertenezcan a la misma traza. |
| **Resource attributes** | Atributos que describen *quién* emite (servicio, versión, entorno). No cambian por request. |
| **Cardinalidad** | Cantidad de combinaciones distintas de valores de un atributo/label. Alta cardinalidad = costo y riesgo. |
| **Sampling** | Decisión de conservar o descartar trazas para controlar volumen/costo. |
| **Redacción / allowlist** | Quitar datos sensibles (redacción) o, mejor, emitir solo campos permitidos por una lista blanca. |

---

## 1. El test rojo que no explica nada

Un escenario Cucumber del portfolio de **Nexo Finanzas** (ficticio) ejecuta el journey "crear transferencia entre cuentas propias" contra el ambiente de pruebas. El paso final falla:

```
Scenario: transferencia entre cuentas propias
  ✗ Then la transferencia queda en estado ACCEPTED
    java.lang.AssertionError: expected ACCEPTED but was <timeout after 5000ms>
```

¿Qué sabemos con este mensaje? Que un cliente HTTP esperó 5 segundos y no obtuvo respuesta útil. Nada más. Las preguntas que el equipo necesita responder para **decidir una acción** siguen abiertas:

- ¿La request **llegó** a `nexo-transfer-api`, o murió en el borde (DNS, TLS, balanceador)?
- Si llegó, ¿qué dependencia tardó: el ledger ficticio, la cola de notificaciones, la base de datos?
- ¿Qué **versión** (commit SHA) estaba desplegada en ese ambiente en ese momento?
- ¿El timeout fue del test (cliente impaciente) o del servidor (proceso lento)?
- ¿Es un **defecto** reproducible o un **flaky** por contención de datos de prueba?

Sin evidencia correlacionada, el equipo cae en una de dos trampas: **re-ejecutar hasta que pase** (y así ocultar un defecto real) o **abrir un defecto sin evidencia** (y quemar credibilidad cuando resulta ser ambiente). La observabilidad existe para cerrar esa brecha: no para tener más gráficos, sino para que un test rojo produzca un **artefacto que se pueda clasificar**.

> **Tesis.** La observabilidad aplicada a Quality Engineering es un contrato de evidencia: instrumenta los comportamientos que importan, conserva el contexto mínimo necesario para investigar y enlaza una expectativa de negocio con señales técnicas —sin filtrar datos ni convertir cada test en una operación manual de búsqueda.
>
> **Sus límites, dichos de frente:** instrumentar no reemplaza el diseño de pruebas; un dashboard no reemplaza una hipótesis; y correlación temporal no equivale a causalidad.

---

## 2. Observabilidad, monitoreo y debugging: parecidos, propósitos distintos

Estos términos se usan como sinónimos y no lo son. Distinguirlos es lo que separa una estrategia de calidad madura de una colección de herramientas.

| Práctica | Pregunta que responde | Cuándo actúa | Qué **no** hace |
|---|---|---|---|
| **Monitoreo** | ¿Está pasando algo malo *ahora*, según umbrales que definí de antemano? | Continuo, sobre *known-unknowns*. | No explica causas nuevas ni preguntas que no anticipaste. |
| **Observabilidad** | ¿Puedo hacer preguntas *nuevas* sobre el sistema sin re-desplegar, a partir de las señales que ya emite? | Investigación, sobre *unknown-unknowns*. | No es un backend ni un dashboard; es una propiedad del sistema. |
| **Debugging** | ¿Por qué *este* caso concreto se comportó así? | Puntual, tras una hipótesis. | No escala a producción ni a distribuido con un solo `stack trace`. |
| **Logging** | ¿Qué eventos discretos ocurrieron? | Transversal. | Un log suelto no da latencia agregada ni el árbol de una transacción. |

OpenTelemetry define observabilidad como la capacidad de **entender el estado interno de un sistema a partir de la telemetría que produce** —logs, métricas y trazas— con foco en poder investigar problemas que no anticipaste ([OTel, *Observability Primer*](https://opentelemetry.io/docs/concepts/observability-primer/)).

Quality Engineering necesita **las tres**, sin confundirlas:

- **Monitoreo** te dice que la tasa de error del ambiente de test subió (síntoma).
- **Observabilidad** te deja preguntar "¿qué dependencia y qué versión?" sin tocar el código (correlación).
- **Debugging** confirma la hipótesis en el caso puntual (causa).

> **Distinción clave que usaremos todo el artículo:** *síntoma* (el test falló), *correlación* (la traza muestra que el span del ledger tardó 4.9 s) e *hipótesis causal* (el ledger se degradó por contención de datos de prueba). Una traza aporta **correlación**; la causa exige hipótesis y contraste. Este método se desarrolla en el artículo satélite [Diagnosticar un test flaky con trazas](/blog/diagnosticar-test-flaky-con-trazas-metodo-evidencia/).

---

## 3. Las tres señales y sus preguntas

Cada señal tiene un dominio propio. Elegir la señal equivocada para una pregunta es la causa raíz de la mitad de los "no encuentro nada en la telemetría".

<figure class="diagram">
  <img src="/blog/diagrams/observabilidad-quality-engineering-evidencia-explicable-1.svg" width="1073" height="371" alt="Diagrama: observabilidad-quality-engineering-evidencia-explicable (1)" loading="lazy" decoding="async" />
</figure>

- **Logs** — eventos discretos con contexto. Responden *qué pasó y cuándo*. **No** responden bien *cuánto* (agregación cara) ni *dónde en el camino* (sin correlación explícita). El modelo de logs de OpenTelemetry define campos para correlacionar cada registro con `TraceId`, `SpanId` y el `Resource` ([OTel, *Logs Data Model*](https://opentelemetry.io/docs/specs/otel/logs/data-model/)).
- **Métricas** — agregados numéricos en el tiempo (contador, gauge, histograma). Responden *cuánto / con qué frecuencia / qué percentil*. **No** responden *qué caso concreto*: una métrica no guarda el request individual. El modelo de datos de métricas de OTel define *streams* con atributos y advierte explícitamente contra la alta cardinalidad ([OTel, *Metrics Data Model*](https://opentelemetry.io/docs/specs/otel/metrics/data-model/)).
- **Trazas** — el árbol causal de una transacción a través de servicios. Responden *dónde se degradó el journey y en qué dependencia*. **No** reemplazan a las métricas para tendencias ni a los logs para detalle de negocio. La especificación de trazas de OTel está **estable** y bajo soporte de largo plazo ([OTel, *Trace spec*](https://opentelemetry.io/docs/specs/otel/trace/); [estado de la spec](https://opentelemetry.io/docs/specs/status/)).

La potencia aparece en la **correlación**: la misma transacción produce una traza, y sus logs llevan el `trace_id`, y sus métricas pueden apuntar a trazas de ejemplo (*exemplars*). Un test rojo deja de ser un mensaje y pasa a ser un punto de entrada a las tres señales.

---

## 4. Del criterio de aceptación al contrato de telemetría

Este es el corazón del enfoque. Un criterio de aceptación de negocio se traduce en telemetría **verificable**. Tomemos una regla real de un producto de transferencias:

> **Criterio:** "Una transferencia no se duplica ante un reintento (idempotencia por clave de request)."

¿Cómo se convierte esto en evidencia sin exponer PII? Diseñamos qué **debe** emitir el sistema para que el comportamiento sea observable:

| Elemento | Diseño | Por qué |
|---|---|---|
| **Span** | `transfer.create` con `SpanKind.SERVER`; un span hijo `transfer.idempotency.check`. | Localiza *dónde* se decide la deduplicación. |
| **Atributo** | `nexo.transfer.idempotency_outcome` = `created` \| `deduplicated`. Cardinalidad = 2. | Distingue creación de reintento sin identificar al cliente. |
| **Evento** | `transfer.deduplicated` cuando el reintento se corta. | Marca el instante exacto del comportamiento esperado. |
| **Métrica** | Contador `nexo.transfer.idempotency_hits_total{outcome}`. | Permite tendencia y alarma sin guardar requests. |
| **Prohibido** | La clave de idempotencia cruda, el número de cuenta, el monto exacto. | La clave puede ser sensible; el monto va **agrupado** (ver §7). |

El resultado no es "más logs": es un **contrato**. Cada regla de negocio que importa gana una señal que un test puede verificar. Ese contrato —cómo se declara, versiona, gobierna y prueba— es el tema completo del artículo satélite [El contrato de telemetría](/blog/contrato-de-telemetria-privacidad-cardinalidad-gobernanza/). Aquí nos quedamos con la idea: **la telemetría se diseña desde el comportamiento, no desde la herramienta**.

---

## 5. Context propagation de extremo a extremo

Para que los spans de la prueba, la API, el ledger y las notificaciones formen **una** traza, el identificador de contexto debe viajar entre procesos. El estándar es **W3C Trace Context**, hoy **Recomendación W3C** para el nivel 1 ([W3C, *Trace Context*](https://www.w3.org/TR/trace-context/), consultado 2026-07-09). Su Nivel 2 está en **Candidate Recommendation** y agrega un flag de *random trace-id*; conviene conocerlo pero el Nivel 1 es el que hoy está desplegado ([W3C, *Trace Context Level 2*](https://www.w3.org/TR/trace-context-2/)).

El contexto viaja en el header `traceparent`, con este formato exacto:

```
traceparent: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01
             │  │                                │                │
             │  └ trace-id (16 bytes / 32 hex)   │                └ trace-flags (sampled=01)
             └ version (00)                      └ parent-id (span-id, 8 bytes / 16 hex)
```

<figure class="diagram">
  <img src="/blog/diagrams/observabilidad-quality-engineering-evidencia-explicable-2.svg" width="650" height="495" alt="Diagrama: observabilidad-quality-engineering-evidencia-explicable (2)" loading="lazy" decoding="async" />
</figure>

Dos precisiones que evitan errores caros:

1. **`traceparent` no es un "correlation ID" cualquiera.** Un correlation ID casero es un string que vos definís y que nadie más entiende; `traceparent` es un formato estándar que backends y librerías saben propagar. Si tu organización ya tiene un correlation ID, mapealo, no lo reemplaces a mano.
2. **La propagación se rompe donde no la pusiste.** En llamadas asíncronas, colas o workers, el contexto **no** viaja solo: hay que inyectarlo en el mensaje y extraerlo en el consumidor. Asumir que "el backend correlacionará" es el anti-patrón #6 de §12. En OTel esto se maneja con *propagators* configurados explícitamente ([OTel, *Context propagation*](https://opentelemetry.io/docs/concepts/context-propagation/)).

> **No pongas PII en el contexto.** `traceparent`, `tracestate` y sobre todo `baggage` viajan por la red y quedan en atributos. Meter un email o un número de cuenta en `baggage` "para buscar más fácil" filtra ese dato a todo el pipeline. Baggage es API estable en OTel, pero su contenido es tu responsabilidad ([OTel, *Baggage*](https://opentelemetry.io/docs/specs/status/)).

---

## 6. Diseño de spans y atributos semánticos

Un span mal diseñado es ruido caro. El diseño se apoya en las **convenciones semánticas** de OpenTelemetry, que estandarizan nombres y atributos por dominio (HTTP, DB, messaging). Al momento de consulta la versión publicada es **semconv v1.43.0**, con las convenciones HTTP ya **estables** ([OTel, *Semantic Conventions*](https://opentelemetry.io/docs/specs/semconv/), consultado 2026-07-09).

**Ejemplo ilustrativo (Java, pseudocódigo).** No copies el snippet si tu versión de SDK cambió la API; validalo contra la doc de tu versión.

```java
// transfer.create — operación de negocio observable
Span span = tracer.spanBuilder("transfer.create")
    .setSpanKind(SpanKind.SERVER)          // el servicio ATIENDE la request
    .startSpan();

try (Scope scope = span.makeCurrent()) {   // hace de este span el "actual" del hilo
    span.setAttribute("nexo.transfer.channel", "web");      // baja cardinalidad: web|mobile|api
    span.setAttribute("nexo.transfer.test_run", safeRunId); // ver discusión abajo
    TransferResult result = service.create(command);
    span.addEvent("transfer.accepted");     // marca temporal del hito de negocio
    return result;
} catch (DomainException error) {
    span.recordException(error);            // adjunta stacktrace como evento del span
    span.setStatus(StatusCode.ERROR, "transfer rejected");
    throw error;
} finally {
    span.end();                             // SIEMPRE cerrar el span
}
```

**Explicado por bloques:**

- `SpanKind.SERVER` — declara el rol en la transacción distribuida. `SERVER` (atiende), `CLIENT` (llama a una dependencia), `PRODUCER`/`CONSUMER` (colas). Elegir mal el `SpanKind` rompe el árbol y las métricas derivadas.
- `makeCurrent()` + `try-with-resources` — garantiza que el contexto se propague a las llamadas internas y se limpie aunque haya excepción. Olvidar el `Scope` es la fuente #1 de trazas huérfanas.
- `recordException` + `setStatus(ERROR, ...)` — separa **error** (estado del span) de **excepción** (evento con detalle). Un span puede tener excepciones y aun así status `OK` (p. ej. reintento exitoso). No los confundas.
- `finally { span.end(); }` — un span no cerrado nunca se exporta; parece que "el test no llegó" cuando en realidad la instrumentación falló.

**La decisión que el ejemplo esconde: ¿`test_run` es atributo de span, resource attribute, log field o solo metadato de reporte?** No es estética; es arquitectura:

| Opción | Cardinalidad | Costo/retención | Consultable como | Recomendación |
|---|---|---|---|---|
| Atributo de span | Alta (1 valor por corrida) | Se guarda en cada span de esa corrida | Filtro de trazas | Útil si querés saltar de un test a su traza. Aceptable si el sampling conserva la corrida. |
| Resource attribute | Alta y **multiplica** por span | Peor: se repite en todo el recurso | Metadato del emisor | **Evitar**: los resource attributes describen *quién emite*, no *qué corrida*. |
| Log field | Alta pero acotada a logs | Menor si los logs se muestrean aparte | Búsqueda de logs | Bien para el detalle de negocio. |
| Metadato de reporte (CI) | No entra al backend de telemetría | Nula en telemetría | Enlace en el reporte | **Preferido como fuente de verdad**; el reporte guarda `run_id`, `commit` y, si existe, el `trace_id`. |

La respuesta depende de **cardinalidad, utilidad, retención y modelo de consulta**. En Nexo Finanzas usamos el metadato de reporte como fuente de verdad y, cuando el diseño lo permite, adjuntamos el `trace_id` al reporte para saltar a la traza (ver §10 y el satélite de diagnóstico). Los `nexo.*` son atributos propios: al inventar namespace, seguimos la recomendación de convenciones semánticas de **prefijar por organización** y no colisionar con los `otel`/estándar.

---

## 7. Logs estructurados que cooperan con trazas

Un log de texto libre (`"transfer failed for user 4821"`) no se correlaciona, no se agrega y —peor— suele filtrar PII. Un **evento estructurado** con esquema y correlación sí coopera con las trazas.

**Ejemplo ilustrativo (evento de negocio seguro):**

```json
{
  "event_name": "transfer.state_changed",
  "severity": "INFO",
  "trace_id": "<trace-id>",
  "span_id": "<span-id>",
  "transfer_reference": "demo-run-42-007",
  "from_state": "PENDING",
  "to_state": "ACCEPTED",
  "amount_bucket": "100_to_1000",
  "account_number": "REDACTED"
}
```

**Por qué está diseñado así:**

- `trace_id` / `span_id` — permiten saltar del log a la traza. En muchas integraciones se **inyectan automáticamente** desde el contexto activo; verificá que tu librería de logging lo haga en tu versión antes de asumirlo (el modelo de logs de OTel define estos campos de correlación: [*Logs Data Model*](https://opentelemetry.io/docs/specs/otel/logs/data-model/)).
- `amount_bucket` en lugar del monto exacto — el **monto agrupado** (`100_to_1000`) conserva utilidad analítica sin volver el campo identificable ni de alta cardinalidad. El monto exacto, cruzado con hora, puede reidentificar a una persona.
- `transfer_reference: "demo-run-42-007"` — es una **referencia sintética de la corrida**, no un ID estable de cliente. Que sea sintética es lo que la vuelve segura: no vincula a una persona real.
- `account_number: "REDACTED"` — está para mostrar la política, pero el campo **no debería existir** en el evento. Aquí aparece la decisión de fondo:

> **Allowlist > redacción.** Redactar después de loguear es frágil: basta un log nuevo que alguien agregó sin pensar para filtrar el dato. Una **allowlist** (emitir solo campos permitidos) es segura por diseño: lo que no está en la lista, no sale. La redacción es la red de seguridad, no la estrategia. Este principio se formaliza como contrato en el [artículo 2](/blog/contrato-de-telemetria-privacidad-cardinalidad-gobernanza/).

---

## 8. Métricas para calidad, no solo para infraestructura

Las métricas de calidad no son las de infraestructura. CPU y memoria le importan a plataforma; a calidad le importan **outcomes de negocio** y la salud del journey. Un marco útil son las cuatro señales doradas —latencia, tráfico, errores, saturación— aplicadas al journey, más un outcome de negocio.

| Métrica | Tipo | Para qué | Cuidado de cardinalidad |
|---|---|---|---|
| `nexo.transfer.outcome_total{outcome}` | Contador | Tasa de aceptadas/rechazadas/duplicadas | `outcome` tiene 3–4 valores: OK. |
| `nexo.transfer.duration` | Histograma | p50/p95/p99 del journey | Sin labels por request. |
| `nexo.transfer.dependency_errors_total{dependency}` | Contador | Qué dependencia falla | `dependency` acotado (ledger, notif, db): OK. |
| `nexo.queue.depth` | Gauge | Saturación de la cola de notificaciones | Sin label por mensaje. |

La regla de oro está en la propia especificación: **no uses como label nada de alta cardinalidad** —`user_id`, UUID, email, referencia individual de transferencia. Cada valor distinto crea un *time series* nuevo; miles de usuarios = miles de series = costo y lentitud, sin ganancia analítica. El modelo de datos de OTel y las guías de Prometheus lo advierten explícitamente ([OTel, *Metrics Data Model*](https://opentelemetry.io/docs/specs/otel/metrics/data-model/); [Prometheus, *Naming*](https://prometheus.io/docs/practices/naming/); [Prometheus, *Instrumentation*](https://prometheus.io/docs/practices/instrumentation/)).

> **Fact vs. inferencia.** Es un **hecho citado** que la cardinalidad de labels impacta costo y rendimiento (docs de OTel/Prometheus). Es una **decisión de diseño** nuestra usar `amount_bucket` y `outcome` acotados. El umbral exacto de "demasiada cardinalidad" es **dependiente del backend y del tráfico reales** y no se puede inventar: se mide.

---

## 9. El Collector y el pipeline de telemetría

El **OpenTelemetry Collector** recibe, procesa y exporta telemetría. Es el punto natural para **sanitizar** antes de que el dato llegue a cualquier backend. Configurarlo "a ciegas" es riesgoso: los procesadores, sus claves y las distribuciones **cambian**; validá contra la doc de tu versión ([OTel, *Collector Configuration*](https://opentelemetry.io/docs/collector/configuration/)).

**Ejemplo deliberadamente pequeño (ilustrativo):**

```yaml
receivers:
  otlp:
    protocols:
      grpc: {}
      http: {}

processors:
  attributes/sanitize:
    actions:
      - key: enduser.id        # atributo semántico que podría identificar a una persona
        action: delete         # se elimina ANTES de exportar
  batch: {}                    # agrupa para eficiencia de red

exporters:
  debug: {}                    # imprime en consola; NO es un backend productivo

service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [attributes/sanitize, batch]
      exporters: [debug]
```

**Lecturas del ejemplo:**

- El `attributes` processor **borra `enduser.id`** antes del export. Esto es defensa en profundidad: aunque un servicio emita el atributo por error, no sale del Collector.
- El exporter **`debug`** imprime lo recibido en consola —ideal para *ver* qué llega—. Sustituyó al viejo exporter `logging`, deprecado en septiembre de 2024 ([OTel Collector, *debug exporter*](https://opentelemetry.io/docs/collector/configuration/)). **No es** un backend de almacenamiento; en un pipeline real, `debug` convive con el exporter productivo mientras depurás y luego se quita.
- **¿Cómo probar que el dato no llega al exporter?** Un test de integración que envíe un span con `enduser.id` a través del Collector y **asegure que el exporter `debug` no lo muestra**. Esa es evidencia reproducible, no una promesa.
- **Riesgo de sanitizar de más:** si borrás un atributo que una consulta necesita (p. ej. `dependency`), rompés el diagnóstico. Por eso la sanitización se **revisa** contra las consultas que el equipo realmente usa.

> **Vendor-neutral, en serio.** OpenTelemetry es el estándar de **instrumentación y transporte**; no es un backend de almacenamiento ni de visualización, y no garantiza interoperabilidad ilimitada con cualquier componente sin verificarlo. Si en tu organización hay un APM, mantenelo **secundario**: el valor de este diseño es que podés cambiar de backend sin re-instrumentar.

---

## 10. Caso Nexo Finanzas: una transferencia trazable sin datos sensibles

Integramos todo en el journey ficticio de referencia. El diagrama muestra cómo una prueba, la API, el ledger y las notificaciones producen señales que convergen en un reporte de calidad.

<figure class="diagram">
  <img src="/blog/diagrams/observabilidad-quality-engineering-evidencia-explicable-3.svg" width="1045" height="256" alt="Diagrama: observabilidad-quality-engineering-evidencia-explicable (3)" loading="lazy" decoding="async" />
</figure>

**Decisiones del diseño:**

- La prueba genera un `run_id` y participa del `trace context`: es el **origen** de la traza, no un observador externo.
- `Transfer API`, `Ledger` y `Notificaciones` emiten las tres señales bajo el mismo `trace_id`; la propagación (§5) es lo que las une.
- El **reporte de calidad** es la fuente de verdad de la corrida: guarda `run_id`, `commit`, `outcome` y —cuando el diseño lo permite— el `trace_id` para saltar a la traza. **No** guarda PII ni secretos.

Correspondencia con los repositorios del portfolio (ficticio, **no** desplegado):

| Repo | Rol en observabilidad |
|---|---|
| `nexo-transfer-api` | Define el contrato de telemetría de `transfer.create`, cambios de estado e idempotencia, sin exponer cuenta/token/PII. |
| `nexo-web-banking-e2e`, `nexo-wallet-mobile` | Adjuntan evidencia de ejecución **redactada** y enlazan a una traza/correlación segura cuando el diseño lo permite. |
| `nexo-cross-channel-regression` | Usa la telemetría para **demostrar que el journey cruzó las capas esperadas**, no para duplicar la cobertura funcional. |
| `nexo-performance-lab` | Usa trazas y métricas para **separar** el límite del generador, la API, la base y la dependencia; no toma un gráfico aislado como causa raíz. |
| `nexo-quality-control-tower` | Indexa **metadatos no sensibles** de ejecución y enlaces a evidencia; **no** es un almacén de logs ni de secretos. |

El detalle de *cómo* enlazar el test con la evidencia y *qué hacer cuando el sampling descarta la traza* está en el [artículo 3](/blog/diagnosticar-test-flaky-con-trazas-metodo-evidencia/).

---

## 11. Madurez y siguiente paso

No hace falta llegar a un sistema completo el primer día. Una progresión honesta:

<figure class="diagram">
  <img src="/blog/diagrams/observabilidad-quality-engineering-evidencia-explicable-4.svg" width="1400" height="108" alt="Diagrama: observabilidad-quality-engineering-evidencia-explicable (4)" loading="lazy" decoding="async" />
</figure>

- **Nivel 0 → 1:** dar esquema a los logs y quitar PII. Barato, alto impacto.
- **Nivel 1 → 2:** instrumentar los journeys críticos con trazas e inyectar `trace_id` en los logs. Ya podés saltar de un log a una traza.
- **Nivel 2 → 3:** escribir el **contrato de telemetría** por journey (atributos permitidos/prohibidos, cardinalidad, retención). Es el tema del [artículo 2](/blog/contrato-de-telemetria-privacidad-cardinalidad-gobernanza/).
- **Nivel 3 → 4:** un test verifica el contrato en CI, y existe gobernanza (owner, revisión de schema, auditoría de acceso).

**Qué aprendimos**

1. Un test rojo sin contexto es una discusión; con evidencia correlacionada es una **clasificación**.
2. Logs, métricas y trazas responden preguntas distintas; su valor está en la **correlación**, no en el volumen.
3. La telemetría se diseña **desde el comportamiento** (criterio de aceptación → contrato), no desde la herramienta.
4. La correlación se sostiene sobre **propagación de contexto**; se rompe donde no la pusiste.
5. Cardinalidad, sampling, retención, costo y privacidad son **decisiones de arquitectura**, no detalles.

**Próximos pasos / enlaces internos**

- [Artículo 2 — El contrato de telemetría: privacidad, cardinalidad y costo como decisiones de arquitectura](/blog/contrato-de-telemetria-privacidad-cardinalidad-gobernanza/)
- [Artículo 3 — Diagnosticar un test flaky con trazas: método, evidencia y límites](/blog/diagnosticar-test-flaky-con-trazas-metodo-evidencia/)

---

## 12. Anti-patrones

| # | Anti-patrón | Consecuencia | Señal de detección | Alternativa |
|---|---|---|---|---|
| 1 | Loguear payloads completos, tokens, PII o números de cuenta "para debuggear". | Filtración de datos; incumplimiento. | Grep de campos sensibles en logs. | Allowlist de campos + agrupación (`amount_bucket`). |
| 2 | Usar UUID/email/referencia como **label de métrica**. | Explosión de cardinalidad, costo, lentitud. | Conteo de series por métrica. | Labels acotados (`outcome`, `dependency`). |
| 3 | Crear dashboards antes de definir preguntas y owners. | Paneles verdes que nadie interpreta. | Dashboard sin dueño ni decisión asociada. | Pregunta → señal → decisión → dashboard. |
| 4 | Logs en cada línea sin schema ni correlación. | Ruido; nada se agrega ni correlaciona. | Logs sin `trace_id`. | Eventos con esquema y `trace_id`. |
| 5 | Un span por detalle interno (o una sola traza gigante). | Se pierde el journey que importa. | Trazas con cientos de spans triviales. | Spans en fronteras de negocio/dependencia. |
| 6 | Romper la propagación en async/colas y esperar magia. | Trazas huérfanas; correlación imposible. | Spans sin parent en el consumidor. | Inyectar/extraer contexto explícitamente (§5). |
| 7 | Instrumentar sin versionar semántica, con nombres ambiguos. | Atributos inconsistentes entre servicios. | Mismos datos con nombres distintos. | Convenciones semánticas + namespace propio. |
| 8 | Samplear sin documentar qué investigaciones se pierden. | Trazas ausentes justo cuando importan. | "No está la traza del fallo". | Documentar la política; ver [artículo 2](/blog/contrato-de-telemetria-privacidad-cardinalidad-gobernanza/). |
| 9 | Creer que una gráfica "verde" descarta defectos de negocio. | Bugs funcionales invisibles a infra. | Alertas verdes con quejas de usuarios. | Métricas de **outcome**, no solo de infra. |
| 10 | Usar el `trace_id` como sustituto de política de evidencia. | Sin clasificación ni ownership. | "Tenemos el trace" sin decisión. | Evidencia + clasificación + owner (art. 3). |

---

## 13. Checklist

- [ ] Cada journey crítico tiene definido **qué spans/atributos/eventos/métricas** emite y cuáles están **prohibidos**.
- [ ] Ningún ejemplo ni log real contiene PII, tokens, cuentas o payloads completos.
- [ ] Los atributos de alta cardinalidad y sensibles están **restringidos** (allowlist).
- [ ] La propagación de contexto (`traceparent`) funciona **también** en async/colas.
- [ ] Los logs llevan `trace_id`/`span_id` y esquema; se verificó que la librería los inyecta en **tu** versión.
- [ ] Las métricas de calidad miden **outcome**, no solo infraestructura, y sus labels son de baja cardinalidad.
- [ ] El Collector sanitiza atributos sensibles y existe un test que lo demuestra.
- [ ] El reporte de CI enlaza `run_id`, `commit` y (si el diseño lo permite) `trace_id`, sin exponer datos.
- [ ] Snippets validados contra la **versión exacta** del SDK/Collector antes de publicar.
- [ ] Se reconoce que ausencia de traza puede ser **sampling/telemetría rota**, no ausencia de ejecución.

---

## 14. Fuentes consultadas (2026-07-09)

- OpenTelemetry — *Observability Primer*: https://opentelemetry.io/docs/concepts/observability-primer/
- OpenTelemetry — *Trace Specification* (estable): https://opentelemetry.io/docs/specs/otel/trace/
- OpenTelemetry — *Specification Status Summary* (traces/logs/baggage estables; metrics mixto): https://opentelemetry.io/docs/specs/status/
- OpenTelemetry — *Logs Data Model* (correlación con trace/span/resource): https://opentelemetry.io/docs/specs/otel/logs/data-model/
- OpenTelemetry — *Metrics Data Model* (streams, atributos, cardinalidad): https://opentelemetry.io/docs/specs/otel/metrics/data-model/
- OpenTelemetry — *Semantic Conventions* (v1.43.0 al consultar; HTTP estable): https://opentelemetry.io/docs/specs/semconv/
- OpenTelemetry — *Context Propagation*: https://opentelemetry.io/docs/concepts/context-propagation/
- OpenTelemetry — *Collector Configuration* (exporter `debug` reemplaza `logging`): https://opentelemetry.io/docs/collector/configuration/
- W3C — *Trace Context* (Recomendación, Nivel 1): https://www.w3.org/TR/trace-context/
- W3C — *Trace Context Level 2* (Candidate Recommendation): https://www.w3.org/TR/trace-context-2/
- Prometheus — *Metric and Label Naming*: https://prometheus.io/docs/practices/naming/
- Prometheus — *Instrumentation Best Practices*: https://prometheus.io/docs/practices/instrumentation/

> **Aviso.** Este artículo es material técnico-educativo, no asesoramiento legal ni de cumplimiento. Toda mención a estándares o regulación debe verificarse contra la fuente oficial vigente en tu jurisdicción y versión.

