---
title: "Patrones de resiliencia con trade-offs: timeout, retry, idempotencia, circuit breaker y bulkhead"
description: "Guía de patrones de resiliencia para QA/SDET y devs: timeout, retry con backoff/jitter, idempotencia, circuit breaker, bulkhead, rate limiter y fallback, con trade-offs, orden de aplicación y tabla de decisión."
pubDate: 2026-07-09
tags: ["resilience", "circuit-breaker", "retry", "idempotency", "bulkhead", "resilience4j", "quality-engineering"]
cluster: "11"
clusterTitle: "Resiliencia y chaos engineering"
type: "satelite"
order: 2
icon: "refresh"
iconHue: 45
readingLevel: "Intermedio–Avanzado"
prerequisites: "Requiere HTTP/APIs, concurrencia básica y haber leído el pilar de la colección."
---
> **Promesa del artículo.** Al terminar vas a poder elegir entre timeout, retry (con backoff y jitter), idempotencia, circuit breaker, bulkhead, rate limiter y fallback **según el caso**, entender cómo interactúan y en qué orden se aplican, y llenar una tabla de decisión por operación sin copiar "valores correctos" que no medí. La tesis: **ningún patrón es bueno en abstracto; cada uno es una decisión con un costo.**

> **Nota de honestidad intelectual.** Separo **hecho citado** (fuente + fecha), **inferencia**, **decisión de diseño** y **ejemplo ficticio**. *Nexo Finanzas* es una fintech inventada con datos sintéticos; ningún número atribuido a *Nexo* es real. Los valores de configuración que aparecen (`maxAttempts: 3`, `timeout: 800ms`, etc.) son **ilustrativos**: se determinan midiendo tu sistema, no copiándolos de acá.

> **Parte 2 de una colección de tres.** El [pilar](/blog/resiliencia-chaos-engineering-evidencia-y-gobernanza/) da el porqué, el vocabulario y la gobernanza. El [artículo del experimento](/blog/experimento-de-caos-local-transferencia-degradada/) pone estos patrones a prueba con una dependencia lenta real.

---

## 1. El problema: "agregamos retries" y el incidente empeoró

*Nexo Finanzas* (ficticia) tenía la validación de beneficiario intermitentemente lenta. Alguien, con buena intención, agregó **3 reintentos a toda llamada fallida**. El lunes siguiente, la validación tuvo un pico de latencia. Cada request que fallaba se reintentaba 3 veces. La dependencia, ya enferma, pasó a recibir **hasta 4× el tráfico** justo cuando menos podía. Lo que era una degradación se volvió una **caída**: un *retry storm* clásico.

> **Hecho citado.** El *SRE Book* de Google documenta este mecanismo: los reintentos amplifican la carga sobre un servicio ya sobrecargado y son un motor típico de **fallas en cascada** ([Addressing Cascading Failures](https://sre.google/sre-book/addressing-cascading-failures/), consultado 2026-07-09).

La moraleja no es "los retries son malos". Es que **un retry sin timeout, sin backoff, sin jitter, sin límite y sin distinguir errores transitorios de permanentes es un multiplicador de daño**. Cada patrón que sigue existe para contener un riesgo específico y trae su propio costo.

---

## 2. Prerrequisitos y glosario

- **Error transitorio vs. permanente.** Transitorio: probablemente funcione si reintentás (timeout de red, 503 momentáneo). Permanente: reintentar no ayuda (400 *bad request*, 403, "beneficiario inexistente"). **Reintentar un error permanente es puro daño.**
- **Operación idempotente.** Repetirla no cambia el resultado más allá de la primera vez. Clave para poder reintentar con seguridad (ver §5).
- **Budget de tiempo.** El tiempo total que el usuario/llamador está dispuesto a esperar. Todos los timeouts + reintentos **deben caber** dentro de ese budget.
- **Aspecto / decorador.** En librerías como Resilience4j, cada patrón es un envoltorio (decorator) alrededor de la llamada; el **orden** en que se envuelven importa (§10).
- **Estado compartido.** Un circuit breaker o un bulkhead mantienen estado (contadores, permisos) que afecta a todas las llamadas que pasan por ellos.

Si el vocabulario de resiliencia/observabilidad te resulta nuevo, empezá por el [pilar §2–§3](/blog/resiliencia-chaos-engineering-evidencia-y-gobernanza/).

---

## 3. Timeout: el patrón que casi nadie configura y todos necesitan

**Qué hace.** Corta la espera de una dependencia tras un límite. Sin timeout, una dependencia lenta **te contagia su lentitud** y consume tus recursos (threads, conexiones) hasta agotarlos.

**Trade-off.**
- *Timeout muy corto:* cortás operaciones que iban a completarse ⇒ más errores/pendientes innecesarios.
- *Timeout muy largo:* mantenés recursos ocupados esperando algo que no llega ⇒ saturación y cascada.

**Cómo se elige (no se copia).** A partir de la **distribución de latencia** de la dependencia sana (p. ej. p99) más un margen, y **acotado por el budget de tiempo** del journey. Es una **decisión de diseño basada en medición**, no un `3000` que viste en un blog.

> **Inferencia.** Un buen default operativo suele estar cerca del p99 de la dependencia sana, pero solo tu telemetría te dice cuál es ese p99. Si no lo medís, no lo sabés.

**Anti-patrón.** *No poner timeout* (o dejar el default "infinito" del cliente HTTP). *Consecuencia:* agotamiento de pool de conexiones y cascada. *Señal:* threads bloqueados en `read()`. *Alternativa:* timeout explícito por dependencia, derivado de su latencia medida.

---

## 4. Retry con backoff y jitter: útil solo bajo condiciones estrictas

**Qué hace.** Reintenta una operación que falló por un error **transitorio**.

**Las cuatro condiciones que un retry seguro necesita** (si falta una, no reintentes):

1. **El error es transitorio** (clasificación explícita de excepciones/códigos).
2. **La operación es idempotente** o tiene clave de idempotencia (§5). Reintentar un `POST` de dinero sin esto **duplica**.
3. **Hay budget de tiempo** para el reintento sin romper el SLA del journey.
4. **Hay backoff + jitter y un límite de intentos**, para no generar un retry storm.

**Backoff exponencial + jitter.** *Backoff* = esperar cada vez más entre intentos. *Jitter* = agregar aleatoriedad para que muchos clientes **no** reintenten sincronizados (el sincronismo es lo que tumba la dependencia).

> **Hecho citado.** El análisis de AWS *"Exponential Backoff And Jitter"* muestra que **agregar jitter reduce sustancialmente la contención** frente a backoff puro, porque desincroniza a los reintentadores ([AWS Architecture Blog](https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/), consultado 2026-07-09). No es opcional en sistemas con muchos clientes.

**Trade-off.** Cada reintento **aumenta la carga** sobre una dependencia ya débil y **alarga la latencia percibida**. El retry compra "probabilidad de éxito" a costa de "presión sobre el downstream" y "tiempo". Si la dependencia está caída, el retry solo la patea mientras está en el piso.

**Anti-patrón (el del §1).** *Retries a todos los errores.* *Consecuencia:* retry storm y cascada. *Señal:* la carga sobre el downstream sube cuando el downstream se degrada. *Alternativa:* clasificar errores, exigir idempotencia, backoff+jitter, límite, y considerar un circuit breaker que corte los reintentos cuando la dependencia está claramente enferma.

---

## 5. Idempotencia: la precondición para reintentar dinero

**Qué hace.** Garantiza que repetir el mismo comando **no** produzca un segundo efecto. Es la diferencia entre el "Futuro A" (duplicado) y el "Futuro B" (recuperable) del [pilar §1](/blog/resiliencia-chaos-engineering-evidencia-y-gobernanza/).

**Por qué el dinero lo exige.** En HTTP, `POST` **no** es idempotente por definición ([RFC 9110 §9.2.2](https://www.rfc-editor.org/rfc/rfc9110#section-9.2.2), consultado 2026-07-09). Una transferencia es típicamente un `POST`. Por lo tanto, la seguridad ante reintentos **no viene del método HTTP**: hay que construirla con una **clave de idempotencia** que el llamador genera y el servidor registra.

**Mecanismo (conceptual).** El cliente envía una `Idempotency-Key` única por intención. El servidor, la primera vez, registra `(key → resultado)`; si llega otra vez la misma key, **devuelve el resultado guardado** sin re-ejecutar el efecto. Esta es la técnica que usan las plataformas de pagos de la industria (p. ej., Stripe documenta claves de idempotencia con esta semántica — [Stripe Docs, Idempotent requests](https://docs.stripe.com/api/idempotent_requests), consultado 2026-07-09; se cita como práctica de industria, no como recomendación de proveedor).

```java
// Ilustrativo. No es código listo para producción.
TransferResult submit(TransferCommand command) {
    IdempotencyRecord prior = idempotencyStore.find(command.key());
    if (prior != null) return prior.result();       // (1) reintento seguro: devuelve lo ya hecho

    try {
        BeneficiaryStatus status = withBoundedTimeout(  // (2) timeout acotado (§3)
            () -> beneficiaryClient.validate(command.beneficiary()),
            configuredTimeout
        );
        return ledger.commitOnce(command, status);   // (3) el commit es "once": una sola vez por key
    } catch (DependencyTimeout timeout) {
        audit.recordPendingReview(command.safeReference()); // (4) estado INCIERTO != éxito
        return TransferResult.pending("validation_delayed");
    }
}
```

- **(1)** El *lookup* por clave hace el reintento seguro: no re-ejecuta el efecto.
- **(3)** `commitOnce` implica que la escritura al ledger es atómica respecto de la clave (idealmente con una restricción de unicidad en la base de datos, no solo en el código).
- **(4)** Lo más importante: ante timeout, **no** transformamos un estado incierto en éxito. Devolvemos `pending`.

> **Decisión de diseño (que ninguna librería toma por vos).** Qué hacer ante un estado incierto —rechazar, dejar pendiente, compensar o reintentar— depende de reglas de producto, del contrato transaccional y de la estrategia de **reconciliación**. Resilience4j (o cualquier lib) te da el timeout y el retry; **no** te dice si un timeout debe volverse "rechazado" o "pendiente". Esa es tu decisión, y es de negocio.

**Anti-patrón.** *Reintentar operaciones no idempotentes sin clave/registro.* *Consecuencia:* duplicados de dinero. *Señal:* dos movimientos con el mismo intent. *Alternativa:* clave de idempotencia + unicidad en el store + estado explícito.

---

## 6. Circuit breaker: dejar de golpear a una dependencia caída

**Qué hace.** Monitorea la tasa de fallos hacia una dependencia. Si supera un umbral, **abre el circuito**: durante un tiempo, las llamadas fallan rápido (o van al fallback) **sin** tocar la dependencia, dándole aire para recuperarse. Después prueba con unas pocas llamadas ("medio abierto") y decide si cerrar.

<figure class="diagram">
  <img src="/blog/diagrams/patrones-de-resiliencia-con-trade-offs-1.svg" width="543" height="370" alt="Diagrama: patrones-de-resiliencia-con-trade-offs (1)" loading="lazy" decoding="async" />
</figure>

> **Hecho citado.** Resilience4j modela exactamente estos estados —`CLOSED`, `OPEN`, `HALF_OPEN`— más dos especiales, `DISABLED` y `FORCED_OPEN`, y calcula la tasa de fallos sobre una ventana deslizante configurable (por conteo o por tiempo) ([Resilience4j — CircuitBreaker](https://resilience4j.readme.io/docs/circuitbreaker), consultado 2026-07-09).

**Trade-off.**
- *Umbral muy sensible / ventana chica:* el circuito abre por ruido y niega servicio que estaba bien.
- *Umbral muy tolerante / ventana grande:* tarda en abrir y deja que la cascada avance.
- **Costo conceptual:** un circuito abierto **cambia la respuesta que ve el usuario**. Si no diseñaste el fallback (§8), "circuito abierto" se traduce en "error genérico" y el usuario no entiende nada.

**Anti-patrón.** *Configurar un circuit breaker sin tests de sus estados y sin definir qué verá el usuario en cada uno.* *Consecuencia:* comportamiento impredecible en el peor momento. *Señal:* no hay test que fuerce `OPEN` y verifique el mensaje al usuario. *Alternativa:* tests deterministas de transición de estados (ver [artículo 3, §tests](/blog/experimento-de-caos-local-transferencia-degradada/)) + fallback explícito.

> **Aclaración importante.** Circuito abierto **no** es sinónimo de "aplicación caída". Su impacto depende de cómo uses el fallback y de cómo expongas la salud. Un circuito abierto que deriva a un estado `pending` recuperable es un sistema **funcionando como se diseñó**.

---

## 7. Bulkhead y rate limiter: contener el daño a un compartimento

**Bulkhead (mamparo).** Limita cuántas llamadas concurrentes pueden ir a una dependencia. Como los mamparos de un barco: si un compartimento se inunda (una dependencia se cuelga), **no** se lleva puesto al resto del sistema, porque solo pudo ocupar N slots.

- *Trade-off:* limitás el uso de recursos por dependencia (bueno) pero podés rechazar llamadas legítimas cuando hay pico (costo). El número de slots sale de tu capacidad medida, no de un default.
- Resilience4j ofrece bulkhead por semáforo (conteo de concurrencia) y por thread pool ([Resilience4j — Bulkhead](https://resilience4j.readme.io/docs/bulkhead), consultado 2026-07-09).

**Rate limiter.** Limita **cuántas llamadas por unidad de tiempo** se permiten (protege a la dependencia y a vos de saturarla).

- *Trade-off:* protegés capacidad (bueno) a costa de rechazar/encolar tráfico sobre el límite (costo). Relación directa con *load shedding*: el *SRE Book* trata cómo rechazar carga de forma controlada para no colapsar ([Handling Overload](https://sre.google/sre-book/handling-overload/), consultado 2026-07-09).

**Señal de éxito de estos patrones:** solicitudes rechazadas por bulkhead/rate limiter **cuando corresponde**, en vez de un colapso general. Un rechazo controlado es mejor que una caída total —pero **debe** traducirse en un estado honesto para el usuario, no en un error mudo.

---

## 8. Fallback y degradación elegante: qué pasa cuando "no se pudo"

**Qué hace.** Define el comportamiento alternativo cuando el camino principal falla: un valor por defecto seguro, una respuesta parcial, un modo "solo lectura" o —en dinero— un estado **pendiente/recuperable**.

**La regla de oro en operaciones de dinero:** un fallback **nunca** debe convertir un estado incierto en un "éxito". El fallback correcto para una transferencia con validación caída **no** es "asumamos que el beneficiario es válido y transferimos"; es "dejémosla pendiente y comuniquémoslo".

- *Cache/cola como fallback:* podés servir un dato cacheado (si tolera estar viejo) o **encolar** el trabajo para procesarlo cuando la dependencia vuelva (consistencia eventual).
- *Dead-letter + reconciliación:* lo que no se pudo procesar va a una cola muerta y a un proceso de conciliación que reconstruye el estado correcto. Esto es **diseño de datos**, no una feature de la librería de resiliencia.

**Anti-patrón.** *Fallback que "resuelve" mostrando éxito o un valor inventado.* *Consecuencia:* mentira al usuario, corrupción de estado. *Señal:* el happy path y el fallback devuelven lo mismo. *Alternativa:* fallback que preserva la verdad de negocio (estado explícito + trazabilidad).

---

## 9. Configuración: leerla con ojo crítico

El siguiente YAML es **equivalente** a una configuración de Resilience4j. Úsalo solo tras verificar tu versión y runtime.

```yaml
# Ilustrativo. Validar contra la versión concreta de Resilience4j y del runtime.
resilience4j:
  retry:
    instances:
      beneficiaryValidation:
        maxAttempts: 3                 # limite de intentos (no "para siempre")
        enableExponentialBackoff: true # backoff; sumar jitter para desincronizar
        # retryExceptions: SOLO las transitorias. Clasificar es la decision clave.
  circuitbreaker:
    instances:
      beneficiaryValidation:
        slidingWindowType: COUNT_BASED
        minimumNumberOfCalls: 20        # no decidir con muestras chicas
        # failureRateThreshold, waitDurationInOpenState: derivar de datos, no copiar
  bulkhead:
    instances:
      beneficiaryValidation:
        maxConcurrentCalls: 10          # tope de concurrencia = capacidad medida
```

> **Advertencia de versión (verificado 2026-07-09).** Resilience4j tiene una línea **2.x** (requiere **Java 17**) y una línea **3.x** (requiere **Java 21**, con soporte de *virtual threads* en sus schedulers internos). Las claves de configuración, el orden de aspectos y las excepciones válidas **pueden diferir entre versiones y entre Spring Boot 2/3**. Confirmá en la [documentación oficial](https://resilience4j.readme.io/docs/getting-started) y en el [changelog](https://resilience4j.readme.io/changelog) antes de copiar cualquier clave. No pude fijar aquí el número de patch exacto vigente; **verificalo en tu build**.

Lo que el YAML **no** dice y vos tenés que decidir:
- **`retryExceptions`**: cuáles son transitorias en *tu* dominio. Un `503` sí; un "beneficiario inexistente", no.
- **Umbrales**: `failureRateThreshold`, `waitDurationInOpenState`, `timeout`: salen de tu telemetría.
- **Interacción retry ↔ circuit breaker**: si el retry reintenta demasiado, puede impedir que el breaker "vea" los fallos y abra. El orden importa (§10).

---

## 10. Orden e interacción de los patrones

Los patrones no son independientes: se **componen**, y el orden cambia el comportamiento. Un orden razonable, de afuera hacia adentro de la llamada:

<figure class="diagram">
  <img src="/blog/diagrams/patrones-de-resiliencia-con-trade-offs-2.svg" width="1840" height="159" alt="Diagrama: patrones-de-resiliencia-con-trade-offs (2)" loading="lazy" decoding="async" />
</figure>

> **Decisión de diseño (con matiz).** Este orden es **una** convención razonable, no la única. Por ejemplo, ubicar el retry *por dentro* del circuit breaker hace que cada ciclo de reintentos cuente como una unidad ante el breaker; ubicarlo *por fuera* cambia cómo el breaker percibe los fallos. Resilience4j documenta el orden de decoración y permite ajustarlo; **verificá el comportamiento exacto de tu versión** ([Resilience4j — Getting Started](https://resilience4j.readme.io/docs/getting-started), consultado 2026-07-09). La única forma honesta de saber cómo interactúan en tu caso es **probarlo** (de eso trata el [artículo 3](/blog/experimento-de-caos-local-transferencia-degradada/)).

---

## 11. Tabla de decisión por operación (plantilla, no llenar con "valores correctos")

Para cada operación crítica, respondé estas preguntas **con datos**. Si no tenés el dato, la celda dice "por medir", no un número inventado.

| Pregunta | Transferencia (ficticia) | Consulta de saldo (ficticia) |
|---|---|---|
| ¿Es idempotente / tiene clave? | Sí, `Idempotency-Key` obligatoria | Sí (lectura, naturalmente idempotente) |
| ¿Qué errores son transitorios? | timeout, 503 de validación | timeout, 503 |
| ¿Hay budget de tiempo? | Sí, acotado (UX de pago) → *valor por medir* | Más holgado → *valor por medir* |
| ¿Retry seguro? | Sí, **solo** por ser idempotente | Sí |
| ¿Fallback que preserva la verdad? | Estado `pending_review` + aviso | Cache con marca "dato posiblemente atrasado" |
| ¿Qué métrica prueba que no hubo retry storm? | retries/op y carga sobre validación durante degradación | ídem |

> **Regla honesta.** Si no tenés los datos para llenar una fila, la respuesta correcta es "no lo sé todavía", no un valor plausible. Un valor inventado en esta tabla es una decisión de arquitectura sin evidencia.

---

## 12. Anti-patrones (resumen accionable)

| Anti-patrón | Consecuencia | Alternativa |
|---|---|---|
| Sin timeout (default infinito) | Agotamiento de pool, cascada | Timeout por dependencia, derivado de latencia medida |
| Retry a todos los errores | Retry storm | Clasificar transitorios + backoff/jitter + límite |
| Retry sin idempotencia en dinero | Duplicados | Clave de idempotencia + unicidad en store |
| Circuit breaker sin tests de estado ni fallback | Comportamiento impredecible en el peor momento | Tests de transición + fallback explícito |
| Fallback que finge éxito | Mentira al usuario, corrupción | Estado explícito + trazabilidad + reconciliación |
| "Valores mágicos" copiados de un blog | Configuración sin evidencia | Umbrales derivados de telemetría; validar con experimento |

---

## 13. Qué aprendimos y próximos pasos

- Cada patrón **contiene un riesgo y trae un costo**; no hay "buenos" en abstracto.
- Los patrones **interactúan**: retry + circuit breaker + timeout mal ordenados se sabotean entre sí.
- La **idempotencia** es la precondición no negociable para reintentar dinero.
- Los **valores** salen de tu telemetría; copiar defaults es tomar decisiones de arquitectura a ciegas.
- La única forma honesta de validar la interacción de patrones es **probarla con un experimento**.

**Seguí por acá:**

- **[Diseñar un experimento de caos local seguro](/blog/experimento-de-caos-local-transferencia-degradada/)** — poné estos patrones a prueba con una dependencia lenta real, con ficha, telemetría y ADR.
- **[El pilar](/blog/resiliencia-chaos-engineering-evidencia-y-gobernanza/)** — el porqué, la gobernanza y la madurez que enmarcan todo esto.

---

## 14. Checklist final (aplicable)

- [ ] Cada dependencia crítica tiene un **timeout explícito** derivado de su latencia medida.
- [ ] Los retries están **limitados**, con **backoff + jitter**, y solo para errores **transitorios**.
- [ ] Ninguna operación de dinero se reintenta **sin** clave de idempotencia + unicidad en el store.
- [ ] Cada circuit breaker tiene **tests de sus tres estados** y un **fallback definido** con mensaje al usuario.
- [ ] Bulkhead/rate limiter tienen topes derivados de **capacidad medida**, no de defaults.
- [ ] Ningún fallback convierte un **estado incierto** en "éxito".
- [ ] La tabla de decisión por operación no tiene **valores inventados**: lo no medido dice "por medir".
- [ ] Conozco el **orden** de mis aspectos y verifiqué su interacción en mi versión.

---

## 15. Fuentes (consultadas 2026-07-09)

- IETF — [RFC 9110, HTTP Semantics §9.2.2 (idempotent methods)](https://www.rfc-editor.org/rfc/rfc9110#section-9.2.2).
- Google, *SRE Book* — [Addressing Cascading Failures](https://sre.google/sre-book/addressing-cascading-failures/), [Handling Overload](https://sre.google/sre-book/handling-overload/).
- AWS Architecture Blog — [Exponential Backoff And Jitter](https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/).
- Resilience4j — [Getting Started](https://resilience4j.readme.io/docs/getting-started), [CircuitBreaker](https://resilience4j.readme.io/docs/circuitbreaker), [Retry](https://resilience4j.readme.io/docs/retry), [Bulkhead](https://resilience4j.readme.io/docs/bulkhead), [Changelog](https://resilience4j.readme.io/changelog).
- Stripe Docs — [Idempotent requests](https://docs.stripe.com/api/idempotent_requests) *(citado como patrón de industria, no como recomendación de proveedor)*.

> **Estado de verificación.** URLs consultadas el 2026-07-09. Resilience4j: confirmadas las líneas **2.x (Java 17)** y **3.x (Java 21, virtual threads)**; el número de patch exacto vigente **debe verificarse en tu build** contra el changelog oficial. Los valores de configuración de los ejemplos son **ilustrativos** y no representan mediciones reales.

