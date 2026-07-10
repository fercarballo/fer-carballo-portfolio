---
title: "Reconciliación, auditoría y observabilidad: demostrar que el dinero está bien después de los hechos"
description: "Cómo cotejar estado operacional, ledger y eventos; correlacionar con trace context y OpenTelemetry; auditar sin filtrar PII; y definir SLOs de break rate con un runbook de reconciliación."
pubDate: 2026-07-09
tags: ["reconciliacion", "observabilidad", "opentelemetry", "auditoria", "slo", "sre", "fintech"]
cluster: "13"
clusterTitle: "Quality Engineering en fintech"
type: "satelite"
order: 4
icon: "flask"
iconHue: 88
readingLevel: "Avanzado"
---
> **Aviso.** Nexo Finanzas es un dominio **ficticio**. Umbrales, SLOs y ejemplos son decisiones de diseño ilustrativas, **no** valores medidos. Las menciones a PCI DSS y GDPR son contexto con versión/jurisdicción, **no** asesoramiento legal ni de cumplimiento.

## El problema: todo verde, y aun así no cierra

En Nexo Finanzas los tests pasan, los mocks devuelven `200`, el dashboard está en verde. A fin de día, el proceso de reconciliación reporta que el **saldo operacional** de una cuenta no coincide con la **suma de asientos** del ledger por $0.03. Nadie sabe cuándo ni por qué. No hay forma de correlacionar ese descuadre con las operaciones que lo causaron.

Este es el problema que ataca este artículo: **¿cómo demuestro, después de los hechos, que el dinero está bien —y cómo lo investigo cuando no lo está— sin filtrar datos personales en el intento?**

> Profundiza la trazabilidad que el pilar (`/probar-dinero-no-es-probar-formularios`) resume. "Un mock exitoso no es reconciliación real" es su anti-patrón central.

## Prerrequisitos y glosario

- **Fuente de verdad:** un registro autoritativo. Aquí hay tres candidatos que deben **coincidir**.
- **Break (descuadre):** una diferencia detectada por la reconciliación.
- **Correlación de eventos:** poder unir todos los registros de una misma operación mediante un identificador propagado.
- **Trace Context:** el estándar [W3C Trace Context](https://www.w3.org/TR/trace-context/) para propagar identificadores de traza entre servicios (headers `traceparent`/`tracestate`).
- **OpenTelemetry (OTel):** framework de instrumentación cuyas señales (traces, métricas, logs) son estables ([OTel Status](https://opentelemetry.io/status/); [Qué es OTel](https://opentelemetry.io/docs/what-is-opentelemetry/)).
- **SLO / error budget:** objetivos de nivel de servicio y su presupuesto de error ([Google SRE](https://sre.google/sre-book/service-level-objectives/)).

## Tres fuentes de verdad (y por qué divergen)

<figure class="diagram">
  <img src="/blog/diagrams/reconciliacion-auditoria-observabilidad-financiera-1.svg" width="715" height="256" alt="Diagrama: reconciliacion-auditoria-observabilidad-financiera (1)" loading="lazy" decoding="async" />
</figure>

- **Estado operacional:** el saldo "rápido" que ve la app.
- **Ledger:** la verdad contable (asientos inmutables de doble entrada).
- **Event log:** la secuencia de lo que ocurrió (eventos de dominio/auditoría).

En un sistema con un solo servicio y una sola transacción, coinciden por construcción. En cuanto hay **múltiples servicios, colas o cachés**, aparece la **consistencia eventual**: por instantes divergen, y un fallo parcial (débito ocurrió, evento no se publicó) puede dejarlas divergentes de forma permanente. La reconciliación es el control que lo **detecta**; la compensación es el que lo **corrige**.

Distinción clave (la del pilar): **atomicidad local** (una transacción de BD), **consistencia distribuida** (varios servicios acordando) y **compensación** (deshacer con un asiento inverso) son cosas distintas. La reconciliación asume que la distribuida no es perfecta y verifica el resultado.

## Un esquema de reconciliación simplificado

La regla más básica: para cada cuenta, el saldo operacional debe igualar la suma de sus asientos.

```sql
-- Reconciliacion (esquema simplificado, datos sinteticos, unidades minimas).
WITH ledger_balance AS (
  SELECT account_id,
         SUM(CASE WHEN direction = 'CREDIT' THEN amount_minor
                  ELSE -amount_minor END) AS balance_minor
  FROM ledger_entries
  GROUP BY account_id
)
SELECT a.account_id,
       a.balance_minor                     AS operational_minor,
       l.balance_minor                     AS ledger_minor,
       a.balance_minor - l.balance_minor   AS diff_minor
FROM accounts a
JOIN ledger_balance l ON l.account_id = a.account_id
WHERE a.balance_minor <> l.balance_minor;   -- cero filas = reconciliado
```

Interpretación: **cero filas es el estado sano.** Cualquier fila es un break, con su `diff_minor` exacto en unidades mínimas (por eso importa la representación de dinero del satélite correspondiente). Una segunda regla, más fuerte, verifica **conservación global**: en un sistema cerrado, la suma de todos los `amount_minor` con signo debe ser cero (todo débito tiene su crédito). Si no lo es, se creó o destruyó dinero.

## Correlación de eventos: unir los puntos sin PII

Para investigar un break necesitás poder reconstruir la operación completa. Eso requiere un **identificador de correlación** propagado por todos los servicios y presente en logs, métricas y trazas.

- Propagá `traceparent` según [W3C Trace Context](https://www.w3.org/TR/trace-context/).
- Instrumentá con [OpenTelemetry](https://opentelemetry.io/docs/what-is-opentelemetry/); sus tres señales son estables ([status](https://opentelemetry.io/status/)), así que podés correlacionar una traza con las métricas y logs de la misma operación.
- Guardá en cada evento de auditoría: `correlation_id`, `transfer_id`, estado, timestamp, actor **tokenizado**, resultado. **Nunca**: número de cuenta real, PII, tokens de auth, credenciales.

Anti-patrón a desmontar: **registrar PII o secretos en logs de auditoría.** Consecuencia: una fuga convierte un log en un incidente de datos personales (y, según jurisdicción, en un problema bajo marcos como el [GDPR](https://eur-lex.europa.eu/eli/reg/2016/679/oj), Reglamento (UE) 2016/679, aplicable en la UE; esto es contexto, no asesoramiento legal). Alternativa: **tokenización/seudonimización** y redacción en el pipeline de logs, más un test que verifique que ningún campo sensible sale en claro.

## Auditar sin filtrar: qué registrar y qué no

| Registrar (sintético) | No registrar |
|---|---|
| `correlation_id`, `transfer_id` | Número de cuenta/tarjeta real |
| Estado y transición | Nombre, documento, datos de contacto (PII) |
| `amount_minor`, `currency` | Tokens de sesión, claves, secretos |
| Actor tokenizado (`usr_hash`) | Actor identificable directamente |
| Timestamp, resultado | Payloads completos sin sanear |

Prueba concreta: un test de auditoría que **falla si aparece** cualquier patrón de PII/secreto en la salida de logs de un flujo de transferencia. Es barato y evita el peor incidente.

## SLOs de reconciliación: medir la salud del dinero

No alcanza con reconciliar: hay que definir **cuándo** el nivel de descuadres es aceptable y cuándo dispara acción. Aplicando la lógica de [SLOs de Google SRE](https://sre.google/sre-book/service-level-objectives/):

- **SLI candidato 1 — break rate:** proporción de cuentas/operaciones con diferencia distinta de cero por ciclo de reconciliación.
- **SLI candidato 2 — freshness:** antigüedad máxima de la última reconciliación exitosa.
- **SLO:** por ejemplo, "el 100% de las cuentas reconcilian dentro de las 24 h; 0 breaks netos no explicados persistiendo > 1 ciclo". En dinero, el objetivo de descuadre neto persistente tiende a **cero**, no a "tres nueves": un centavo perdido es un centavo perdido.
- **Error budget:** aquí es más rígido que en un servicio web típico; un break no es "presupuesto gastado", es una investigación obligatoria.

> Honestidad: los umbrales anteriores son **decisiones de diseño ilustrativas**, no valores medidos ni una recomendación regulatoria.

## El runbook de reconciliación (postmortem simulado)

Cuando aparece un break, el equipo no debería improvisar. Un runbook (`docs/runbooks/reconciliation.md`) responde: cómo se detecta, cómo se investiga, cómo se corrige.

Flujo simulado de un break de $0.03:

1. **Detección:** el job nocturno arroja 1 fila con `diff_minor = 3`. Alerta con `account_id` y `correlation_id` del último ciclo.
2. **Contención:** ¿el break crece o es puntual? Si crece, se pausa el flujo afectado (feature flag), no toda la plataforma.
3. **Investigación:** con el `correlation_id` se reconstruye la operación en trazas/logs; se busca el patrón (¿redondeo mal en un reparto? ¿un evento no publicado? ¿un doble asiento?).
4. **Corrección:** **nunca** se "edita" un asiento. Se emite un **asiento de compensación** que explica y revierte, preservando la inmutabilidad e historia.
5. **Postmortem sin culpa:** causa raíz, invariante que faltaba, y la **prueba nueva** que habría atrapado el bug (por ejemplo, la property-based del reparto del satélite de dinero).

Este flujo conecta las piezas: la representación de dinero explica el `0.03`; la idempotencia explica muchos "dobles"; la reconciliación los **detecta** y el runbook los **cierra**.

## Trade-offs

- **Reconciliación en tiempo real vs por lotes:** tiempo real detecta antes pero es cara y ruidosa; por lotes (diaria) es simple y suficiente para muchos casos, a costa de latencia de detección.
- **Más señales (OTel completo) vs costo:** trazas de todo dan visibilidad total pero cuestan almacenamiento y pueden capturar datos sensibles; muestreo y redacción son necesarios.
- **SLO estricto (cero breaks) vs operativo:** cero es el ideal contable, pero exige capacidad de investigación real; sin equipo para responder, un SLO estricto solo genera alertas ignoradas.

## Anti-patrones

- **Mock exitoso == reconciliación.** → falsa confianza. Alternativa: reconciliar contra fuentes independientes con datos sintéticos del flujo completo.
- **PII/secretos en logs.** → incidente de datos. Alternativa: tokenización + test que lo prohíbe.
- **"Arreglar" un break editando un asiento.** → se destruye la auditabilidad. Alternativa: asiento de compensación.
- **Declarar cumplimiento regulatorio por tener el checklist técnico.** → claim falso. Alternativa: describir controles como controles; el cumplimiento lo evalúa quien corresponda, con la versión y jurisdicción del marco (p. ej. PCI DSS **v4.0.1**, única versión activa; sus requisitos "future-dated" son obligatorios desde el **31-03-2025** — [PCI SSC](https://www.pcisecuritystandards.org/)). Esto es contexto, no asesoramiento.

## Qué publicar en GitHub

- `docs/runbooks/reconciliation.md`: detección, contención, investigación, corrección por compensación, plantilla de postmortem.
- Consulta(s) de reconciliación versionadas y un job programado, con comando de ejecución y salida esperada (cero filas).
- Config de observabilidad (OTel) con propagación de `traceparent` y **redacción** de PII documentada.
- Un test de auditoría que falle ante PII/secretos en logs.

## Qué aprendimos / próximos pasos

- La confianza se **demuestra después de los hechos** con reconciliación, no antes con mocks.
- La correlación (trace context + OTel) es lo que convierte un break en algo investigable; la auditoría debe ser útil **sin** ser peligrosa (sin PII).
- Los breaks se cierran con compensación y un postmortem que agrega una prueba, no con ediciones silenciosas.

Enlaces internos:

- Pilar: `/probar-dinero-no-es-probar-formularios`.
- Idempotencia: `/idempotencia-y-reintentos-en-transferencias` (muchos breaks son duplicados no absorbidos).
- Representación de dinero: `/representar-dinero-decimales-unidades-minimas` (muchos breaks son centavos mal redondeados).

## Checklist final

- [ ] Existen tres fuentes cotejables (operacional, ledger, eventos) y una regla de reconciliación.
- [ ] La reconciliación devuelve cero filas en estado sano y `diff` exacto ante breaks.
- [ ] Hay un `correlation_id` propagado (W3C Trace Context) e instrumentado (OTel).
- [ ] Los logs de auditoría no contienen PII ni secretos, y un test lo verifica.
- [ ] Hay SLIs/SLO de break rate y freshness, documentados como decisión.
- [ ] Existe un runbook con corrección por compensación (no edición).
- [ ] Ningún claim de cumplimiento se afirma sin versión/jurisdicción/fecha.

---

## Fuentes (consultadas 2026-07-09)

- [Google SRE — Service Level Objectives](https://sre.google/sre-book/service-level-objectives/)
- [OpenTelemetry — Status](https://opentelemetry.io/status/) · [Qué es OpenTelemetry](https://opentelemetry.io/docs/what-is-opentelemetry/)
- [W3C Trace Context](https://www.w3.org/TR/trace-context/)
- [PCI Security Standards Council](https://www.pcisecuritystandards.org/) · [Requisitos future-dated de PCI DSS v4.x](https://blog.pcisecuritystandards.org/now-is-the-time-for-organizations-to-adopt-the-future-dated-requirements-of-pci-dss-v4-x)
- [Reglamento (UE) 2016/679 (GDPR) — EUR-Lex](https://eur-lex.europa.eu/eli/reg/2016/679/oj)

