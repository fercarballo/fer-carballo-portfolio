---
title: "El contrato de telemetría: privacidad, cardinalidad y costo como decisiones de arquitectura"
description: "La telemetría no es 'gratis'. Cómo escribir un contrato de telemetría verificable para un journey crítico: atributos permitidos/prohibidos, cardinalidad, sampling, retención, allowlist vs redacción, tests de contrato y un ADR de referencia."
pubDate: 2026-07-09
tags: ["observabilidad", "gobernanza-datos", "cardinalidad", "sampling", "privacidad", "opentelemetry", "adr", "quality-engineering"]
cluster: "07"
clusterTitle: "Observabilidad para Quality Engineering"
type: "satelite"
order: 2
icon: "search"
iconHue: 265
readingLevel: "Avanzado"
prerequisites: "SDET Senior / Staff, DevOps, Data/Platform"
---
> **Bajada.** Instrumentar es fácil; instrumentar **bien y de forma sostenible** es una decisión de arquitectura. Cada atributo que agregás tiene un costo de cardinalidad, un riesgo de privacidad y una factura de retención. Este artículo propone tratar la telemetría como un **contrato explícito, versionado y verificable por tests**, en lugar de un acuerdo tácito que se descubre roto durante un incidente o una auditoría.

> **Nota.** Continúa el pilar [Observabilidad para Quality Engineering](/blog/observabilidad-quality-engineering-evidencia-explicable/). Los datos de **Nexo Finanzas** son **ficticios**. Este texto es material técnico-educativo: **no es asesoramiento legal ni de cumplimiento**. Toda mención a PCI DSS, GDPR u OWASP debe verificarse contra la fuente oficial vigente en tu jurisdicción y versión. Fecha de consulta de fuentes: **9 de julio de 2026**.

---

## Resumen ejecutivo

- Sin contrato, la telemetría **deriva**: cada equipo agrega atributos ad hoc, la cardinalidad explota, un log filtra PII y nadie es dueño de la corrección.
- El contrato define, por señal: **owner, versión, propósito, atributos permitidos, atributos prohibidos, cardinalidad esperada, retención, consumidor y test de verificación**.
- **Allowlist > redacción**: emitir solo lo permitido es seguro por diseño; redactar después es una red de seguridad, no una estrategia.
- **Sampling** es una decisión con pérdida: siempre documentá *qué investigaciones se vuelven imposibles*.
- Un **test de contrato** convierte el documento en garantía: "el span existe y las claves prohibidas están ausentes".
- El ADR-005 deja registrada la decisión, sus trade-offs y su condición de revisión.

**Índice**

1. [Por qué un contrato y no "buenas intenciones"](#1-por-que-un-contrato-y-no-buenas-intenciones)
2. [Anatomía de un contrato de telemetría](#2-anatomia-de-un-contrato-de-telemetria)
3. [Privacidad: allowlist, redacción y datos que nunca deben salir](#3-privacidad-allowlist-redaccion-y-datos-que-nunca-deben-salir)
4. [Cardinalidad: el costo oculto de cada atributo](#4-cardinalidad-el-costo-oculto-de-cada-atributo)
5. [Sampling: qué ganás, qué perdés y qué debés declarar](#5-sampling-que-ganas-que-perdes-y-que-debes-declarar)
6. [Retención, costo y acceso](#6-retencion-costo-y-acceso)
7. [Verificar el contrato con un test](#7-verificar-el-contrato-con-un-test)
8. [Regulación: encuadre honesto, sin promesas](#8-regulacion-encuadre-honesto-sin-promesas)
9. [ADR-005 — Contrato de telemetría y correlación de ejecuciones](#9-adr-005--contrato-de-telemetria-y-correlacion-de-ejecuciones)
10. [Anti-patrones](#10-anti-patrones)
11. [Checklist](#11-checklist)
12. [Fuentes](#12-fuentes-consultadas-2026-07-09)

**Glosario mínimo**

| Término | Definición |
|---|---|
| **Contrato de telemetría** | Especificación versionada de qué señales emite un componente y bajo qué reglas. |
| **Allowlist** | Lista blanca de atributos permitidos; lo que no está, no se emite. |
| **Cardinalidad** | Número de valores distintos de un atributo/label. |
| **Head/Tail sampling** | Decidir el muestreo al inicio (head) o al final (tail) de la traza. |
| **Retención** | Tiempo que la telemetría se conserva antes de borrarse. |
| **PII** | Información de identificación personal. |

---

## 1. Por qué un contrato y no "buenas intenciones"

La telemetría sin contrato se degrada de forma predecible:

- **Deriva de atributos.** Cada PR agrega un atributo "porque es útil". A los seis meses hay tres nombres para el mismo dato (`user`, `userId`, `customer.id`) y ninguno documentado.
- **Fuga silenciosa.** Alguien loguea el request completo "para debuggear un caso" y el número de cuenta queda indexado durante toda la retención.
- **Factura sorpresa.** Un label con el `transfer_reference` individual multiplica las series de métricas por cada transferencia; el costo se dispara sin que nadie decidiera eso.
- **Nadie es dueño.** Cuando una traza filtra un email, no hay un owner que responda ni un test que lo hubiera prevenido.

Un contrato ataca la causa, no el síntoma: hace **explícita y verificable** una decisión que hoy es tácita. La diferencia con "documentación" es que el contrato **se prueba** (§7). Un documento que nadie verifica envejece; un test que corre en CI, no.

---

## 2. Anatomía de un contrato de telemetría

Proponemos un archivo versionado por señal. **Ejemplo ilustrativo** (formato legible; adaptable a YAML/JSON en el repo):

```text
signal: transfer.create
owner: team-payments-quality
version: 1.2.0
purpose: "Observar creación e idempotencia de transferencias del journey crítico."

required_attributes:
  - service.name
  - deployment.version        # commit/versión desplegada
  - nexo.transfer.channel     # web | mobile | api   (cardinalidad = 3)
  - nexo.transfer.idempotency_outcome  # created | deduplicated (cardinalidad = 2)

forbidden_attributes:
  - account.number
  - authorization.header
  - customer.email
  - nexo.transfer.idempotency_key   # clave cruda: potencialmente sensible

expected_cardinality:
  nexo.transfer.channel: 3
  nexo.transfer.idempotency_outcome: 2

retention: "traces 7d / metrics 30d (a confirmar con backend real)"
consumer: ["nexo-quality-control-tower", "on-call payments"]

verification: >
  integration test asserts span 'transfer.create' exists,
  required_attributes present, forbidden_attributes absent.
```

**Explicado por campos:**

- `owner` — sin dueño no hay contrato. Es quien aprueba cambios de schema y responde por fugas.
- `version` (SemVer) — agregar un atributo opcional es *minor*; quitar/renombrar uno requerido es *major* (rompe consumidores).
- `required` / `forbidden` — el corazón: qué **debe** estar y qué **nunca** debe estar. `forbidden` es lo que un test hace cumplir.
- `expected_cardinality` — la estimación con la que se detecta una explosión (§4).
- `retention` — declarada como **supuesto a confirmar**, porque depende del backend real; no se inventa (§6).
- `verification` — el puente al test (§7). Un contrato sin `verification` es un deseo.

Este contrato vive en el repo del componente (`nexo-transfer-api`) y se referencia desde el pilar de la colección.

---

## 3. Privacidad: allowlist, redacción y datos que nunca deben salir

**Regla central: allowlist por diseño, redacción como red de seguridad.**

| Estrategia | Cómo funciona | Fortaleza | Debilidad |
|---|---|---|---|
| **Redacción (denylist)** | Emitís todo y borrás lo sensible después. | Simple de empezar. | Frágil: un campo nuevo no contemplado se filtra. **Falla abierta.** |
| **Allowlist** | Emitís **solo** lo permitido. | Segura por diseño: lo no listado no sale. **Falla cerrada.** | Requiere disciplina y mantenimiento del contrato. |

La allowlist gana porque su **modo de falla es seguro**: cuando alguien agrega un campo sin pensar, no aparece en telemetría hasta que se lo agrega al contrato de forma consciente. La redacción falla al revés: el campo nuevo **sí** sale, hasta que alguien nota la fuga.

**Defensa en profundidad, en tres capas:**

1. **En el código** — la allowlist del contrato: el servicio solo setea atributos permitidos.
2. **En el Collector** — un `attributes` processor que **borra** atributos sensibles conocidos, por si un servicio se equivocó (ver el ejemplo del [pilar §9](/blog/observabilidad-quality-engineering-evidencia-explicable/)).
3. **En revisión de schema** — el PR que toca telemetría requiere aprobación del owner.

**Datos que nunca deben salir** en atributos, logs, `baggage` o `traceparent`: PII directa (nombre, email, documento), números de cuenta/tarjeta, tokens y `Authorization` headers, cuerpos completos de request/response, e IDs estables de cliente. OWASP mantiene guías sobre logging seguro y qué no registrar; conviene revisarlas para tu contexto ([OWASP, *Logging Cheat Sheet*](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html), consultado 2026-07-09).

> **Monto: agrupá, no redactes ni borres.** Un `amount_bucket` (`100_to_1000`) conserva utilidad analítica sin ser identificable. Borrar el monto pierde señal; loguearlo exacto puede reidentificar. La agrupación es el punto medio informado.

---

## 4. Cardinalidad: el costo oculto de cada atributo

Cardinalidad es la cantidad de **valores distintos** de un atributo. En métricas, cada combinación de labels crea un *time series* independiente; en trazas/logs, alta cardinalidad encarece indexación y retención.

**Regla práctica de diseño:**

| Cardinalidad | Ejemplos | ¿Label de métrica? | ¿Atributo de span/log? |
|---|---|---|---|
| **Baja** (unidades–decenas) | `channel`, `outcome`, `dependency`, `http.status_class` | Sí | Sí |
| **Media** (cientos) | `endpoint`, `error.type` | Con cuidado | Sí |
| **Alta** (miles+) | `user_id`, `email`, `transfer_reference`, UUID | **Nunca** | Solo en trazas, con sampling, si aporta diagnóstico |

La distinción crítica: un dato de **alta cardinalidad** puede ser aceptable como **atributo de un span** (porque una traza es un evento individual que investigás puntualmente) pero es **veneno como label de métrica** (porque multiplica series agregadas para siempre). La especificación de métricas de OTel y las guías de Prometheus lo dicen explícitamente ([OTel, *Metrics Data Model*](https://opentelemetry.io/docs/specs/otel/metrics/data-model/); [Prometheus, *Naming*](https://prometheus.io/docs/practices/naming/)).

> **Hecho vs. inferencia.** Es **hecho citado** que la cardinalidad de labels multiplica series y costo. Es **inferencia razonable** que `transfer_reference` como label es problemático (por ser ~1 valor por transferencia). El **umbral exacto** de "demasiado" depende del backend y del tráfico reales: se **mide** contra una línea de base, no se inventa.

**Cómo detectar una explosión:** monitoreá el conteo de series por métrica y comparalo con `expected_cardinality` del contrato. Una serie que crece sin techo es la firma de un label de alta cardinalidad que se coló.

---

## 5. Sampling: qué ganás, qué perdés y qué debés declarar

El sampling reduce volumen (y costo) descartando trazas. La decisión clave:

| Estrategia | Cuándo decide | Ventaja | Costo / riesgo |
|---|---|---|---|
| **Head sampling** | Al inicio de la traza. | Simple, barato, predecible. | Puede **descartar justo el fallo** que ibas a investigar. |
| **Tail sampling** | Al final, viendo la traza completa. | Conserva trazas con error/latencia alta. | Más caro y complejo; requiere buffer en el Collector. |

**La regla no negociable:** si usás sampling, **documentá qué investigaciones se vuelven imposibles**. Un ejemplo del contrato de Nexo Finanzas (ficticio):

```text
sampling_policy: head 10% (dev/test), tail keep-on-error (staging)
known_limitations:
  - "En dev/test, ~90% de trazas exitosas se descartan: no sirven para análisis
     estadístico de latencia; usar métricas (histograma) para eso."
  - "Una traza de un fallo intermitente puede NO existir si head sampling la descartó
     antes de que el error ocurriera. Ausencia de traza != ausencia de ejecución."
```

Esta última línea es la que conecta con el diagnóstico: en el [artículo 3](/blog/diagnosticar-test-flaky-con-trazas-metodo-evidencia/) veremos que "no está la traza" puede significar *sampling*, no *el test no llegó*. Un contrato honesto lo dice de antemano.

> **Anti-patrón #8 (del pilar):** samplear sin documentar. La consecuencia no es solo costo: es un diagnóstico que se declara "imposible" cuando en realidad fue una decisión de sampling que nadie escribió.

---

## 6. Retención, costo y acceso

Tres decisiones que suelen quedar implícitas y explotan en auditoría o en la factura:

- **Retención.** ¿Cuánto se conservan trazas, métricas y logs? Trazas suelen retenerse menos (días) por volumen; métricas más (semanas/meses) por ser agregadas. El número exacto **depende del backend y del presupuesto reales** y se declara como supuesto hasta confirmarlo. No inventes "30 días" como si fuera un hecho.
- **Costo.** El costo de telemetría escala con **volumen × cardinalidad × retención**. Reducir cualquiera de los tres baja la factura. El costo real **no se puede estimar sin el tráfico y el backend concretos**; se mide.
- **Acceso.** ¿Quién puede leer la telemetría? Aplicá **mínimo privilegio**: la telemetría de un journey de pagos puede contener metadatos que no todos deben ver. Registrá quién accede (auditoría). Un `trace_id` no es secreto, pero el conjunto de señales sí puede ser sensible.

| Palanca | Baja costo | Efecto colateral a vigilar |
|---|---|---|
| Menos retención | Sí | Perdés capacidad de investigar incidentes viejos. |
| Menos cardinalidad | Sí | Perdés granularidad de análisis. |
| Más sampling | Sí | Perdés trazas individuales (ver §5). |

No hay palanca gratis: cada una compra presupuesto a cambio de capacidad de investigación. El contrato hace **explícito** ese intercambio.

---

## 7. Verificar el contrato con un test

Un contrato que no se prueba es una intención. El test más valioso es simple: **el span existe, los atributos requeridos están presentes y los prohibidos ausentes.**

**Ejemplo ilustrativo (pseudocódigo, estilo JUnit + OTel test SDK).** Validá la API contra tu versión del SDK; el `InMemorySpanExporter`/`SpanExporter` de prueba y sus nombres varían entre versiones.

```java
// Test de contrato: transfer.create cumple la allowlist/denylist
@Test
void transferCreate_cumpleContratoDeTelemetria() {
    // 1. Ejecutar la operación instrumentada con un exporter en memoria
    service.create(validCommand());

    SpanData span = exporter.getFinishedSpanItems().stream()
        .filter(s -> s.getName().equals("transfer.create"))
        .findFirst()
        .orElseThrow(() -> new AssertionError("no se emitió el span transfer.create"));

    // 2. Atributos REQUERIDOS presentes
    assertThat(span.getAttributes().asMap().keySet())
        .containsKeys(
            AttributeKey.stringKey("service.name"),
            AttributeKey.stringKey("deployment.version"),
            AttributeKey.stringKey("nexo.transfer.channel"));

    // 3. Atributos PROHIBIDOS ausentes  (la aserción que previene fugas)
    assertThat(span.getAttributes().asMap().keySet())
        .doesNotContainKeys(
            AttributeKey.stringKey("account.number"),
            AttributeKey.stringKey("authorization.header"),
            AttributeKey.stringKey("customer.email"));
}
```

**Por qué este test es el que importa:**

- El punto 3 es el que **previene una fuga de PII** antes de que llegue a producción. Es barato y corre en cada PR.
- Falla **en CI**, no en una auditoría. El costo de corregir baja en órdenes de magnitud.
- Se puede generalizar: un test parametrizado que lea el archivo de contrato y valide todas las señales listadas. Así el contrato **es** el test.

> **Límite honesto.** Este test verifica **estructura**, no cumplimiento legal. Que el span no tenga `customer.email` no certifica que el sistema entero cumple GDPR o PCI DSS. Es una condición **necesaria**, no **suficiente** (§8).

---

## 8. Regulación: encuadre honesto, sin promesas

Cuando la telemetría toca datos financieros, aparecen marcos regulatorios. El encuadre profesional es **delimitar jurisdicción y versión, citar la fuente oficial y aclarar que no es asesoramiento**:

- **PCI DSS** (datos de tarjetas) es un estándar del PCI Security Standards Council; su versión vigente y requisitos deben verificarse en la fuente oficial ([PCI SSC, *Document Library*](https://www.pcisecuritystandards.org/document_library/)). Relevante aquí: los datos de cuenta/tarjeta **no deben** terminar en logs/trazas sin protección; nuestra allowlist es una medida técnica en esa dirección, no una certificación.
- **GDPR** (datos personales, UE) trata identificadores que permiten reidentificar a una persona; conviene revisar el texto oficial y guías del organismo competente ([EUR-Lex, *Reglamento (UE) 2016/679*](https://eur-lex.europa.eu/eli/reg/2016/679/oj)). Por eso agrupamos el monto y evitamos IDs estables de cliente.
- **BCRA** y otros reguladores locales pueden imponer requisitos de retención/protección según jurisdicción; verificá la normativa aplicable a tu caso. (Mención de alcance, no guía.)
- **OWASP** aporta guías técnicas de logging seguro que ayudan a decidir qué **no** registrar ([OWASP, *Logging Cheat Sheet*](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html)).

> **Disclaimer.** Nada de esto es asesoramiento legal ni de cumplimiento. La versión de cada estándar, su jurisdicción y su aplicabilidad a tu sistema deben confirmarse con las áreas legal/compliance y con la fuente oficial vigente. Un test de contrato reduce **riesgo técnico**; no emite un certificado de cumplimiento.

---

## 9. ADR-005 — Contrato de telemetría y correlación de ejecuciones

Dejamos la decisión registrada. El ADR completo se guarda como artefacto (`docs/adr/ADR-005-contrato-telemetria.md`); aquí va su resumen.

> **Estado:** Propuesto · **Fecha:** 2026-07-09 · **Decisores:** team-payments-quality (owner), plataforma, seguridad.
>
> **Contexto.** Los tests de journeys críticos de Nexo Finanzas fallan sin evidencia clasificable. Sin un contrato, la telemetría deriva y arriesga fugas y costo.
>
> **Decisión.** Adoptar un contrato de telemetría por señal, con allowlist de atributos, denylist verificada por test, política de sampling documentada y retención declarada como supuesto a confirmar. OpenTelemetry como estándar de instrumentación/transporte, vendor-neutral.
>
> **Alternativas consideradas.** (a) Denylist/redacción sin allowlist — descartada por falla abierta. (b) Instrumentación ad hoc sin contrato — descartada por deriva. (c) Acoplar a un APM específico — descartada por lock-in.
>
> **Consecuencias.** (+) Fugas detectadas en CI; costo previsible; portabilidad de backend. (−) Requiere mantenimiento del contrato y disciplina de revisión de schema.
>
> **Costos/riesgos.** Overhead de instrumentación; falsa sensación de cumplimiento si se confunde el test de contrato con certificación legal.
>
> **Condición de revisión.** Revisar al cambiar el backend, al agregar un journey crítico, o cada 6 meses.

**Qué aprendimos**

1. La telemetría **cuesta**: cardinalidad, retención y riesgo de privacidad son la factura.
2. **Allowlist** por diseño; redacción y Collector como defensa en profundidad.
3. **Sampling** siempre viene con una nota de "qué se vuelve imposible investigar".
4. Un **test de contrato** convierte el documento en garantía y mueve el costo del error de la auditoría al PR.
5. El test reduce riesgo técnico; **no certifica cumplimiento legal**.

**Enlaces internos**

- [Artículo 1 — Observabilidad para Quality Engineering (pilar)](/blog/observabilidad-quality-engineering-evidencia-explicable/)
- [Artículo 3 — Diagnosticar un test flaky con trazas](/blog/diagnosticar-test-flaky-con-trazas-metodo-evidencia/)

---

## 10. Anti-patrones

| # | Anti-patrón | Consecuencia | Detección | Alternativa |
|---|---|---|---|---|
| 1 | Denylist sin allowlist. | Campo nuevo se filtra (falla abierta). | Auditoría encuentra PII no contemplada. | Allowlist + Collector + revisión. |
| 2 | Contrato como documento no verificado. | Envejece; nadie lo cumple. | Diverge del código real. | Test de contrato en CI (§7). |
| 3 | Sampling sin documentar pérdidas. | Diagnóstico "imposible" no explicado. | "No está la traza" recurrente. | Política + `known_limitations`. |
| 4 | Retención/costo inventados. | Decisiones sobre datos falsos. | Números sin fuente ni medición. | Declarar supuestos; medir base. |
| 5 | Confundir test de contrato con cumplimiento legal. | Falsa sensación de seguridad. | "Ya cumplimos GDPR porque el test pasa". | Encuadre honesto + legal/compliance. |
| 6 | Alta cardinalidad como label de métrica. | Explosión de series y costo. | Series sin techo. | Baja cardinalidad; alta solo en spans. |

---

## 11. Checklist

- [ ] Cada señal crítica tiene contrato con `owner`, `version`, `required`, `forbidden`, `expected_cardinality`, `retention`, `consumer`, `verification`.
- [ ] La estrategia primaria es **allowlist**; hay defensa en profundidad en el Collector.
- [ ] Ningún atributo/label de alta cardinalidad se usa como label de **métrica**.
- [ ] La política de **sampling** está documentada con sus `known_limitations`.
- [ ] Retención y costo se declaran como **supuestos a confirmar**, no como hechos.
- [ ] Existe un **test de contrato** que verifica presencia de requeridos y ausencia de prohibidos, y corre en CI.
- [ ] Las menciones a PCI DSS/GDPR/OWASP citan fuente oficial, versión y jurisdicción, con disclaimer.
- [ ] Hay un **ADR** con contexto, alternativas, consecuencias y condición de revisión.

---

## 12. Fuentes consultadas (2026-07-09)

- OpenTelemetry — *Metrics Data Model* (cardinalidad, streams): https://opentelemetry.io/docs/specs/otel/metrics/data-model/
- OpenTelemetry — *Sampling* (conceptos, head/tail): https://opentelemetry.io/docs/concepts/sampling/
- OpenTelemetry — *Collector Configuration* (processors, `attributes`): https://opentelemetry.io/docs/collector/configuration/
- Prometheus — *Metric and Label Naming*: https://prometheus.io/docs/practices/naming/
- OWASP — *Logging Cheat Sheet*: https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html
- PCI Security Standards Council — *Document Library* (verificar versión vigente): https://www.pcisecuritystandards.org/document_library/
- EUR-Lex — *Reglamento (UE) 2016/679 (GDPR)*: https://eur-lex.europa.eu/eli/reg/2016/679/oj

> **Aviso.** Material técnico-educativo. **No** constituye asesoramiento legal ni de cumplimiento.

