---
title: "Diseñar un experimento de carga responsable con JMeter (sin culpar a la API)"
description: "Antes del .jmx va la hipótesis. Ficha de experimento, modelo abierto vs. cerrado, Little's Law con sus límites, datos únicos por usuario virtual con idempotencia, y ejecución de JMeter en modo no-GUI verificada para la versión vigente, aplicado al laboratorio ficticio nexo-performance-lab."
pubDate: 2026-07-09
tags: ["jmeter", "load-testing", "performance-engineering", "experiment-design", "ci", "quality-engineering"]
cluster: "06"
clusterTitle: "Performance engineering, SLO y capacidad"
type: "satelite"
order: 3
icon: "chart"
iconHue: 12
readingLevel: "Intermedio–Avanzado"
repo: "nexo-performance-lab"
---
> **Bajada.** El `.jmx` es el último artefacto que deberías crear, no el primero. Un experimento de carga responsable empieza por una hipótesis, un modelo de demanda y un plan para no medir tu propio generador. Este satélite del pilar [Performance Engineering: de la carga a una decisión](/blog/performance-engineering-de-la-carga-a-una-decision/) baja a lo concreto: la ficha del experimento, el modelo abierto/cerrado, datos únicos por usuario virtual, y JMeter en modo no-GUI verificado para la versión vigente.

**Resumen ejecutivo.** Vas a construir `nexo-performance-lab` como *sistema* (hipótesis + perfiles + datos + análisis), del cual el `.jmx` es solo una pieza. Verás por qué el modelo de carga cerrado sesga la medición, cómo usar Little's Law para hacer *sanity checks* sin prometer capacidad, cómo garantizar idempotencia por usuario virtual, y cómo ejecutar JMeter en CLI sin arrastrar los listeners que lo vuelven inútil bajo carga. Todos los valores son **datos ficticios ilustrativos**.

## Índice

1. [Por qué el `.jmx` va al final](#1-por-qué-el-jmx-va-al-final)
2. [La ficha de experimento antes del script](#2-la-ficha-de-experimento-antes-del-script)
3. [Modelo abierto vs. cerrado (y por qué te importa)](#3-modelo-abierto-vs-cerrado-y-por-qué-te-importa)
4. [Little's Law como sanity check, no como promesa](#4-littles-law-como-sanity-check-no-como-promesa)
5. [Datos únicos por usuario virtual e idempotencia](#5-datos-únicos-por-usuario-virtual-e-idempotencia)
6. [JMeter en modo no-GUI, verificado](#6-jmeter-en-modo-no-gui-verificado)
7. [Que el generador no sea el cuello de botella](#7-que-el-generador-no-sea-el-cuello-de-botella)
8. [Observabilidad durante la prueba](#8-observabilidad-durante-la-prueba)
9. [Anti-patrones de diseño experimental](#9-anti-patrones-de-diseño-experimental)
10. [Qué aprendimos y próximos pasos](#10-qué-aprendimos-y-próximos-pasos)
11. [Checklist](#11-checklist)

## Prerrequisitos y glosario

Necesitás: HTTP y estados de respuesta, nociones de CI, y familiaridad con la terminal. Conviene haber leído el [pilar](/blog/performance-engineering-de-la-carga-a-una-decision/) (modelo de carga) y el satélite de [SLOs](/blog/slis-slos-error-budgets-sin-autoenganarse/).

- **Usuario virtual (VU) / thread:** una unidad concurrente simulada por el generador.
- **Warm-up:** fase inicial que se descarta para evitar el sesgo del arranque en frío (JIT, caches, pools).
- **Estado estable (steady state):** la fase en la que se mide.
- **Ramp-up / ramp-down:** subir/bajar la carga gradualmente.
- **JTL:** el formato de resultados crudos de JMeter.
- **Idempotencia:** propiedad por la cual repetir una operación no cambia el resultado más allá de la primera vez (clave para transferencias).

## 1. Por qué el `.jmx` va al final

Un `.jmx` sin hipótesis produce números sin significado. En `nexo-performance-lab`, el `.jmx` es un artefacto *dentro* de un sistema que también contiene: la **ficha de hipótesis**, los **perfiles** de carga por entorno, los **generadores de datos**, y el **análisis reproducible**. Si lo primero que abrís es JMeter, ya empezaste mal: no sabés qué estás tratando de refutar.

<figure class="diagram">
  <img src="/blog/diagrams/experimento-carga-responsable-jmeter-1.svg" alt="Diagrama: experimento-carga-responsable-jmeter (1)" loading="lazy" decoding="async" />
</figure>

## 2. La ficha de experimento antes del script

La ficha declara qué se intenta comprobar, en qué condiciones, y —crucial— **qué obliga a detener** el experimento. Es lo que hace la diferencia entre "corrí un test" y "tengo evidencia".

```yaml
experiment:
  id: PERF-TRANSFER-BASELINE-001
  journey: create-transfer
  hypothesis: "El journey conserva los criterios definidos bajo el perfil de carga declarado"
  environment: "integration-isolated"     # entorno aislado, datos ficticios
  code_revision: "<commit-sha>"            # trazabilidad exacta
  data_recipe: "seed-transfer-v3"          # cómo se sembraron los datos
  load_profile:
    arrival_model: "declarar open o closed DESPUES de validar la semántica de la herramienta"
    warmup: "duración documentada"         # se descarta del análisis
    steady_state: "duración documentada"   # se mide
    ramp_down: "duración documentada"
  stop_conditions:
    - "observability unavailable"          # sin telemetría, el experimento es inconcluso
    - "authorized safety threshold reached" # límite de impacto acordado
  evidence:
    - jtl_or_equivalent                    # resultado crudo del cliente
    - telemetry_snapshot                   # métricas/trazas del servicio
    - environment_manifest                 # qué era el entorno exactamente
```

Explicación de los campos que más se subestiman:

- **`arrival_model` vacío a propósito.** No se fija hasta validar qué semántica ofrece la herramienta (sección 3). Escribir "open" cuando la herramienta genera "closed" es autoengaño.
- **`stop_conditions`.** Si la observabilidad se cae, no tenés experimento: tenés ruido. Y un umbral de seguridad autorizado (p. ej., tasa de error o latencia de un dependiente) protege al entorno y a terceros.
- **`code_revision` + `data_recipe` + `environment_manifest`.** Sin estos tres, el experimento **no es reproducible** y, por lo tanto, no es evidencia. Ligá la ficha a una historia/riesgo y a un ADR (ver [artículo 4](/blog/percentiles-capacidad-quality-gates/)).

> **Sobre los objetivos de latencia.** No pongas un objetivo específico salvo que sea claramente ficticio y justificado para el ejemplo. El objetivo "de verdad" viene del SLO acordado ([artículo 2](/blog/slis-slos-error-budgets-sin-autoenganarse/)), no del test.

## 3. Modelo abierto vs. cerrado (y por qué te importa)

Esta es probablemente la decisión técnica más importante del diseño, y la que más se ignora.

- **Modelo cerrado:** N usuarios virtuales fijos; cada VU manda la siguiente petición *cuando termina la anterior* (más un think time). El **thread group clásico de JMeter es cerrado**. Consecuencia perversa: si el sistema se pone lento, cada VU espera más, así que el generador manda *menos* peticiones justo cuando el sistema está sufriendo. El throughput queda gobernado por la latencia del propio sistema.
- **Modelo abierto:** las llegadas son independientes de las respuestas; se sostiene una **tasa de llegada** aunque el sistema sufra. Se parece más al tráfico real de una app (los usuarios llegan los quiera o no tu servidor).

<figure class="diagram">
  <img src="/blog/diagrams/experimento-carga-responsable-jmeter-2.svg" alt="Diagrama: experimento-carga-responsable-jmeter (2)" loading="lazy" decoding="async" />
</figure>

**Consecuencia para la medición:** el modelo cerrado es una de las causas de la *coordinated omission* (el generador "omite" mandar las peticiones que tocaban durante un stall, y las latencias de tu reporte salen mejores de lo que fueron). Lo desarrollamos en el [artículo 4](/blog/percentiles-capacidad-quality-gates/).

> **Decisión de diseño en JMeter.** Si necesitás aproximar un modelo abierto o controlar el throughput, hay elementos pensados para *shaping* de carga (p. ej., temporizadores de throughput y planes que fijan tasa de llegada). Verificá el comportamiento exacto en la [doc de JMeter](https://jmeter.apache.org/usermanual/best-practices.html) de la versión que uses (estable vigente 5.6.3), porque los plugins y elementos evolucionan. La regla es: **declará el modelo que realmente estás generando**, no el que te gustaría.

## 4. Little's Law como sanity check, no como promesa

La Ley de Little relaciona, **en estado estable**, tres cantidades:

```text
L = λ × W
# L = trabajos en el sistema (concurrencia promedio)
# λ = tasa de llegada (throughput en estado estable)
# W = tiempo de respuesta promedio
```

Usos legítimos (inferencia con supuestos explícitos):

- **Sanity check:** si observás λ = 200 req/s (ficticio) y W = 0,25 s, esperás L ≈ 50 peticiones en vuelo. Si tu generador cerrado tiene 500 VUs, algo no cierra: probablemente think time alto o saturación.
- **Dimensionar VUs en modelo cerrado:** con think time Z y servicio R, el throughput de N VUs ≈ N / (R + Z). Sirve para *estimar cuántos VUs* necesitás, no para prometer capacidad.

Límites que **no** podés ignorar:

- Vale **en estado estable**; durante ramp-up/ramp-down o bajo saturación creciente, no.
- Requiere **unidades consistentes** (segundos con segundos).
- **No es un modelo de capacidad.** Que la fórmula "dé" 10.000 req/s no significa que el sistema los sostenga: la latencia no es constante, crece con la saturación.

> **Distinción honesta.** Little's Law es una **aproximación de modelado**, no una garantía. La usamos para detectar incoherencias en el diseño, nunca para "probar" que soportamos X.

## 5. Datos únicos por usuario virtual e idempotencia

Cargar siempre la misma cuenta mide contención de un registro; cargar datos únicos mide el sistema. Y en un flujo de dinero hay una trampa extra: **un reintento no puede inflar transferencias exitosas**.

```text
# Generación de datos por ejecución/VU (pseudocódigo)
transfer_reference = "perf-" + run_id + "-" + virtual_user + "-" + sequence
idempotency_key    = hash(run_id + virtual_user + sequence)
assert response.status in allowed_business_outcomes
record trace_id and transfer_reference without recording credentials
```

Por qué cada línea:

- **`transfer_reference` único** por `run_id`/VU/secuencia: evita colisiones entre ejecuciones y entre usuarios (invariante "no mezclar cuentas entre usuarios" del pilar).
- **`idempotency_key` determinístico** para una misma operación lógica: si el VU reintenta *la misma* transferencia, la API debe reconocerla y **no** crear un duplicado. Un reintento que crea una segunda transferencia es un bug de negocio, no "más throughput".
- **`allowed_business_outcomes`:** el conjunto de respuestas que cuentan como éxito de negocio (registrado idempotente, o rechazo esperado por regla). Un `2xx` fuera de ese conjunto **no** es éxito (ver [artículo 2](/blog/slis-slos-error-budgets-sin-autoenganarse/), *2xx mentiroso*).
- **Registrar `trace_id` y `transfer_reference`, nunca credenciales.** La correlación se hace por `trace_id`; los secretos no se loguean ni se versionan.

> **Seguridad.** Los perfiles (URLs base, tasas, duraciones) se versionan; las **credenciales no**. Se inyectan por variable de entorno o secreto del pipeline. Nunca commitees tokens, aunque sean de un entorno de prueba.

## 6. JMeter en modo no-GUI, verificado

La GUI de JMeter sirve para *construir* el plan, no para *ejecutarlo* bajo carga: el árbol de resultados y los listeners pesados consumen memoria y sesgan la medición. La ejecución real es en modo no-GUI (`-n`). Comando verificado contra la [doc oficial de JMeter](https://jmeter.apache.org/usermanual/get-started.html) (versión estable vigente **5.6.3**; requiere **Java 8+**, Java 17 recomendado — consultado 2026-07-09):

```bash
jmeter -n \
  -t plans/create-transfer.jmx \        # -t: plan de prueba (.jmx)
  -q profiles/integration.properties \  # -q: properties adicionales (perfil por entorno)
  -JbaseUrl="${BASE_URL}" \             # -J: define una propiedad JMeter (leída con __P/${__P()})
  -JrunId="${RUN_ID}" \
  -l "artifacts/${RUN_ID}.jtl" \        # -l: log de resultados crudos (JTL)
  -e -o "reports/${RUN_ID}"             # -e -o: genera el dashboard HTML al finalizar
```

Qué hace cada flag (todos vigentes en 5.6.3):

- **`-n`** ejecuta sin GUI. Es obligatorio para carga sostenida.
- **`-t`** especifica el `.jmx`.
- **`-q`** carga un archivo de propiedades adicional: así versionás el *perfil* (`integration.properties`) por entorno sin tocar el plan.
- **`-J`** define una propiedad de JMeter que el plan lee con `${__P(baseUrl)}`. Ideal para parametrizar `baseUrl` y `runId` sin hardcodear.
- **`-l`** vuelca los resultados crudos a un JTL (la evidencia del cliente).
- **`-e -o`** genera el reporte HTML *al terminar* (no en vivo), que es la forma barata de tener el dashboard sin el costo de listeners activos durante la corrida.

Advertencias que la doc respalda:

- **No dejes el "View Results Tree" ni listeners pesados activos** para carga sostenida: consumen memoria y distorsionan. Generá el HTML *post-run* con `-e -o`.
- **Protegé parámetros sensibles:** pasalos por `-J` desde variables de entorno/secretos, no en el `.jmx` versionado.
- **Verificá flags y comportamiento en tu versión.** JMeter 5.6.x corre con Java 8+, pero el *próximo major* requerirá Java 17+; si actualizás, revalidá ([JMeter, "Getting Started"](https://jmeter.apache.org/usermanual/get-started.html), consultado 2026-07-09).

## 7. Que el generador no sea el cuello de botella

Si el que se satura es JMeter, estás midiendo tu laptop, no la API (anti-patrón n.º 3 del pilar). Cómo detectarlo y evitarlo:

- **Instrumentá el generador.** CPU, memoria, GC del proceso JMeter y de la máquina. Si la CPU del generador está al 100 %, sospechá de todo tu p95.
- **Compará tasa *planeada* vs. tasa *efectivamente generada*.** Si pediste 200 req/s y el JTL muestra 140, el generador no alcanzó: el resultado es sobre 140, no sobre 200.
- **Escala horizontal si hace falta.** Un generador distribuido (varios nodos) puede ser necesario; una sola máquina de desarrollo casi nunca dimensiona una carga realista (no-alcance del pilar).
- **Cuidado con listeners y assertions caras.** Las aserciones deben ser *livianas* (status y una condición de negocio mínima), no parseos costosos por request.

> **Regla.** En el reporte, la "tasa efectivamente generada" y los "recursos del generador" son evidencia de primera clase (categoría *Cliente de carga* del pilar). Sin eso, no podés defender ninguna conclusión.

## 8. Observabilidad durante la prueba

El experimento captura evidencia de **ambos lados** (recordá el Diagrama 1 del pilar). Necesitás, del sistema bajo prueba:

- **API:** latencia (histograma, ver [artículo 2](/blog/slis-slos-error-budgets-sin-autoenganarse/)), tasa de error por tipo, saturación (CPU, threads, event loop).
- **Base y dependencias:** latencia de queries, **pool de conexiones** (¡el cuello de botella clásico!), locks, colas.
- **Colas/mensajería:** profundidad de cola, lag, reprocesos.
- **Trazas correlacionadas:** por `trace_id`, para poder ir del síntoma (latencia alta) a la causa (una dependencia lenta) sin adivinar.

El punto crítico: **separar síntomas de causas**. "El p95 subió" es un síntoma; "el pool de conexiones se agotó y las requests hicieron cola" es una causa. Sin telemetría de dependencias, atribuís la falla a la capa equivocada (anti-patrón n.º 5).

## 9. Anti-patrones de diseño experimental

| Anti-patrón | Causa | Consecuencia | Alternativa |
|---|---|---|---|
| **`.jmx` sin ficha de hipótesis** | Empezar por la herramienta | Números sin significado ni reproducibilidad | Ficha primero (id, revisión, datos, stop conditions) |
| **Declarar "open" pero generar "closed"** | No validar la semántica de la herramienta | Coordinated omission; p95 optimista | Declarar el modelo real; usar shaping si querés open |
| **Mismo dato mutable para todos los VUs** | Dataset perezoso | Contención artificial de un registro | Datos únicos por VU con idempotencia |
| **Reintento que crea duplicados** | Idempotency key mal diseñada | "Más throughput" que en realidad son bugs | `idempotency_key` determinístico + validación |
| **Ejecutar con GUI/listeners pesados** | Comodidad | Generador sesgado y saturado | Modo `-n`, HTML post-run con `-e -o` |
| **No mirar recursos del generador** | Foco solo en la API | Medir el generador y culpar a la API | Instrumentar generador; comparar tasa plan vs. real |
| **Credenciales en el `.jmx`** | Hardcodear para "que ande" | Secreto filtrado en el repo | `-J` desde env/secretos; versionar solo perfiles |

## 10. Qué aprendimos y próximos pasos

- El `.jmx` es una pieza; el experimento es el sistema (hipótesis + perfiles + datos + análisis).
- El modelo abierto/cerrado decide la validez de tu medición; declaralo con honestidad.
- Little's Law sirve para *sanity checks*, no para prometer capacidad.
- La idempotencia por VU protege la corrección de negocio bajo carga.
- Si no verificás que el generador no se satura, no tenés evidencia.

**Continuá con:**

- **[Leer resultados: percentiles, coordinated omission, capacidad y quality gates](/blog/percentiles-capacidad-quality-gates/)** — cómo interpretar el JTL y la telemetría, y decidir el gate.
- **[SLIs que se parecen a la experiencia](/blog/slis-slos-error-budgets-sin-autoenganarse/)** — el objetivo que este experimento pone a prueba.
- Volvé al pilar: **[Performance Engineering: de la carga a una decisión](/blog/performance-engineering-de-la-carga-a-una-decision/)**.

## 11. Checklist

- [ ] Escribiste la ficha de experimento antes del `.jmx` (id, revisión, data recipe, stop conditions).
- [ ] Elegiste y **declaraste** el modelo de llegada (abierto/cerrado) tras validar la herramienta.
- [ ] Usaste Little's Law solo como sanity check, con supuestos explícitos.
- [ ] Cada VU usa datos únicos; los reintentos son idempotentes y no duplican.
- [ ] Definiste *allowed business outcomes*; un 2xx no es éxito automático.
- [ ] Ejecutás en modo `-n`, con HTML post-run (`-e -o`) y sin listeners pesados.
- [ ] Verificaste flags y requisitos de Java para tu versión de JMeter (5.6.x → Java 8+).
- [ ] Instrumentaste el generador y comparás tasa planeada vs. efectiva.
- [ ] Tenés telemetría de API, base, pool de conexiones y colas correlacionada por `trace_id`.
- [ ] No hay credenciales en artefactos versionados.

---

### Fuentes (consultadas 2026-07-09)

- Apache JMeter — [Best Practices](https://jmeter.apache.org/usermanual/best-practices.html), [Getting Started](https://jmeter.apache.org/usermanual/get-started.html) (versión estable vigente **5.6.3**; JMeter 5.6.x requiere Java 8+, Java 17 recomendado; el próximo major requerirá Java 17+).
- Google SRE Book — [Handling Overload](https://sre.google/sre-book/handling-overload/) (protecciones y carga admisible).

> *Nota:* todos los valores (VUs, tasas, latencias) son datos ficticios ilustrativos. No ejecutes estas pruebas contra producción o terceros sin autorización formal, límite de impacto, observabilidad y plan de parada. Verificá flags y comportamiento de JMeter en tu versión antes de publicar cualquier plan.

