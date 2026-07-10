---
title: "Reconciliación por operación y por totales"
description: "SQL de reconciliación por transferId y por totales, invariantes de ledger, falsos positivos, tolerancias justificadas, cuarentena y métricas de calidad de datos accionables."
pubDate: 2026-07-10
tags: ['reconciliacion', 'sql', 'data-quality', 'invariantes', 'ledger', 'sdet']
cluster: 'a05'
clusterTitle: "Data quality, lineage y reconciliación"
type: satelite
order: 2
readingLevel: "Avanzado"
prerequisites: "Requiere SQL con joins, agregaciones y window functions."
icon: 'set'
iconHue: 190
---

> **Aviso.** Nexo Finanzas es **ficticio** y **no es un sistema contable real**. **Ninguna consulta fue ejecutada**: son propuestas reproducibles contra un schema ficticio. Ningún número es una medición.

> **Promesa del artículo.** Al terminar vas a poder escribir una reconciliación que localiza la operación exacta que falla, entender por qué la reconciliación por totales sola es peligrosa, y diseñar invariantes que fallan por la razón correcta.

> Asume el ADR de source of truth del [pilar](/blog/cuando-la-api-y-el-reporte-cuentan-historias-distintas/) y el outbox del [capítulo 01](/blog/outbox-inbox-dlq-y-replay-seguro/).

## Los totales cuadran y el sistema está roto

Empecemos por el error conceptual que da sentido a todo el artículo.

Reconciliar por **totales** significa: `SUM(importes en la base operacional) == SUM(importes en el ledger)`. Es una consulta de dos líneas, corre rápido, y produce un número tranquilizador.

Ahora considerá este escenario, con dinero ficticio:

- La transferencia `tr_001` de $100 se registró en el ledger como $150.
- La transferencia `tr_002` de $150 se registró en el ledger como $100.

**Los totales cuadran perfectamente.** $250 = $250. Tu reconciliación por totales dice "OK" y dos clientes ficticios tienen el saldo equivocado.

Esto no es un caso rebuscado. Errores que se compensan aparecen naturalmente con: un `JOIN` que duplica filas de un lado y pierde de otro, un mapeo de moneda invertido, o un `GROUP BY` sobre la clave equivocada.

> **Regla:** la reconciliación por totales **detecta la existencia** de un problema. La reconciliación **por operación** lo **localiza**. Sin la segunda, la primera te da una alarma que no podés accionar. Y con errores compensados, ni siquiera te da la alarma.

Corré las dos. La de totales es barata y frecuente; la de operación es cara y suficiente con menor frecuencia. Pero la de operación es la que no podés omitir.

<figure class="diagram">
  <img src="/blog/diagrams/reconciliacion-por-operacion-y-por-totales-1.svg" width="1230" height="1113" alt="Diagrama: reconciliacion-por-operacion-y-por-totales (1)" loading="lazy" decoding="async" />
</figure>

La rama `Si -> ENG` es la que justifica todo el artículo: **los totales cuadrando no es evidencia de nada.**

## El schema ficticio

```sql
-- Base operacional: la fuente de verdad del ESTADO.
CREATE TABLE transfer (
    transfer_id   TEXT PRIMARY KEY,
    from_account  TEXT NOT NULL,
    to_account    TEXT NOT NULL,
    amount_minor  BIGINT NOT NULL CHECK (amount_minor > 0),
    currency      CHAR(3) NOT NULL,
    status        TEXT NOT NULL,                    -- PENDING | COMPLETED | FAILED
    created_at    TIMESTAMPTZ NOT NULL,
    completed_at  TIMESTAMPTZ                       -- NULL si no completo
);

-- Ledger: la fuente de verdad del MOVIMIENTO DE DINERO.
-- Doble entrada: cada transferencia completada genera exactamente 2 asientos.
CREATE TABLE ledger_entry (
    entry_id      BIGSERIAL PRIMARY KEY,
    transfer_id   TEXT NOT NULL,
    account_id    TEXT NOT NULL,
    -- Debito negativo, credito positivo. La suma por transferencia debe dar 0.
    amount_minor  BIGINT NOT NULL CHECK (amount_minor <> 0),
    currency      CHAR(3) NOT NULL,
    occurred_at   TIMESTAMPTZ NOT NULL,
    -- Deduplicacion: el mismo evento no genera dos veces el mismo asiento.
    event_id      UUID NOT NULL,
    UNIQUE (event_id, account_id)
);
```

La restricción `UNIQUE (event_id, account_id)` es el [consumidor idempotente](/blog/semanticas-de-entrega-y-consumidores-idempotentes/) manifestándose en el schema. Sin ella, una reentrega duplica los asientos y la reconciliación te avisa demasiado tarde.

## Invariantes: lo que debe ser verdad siempre

Antes de comparar sistemas, verificá que cada uno es internamente coherente. Estas consultas deben devolver **cero filas**. Cada una tiene nombre y significa algo.

```sql
-- INV-1: Todo asiento suma cero por transferencia (doble entrada).
-- Si falla: el consumidor escribio un debito sin credito, o con importes distintos.
SELECT transfer_id, SUM(amount_minor) AS descuadre
FROM ledger_entry
GROUP BY transfer_id
HAVING SUM(amount_minor) <> 0;

-- INV-2: Toda transferencia COMPLETED tiene exactamente 2 asientos.
-- Si falla con 0: el evento se perdio o el consumidor no lo proceso.
-- Si falla con 4: hubo duplicacion (y la restriccion UNIQUE fallo o se salteo).
SELECT t.transfer_id, COUNT(l.entry_id) AS asientos
FROM transfer t
LEFT JOIN ledger_entry l ON l.transfer_id = t.transfer_id
WHERE t.status = 'COMPLETED'
GROUP BY t.transfer_id
HAVING COUNT(l.entry_id) <> 2;

-- INV-3: Ningun asiento existe para una transferencia que NO esta COMPLETED.
-- Si falla: se publico un evento de un hecho que no ocurrio (ver caso (c) del outbox).
SELECT l.transfer_id, t.status
FROM ledger_entry l
JOIN transfer t ON t.transfer_id = l.transfer_id
WHERE t.status <> 'COMPLETED';

-- INV-4: Ningun asiento huerfano (transferencia inexistente).
SELECT l.transfer_id
FROM ledger_entry l
LEFT JOIN transfer t ON t.transfer_id = l.transfer_id
WHERE t.transfer_id IS NULL;

-- INV-5: La moneda del asiento coincide con la de la transferencia.
-- Bug silencioso clasico: el consumidor asume USD.
SELECT l.transfer_id, l.currency AS ledger_ccy, t.currency AS transfer_ccy
FROM ledger_entry l
JOIN transfer t ON t.transfer_id = l.transfer_id
WHERE l.currency <> t.currency;
```

**INV-3 e INV-4 son las que más gente omite**, y son las que detectan el fallo más grave del [capítulo 01](/blog/outbox-inbox-dlq-y-replay-seguro/): un evento publicado para un hecho que la base revirtió. Si INV-3 devuelve filas, moviste dinero por una transferencia que no existe.

**Cada invariante es un test.** No una consulta que alguien corre a mano: un test en CI, contra el dataset sintético, con un nombre que dice qué riesgo cubre:

```java
@Test
void todoAsientoSumaCeroPorTransferencia() { assertQueryReturnsNoRows(INV_1); }

@Test
void noExistenAsientosParaTransferenciasNoCompletadas() { assertQueryReturnsNoRows(INV_3); }
```

## Reconciliación por operación

Ahora sí, comparar sistemas. La consulta que localiza.

```sql
-- Reconciliacion por operacion. Devuelve UNA FILA POR DISCREPANCIA,
-- con el tipo de discrepancia, para poder accionar sin investigar.
WITH ledger_agg AS (
    SELECT
        transfer_id,
        -- El credito (positivo) es el importe que efectivamente se movio.
        SUM(amount_minor) FILTER (WHERE amount_minor > 0) AS credited_minor,
        COUNT(*)                                          AS entry_count,
        MIN(currency)                                     AS currency,
        MAX(occurred_at)                                  AS ledger_at
    FROM ledger_entry
    GROUP BY transfer_id
)
SELECT
    t.transfer_id,
    t.status,
    t.amount_minor        AS operational_minor,
    l.credited_minor      AS ledger_minor,
    t.amount_minor - COALESCE(l.credited_minor, 0) AS diferencia_minor,

    -- La columna que convierte una alerta en una accion.
    CASE
        WHEN l.transfer_id IS NULL
            THEN 'FALTA_EN_LEDGER'          -- evento perdido o no procesado
        WHEN t.transfer_id IS NULL
            THEN 'HUERFANO_EN_LEDGER'       -- hecho inventado
        WHEN l.entry_count <> 2
            THEN 'ASIENTOS_INCOMPLETOS'     -- duplicacion o escritura parcial
        WHEN l.currency <> t.currency
            THEN 'MONEDA_DISTINTA'
        WHEN t.amount_minor <> l.credited_minor
            THEN 'IMPORTE_DISTINTO'         -- el error que los totales ocultan
        ELSE 'OK'
    END AS tipo_discrepancia

FROM transfer t
FULL OUTER JOIN ledger_agg l ON l.transfer_id = t.transfer_id

WHERE
    -- 1) Solo transferencias que YA DEBERIAN estar reflejadas.
    (t.status = 'COMPLETED' OR t.transfer_id IS NULL)

    -- 2) VENTANA DE LATE-ARRIVING. Sin esto, toda transferencia recien
    --    completada aparece como discrepancia. Ver articulo 3.
    --    6h es ILUSTRATIVO: calibrar contra la latencia real de ingestion.
    AND (t.completed_at IS NULL OR t.completed_at < now() - INTERVAL '6 hours')

    -- 3) Solo lo que NO cuadra.
    AND (
        l.transfer_id IS NULL
        OR t.transfer_id IS NULL
        OR l.entry_count <> 2
        OR l.currency <> t.currency
        OR t.amount_minor <> l.credited_minor
    );
```

Cinco decisiones de diseño que hacen la diferencia entre una consulta útil y una que nadie mira:

1. **`FULL OUTER JOIN`, no `LEFT JOIN`.** Un `LEFT JOIN` desde `transfer` encuentra lo que falta en el ledger, pero **nunca** encuentra un asiento huérfano. El fallo más grave sería invisible.
2. **La columna `tipo_discrepancia`.** Una fila que dice `IMPORTE_DISTINTO` se acciona; una que dice "hay una diferencia" hay que investigarla. Esta columna es la diferencia entre una alerta y un ticket.
3. **La ventana de late-arriving del punto 2 del `WHERE`.** Sin ella, toda transferencia completada hace treinta segundos aparece como discrepancia, tu reporte tiene mil falsos positivos y nadie lo mira. **Esta línea es la que salva la credibilidad de la reconciliación.**
4. **El `6 hours` está comentado como ilustrativo.** No es una constante universal: se calibra contra la latencia real de ingestión.
5. **`SUM(...) FILTER (WHERE amount_minor > 0)`** compara el crédito con el importe. Si comparás `SUM(amount_minor)` a secas, siempre da cero (por INV-1) y no comparás nada.

## Reconciliación por totales: barata, frecuente, insuficiente

Sirve como **señal temprana**, corriendo cada pocos minutos, mientras la de operación corre cada hora.

```sql
-- Totales por dia y moneda. Barato. Corre seguido.
-- NO reemplaza la reconciliacion por operacion: no detecta errores compensados.
SELECT
    date_trunc('day', t.completed_at AT TIME ZONE 'UTC') AS dia_utc,
    t.currency,
    COUNT(*)                    AS transferencias,
    SUM(t.amount_minor)         AS total_operacional,
    SUM(l.credited_minor)       AS total_ledger,
    SUM(t.amount_minor) - SUM(l.credited_minor) AS diferencia
FROM transfer t
LEFT JOIN (
    SELECT transfer_id, SUM(amount_minor) FILTER (WHERE amount_minor > 0) AS credited_minor
    FROM ledger_entry GROUP BY transfer_id
) l ON l.transfer_id = t.transfer_id
WHERE t.status = 'COMPLETED'
  AND t.completed_at < now() - INTERVAL '6 hours'
GROUP BY 1, 2
HAVING SUM(t.amount_minor) <> SUM(l.credited_minor);
```

**`AT TIME ZONE 'UTC'` no es decorativo.** Si `date_trunc` usa la zona de la sesión, dos ejecuciones del mismo query desde máquinas distintas agrupan distinto. Es una de esas cosas que funcionan durante meses hasta que alguien corre el reporte desde otro huso.

## Falsos positivos: la lista que hay que descontar

Antes de alertar, la reconciliación debe **conocer y excluir** estas fuentes de diferencia legítima. Si no lo hace, se convierte en ruido y el equipo la apaga.

| Fuente | Por qué ocurre | Cómo se descuenta |
|---|---|---|
| **Late-arriving** | El evento aún no llegó | Ventana temporal en el `WHERE` |
| **Estados en tránsito** | `PENDING` no está en el ledger, correctamente | Filtrar por `status = 'COMPLETED'` |
| **Corte de medianoche** | La transferencia cruza el día | Agrupar por el mismo criterio en ambos lados, en UTC |
| **Compensaciones** | Un error se corrigió con un asiento inverso | El ledger suma cero; la comparación debe considerar la operación neta |
| **Reprocesamiento en curso** | Un backfill está corriendo | Marcar la ventana como "en reproceso" y no alertar |
| **Reloj adelantado** | `occurred_at > now()` | `invalid_if` en el contrato; va a cuarentena |

La quinta merece énfasis: **una reconciliación que corre durante un backfill genera alarmas garantizadas.** El runbook de backfill del [artículo 3](/blog/tiempo-late-data-backfill-y-replay-idempotente/) tiene un paso explícito para silenciar la reconciliación de la ventana afectada —y para volver a encenderla, que es el paso que se olvida.

## Métricas: definición, ventana, acción

Sin definición, una métrica de calidad de datos es un número decorativo.

| Métrica | Fórmula | Ventana | Granularidad | Acción |
|---|---|---|---|---|
| **% reconciliado** | `1 − (discrepancias ÷ transferencias COMPLETED)` | Diaria, tras la ventana de late-arriving | Por moneda | `< 100 %` ⇒ ticket con la lista de `transfer_id` |
| **Freshness** | `now() − max(occurred_at)` del dataset | Continua | Por dataset | `>` SLO ⇒ el pipeline está detenido o lento |
| **Duplicados por clave de negocio** | `count(*) − count(distinct transfer_id)` | Continua | Por proyección | `> 0` ⇒ incidente: el inbox falló |
| **Registros en cuarentena** | conteo | Diaria | Por motivo | Tendencia creciente ⇒ el productor cambió algo |
| **Tiempo de detección** | `detectado_at − occurred_at` | Por incidente | — | Si crece, la reconciliación corre poco seguido |
| **Tiempo de recuperación** | `resuelto_at − detectado_at` | Por incidente | — | Si crece, falta runbook |

Dos notas de honestidad:

- **`% reconciliado` no debe tener meta.** El valor esperado es 100 %. Poner una meta de "99,9 %" significa aceptar que una de cada mil transferencias esté mal, y en un ledger eso no se acepta: se investiga. La métrica no es un objetivo, es un **detector**.
- **`Freshness` es la métrica más subestimada.** Un pipeline detenido produce datos perfectamente consistentes, perfectamente válidos, y **viejos**. Todas las demás métricas están verdes. Es el modo de fallo más silencioso que existe en datos.

## Anti-patrones

- **Reconciliar solo por totales.** *Consecuencia:* dos errores que se compensan pasan desapercibidos. *Alternativa:* la de operación es la que no podés omitir.
- **`LEFT JOIN` en vez de `FULL OUTER JOIN`.** *Consecuencia:* nunca detectás asientos huérfanos, que es el fallo más grave. *Alternativa:* `FULL OUTER JOIN`.
- **Reconciliar sin ventana de late-arriving.** *Consecuencia:* miles de falsos positivos; el equipo apaga la alerta. *Alternativa:* ventana calibrada y comentada.
- **Una alerta que dice "hay diferencia" sin el tipo.** *Consecuencia:* cada alerta cuesta una investigación. *Alternativa:* columna `tipo_discrepancia`.
- **`date_trunc` sin zona horaria explícita.** *Consecuencia:* el resultado depende de quién corre el query. *Alternativa:* `AT TIME ZONE 'UTC'`.
- **Comparar `SUM(amount_minor)` del ledger contra el importe.** *Consecuencia:* siempre da cero por doble entrada; no comparás nada. *Alternativa:* filtrar el crédito.
- **Corregir datos a mano sin audit trail.** *Consecuencia:* nadie puede reconstruir qué pasó. *Alternativa:* asiento compensatorio, con motivo y autor.
- **Reconciliar durante un backfill.** *Consecuencia:* alarmas garantizadas. *Alternativa:* silenciar la ventana **y acordarse de encenderla**.
- **Poner una meta a `% reconciliado`.** *Consecuencia:* aceptás dinero mal contabilizado. *Alternativa:* es un detector, no un objetivo.
- **No medir freshness.** *Consecuencia:* el pipeline detenido pasa todas las demás validaciones. *Alternativa:* SLO de freshness por dataset.

## Qué publicar en GitHub

```text
sql/reconciliation/invariantes.sql          # INV-1 a INV-5
sql/reconciliation/por-operacion.sql        # con tipo_discrepancia
sql/reconciliation/por-totales.sql
tests/data-quality/InvariantesTest.java     # cada invariante, un test nombrado por su riesgo
docs/quality/falsos-positivos.md            # la tabla, con la razón de cada tolerancia
docs/quality/metricas-de-datos.md           # fórmula, ventana, acción
docs/runbooks/reconciliation-break.md       # qué hacer con cada tipo_discrepancia
```

`docs/runbooks/reconciliation-break.md` debe tener **una sección por cada valor de `tipo_discrepancia`**. Esa es la razón por la que la columna existe: convierte la reconciliación en un sistema operable, no en un informe.

## Qué aprendimos / próximos pasos

- Los totales detectan; la reconciliación por operación localiza. Y con errores compensados, los totales ni siquiera detectan.
- `FULL OUTER JOIN`, o los huérfanos son invisibles.
- La columna `tipo_discrepancia` es lo que convierte una alerta en una acción.
- La ventana de late-arriving es lo que salva la credibilidad del proceso.
- Freshness es el modo de fallo más silencioso: todo está consistente y todo está viejo.
- `% reconciliado` es un detector, no un objetivo con meta.

**Siguiente:** [Tiempo: late data, backfill y replay idempotente](/blog/tiempo-late-data-backfill-y-replay-idempotente/), donde la ventana de seis horas deja de ser un número mágico.

## Checklist final

- [ ] Existen las cinco invariantes y cada una es un test con nombre de riesgo.
- [ ] INV-3 (asientos sin transferencia completada) está implementada.
- [ ] La reconciliación por operación usa `FULL OUTER JOIN`.
- [ ] Cada discrepancia trae su `tipo_discrepancia`.
- [ ] La ventana de late-arriving existe, está comentada como ilustrativa y tiene un plan de calibración.
- [ ] Toda agrupación temporal usa UTC explícito.
- [ ] La lista de falsos positivos legítimos está escrita y descontada.
- [ ] La reconciliación se silencia durante un backfill, **y hay un paso para reactivarla**.
- [ ] `% reconciliado` no tiene meta: cualquier valor `< 100 %` genera un ticket.
- [ ] Hay un SLO de freshness por dataset.
- [ ] El runbook tiene una sección por cada `tipo_discrepancia`.
- [ ] Ninguna corrección de datos ocurre sin asiento compensatorio y audit trail.

---

## Fuentes (consultadas 2026-07-10)

- [PostgreSQL — Aggregate expressions y `FILTER`](https://www.postgresql.org/docs/current/sql-expressions.html#SYNTAX-AGGREGATES)
- [PostgreSQL — `date_trunc` y `AT TIME ZONE`](https://www.postgresql.org/docs/current/functions-datetime.html)
- [RFC 3339](https://www.rfc-editor.org/rfc/rfc3339) — timestamps con offset.
- [AsyncAPI Documentation](https://www.asyncapi.com/docs)
- [Verificación de fuentes de la serie](/blog/verificacion-de-fuentes-serie-avanzada/)
