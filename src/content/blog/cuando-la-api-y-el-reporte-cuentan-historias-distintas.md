---
title: "Cuando la API y el reporte cuentan historias distintas"
description: "Pilar de data quality: seis dimensiones, contratos de datos con ownership semántico, lineage de transferencia a reporte, y por qué una diferencia no siempre es un error."
pubDate: 2026-07-10
tags: ['data-quality', 'data-contracts', 'lineage', 'reconciliacion', 'sdet', 'fintech']
cluster: 'a05'
clusterTitle: "Data quality, lineage y reconciliación"
type: pilar
order: 1
readingLevel: "Avanzado"
prerequisites: "Requiere SQL, transacciones, batch vs streaming y eventos."
icon: 'set'
iconHue: 190
---

> **Aviso.** Nexo Finanzas es **ficticio**. **No es un sistema contable ni regulatorio real.** Ninguna consulta fue ejecutada; ningún número es una medición. Todos los datos son sintéticos.

> **Promesa del artículo.** Al terminar vas a poder explicar por qué dos sistemas pueden mostrar números distintos del mismo hecho **y ambos estar correctos**; vas a saber escribir un contrato de datos donde el campo tenga significado y dueño, no solo tipo; y vas a poder trazar el linaje de un importe desde la API hasta el reporte.

## La reunión

Producto: *"El dashboard dice que ayer se transfirieron 4.812 operaciones. La API dice 4.815. ¿Cuál está bien?"*

La respuesta correcta no es ninguna de las dos. La respuesta correcta es una pregunta: **"¿Bien según qué definición, medida en qué momento, con qué criterio de corte?"**

Porque hay al menos cinco explicaciones, y solo dos son bugs:

1. Tres transferencias se crearon a las 23:59:58 y se completaron a las 00:00:01. La API cuenta por `createdAt`; el reporte por `completedAt`. **No es un bug.** Es una diferencia de definición.
2. El reporte corre a las 02:00 y tres eventos llegaron a las 02:05 (*late-arriving*). **No es un bug.** Es una ventana.
3. La API cuenta en la zona horaria del servidor; el reporte, en UTC. **Es un bug**, y de los caros.
4. Tres eventos se duplicaron y el reporte deduplica pero la API no. **Es un bug**, en la API.
5. Tres transferencias se cancelaron; el reporte las excluye, la API las incluye. **No es un bug.** Es una diferencia de propósito.

**En tres de los cinco casos, ambos números son correctos.** Y el trabajo de un Quality Engineer acá no es "hacer que coincidan". Es hacer que **la diferencia sea explicable**.

> **Tesis del capítulo.** La calidad de datos no es solo validar tipos. Debe demostrar que un dato conserva **significado, integridad, trazabilidad y oportunidad** mientras atraviesa sistemas con distintos modelos y tiempos.

## Las seis dimensiones, y cómo se prueba cada una

"Calidad de datos" es un término paraguas. Debajo hay seis propiedades distintas, con pruebas distintas.

| Dimensión | Pregunta | Cómo se prueba en Nexo (ficticio) |
|---|---|---|
| **Validez** | ¿Cumple el formato y las reglas declaradas? | `currency` es ISO 4217; `amountMinor` es entero |
| **Completitud** | ¿Están todos los registros que deberían estar? | Toda transferencia `COMPLETED` tiene sus dos asientos en el ledger |
| **Unicidad** | ¿Hay duplicados por clave de negocio? | `count(*) = count(distinct transferId)` en la proyección |
| **Consistencia** | ¿Dos vistas del mismo hecho coinciden? | Suma de asientos por transferencia = importe de la transferencia |
| **Exactitud** | ¿El valor refleja el hecho real? | **La más difícil.** Requiere una fuente de verdad externa |
| **Oportunidad** | ¿Está disponible cuando se lo necesita? | *Freshness*: antigüedad del dato más reciente |

Dos observaciones que ordenan la práctica:

- **Validez es la más barata y la que más se prueba.** `NOT NULL`, tipos, rangos. Está bien tenerla; **no es calidad de datos**. Un `amountMinor` de `999999999` es perfectamente válido y probablemente incorrecto.
- **Exactitud casi nunca se puede probar directamente**, porque requiere una fuente de verdad independiente del sistema que estás probando. Lo que sí podés probar es **consistencia** entre sistemas que derivan del mismo hecho, y eso es la reconciliación. Es un proxy, y hay que decir que lo es.

**El error de foco más común:** dedicar el 90 % del esfuerzo a validez, que detecta el 10 % de los incidentes. Los incidentes reales de datos son de completitud (faltan registros), consistencia (dos sistemas discrepan) y oportunidad (el reporte usa datos viejos y nadie lo sabe).

## Contratos de datos: el tipo no es el significado

Un contrato de datos que declara `amountMinor: integer` no dice nada útil. La pregunta real es *"¿el importe de qué?"*.

Un contrato serio declara, por campo: **tipo, significado, dueño, y qué lo hace inválido.**

```yaml
# contracts/TransferCompleted.v1.yaml — ficticio.
event: TransferCompleted
version: 1.0.0
owner: equipo-transferencias          # quién decide qué significa cada campo
consumers:                            # quién rompe si esto cambia
  - proyeccion-ledger
  - almacen-analitica
  - motor-de-riesgo

fields:
  transferId:
    type: string
    meaning: >
      Identificador de la INTENCION de transferencia. Estable durante todo el
      ciclo de vida. NO cambia entre CREATED y COMPLETED.
    owner: equipo-transferencias
    invalid_if: "no existe una transferencia con este id en el sistema operacional"

  amountMinor:
    type: integer
    meaning: >
      Importe BRUTO solicitado por el usuario, en unidades minimas de la moneda.
      NO incluye comisiones. NO es el importe acreditado al destinatario.
    owner: equipo-transferencias
    invalid_if: "amountMinor <= 0"

  occurredAt:
    type: string (RFC 3339, UTC con offset)
    meaning: >
      Instante en que la transferencia alcanzo el estado COMPLETED en el
      sistema operacional. NO es el instante de publicacion del evento,
      ni el de ingestion en el almacen analitico.
    owner: equipo-transferencias
    invalid_if: "occurredAt > now() + 5s (reloj adelantado)"

  status:
    type: enum [COMPLETED]
    meaning: >
      Estado FINAL. Una transferencia COMPLETED nunca vuelve a otro estado.
      Una correccion posterior se modela como una operacion COMPENSATORIA
      nueva, nunca como una mutacion de esta.
    owner: equipo-transferencias
    invalid_if: "cualquier otro valor"
```

Cuatro campos, y cada `meaning` previene una clase entera de bugs:

- **`amountMinor` dice explícitamente que NO incluye comisiones.** Sin esa línea, el equipo de analítica construye un reporte de "volumen transferido" que no cuadra con el ledger, y nadie sabe por qué durante un mes.
- **`occurredAt` dice explícitamente qué instante NO es.** Es el bug de ventana temporal más común de todos.
- **`status` declara la inmutabilidad.** Esto le dice al consumidor que puede tratar el evento como un hecho consumado y no tiene que preocuparse por retracciones. Y le dice al productor que **no tiene permitido** mutar el registro: una corrección es una operación compensatoria.
- **`consumers` existe.** Es la lista de quién rompe si cambiás el contrato. Sin ella, el [consumer impact analysis](/blog/contratos-asyncapi-y-estrategia-de-pruebas-por-frontera/) es adivinanza.

> **La regla de oro de los contratos de datos:** el campo más peligroso no es el que falta. Es el que **cambió de significado sin cambiar de nombre**. Ninguna validación de schema lo detecta. Solo el `meaning` documentado y una revisión lo hacen.

## Lineage: de la transferencia al reporte

El **lineage** es el camino que recorre un dato. Sin él, ante una diferencia, no sabés dónde mirar.

<figure class="diagram">
  <img src="/blog/diagrams/cuando-la-api-y-el-reporte-cuentan-historias-distintas-1.svg" width="1097" height="194" alt="Diagrama: cuando-la-api-y-el-reporte-cuentan-historias-distintas (1)" loading="lazy" decoding="async" />
</figure>

Hay dos clases de lineage y las dos hacen falta:

- **Lineage técnico:** qué tabla se alimenta de qué tabla, con qué transformación. Responde *"¿de dónde salió esta columna?"*. Se puede derivar automáticamente del código de los pipelines.
- **Lineage de negocio:** qué **hecho** representa este dato y qué decisiones dependen de él. Responde *"¿si esto está mal, qué se rompe?"*. **No se deriva automáticamente.** Alguien lo escribe.

El segundo es el que importa en un incidente. Cuando el dashboard muestra 4.812, la pregunta no es "¿de qué tabla viene?" sino "¿quién toma decisiones con este número, y qué pasa si está mal por tres?".

### Tres fuentes, tres verdades legítimas

En el diagrama hay tres almacenes y **ninguno es "la verdad"** en general. Cada uno es la verdad de algo:

| Almacén | Es la fuente de verdad de... | **No** es la fuente de verdad de... |
|---|---|---|
| **Operational DB** | El estado **actual** de una transferencia | El histórico, si hay mutaciones |
| **Ledger projection** | El **movimiento de dinero** y su balance | El estado operacional (`PENDING`, `FAILED`) |
| **Analytics store** | Las **agregaciones** en su ventana | Cualquier cosa en tiempo real |

Este es el contenido de un ADR que casi nadie escribe y que resuelve discusiones interminables:

> **ADR-005: source of truth para estado operacional y contable**
>
> - El **estado operacional** de una transferencia (`PENDING`/`COMPLETED`/`FAILED`) tiene como fuente de verdad la **base operacional**. El ledger no lo conoce.
> - El **movimiento de dinero** tiene como fuente de verdad el **ledger**. La base operacional no puede afirmar que el dinero se movió: solo que la transferencia quedó marcada como completada.
> - El **almacén analítico no es fuente de verdad de nada.** Es una vista derivada, con retraso, optimizada para agregar. Cualquier decisión operativa tomada sobre él es un error de diseño.
> - **Consecuencia:** una transferencia `COMPLETED` sin sus asientos en el ledger es una **inconsistencia**, no una transferencia. La reconciliación existe para encontrarla.

La tercera línea es la que hay que defender en las reuniones. El almacén analítico es cómodo, tiene todo junto, y la tentación de usarlo para decidir es enorme. **Tratarlo como copia instantánea de producción es un anti-patrón** con nombre propio.

## El flujo de una validación de calidad

<figure class="diagram">
  <img src="/blog/diagrams/cuando-la-api-y-el-reporte-cuentan-historias-distintas-2.svg" width="423" height="739" alt="Diagrama: cuando-la-api-y-el-reporte-cuentan-historias-distintas (2)" loading="lazy" decoding="async" />
</figure>

La caja **`Quarantine`** es la que distingue un pipeline maduro de uno frágil.

Ante un registro que viola una regla, hay tres reacciones posibles y solo una es buena:

1. **Fallar el pipeline entero.** Un registro corrupto entre un millón detiene todo. Frágil, y genera presión para relajar las reglas.
2. **Descartar el registro y seguir.** Silencioso. Perdiste un dato y nadie lo sabe. **La peor opción.**
3. **Cuarentena.** El registro sale del flujo principal, va a una tabla de cuarentena **con el motivo**, el pipeline continúa, y se emite una métrica de registros en cuarentena. Alguien lo revisa.

La cuarentena preserva el dato, no frena el negocio, y hace visible el problema. Y, crucialmente, permite **reprocesar** el registro después de corregir la causa —que es el mismo problema que el [replay de la DLQ](/blog/outbox-inbox-dlq-y-replay-seguro/) y se resuelve igual: con idempotencia.

## No toda diferencia es un error

Esta sección existe porque es donde los equipos pierden más credibilidad.

Si tu proceso de reconciliación reporta 300 discrepancias por día y 297 son legítimas, nadie va a mirar las tres que importan. Un sistema de alertas con 99 % de falsos positivos es equivalente a no tener alertas, con costo operativo.

Fuentes de diferencia **legítima** que tu reconciliación debe conocer y descontar:

- **Ventana temporal.** El reporte se calculó a las 02:00; el evento llegó a las 02:05. La comparación debe usar el mismo criterio de corte, y estar consciente de la ventana de late-arriving.
- **Redondeo.** Si el almacén analítico convierte a otra moneda para reportar, hay redondeo. **Definí una tolerancia y justificala**, no la elijas.
- **Estados en tránsito.** Una transferencia `PENDING` está en la base operacional y no en el ledger, correctamente.
- **Diferencia de propósito.** El reporte excluye cancelaciones; la API no.
- **Zona horaria.** Si no todo está en UTC, hay diferencia por definición. *(Esta no es legítima: es un bug. Está acá porque se disfraza de las otras cuatro.)*

**La regla que hace esto tratable:** cada tolerancia se declara en el contrato de reconciliación, con la razón. Una tolerancia sin razón es un umbral para que la alerta no suene, y eso es esconder el problema.

```yaml
# Ejemplo ILUSTRATIVO. Ninguna cifra es una medicion.
reconciliation:
  transferId_vs_ledger:
    tolerance: 0                # exacto: cada transferencia COMPLETED tiene asientos
    reason: "invariante dura; una diferencia es siempre un incidente"

  totals_daily:
    tolerance_minor: 0          # en la moneda original, exacto
    reason: "sumamos enteros; no hay redondeo posible"
    late_arrival_window: 6h     # se reconcilia recien tras la ventana
    reason_window: >
      El p99 historico de latencia de ingestion es <valor a medir>.
      6h es un margen a calibrar, NO una constante.
```

## Anti-patrones

- **Validar solo `not null` y llamarlo calidad de datos.** *Consecuencia:* el 90 % del esfuerzo cubre el 10 % de los incidentes. *Alternativa:* las seis dimensiones, con foco en completitud, consistencia y oportunidad.
- **Un contrato con tipos y sin `meaning`.** *Consecuencia:* el campo cambia de significado sin cambiar de nombre y nada lo detecta. *Alternativa:* `meaning`, `owner`, `invalid_if` y `consumers`.
- **Tratar el almacén analítico como copia instantánea de producción.** *Consecuencia:* decisiones operativas sobre datos con retraso. *Alternativa:* ADR de source of truth.
- **Una sola "fuente de verdad" para todo.** *Consecuencia:* discusiones sin fin. *Alternativa:* cada almacén es fuente de verdad **de algo** específico.
- **Descartar registros inválidos en silencio.** *Consecuencia:* pérdida de datos invisible. *Alternativa:* cuarentena con motivo y métrica.
- **Fallar el pipeline entero por un registro.** *Consecuencia:* presión para relajar las reglas. *Alternativa:* cuarentena.
- **Reportar toda diferencia como error.** *Consecuencia:* 99 % de falsos positivos; nadie mira. *Alternativa:* declarar tolerancias con razón.
- **Una tolerancia sin justificación.** *Consecuencia:* es un umbral para silenciar la alerta. *Alternativa:* la razón, escrita.
- **Métricas sin definición semántica.** *Consecuencia:* "transferencias de ayer" significa tres cosas distintas. *Alternativa:* numerador, denominador, ventana y zona horaria, escritos.

## Qué publicar en GitHub

```text
contracts/TransferCompleted.v1.yaml     # con meaning, owner, invalid_if, consumers
docs/lineage/transferencia-a-reporte.md # técnico Y de negocio
docs/adr/ADR-005-source-of-truth.md     # qué almacén es verdad de qué
docs/quality/dimensiones-y-pruebas.md   # las seis, con la prueba de cada una
sql/reconciliation/                     # ver artículo 2
tests/data-quality/
evidence/
```

## Qué aprendimos / próximos pasos

- Dos sistemas pueden mostrar números distintos y ambos estar bien. El trabajo es que la diferencia sea **explicable**.
- Validez es barata y no es calidad de datos. Los incidentes son de completitud, consistencia y oportunidad.
- El campo peligroso no es el que falta: es el que cambió de significado sin cambiar de nombre.
- Cada almacén es fuente de verdad **de algo**. El analítico, de nada operativo.
- La cuarentena preserva el dato, no frena el negocio, y hace visible el problema.
- Una tolerancia sin razón escrita es una alerta silenciada.

**Siguiente:** [Reconciliación por operación y por totales](/blog/reconciliacion-por-operacion-y-por-totales/).

## Checklist final

- [ ] Cada campo del contrato declara `meaning`, `owner` e `invalid_if`.
- [ ] `occurredAt` documenta explícitamente qué instante **no** es.
- [ ] El contrato lista sus `consumers`.
- [ ] Existe un ADR que dice qué almacén es fuente de verdad de qué.
- [ ] El almacén analítico no alimenta ninguna decisión operativa.
- [ ] Ningún registro inválido se descarta en silencio: va a cuarentena con motivo.
- [ ] Hay una métrica de registros en cuarentena, con dueño.
- [ ] Cada tolerancia de reconciliación tiene una razón escrita.
- [ ] Todos los timestamps están en UTC con offset explícito.
- [ ] Existe lineage de negocio, no solo técnico.

---

## Fuentes (consultadas 2026-07-10)

- [AsyncAPI Documentation](https://www.asyncapi.com/docs) — para los contratos de evento sobre los que se apoyan los contratos de datos.
- [RFC 3339 — Date and Time on the Internet](https://www.rfc-editor.org/rfc/rfc3339) — formato de `occurredAt`.
- [ISO 4217](https://www.iso.org/iso-4217-currency-codes.html) — códigos de moneda.
- [OpenTelemetry Documentation](https://opentelemetry.io/docs/) — correlación entre el hecho operacional y su procesamiento.
- Documentación oficial de la plataforma de datos que elijas. Este artículo es deliberadamente agnóstico.
- [Verificación de fuentes de la serie](/blog/verificacion-de-fuentes-serie-avanzada/)
