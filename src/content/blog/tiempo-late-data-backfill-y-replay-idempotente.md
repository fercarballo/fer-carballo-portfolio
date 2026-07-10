---
title: "Tiempo: late data, backfill y replay idempotente"
description: "Event time vs processing time, watermarks y ventanas, backfill idempotente con plan de validación antes y después, runbook, y postmortem ficticio de un incidente de datos."
pubDate: 2026-07-10
tags: ['late-data', 'watermark', 'backfill', 'replay', 'postmortem', 'data-quality', 'runbook']
cluster: 'a05'
clusterTitle: "Data quality, lineage y reconciliación"
type: satelite
order: 3
readingLevel: "Avanzado"
prerequisites: "Requiere batch/streaming, zonas horarias e idempotencia."
icon: 'set'
iconHue: 190
---

> **Aviso.** Nexo Finanzas es **ficticio** y **no es un sistema contable real**. **Ninguna consulta ni comando fue ejecutado.** El incidente y el postmortem del final son **ficticios**, construidos como ejercicio didáctico; las personas son ficticias. Ningún número es una medición.

> **Promesa del artículo.** Al terminar vas a distinguir los tres tiempos de un dato y saber cuál usa cada consulta; vas a entender que un watermark es una apuesta explícita sobre cuánto esperás; y vas a tener un runbook de backfill que no duplica dinero ficticio.

> Cierra el capítulo. Asume las invariantes y la ventana de late-arriving del [artículo 2](/blog/reconciliacion-por-operacion-y-por-totales/).

## Un dato tiene tres tiempos

Y confundirlos es la causa raíz de la mayoría de los incidentes de datos.

| Tiempo | Qué es | En Nexo | Quién lo asigna |
|---|---|---|---|
| **Event time** | Cuándo ocurrió el hecho | `completed_at` de la transferencia | El sistema operacional, en su transacción |
| **Ingestion time** | Cuándo el dato llegó al pipeline | Cuando el consumidor lo recibió | El consumidor |
| **Processing time** | Cuándo se procesó | Cuando corrió la agregación | El motor de procesamiento |

El **event time** es el único que tiene significado de negocio. Los otros dos son accidentes de la infraestructura: si el consumidor estuvo caído dos horas, el ingestion time se corre dos horas y **el hecho ocurrió cuando ocurrió**.

De ahí sale la regla que resuelve la mitad de los bugs de reportes:

> **Agregá siempre por event time. Nunca por processing time.**

Un reporte de "transferencias de ayer" agrupado por processing time cambia de valor si el pipeline se atrasó. El mismo día, reprocesado, da otro número. Es indefendible, y sin embargo es el comportamiento por defecto de mucho código escrito sin pensarlo.

**Consecuencia incómoda:** si agregás por event time, el resultado de "ayer" **puede cambiar** cuando llegue un dato tardío. Y eso es correcto. Los reportes sobre event time son **eventualmente correctos**, no inmediatamente finales. Decirle esto a producto es parte del trabajo.

<figure class="diagram">
  <img src="/blog/diagrams/tiempo-late-data-backfill-y-replay-idempotente-1.svg" width="852" height="797" alt="Diagrama: tiempo-late-data-backfill-y-replay-idempotente (1)" loading="lazy" decoding="async" />
</figure>

El evento C ocurrió **antes** que A y B, y llegó **después** de que la ventana se cerró. Su `event_time` no cambió: cambió cuándo lo vimos. Toda la dificultad de este artículo cabe en esa frase.

### La zona horaria no es un detalle

`completed_at` debe almacenarse en **UTC con offset explícito** (RFC 3339). Siempre.

Y "el día" es una decisión de negocio, no técnica. Si Nexo Finanzas reporta por día calendario en una zona horaria específica, la conversión ocurre **en la consulta de presentación**, sobre datos almacenados en UTC. Nunca al revés.

Los dos bugs clásicos, que valen por sí solos el precio del artículo:

- **Almacenar en hora local.** Cuando cambia el horario de verano, hay una hora que ocurre dos veces y una que no ocurre. Tus agregaciones por hora tienen un duplicado y un hueco, una vez por año, y nadie lo entiende.
- **`date_trunc('day', ts)` sin `AT TIME ZONE`.** El resultado depende de la zona horaria de la sesión. El mismo query, dos máquinas, dos resultados.

## Watermarks: una apuesta explícita

Un **watermark** es una afirmación del pipeline: *"creo que ya vi todos los eventos con event time anterior a T"*.

No es una certeza. Es una **apuesta**, y por eso hay que hacerla explícita.

```text
Ahora: 10:00
Watermark: 09:50 (retraso permitido: 10 minutos)

Significa: "cierro la ventana de las 09:40-09:50 y emito el resultado.
            Si llega un evento con event time 09:45 despues de esto,
            es LATE DATA y tengo que decidir qué hacer con él."
```

Elegir el retraso permitido es un **trade-off** puro, y hay que escribirlo:

| Retraso corto (1 min) | Retraso largo (6 h) |
|---|---|
| Resultados rápidos | Resultados tardíos |
| **Mucha** late data | Poca late data |
| Baja latencia de detección | Alta latencia de detección |

No hay número correcto. Hay un número **calibrado**: medí la distribución histórica de `ingestion_time − event_time` y elegí un percentil alto. Si el p99 es 4 minutos, un watermark de 10 minutos deja fuera al 1 % de los eventos... y ese 1 % es la late data que tenés que manejar.

**El número "6 horas" que aparecía en la reconciliación del artículo anterior es exactamente esto**, y ahora deja de ser mágico: es un percentil de una distribución que hay que medir. Mientras no la midas, el número es una hipótesis, y así hay que rotularlo.

### Qué hacer con la late data

Cuatro políticas. La decisión es de **negocio**, no de infraestructura.

| Política | Qué hace | Cuándo es correcta |
|---|---|---|
| **Descartar** | Ignora el evento tardío | **Casi nunca.** Jamás con dinero |
| **Actualizar** | Recalcula la ventana ya emitida | Cuando los consumidores toleran que un número cambie |
| **Cuarentena** | Al lado, con motivo, para triage | Cuando hay que entender por qué llegó tarde |
| **Ventana lateral** | Se cuenta en una ventana especial de "tardíos" | Cuando el histórico debe ser inmutable |

**Descartar nunca es correcto para un evento financiero.** Si tu pipeline descarta un `TransferCompleted` que llegó tarde, el ledger nunca lo va a ver y la reconciliación va a reportar `FALTA_EN_LEDGER` para siempre. Peor: si la reconciliación tiene su propia ventana y ya pasó, ni siquiera lo reporta.

**Y una regla que se olvida:** cuando emitís un resultado actualizado, los consumidores tienen que saber que es una actualización. Un número que cambia sin aviso destruye la confianza. Versioná el resultado, o emití una corrección explícita.

## Backfill: reprocesar sin duplicar

Un **backfill** es reprocesar datos históricos. Los motivos legítimos son tres: se corrigió un bug de transformación, llegó un lote de datos que faltaba, o cambió una definición de negocio.

Los tres tienen la misma trampa: **si el pipeline no es idempotente, reprocesar duplica.**

### La propiedad que hace posible el backfill

Un pipeline es idempotente si procesar el mismo conjunto de eventos N veces produce el mismo estado que procesarlo una vez. Tres técnicas, de mejor a peor:

1. **Clave natural + `UPSERT`.** El destino tiene una clave de negocio única (`event_id`, `transfer_id`). Reprocesar hace `INSERT ... ON CONFLICT DO UPDATE`. **Es la que usa el ledger** con su `UNIQUE (event_id, account_id)`.
2. **Partición inmutable + reemplazo atómico.** El destino se organiza por partición temporal. Un backfill reconstruye la partición completa y la **reemplaza atómicamente**. Nunca hay un estado intermedio visible.
3. **Delete + insert.** Borra el rango y reinserta. **Frágil:** si falla entre las dos operaciones, perdiste datos y no los podés recuperar del destino.

La opción 3 es la que la gente escribe primero y la que causa el incidente de más abajo.

> **Regla:** si tu pipeline no puede reprocesar la misma ventana dos veces sin cambiar el resultado, **no tenés backfill: tenés una operación de riesgo.** Y no deberías ejecutarla bajo la presión de un incidente.

### Runbook: backfill de una ventana temporal

> Guardar como `docs/runbooks/backfill.md`. **Nunca fue ejecutado en un entorno productivo real; es un procedimiento propuesto para el sandbox.**

**Cuándo se usa.** Se corrigió la causa raíz de un dato incorrecto en un rango histórico, o llegó un lote que faltaba.

**Precondiciones (todas obligatorias):**

- [ ] La causa raíz está identificada **y el fix está desplegado.** Backfillear contra el mismo bug produce los mismos datos malos.
- [ ] El pipeline destino es **idempotente por clave de negocio**, y hay un test que lo demuestra.
- [ ] El rango es **exacto**: `[event_time_desde, event_time_hasta)`, en UTC. "Reprocesar todo" no es un rango.
- [ ] Hay una **estimación de volumen** y del impacto sobre el sistema en producción.
- [ ] Existe un **ticket con aprobación** de la persona dueña del dataset.

**Validación ANTES (obligatoria y sin excepciones):**

```sql
-- Congelar el estado actual del rango. Este es tu punto de comparacion.
-- Sin esto, despues del backfill no podes saber que cambio.
CREATE TABLE backfill_snapshot_NEXO_1234 AS
SELECT transfer_id, amount_minor, currency, occurred_at
FROM ledger_entry
WHERE occurred_at >= '2026-07-01T00:00:00Z'
  AND occurred_at <  '2026-07-02T00:00:00Z';

-- Contar. Anotar el numero en el ticket.
SELECT count(*), sum(amount_minor) FROM backfill_snapshot_NEXO_1234;
```

**Procedimiento:**

1. **Silenciar la reconciliación** para la ventana afectada. Va a reportar discrepancias durante el reproceso, garantizado.
   > **Anotá en el ticket que la silenciaste.** El paso 7 depende de esto y es el que más se olvida.
2. **Ejecutar en modo `dry-run`** sobre el rango. El pipeline calcula lo que escribiría y lo emite a una tabla de staging, **sin tocar el destino**.
3. **Comparar `dry-run` contra el snapshot.** Producir un diff explícito: filas nuevas, filas que cambian, filas que desaparecen.
   > **Punto de decisión.** Si hay filas que *desaparecen*, **abortar**. Un backfill que borra datos que existían no está corrigiendo: está perdiendo. Revisá el fix.
4. **Ejecutar sobre un sub-rango pequeño** (una hora, no un día). Verificar las invariantes INV-1 a INV-5 sobre ese sub-rango.
5. **Ejecutar el rango completo, por lotes**, observando la carga del destino. Un backfill que satura la base genera el incidente que querías evitar.
6. **Validación DESPUÉS.** Correr las cinco invariantes sobre el rango completo. Comparar contra el snapshot y explicar **cada** diferencia.
7. **Reactivar la reconciliación** y verificar que reporta cero discrepancias en la ventana.
8. **Cerrar el ticket** con: rango, volumen, duración, diferencias encontradas y explicadas.

**Condiciones de aborto:**
- El paso 3 muestra filas que desaparecen.
- El paso 4 viola una invariante.
- La latencia del destino se degrada durante el paso 5.

**Si algo salió mal.** Un backfill idempotente por `UPSERT` **no tiene rollback**: los datos ya se sobreescribieron. La recuperación es restaurar desde `backfill_snapshot_*` **y solo funciona si hiciste el paso de validación previa**. Por eso el snapshot no es opcional.

## Postmortem sin culpables: el reporte que perdió 1.847 transferencias

> **Incidente completamente ficticio**, construido como ejercicio didáctico. Las personas son ficticias. Los números son ilustrativos.

### Qué pasó

Se desplegó una corrección al pipeline de la proyección de ledger: el mapeo de moneda tenía un bug para operaciones en `EUR`. Para aplicarla al histórico, se ejecutó un backfill sobre el rango del 1 al 7 de julio.

El backfill usó **delete + insert**. El `DELETE` borró 12.043 asientos. El `INSERT` falló a mitad de camino por un timeout del pool de conexiones, tras insertar 10.196.

Resultado: **1.847 transferencias quedaron sin asientos en el ledger.** La reconciliación estaba silenciada para la ventana, así que no alertó. Se detectó 31 horas después, cuando alguien notó que el total de un dashboard había caído.

### Línea de tiempo

| Hora (UTC, ficticia) | Evento |
|---|---|
| 09:00 | Se despliega el fix de mapeo de moneda |
| 09:15 | Se silencia la reconciliación para el rango |
| 09:20 | Comienza el backfill (`DELETE` + `INSERT`) |
| 09:26 | `DELETE` completa: 12.043 filas |
| 09:41 | `INSERT` falla por timeout tras 10.196 filas |
| 09:42 | El operador ve el error, **reintenta el comando completo** |
| 09:43 | El `DELETE` del reintento borra 10.196 filas. El `INSERT` vuelve a fallar |
| 10:00 | El operador escala, y el equipo decide investigar antes de reintentar |
| — | *La reconciliación sigue silenciada. Nadie la reactivó.* |
| +31 h | Se detecta por una caída en un dashboard |

### Los cinco por qués

1. **¿Por qué faltaron 1.847 asientos?** Porque el `INSERT` del backfill falló a mitad y el `DELETE` ya había ocurrido.
2. **¿Por qué el `DELETE` ocurrió antes del `INSERT` sin transacción?** Porque el script de backfill hacía las dos operaciones en conexiones separadas, sin transacción envolvente.
3. **¿Por qué se escribió así?** Porque el pipeline **no era idempotente**: sin restricción única sobre `(event_id, account_id)`, un `INSERT` sin `DELETE` previo habría duplicado. `delete + insert` era la única forma de reprocesar.
4. **¿Por qué no había restricción única?** Porque el consumidor idempotente se implementó en la aplicación (chequeo `exists()` antes de insertar) y no en el schema. Funcionaba en el camino normal; el backfill no pasa por ese camino.
5. **¿Por qué no se detectó en 31 horas?** Porque la reconciliación estaba silenciada y **el runbook no tenía un paso de reactivación**. El silenciamiento no tenía TTL.

### Lo que fallaron fueron los sistemas, no las personas

El operador siguió el runbook. El runbook estaba incompleto. El operador reintentó el comando, que es la reacción entrenada y razonable ante un timeout, y el comando no era idempotente.

**Ningún nombre aparece en este postmortem**, y esa es la práctica correcta. La pregunta útil no es "quién ejecutó el comando" sino "por qué el sistema permitió que un comando no idempotente se reintentara sin consecuencias visibles".

### Acciones correctivas

| # | Acción | Tipo | Owner |
|---|---|---|---|
| 1 | Agregar `UNIQUE (event_id, account_id)` al ledger | **Prevenir** | @ficticio-alice |
| 2 | Reescribir el backfill como `UPSERT` idempotente | **Prevenir** | @ficticio-alice |
| 3 | Agregar validación previa obligatoria (snapshot) al runbook | Prevenir | @ficticio-bob |
| 4 | Agregar paso de `dry-run` con diff, y aborto si desaparecen filas | Prevenir | @ficticio-bob |
| 5 | **TTL en el silenciamiento de la reconciliación**: se reactiva sola a las 4 h | **Detectar** | @ficticio-carol |
| 6 | Alerta de freshness sobre el ledger, independiente de la reconciliación | Detectar | @ficticio-carol |

**La acción 5 es la más valiosa y la menos obvia.** El incidente no lo causó el `DELETE`: lo causó que nadie lo notó durante 31 horas. Un silenciamiento con TTL habría reducido la detección a cuatro horas, sin cambiar nada del pipeline.

Y notá la distribución: cuatro acciones de **prevención** y dos de **detección**. Un postmortem que solo produce acciones de detección está admitiendo que el fallo va a volver a ocurrir.

## Anti-patrones

- **Agregar por processing time.** *Consecuencia:* el mismo día da números distintos según cuándo corriste. *Alternativa:* event time, siempre.
- **Almacenar timestamps en hora local.** *Consecuencia:* una hora duplicada y una faltante, una vez por año. *Alternativa:* UTC con offset; convertir en presentación.
- **`date_trunc` sin `AT TIME ZONE`.** *Alternativa:* zona explícita.
- **Descartar late data.** *Consecuencia:* con dinero, una operación que nunca llega al ledger. *Alternativa:* actualizar, cuarentena o ventana lateral. Nunca descartar.
- **Emitir un resultado actualizado sin avisar.** *Consecuencia:* un número que cambia solo destruye la confianza. *Alternativa:* versionar el resultado o emitir corrección explícita.
- **Watermark elegido sin medir la distribución.** *Consecuencia:* o mucha late data, o mucha latencia. *Alternativa:* percentil de `ingestion − event`, y rotularlo como hipótesis hasta medirlo.
- **Backfill con `delete + insert`.** *Consecuencia:* el incidente de arriba. *Alternativa:* `UPSERT` sobre clave natural, o reemplazo atómico de partición.
- **Idempotencia implementada en la aplicación y no en el schema.** *Consecuencia:* funciona en el camino normal y falla en el backfill, que no pasa por ahí. *Alternativa:* restricción única en la base.
- **Backfill sin snapshot previo.** *Consecuencia:* no hay rollback posible. *Alternativa:* snapshot obligatorio.
- **Backfill sin `dry-run` con diff.** *Alternativa:* comparar antes de escribir; abortar si desaparecen filas.
- **Silenciar la reconciliación sin TTL.** *Consecuencia:* 31 horas de ceguera. *Alternativa:* TTL automático.
- **Postmortem con nombres de personas.** *Consecuencia:* la próxima vez nadie reporta el error. *Alternativa:* preguntar por qué el sistema lo permitió.

## Qué publicar en GitHub

```text
docs/runbooks/backfill.md                   # con validación previa, dry-run y aborto
docs/runbooks/reconciliation-break.md
docs/quality/watermark-calibracion.md       # la distribución medida, o la hipótesis rotulada
docs/postmortems/2026-07-XX-backfill.md     # marcado como EJERCICIO FICTICIO
pipelines/                                  # con UPSERT, no delete+insert
tests/data-quality/BackfillIdempotenteTest.java
```

`BackfillIdempotenteTest` hace una sola cosa: ejecuta el backfill **dos veces** sobre el mismo rango y afirma que el estado final es idéntico. Es el test que habría prevenido el incidente entero.

## Qué aprendimos / próximos pasos

- Un dato tiene tres tiempos y solo uno tiene significado de negocio.
- Los reportes sobre event time son eventualmente correctos, no inmediatamente finales. Decilo antes de que te lo pregunten.
- Un watermark es una apuesta explícita. El número sale de una distribución medida, no de un blog.
- Descartar late data nunca es correcto con dinero.
- Si no podés reprocesar una ventana dos veces con el mismo resultado, no tenés backfill.
- La idempotencia vive en el schema, no en la aplicación: el backfill no pasa por tu código de aplicación.
- Un silenciamiento sin TTL es una ceguera programada.

**Cierre del capítulo.** El siguiente es [FinOps](/blog/coleccion/a06/): cuánto cuesta todo esto, y cómo se decide qué vale la pena.

## Checklist final

- [ ] Toda agregación usa event time.
- [ ] Todos los timestamps se almacenan en UTC con offset explícito.
- [ ] Ninguna consulta usa `date_trunc` sin zona explícita.
- [ ] El watermark está calibrado contra una distribución medida, o rotulado como hipótesis.
- [ ] La política de late data está escrita, y no es "descartar".
- [ ] Los resultados actualizados se comunican como actualizaciones.
- [ ] El pipeline es idempotente **por restricción de schema**, no por `exists()` en la aplicación.
- [ ] Existe un test que ejecuta el backfill dos veces y compara.
- [ ] El runbook de backfill exige snapshot previo y `dry-run` con diff.
- [ ] El runbook aborta si el `dry-run` muestra filas que desaparecen.
- [ ] El silenciamiento de la reconciliación tiene TTL automático.
- [ ] Hay una alerta de freshness independiente de la reconciliación.
- [ ] Los postmortems no contienen nombres ni buscan culpables.

---

## Fuentes (consultadas 2026-07-10)

- [RFC 3339 — Date and Time on the Internet](https://www.rfc-editor.org/rfc/rfc3339)
- [PostgreSQL — `INSERT ... ON CONFLICT`](https://www.postgresql.org/docs/current/sql-insert.html#SQL-ON-CONFLICT)
- [Google SRE — Postmortem Culture](https://sre.google/sre-book/postmortem-culture/) — postmortem sin culpables.
- [AsyncAPI Documentation](https://www.asyncapi.com/docs)
- Documentación oficial del motor de streaming que elijas, para la semántica exacta de sus watermarks. Este artículo es agnóstico deliberadamente.
- [Verificación de fuentes de la serie](/blog/verificacion-de-fuentes-serie-avanzada/)
