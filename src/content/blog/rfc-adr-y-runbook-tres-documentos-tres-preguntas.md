---
title: "RFC, ADR y runbook: tres documentos, tres preguntas"
description: "Diferencia entre RFC, ADR y runbook; cuándo abrir una revisión de diseño; cómo escribir problema, contexto y no objetivos; y las nueve preguntas de calidad que hacen visible un modo de fallo."
pubDate: 2026-07-10
tags: ['rfc', 'adr', 'runbook', 'design-review', 'liderazgo-tecnico', 'quality-engineering']
cluster: 'a13'
clusterTitle: "RFC y design review de calidad"
type: pilar
order: 1
readingLevel: "Avanzado"
prerequisites: "Requiere leer diagramas de arquitectura y razonar sobre NFRs."
repo: "nexo-quality-platform"
icon: 'book'
iconHue: 220
---

> **Aviso.** Nexo Finanzas es **ficticio**. Las personas (`@ficticio-*`) son ficticias. **Este contenido no afirma haber liderado un equipo**: un portfolio individual demuestra criterio de decisión, no autoridad organizacional.

> **Promesa del artículo.** Al terminar vas a saber cuál de los tres documentos escribir en cada momento, cuándo vale la pena abrir una revisión de diseño, y las nueve preguntas que un Quality Engineer hace frente a una propuesta —preguntas que hacen visible un modo de fallo antes de que cueste caro arreglarlo.

## La prueba más barata que vas a escribir

Un bug encontrado en producción cuesta un incidente. En QA, cuesta un ticket. En code review, cuesta un comentario.

**En una design review, cuesta una pregunta.**

Y sin embargo, la mayoría de los perfiles de calidad entran cuando el código ya existe. Llegan a validar decisiones que ya no se pueden cambiar sin reescribir, y su influencia se reduce a documentar por qué algo va a fallar.

> **Tesis del capítulo.** Una buena revisión de diseño no busca aprobar o rechazar por autoridad. Hace visibles los supuestos, los modos de fallo, la evidencia necesaria, el ownership y la estrategia de recuperación **antes de que el costo de cambio aumente**.

Esta es la capacidad que más rápido cambia cómo te ven. Y empieza por algo aburrido: saber qué documento estás escribiendo.

## Tres documentos, tres preguntas, tres momentos

Se confunden todo el tiempo, y la confusión produce documentos que no sirven para nada.

| | **RFC** | **ADR** | **Runbook** |
|---|---|---|---|
| **Pregunta** | *"¿Qué deberíamos hacer?"* | *"¿Qué decidimos, y por qué?"* | *"¿Qué hago cuando esto falla?"* |
| **Cuándo** | **Antes** de decidir | Al decidir | Antes de operar |
| **Tiempo verbal** | Condicional: *"proponemos"* | Pasado: *"decidimos"* | Imperativo: *"apagá el flag"* |
| **¿Se modifica?** | Sí, durante la discusión | **No.** Se supersede | Sí, tras cada ensayo |
| **Audiencia** | Quien puede cambiar de opinión | Quien viene después | Quien está de guardia a las 3 AM |
| **Tiene opciones** | **Varias, con la descartada explicada** | Una, con las descartadas | Ninguna. Pasos |
| **Fracasa cuando** | Se escribe después de implementar | Solo lista ventajas | Nunca se ensayó |

Los tres modos de fracaso, con nombre:

- **El RFC escrito después de implementar** no es un RFC: es documentación disfrazada. Su valor entero reside en que la decisión todavía se puede cambiar cuando lo escribís. Si ya escribiste el código, el documento es teatro, y todos lo notan.
- **El ADR que solo lista ventajas** es marketing. Un ADR sin la alternativa descartada (argumentada a favor, honestamente) y sin consecuencias negativas no registró una decisión: registró una preferencia.
- **El runbook que nunca se ensayó** es una hipótesis. Y la primera vez que lo ejecutás es durante un incidente, que es el peor momento para descubrir que el paso 3 no funciona.

**La relación entre los tres:** un RFC produce un ADR; un ADR con consecuencias operativas produce un runbook. Si un RFC no termina en un ADR, la discusión no llegó a una decisión. Si un ADR que cambia el comportamiento en producción no genera un runbook, alguien va a improvisar.

## Cuándo abrir una revisión de diseño

No todo cambio la merece. El criterio no es el tamaño del cambio: es **el costo de estar equivocado**.

Abrí una revisión cuando el cambio:

- **Cruza una frontera transaccional.** Ahí viven la mitad de los bugs de esta serie.
- **Introduce una dependencia estructural** (broker, cluster, SaaS, base nueva).
- **Cambia un contrato** que otro equipo consume.
- **Modifica un invariante**, o crea uno nuevo.
- **Es difícil de revertir.** Migraciones de schema, cambios de formato de datos, cualquier cosa que escriba en un ledger.
- **Toca datos personales**, aunque sea para "mejorar el diagnóstico".

**No abras una revisión** cuando el cambio es reversible, local, y no cambia ningún contrato. Un RFC para renombrar una variable enseña al equipo que los RFCs son burocracia, y la próxima vez que abras uno importante, nadie lo va a leer con atención.

**El costo de una revisión no es escribirla: es la atención que consume.** Gastala donde importa.

## Cómo se escribe el problema

La sección más importante de un RFC es la primera, y casi siempre está mal escrita.

**Mal:**

> *"Proponemos implementar el patrón transactional outbox usando polling."*

Eso no es un problema. Es una solución buscando justificación. Quien lo lea va a discutir sobre polling versus CDC y nadie va a preguntar si hace falta un outbox.

**Bien:**

> *"Cuando `nexo-transfer-api` guarda una transferencia y publica el evento correspondiente, las dos operaciones no son atómicas: la base y el broker son sistemas distintos. Si el proceso muere entre el commit y la publicación, la transferencia existe y ningún consumidor se entera: el saldo proyectado nunca se actualiza y no hay ninguna señal. Si publicamos antes de commitear, un consumidor puede acreditar una transferencia que la base va a revertir."*

La segunda versión **no menciona ninguna solución.** Describe un modo de fallo con su consecuencia de negocio. Y produce una discusión completamente distinta: alguien puede proponer una alternativa que no se te había ocurrido, y ese es el punto entero de escribir un RFC.

**Regla:** si al leer la sección "Problema" alguien no puede proponer una solución distinta a la tuya, no escribiste un problema.

### Los no-objetivos

La sección que más discusiones ahorra, y la que más gente omite.

> **No objetivos de este RFC:**
> - No resolvemos la entrega ordenada de eventos.
> - No introducimos un schema registry.
> - No cambiamos el contrato externo de `POST /transfers`.
> - No optimizamos la latencia de publicación.

Cada línea evita una hora de reunión. Y la tercera —*no cambiamos el contrato externo*— es una **restricción de diseño disfrazada de no-objetivo**, y es la más útil de las cuatro: convierte "no queremos hablar de eso" en "cualquier solución que cambie la respuesta de la API queda descartada".

## Las nueve preguntas de calidad

Estas son las preguntas que un Quality Engineer aporta a una revisión. No son un checklist genérico: **cada una está diseñada para hacer visible un modo de fallo específico** que las preguntas de arquitectura no encuentran.

### 1. ¿Qué invariante no puede romperse?

Si nadie puede nombrarlo, no hay nada que proteger, y no vas a saber qué probar. *"El dinero permanece balanceado"* es un invariante. *"El sistema es confiable"* no lo es.

### 2. ¿Dónde termina la transacción?

La pregunta más productiva de todas. Fuerza a dibujar la frontera de atomicidad. En cuanto la dibujás, se ve todo lo que está afuera de ella —y todo lo que está afuera puede fallar de forma independiente.

### 3. ¿Qué pasa con mensajes duplicados o fuera de orden?

Si la respuesta es *"el broker lo garantiza"*, pedí la configuración exacta y el alcance de la garantía. Casi siempre la garantía termina en la frontera del broker, y el efecto de negocio está afuera.

### 4. ¿Cómo se migra y se revierte un schema?

Un cambio de schema sin plan de reversión es una decisión permanente tomada sin querer.

### 5. ¿Cómo se detecta un estado parcial?

Esta es la pregunta que revela la ausencia de reconciliación. Si el sistema puede quedar a medio camino —transferencia sí, asientos no— ¿qué lo detecta? Si la respuesta es "un usuario se queja", el sistema no tiene observabilidad, tiene clientes.

### 6. ¿Qué señal permite pausar una release?

Fuerza a definir un guardrail antes de necesitarlo. Y a menudo revela que las métricas no tienen la versión como dimensión, con lo cual no hay canary posible.

### 7. ¿Qué dato no debe aparecer en telemetría?

Se hace **en el diseño**, no cuando ya hay un año de logs con documentos adentro.

### 8. ¿Quién opera la solución, y con qué runbook?

Una propuesta sin dueño operativo es una propuesta que alguien más va a mantener. Preguntarlo en el diseño cambia el diseño: la gente propone cosas más simples cuando sabe que las va a operar.

### 9. ¿Qué afirmación de este documento todavía es una hipótesis?

**La mejor de las nueve, y la que más incomoda.**

Convierte una afirmación (*"esto reduce la latencia"*) en algo verificable (*"creemos que reduce la latencia; lo mediremos así; si no ocurre, haremos esto otro"*). Y desarma la retórica: nadie puede seguir afirmando algo con seguridad después de que le preguntaste, delante de todos, si es una hipótesis.

La respuesta correcta casi siempre es: *"varias"*. Y eso está bien. Un diseño honesto tiene hipótesis; lo peligroso es un diseño donde nadie sabe cuáles son.

## Riesgos sin controles no son riesgos

Un anti-patrón frecuente: la sección "Riesgos" de un RFC como lista de miedos.

> *"Riesgos: el outbox podría crecer mucho. La latencia podría aumentar. Podría haber duplicados."*

Eso no aporta nada. Un riesgo listado sin control es una preocupación, y las preocupaciones no se revisan.

**El formato que funciona:**

| Riesgo | Cómo se manifiesta | Control | Cómo se verifica |
|---|---|---|---|
| El outbox crece sin límite si el publisher muere | Latencia de publicación creciente; tabla gigante | Métrica de **antigüedad del pendiente más viejo**, con alerta | Test que detiene el publisher y verifica que la alerta dispara |
| El publisher publica el mismo evento dos veces | Doble efecto en el consumidor | Consumidor idempotente (`UNIQUE(eventId)`) | Test de entrega duplicada |
| Un consumidor viejo recibe un schema nuevo | Fallo en runtime | Compatibilidad forward + gate en CI | Test de contrato con schema anterior |

La columna **"cómo se verifica"** es la contribución específica de un Quality Engineer, y casi nunca está. Un control sin verificación es una intención.

Y notá la primera fila: **la métrica correcta no es la cantidad de filas pendientes, es la antigüedad de la más vieja.** Un publisher muerto con tráfico bajo deja pocas filas y mucha antigüedad. La métrica obvia no lo detecta. Esa observación sale de una design review, no de un code review.

## Registrar el disenso

Una decisión donde todos estuvieron de acuerdo es sospechosa: significa que alguien no dijo lo que pensaba, o que el problema era trivial.

**El disenso se registra, con nombre y argumento**, y la decisión se toma igual:

> **Disenso registrado.** @ficticio-bob sostiene que CDC es la opción correcta desde el inicio, porque migrar de polling a CDC más adelante requerirá reprocesar el histórico y coordinar un corte. El argumento es válido y se acepta como costo conocido.
>
> **Por qué decidimos igual:** el volumen actual no justifica la complejidad operativa de CDC, y el ADR-002 declara la señal concreta que dispararía la migración (latencia p99 de publicación por encima del intervalo de polling, sostenida). @ficticio-bob revisará esa señal en 6 meses.

Tres cosas ocurren con este párrafo:

1. **El disenso queda escrito**, así que cuando dentro de un año haya que migrar a CDC, nadie va a decir "nadie lo previó". Alguien lo previó, y está su nombre.
2. **Quien disintió tiene un rol**: revisar la señal. No perdió; tiene una fecha.
3. **La decisión tiene un disparador de revisión**, no una fecha arbitraria.

**Una decisión sin fecha de revisión es una decisión permanente tomada sin querer.** Es el mismo problema que un feature flag sin fecha de retiro, o una excepción de vulnerabilidad sin vencimiento. La serie entera vuelve sobre esto porque es el mismo error con tres nombres.

## El seguimiento, que nadie hace

Un RFC termina cuando la decisión se implementa. Y ahí empieza la parte que le da credibilidad a todo el proceso:

> **Validar los supuestos que declaraste como hipótesis.**

Si el RFC decía *"creemos que el polling con intervalo de N segundos es suficiente"*, hay que **medirlo** después de implementar, y **actualizar el documento** con el resultado.

Un equipo que hace esto una sola vez cambia su relación con los RFCs para siempre. Porque descubre que algunas hipótesis eran falsas, y que escribirlas fue lo que permitió notarlo.

Un equipo que nunca lo hace acumula RFCs que nadie relee, y aprende que escribirlos no tenía sentido. Con razón.

<figure class="diagram">
  <img src="/blog/diagrams/rfc-adr-y-runbook-tres-documentos-tres-preguntas-1.svg" width="1552" height="63" alt="Diagrama: rfc-adr-y-runbook-tres-documentos-tres-preguntas (1)" loading="lazy" decoding="async" />
</figure>

Las dos últimas cajas —`Validate assumptions` y `Update RFC or ADR`— son las que se saltean, y son las que cierran el circuito.

## Anti-patrones

- **RFC escrito después de implementar.** *Consecuencia:* teatro, y todos lo notan. *Alternativa:* si ya escribiste el código, escribí un ADR y admitilo.
- **La sección "Problema" describe una solución.** *Consecuencia:* la discusión se centra en tu solución. *Alternativa:* si nadie puede proponer una alternativa leyendo el problema, no escribiste un problema.
- **Documento enorme sin decisión.** *Consecuencia:* consumió atención y no produjo nada. *Alternativa:* todo RFC termina en un ADR o en un "no lo hacemos".
- **ADR que solo lista ventajas.** *Alternativa:* la alternativa descartada, argumentada a favor.
- **Riesgos listados sin controles.** *Consecuencia:* una lista de miedos. *Alternativa:* riesgo → control → **cómo se verifica**.
- **Runbook nunca ensayado.** *Alternativa:* tabla de ensayos con fecha.
- **Design review dominada por quien tiene más jerarquía.** *Alternativa:* ver el [artículo 2](/blog/facilitar-una-design-review-desde-calidad/).
- **Pruebas agregadas como apéndice final.** *Consecuencia:* la estrategia de pruebas no influyó en el diseño. *Alternativa:* la pregunta 1 (invariantes) va antes que la arquitectura.
- **Decisión sin fecha de revisión.** *Consecuencia:* permanente sin querer. *Alternativa:* fecha, o mejor, **un disparador**.
- **Disenso no registrado.** *Consecuencia:* dentro de un año "nadie lo previó". *Alternativa:* con nombre, argumento y rol.
- **No validar las hipótesis después de implementar.** *Consecuencia:* el equipo aprende que los RFCs no sirven. *Alternativa:* cerrá el circuito una vez y mirá qué pasa.
- **RFC para un cambio reversible y local.** *Consecuencia:* enseñás que los RFCs son burocracia. *Alternativa:* gastá la atención donde el costo de equivocarse es alto.

## Qué publicar en GitHub

```text
docs/rfcs/RFC-001-transactional-outbox.md      # el ejemplo completo, en artefactos
docs/adr/ADR-003-outbox-implementation.md      # el ADR que sale del RFC
docs/runbooks/outbox-backlog.md                # el runbook que el RFC promete
.github/ISSUE_TEMPLATE/design-review.md        # la plantilla
```

Los cuatro están escritos, completos, en `artefactos/`. **El RFC-001 está redactado como si el outbox todavía no existiera**, que es la única forma en que un RFC tiene sentido.

## Qué aprendimos / próximos pasos

- La prueba más barata que vas a escribir es una pregunta en una design review.
- RFC, ADR y runbook responden tres preguntas distintas, en tres momentos distintos.
- Si al leer tu "Problema" nadie puede proponer otra solución, escribiste una solución.
- Los no-objetivos ahorran más tiempo que cualquier otra sección.
- Un riesgo sin control es una preocupación; un control sin verificación es una intención.
- El disenso se registra con nombre, argumento y un rol futuro.
- Una decisión sin fecha de revisión es permanente sin querer.
- Validar las hipótesis después de implementar es lo que hace creíble todo el proceso.

**Siguiente:** [Facilitar una design review desde calidad](/blog/facilitar-una-design-review-desde-calidad/).

## Checklist final

- [ ] Sabés cuál de los tres documentos estás escribiendo.
- [ ] El RFC se escribió **antes** de implementar.
- [ ] La sección "Problema" no menciona ninguna solución.
- [ ] Hay una sección de **no objetivos**.
- [ ] Hay al menos dos opciones, y la descartada está argumentada a favor.
- [ ] Cada riesgo tiene control **y** forma de verificarlo.
- [ ] Las nueve preguntas de calidad están respondidas, aunque la respuesta sea "no lo sabemos".
- [ ] Hay una sección de **preguntas abiertas** sin responder.
- [ ] Está declarado qué afirmaciones siguen siendo hipótesis.
- [ ] El disenso está registrado con nombre y argumento.
- [ ] La decisión tiene fecha de revisión, o un disparador.
- [ ] El ADR resultante existe.
- [ ] El runbook resultante existe, y tiene tabla de ensayos.
- [ ] Después de implementar, alguien validó las hipótesis y actualizó el documento.

---

## Fuentes (consultadas 2026-07-10)

- Este artículo describe una práctica de escritura y facilitación. **No depende de la versión de ninguna herramienta.**
- [Google SRE — Postmortem Culture](https://sre.google/sre-book/postmortem-culture/) — el tono sin culpables que una design review comparte con un postmortem.
- [Google SRE — Service Level Objectives](https://sre.google/sre-book/service-level-objectives/) — para la pregunta 6 (qué señal permite pausar una release).
- Los invariantes, fronteras transaccionales y modos de fallo sobre los que se hacen las nueve preguntas están desarrollados en los [capítulos 01 a 08](/blog/de-qa-automation-a-quality-engineering-mapa-de-180-dias/).
- [Verificación de fuentes de la serie](/blog/verificacion-de-fuentes-serie-avanzada/)
