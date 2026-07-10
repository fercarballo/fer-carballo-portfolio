---
title: "Arquitectura de Quality Engineering orientada a riesgo"
description: "Guía para diseñar una arquitectura de Quality Engineering basada en riesgo: charter, portafolio de controles, entornos, evidencia y quality gates."
pubDate: 2026-07-09
tags: ["quality-engineering", "test-architecture", "risk-based-testing", "sdet", "ci-cd"]
cluster: "01"
clusterTitle: "Arquitectura de Quality Engineering"
type: "pilar"
order: 1
icon: "shield"
iconHue: 152
readingLevel: "Intermedio–Avanzado"
prerequisites: "Requiere testing básico, HTTP/REST y nociones de CI/CD."
---
> **Promesa del artículo.** Al terminar vas a poder diseñar y *defender* una arquitectura de calidad para un producto de riesgo medio o alto: qué probar, dónde, cuándo, con qué evidencia y quién es responsable de cada control. No vas a encontrar una receta de herramientas ni una pirámide como dogma, sino un método para conectar riesgos con controles y decisiones.

> **Nota de honestidad intelectual.** A lo largo del texto separo cuatro cosas: **hecho citado** (con enlace a fuente primaria), **decisión de diseño** (una opción entre varias, con su costo), **hipótesis** (algo plausible que habría que medir) y **ejemplo ficticio** (el caso *Nexo Finanzas*, una fintech inventada con datos sintéticos). Ninguna métrica de *Nexo Finanzas* proviene de un sistema real.

---

## 1. El problema real: una suite verde no es una estrategia de calidad

Imaginá el tablero de CI un lunes a la mañana. 3.200 tests, todos en verde, 92 % de cobertura de líneas. El equipo está tranquilo. El jueves, un cliente de *Nexo Finanzas* —una fintech ficticia que usaremos como hilo conductor— transfiere dinero a un tercero, la app muestra un *timeout*, el cliente reintenta, y **el dinero sale dos veces**. Ningún test se puso en rojo.

¿Cómo puede ser? Porque la suite medía lo que era fácil de medir (líneas ejecutadas), no lo que importaba para el negocio (que una transferencia no se duplique bajo reintento). La cobertura de líneas cuenta *qué código corrió*, no *qué riesgo quedó cubierto con evidencia*. Son dos preguntas distintas, y confundirlas es el origen de la mayoría de las falsas sensaciones de seguridad.

La tesis de este artículo es directa:

> Una arquitectura de Quality Engineering **no** es un diagrama de herramientas ni una colección de tests de UI: es un **sistema socio-técnico** que vincula riesgos de negocio con controles de distinta velocidad, datos y entornos reproducibles, señales operativas y decisiones explícitas de entrega.

"Socio-técnico" no es adorno: la mitad del sistema es código (tests, pipelines, entornos) y la otra mitad son acuerdos humanos (quién es dueño de qué, cómo se decide un release, cómo se paga la deuda de automatización). Si diseñás solo la mitad técnica, terminás con una suite frágil que sostiene una sola persona y que se cae cuando esa persona se va de vacaciones.

### El caso Nexo Finanzas (ficticio)

Vamos a razonar sobre **una transferencia de dinero a un tercero**. Es un buen caso porque concentra riesgos representativos de cualquier producto de riesgo medio/alto:

- **Duplicación:** que el dinero salga dos veces por un reintento (el problema del jueves).
- **Autorización:** que un usuario mueva plata de una cuenta que no le pertenece.
- **Indisponibilidad:** que el servicio caiga en el momento de confirmar y deje la transferencia en un estado ambiguo.
- **Mala experiencia:** que el comprobante no se muestre, o se muestre dos veces, o sea inaccesible para alguien que usa lector de pantalla.

Cada uno de estos riesgos pide un tipo de control distinto. Ese es el corazón de la arquitectura: **no todos los riesgos se cubren en la misma capa**.

---

## 2. Antes de seguir: prerrequisitos y glosario mínimo

No asumo que domines todo. Si algún punto te resulta nuevo, es sano leerlo antes; lo que está marcado como *(salteable)* podés dejarlo para una segunda pasada.

- **Tipos de prueba.** *Unitaria*: una función/clase aislada. *Componente*: un módulo con sus colaboradores cercanos. *Integración*: varios módulos o servicios reales hablando entre sí. *Contrato*: verifica que dos servicios respetan el formato que acordaron, sin levantar ambos. *End-to-end (E2E)*: el journey completo a través de la UI o API pública. *Regresión*: reejecución para detectar que algo que funcionaba se rompió. *Smoke*: verificación mínima de que "el sistema arranca y lo básico anda". *Exploratoria*: una persona investiga con hipótesis, sin script.
- **Riesgo de negocio.** Combinación de *impacto* (qué tan grave es si pasa) y *probabilidad* (qué tan seguido puede pasar), matizada por *detectabilidad* (si nos daríamos cuenta a tiempo).
- **Trazabilidad.** Poder seguir el hilo desde un requisito hasta el test, la ejecución, la evidencia y el defecto.
- **HTTP/REST/JSON y asincronía.** Métodos (GET/POST/PUT), códigos de estado, cuerpos JSON, y la idea de que una operación puede *aceptarse ahora* y *completarse después* (202 Accepted, colas, webhooks). *(Repaso salteable si ya trabajás con APIs.)*
- **Git, PR, CI/CD, artefactos, variables de entorno.** Control de versiones, revisión por *pull request*, integración/entrega continua, y la idea de que el pipeline produce artefactos (reportes, binarios) que hay que conservar.
- **Docker/Compose (conceptual).** Describir servicios de prueba en un archivo declarativo para levantar un entorno reproducible. *(No necesitás ser experto en contenedores.)* — [Docker Compose docs](https://docs.docker.com/compose/) (consultado 2026-07-09).
- **Métricas básicas.** Tasa (algo sobre un total), *percentiles* (p50 = mediana, p95 = "el 95 % está por debajo"), tiempo de feedback (cuánto tarda una señal en llegar) y *flakiness* (tests que cambian de resultado sin causa real).
- **Tres calidades distintas.** *Calidad de producto* (¿el software cumple sus características?), *calidad de proceso* (¿cómo lo construimos y validamos?) y *satisfacción del usuario* (¿resuelve el problema de quien lo usa?). El marco [ISO/IEC 25010:2023](https://www.iso.org/standard/78176.html) modela la primera con nueve características (funcionalidad, eficiencia de desempeño, compatibilidad, *interaction capability*, fiabilidad, seguridad, mantenibilidad, flexibilidad y **safety**). Es un **marco de conversación**, no una checklist que se completa gratis. *(Ver nota de fuente sobre esta edición en §12.)*

**Ruta de lectura sugerida.** Un perfil principiante puede leer §1–§5 primero y volver luego a §6–§9. Un perfil senior puede saltar directo a §3 (mapa de riesgo) y §8 (gates).

---

## 3. Qué es —y qué no es— una arquitectura de QE

Conviene desarmar cuatro términos que suelen usarse como sinónimos y no lo son:

| Término | Qué es | Qué **no** resuelve por sí solo |
|---|---|---|
| **Framework de tests** | La librería/estructura para escribir y correr pruebas (p. ej. pytest, JUnit, Playwright). | No dice *qué* riesgos cubrir ni *quién* mantiene qué. |
| **Estrategia de calidad** | Las decisiones sobre qué probar, en qué capa y con qué evidencia, dado el riesgo. | No se ejecuta sola; necesita plataforma y personas. |
| **Plataforma de calidad** | La infraestructura: CI/CD, entornos declarativos, gestión de datos, reportería, gates. | No sabe qué es importante; ejecuta lo que la estrategia define. |
| **Gobierno (governance)** | Los acuerdos humanos: ownership, revisión, onboarding, ADRs, manejo de deuda. | No prueba nada; hace que el resto sea sostenible. |

**Decisión de diseño.** Una arquitectura de QE **es la composición de los cuatro**, con la estrategia gobernando a la plataforma y el gobierno sosteniendo a ambas. Si solo tenés framework + plataforma, tenés una *fábrica de tests*, no una arquitectura de calidad.

El diagrama siguiente resume el flujo de información que queremos construir: del riesgo a la decisión, y de vuelta al riesgo (el sistema aprende).

<figure class="diagram">
  <img src="/blog/diagrams/arquitectura-quality-engineering-orientada-a-riesgo-1.svg" alt="Diagrama: arquitectura-quality-engineering-orientada-a-riesgo (1)" loading="lazy" decoding="async" />
</figure>

**Lectura del diagrama.** El riesgo alimenta la estrategia; la estrategia define el portafolio de controles; los datos y entornos *habilitan* ese portafolio (sin datos reproducibles, los controles mienten). El CI ejecuta, produce evidencia y trazabilidad, que se combinan con la telemetría operativa (lo que pasa en producción) para tomar una decisión y aprender. Ese aprendizaje **actualiza el riesgo**: el bucle se cierra. Una arquitectura sin la flecha `G → R` es una máquina de correr tests que nunca revisa sus propios supuestos.

---

## 4. Del objetivo de negocio al mapa de riesgo

Antes de escribir un solo test, hay que decidir *qué merece ser probado y con cuánta energía*. Eso se hace con un mapa de riesgo. La tentación es fingir precisión matemática ("riesgo = 7,4"). No lo hagas: los números de un mapa de riesgo son **ordinales y consensuados**, sirven para *ordenar y conversar*, no para calcular.

Un mapa mínimo usa cuatro dimensiones:

- **Impacto:** si esto falla, ¿qué se pierde? (dinero, confianza, cumplimiento, datos).
- **Probabilidad:** ¿qué tan factible es que ocurra dado nuestro diseño actual?
- **Detectabilidad:** si ocurriera, ¿nos daríamos cuenta rápido? (baja detectabilidad = más peligroso).
- **Criticidad:** una síntesis de las anteriores para ordenar, no un promedio sagrado.

Para *Nexo Finanzas*, una matriz ilustrativa (valores didácticos, no medidos):

| Riesgo | Impacto | Probabilidad | Detectabilidad | Criticidad |
|---|---|---|---|---|
| Transferencia duplicada | Alto | Media | Baja | **Crítico** |
| Autorización rota (mover plata ajena) | Alto | Baja | Media | **Crítico** |
| Indisponibilidad al confirmar | Medio | Media | Alta | Alto |
| Comprobante inaccesible/duplicado | Bajo–Medio | Media | Media | Medio |

**Decisión de diseño clave.** La *transferencia duplicada* es crítica no por su impacto solo, sino porque su **detectabilidad es baja**: el reintento del usuario parece un comportamiento normal, y sin un control específico nadie se entera hasta que llega el reclamo. La detectabilidad es la dimensión que más se subestima.

**Cómo validar el mapa (y por qué no lo hace QA solo).** Un mapa de riesgo hecho por una sola persona es una opinión disfrazada de análisis. La validación es interdisciplinaria:

- **Producto** aporta el impacto de negocio (¿cuánto cuesta un reclamo por duplicación?).
- **Desarrollo** aporta la probabilidad real dado el diseño (¿ya hay idempotencia? ¿dónde?).
- **Seguridad** aporta amenazas de autorización y abuso ([OWASP API Security Top 10 2023](https://owasp.org/API-Security/editions/2023/en/0x11-t10/), consultado 2026-07-09; ver §9).
- **Operaciones** aporta detectabilidad (¿tenemos telemetría para ver una duplicación en vivo?).

*Anti-patrón (ver §13):* "QA es dueño único de la calidad". Si el mapa lo firma solo QA, el resto del equipo lo trata como *su* problema y no como el propio.

---

## 5. Del riesgo al portafolio de controles

Con el riesgo mapeado, elegimos **controles**. La palabra importa: no decimos "tests", decimos "controles", porque incluye cosas que no son tests automatizados (revisión de diseño, monitoreo, exploratoria). Un control se ubica en el tiempo respecto del defecto:

- **Preventivo:** evita que el defecto exista (revisión de diseño, contrato, test unitario del invariante).
- **Detectivo:** lo encuentra si aparece (test de integración, monitoreo, síntesis).
- **Correctivo:** limita el daño una vez ocurrido (rollback, reversa automática, *feature flag* de apagado).

Para el riesgo *transferencia duplicada*, un portafolio deliberado:

| Control | Tipo | Capa | Qué valida | Qué **no** valida |
|---|---|---|---|---|
| Test unitario del servicio de idempotencia | Preventivo | Unit | Que la misma `Idempotency-Key` no cree dos operaciones | Que la red/cliente reintente correctamente |
| Test de API con `Idempotency-Key` repetida | Detectivo | API | Que el endpoint responde igual y no duplica | La UI, la experiencia del comprobante |
| Test de contrato del evento `transfer-created` | Preventivo | Contrato | Que el productor y consumidor coinciden en el esquema | Que el evento se emita en el orden correcto |
| E2E: comprobante se muestra una sola vez | Detectivo | E2E | El journey visible del usuario | El comportamiento bajo concurrencia alta |
| Synthetic check: consulta de estado de transferencia | Detectivo | Post-deploy | Que en producción el estado sea consultable y consistente | Casos no ejercitados por el sintético |

**Duplicación deliberada vs. accidental.** Notá que la idempotencia se toca en *unit*, *API* y *E2E*. ¿No es redundante? Depende del *por qué*:

- **Deliberada (buena):** cada capa valida un aspecto distinto y con distinto costo. El unit fija el invariante rápido y barato; el API prueba el contrato HTTP real; el E2E confirma que el usuario no ve dos comprobantes.
- **Accidental (mala):** el mismo escenario, con la misma profundidad, repetido en tres herramientas (Selenium, Katalon, Appium) porque "así lo heredamos". Eso multiplica el mantenimiento sin agregar cobertura de riesgo (*anti-patrón 4*).

La pregunta de control de calidad para cada test duplicado es: **"¿qué riesgo cubre esta capa que las otras no?"** Si no hay respuesta, es duplicación accidental.

Sobre la nota sobre idempotencia: el header `Idempotency-Key` está estandarizándose en el IETF, pero **al día de hoy es un Internet-Draft, no un RFC** ([draft-ietf-httpapi-idempotency-key-header](https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/), v-07, consultado 2026-07-09). Es *decisión de diseño* adoptarlo por convención de la industria, no un estándar obligatorio; hay que documentar en un ADR qué semántica exacta implementamos.

---

## 6. La arquitectura por capas: velocidad, fidelidad y costo

Acá entra la famosa pirámide. Mi recomendación: **usala como heurística para discutir tres ejes —velocidad, fidelidad y costo— y descartala como mandato**.

El artículo de referencia, *The Practical Test Pyramid* de **Ham Vocke** (en el sitio de Martin Fowler, 26 feb 2018), dice algo sensato: muchos tests rápidos de bajo nivel, algunos de nivel medio y **muy pocos** E2E, porque los E2E son "*notoriously flaky*" ([fuente](https://martinfowler.com/articles/practical-test-pyramid.html), consultado 2026-07-09). Eso sigue siendo buen consejo *operativo*. Pero la pirámide tiene dos límites en sistemas distribuidos:

1. **No habla de riesgo.** Te dice la *forma* deseable (muchos abajo, pocos arriba), no *qué* poner en cada nivel. Podés tener una pirámide perfecta que no cubra el riesgo crítico.
2. **En sistemas distribuidos, la "integración" es el riesgo.** Cuando el peligro vive en los bordes entre servicios (contratos, mensajería, idempotencia), un ejército de tests unitarios no lo toca. Ahí los **tests de contrato** hacen el trabajo que la pirámide clásica no nombra.

En vez de dibujar una forma, armá una tabla que ligue riesgo a capa:

| Riesgo | Capa primaria | Capa complementaria | Tiempo de feedback objetivo | Evidencia esperada |
|---|---|---|---|---|
| Transferencia duplicada | API (idempotencia) | Unit + E2E | Segundos (unit), minutos (API) | Reporte de test + request/response saneados |
| Autorización rota | API (negativos authz) | Unit de policy | Minutos | Casos 401/403 + matriz de roles |
| Indisponibilidad al confirmar | Contrato + resiliencia | Synthetic post-deploy | Minutos + continuo | Simulación de fallo + estado consistente |
| Comprobante inaccesible | E2E accesibilidad | Unit de componente | Minutos | Reporte axe/WCAG + captura saneada |

**Decisión de diseño.** La *capa primaria* es donde el control es más barato y fiel para *ese* riesgo. La *complementaria* atrapa lo que la primaria no ve. El *tiempo de feedback objetivo* es un acuerdo (no una promesa): define cuánto tolera el equipo esperar para saber si rompió algo.

*Hipótesis a validar en tu contexto:* mover la detección de duplicación de E2E a API suele reducir el tiempo de feedback de minutos a segundos. Es plausible y coherente con el consejo de Vocke sobre fragilidad de E2E, pero **medilo en tu pipeline** antes de afirmarlo como un hecho tuyo.

---

## 7. Datos, identidades y entornos como parte de la arquitectura

Este es el capítulo que más equipos omiten y el que más silenciosamente arruina una suite. **Un control solo es tan confiable como los datos y el entorno sobre los que corre.**

Principios:

- **Datos sintéticos, nunca de producción.** Cuentas, DNIs y saldos ficticios generados por el propio setup. Copiar una base de producción "para que sea realista" mete PII y te expone a una fuga (*anti-patrón 6*).
- **Aislamiento por ejecución.** Cada corrida crea sus propios datos (*seed*) y los limpia (*reset*). Si dos ejecuciones comparten la misma cuenta de prueba, una pisa a la otra y aparecen fallos "fantasma".
- **Secretos fuera del repo.** Tokens y claves vienen de variables de entorno o un *secret manager*, jamás commiteados.
- **Contratos de ambiente.** El entorno se declara (por ejemplo con Compose): qué servicios, qué versiones, qué datos base. Así "funciona en mi máquina" deja de ser una excusa. ([Docker Compose](https://docs.docker.com/compose/) modela justamente esto: servicios, redes y volúmenes en un YAML.)

**Por qué compartir cuentas y ambientes mutables destruye la confiabilidad.** Si la cuenta `test-user-01` la usan diez pipelines en paralelo, el saldo es una variable global compartida sin lock. Un test que espera saldo 1000 falla porque otro lo dejó en 200. El equipo aprende a *ignorar* rojos ("ah, es el ambiente"), y esa costumbre —la normalización del rojo— es la muerte de la señal.

Este tema es tan denso que le dedicamos un artículo satélite completo: **[Datos y entornos de prueba reproducibles](/blog/datos-y-entornos-de-prueba-reproducibles/)**.

---

## 8. Feedback continuo y trazabilidad que sirve

Los controles se ejecutan en distintos momentos, con distinto propósito:

- **Pull Request (PR):** los controles rápidos y de alto valor. Feedback en minutos. Bloquean el merge.
- **Integración (post-merge):** la suite más amplia sobre `main` integrada. Feedback en minutos–decenas de minutos.
- **Nightly / programado:** lo caro y lento (performance, matrices de browsers/dispositivos, seguridad profunda).
- **Post-deploy (synthetic/monitoring):** señales de que producción sigue sana.

El siguiente diagrama muestra el ciclo completo de un cambio, incluyendo el retorno de señales operativas:

<figure class="diagram">
  <img src="/blog/diagrams/arquitectura-quality-engineering-orientada-a-riesgo-2.svg" alt="Diagrama: arquitectura-quality-engineering-orientada-a-riesgo (2)" loading="lazy" decoding="async" />
</figure>

**Lectura.** Producto entrega criterio y riesgo; Desarrollo propone casos críticos junto a QE; QE versiona los controles en el repo; el pipeline devuelve evidencia a Desarrollo y publica artefacto + telemetría a Operaciones; Operaciones devuelve señales post-despliegue a QE; y QE cierra el ciclo entregando aprendizaje a Producto, que **revisa el riesgo**. La flecha que casi todos olvidan es `OPS-->>QE`: sin ella, la calidad se ciega apenas el código sale a producción.

**Trazabilidad que sirve (y la que no).** Trazabilidad no es llenar una planilla que nadie lee. Es poder responder, ante un incidente: *¿qué control debía atrapar esto, corrió, con qué datos, y qué decidimos?* El hilo mínimo es: criterio de aceptación → test → ejecución → artefacto → defecto/decisión → aprendizaje. Le dedicamos el satélite **[Métricas y trazabilidad de calidad sin castigar personas](/blog/metricas-y-trazabilidad-de-calidad/)**.

---

## 9. Quality gates proporcionales al riesgo

Un *quality gate* es una compuerta automatizada que decide si un cambio avanza. El error más común es tratar al gate como si fuera **la** decisión de release. No lo es.

> **Distinción clave.** Un *gate técnico* verifica evidencia ("¿corrieron los controles requeridos y pasaron?"). Una *decisión de release* incorpora además contexto de negocio, riesgo regulatorio, timing y apetito de riesgo. El gate **informa** la decisión; no la reemplaza. Confundirlos lleva a creer que "si el pipeline está verde, es seguro liberar", lo cual es falso para riesgo regulatorio, legal o de negocio.

Un gate proporcional exige *más* evidencia cuando el riesgo es mayor, y admite **excepciones auditables** (con responsable y fecha de vencimiento) en vez de ser un binario ciego. Este tema —incluyendo cómo modelar la excepción, el *flaky rate* que invalida la señal y el rollback— es el satélite **[Quality gates proporcionales al riesgo](/blog/quality-gates-proporcionales-al-riesgo/)**. Acá dejamos solo el esqueleto de la decisión:

```text
function releaseDecision(change, evidence, riskProfile):
  required = requiredControls(change, riskProfile)   # más control si más riesgo
  missing  = required - evidence.passingControls

  if missing is not empty:
    return block("Falta evidencia: " + missing)

  if evidence.hasSecurityFinding("critical"):
    return block("Hallazgo crítico sin excepción aprobada")

  if evidence.flakyRate > riskProfile.maxFlakyRate:
    return review("La señal de regresión no es confiable")

  return allowWithAuditTrail()
```

**Bloque por bloque.** (1) Se calculan los controles *requeridos* según el perfil de riesgo del cambio —no todos los cambios exigen lo mismo—. (2) Si falta evidencia de alguno, se bloquea con el detalle. (3) Un hallazgo de seguridad crítico bloquea salvo excepción aprobada. (4) Si la propia señal es poco confiable (mucho *flaky*), no se bloquea ni se aprueba: se manda a *revisión humana*, porque un pipeline que miente no debe autorizar nada. (5) Si todo pasa, se permite **dejando rastro auditable**.

**Límite honesto.** Los umbrales (`maxFlakyRate`, qué cuenta como "crítico") **no** son universales. Nacen de una línea base medida y una política consensuada. Cualquiera que te dé un "95 %" mágico sin preguntarte por tu contexto está vendiendo, no diseñando.

---

## 10. Observabilidad, performance y seguridad: cuándo entran

El anti-patrón clásico es tratar lo no funcional como "un proyecto al final" (*anti-patrón 8*). El resultado predecible: se descubre el problema de performance la semana del lanzamiento, cuando ya es carísimo arreglarlo.

**Observabilidad como evidencia.** [OpenTelemetry](https://opentelemetry.io/docs/what-is-opentelemetry/) (proyecto CNCF; consultado 2026-07-09) estandariza tres señales —trazas, métricas y logs— que sirven de *evidencia operacional*. Concretamente: un `correlation-id` que viaja desde el request del usuario hasta el evento `transfer-created` permite reconstruir una transferencia end-to-end en producción. Esa traza es tan "evidencia de calidad" como un reporte de test; simplemente es evidencia *en vivo*.

**SLIs/SLOs en vez de promedios.** El [SRE Book de Google, capítulo de SLOs](https://sre.google/sre-book/service-level-objectives/) (consultado 2026-07-09) define un **SLI** como una medida cuantitativa de un aspecto del servicio, un **SLO** como el objetivo para ese SLI, y un **SLA** como el contrato con consecuencias. La lección para QE: **la latencia promedio oculta el riesgo**. Si el promedio de confirmar una transferencia es 300 ms pero el p95 es 4 s, un 5 % de usuarios sufre una experiencia mala y confusa —justo la zona donde nacen los reintentos que duplican—. Por eso medimos percentiles, no promedios.

**Seguridad temprana y encuadrada.** Los controles negativos y de autorización de *Nexo Finanzas* se encuadran con [OWASP API Security Top 10 2023](https://owasp.org/API-Security/editions/2023/en/0x11-t10/): **API1:2023 Broken Object Level Authorization** (¿puedo consultar la transferencia de otro cambiando el id?) y **API5:2023 Broken Function Level Authorization** son directamente relevantes a "mover plata ajena". *Advertencia:* una lista Top 10 **no** cubre todas las amenazas; es un piso de conversación, no un techo de seguridad, y no equivale a un cumplimiento regulatorio.

---

## 11. Gobernanza y liderazgo: que el sistema lo mantenga el equipo

Acá se define si tu arquitectura sobrevive a que vos te tomes vacaciones. Piezas de gobierno que recomiendo, con su costo:

- **ADRs (Architecture Decision Records).** Documentos cortos que registran *por qué* se decidió algo (p. ej., "adoptamos `Idempotency-Key` con esta semántica"). *Costo:* disciplina de escribirlos. *Beneficio:* la próxima persona no repite la discusión desde cero.
- **Definition of Ready / Done.** Acuerdos de cuándo una historia está lista para empezar y para cerrarse (incluyendo su evidencia de calidad). *Costo:* fricción inicial. *Beneficio:* deja de haber "terminado pero sin tests".
- **Ownership compartido.** Cada control tiene un *squad* dueño (en el ejemplo, `payments-squad`), no "QA". *Costo:* Desarrollo se apropia de la calidad. *Beneficio:* la calidad escala con el equipo.
- **Triage de fallos y deuda de automatización.** Una rutina para clasificar rojos (¿bug real? ¿ambiente? ¿test frágil?) y una cola visible de deuda. *Costo:* tiempo recurrente. *Beneficio:* la suite no se pudre.

> **Liderazgo habilitador vs. centralización.** El rol de un/a Principal QE **no** es ser el cuello de botella que aprueba toda la calidad, sino diseñar el sistema para que el equipo produzca calidad sin depender de una persona. Si todo pasa por vos, no construiste una arquitectura: construiste una dependencia.

*Anti-patrón 10:* documentación sin dueño, sin fecha de revisión y sin relación con el código. Un `risk-register.yml` versionado junto al código y con dueño es documentación viva; un wiki que nadie tocó en dos años es folklore.

---

## 12. Ejemplos técnicos (ficticios, pequeños, deliberadamente incompletos)

> **No** son configuración lista para producción. Sirven para razonar sobre la forma, no para copiar y pegar.

### Ejemplo A — Registro de riesgo versionado

```yaml
# docs/quality/risk-register.yml
risks:
  transfer-duplicate:
    journey: "Transferencia a tercero"
    impact: "alto"
    probability: "media"
    signals:
      - "idempotency_conflict_total"
      - "transfer_reversal_total"
    primary_controls:
      - "unit: idempotency service"
      - "api: duplicate Idempotency-Key"
      - "contract: transfer-created event"
    complementary_controls:
      - "e2e: receipt shown once"
      - "synthetic-check: transfer status query"
    evidence:
      required_on_pull_request: true
      required_before_release: true
    owner: "payments-squad"
```

**Discusión.** `impact` y `probability` son etiquetas ordinales acordadas en la validación interdisciplinaria de §4, no mediciones. Este archivo versionado tiene una virtud (vive con el código, cambia por PR, tiene dueño) y un riesgo (volverse burocracia si nadie lo revisa). Un archivo **no reemplaza** la conversación que lo produjo; es su acta. Para que no muera: atalo a una revisión periódica (por ejemplo, al planificar cada trimestre) y hacé que un control de CI falle si un riesgo crítico no tiene al menos un control con evidencia vigente.

### Ejemplo B — Gate de release (esqueleto)

Ya lo vimos en §9; su desarrollo completo (umbrales, excepciones, rollback) está en el satélite de gates.

### Ejemplo C — Trazabilidad mínima, sin herramienta específica

| Campo | Ejemplo (ficticio) | Nota de seguridad |
|---|---|---|
| `story_id` | NEXO-1421 | — |
| `risk_id` | transfer-duplicate | — |
| `test_id` | api-idem-conflict-01 | — |
| `automation_id` | tests/api/idempotency_spec.py::test_conflict | — |
| `pipeline_url` | ci://nexo/quality-platform/runs/8842 | interno; no exponer público |
| `artifact_sha256` | 9f2c…(hash) | integridad, no contenido |
| `environment` | eph-pr-1421 | efímero |
| `data_set` | synthetic-transfers-v3 | **sintético**, sin PII |
| `result` | pass | — |
| `defect_id` | (vacío) | — |
| `decision` | allow-with-audit | — |

**Discusión.** Los campos sensibles son `pipeline_url` (endpoint interno), y todo lo que *podría* tentar a pegar un comprobante o un cuerpo real. La regla es dura: **la trazabilidad guarda referencias e integridad (hashes), nunca PII, secretos ni comprobantes reales**. Un `artifact_sha256` prueba que el reporte no cambió sin revelar su contenido.

### Nota de fuente sobre ISO/IEC 25010:2023

Consulté la ficha oficial de [ISO/IEC 25010:2023](https://www.iso.org/standard/78176.html) el 2026-07-09; el sitio de ISO respondió con acceso restringido a la fetch automatizada, por lo que corroboré los cambios de la edición 2023 (adición de **safety**, reemplazo de *usability* por *interaction capability* y de *portability* por *flexibility*, total de nueve características) contra la plataforma de navegación de ISO (OBP) y el *webstore* de IEC, ambos oficiales. La norma completa es de pago; **no** cito su texto, solo su estructura pública. Esto es *hecho citado con salvedad de acceso*, no una lectura íntegra de la norma.

---

## 13. Anti-patrones (síntoma → causa → impacto → alternativa)

1. **"QA es dueño único de la calidad".** *Síntoma:* el mapa de riesgo lo firma solo QA. *Causa:* modelo mental de "control de calidad" como inspección final. *Impacto:* el equipo externaliza la responsabilidad. *Alternativa:* ownership por squad (§11); QA facilita el sistema.
2. **Todo por UI y llamarlo "cobertura E2E".** *Causa:* es lo visible y "convincente". *Impacto:* suites lentas y *flaky* que no tocan el riesgo de integración. *Alternativa:* mover el riesgo a API/contrato; reservar E2E para journeys críticos (§6).
3. **% de automatización o cantidad de casos como objetivo.** *Impacto:* se optimiza el número, no el riesgo (Goodhart). *Alternativa:* cobertura ponderada por riesgo (satélite de métricas).
4. **Duplicar los mismos casos en Selenium/Katalon/Appium.** *Impacto:* mantenimiento ×3 sin cobertura extra. *Alternativa:* duplicación deliberada con justificación por capa (§5).
5. **Gates binarios sin excepción auditable.** *Impacto:* o bloquean todo (y se saltan a mano) o no bloquean nada. *Alternativa:* gate proporcional con excepción registrada (satélite de gates).
6. **Datos de producción o secretos en repos/reportes/capturas.** *Impacto:* fuga de PII, riesgo legal. *Alternativa:* datos sintéticos + secretos externos + captura saneada (§7).
7. **Reintentar fallos hasta que quede verde.** *Impacto:* se esconde la señal de un bug real. *Alternativa:* triage y cuarentena con dueño y fecha (§11).
8. **Performance/seguridad solo al final.** *Impacto:* descubrimiento tardío y caro. *Alternativa:* controles no funcionales desde temprano, aunque sean modestos (§10).
9. **Métricas para ranking individual.** *Impacto:* la gente juega la métrica y oculta problemas. *Alternativa:* métricas de sistema para decidir, no para castigar (satélite de métricas).
10. **Documentación sin dueño ni fecha.** *Impacto:* folklore desactualizado. *Alternativa:* docs versionadas, con owner y revisión (§11).

---

## 14. Plan incremental de 90 días para Nexo Finanzas

No construyas el ecosistema completo de una vez. Empezá por **un** journey y crecé.

- **Días 0–30 — Estrategia + API.** Escribir el `risk-register.yml` con 3 riesgos del journey de transferencia. Cubrir *transferencia duplicada* en su capa primaria (API con `Idempotency-Key`) y su unit de invariante. Definir Definition of Ready/Done. *Entregable:* riesgo → control con evidencia en PR.
- **Días 30–60 — Regresión crítica + CI/evidencia.** Sumar el contrato de `transfer-created`, un E2E de "comprobante único" y un pipeline que **conserva reportes** como artefactos. Primer gate técnico proporcional en PR. *Entregable:* trazabilidad mínima funcionando (Ejemplo C).
- **Días 60–90 — No funcionales + mejora continua.** Baseline de performance del endpoint (hipótesis + evidencia reproducible), un control de autorización negativo (OWASP API1/API5), un synthetic check post-deploy y la primera revisión del mapa de riesgo. *Entregable:* el bucle `G → R` cerrado al menos una vez.

**Decisión de diseño.** El orden prioriza cerrar el riesgo crítico *primero* (duplicación) y recién después ampliar. Es tentador empezar por lo vistoso (un dashboard, un E2E lindo); resistilo.

---

## 15. Conexión con el portfolio Nexo Finanzas

Estos repositorios son ficticios y **no** afirmo que existan hasta que los construyas. El mapeo conceptual:

| Repositorio | Papel |
|---|---|
| `nexo-transfer-api` | Reglas de transferencia, OpenAPI, tests de API, idempotencia, auditoría sintética. |
| `nexo-web-banking-e2e` | Journeys web críticos y accesibilidad; **no** sustituye a las pruebas de API. |
| `nexo-wallet-mobile` | Riesgos de mobile: permisos, red inestable, sesión. |
| `nexo-cross-channel-regression` | Smoke deliberado entre canales, sin duplicar la suite completa. |
| `nexo-performance-lab` | Hipótesis de carga, baseline y evidencia reproducible. |
| `nexo-quality-control-tower` | Trazabilidad riesgo → prueba → ejecución → evidencia → defecto. |
| `nexo-quality-platform` | CI/CD, entornos declarativos, artefactos y gates. |

**Primera versión mínima (hacé esto, no más):** un journey de transferencia, tres riesgos explícitos en `risk-register.yml`, controles ubicados en capas distintas (unit + API + contrato) y un pipeline que conserve reportes. Después extendés.

---

## 16. Qué aprendimos y próximos pasos

- Una suite verde mide ejecución, no riesgo cubierto. La arquitectura de QE existe para cerrar esa brecha.
- El artefacto central no es una herramienta: es el **mapa riesgo → control → evidencia → owner → decisión**, mantenido por todo el equipo.
- La pirámide es una heurística sobre velocidad/costo/fidelidad, no una estrategia; el riesgo decide la capa.
- Los datos y entornos son parte de la arquitectura, no un detalle de infraestructura.
- El gate técnico informa, pero no reemplaza, la decisión de release.
- El sistema debe sobrevivir a que su autor se vaya de vacaciones.

**Seguí por acá (satélites de esta colección):**

- **[Quality gates proporcionales al riesgo](/blog/quality-gates-proporcionales-al-riesgo/)** — cómo decidir un release con evidencia y excepciones auditables.
- **[Datos y entornos de prueba reproducibles](/blog/datos-y-entornos-de-prueba-reproducibles/)** — por qué los ambientes compartidos matan la señal, y cómo evitarlo.
- **[Métricas y trazabilidad de calidad sin castigar personas](/blog/metricas-y-trazabilidad-de-calidad/)** — qué medir, cómo, y cómo no volverlo un instrumento de miedo.

---

## 17. Checklist para revisar tu arquitectura antes de escalarla

- [ ] ¿Existe un mapa de riesgo validado con Producto, Desarrollo, Seguridad y Operaciones —no solo por QA?
- [ ] ¿Cada riesgo crítico tiene al menos un control con evidencia vigente y un dueño explícito?
- [ ] ¿La duplicación entre capas está justificada por riesgo (deliberada), no heredada (accidental)?
- [ ] ¿Los datos son sintéticos, aislados por ejecución, sin PII ni secretos en el repo?
- [ ] ¿El entorno se declara de forma reproducible (contrato de ambiente)?
- [ ] ¿Hay feedback en PR, integración, nightly y post-deploy, con la señal `OPS → QE` presente?
- [ ] ¿El gate técnico es proporcional al riesgo y admite excepciones auditables?
- [ ] ¿Las métricas se usan para decidir, nunca para rankear personas?
- [ ] ¿La documentación (risk-register, ADRs) tiene dueño, fecha de revisión y vive con el código?
- [ ] ¿El sistema funciona si su autor original no está esta semana?

---

### Fuentes (consultadas 2026-07-09)

- ISO/IEC 25010:2023 — Product quality model. https://www.iso.org/standard/78176.html *(ficha oficial; ver salvedad de acceso en §12).*
- Google SRE Book, "Service Level Objectives". https://sre.google/sre-book/service-level-objectives/
- OpenTelemetry, "What is OpenTelemetry?" (CNCF). https://opentelemetry.io/docs/what-is-opentelemetry/
- Ham Vocke, "The Practical Test Pyramid" (martinfowler.com, 26-02-2018). https://martinfowler.com/articles/practical-test-pyramid.html
- OWASP API Security Top 10 2023. https://owasp.org/API-Security/editions/2023/en/0x11-t10/
- Docker Compose documentation. https://docs.docker.com/compose/
- IETF, "The Idempotency-Key HTTP Header Field" (Internet-Draft, no RFC). https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/

> *Aviso.* Las menciones a PCI DSS, OWASP, ISO o cualquier normativa son informativas y no constituyen asesoramiento legal ni de cumplimiento. Verificá jurisdicción y versión vigente con la fuente oficial.

