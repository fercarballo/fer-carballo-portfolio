---
title: "De QA Automation a Quality Engineering: un mapa de 180 días"
description: "Mapa de 90 a 180 días para pasar de QA Automation a Quality Engineering senior: prerrequisitos con evidencia, cuatro rutas de especialización, dependencias reales entre temas y criterios de finalización verificables."
pubDate: 2026-07-10
tags: ['quality-engineering', 'sdet', 'carrera', 'arquitectura', 'portfolio', 'roadmap']
cluster: 'a00'
clusterTitle: "Mapa avanzado y priorización"
type: pilar
order: 1
readingLevel: "Avanzado"
prerequisites: "Requiere un portfolio de automatización ya funcionando."
icon: 'command'
iconHue: 160
---

> **Aviso.** Nexo Finanzas es un dominio **ficticio**. Todos los importes, cuentas y usuarios son sintéticos. Este artículo no reporta métricas, resultados de ejecución ni experiencia en producción.

> **Promesa del artículo.** Al terminar vas a poder decidir *qué estudiar y construir en qué orden*, con dependencias explícitas, un límite de trabajo en curso, y criterios de finalización que no dependen de tu propia sensación de dominio. No vas a encontrar una lista de tecnologías de moda: vas a encontrar un argumento sobre por qué unas cosas van antes que otras.

## El techo del que nadie te avisa

Hay un momento en la carrera de un QA Automation Engineer que se parece a un techo de cristal técnico. Sabés escribir tests de API sólidos. Tu suite de UI no es flaky. Tenés un pipeline que corre, publica reportes y bloquea merges. Sabés qué es un contrato y probablemente lo verificás.

Y aun así, cuando el sistema falla en producción, tu evidencia no alcanza para explicar por qué.

El motivo es estructural. La automatización responde una pregunta: **"¿este comportamiento observable coincide con lo que esperábamos?"**. Es una gran pregunta. Pero los sistemas modernos fallan en lugares donde esa pregunta no llega:

- Falla cuando dos servicios se hablan **de forma asíncrona** y el mensaje llegó dos veces, o llegó fuera de orden, o llegó pero el consumidor murió antes de terminar.
- Falla cuando lo que se desplegó **no es lo que se construyó**, porque una dependencia transitiva cambió entre el build y el deploy.
- Falla cuando el código es correcto pero **la exposición fue demasiado rápida** y no hubo señal ni forma de frenar.
- Falla cuando el dato que la API devuelve y el que el reporte muestra **son distintos y ambos parecen correctos**.

Ninguno de esos cuatro fallos se detecta con más tests de la clase que ya sabés escribir. Se detectan con **controles arquitectónicos**, y a esos controles hay que diseñarlos, implementarlos y demostrar que funcionan.

Esta serie es un recorrido de 90 a 180 días para adquirir esa capacidad. Este artículo es su mapa.

## Las cuatro preguntas que ordenan la etapa

Todo el recorrido cuelga de cuatro interrogantes. Están en este orden por una razón que voy a defender más abajo.

1. **¿Cómo se comporta el sistema cuando sus partes se comunican de forma asíncrona?** (eventos, contratos, idempotencia, consistencia eventual)
2. **¿Cómo sabemos que el software construido y desplegado es íntegro y verificable?** (supply chain, procedencia, firma)
3. **¿Cómo liberamos cambios gradualmente y los detenemos con seguridad?** (feature flags, canary, GitOps, rollback)
4. **¿Cómo protegemos datos, reconciliamos resultados y relacionamos calidad con costo y riesgo?** (privacidad, data quality, fraude, FinOps)

Si respondés las cuatro con evidencia reproducible, dejaste de ser alguien que prueba software y pasaste a ser alguien que **diseña cómo se demuestra que el software es confiable**. Ese es el cambio de rol.

## Prerrequisitos: la parte que la gente se saltea

Antes de tocar un broker de mensajes, hay una lista de bases que deben estar consolidadas. La trampa acá es evaluarlas por lectura y no por evidencia. **Haber leído la documentación de transacciones no es saber transacciones.**

Usá esta tabla como autoevaluación. La columna que importa es la tercera.

| Base | Señal débil ("creo que sé") | Evidencia de que realmente sabés |
|---|---|---|
| Java + build (Maven/Gradle) | Corriste `mvn test` | Sabés qué hace tu build en la fase `verify`, y podés explicar por qué un test pasa localmente y falla en CI |
| HTTP, REST, OpenAPI, authn/authz | Escribiste tests de API | Podés diseñar una prueba negativa de **autorización por objeto** (BOLA) y explicar por qué `403` y `404` filtran información distinta |
| SQL, transacciones, aislamiento | Escribís `SELECT` con `JOIN` | Podés explicar qué anomalía aparece en `READ COMMITTED` y no en `SERIALIZABLE`, y reproducirla |
| Git, pipelines, Docker, K8s intro | Tenés un `.gitlab-ci.yml` | Podés explicar qué se ejecuta con qué permisos, y dónde vive cada secreto |
| Logs, métricas, trazas, SLOs | Usás `logger.info` | Podés seguir un `traceId` de punta a punta y definir un SLO con ventana y consecuencia |
| Idempotencia, retry, timeout, circuit breaker | Los nombrás | Podés dibujar el caso en que un retry **causa** el daño que quería evitar |

Si una fila no tiene evidencia, **ese es tu trabajo de las próximas dos semanas**, y no el broker. Un plan de recuperación de una base floja es más valioso que un repositorio nuevo. La deuda fundacional no se compensa con capacidades avanzadas: se amplifica.

## Cuatro rutas, un perfil cada una

No todo el mundo debería recorrer los ocho temas con la misma profundidad. Elegí una ruta **principal** según el perfil al que querés aproximarte, y tratá al resto como alfabetización.

| Ruta | Temas principales | Perfil al que aproxima |
|---|---|---|
| **Arquitectura transaccional** | Eventos, contratos, consistencia, reconciliación, fraude | QE/SDET especializado en fintech |
| **Quality Platform** | Supply chain, GitOps, progressive delivery, observabilidad | Quality Platform Engineer |
| **Gobierno y riesgo** | Privacidad, datos, trazabilidad, threat modeling | Quality Architect en entornos regulados |
| **Economía del sistema** | Capacidad, costo de calidad, FinOps | Staff QE orientado a decisiones de producto |

Las rutas comparten un tronco. Nadie hace *Quality Platform* sin entender eventos, ni *gobierno de datos* sin entender reconciliación. Por eso el orden del mapa no es negociable aunque la profundidad sí lo sea.

## El mapa: por qué este orden y no otro

<figure class="diagram">
  <img src="/blog/diagrams/de-qa-automation-a-quality-engineering-mapa-de-180-dias-1.svg" width="1900" height="63" alt="Diagrama: de-qa-automation-a-quality-engineering-mapa-de-180-dias (1)" loading="lazy" decoding="async" />
</figure>

La secuencia tiene una lógica de **dependencias**, no de dificultad creciente.

**Eventos van primero** porque son el cambio conceptual más profundo. Cuando entendés que recibir un mensaje no equivale a procesarlo, y que "exactamente una vez" es una promesa que ningún sistema distribuido cumple de punta a punta, cambian tus preguntas para siempre. Todo lo demás —reconciliación, fraude, entrega progresiva— asume ese vocabulario.

**Supply chain va segundo** porque es el tema que más rápido convierte tu pipeline de "un script que corre tests" en "una cadena de evidencia". Y porque es barato: no necesitás un cluster para generar un SBOM y verificar una firma. Alto valor, bajo prerrequisito.

**Progressive delivery va tercero** porque *requiere* lo anterior. Un canary sin observabilidad es una ruleta. Un rollback sobre un artefacto que no podés verificar es una esperanza. La entrega gradual es la primera capacidad de esta lista que **necesita** que las dos anteriores existan.

**Privacidad va antes que data quality** por una razón contraintuitiva: la clasificación de datos es la entrada de ambos. No podés diseñar un pipeline de reconciliación sin saber qué campos son sensibles, dónde pueden vivir y qué no puede aparecer en un log. Hacerlo al revés obliga a rehacer.

**Reconciliación y fraude van juntos** porque comparten la infraestructura de datos y la disciplina de decidir con incertidumbre. Un motor de reglas es, esencialmente, un sistema que produce decisiones que después hay que auditar y reconciliar.

**Quality Platform va casi al final** —y esto contradice el instinto de mucha gente— porque **no se puede plataformizar lo que todavía no sabés hacer a mano**. Una plataforma prematura codifica tu ignorancia y la reparte. Primero construís el golden path recorriéndolo vos; después lo empaquetás.

**FinOps cierra** porque solo tiene sentido cuando ya hay algo cuyo costo medir. Un modelo de costo sin pipeline es una planilla.

> **Nota sobre las dependencias.** Las flechas del diagrama son **duras** entre eventos → supply chain → progressive delivery, y **blandas** después. Podés estudiar FinOps antes que fraude si tu contexto lo pide. Lo que no podés es plataformizar antes de haber ejecutado.

## El ciclo que hace que todo esto sea calidad y no arquitectura

Hay un riesgo real en este recorrido: convertirse en un arquitecto de diagramas que no prueba nada. El antídoto es tener siempre presente el circuito completo, que empieza y termina en el riesgo de negocio.

<figure class="diagram">
  <img src="/blog/diagrams/de-qa-automation-a-quality-engineering-mapa-de-180-dias-2.svg" width="301" height="642" alt="Diagrama: de-qa-automation-a-quality-engineering-mapa-de-180-dias (2)" loading="lazy" decoding="async" />
</figure>

Leelo así: un riesgo de negocio (*"una transferencia podría duplicarse"*) justifica un control arquitectónico (*consumidor idempotente con restricción única*), que se verifica con una prueba automatizada (*entregar el mismo evento dos veces*), que produce evidencia en el build, que habilita una entrega progresiva, que genera telemetría, que informa una decisión, que actualiza tu entendimiento del riesgo.

**Si un tema de esta serie no puede conectarse a ese ciclo, no lo estudies todavía.** Es la prueba de fuego contra la acumulación de herramientas.

> **El ciclo, entero y en una tabla:** [matriz transversal de riesgo → control → prueba → evidencia → señal → runbook](/blog/matriz-riesgo-control-evidencia/). Son 22 riesgos de negocio recorriendo los ocho capítulos. **Si una fila tiene una columna vacía, ese riesgo no está controlado**, y la columna que más veces está vacía es la de la señal en producción.

> **Y si un término de esta serie te suena a que se usa de dos maneras distintas**, probablemente sea así: el [glosario](/blog/glosario-serie-avanzada/) define una sola vez los que más se confunden (comando vs evento, `ack` vs efecto de negocio, pseudonimizar vs anonimizar, deployment vs release).

## El mapa de 180 días

Uso *incrementos*, no semanas. Un incremento termina cuando su criterio de finalización se cumple, no cuando pasa el tiempo. Los rangos de días son una expectativa, no una promesa.

### Bloque 0 — Consolidación (días 1–15)

**Dependencia:** ninguna. **Ruta:** todas.

Cerrar los huecos de la tabla de prerrequisitos con evidencia. Congelar y versionar los contratos que ya existan en tu portfolio.

**Criterio de finalización:** cada fila de la tabla tiene un enlace a código o a un documento donde demostrás la evidencia de la tercera columna. Los contratos actuales (OpenAPI) están versionados y tienen owner.

### Bloque 1 — Eventos y contratos asíncronos (días 15–45)

**Dependencia:** bloque 0. **Repositorio:** `nexo-event-platform`. **Artículos:** [capítulo 01](/blog/coleccion/a01/).

Transactional outbox, consumidor idempotente, AsyncAPI versionada, DLQ con política de replay.

**Criterio de finalización:**
- Entregar el mismo evento N veces produce **un** efecto de negocio, y hay un test que lo demuestra.
- Existe un ADR que explica qué broker elegiste, contra qué alternativas, y **por qué el demo local no prueba escalabilidad**.
- Existe un runbook de replay desde DLQ que alguien que no sos vos puede ejecutar.

### Bloque 2 — Supply chain (días 45–70)

**Dependencia:** bloque 1 (necesitás un artefacto que valga la pena firmar). **Repositorio:** `nexo-supply-chain-lab`. **Artículos:** [capítulo 02](/blog/coleccion/a02/).

Threat model del pipeline, SBOM, provenance, firma, política de admisión.

**Criterio de finalización:**
- Un artefacto **no firmado** no se despliega en el entorno demo, y podés demostrar el rechazo.
- Existe un registro de excepciones de vulnerabilidades con owner y **fecha de vencimiento**.
- Podés explicar qué **no** te dice tu SBOM.

### Bloque 3 — Progressive delivery (días 70–100)

**Dependencia:** bloques 1 y 2. **Repositorio:** `nexo-progressive-delivery`. **Artículos:** [capítulo 03](/blog/coleccion/a03/).

Separación deployment/release, flags con ciclo de vida, canary con guardrails, GitOps.

**Criterio de finalización:**
- Cada flag tiene owner y **fecha de retiro** registrada.
- El rollback fue **ensayado**, no solo documentado.
- La política de avance del canary usa al menos una señal de negocio, no solo CPU.

### Bloque 4 — Privacidad y datos (días 100–135)

**Dependencia:** bloque 1. **Repositorios:** transversal + `nexo-data-reconciliation`. **Artículos:** [capítulo 04](/blog/coleccion/a04/) y [capítulo 05](/blog/coleccion/a05/).

Clasificación de datos, generación sintética determinista, telemetría sin PII, reconciliación por operación y por totales, backfill idempotente.

**Criterio de finalización:**
- Hay un test que **falla** si un log o un response contiene un patrón prohibido.
- La reconciliación puede **explicar** una diferencia, no solo detectarla.
- Un backfill ejecutado dos veces produce el mismo resultado.

### Bloque 5 — Decisión y riesgo (días 135–160)

**Dependencia:** bloques 1 y 4. **Repositorio:** `nexo-risk-engine`. **Artículos:** [capítulo 07](/blog/coleccion/a07/).

Reglas versionadas, reason codes, golden dataset sintético, backtesting, revisión humana simulada.

**Criterio de finalización:**
- Toda decisión tiene `ruleSetVersion` y `reasonCode`.
- Podés mostrar un caso donde *accuracy* engaña por la tasa base.
- Un cambio de regla pasa por backtest antes del rollout.

### Bloque 6 — Plataforma y economía (días 160–180+)

**Dependencia:** todo lo anterior. **Repositorio:** `nexo-quality-developer-platform`. **Artículos:** [capítulo 08](/blog/coleccion/a08/) y [capítulo 06](/blog/coleccion/a06/).

Dos golden paths (no más), contrato de evidencia, modelo de costo por feedback útil.

**Criterio de finalización:**
- Existen exactamente **dos** golden paths y **un** escape hatch documentado.
- El modelo de costo tiene variables, supuestos y ninguna cifra sin fuente.

### Capacidad transversal, todo el tiempo: RFCs y design reviews

**Artículos:** [capítulo 13](/blog/coleccion/a13/).

Cada decisión estructural de arriba se escribe **antes** de implementarla. Un RFC escrito después de programar no es un RFC: es documentación.

## Límite de trabajo en curso: una ruta y una capacidad

La regla que más resultados da y más se ignora:

> **Una ruta principal a la vez. Una capacidad transversal a la vez.**

En la práctica: si estás en el bloque de eventos, no empieces GitOps porque viste un video. Terminá el criterio de finalización. Un repositorio con outbox probado, ADR honesto y runbook ejecutable vale más que seis repositorios con README.

## Los seis anti-patrones de este recorrido

Estos son los que más veces convierten 180 días de trabajo en un portfolio que no resiste una entrevista técnica.

- **Agregar Kafka, Kubernetes o GitOps solo para nombrarlos.** *Causa:* creer que la palabra es la capacidad. *Consecuencia:* un entrevistador pregunta "¿por qué un broker y no una tabla con polling?" y no hay respuesta. *Alternativa:* cada dependencia estructural entra con un ADR que nombra el riesgo que resuelve y la alternativa que descartó.
- **Confundir un diagrama con una implementación verificada.** *Consecuencia:* el diagrama muestra un outbox que el código no tiene. *Alternativa:* marcar explícitamente qué es *arquitectura actual* y qué es *arquitectura objetivo*.
- **Publicar un SBOM y declarar seguridad.** *Consecuencia:* falsa confianza. Un SBOM es un inventario, y ni siquiera uno perfecto. *Alternativa:* declarar qué cubre y qué no.
- **Usar feature flags permanentes sin ownership ni fecha de retiro.** *Consecuencia:* la combinatoria de flags se vuelve intestable y nadie sabe qué código está vivo. *Alternativa:* el flag nace con dueño y fecha de muerte.
- **Ejecutar chaos o performance sin hipótesis, límites y observabilidad.** *Consecuencia:* generaste un incidente, no evidencia. *Alternativa:* hipótesis, blast radius, condición de aborto.
- **Simular compliance o experiencia productiva inexistente.** *Consecuencia:* es la forma más rápida de perder credibilidad, y se detecta con dos preguntas. *Alternativa:* decir "construí un sandbox que demuestra X; nunca operé esto con usuarios reales". Eso **suma**.

## Qué publicar en GitHub

Para cada bloque, la evidencia mínima que hace que el trabajo sea revisable:

- **Problema y riesgo concreto**, en una línea, antes que cualquier tecnología.
- **Arquitectura y ADRs** con alternativas reales, no con la decisión ya tomada.
- **Threat model** donde corresponda (pipeline, transferencia asíncrona, datos).
- **Datos sintéticos** y un procedimiento de reset que funcione.
- **Comandos reproducibles**, marcados como *propuesta* si no los ejecutaste.
- **Pipeline y artefactos verificables.**
- **Métricas con definición, ventana y limitaciones.** Una métrica sin denominador no es una métrica.
- **Runbook de fallo y recuperación.**
- **Un artículo técnico** que enlace el repositorio y explique la decisión, no el tutorial.

## Qué aprendimos / próximos pasos

- El orden importa más que la lista. Eventos habilitan el vocabulario; supply chain habilita la evidencia; entrega progresiva necesita ambos.
- Los prerrequisitos se evalúan con evidencia, no con lectura.
- La plataforma va **al final**, porque plataformizar antes de ejecutar codifica la ignorancia.
- El límite de trabajo en curso es lo que separa un portfolio profundo de seis demos superficiales.

**Próximo paso:** si ya tenés repositorios, empezá por el [relevamiento](/blog/coleccion/a09/) antes de escribir una línea nueva. Si no los tenés, el [capstone acotado](/blog/coleccion/a12/) es mejor punto de entrada que seis repos vacíos.

## Checklist final

- [ ] Cada fila de prerrequisitos tiene evidencia enlazada, no una autoevaluación.
- [ ] Elegí **una** ruta principal.
- [ ] Hay como máximo un bloque en curso y una capacidad transversal.
- [ ] Cada bloque tiene su criterio de finalización escrito **antes** de empezar.
- [ ] Cada dependencia estructural (broker, cluster, SaaS) tiene un ADR con la alternativa descartada.
- [ ] Ningún README afirma experiencia productiva ni cumplimiento regulatorio.
- [ ] Cada repositorio declara explícitamente **qué no demuestra**.

---

## Fuentes (consultadas 2026-07-10)

Este artículo no introduce versiones de herramientas. Las afirmaciones versionadas de la serie viven en un único documento auditable:

- [Verificación de fuentes de la serie](/blog/verificacion-de-fuentes-serie-avanzada/) — estado de AsyncAPI, SLSA, CycloneDX, SPDX, Sigstore, OpenFeature, OpenTelemetry, FinOps Framework y NIST al 2026-07-10.
- [Google SRE — Service Level Objectives](https://sre.google/sre-book/service-level-objectives/) — para el vocabulario de SLO usado en los criterios de finalización.
