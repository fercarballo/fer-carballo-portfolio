---
title: "Probar dinero no es probar formularios: invariantes, idempotencia y trazabilidad en sistemas financieros"
description: "Por qué una UI verde no prueba que el dinero esté correcto. Modelo mínimo, invariantes verificables, autorización por objeto y una cartera de pruebas por riesgo para un sistema de transferencias."
pubDate: 2026-07-09
tags: ["quality-engineering", "fintech", "testing", "ledger", "idempotencia", "owasp-api", "sdet"]
cluster: "13"
clusterTitle: "Quality Engineering en fintech"
type: "pilar"
order: 1
icon: "flask"
iconHue: 88
readingLevel: "Intermedio–Avanzado"
---
> **Aviso.** Nexo Finanzas es un dominio **ficticio**. Todos los importes, cuentas, tokens y usuarios son sintéticos. Este artículo no constituye asesoramiento legal, regulatorio ni de cumplimiento. Cuando se citan marcos (PCI DSS, PSD2/PSD3, GDPR, BCRA) se indica versión/jurisdicción y fecha de consulta. Los diagramas Mermaid no fueron renderizados en el entorno de redacción: se mantuvieron simples y con sintaxis estándar.

## El bug que pasó todos los tests

En Nexo Finanzas un cliente toca "Transferir $100" a otra cuenta. La app muestra un check verde y "Transferencia exitosa". El backend respondió `200 OK`. La suite de UI está toda en verde.

Tres horas después, la reconciliación diaria encuentra que la cuenta de origen tiene **dos débitos de $100** por una sola intención del usuario. ¿Qué pasó? El teléfono perdió conectividad justo después de enviar el `POST`; el SDK reintentó de forma automática; el servidor procesó dos veces. La UI nunca lo supo, porque la UI solo prueba que *una pantalla se ve bien*, no que *el dinero esté correcto*.

Esa distancia entre "la interfaz responde 200" y "el saldo es correcto, único, autorizado y auditable" es el tema de este artículo. Es la diferencia entre probar formularios y probar dinero.

> **Tesis:** en un sistema financiero, la confianza no la da la UI ni el código de estado HTTP: la dan **invariantes de negocio verificables, trazabilidad y capacidad de recuperación ante fallos**.

## Prerrequisitos

Deberías estar cómodo (o repasar) con:

- **HTTP/REST**: verbos, status codes, autenticación vs autorización.
- **SQL y transacciones**: atomicidad, aislamiento, consistencia local.
- **Números y serialización**: enteros, decimales, precisión, JSON.
- **Consistencia eventual, colas y eventos** a nivel conceptual.
- **Testing de API**, pruebas negativas y threat modeling básico.

### Glosario mínimo

- **Ledger (libro mayor):** registro de movimientos de dinero. Aquí usamos **doble entrada**: cada operación genera al menos dos asientos que se compensan (lo que sale de una cuenta entra en otra).
- **Asiento (entry):** una línea inmutable del ledger: cuenta, dirección (débito/crédito), importe, referencia de operación.
- **Invariante:** una condición que debe ser verdadera *siempre*, antes y después de cada operación (p. ej., "la suma de débitos es igual a la suma de créditos").
- **Idempotencia:** ejecutar la misma operación varias veces produce el mismo efecto que ejecutarla una sola vez.
- **Reconciliación:** proceso que compara fuentes de verdad independientes (estado operacional, ledger, eventos) para detectar diferencias.
- **BOLA (Broken Object Level Authorization):** poder operar un objeto (una cuenta) que no te pertenece; el riesgo #1 del [OWASP API Security Top 10 2023](https://owasp.org/API-Security/editions/2023/en/0x11-t10/).

## Qué hace distinto al dominio financiero (desde calidad)

En un CRUD, un bug suele significar "un dato quedó feo". En dinero, un bug significa que **se creó o destruyó valor** que no existía, y eso es, a la vez, un problema técnico, contable, reputacional y —según jurisdicción— regulatorio. De esa asimetría se derivan cuatro exigencias de calidad que un formulario no tiene:

1. **Conservación.** El dinero no se crea ni se destruye dentro del sistema: solo se mueve. Esto se prueba con invariantes, no mirando pantallas.
2. **Unicidad de efecto.** Una intención del usuario debe producir exactamente un movimiento, aunque la red duplique el pedido. Esto exige **idempotencia**.
3. **Trazabilidad.** Debe poder reconstruirse *quién hizo qué, cuándo y con qué resultado*, sin exponer datos personales. Esto exige auditoría y correlación de eventos.
4. **Recuperabilidad.** Ante un fallo parcial, el sistema debe converger a un estado consistente (reintento seguro o compensación), no quedar "a medias".

## El modelo mínimo

Antes de probar, hay que modelar. Cuatro entidades bastan para razonar sobre casi todo:

- **Cuenta (account):** identidad + saldo + dueño + moneda.
- **Transferencia (transfer):** intención de mover un importe de una cuenta a otra; tiene estado.
- **Asiento (ledger entry):** el hecho contable inmutable que materializa el movimiento.
- **Comprobante (receipt):** la evidencia que se devuelve al cliente, con referencia estable.

Regla de oro: **la transferencia describe la intención; el ledger describe la verdad.** Los tests deben verificar el ledger, no la transferencia ni la UI.

### Máquina de estados de una transferencia

<figure class="diagram">
  <img src="/blog/diagrams/probar-dinero-no-es-probar-formularios-1.svg" alt="Diagrama: probar-dinero-no-es-probar-formularios (1)" loading="lazy" decoding="async" />
</figure>

Cada flecha es una prueba: una transición no listada (por ejemplo `COMPLETED --> PENDING`) debe ser **imposible** y hay que testearla como caso negativo. `REJECTED` (regla de negocio, ej. saldo insuficiente) y `FAILED` (fallo técnico transitorio) son distintos: solo `FAILED` habilita reintento.

### El flujo, y lo que el diagrama NO prueba

<figure class="diagram">
  <img src="/blog/diagrams/probar-dinero-no-es-probar-formularios-2.svg" alt="Diagrama: probar-dinero-no-es-probar-formularios (2)" loading="lazy" decoding="async" />
</figure>

**Límites del diagrama (declarados explícitamente):** el paso "Resultado atómico" solo es cierto si débito y crédito ocurren en **una transacción local**. En cuanto origen y destino viven en servicios o bases distintas, no hay atomicidad distribuida gratis: se necesitan patrones de **compensación** (ej. saga) y la consistencia pasa a ser **eventual**. No uses este gráfico como prueba de atomicidad distribuida; úsalo para acordar qué es local y qué no. El detalle está en el artículo satélite de reconciliación.

## Invariantes: lo que se prueba siempre

Las invariantes son el corazón de la calidad financiera. Se expresan como aserciones que valen antes y después de cada operación y también en lotes (reconciliación).

| Invariante | Expresión (informal) | Alcance | Se rompe si… |
|---|---|---|---|
| Partida doble | Σ débitos = Σ créditos por operación | Por transferencia | Un asiento quedó sin contraparte |
| Conservación | Σ saldos internos = constante, salvo entradas/salidas externas registradas | Sistema | Se "creó" o "perdió" dinero |
| No sobregiro (si es la regla) | saldo_origen − importe ≥ límite | Por cuenta | Se permitió saldo inválido |
| Autorización por objeto | el solicitante puede operar la cuenta origen | Por request | Un usuario opera cuenta ajena (BOLA) |
| Transición válida | estado_nuevo ∈ transiciones(estado_actual) | Por transferencia | Se saltó una etapa |
| Unicidad de operación | (idempotency_key, scope) es única | Por request | Un reintento generó un segundo movimiento |
| Inmutabilidad del asiento | los asientos no se actualizan ni borran; se compensan | Ledger | Alguien "editó" historia contable |

Nota importante: **"no sobregiro" es una decisión de diseño, no una ley universal.** Hay cuentas que sí admiten saldo negativo (crédito, descubierto pactado). El valor de escribir la invariante no es imponerla, sino **hacerla explícita y testeable**.

## Idempotencia (resumen; profundidad en el satélite)

El bug de apertura se evita con una **clave de idempotencia**: el cliente envía un identificador único por intención; el servidor garantiza que esa clave produce **una sola** ejecución y devuelve la misma respuesta ante repeticiones. La idempotencia de los *métodos* HTTP está normada en [RFC 9110](https://www.rfc-editor.org/rfc/rfc9110#name-idempotent-methods) (`GET`, `PUT`, `DELETE` son idempotentes; `POST` no), y existe un borrador de IETF para un header estándar `Idempotency-Key` ([draft-07, 2025](https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/), aún **no** es RFC).

El cómo —concurrencia, almacenamiento, expiración, colisiones de clave con cuerpo distinto, reintentos tras timeout— se trata en profundidad en el artículo satélite de idempotencia. Aquí basta la regla: **ningún endpoint que mueva dinero debe reintentarse sin idempotencia.**

## Autorización y amenazas de flujo de negocio

Una UI que "esconde el botón" no es control de acceso: es maquillaje. El control vive en el servidor y se prueba con requests, no con clicks. Tres riesgos del [OWASP API Security Top 10 2023](https://owasp.org/API-Security/editions/2023/en/0x11-t10/) son directamente aplicables a transferencias:

- **API1 — BOLA:** ¿puede el usuario A transferir *desde* la cuenta de B cambiando un id en el body/URL? Prueba: mismo endpoint, token de A, cuenta de B → debe fallar (403/404, sin filtrar si la cuenta existe).
- **API5 — BFLA (Broken Function Level Authorization):** ¿puede un usuario común invocar una función administrativa (revertir asientos, ajustar saldos)? Prueba: rol insuficiente → 403.
- **API6 — Unrestricted Access to Sensitive Business Flows:** ¿se puede automatizar un flujo sensible (miles de micro-transferencias) sin límites? Prueba: control de tasa/volumen y detección de abuso.

Anti-patrón a desmontar: **"la UI valida permisos".** Consecuencia: cualquiera con `curl` opera cuentas ajenas. Alternativa: autorización por objeto en el servidor, más un test de API por cada objeto sensible.

## Observabilidad, auditoría y reconciliación (resumen; profundidad en el satélite)

Tres fuentes deben poder cotejarse: **estado operacional** (saldo mostrado), **ledger** (verdad contable) y **event log** (qué pasó). Si divergen, hay un problema aunque todo esté "verde". La correlación se logra con **trace/correlation IDs** propagados por [W3C Trace Context](https://www.w3.org/TR/trace-context/) e instrumentados con [OpenTelemetry](https://opentelemetry.io/docs/what-is-opentelemetry/), cuyas señales de traces, métricas y logs son estables ([OTel Status](https://opentelemetry.io/status/)). La auditoría **no** debe registrar PII ni secretos.

## Cartera de pruebas por riesgo

No se testea "todo por igual": se testea **por riesgo**. La herramienta central es una matriz **riesgo → control → prueba → evidencia**.

| Riesgo | Control | Prueba (nivel) | Evidencia esperada |
|---|---|---|---|
| Doble débito por reintento | Idempotencia + unicidad | API: duplicado y concurrencia | Una sola operación; respuesta idéntica; fila única en `idem_store` |
| Pérdida de centavos por `float` | Tipo decimal / unidades mínimas | Unit + property-based | Invariante de conservación sostenida sobre N operaciones |
| BOLA (cuenta ajena) | AuthZ por objeto | API con token de otro usuario | 403/404 sin fuga de existencia del objeto |
| Saldo negativo indebido | Invariante no-sobregiro en tx | API concurrente | Cero casos con saldo < límite |
| Divergencia ledger/operacional | Reconciliación programada | Job de reconciliación | Reporte fechado; 0 breaks o break con runbook asociado |
| PII/secretos en logs | Redacción/tokenización | Test de auditoría | Muestreo de logs sin PII |
| Transición inválida de estado | Máquina de estados server-side | Unit + API negativos | Transición prohibida rechazada |

Ubicación de cada prueba en la pirámide:

- **Unitarias:** invariantes puras (dinero, transiciones) — rápidas, muchas.
- **Contrato:** que el `openapi.yaml` y la implementación no se desincronicen.
- **API/integración:** idempotencia, autorización, concurrencia — donde vive el riesgo real.
- **UI:** un puñado de caminos felices críticos; **no** son la red de seguridad del dinero.
- **Performance/seguridad:** límites de tasa, comportamiento bajo carga, abuso de flujos.

Trade-off honesto: los tests de **concurrencia** son los más valiosos y los más caros de escribir y de mantener (son inherentemente no deterministas). Recomendación: pocos, muy dirigidos a las invariantes de unicidad y no-sobregiro, ejecutados con repetición.

## Datos sintéticos y límites del sandbox

Todo el laboratorio usa datos **ficticios**: usuarios `usr_synthetic_*`, cuentas `acc_00001`, tokens `tok_test_*`. Reglas:

- Nunca PII real, ni siquiera "de prueba" copiada de producción.
- Importes y monedas sintéticos; si se simula multi-moneda, respetar exponentes de [ISO 4217](https://www.iso.org/iso-4217-currency-codes.html).
- El sandbox **no** procesa pagos reales ni se conecta a redes de tarjetas.

### Cómo extender este sandbox de forma segura

- Agregá cuentas y escenarios como **fixtures versionadas**, no como datos manuales.
- Cada escenario nuevo declara: comando de ejecución, precondiciones, resultado esperado y **limitaciones conocidas**.
- Si simulás un integrador externo, hacelo con un doble de prueba y marcá claramente que **un mock exitoso no es reconciliación real** (anti-patrón clásico).

## Qué publicar en GitHub (criterio, no solo herramientas)

Un repo que demuestra criterio Senior/Staff no es "miré cómo uso Postman": es **cómo decido**. Estructura sugerida:

```text
nexo-transfer-api/
  openapi.yaml
  docs/01-problema-y-reglas-de-negocio.md
  docs/quality/risk-matrix.md
  docs/adr/ADR-001-representacion-de-dinero.md
  docs/adr/ADR-002-idempotencia-de-transferencias.md
  docs/runbooks/reconciliation.md
  postman/Nexo-Finanzas.postman_collection.json
```

Una demostración profesional incluye: **comando de ejecución, datos sintéticos, evidencia fechada y limitaciones conocidas**. Un ADR vale más que diez tests si explica *por qué* elegiste representar dinero como enteros y qué costo aceptaste.

## Anti-patrones (causa → consecuencia → alternativa)

- **`float` para dinero por comodidad.** Causa: pereza de tipo. Consecuencia: centavos que aparecen/desaparecen. Alternativa: decimal o unidades mínimas (ver satélite de representación).
- **HTTP 200 == integridad financiera.** Causa: confundir capa de transporte con capa de negocio. Consecuencia: doble débito silencioso. Alternativa: verificar el ledger, no el status.
- **Reintentar sin idempotencia.** Causa: SDKs con retry automático. Consecuencia: duplicados. Alternativa: clave de idempotencia + unicidad.
- **UI como única capa de permisos.** Causa: creer que el cliente es confiable. Consecuencia: BOLA. Alternativa: AuthZ por objeto en servidor.
- **Mock exitoso == reconciliación.** Causa: querer verde rápido. Consecuencia: falsa confianza. Alternativa: reconciliación contra fuentes independientes.
- **Declarar compliance por tener un checklist técnico.** Causa: confundir controles con certificación. Consecuencia: claim falso y riesgo legal. Alternativa: describir controles como controles, no como cumplimiento.

## Qué aprendimos / próximos pasos

- El dinero se prueba con **invariantes y reconciliación**, no con pantallas verdes.
- Modelá primero (cuenta, transferencia, asiento, comprobante); la transferencia es intención, el ledger es verdad.
- Priorizá por riesgo con una matriz riesgo → control → prueba → evidencia.

Continuá con los satélites de esta colección:

- **Idempotencia y reintentos** (`/idempotencia-y-reintentos-en-transferencias`) — el "cómo" del control anti-doble-débito.
- **Cómo representar dinero** (`/representar-dinero-decimales-unidades-minimas`) — el "cómo" de la conservación.
- **Reconciliación, auditoría y observabilidad** (`/reconciliacion-auditoria-observabilidad-financiera`) — el "cómo" de la trazabilidad.

## Checklist final

- [ ] Cada término financiero está definido para una audiencia técnica general.
- [ ] Existe una máquina de estados y las transiciones inválidas se testean.
- [ ] Hay una tabla de invariantes y cada una tiene al menos una prueba.
- [ ] Ningún endpoint de dinero se reintenta sin idempotencia.
- [ ] La autorización por objeto se prueba con requests, no con la UI.
- [ ] Existe una matriz riesgo → control → prueba → evidencia.
- [ ] Los datos son 100% sintéticos y el sandbox no toca pagos reales.
- [ ] Ningún claim de cumplimiento regulatorio se afirma sin fuente y jurisdicción.

---

## Fuentes (consultadas 2026-07-09)

- [OWASP API Security Top 10 — edición 2023](https://owasp.org/API-Security/editions/2023/en/0x11-t10/)
- [RFC 9110 — HTTP Semantics, métodos idempotentes](https://www.rfc-editor.org/rfc/rfc9110#name-idempotent-methods)
- [IETF draft-ietf-httpapi-idempotency-key-header](https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/) (Internet-Draft, no RFC)
- [OpenTelemetry — Status](https://opentelemetry.io/status/) · [Qué es OpenTelemetry](https://opentelemetry.io/docs/what-is-opentelemetry/)
- [W3C Trace Context](https://www.w3.org/TR/trace-context/)
- [ISO 4217 — Currency codes](https://www.iso.org/iso-4217-currency-codes.html)
- [Google SRE — Service Level Objectives](https://sre.google/sre-book/service-level-objectives/)

