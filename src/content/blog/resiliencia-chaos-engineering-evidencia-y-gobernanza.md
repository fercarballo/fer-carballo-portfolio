---
title: "Resiliencia y Chaos Engineering: probar la degradación sin convertir la prueba en un incidente"
description: "Guía pilar de resiliencia y chaos engineering para QA/SDET: vocabulario, invariantes de negocio, método científico del experimento, gobernanza, blast radius y madurez gradual."
pubDate: 2026-07-09
tags: ["resilience", "chaos-engineering", "sre", "quality-engineering", "sdet", "reliability"]
cluster: "11"
clusterTitle: "Resiliencia y chaos engineering"
type: "pilar"
order: 1
icon: "refresh"
iconHue: 45
readingLevel: "Intermedio–Avanzado"
prerequisites: "Requiere APIs/HTTP, CI, datos de prueba, métricas básicas y al menos una dependencia distribuida."
---
> **Promesa del artículo.** Al terminar vas a poder distinguir resiliencia de disponibilidad, seguridad, performance y recuperación ante desastres; formular la hipótesis de un experimento de resiliencia; decidir su *blast radius*, sus *guardrails* y sus condiciones de aborto; y defender por qué "tenemos retries y circuit breakers" **no** es evidencia de resiliencia. No vas a encontrar una apología de "romper cosas": vas a encontrar un método para producir evidencia sin causar el incidente que decís temer.

> **Nota de honestidad intelectual.** A lo largo del texto separo cinco cosas: **hecho citado** (con enlace a fuente primaria y fecha de consulta), **inferencia** (algo que se deduce razonablemente pero no está medido), **decisión de diseño** (una opción entre varias, con su costo), **resultado experimental** (algo que requeriría correr el experimento para afirmarse) y **opinión**. El caso *Nexo Finanzas* es una **fintech ficticia** con datos sintéticos. Ninguna métrica, incidente, porcentaje de disponibilidad o resultado de experimento atribuido a *Nexo* proviene de un sistema real; están rotulados como ficticios y sirven para razonar, no como evidencia.

> **Esta es la pieza pilar de una colección de tres.** Acá tratamos el *porqué*, el vocabulario y la gobernanza. El [artículo de patrones](/blog/patrones-de-resiliencia-con-trade-offs/) trata *qué mecanismo elegir y a qué costo*. El [artículo del experimento](/blog/experimento-de-caos-local-transferencia-degradada/) muestra *cómo correr uno de punta a punta en local*.

---

## 1. Cuando la dependencia falla, ¿qué debe seguir siendo verdad?

Un lunes a las 10:03, un cliente de *Nexo Finanzas* —fintech ficticia— toca **"Transferir"** para enviar dinero a un tercero. Detrás de escena, la `Transfer API` necesita validar al beneficiario contra un servicio de validación. Ese servicio, hoy, está **lento**: responde en 9 segundos en vez de 200 ms. Hay dos futuros posibles.

- **Futuro A (silencioso y peligroso).** El cliente de la app ve un *spinner*, se impacienta, toca "Transferir" otra vez. El primer request seguía vivo. El servidor procesa ambos. **El dinero sale dos veces.** El usuario ve un comprobante y una app "que anduvo". El problema aparece en la conciliación bancaria tres días después.
- **Futuro B (explícito y recuperable).** La `Transfer API` corta la espera en un tiempo acotado, reconoce que el estado es **incierto**, no confirma la transferencia como exitosa y le devuelve al usuario un estado claro: *"Estamos verificando tu transferencia; te avisamos en minutos"*. La clave de idempotencia garantiza que un reintento no genera un segundo movimiento. La operación queda pendiente, trazada y reconciliable.

La diferencia entre A y B **no** es "tener resiliencia" como propiedad mágica. Es que en B alguien se hizo, antes del incidente, una pregunta incómoda:

> Cuando la validación de beneficiario esté lenta o caída, **¿qué debe seguir siendo verdad?** Que no se duplique un movimiento. Que no se informe éxito con estado incierto. Que quede trazabilidad. Que el usuario reciba un mensaje honesto.

Eso —lo que debe seguir siendo verdad bajo falla— es un **invariante de negocio**, y es el centro de gravedad de este artículo. La resiliencia no se demuestra enumerando mecanismos; se demuestra contrastando invariantes contra fallas realistas, con evidencia.

---

## 2. Prerrequisitos y glosario mínimo

No asumo que domines todo. Si un punto te resulta nuevo, conviene leerlo antes de correr cualquier ejemplo de los otros artículos. Lo marcado *(salteable)* podés dejarlo para una segunda pasada.

- **Dependencia downstream.** Un servicio del que dependés para completar una operación (acá: la validación de beneficiario). Su latencia y disponibilidad **son parte de tu latencia y disponibilidad**.
- **Latencia, timeout, partición de red.** Latencia = cuánto tarda. Timeout = cuánto estás dispuesto a esperar antes de cortar. Partición = parte de la red no puede hablar con otra parte (los mensajes se pierden o demoran indefinidamente).
- **Consistencia eventual y cola.** Un cambio puede aceptarse ahora y propagarse después (a través de una cola, un *event*, un *webhook*). El estado converge "eventualmente", no instantáneamente.
- **Idempotencia.** Que repetir la misma operación no cambie el resultado más allá de la primera vez. En HTTP, `GET`/`PUT`/`DELETE` se definen como idempotentes y `POST` **no** lo es ([RFC 9110 §9.2.2](https://www.rfc-editor.org/rfc/rfc9110#section-9.2.2), consultado 2026-07-09). Por eso una transferencia (típicamente `POST`) necesita una **clave de idempotencia explícita** para ser segura ante reintentos. *(Se desarrolla en el [artículo de patrones](/blog/patrones-de-resiliencia-con-trade-offs/).)*
- **Patrones de aislamiento.** *Timeout, retry con backoff/jitter, circuit breaker, bulkhead, rate limiting, fallback, degradación elegante.* Su combinación y su orden dependen del caso; no hay una receta universal. *(Detalle en el [artículo 2](/blog/patrones-de-resiliencia-con-trade-offs/).)*
- **Observabilidad.** Capacidad de responder preguntas sobre el sistema desde afuera usando sus señales: *logs*, métricas, trazas, estados de circuito. Se apoya en **SLIs** (indicadores de nivel de servicio) y **SLOs** (objetivos), definidos en el [SRE Book de Google](https://sre.google/sre-book/service-level-objectives/) (consultado 2026-07-09).
- **Backpressure y retry storm.** *Backpressure* = el sistema empuja hacia atrás cuando está saturado (rechaza, encola, ralentiza). *Retry storm* = todos reintentan a la vez sobre una dependencia enferma y la terminan de tumbar. *(Ver [SRE Book — Addressing Cascading Failures](https://sre.google/sre-book/addressing-cascading-failures/), consultado 2026-07-09.)*
- **Docker/Compose, seeds sintéticos, aislamiento.** Levantar un entorno reproducible con dependencias controladas por vos, con datos inventados y limpieza tras cada corrida. *(Uso concreto en el [artículo 3](/blog/experimento-de-caos-local-transferencia-degradada/).)*
- **Gestión de incidentes básica.** *Owner* (dueño responsable), *stop conditions* (cuándo detener), *rollback/reversión* (cómo volver atrás) y *postmortem* sin culpabilización (aprender del diseño, no castigar personas).

**Ruta de lectura.** Un perfil que recién empieza puede leer §1–§6 y volver luego a §7. Un perfil senior puede saltar a §4 (invariantes) y §6 (gobernanza).

---

## 3. Vocabulario y límites de la disciplina

Muchas discusiones fallan porque se usan como sinónimos términos que no lo son. Separarlos es el primer acto de criterio senior.

| Término | Qué es | Qué **no** es |
|---|---|---|
| **Resiliencia** | Capacidad del sistema de **absorber** fallas y degradar de forma controlada preservando lo esencial. | No es "no fallar nunca". Un sistema resiliente falla, pero de forma prevista y acotada. |
| **Disponibilidad** | Fracción del tiempo en que el servicio cumple su función (se mide con SLIs/SLOs). | No es sinónimo de resiliencia: podés estar "disponible" y aun así duplicar transferencias. |
| **Tolerancia a fallas** | El sistema sigue operando **sin degradación perceptible** ante ciertas fallas (típicamente por redundancia). | No es gratis ni universal: tolerás *las fallas que diseñaste tolerar*. |
| **Recuperación / DR** | Restaurar el servicio tras una falla mayor (incluye *Disaster Recovery* regional, backups, RTO/RPO). | No es lo mismo que resiliencia: DR actúa *después* del desastre; resiliencia intenta que muchas fallas no escalen a desastre. |
| **Degradación elegante** | Reducir funcionalidad de forma controlada (modo lectura, respuesta parcial, "pendiente") en vez de caer entero. | No es "mostrar un error genérico y rezar". |
| **Observabilidad** | Instrumentación que te deja *interpretar* qué pasó. | No es resiliencia: te dice que te caíste, no evita la caída. |
| **Seguridad** | Proteger de accesos y acciones no autorizadas. | Un ataque de denegación **no** es un experimento de caos. Ver §6. |
| **Performance / capacidad** | Cuánto y qué tan rápido; saturación, colas, backpressure. | La resiliencia usa performance como insumo, pero no la reemplaza. |

Y dentro de la práctica experimental:

| Término | Definición operativa |
|---|---|
| **Fault injection** | Introducir deliberadamente una falla (latencia, error 5xx, corte) en un componente controlado. |
| **Chaos experiment** | Un experimento con **hipótesis falsable** sobre estado estable, una variable de falla, observación y criterios de éxito/fallo. |
| **Prueba funcional negativa** | Verifica que ante una entrada inválida el sistema responde como se especifica (determinista). |
| **Game day** | Un ejercicio planificado y con roles donde el equipo practica responder a una falla inyectada. |
| **Steady state (estado estable)** | El comportamiento normal observable del sistema (throughput, tasa de error, latencia), medido por su **salida**, no por sus mecanismos internos. |
| **Blast radius** | El alcance máximo del daño potencial del experimento. Se **acota a propósito**. |
| **Guardrail** | Un límite que impide que el experimento exceda su alcance (tope de concurrencia, namespace aislado, datos sintéticos). |

> **Hecho citado.** *Principles of Chaos Engineering* define chaos engineering como *"la disciplina de experimentar sobre un sistema para construir confianza en su capacidad de resistir condiciones turbulentas"* y enumera cinco principios avanzados: construir una hipótesis alrededor del **estado estable**, variar **eventos del mundo real**, correr sobre tráfico realista, **automatizar** y **minimizar el blast radius** ([principlesofchaos.org](https://principlesofchaos.org/), consultado 2026-07-09).

> **Decisión de diseño (y matiz honesto).** El principio original dice "correr en producción". Para **aprendizaje, portfolio y madurez inicial**, este artículo prioriza deliberadamente entornos locales e integración aislada con datos sintéticos. No es que el principio esté mal; es que **producción exige un nivel de gobernanza que se gana**, no se asume (ver §6 y §7). *Principles of Chaos Engineering* es un **marco de práctica, no una norma de cumplimiento**: no hay "certificación de caos".

---

## 4. Riesgo primero: diseñar desde los invariantes de negocio

La tentación es empezar por la herramienta ("instalemos Chaos Mesh"). El orden senior es al revés: empezá por lo que **no puede dejar de ser verdad**.

Para la transferencia de *Nexo* (ficticia), estos son los invariantes de negocio candidatos:

1. **No duplicar.** Un mismo comando de transferencia (misma clave de idempotencia) produce **como máximo un** movimiento en el ledger.
2. **No mover dinero a la cuenta equivocada.** Un beneficiario no validado **no** se trata como validado.
3. **No perder trazabilidad.** Toda transferencia deja auditoría (redactada) suficiente para reconstruir qué pasó.
4. **No informar éxito con estado incierto.** Si no sabemos si la operación se completó, el usuario recibe un estado *pendiente/recuperable*, no un "listo".

> **Inferencia, no dogma.** Estos cuatro no son "los invariantes de toda fintech": son los que elegimos para *este* journey de *Nexo*. En tu sistema, los invariantes se descubren con negocio, riesgo y regulación aplicable, no se copian.

Un invariante bien escrito tiene una propiedad valiosa: **es falsable**. "El sistema es resiliente" no se puede refutar con un experimento; "un mismo `idempotency-key` nunca produce dos movimientos" **sí**. Los invariantes son el puente entre negocio y experimento.

> **Nota de cumplimiento (no es asesoramiento legal).** Que la auditoría sea "redactada" no es cosmético: los logs de un flujo de pago pueden contener datos que caen bajo estándares como **PCI DSS** (industria de tarjetas; v4.0.1 es la versión que figuraba como vigente al momento de consulta —confirmá en el [PCI Security Standards Council](https://www.pcisecuritystandards.org/document_library/)) o normas de protección de datos personales según la jurisdicción (p. ej. **GDPR** en la UE; en Argentina, el régimen de datos personales y las comunicaciones del **BCRA** para entidades reguladas). No incluimos PAN completo, credenciales ni PII sin sanear en ningún ejemplo. Delimitá versión y jurisdicción y consultá a las áreas de cumplimiento y legal: este artículo no sustituye ese consejo.

---

## 5. El método científico aplicado a calidad

Un experimento de resiliencia es un experimento en serio, con la misma estructura que uno de laboratorio.

1. **Estado estable.** Definí la salida "normal" observable: la tasa de *outcomes* de transferencia recuperables, la latencia del journey, la tasa de error de negocio. **Medí la salida, no el mecanismo** (principio de Chaos Engineering). "La CPU está al 40 %" **no** es estado estable de negocio.
2. **Hipótesis falsable.** Redactala como una afirmación que el experimento podría refutar. Ejemplo: *"Una latencia acotada en la validación de beneficiario preserva los invariantes 1 y 4"*. Si el experimento la refuta, **eso es un hallazgo valioso**, no un fracaso.
3. **Grupo de control.** Corré el journey **sin** la falla inyectada para tener línea base comparable. Sin control, no sabés qué causó qué.
4. **Variable de falla.** **Una** variable por experimento, controlada por vos: latencia acotada, un 5xx controlado, un corte. Cambiar varias a la vez destruye la interpretabilidad.
5. **Observaciones.** Trazas, métricas, estados de circuito y —sobre todo— **outcomes de negocio**: ¿se duplicó?, ¿el estado fue explícito?, ¿quedó auditoría?
6. **Criterios de éxito/fallo.** Definidos **antes** de correr. "Éxito" = los invariantes se sostuvieron **y** hubo evidencia suficiente. Un experimento que revela una debilidad y la documenta es exitoso.
7. **Amenazas a la validez.** ¿La falla se inyectó como se planeó? ¿El estado estable existía antes? ¿El entorno se parece lo suficiente? ¿Un solo journey generaliza? (Casi nunca: nómbralo.)

El siguiente diagrama resume el ciclo. Fijate que **hay dos salidas legítimas**: "cumple" y "no cumple". La segunda no es un error del proceso; es el motor de mejora.

<figure class="diagram">
  <img src="/blog/diagrams/resiliencia-chaos-engineering-evidencia-y-gobernanza-1.svg" width="488" height="755" alt="Diagrama: resiliencia-chaos-engineering-evidencia-y-gobernanza (1)" loading="lazy" decoding="async" />
</figure>

> **Semántica del diagrama.** El único camino para "inyectar" (`D`) pasa por `C`: sin *guardrails* y aprobación no hay experimento. La flecha `H → B` es intencional: al remediar, se reformula la hipótesis y se vuelve a correr; el aprendizaje es iterativo, no un veredicto único.

---

## 6. Seguridad, autoridad y stop conditions (esto no es una nota al pie)

Esta sección va **antes** de cualquier tutorial a propósito. Un experimento sin gobernanza no es chaos engineering: es un incidente autoinfligido.

**Checklist de autorización mínima antes de inyectar cualquier falla:**

- [ ] **Ambiente permitido.** Local o integración aislada, con datos sintéticos. Nunca producción ni servicios de terceros sin un régimen específico (§7).
- [ ] **Owner identificado.** Una persona responsable que puede **aprobar y cancelar** el experimento. No es "el equipo": es alguien con nombre.
- [ ] **Ventana acordada.** Cuándo corre, por cuánto, y quién está mirando.
- [ ] **Blast radius acotado y declarado.** Namespace/proyecto Compose único, tope de concurrencia autorizado, sin efectos sobre servicios vecinos.
- [ ] **Telemetría disponible.** Si el pipeline de observabilidad no está sano, **no se corre** (es una *abort condition*, no un detalle).
- [ ] **Stop conditions explícitas.** Señal de integridad de datos inesperada, telemetría caída, cualquier efecto fuera de alcance ⇒ se aborta.
- [ ] **Rollback probado.** Remover la inyección **y** correr conciliación/limpieza de datos sintéticos. Un rollback que nunca ejecutaste no es un rollback: es una esperanza.
- [ ] **Comunicación.** Quién se entera de que empieza y de que termina.

> **Opinión fundamentada.** La pregunta que más separa juniors de seniors no es "¿qué falla inyecto?" sino "**¿quién puede apretar el botón de aborto y cómo verifiqué que el rollback funciona?**". `environment: production` no es un cambio de texto en un YAML: es un cambio de régimen de autoridad, de blast radius y de responsabilidad legal.

**Distinción crítica (no la borres):** una inyección de fallas **no** es un ataque, ni una carga no autorizada, ni un test sin *guardrails*. No apuntes a activos que no son tuyos ni tenés autorización explícita para probar. Denegación de servicio, *scanning* y explotación de vulnerabilidades quedan **fuera de alcance** y fuera de este material. La resiliencia se prueba sobre lo propio y controlado.

---

## 7. Madurez: de experimento local a práctica continua con responsabilidad

No se empieza por producción. Se **gana** el derecho a cada nivel demostrando control en el anterior.

<figure class="diagram">
  <img src="/blog/diagrams/resiliencia-chaos-engineering-evidencia-y-gobernanza-2.svg" width="1158" height="108" alt="Diagrama: resiliencia-chaos-engineering-evidencia-y-gobernanza (2)" loading="lazy" decoding="async" />
</figure>

| Nivel | Qué se prueba | Señal de que estás listo para el siguiente |
|---|---|---|
| **1. Componente** | Que la *política* (timeout/retry/fallback/idempotencia) hace lo declarado, con tests deterministas. Ver [artículo 3, §tests](/blog/experimento-de-caos-local-transferencia-degradada/). | Tests verdes reproducibles; invariantes codificados como aserciones, no como intención. |
| **2. Integración aislada** | Que el *sistema* preserva invariantes ante una dependencia realmente lenta/caída (Toxiproxy en Compose). | Blast radius se mantuvo; hubo evidencia control/tratamiento; el rollback se ejecutó de verdad. |
| **3. Automatización periódica** | Experimentos programados y *game days*, con *gates* de CI proporcionados al riesgo (deterministas en PR, experimentos mayores fuera del PR). Ver [artículo 3, §CI/CD](/blog/experimento-de-caos-local-transferencia-degradada/). | Postmortems que produjeron mejoras; ownership y runbooks estables. |
| **4. Mayor riesgo** | Entornos productivos o *pre-prod* con tráfico realista. **Solo** con owner con autoridad, evaluación de riesgo formal, blast radius mínimo, telemetría probada, stop conditions y reversión ensayada. | Es una decisión organizacional, no técnica. Si dudás, no estás listo. |

> **Advertencia.** *Kubernetes probes* (liveness/readiness/startup), *health checks* y *autoscalers* **no reemplazan** los patrones de resiliencia ni los tests de negocio. La documentación oficial de Kubernetes lo dice explícitamente: las liveness probes mal configuradas pueden **causar fallas en cascada** reiniciando contenedores bajo carga ([Kubernetes — Probes](https://kubernetes.io/docs/concepts/workloads/pods/probes/), consultado 2026-07-09). Un pod "vivo" que duplicó una transferencia no es un éxito.

---

## 8. Anti-patrones de la disciplina

Para cada uno: causa → consecuencia → señal observable → alternativa.

1. **"Chaos" = apagar cosas sin hipótesis.**
   *Causa:* confundir espectáculo con método. *Consecuencia:* ruido sin aprendizaje; riesgo sin evidencia. *Señal:* no hay estado estable ni criterio de éxito escritos. *Alternativa:* toda inyección arranca en §5.
2. **Correr fallas sobre producción/terceros sin autoridad.**
   *Causa:* saltear la gobernanza. *Consecuencia:* incidente real, posible ilegalidad. *Señal:* no hay owner ni stop conditions. *Alternativa:* §6, y madurez §7.
3. **Definir éxito como "el pod siguió vivo".**
   *Causa:* medir el mecanismo, no la salida. *Consecuencia:* declarás resiliencia mientras la transferencia se duplicó. *Señal:* dashboards de CPU/uptime sin outcomes de negocio. *Alternativa:* invariantes de negocio como criterio (§4).
4. **Usar probes como sustituto de timeout/backpressure/degradación.**
   *Causa:* creer que Kubernetes "resuelve" resiliencia. *Consecuencia:* cascadas por reinicios; el negocio no está protegido. *Señal:* no hay política de timeout/fallback en el código. *Alternativa:* patrones en el [artículo 2](/blog/patrones-de-resiliencia-con-trade-offs/); probes como complemento.
5. **Inyectar sin telemetría y luego atribuir causalidad "con certeza".**
   *Causa:* saltear la observabilidad. *Consecuencia:* conclusiones inventadas. *Señal:* "creemos que fue el retry" sin trazas. *Alternativa:* telemetría como *abort condition* (§6).
6. **Cerrar el ticket sin reconciliar ni capturar aprendizaje.**
   *Causa:* tratar el experimento como una tarea de checklist. *Consecuencia:* datos sintéticos sucios, aprendizaje perdido. *Señal:* no hay postmortem ni ADR. *Alternativa:* rollback + reconciliación + postmortem (§6, §9).
7. **Convertir cada falla en culpa individual.**
   *Causa:* cultura punitiva. *Consecuencia:* la gente oculta fallas; el sistema no mejora. *Señal:* postmortems que nombran personas, no diseño. *Alternativa:* postmortem sin culpabilización que mejora diseño, guardrails y runbooks.

---

## 9. Nexo Finanzas: cómo se ancla esto en el portfolio (ficticio)

La colección usa un portfolio ficticio y coherente. Cada repositorio tiene un rol honesto:

- **`nexo-transfer-api`** — define los invariantes: clave de idempotencia, *ledger* ficticio, estados explícitos (`confirmed`/`pending_review`/`rejected`) y auditoría redactada.
- **`beneficiary-validation`** (dependencia ficticia) — se puede **ralentizar/controlar** en Docker Compose para el experimento. No usamos servicios externos reales.
- **`nexo-performance-lab`** — aporta la comprensión de saturación y *retry storms* (cómo un retry mal puesto empeora la falla).
- **`nexo-quality-platform`** — registra la **ficha del experimento**, control vs. tratamiento, evidencia y decisiones. No un simple "verde/rojo".
- **`nexo-web-banking-e2e` / `nexo-wallet-mobile`** — validan el **lenguaje y el estado que ve la persona usuaria** durante la degradación (¿le decimos "pendiente" con honestidad?).
- **`nexo-cross-channel-regression`** — conserva **solo pocos** journeys de resiliencia de alto riesgo; no reemplaza al laboratorio especializado.

Y un artefacto de gobernanza que atraviesa todo:

> **`ADR-006 — Experimentación de resiliencia con blast radius mínimo`** (plantilla completa en **artefactos/ADR-006**). Debe incluir: contexto, invariantes de negocio, ambiente permitido, autoridad requerida, tipo de inyección, guardrails, evidencia, alternativas consideradas, riesgos aceptados, estrategia de reversión y condición de revisión.

---

## 10. Qué aprendimos y próximos pasos

- La resiliencia es una **propiedad demostrada con evidencia**, no una lista de librerías instaladas.
- El experimento empieza por el **invariante de negocio** y por una **hipótesis falsable**, no por la herramienta.
- La **gobernanza** (owner, blast radius, stop conditions, rollback probado) es parte del experimento, no un anexo.
- Se **gana** el derecho a cada nivel de madurez; producción es una decisión de régimen, no un cambio de texto.
- Un experimento que **refuta** su hipótesis y lo documenta es un éxito.

**Seguí por acá:**

- **[Patrones de resiliencia con trade-offs](/blog/patrones-de-resiliencia-con-trade-offs/)** — timeout, retry, idempotencia, circuit breaker, bulkhead y fallback: cuándo sí, cuándo no y a qué costo.
- **[Diseñar un experimento de caos local seguro](/blog/experimento-de-caos-local-transferencia-degradada/)** — el caso de la transferencia con dependencia degradada, de punta a punta, con ficha, tests, telemetría y ADR.

---

## 11. Checklist final (aplicable)

- [ ] Puedo nombrar los invariantes de negocio del journey **antes** de elegir una herramienta.
- [ ] Mi hipótesis es **falsable** y tiene grupo de control.
- [ ] Definí estado estable por la **salida** del sistema, no por CPU/uptime.
- [ ] Hay owner con autoridad para **aprobar y cancelar**.
- [ ] Blast radius, guardrails y stop conditions están escritos y son verificables.
- [ ] El rollback (incluida la reconciliación de datos sintéticos) **se ejecutó al menos una vez**.
- [ ] Distingo resiliencia de disponibilidad, seguridad, performance y DR, y puedo explicar sus relaciones.
- [ ] Ningún ejemplo mío habilita pruebas disruptivas no autorizadas ni usa producción/terceros como laboratorio.
- [ ] Preveo documentar el resultado **incluso si refuta** la hipótesis.

---

## 12. Fuentes (consultadas 2026-07-09)

- *Principles of Chaos Engineering* — definición y principios avanzados. [principlesofchaos.org](https://principlesofchaos.org/) — *marco de práctica, no norma de cumplimiento*.
- Google, *SRE Book* — [Service Level Objectives](https://sre.google/sre-book/service-level-objectives/), [Addressing Cascading Failures](https://sre.google/sre-book/addressing-cascading-failures/), [Handling Overload](https://sre.google/sre-book/handling-overload/).
- Kubernetes — [Probes (liveness, readiness, startup)](https://kubernetes.io/docs/concepts/workloads/pods/probes/).
- IETF — [RFC 9110, HTTP Semantics §9.2.2 (idempotent methods)](https://www.rfc-editor.org/rfc/rfc9110#section-9.2.2).
- PCI Security Standards Council — [Document Library](https://www.pcisecuritystandards.org/document_library/) *(verificar versión vigente; no es asesoramiento de cumplimiento)*.
- AWS — [Well-Architected Framework](https://aws.amazon.com/architecture/well-architected/) *(usado solo como marco de arquitectura de confiabilidad, no como certificación ni receta multi-cloud)*.

> **Estado de verificación.** Todas las URLs anteriores fueron consultadas el 2026-07-09. Las definiciones citadas (chaos engineering, probes, idempotencia HTTP) se transcribieron/sintetizaron de la fuente en esa fecha. Donde una afirmación depende de una **versión** (p. ej., PCI DSS), lo indico explícitamente y remito a confirmar en la fuente primaria.

