---
title: "Quality gates proporcionales al riesgo: decidir un release con evidencia"
description: "Diseño de quality gates proporcionales al riesgo: gate técnico vs decisión de release, excepciones auditables, flaky rate y rollback."
pubDate: 2026-07-09
tags: ["quality-gates", "release-management", "ci-cd", "risk-based-testing", "sdet"]
cluster: "01"
clusterTitle: "Arquitectura de Quality Engineering"
type: "satelite"
order: 2
icon: "shield"
iconHue: 152
readingLevel: "Intermedio–Avanzado"
prerequisites: "Conviene leer antes el artículo pilar de arquitectura de QE."
---
> Este es un artículo **satélite** de la colección. El marco general está en **[Arquitectura de Quality Engineering orientada a riesgo](/blog/arquitectura-quality-engineering-orientada-a-riesgo/)**. Acá profundizamos una sola pregunta: **¿cómo decidimos, de forma automatizada y auditable, si un cambio puede avanzar hacia producción?**

> **Convención de honestidad.** Distingo **hecho citado** (con fuente), **decisión de diseño** (una opción con su costo), **hipótesis** (a medir) y **ejemplo ficticio** (*Nexo Finanzas*, fintech inventada, datos sintéticos).

---

## 1. El problema: "está verde, subilo"

Viernes, 17:40. Un cambio en el servicio de transferencias de *Nexo Finanzas* (ficticio) tiene el pipeline en verde. Alguien escribe en el canal: *"está todo verde, ¿lo subimos?"*. La pregunta parece inocente, pero esconde una confusión que cuesta cara:

**"Verde" responde una pregunta técnica ("¿corrieron y pasaron los controles?"). "Subirlo" es una decisión de negocio ("¿queremos asumir este riesgo, ahora, con este contexto?").** No son lo mismo, y tratarlas como sinónimo es cómo se liberan features a medianoche de un cierre contable, o cambios de autorización sin que Seguridad se entere.

Un *quality gate* bien diseñado no pretende tomar la decisión de negocio. Pretende **hacer explícito y confiable el insumo técnico** de esa decisión, y **proporcionarlo al nivel de riesgo del cambio**: más evidencia para lo peligroso, menos ceremonia para lo trivial.

---

## 2. Antes de seguir: glosario mínimo

- **Gate técnico.** Regla automatizada que evalúa evidencia y decide bloquear / permitir / mandar a revisión.
- **Decisión de release.** Acto humano-organizacional que incorpora negocio, timing, cumplimiento y apetito de riesgo. El gate la *informa*.
- **Evidencia.** Resultado verificable de un control: reporte de tests, hallazgos de seguridad, reporte de accesibilidad, resultado de performance. Con integridad (hash) y ubicación (artefacto).
- **Flaky rate / tasa de intermitencia.** Proporción de ejecuciones que cambian de resultado sin un cambio relevante comprobado. Una señal *flaky* es una señal que miente.
- **Excepción (waiver).** Autorización explícita y temporal para avanzar pese a que un control no pasó, con responsable y fecha de vencimiento.
- **Rollback.** Volver a la versión anterior conocida-buena. Un gate que autoriza sin plan de rollback es media decisión.

---

## 3. La distinción que ordena todo: gate técnico ≠ decisión de release

Pongámoslo en una tabla, porque de acá se derivan casi todas las buenas decisiones de diseño:

| | Gate técnico | Decisión de release |
|---|---|---|
| **Pregunta** | ¿La evidencia requerida existe y es confiable? | ¿Asumimos este riesgo ahora? |
| **Quién** | El pipeline (automatizado) | Personas responsables (release owner, negocio) |
| **Insumo** | Controles + hallazgos + flaky rate | Salida del gate + contexto (timing, regulación, mercado) |
| **Salida** | block / allow-with-audit / review | go / no-go / go-con-mitigación |
| **Puede equivocarse por** | Umbral mal calibrado, señal flaky | Falta de contexto, presión, sesgo |

**Decisión de diseño.** El gate produce **tres** estados, no dos: `block`, `allow-with-audit` y `review` (revisión humana). El tercero es el que salva del anti-patrón binario: cuando la *señal* no es confiable, el gate no debe fingir certeza; debe pedir un humano.

> **Hecho a tener presente.** Un gate técnico verde **no** equivale a cumplimiento regulatorio, legal ni de negocio. Confundirlos es peligroso en un producto financiero. Cualquier referencia a estándares (PCI DSS, OWASP, etc.) es informativa y no es asesoramiento de cumplimiento; validá jurisdicción y versión con la fuente oficial.

---

## 4. Proporcionalidad: exigir según el riesgo

"Proporcional" significa que el gate le pide a cada cambio la evidencia que su riesgo justifica. Un cambio de copy en un tooltip no debería requerir lo mismo que un cambio en el cálculo de comisiones de una transferencia.

Una forma simple y honesta de clasificar el riesgo de un cambio:

| Nivel | Ejemplo (Nexo, ficticio) | Controles requeridos (ilustrativos) |
|---|---|---|
| **Bajo** | Texto de ayuda, estilos | Lint + unit afectados |
| **Medio** | Nuevo campo opcional en el detalle | Unit + API afectada + contrato si toca esquema |
| **Alto** | Cambio en idempotencia o autorización | Unit + API (incl. negativos) + contrato + E2E crítico + seguridad |

**¿Cómo sabe el gate el nivel de un cambio?** Opciones, con trade-offs:

- **Por rutas tocadas (paths).** Si el PR modifica `src/payments/idempotency/**`, es *alto*. *Costo:* mantener el mapeo. *Ventaja:* objetivo y auditable.
- **Por etiqueta declarada.** El autor marca `risk:high`. *Costo:* depende de honestidad/criterio humano. *Ventaja:* captura riesgo no evidente en el path.
- **Combinado (recomendado).** El path fija un piso; la etiqueta solo puede *subir* el nivel, nunca bajarlo. *Costo:* un poco más de lógica. *Ventaja:* difícil de eludir sin dejar rastro.

*Anti-patrón:* dejar que una etiqueta *baje* el riesgo para "pasar rápido". Es el equivalente a desactivar la alarma para no escuchar el ruido.

---

## 5. El gate como código: del esqueleto al detalle

Retomemos el esqueleto del pilar y desarrollémoslo. **Es pseudocódigo ilustrativo, no una librería.**

```text
function releaseDecision(change, evidence, riskProfile):
  required = requiredControls(change, riskProfile)
  missing  = required - evidence.passingControls

  # 1) Evidencia faltante -> bloqueo con detalle accionable
  if missing is not empty:
    return block("Falta evidencia: " + missing)

  # 2) Seguridad crítica sin excepción -> bloqueo
  if evidence.hasSecurityFinding("critical") and not approvedWaiverFor("critical", change):
    return block("Hallazgo crítico sin excepción aprobada")

  # 3) Señal poco confiable -> revisión humana (ni block ni allow)
  if evidence.flakyRate > riskProfile.maxFlakyRate:
    return review("La señal de regresión no es confiable (flaky > umbral)")

  # 4) Todo en regla -> permitir dejando rastro
  return allowWithAuditTrail({
    change_sha: change.sha,
    controls: evidence.passingControls,
    waivers: activeWaivers(change),
    decided_at: now(),
  })
```

**Bloque por bloque.**
1. `requiredControls` es la función de proporcionalidad de §4. `missing` es la brecha exacta; el bloqueo devuelve *qué falta*, no un genérico "falló". Un gate que no dice qué falta genera reintentos a ciegas.
2. Un hallazgo crítico bloquea **salvo** que exista una excepción aprobada para ese hallazgo y ese cambio. La condición `not approvedWaiverFor(...)` es la que hace auditable la excepción (§6).
3. Si la propia señal es *flaky* por encima del umbral del perfil, el gate no aprueba ni bloquea: **manda a revisión humana**. Autorizar en base a una señal que miente es peor que no tener gate.
4. Al permitir, se registra un rastro con el SHA del cambio, los controles que pasaron, las excepciones activas y el momento. Sin ese rastro, "lo aprobó el pipeline" es una afirmación sin respaldo.

El flujo, en diagrama:

<figure class="diagram">
  <img src="/blog/diagrams/quality-gates-proporcionales-al-riesgo-1.svg" width="750" height="1063" alt="Diagrama: quality-gates-proporcionales-al-riesgo (1)" loading="lazy" decoding="async" />
</figure>

**Lectura.** Tres compuertas en serie, cada una con una salida negativa distinta. La clave de diseño es que **no todas las salidas negativas son iguales**: faltar evidencia es *block*, un crítico es *block*, pero una señal poco confiable es *review*. Aplanar los tres a un único "falló" es lo que produce gates que la gente aprende a saltear.

---

## 6. Excepciones auditables: el corazón de un gate sano

Un gate sin excepciones se vuelve un obstáculo que la gente rodea (desactivando checks, mergeando a mano). Un gate con excepciones *no auditables* es teatro. La salida es la **excepción registrada**:

```yaml
# docs/quality/waivers/NEXO-1421-idem.yml  (ejemplo ficticio)
waiver:
  id: "WV-2026-014"
  change: "NEXO-1421"
  control: "security:api-authz-negative"
  reason: "Falso positivo confirmado del scanner v3.2; ticket SEC-88 abierto"
  risk_accepted_by: "release-owner:payments"
  security_ack_by: "appsec-lead"
  created_at: "2026-07-09"
  expires_at: "2026-07-23"      # vence: obliga a resolver, no a olvidar
  rollback_plan: "feature-flag payments.newAuthz = off"
```

**Por qué cada campo importa.**
- `reason` obliga a articular *por qué* es aceptable —no "porque sí"—.
- `risk_accepted_by` nombra a quien asume el riesgo. La responsabilidad no puede ser anónima.
- `security_ack_by` evita que un riesgo de seguridad se auto-perdone sin que Seguridad lo vea.
- `expires_at` es el campo más importante: una excepción **sin vencimiento** es una regla nueva encubierta. El vencimiento fuerza a resolver la causa o a re-justificar.
- `rollback_plan` conecta la excepción con el plan B (§8).

**Decisión de diseño.** Las excepciones viven **como código**, versionadas y revisadas por PR, no en un chat. Un control de CI puede fallar si hay un waiver vencido, convirtiendo el olvido en una señal visible en vez de una deuda silenciosa.

*Trade-off honesto.* Este rigor cuesta fricción. En un equipo chico y de bajo riesgo puede ser sobre-ingeniería; en un producto financiero, la fricción es justamente el punto. Calibrá según tu criticidad real, no por moda.

---

## 7. El flaky rate y por qué invalida la señal

Un test *flaky* pasa y falla sin que el código relevante cambie. El daño no es solo el test roto: es que **erosiona la confianza en todo el tablero**. Cuando el equipo aprende que "a veces falla y no es nada", empieza a reintentar sin mirar, y un bug real disfrazado de flaky se cuela a producción (*anti-patrón: reintentar hasta el verde*).

Por eso el gate trata el flaky rate como una condición de *review*, no como algo a ignorar. Pero cuidado con el umbral:

> **Límite honesto.** No existe un `maxFlakyRate` universal. El umbral se deriva de una **línea base medida** en tu propio pipeline y de una política consensuada. Alguien que te da "menos de 2 %" sin preguntar por tu contexto está citando folklore.

**Cómo medirlo de forma reproducible (procedimiento, sin resultados inventados):**

```bash
# Requisitos: histórico de ejecuciones del control en CI (p. ej. últimas 200 corridas
# sobre el mismo commit base) exportado a un CSV: run_id,test_id,result,code_changed
# Entorno: cualquiera con python 3.11+; sin dependencias externas.
# Definición local: "flaky" = para un mismo (test_id, code_changed=false),
#   aparecen resultados 'pass' y 'fail' en la ventana.

python scripts/flaky_rate.py --window 200 --input runs.csv
# Salida esperada: una tabla test_id -> flaky_rate en [0,1]. NO reporto un número
# porque depende de TU histórico; ejecutá y registrá el tuyo con fecha y muestra.
```

**Qué NO hacer.** No inventes "nuestro flaky rate es 1,3 %". Si no lo mediste, la celda va vacía. La honestidad sobre lo que no sabés es parte de la evidencia.

---

## 8. Rollback: la mitad que falta de "allow"

Autorizar un release sin plan de vuelta atrás es apostar a que nada salga mal. La decisión de release debería exigir, para riesgo alto, un `rollback_plan` verificable:

- **Feature flag de apagado.** El cambio entra apagado y se enciende gradualmente; apagar es el rollback. *Costo:* complejidad de flags y limpieza posterior. *Ventaja:* rollback en segundos sin redeploy.
- **Versión anterior conocida-buena.** Redeploy del artefacto previo. *Costo:* tiempo de deploy; cuidado con migraciones de datos irreversibles. *Ventaja:* simple si no hay estado migrado.
- **Compensación / reversa.** Para operaciones ya efectuadas (una transferencia), no alcanza con "volver el código": puede hacer falta una reversa de negocio. *Costo:* diseño explícito. *Ventaja:* es lo único que aplica a efectos ya materializados.

**Decisión de diseño.** Para *Nexo Finanzas*, el cambio de idempotencia entra detrás de un feature flag, con la reversa de transferencia como red de seguridad de negocio. El gate no *ejecuta* el rollback, pero **verifica que el plan existe y está referenciado en el waiver o en la metadata del release**.

---

## 9. Anti-patrones específicos de gates

1. **Gate binario sin excepción.** *Síntoma:* la gente mergea a mano o desactiva checks. *Causa:* rigidez sin válvula. *Impacto:* el gate deja de reflejar la realidad. *Alternativa:* estado `review` + waiver auditable.
2. **Umbrales mágicos importados.** *Síntoma:* "95 % de cobertura" copiado de un blog. *Impacto:* se optimiza el número, no el riesgo. *Alternativa:* baseline propio + política.
3. **Reintentar hasta verde.** *Síntoma:* `retries: 5` en todo. *Impacto:* esconde bugs reales. *Alternativa:* cuarentena con dueño y fecha; el flaky va a `review`, no a retry infinito.
4. **Excepción sin vencimiento.** *Impacto:* regla nueva encubierta. *Alternativa:* `expires_at` obligatorio + check que falla si vence.
5. **"Verde = liberar".** *Impacto:* releases sin contexto de negocio/regulatorio. *Alternativa:* separar gate técnico de decisión de release (§3).
6. **Gate que no dice qué falta.** *Impacto:* reintentos a ciegas. *Alternativa:* mensajes accionables (`missing`).
7. **Allow sin rollback.** *Impacto:* incidentes sin salida rápida. *Alternativa:* plan de rollback verificado antes del go.

---

## 10. Conexión con Nexo Finanzas (ficticio)

En `nexo-quality-platform` (repo ficticio), el gate vive como código junto al pipeline. Estructura sugerida:

```
nexo-quality-platform/
  ci/
    gate.rules.yml        # mapa path -> nivel de riesgo -> controles requeridos
    release-decision.md   # ADR: por qué 3 estados, cómo se calcula el riesgo
  docs/quality/
    waivers/              # excepciones versionadas (una por archivo, con expires_at)
    thresholds.yml        # umbrales derivados de baseline, con fecha de revisión
  scripts/
    flaky_rate.py         # cálculo reproducible (§7)
    evaluate_gate.py      # implementación del pseudocódigo de §5
```

**Artefactos a crear (mínimo viable):**
- **ADR "gate de release de tres estados"** en `ci/release-decision.md`: registra la decisión de tener `block/review/allow`, quién puede firmar waivers y cómo se calcula el nivel de riesgo.
- **`gate.rules.yml`**: el mapeo path→riesgo→controles del §4.
- **`thresholds.yml`**: umbrales *con fecha* y una nota de cómo se midió el baseline (no valores inventados).
- **Un waiver de ejemplo** con `expires_at`, para que el equipo tenga plantilla.

**Evidencia reproducible del gate (procedimiento):**

```bash
# Prerrequisitos: python 3.11+, el reporte de evidencia del run (JSON) y gate.rules.yml
# Entorno: runner de CI o local; sin red.
python scripts/evaluate_gate.py \
  --change change.json \
  --evidence evidence.json \
  --rules ci/gate.rules.yml
# Resultado esperado: uno de {block, review, allow-with-audit} + JSON de auditoría.
# Limitación: valida la LÓGICA del gate, no la CALIDAD de los controles que lo alimentan;
#   un gate correcto sobre controles pobres sigue siendo una señal pobre.
```

Ese último comentario es central: **un gate impecable sobre controles débiles da una falsa tranquilidad impecable.** El gate ordena la decisión; no crea la calidad.

---

## 11. Qué aprendimos y próximos pasos

- "Verde" es una respuesta técnica; "liberar" es una decisión de negocio. El gate conecta ambas sin fusionarlas.
- Tres estados (`block`, `review`, `allow`) evitan el anti-patrón binario.
- La proporcionalidad hace que el rigor caiga donde el riesgo lo justifica.
- Las excepciones deben ser auditables y **vencer**; si no vencen, son reglas nuevas encubiertas.
- El flaky rate manda a revisión, no a retry; su umbral se mide, no se importa.
- `allow` sin rollback es media decisión.

**Enlaces internos:**
- Pilar: **[Arquitectura de Quality Engineering orientada a riesgo](/blog/arquitectura-quality-engineering-orientada-a-riesgo/)** (§9 introduce el gate).
- **[Datos y entornos de prueba reproducibles](/blog/datos-y-entornos-de-prueba-reproducibles/)** — sin entornos confiables, el flaky rate se dispara y el gate se vuelve inútil.
- **[Métricas y trazabilidad de calidad sin castigar personas](/blog/metricas-y-trazabilidad-de-calidad/)** — el gate produce parte de la evidencia que estas métricas consumen.

---

## 12. Checklist para tu quality gate

- [ ] ¿El gate distingue explícitamente entre estado técnico y decisión de release?
- [ ] ¿Tiene tres salidas (block / review / allow-with-audit), no dos?
- [ ] ¿Los controles requeridos son proporcionales al riesgo del cambio?
- [ ] ¿El bloqueo dice **qué** evidencia falta, de forma accionable?
- [ ] ¿Las excepciones están versionadas, con responsable, security ack y `expires_at`?
- [ ] ¿Hay un check que falla cuando un waiver vence?
- [ ] ¿El `maxFlakyRate` proviene de un baseline medido y documentado, no importado?
- [ ] ¿Una señal flaky va a `review` en vez de a retry infinito?
- [ ] ¿`allow` exige un plan de rollback referenciado para riesgo alto?
- [ ] ¿El `allow-with-audit` deja rastro (SHA, controles, waivers, timestamp)?

---

### Fuentes (consultadas 2026-07-09)

- Google SRE Book, "Service Level Objectives" (para SLO/SLA como base de decisiones). https://sre.google/sre-book/service-level-objectives/
- OWASP API Security Top 10 2023 (encuadre de hallazgos de seguridad). https://owasp.org/API-Security/editions/2023/en/0x11-t10/
- Ham Vocke, "The Practical Test Pyramid" (fragilidad de E2E y flakiness). https://martinfowler.com/articles/practical-test-pyramid.html

> *Aviso.* Un gate técnico verde no equivale a cumplimiento regulatorio, legal ni de negocio. Este contenido no es asesoramiento de cumplimiento.

