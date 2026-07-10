---
title: "Glosario de la serie avanzada"
description: "Los términos que se usan mal con frecuencia, definidos una sola vez: comando vs evento, ack vs efecto, pseudonimizar vs anonimizar, deployment vs release, RFC vs ADR vs runbook."
pubDate: 2026-07-10
tags: ['glosario', 'event-driven', 'privacy', 'progressive-delivery', 'quality-engineering']
cluster: 'a00'
clusterTitle: "Mapa avanzado y priorización"
type: satelite
order: 2
readingLevel: "Transversal"
icon: 'command'
iconHue: 160
---

Fecha: **2026-07-10**. Los términos están definidos **una vez**, acá, y los artículos los asumen.

Se incluyen solo los términos que **se usan mal con frecuencia**. Un glosario que define "API" no le sirve a nadie; uno que distingue *anonimizar* de *pseudonimizar* evita un incidente.

---

## Mensajería y sistemas distribuidos

**Comando.** Una *intención* dirigida a un destinatario específico (`RegisterTransfer`). Puede ser rechazado.

**Evento.** Un *hecho consumado*, en pasado, sin destinatario específico (`TransferCreated`). No se puede rechazar: ya ocurrió.

> **La prueba de borrado:** si eliminar todos los consumidores de un mensaje cambia *si el hecho ocurrió*, ese mensaje es un **comando** disfrazado. Nombralo como tal y dale un destinatario.

**`ack` (acknowledgement).** Una señal de **transporte** que le dice al broker "no me lo mandes de nuevo". **No es una señal de negocio.** Un dashboard de "0 mensajes sin ack" puede convivir con un ledger descuadrado.

**at-most-once.** Confirmar y después procesar. Cero o una entrega. Riesgo: **pérdida silenciosa**. Inaceptable con dinero.

**at-least-once.** Procesar y después confirmar. Una o más entregas. Riesgo: **efecto duplicado**. Aceptable **si el consumidor es idempotente**.

**exactly-once.** Una propiedad con **frontera**, no una garantía global. Algunos brokers ofrecen atomicidad para el ciclo consumir-producir-commitear *dentro de sus propios topics*. En cuanto el efecto sale del broker —y escribir en tu base es salir— volvés a at-least-once. En esta serie el término aparece **solo para explicar por qué engaña**.

**effectively-once.** Procesar N entregas con **un solo efecto de negocio**. Es lo alcanzable, y es lo que un consumidor idempotente te da.

**Transactional outbox.** Escribir el evento en una tabla de la **misma base**, en la **misma transacción** que el hecho de negocio. Un proceso separado lo publica después. Resuelve la doble escritura sin transacciones distribuidas.

**Inbox (idempotent consumer).** Registrar el `eventId` en una tabla con restricción única, **en la misma transacción que el efecto**. Si el `INSERT` falla por unicidad, ya lo procesaste.

> Outbox e inbox son **una sola solución en dos mitades**. Ninguna sirve sola.

**Insert-first.** Intentar el `INSERT` y capturar la violación de unicidad, en vez de `if (exists()) ... else insert()`. La diferencia no es de estilo: `check-then-act` tiene una condición de carrera entre la lectura y la escritura.

**DLQ (dead-letter queue).** Donde va un mensaje tras agotar los reintentos. Sin política, contexto y dueño, es un **cementerio**.

---

## Tiempo

**Event time.** Cuándo ocurrió el **hecho**. Es el único que tiene significado de negocio. En Nexo: `occurred_at`.

**Ingestion time.** Cuándo el dato llegó al pipeline.

**Processing time.** Cuándo se procesó. Si agregás por processing time, el mismo día da números distintos según cuándo corriste el reporte.

> **Agregá siempre por event time.** Consecuencia incómoda: el resultado de "ayer" **puede cambiar** cuando llegue un dato tardío. Los reportes sobre event time son *eventualmente correctos*, no *inmediatamente finales*.

**Watermark.** Una **apuesta explícita**: *"creo que ya vi todos los eventos con event time anterior a T"*. No es una certeza. El número sale de la distribución medida de `ingestion − event`, no de un blog.

**Late data.** Un evento que llega después de que su ventana se cerró. **Descartarlo nunca es correcto con dinero.**

**Backfill.** Reprocesar datos históricos. Si el pipeline no es idempotente **por restricción de schema**, no tenés backfill: tenés una operación de riesgo.

---

## Idempotencia (dos cosas distintas con el mismo nombre)

| | Idempotencia de **API** | Idempotencia de **consumidor** |
|---|---|---|
| Clave | `Idempotency-Key` (header) | `eventId` (campo del evento) |
| Quién la genera | El **cliente**, una por intención | El **productor**, una por evento |
| Protege contra | Un reintento HTTP tras timeout | Una reentrega del broker |
| ¿Detectar reuso? | **Sí**: misma clave + body distinto = `422` | No: el `eventId` identifica un hecho inmutable |

**Fingerprint.** Hash del cuerpo canónico del request, para detectar que un cliente reusó una clave de idempotencia para otra operación. Aplica a la API, no al consumidor.

---

## Supply chain

**SBOM.** Un **inventario** de componentes, con un método de recolección y por lo tanto con **puntos ciegos**: la etapa donde se genera, los fat JARs, los binarios sin metadatos, la diferencia entre *presencia* y *ejecución*, y el hecho de que es una foto y la vulnerabilidad es una película.

**Provenance (procedencia).** Una afirmación **firmada** sobre cómo, dónde y a partir de qué se produjo un artefacto. El SBOM dice qué hay adentro; la provenance dice de dónde vino. **Necesitás las dos.**

**Attestation.** Sujeto (qué artefacto, por su **digest**) + predicado (qué se afirma) + firma (quién lo afirma).

**VEX.** *Vulnerability Exploitability eXchange*. El compañero del SBOM: dice si una vulnerabilidad presente **es explotable en tu producto**. Cuatro estados (`not_affected`, `affected`, `fixed`, `under_investigation`); una afirmación `not_affected` **debe** llevar justificación o declaración de impacto.

**SLSA.** Un marco de **propiedades del build**, no una certificación. Build track **L0–L3**. **No existe L4** en la especificación vigente (v1.2).

**Firma keyless.** La firma se asocia a una **identidad efímera** (OIDC → certificado de corta vida) en lugar de a una clave de larga vida, y queda registrada en un log de transparencia público.

> **`cosign verify` sin `--certificate-identity` responde "¿alguien firmó esto?".** La pregunta que necesitás responder es "¿lo firmó nuestro pipeline?".

**Digest vs tag.** Un **tag** (`:latest`, `@v3`) es un puntero que otro controla. Un **digest** (`@sha256:...`) es una dirección de contenido. Si el contenido cambia, el digest cambia.

---

## Entrega

**Deployment.** Poner una versión del código a correr. Evento **técnico**. Nadie lo nota.

**Release.** Exponer una funcionalidad a usuarios. Evento **de producto**. Alguien lo nota.

> El mayor beneficio de separarlos no es hacer experimentos: es que **el rollback deja de requerir un deployment**. La operación más urgente del peor momento pasa a ser la más barata.

**Blast radius.** Alcance × Severidad × **Reversibilidad**. La entrega progresiva **protege lo reversible**. Un canary sobre una operación irreversible no es un canary: es un incidente pequeño.

**Guardrail.** Señal + baseline + umbral + ventana + **acción automática**. Si le falta la acción, es una métrica con buenas intenciones.

**Piso de ruido.** Lo que obtenés al correr el análisis de canary con **dos versiones idénticas**. Debería dar cero y no lo da. Tu umbral tiene que estar cómodamente por encima. Sin este experimento, el umbral es un número inventado.

**Rolling update.** Reemplazar pods de a poco. **No es entrega progresiva**: al final el 100 % del tráfico está en la versión nueva y nadie miró nada.

**Drift.** La diferencia entre el estado deseado (Git) y el estado real del cluster. GitOps lo hace visible.

---

## Privacidad

**Seguridad.** ¿Alguien accedió sin autorización?

**Privacidad.** ¿Se usan los datos personales solo para la finalidad por la que se recolectaron? (*purpose limitation*)

**Cumplimiento.** ¿Podés demostrarle a un tercero que hacés lo que decís?

> Un sistema **perfectamente seguro** puede violar la privacidad: si todo el equipo tiene acceso **autorizado** a una copia de producción en test, no hubo brecha de seguridad y sí un problema de privacidad. El problema no es *quién* accede, es *para qué*.

**Pseudonimizar.** Reemplazar un identificador por otro **estable**. Sigue identificando a la misma persona, y **permite el enlace** entre datasets. Un hash sin sal de un documento es pseudonimización.

**Anonimizar.** Eliminar la posibilidad de reidentificar. Es difícil, requiere pensar en **cuasi-identificadores** (fecha de nacimiento + código postal + género identifica a una fracción sorprendente de una población), y **demostrarlo es un trabajo estadístico, no una intuición**.

> **Hashear no es anonimizar.** Si no podés demostrar que un dataset es no reidentificable, tratalo como personal.

**Cuasi-identificador.** Un campo que por sí solo no identifica, pero que en combinación con otros sí.

**Minimización.** El único control con eficacia del 100 % es **no recolectar el dato**.

---

## Datos y decisión

**Las seis dimensiones de calidad de datos.** Validez, completitud, unicidad, consistencia, exactitud, oportunidad. *Validez* es la más barata y la que más se prueba; los incidentes reales son de **completitud, consistencia y oportunidad**.

**Freshness.** `now() − max(occurred_at)`. El modo de fallo más silencioso: un pipeline detenido produce datos perfectamente consistentes, perfectamente válidos y **viejos**.

**Cuarentena.** Un registro que viola una regla sale del flujo principal **con su motivo**, el pipeline continúa, y se emite una métrica. Preserva el dato, no frena el negocio, y hace visible el problema.

**Anomalía.** Un valor estadísticamente inusual. Una **señal**, no una conclusión.

**Riesgo.** Una probabilidad de pérdida, *estimada*. Un score alto significa "la política dice que este caso merece fricción", no "esto es fraude".

**Fraude.** Un **hecho**: alguien actuó con intención de engañar. Solo se sabe **después**, y a veces nunca.

**Tasa base.** La proporción real de la clase que buscás. Con tasa base baja, **la accuracy está dominada por la clase mayoritaria y no dice nada**: un detector que devuelve siempre `ALLOW` tiene 99,7 % de accuracy y detecta cero casos.

**`featureSnapshot`.** Las features **congeladas** en el momento de la decisión. Sin él, reproducir una decisión vieja recalcula las features contra el estado actual y compara manzanas con naranjas.

**Shadow mode.** El sistema nuevo evalúa todo y **registra**, pero la decisión que se aplica es la del sistema viejo. Un backtest sobre tráfico real, sin riesgo.

---

## Economía y plataforma

**Costo por feedback útil.** `(costo por ejecución × ejecuciones) ÷ ejecuciones accionables`. Se degrada por **numerador y denominador** cuando sube la flakiness. Está construido para castigar la inestabilidad más que el gasto.

> El costo **dominante** de un ciclo de calidad es el **diagnóstico humano de fallos espurios**, y no aparece en ninguna factura. Nunca optimices un pipeline inestable.

**Golden path.** El camino recomendado, opinado y **soportado**. Uno bueno se elige; uno malo se impone.

**Escape hatch.** Una forma documentada, **probada en CI** y no vergonzosa de salirse del golden path. Cada uso es **una señal de producto**: si tres equipos se salen por lo mismo, encontraste la próxima capability.

**Adopción voluntaria.** La métrica. Si la adopción es forzada, no medís si tu plataforma sirve: medís cuánta autoridad tenés. **60 % voluntario está en mejor estado que 95 % mandatorio.**

**Breaking change (en un componente de test).** **Cualquier cambio que altere el resultado de un test existente.** Aunque el nuevo comportamiento sea "más correcto". Aunque solo cambies un timeout por defecto.

---

## Documentos

**RFC.** *"¿Qué deberíamos hacer?"* Se escribe **antes** de decidir. Tiene varias opciones y **preguntas abiertas**. Un RFC sin preguntas abiertas es un anuncio. Uno escrito después de implementar es documentación.

**ADR.** *"¿Qué decidimos, y por qué?"* Se escribe al decidir. **No se modifica: se supersede.** Uno que solo lista ventajas es marketing.

**Runbook.** *"¿Qué hago cuando esto falla?"* Se escribe antes de operar. **Uno que nunca se ensayó es una hipótesis.**

---

## Las frases que esta serie se prohíbe

Recogidas de la [verificación de fuentes](/blog/verificacion-de-fuentes-serie-avanzada/):

1. *"Cumplimos PCI DSS / GDPR / PSD2 / BCRA."*
2. *"Exactly-once."* (Salvo para explicar por qué engaña.)
3. *"SLSA nivel 4."* (No existe.)
4. *"SPDX 3.0 es la norma ISO."* (La ISO vigente pinea **2.2.1**.)
5. *"El SBOM prueba que somos seguros."*
6. *"Este proyecto demuestra escala productiva."*
7. Cualquier número de latencia, throughput, error rate o costo presentado como **medido**.
