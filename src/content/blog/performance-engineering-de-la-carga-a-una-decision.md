---
title: "Performance Engineering no es tirar tráfico: de un journey crítico a una decisión de producto"
description: "Cómo dejar de perseguir el número de 'usuarios concurrentes' y construir un sistema de hipótesis, medición y decisión: journeys críticos, modelo de carga, SLIs/SLOs y evidencia reproducible aplicados a un laboratorio ficticio de Nexo Finanzas."
pubDate: 2026-07-09
tags: ["performance-engineering", "sre", "slo", "quality-engineering", "load-testing", "capacity"]
cluster: "06"
clusterTitle: "Performance engineering, SLO y capacidad"
type: "pilar"
order: 1
icon: "chart"
iconHue: 12
readingLevel: "Intermedio"
repo: "nexo-performance-lab"
---
> **Bajada.** Un test que "soporta 1.000 usuarios" no dice casi nada. Performance Engineering no es golpear un endpoint hasta romperlo, sino declarar qué experiencia importa, modelar una demanda plausible, medir el comportamiento completo con contexto, hacer visibles los límites y convertir la evidencia en decisiones de arquitectura, capacidad y entrega. Este es el artículo pilar de una colección; los satélites profundizan en SLOs, diseño experimental con JMeter e interpretación de resultados.

**Resumen ejecutivo.** Vas a salir de acá con un modelo mental que va del *journey* de negocio al modelo de carga, de la telemetría a la decisión de release. Usamos como hilo conductor un caso ficticio —el journey "crear transferencia" en **Nexo Finanzas**— y dejamos declarada la evidencia mínima que hace defendible una conclusión. No hay números de benchmark reales: cualquier cifra está rotulada como **dato ficticio ilustrativo**.

## Índice

1. [La trampa del test que "soporta 1.000 usuarios"](#1-la-trampa-del-test-que-soporta-1000-usuarios)
2. [Performance como atributo de producto y de calidad](#2-performance-como-atributo-de-producto-y-de-calidad)
3. [Vocabulario mínimo sin simplificaciones peligrosas](#3-vocabulario-mínimo-sin-simplificaciones-peligrosas)
4. [Del journey de negocio al modelo de carga](#4-del-journey-de-negocio-al-modelo-de-carga)
5. [Dos diagramas que ordenan la disciplina](#5-dos-diagramas-que-ordenan-la-disciplina)
6. [La evidencia mínima de un experimento honesto](#6-la-evidencia-mínima-de-un-experimento-honesto)
7. [Anti-patrones que hay que nombrar](#7-anti-patrones-que-hay-que-nombrar)
8. [Nexo Finanzas: cómo se conecta con el repositorio](#8-nexo-finanzas-cómo-se-conecta-con-el-repositorio)
9. [Un plan de madurez, no un big-bang](#9-un-plan-de-madurez-no-un-big-bang)
10. [Qué aprendimos y próximos pasos](#10-qué-aprendimos-y-próximos-pasos)
11. [Checklist para aplicar](#11-checklist-para-aplicar)

## Prerrequisitos y glosario mínimo

Para seguir el artículo alcanza con: entender qué es una petición HTTP y un endpoint REST, haber visto una respuesta con estados 2xx/4xx/5xx, y tener nociones de CI/CD (un pipeline que corre pasos automáticos). No hace falta estadística avanzada; los percentiles se explican donde aparecen.

Glosario que usaremos:

- **Journey (recorrido crítico):** secuencia de pasos que un usuario hace para lograr un objetivo de negocio (p. ej., iniciar sesión → validar destinatario → confirmar transferencia).
- **SLI (Service Level Indicator):** una medida cuantitativa de un aspecto del servicio; según el SRE Book de Google, *"a carefully defined quantitative measure of some aspect of the level of service that is provided"* ([Google SRE Book, cap. 4](https://sre.google/sre-book/service-level-objectives/), consultado 2026-07-09).
- **SLO (Service Level Objective):** el objetivo o rango que ese SLI debe cumplir.
- **SLA (Service Level Agreement):** un compromiso contractual con consecuencias (típicamente económicas) por incumplir SLOs. **No** se deduce automáticamente de un test.
- **Error budget:** el complemento del SLO (si el SLO es 99,9 %, el presupuesto de error es 0,1 %); una tasa de fallo tolerada que se usa como insumo de decisión.
- **p95 / p99:** el valor de latencia por debajo del cual cae el 95 % / 99 % de las observaciones.

## 1. La trampa del test que "soporta 1.000 usuarios"

Imaginá este resultado, **ficticio y a propósito ambiguo**:

> "Corrimos la prueba: la API de transferencias soporta 1.000 usuarios concurrentes."

Suena tranquilizador y no significa casi nada. Antes de creerle, faltan preguntas cuya ausencia convierte la afirmación en humo:

- **¿1.000 usuarios haciendo qué?** ¿Todos confirmando una transferencia al mismo tiempo, o navegando el historial? La *mezcla de operaciones* cambia el resultado por completo.
- **¿"Concurrentes" en qué modelo?** ¿1.000 conexiones abiertas esperando, o 1.000 transferencias *iniciándose por segundo*? Concurrencia y tasa de llegada (*arrival rate*) no son lo mismo (lo vemos en la sección 3).
- **¿Soporta con qué latencia y qué tasa de error?** "No se cayó" no es un criterio. ¿El p95 fue 200 ms o 9 s? ¿Hubo 0,1 % o 12 % de errores?
- **¿Con qué datos y en qué entorno?** ¿Todos transfiriendo desde la *misma* cuenta (contención artificial) o desde cuentas distintas? ¿En una laptop o en un entorno dimensionado?
- **¿El generador de carga aguantó?** Si el que se saturó fue el cliente, medimos el generador, no la API.
- **¿Un 2xx contó como éxito?** Una transferencia puede responder 200 y no haberse registrado, o haberse duplicado por un reintento.

> **Distinción honesta.** "Soporta 1.000 usuarios" es, en el mejor caso, una **inferencia** débil sobre un experimento sin contexto. La afirmación útil sería una **decisión** ("bajo el perfil P con datos D en el entorno E, el journey conserva sus criterios de negocio con p95 ≤ objetivo y error de negocio ≤ objetivo") respaldada por evidencia reproducible.

El resto del artículo es, básicamente, cómo transformar la primera frase en la segunda.

## 2. Performance como atributo de producto y de calidad

La performance no es una métrica técnica aislada: es una propiedad de la **experiencia** y del **negocio**. Cuatro efectos que conviene tener presentes:

- **Latencia ↔ confianza.** En un flujo de dinero, una confirmación lenta genera reintentos del usuario, duplicados percibidos y llamados a soporte. La lentitud no solo molesta: cambia el comportamiento.
- **Disponibilidad parcial ↔ corrección.** Bajo carga, un sistema puede seguir respondiendo pero empezar a *degradar la corrección* (timeouts que dejan estados intermedios, colas que reordenan). Medir solo "responde/no responde" oculta esto.
- **Costo ↔ arquitectura.** La capacidad tiene precio. Un p99 aceptable a costa de sobredimensionar 5× es una decisión de producto, no un detalle de infraestructura.
- **Colas largas ↔ realidad.** El promedio esconde a los usuarios peor atendidos. Si el 1 % peor tarda 10 s, para un banco eso puede ser miles de personas por día.

Por eso la performance se trata como cualquier atributo de calidad: se declara un objetivo *ligado a la experiencia*, se mide con contexto y se decide con evidencia. Google formaliza esa idea con SLIs, SLOs y error budgets, y —clave— insiste en que el objetivo se elige a partir de lo que el usuario necesita, no de la métrica más fácil de recolectar ([Google SRE Book, "Service Level Objectives"](https://sre.google/sre-book/service-level-objectives/), consultado 2026-07-09). Que un 100 % de fiabilidad sea ni realista ni deseable —y que por eso exista un *error budget*— es uno de los aportes conceptuales más útiles del libro ([Google SRE Book, "Embracing Risk"](https://sre.google/sre-book/embracing-risk/), consultado 2026-07-09).

## 3. Vocabulario mínimo sin simplificaciones peligrosas

Estos términos se confunden todo el tiempo, y la confusión es la raíz de la mayoría de los reportes inútiles.

| Término | Qué es | Trampa frecuente |
|---|---|---|
| **Carga (load)** | Demanda representativa esperada | Confundir "representativa" con "máxima" |
| **Estrés (stress)** | Demanda por encima de lo esperado para hallar el punto de quiebre | Presentar el quiebre como "capacidad" |
| **Spike** | Aumento brusco y repentino | Medir solo estado estable y no la recuperación |
| **Soak / endurance** | Carga sostenida por horas para detectar fugas y degradación | Correr 5 minutos y llamarlo soak |
| **Capacidad** | Relación entre demanda, latencia, errores, recursos y dependencias | Reducirla a un único número |
| **Benchmark comparativo** | Comparación bajo condiciones controladas | Comparar peras con manzanas (entornos distintos) |

Y cuatro pares que **no** son sinónimos:

- **Throughput** (peticiones completadas por unidad de tiempo) vs. **concurrencia** (peticiones en vuelo simultáneas) vs. **arrival rate** (peticiones *iniciadas* por unidad de tiempo).
- **Carga abierta vs. cerrada.** En un **modelo cerrado** hay un número fijo de usuarios virtuales; cada uno lanza la siguiente petición *recién cuando termina la anterior*. Ahí el throughput queda limitado por la latencia: si el sistema se pone lento, el generador… manda menos carga (justo cuando debería insistir). En un **modelo abierto**, las llegadas son independientes de las respuestas: se sostiene una tasa de llegada aunque el sistema sufra. El tráfico real de una app suele parecerse más al modelo abierto; muchas herramientas, por defecto, generan modelo cerrado. Esta diferencia es la semilla de la *coordinated omission* (ver el [artículo 4](/blog/percentiles-capacidad-quality-gates/)).
- **Saturación** (un recurso llega a su límite y empieza a formarse cola) vs. **backpressure** (el mecanismo por el cual el sistema *le pide al productor que baje el ritmo* en vez de aceptar trabajo que no puede procesar). Un sistema sin backpressure no falla mejor bajo saturación: falla peor.
- **SLI/SLO/SLA/error budget** (sección de glosario). El error más caro es tratar un SLO interno como si fuera un SLA contractual.

> **Por qué importa.** El capítulo de *Handling Overload* del SRE Book desarrolla por qué la carga admisible, la degradación y las protecciones (rechazo elegante, backpressure) son parte del diseño, no un accidente ([Google SRE Book, "Handling Overload"](https://sre.google/sre-book/handling-overload/), consultado 2026-07-09).

## 4. Del journey de negocio al modelo de carga

Tomemos el journey ficticio **"crear transferencia"** en Nexo Finanzas. Antes de escribir un solo `.jmx`, se modela la demanda a partir del comportamiento, no al revés.

**Pasos del journey (ficticios):**

1. Autenticación de prueba (token de un entorno aislado).
2. Validación del destinatario (lookup).
3. Creación de la transferencia (operación con efecto: cambia estado).
4. Consulta del estado final (confirmación).

**Dimensiones del modelo de carga a declarar:**

- **Población y mezcla de operaciones.** No todos crean transferencias: quizás (dato ficticio ilustrativo) el 70 % consulta, el 20 % valida destinatarios y el 10 % confirma. Un modelo 100 % de escritura no representa nada real.
- **Modelo de llegada (abierto/cerrado) y ramp-up.** Se elige y se *declara* después de validar la semántica de la herramienta. El ramp-up evita el artefacto de arrancar en frío con toda la carga de golpe.
- **Think time.** Las personas no disparan la siguiente acción en 0 ms. Un think time realista cambia radicalmente la concurrencia observada.
- **Variación de datos.** Cada usuario virtual necesita su propia cuenta origen/destino y su propia clave de idempotencia. Cargar siempre el mismo dato mide contención de un registro, no del sistema (anti-patrón n.º 4).
- **Picos y duración.** ¿Hay un pico a fin de mes? ¿La prueba debe incluir warm-up, estado estable y ramp-down?
- **Dependencia de horario/región** si es relevante para el journey.

> **Decisión de diseño, no ley física.** Este modelo es una hipótesis explícita sobre la demanda. Su valor no está en ser "el tráfico real" —no lo es— sino en ser **declarado, reproducible y discutible**. El detalle de cómo aterrizar esto en una ficha de experimento y en JMeter está en el [artículo 3](/blog/experimento-carga-responsable-jmeter/).

## 5. Dos diagramas que ordenan la disciplina

### Diagrama 1 — Diseño de un experimento de carga observable

Un experimento útil separa cuatro cosas que suelen confundirse: el modelo, el generador, el sistema y sus dependencias. Y captura evidencia de **ambos lados** (cliente y servidor) para poder atribuir un cambio a la capa correcta.

<figure class="diagram">
  <img src="/blog/diagrams/performance-engineering-de-la-carga-a-una-decision-1.svg" alt="Diagrama: performance-engineering-de-la-carga-a-una-decision (1)" loading="lazy" decoding="async" />
</figure>

Lectura del diagrama: la carga nace de un **modelo** (sección 4), la ejecuta un **generador** que hay que verificar que no se sature, golpea la **API** que a su vez depende de **base y colas**. Los **resultados del cliente** (lo que el generador midió) y las **métricas/trazas** del servidor confluyen en el **análisis**. Si solo mirás una rama, no podés distinguir "la API está lenta" de "mi generador se quedó sin CPU".

### Diagrama 2 — Del SLI a un gate de entrega

<figure class="diagram">
  <img src="/blog/diagrams/performance-engineering-de-la-carga-a-una-decision-2.svg" alt="Diagrama: performance-engineering-de-la-carga-a-una-decision (2)" loading="lazy" decoding="async" />
</figure>

Lectura: el gate de entrega no nace de un número arbitrario. Nace de un **journey** → un **SLI** que se parece a la experiencia → un **SLO acordado** entre producto, ingeniería y operaciones → un **experimento reproducible** cuya **comparación con evidencia** habilita dos salidas legítimas: **decidir el release** o **abrir una investigación**. Nótese que "resultado inconcluso" es una salida válida, no un fracaso.

> Ambos diagramas son deliberadamente simples. Si necesitás validarlos, están escritos en sintaxis `flowchart` estándar de Mermaid; el texto los explica para que no dependan de que rendericen.

## 6. La evidencia mínima de un experimento honesto

Un reporte defendible conserva evidencia de cinco categorías. Cada una responde una pregunta distinta y tiene un riesgo de mala interpretación propio.

| Categoría | Evidencia a conservar | Pregunta que responde | Riesgo de interpretación |
|---|---|---|---|
| **Hipótesis y modelo** | Perfil de carga, mezcla, datos, versiones y límites | ¿Qué se intentó comprobar? | No representa automáticamente tráfico real |
| **Cliente de carga** | Resultado crudo, tasa efectivamente generada y recursos del generador | ¿La carga fue la planeada? | El generador puede saturarse o introducir sesgo |
| **Servicio** | Latencia, errores, saturación, colas y trazas correlacionadas | ¿Dónde cambió el comportamiento? | Correlación no demuestra causalidad |
| **Negocio** | Outcomes válidos, duplicados, rechazos esperados e integridad | ¿El sistema siguió haciendo lo correcto? | Un 2xx no basta para inferir éxito de negocio |
| **Decisión** | Conclusión, limitaciones, owner y siguiente acción | ¿Qué se hará con el resultado? | No debe disfrazar un experimento inconcluso |

Regla práctica: el informe debe mostrar **series temporales o una tabla por fase** (warm-up, estado estable, ramp-down), no solo una captura final. Un promedio global aplasta el momento exacto en que el sistema empezó a sufrir. Cómo leer esas series —y por qué el promedio miente— es el tema del [artículo 4](/blog/percentiles-capacidad-quality-gates/).

## 7. Anti-patrones que hay que nombrar

Resumen ejecutivo (cada satélite desarrolla los que le competen, con causa → consecuencia → alternativa):

1. **Declarar capacidad con un único número de usuarios**, sin modelo de llegada, mezcla ni duración. → Alternativa: reportar capacidad como relación demanda/latencia/errores/recursos.
2. **Usar solo el promedio.** → Alternativa: percentiles + distribución + errores de negocio.
3. **Correr con GUI/listeners pesados o generador subdimensionado y culpar a la API.** → Alternativa: verificar recursos del generador y ejecutar en modo no-GUI.
4. **Cargar siempre el mismo usuario/cuenta/dato mutable.** → Alternativa: dato único por usuario virtual, preservando semántica de negocio.
5. **Medir la app sin telemetría de dependencias, base, pool de conexiones o colas.** → Alternativa: instrumentar toda la cadena.
6. **Convertir un test de estrés en un gate por pull request** sin presupuesto de tiempo ni control de variabilidad. → Alternativa: gates acotados con baseline versionado.
7. **Reintentar o ignorar fallos para "mejorar" el gráfico.** → Alternativa: contar el fallo; investigar la causa.
8. **Afirmar que un entorno no productivo prueba capacidad productiva** sin documentar diferencias. → Alternativa: declarar el delta de entorno como amenaza a la validez.
9. **Tratar un 2xx como éxito** sin validar idempotencia, estado final o auditoría. → Alternativa: definir *allowed business outcomes*.
10. **Ejecutar tráfico disruptivo contra terceros o producción** sin autorización ni blast radius explícito. → **Nunca**: requiere autorización formal, límite de impacto, observabilidad y plan de parada.

> **Seguridad y ética.** Nunca ejecutes pruebas disruptivas contra producción, terceros o sistemas financieros reales sin autorización explícita, límite de impacto, observabilidad y plan de parada. Todo en esta colección asume un entorno de integración aislado y datos ficticios.

## 8. Nexo Finanzas: cómo se conecta con el repositorio

Nexo Finanzas es **ficción educativa**. No representa tráfico, umbrales ni controles de una entidad real. La integración propuesta reparte responsabilidades:

- **`nexo-transfer-api`** expone el contrato para crear y consultar transferencias. El laboratorio valida corrección de negocio *junto a* métricas técnicas.
- **`nexo-performance-lab`** es dueño de los planes de carga, perfiles, generadores de datos, la ficha de hipótesis y el análisis reproducible. El `.jmx` es *solo un artefacto* dentro de ese sistema, no "la prueba".
- **`nexo-quality-platform`** publica metadatos de ejecución (commit, imagen, seed, perfil, resultado, enlaces a trazas y limitaciones) **sin secretos ni PII**.
- **`nexo-cross-channel-regression`** aporta semántica de negocio pero **no** se convierte en generador de carga; el laboratorio usa una capa de API o un diseño explícitamente justificado.

Invariantes de una transferencia ficticia que el laboratorio debe cuidar: no duplicar por reintento, no mezclar cuentas entre usuarios, y distinguir **rechazo esperado** (regla de negocio) de **error de plataforma**.

Y el artefacto de gobierno: **ADR-004 — "Performance gates basados en evidencia comparable"**, que se detalla y redacta en el [artículo 4](/blog/percentiles-capacidad-quality-gates/) y en el plan de implementación de la colección.

## 9. Un plan de madurez, no un big-bang

No se llega a "gates de performance en CI" en un salto. Una progresión razonable (decisión de diseño, no receta universal):

<figure class="diagram">
  <img src="/blog/diagrams/performance-engineering-de-la-carga-a-una-decision-3.svg" alt="Diagrama: performance-engineering-de-la-carga-a-una-decision (3)" loading="lazy" decoding="async" />
</figure>

- **N0 — Baseline local reproducible.** Ficha de experimento + plan versionado + datos aislados. Objetivo: poder repetir.
- **N1 — Ejecución integrada controlada.** En un entorno dimensionado, con telemetría del servicio y sus dependencias.
- **N2 — Trend histórico.** Comparar contra baselines versionados, no contra "lo que me acuerdo".
- **N3 — Objetivos operativos acordados.** SLOs y error budgets negociados; gates defendibles.

Saltarse N0/N1 y poner un gate de estrés por PR es el anti-patrón n.º 6.

## 10. Qué aprendimos y próximos pasos

- Un número de "usuarios concurrentes" no es una conclusión; es, en el mejor caso, el principio de una pregunta.
- La performance es un atributo de producto: se declara ligada a la experiencia, se mide con contexto y se decide con evidencia.
- Un experimento honesto separa modelo, generador, servicio y negocio, y admite resultados inconclusos.

**Seguí por los satélites de esta colección:**

- **[SLIs que se parecen a la experiencia: definir SLOs y error budgets sin autoengañarse](/blog/slis-slos-error-budgets-sin-autoenganarse/)** — cómo construir el eje SLI→SLO→gate.
- **[Diseñar un experimento de carga responsable con JMeter (sin culpar a la API)](/blog/experimento-carga-responsable-jmeter/)** — la ficha de experimento, el modelo abierto/cerrado, datos únicos y JMeter en modo no-GUI.
- **[Leer resultados de performance: percentiles, coordinated omission, capacidad y quality gates](/blog/percentiles-capacidad-quality-gates/)** — interpretar la evidencia y decidir un gate defendible, con ADR-004.

## 11. Checklist para aplicar

- [ ] Definí el journey crítico antes de pensar en herramientas.
- [ ] Escribiste el modelo de carga (población, mezcla, llegada, think time, datos, duración) como hipótesis explícita.
- [ ] Elegiste modelo abierto/cerrado **después** de validar la semántica de la herramienta.
- [ ] La evidencia cubre cliente, servicio, negocio y decisión.
- [ ] Ningún número ficticio se presenta como medición real o SLA.
- [ ] El reporte muestra fases (warm-up/estable/ramp-down), no solo un total.
- [ ] Declaraste las amenazas a la validez (entorno, generador, datos).
- [ ] Nada se ejecuta contra producción/terceros sin autorización, límite de impacto y plan de parada.

---

### Fuentes (consultadas 2026-07-09)

- Google SRE Book — [Service Level Objectives](https://sre.google/sre-book/service-level-objectives/), [Embracing Risk](https://sre.google/sre-book/embracing-risk/), [Handling Overload](https://sre.google/sre-book/handling-overload/), [Addressing Cascading Failures](https://sre.google/sre-book/addressing-cascading-failures/).
- Apache JMeter — [Best Practices](https://jmeter.apache.org/usermanual/best-practices.html) (versión estable vigente 5.6.3).

> *Nota de honestidad intelectual:* este artículo distingue entre hechos citados (con enlace), inferencias, decisiones de diseño y datos ficticios ilustrativos. No contiene benchmarks, cobertura ni resultados de ejecución reales. Cualquier mención a regulación o estándares no constituye asesoramiento legal ni de cumplimiento.

