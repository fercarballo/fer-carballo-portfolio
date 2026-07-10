---
title: "Idempotencia y reintentos en transferencias: cómo distinguir una repetición legítima de una operación nueva"
description: "Diseño y pruebas de un endpoint de transferencias idempotente: clave de idempotencia, concurrencia, almacenamiento, expiración y colisiones de clave con cuerpo distinto. Con pseudocódigo y casos de prueba de API."
pubDate: 2026-07-09
tags: ["idempotencia", "reintentos", "api", "concurrencia", "fintech", "sdet", "rfc-9110"]
cluster: "13"
clusterTitle: "Quality Engineering en fintech"
type: "satelite"
order: 2
repo: "telco-reliability-lab"
icon: "flask"
iconHue: 88
readingLevel: "Avanzado"
---
> **Aviso.** Nexo Finanzas es un dominio **ficticio**. Todos los importes, cuentas, tokens y usuarios son sintéticos. El pseudocódigo es didáctico y **no es código listo para producción**. No se reportan resultados de ejecución, métricas ni cobertura.

## El problema real: el timeout mentiroso

En Nexo Finanzas, un cliente envía `POST /transfers` por $100. El servidor procesa la transferencia y empieza a responder, pero la respuesta se pierde: el cliente ve un **timeout**. Su SDK, siguiendo una política razonable, **reintenta**. Ahora hay dos requests para una sola intención.

La pregunta central de este artículo no es "¿cómo evito reintentos?" (no podés: la red los va a producir), sino **"¿cómo distingo una repetición legítima de una operación nueva, sin mover el dinero dos veces?"**

> Este artículo profundiza el control que el pilar (`/probar-dinero-no-es-probar-formularios`) solo resume. Asume su modelo de cuenta/transferencia/asiento.

## Prerrequisitos y glosario

- **HTTP y RFC 9110**: qué método es idempotente y por qué `POST` no lo es por defecto ([RFC 9110 §9.2.2](https://www.rfc-editor.org/rfc/rfc9110#name-idempotent-methods)).
- **Transacciones y aislamiento**: `UNIQUE`, `SELECT ... FOR UPDATE`, condiciones de carrera.
- **Idempotencia (de aplicación):** garantizar *un solo efecto* aunque el request llegue N veces.
- **Clave de idempotencia:** identificador único **por intención**, generado por el cliente.
- **Fingerprint:** hash del cuerpo canónico del request, para detectar reuso de clave con contenido distinto.
- **At-least-once vs exactly-once:** las redes entregan "al menos una vez"; "exactamente una vez" no existe de punta a punta. Lo alcanzable es **effectively-once**: procesar muchas entregas con un solo efecto.

## Idempotencia de método vs idempotencia de aplicación

[RFC 9110](https://www.rfc-editor.org/rfc/rfc9110#name-idempotent-methods) define que un método es idempotente si el *efecto en el servidor* de N requests idénticos es el mismo que el de uno solo. `PUT` y `DELETE` lo son por semántica; `POST` **no**. Crear una transferencia es naturalmente `POST` (crea un recurso), así que la idempotencia hay que **construirla a nivel de aplicación** con una clave explícita.

Existe un borrador de IETF que estandariza un header `Idempotency-Key` para exactamente esto: [`draft-ietf-httpapi-idempotency-key-header-07`](https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/) (Standards Track, publicado 15-10-2025, en evaluación). **Es un Internet-Draft, no un RFC:** adoptá el *header* como convención pragmática, pero no lo cites como norma cerrada ni asumas que su texto es definitivo.

## Decisiones de arquitectura de la clave

Una clave de idempotencia bien diseñada implica cinco decisiones explícitas:

1. **Quién la genera.** El **cliente**, una por intención (típicamente un UUID). Si la genera el servidor, no protege contra reintentos del cliente.
2. **Alcance (scope).** La unicidad es `(idempotency_key, scope)`. El scope suele ser el usuario/cuenta autenticada, para que la clave de un cliente no colisione con la de otro ni permita adivinar claves ajenas.
3. **Almacenamiento.** Una tabla/almacén con la clave, el estado (`IN_PROGRESS`/`COMPLETED`/`FAILED`), el **fingerprint** del cuerpo y la **respuesta almacenada** para poder re-emitirla idéntica.
4. **Expiración (TTL).** Las claves no viven para siempre: un TTL (p. ej. 24 h) acota el almacenamiento. Trade-off: TTL corto ahorra espacio pero reduce la ventana de protección ante reintentos tardíos.
5. **Colisión semántica.** Misma clave + **cuerpo distinto** = error del cliente (reusó una clave para otra operación). Debe rechazarse, no procesarse.

## Pseudocódigo del endpoint idempotente

```java
// Pseudocodigo didactico. NO es codigo listo para produccion:
// omite manejo de errores, metricas, tracing y detalles del store.
public TransferResult createTransfer(String idemKey, TransferRequest req, Principal caller) {

    String scope = caller.accountScope();
    String fingerprint = sha256(canonicalize(req)); // hash del cuerpo canonico

    // 1) Reclamo atomico de la clave: insertar-si-no-existe.
    boolean claimed = idemStore.tryInsert(
        idemKey, scope, fingerprint, Status.IN_PROGRESS, ttl(Duration.ofHours(24)));

    if (!claimed) {
        // La clave ya existe -> es una repeticion.
        IdemRecord existing = idemStore.get(idemKey, scope);

        if (!existing.fingerprint().equals(fingerprint)) {
            // Misma clave, cuerpo distinto -> conflicto semantico.
            throw new IdempotencyConflict(422); // Unprocessable
        }
        if (existing.status() == Status.IN_PROGRESS) {
            // Ejecucion concurrente todavia en curso.
            throw new RequestInFlight(409); // el cliente reintenta luego
        }
        // Repeticion legitima ya resuelta -> devolvemos la MISMA respuesta.
        return existing.storedResponse();
    }

    // 2) Primera vez: ejecutamos la transferencia UNA sola vez.
    try {
        TransferResult result = ledger.transferAtomically(req, caller); // debito+credito, 1 tx
        idemStore.complete(idemKey, scope, Status.COMPLETED, result);   // guarda respuesta
        return result;
    } catch (RetriableException e) {
        idemStore.markFailed(idemKey, scope); // habilita reintento con la MISMA clave
        throw e;
    }
}
```

Lectura por bloques:

- **`tryInsert` atómico** es el núcleo. La atomicidad la da el almacén (un `INSERT` con `UNIQUE(idempotency_key, scope)`), no un `if (exists)` seguido de `insert` — ese patrón tiene una condición de carrera entre el chequeo y la escritura.
- **`fingerprint`** convierte "misma clave" en "misma clave *y* mismo contenido". Sin él, un cliente que reusa una clave para otra transferencia recibiría, erróneamente, la respuesta de la anterior.
- **`IN_PROGRESS` → 409** cubre la concurrencia: dos requests con la misma clave a la vez; uno reclama, el otro ve `IN_PROGRESS` y reintenta más tarde en lugar de ejecutar.
- **`markFailed`** distingue *fallo técnico transitorio* (habilita reintento con la misma clave, como en la transición `FAILED → PENDING` del pilar) de *rechazo de negocio* (no se reintenta).

## Concurrencia: dónde se rompen las implementaciones

El patrón peligroso:

```text
if (store.exists(key)) return store.response(key);   // (A) lectura
store.insert(key, ...);                              // (B) escritura
process();                                           // (C) mueve dinero
```

Entre (A) y (B), dos requests concurrentes pueden ambos leer "no existe" y ambos ejecutar (C): **doble débito**. Alternativas correctas:

- **Insert-first con `UNIQUE`:** intentá insertar primero; si la BD rechaza por violación de unicidad, sabés que es repetición. Es lo que hace el pseudocódigo.
- **Bloqueo pesimista:** `SELECT ... FOR UPDATE` sobre la fila de la clave para serializar; simple pero puede degradar bajo alta contención.
- **La transacción del dinero también debe ser atómica:** débito y crédito en la misma transacción local; si están en servicios distintos, ya no hay atomicidad y entra la compensación (ver el satélite de reconciliación).

## Casos de prueba de API

Estos son los casos mínimos. Todos usan datos **sintéticos** y verifican el **ledger**, no solo el status.

1. **Duplicado exacto (mismo key, mismo body).**
   - Enviar dos veces idéntico. Esperado: **un** movimiento en el ledger; la segunda respuesta **idéntica** a la primera (mismo comprobante); una sola fila en `idem_store`.

2. **Reintento después de timeout.**
   - Simular que la primera respuesta se pierde (el servidor completó). Reenviar con la misma clave. Esperado: sin segundo débito; se re-emite el comprobante original.

3. **Concurrencia (dos requests simultáneos, mismo key).**
   - Lanzar N requests en paralelo con la misma clave. Esperado: exactamente **una** ejecución; el resto obtiene la misma respuesta o `409` si aún estaba en curso; invariante de unicidad intacta.

4. **Reuso de clave con cuerpo distinto.**
   - Misma clave, importe distinto. Esperado: `422` (conflicto semántico); **no** se ejecuta la segunda; **no** se re-emite la respuesta de la primera.

5. **Importe inválido / autorización de objeto (casos negativos que interactúan con idempotencia).**
   - Importe `<= 0`, moneda no soportada → `400/422`, sin crear clave `COMPLETED`. Transferir desde cuenta ajena → `403/404` (BOLA), sin efecto. Verificar que un rechazo **no** deja la clave marcada como completada de forma que bloquee un reintento legítimo posterior.

Ejemplo de "evidencia reproducible" (describe expectativas de diseño, **no** mediciones):

```text
# Precondiciones: cuenta acc_00001 con saldo sintetico; token tok_test_A
# Entorno: sandbox local, commit <SHA>, fecha <YYYY-MM-DD>
# Caso 1 (duplicado):
curl -s -X POST /transfers \
  -H "Authorization: Bearer tok_test_A" \
  -H "Idempotency-Key: 7f3c-uuid-sintetico" \
  -d '{"from":"acc_00001","to":"acc_00002","amount_minor":10000,"currency":"USD"}'
# Repetir el mismo curl.
# Resultado ESPERADO: mismo transfer_id y receipt en ambas; SELECT sobre ledger
#   muestra 2 asientos (1 debito + 1 credito), no 4; idem_store tiene 1 fila.
```

## Trade-offs

- **TTL largo vs corto:** más protección vs más almacenamiento. En transferencias, 24–72 h suele cubrir reintentos realistas.
- **Insert-first vs lock pesimista:** insert-first escala mejor; el lock es más simple de razonar pero sufre con contención alta.
- **Guardar la respuesta completa vs recomputarla:** guardarla garantiza respuesta byte-a-byte idéntica (mejor para clientes estrictos), a costa de espacio.
- **`Idempotency-Key` header (draft) vs clave en el body:** el header sigue la convención emergente y separa metadatos de datos; el body es más simple pero mezcla preocupaciones. Elegí uno y documentalo en un ADR.

## Anti-patrones

- **Usar timestamp o "hash del body" como clave.** Causa: querer "generar la clave sola". Consecuencia: dos intenciones idénticas legítimas (transferir $10 dos veces a propósito) colisionan, o un reintento genera clave distinta. Alternativa: UUID por intención, generado por el cliente.
- **Chequear-y-luego-insertar.** Causa: desconocer la carrera. Consecuencia: doble efecto bajo concurrencia. Alternativa: insert-first atómico con `UNIQUE`.
- **Reintentar `FAILED` como si fuera `REJECTED` (o viceversa).** Consecuencia: o se pierde una operación válida, o se reintenta algo que el negocio rechazó. Alternativa: separar fallo técnico de rechazo de negocio en la máquina de estados.
- **Marcar la clave `COMPLETED` antes de que el dinero se movió.** Consecuencia: un fallo posterior deja la clave "completada" sin efecto real. Alternativa: completar la clave dentro/después de la misma transacción del ledger.

## Qué publicar en GitHub

- `docs/adr/ADR-002-idempotencia-de-transferencias.md`: decisión de clave (cliente/UUID), scope, TTL, almacenamiento, manejo de `409/422`, y **por qué**.
- `openapi.yaml`: documentar el header `Idempotency-Key`, y las respuestas `409`/`422`.
- `postman/Nexo-Finanzas.postman_collection.json`: los 5 casos de prueba anteriores como requests reproducibles con variables sintéticas.
- Tests de concurrencia parametrizados (pocos, repetidos), con comando de ejecución y resultado esperado documentado.

## Qué aprendimos / próximos pasos

- No se evitan los reintentos: se **absorben** con idempotencia.
- La clave protege solo si el reclamo es **atómico** y el **fingerprint** detecta reuso.
- `exactly-once` no existe; buscá **effectively-once**.

Enlaces internos:

- Pilar: `/probar-dinero-no-es-probar-formularios`.
- Representación de dinero: `/representar-dinero-decimales-unidades-minimas` (el importe que hacés idempotente debe además estar bien tipado).
- Reconciliación: `/reconciliacion-auditoria-observabilidad-financiera` (cómo detectás si, pese a todo, hubo un duplicado).

## Checklist final

- [ ] El cliente genera una clave única por intención.
- [ ] La unicidad es `(idempotency_key, scope)` y el reclamo es atómico.
- [ ] Se detecta reuso de clave con cuerpo distinto (`422`).
- [ ] Concurrencia con misma clave produce **una** sola ejecución.
- [ ] Reintento tras timeout re-emite la respuesta original.
- [ ] Fallo técnico y rechazo de negocio están separados.
- [ ] El TTL está definido y justificado en un ADR.
- [ ] Los tests verifican el ledger, no solo el status HTTP.

---

## Fuentes (consultadas 2026-07-09)

- [RFC 9110 — HTTP Semantics, métodos idempotentes](https://www.rfc-editor.org/rfc/rfc9110#name-idempotent-methods)
- [IETF draft-ietf-httpapi-idempotency-key-header-07](https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/) — Internet-Draft, **no** RFC
- [OWASP API Security Top 10 — edición 2023](https://owasp.org/API-Security/editions/2023/en/0x11-t10/)

