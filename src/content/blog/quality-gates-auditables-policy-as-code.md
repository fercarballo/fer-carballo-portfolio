---
title: "Quality gates auditables: policy-as-code y quién decide el release"
description: "Diseñá quality gates auditables con policy-as-code: controles por riesgo, excepciones con owner y vencimiento, y una release decision trazable y honesta."
pubDate: 2026-07-09
tags: ["quality-gates", "policy-as-code", "release-engineering", "governance", "ci-cd"]
cluster: "04"
clusterTitle: "CI/CD y continuous quality"
type: "satelite"
order: 2
icon: "infinity"
iconHue: 200
readingLevel: "Intermedio–Avanzado"
prerequisites: "(QE, EM, release owners). Requiere haber leído el pilar de Continuous Quality."
---
> **Advertencia de uso.** Los ejemplos de política (`release-policy.yml`) y scripts son **ilustrativos**. La estructura, los nombres de controles y los responsables dependen de tu organización. Validá cualquier automatización contra tu plataforma antes de usarla. Nada acá constituye asesoramiento legal ni de cumplimiento.

*Este artículo es un satélite de [Continuous Quality: pipeline de evidencia proporcional al riesgo](/blog/continuous-quality-pipeline-basado-en-riesgo/). Asumo que ya distinguís CI, entrega/despliegue continuo y release decision.*

## Resumen ejecutivo

- Un **quality gate** binario y opaco ("rojo/verde" sin explicación) genera más daño que valor: no dice qué riesgo cubre, quién es dueño, ni cómo recuperarse.
- La alternativa es **policy-as-code**: una política **versionada y revisada en PR** que declara, por clase de cambio, qué controles son requeridos.
- El gate técnico **no** es la release decision. El gate dice "los controles requeridos pasaron"; alguien —el *release owner*— decide liberar, a veces con contexto no automatizable.
- Las excepciones (bypass legítimo) deben tener **responsable, mitigación, plan de rollback, fecha de expiración y registro auditable**. Una excepción que no vence es deuda oculta.
- El script que evalúa el gate no puede ser una caja negra: debe **leer la política** y explicar su decisión.

---

## 1. El problema: el gate que nadie entiende

En Nexo Finanzas (ficticia; datos sintéticos), el pipeline tiene un job final `quality_decision` que "a veces pone rojo". Cuando bloquea un merge urgente, alguien con permisos lo *skipea* manualmente. Nadie registra por qué. Dos semanas después, un incidente en el flujo de transferencias revela que ese *skip* saltó justamente el control de autorización.

El problema no es que exista un bypass —los bypass legítimos existen—. El problema es que el gate era **opaco** (no explicaba qué controlaba) y el bypass era **invisible** (sin responsable, sin mitigación, sin vencimiento). Un gate así no ayuda a decidir: solo traslada la decisión a quien tenga permisos, sin dejar rastro.

Un buen gate responde cuatro preguntas en todo momento:

1. **¿Qué controles requiere esta clase de cambio?**
2. **¿Cuáles pasaron, cuáles no y con qué evidencia?**
3. **Si se saltó uno, quién lo aceptó, con qué mitigación y hasta cuándo?**
4. **¿Quién toma la decisión final de release y qué contexto no automatizable consideró?**

---

## 2. Policy-as-code: la política vive en el repositorio

La idea central: **la política de gates es código**, versionada, revisada en PR y auditable en el historial de Git. Retomamos el ejemplo del encargo y lo explicamos por bloques.

```yaml
# docs/quality/release-policy.yml  (ILUSTRATIVO)
version: 1
change_classes:
  critical_transfer_flow:
    description: "Cambios que tocan el flujo de dinero (transferencias)."
    required_controls:
      - unit
      - api
      - contract
      - security_authorization
      - integration_smoke
    exception:
      requires: [release_owner, security_owner]   # doble aprobación
      expires_after: "7d"                          # la excepcion vence
      evidence: [risk_acceptance_id, mitigation, rollback_plan]
  documentation_only:
    description: "Solo documentación; sin impacto en runtime."
    required_controls:
      - markdown_lint
      - link_check
```

**Lectura por bloques:**

- **`change_classes`.** El gate no trata todos los cambios igual. Un cambio de documentación no necesita los mismos controles que tocar el flujo de dinero. Clasificar por riesgo evita dos errores opuestos: sub-controlar lo crítico y sobre-controlar lo trivial (que empuja a la gente a saltarse el proceso).
- **`required_controls`.** Es la lista mínima de evidencia para esa clase. Para `critical_transfer_flow` incluye `security_authorization` (¿el cambio respeta las reglas de autorización?) y `integration_smoke` (¿el journey funciona integrado?). Estos nombres son *contratos*: cada uno debe mapear a un job/reporte real del pipeline.
- **`exception`.** Aquí está la diferencia entre un bypass legítimo y un abuso. Requiere **doble aprobación** (`release_owner` + `security_owner`), **vence** (`expires_after: 7d`) y exige **evidencia** (un id de aceptación de riesgo, la mitigación y el plan de rollback). Sin estos campos, no hay excepción: hay un agujero.

> **Decisión de diseño.** Poner la política en el repo del producto (o en `nexo-quality-platform`) permite revisarla en PR: cambiar qué controles son requeridos es, en sí mismo, un cambio que se discute y queda en el historial. Cambiar la política deja de ser un ajuste silencioso en la UI del CI.

### ¿Cómo se vincula la clase de cambio a un PR?

Opciones habituales (elegí una y documentala; es una **decisión de diseño**, no una verdad universal):

- **Etiqueta del MR** (`class:critical_transfer_flow`) puesta por quien abre el PR y revisada por el equipo.
- **Detección por rutas**: si el diff toca `src/main/java/.../transfer/`, la clase se infiere. Menos manipulable, pero requiere mantener el mapeo.
- **Vínculo a una historia/riesgo** en `nexo-quality-control-tower`: la clase viene del riesgo asociado, no del PR aislado.

Ninguna es perfecta: la etiqueta se puede olvidar; la ruta puede no capturar riesgos indirectos. Por eso el gate debe **fallar hacia lo seguro** (si no puede determinar la clase de un cambio que toca código de dominio, asume la clase más estricta).

---

## 3. El evaluador no puede ser una caja negra

El job `quality_decision` del pilar llamaba a `evaluate-quality-evidence.sh`. Ese script debe **leer la política** y **explicar** su veredicto, no esconder reglas.

```bash
#!/usr/bin/env bash
# scripts/evaluate-quality-evidence.sh  (PSEUDOCÓDIGO ILUSTRATIVO)
set -euo pipefail

POLICY="docs/quality/release-policy.yml"
CLASS="${CHANGE_CLASS:?falta CHANGE_CLASS}"     # p.ej. critical_transfer_flow
EVIDENCE_DIR="evidence/${CI_COMMIT_SHORT_SHA}"  # reportes ya publicados

# 1) Leer controles requeridos para la clase (parseo con yq, ilustrativo)
required=$(yq ".change_classes.\"${CLASS}\".required_controls[]" "$POLICY")

missing=()
for control in $required; do
  # Cada control se resuelve a un archivo de evidencia esperado.
  if ! ./scripts/check-control.sh "$control" "$EVIDENCE_DIR"; then
    missing+=("$control")
  fi
done

if [ ${#missing[@]} -eq 0 ]; then
  echo "GATE=green class=${CLASS} required=[${required//$'\n'/,}]"
  exit 0
fi

# 2) Si falta algo, ¿hay excepción vigente y aprobada?
if ./scripts/valid-exception.sh "$CLASS" "${missing[*]}"; then
  echo "GATE=green-with-exception class=${CLASS} missing=[${missing[*]}]"
  echo "  -> excepcion registrada; ver risk_acceptance_id en evidencia"
  exit 0
fi

echo "GATE=red class=${CLASS} missing=[${missing[*]}]"
echo "  -> falta evidencia y no hay excepcion valida; el cambio NO avanza"
exit 1
```

**Qué hace explícito este script (y por qué importa):**

- **Imprime la clase, los controles requeridos y qué falta.** Un rojo dice *qué* falta, no solo *que* falló.
- **Distingue `green` de `green-with-exception`.** No es lo mismo "pasó todo" que "pasó con una excepción registrada". Esa distinción debe verse en la evidencia y en las métricas.
- **La lógica vive junto a la política**, no en la mente de quien tiene permisos de admin en el CI.

**Anti-patrón a evitar:** un script que hace `exit 0` según condiciones no escritas en ninguna parte (por ejemplo, "si es viernes, no bloquear"). Si una regla existe, tiene que estar en la política versionada.

---

## 4. Tipos de gate y qué evidencia consume cada uno

No todos los gates son iguales. Conviene nombrarlos y saber **qué NO garantizan**.

| Gate | Qué verifica | Evidencia | Qué NO garantiza |
|---|---|---|---|
| Construcción | El artefacto se produce de forma reproducible | log de build, artefacto versionado | que el diseño sea correcto |
| Contrato | La API no rompe consumidores conocidos | reporte de contract testing | consumidores desconocidos o futuros |
| Seguridad (autorización) | Reglas de autorización del flujo crítico | test dedicado + reporte | ausencia total de vulnerabilidades |
| Regresión crítica | Los journeys clave siguen funcionando | JUnit failsafe (smoke) | la regresión amplia (eso va en nightly) |
| Calidad operacional | Umbrales operativos (p.ej. tamaño de imagen, healthchecks) | reporte de packaging | comportamiento bajo carga real |

> **Honestidad de alcance (fact + inferencia).** Ningún gate prueba "seguridad total" ni "cumplimiento". El gate de seguridad de autorización verifica *las reglas que modelaste*; no reemplaza una revisión de seguridad ni una auditoría. La revisión humana sigue siendo parte del sistema. Ver el satélite de [cadena de suministro](/blog/cadena-de-suministro-pipeline-sbom-slsa-provenance/) para el rol y los límites de los scanners.

---

## 5. Gate técnico vs. release decision vs. aprobación

Este es el corazón del artículo. Tres cosas distintas que un pipeline mal diseñado colapsa en una.

<figure class="diagram">
  <img src="/blog/diagrams/quality-gates-auditables-policy-as-code-1.svg" width="510" height="1036" alt="Diagrama: quality-gates-auditables-policy-as-code (1)" loading="lazy" decoding="async" />
</figure>

**Lectura del diagrama:**

- El **gate técnico** (`B`) es automatizable: compara evidencia contra política.
- La **excepción** (`D`) es el único camino legítimo para avanzar sin un control, y deja rastro.
- La **release decision** (`F`) es humana (o semi-automática con reglas fuertes) y suma contexto que el pipeline **no** puede ver: ¿es buen momento (fin de mes contable)?, ¿hay un incidente activo?, ¿hay una aprobación de negocio o de cumplimiento pendiente?

> **Consecuencia práctica.** Un gate verde **habilita** una decisión; no la reemplaza. Automatizar el paso `F` para flujos de dinero es una decisión de riesgo que debe tomarse explícitamente (ver despliegue continuo vs. entrega continua en el pilar). Para muchos flujos financieros, la entrega continua (siempre desplegable, deploy con decisión) es más apropiada que el despliegue continuo puro.

---

## 6. El ciclo de vida de una excepción

Una excepción bien gobernada tiene estados y dueños. Plantilla (los datos son sintéticos):

```yaml
# evidence/2026-07-09/release-decision.json  (fragmento ILUSTRATIVO)
{
  "commit": "abc123",
  "change_class": "critical_transfer_flow",
  "gate": "green-with-exception",
  "missing_controls": ["integration_smoke"],
  "exception": {
    "risk_acceptance_id": "RA-2026-0142",
    "reason": "Entorno efimero caido por incidente de infra; smoke no ejecutable.",
    "approved_by": ["release_owner:jdoe", "security_owner:msmith"],
    "mitigation": "Feature flag transfer_reference=off; monitoreo reforzado 24h.",
    "rollback_plan": "Desactivar flag; revertir a imagen <digest-previo>.",
    "created_at": "2026-07-09T14:00:00Z",
    "expires_at": "2026-07-16T14:00:00Z"
  }
}
```

**Reglas de gobierno:**

- **Vencimiento obligatorio.** Al expirar, el control vuelve a ser requerido. Una excepción vencida que sigue "activa" es un hallazgo de auditoría.
- **Doble aprobación** para clases críticas: quien acepta el riesgo no debería ser quien lo introdujo.
- **Mitigación + rollback** concretos, no genéricos. "Tendremos cuidado" no es una mitigación.
- **Visibilidad en métricas.** La *tasa y antigüedad de excepciones* (ver pilar, §9) sirve para **identificar deuda**, no para ocultarla. Si una clase acumula excepciones, la política o el pipeline necesitan trabajo.

> **Anti-patrón:** normalizar la excepción ("siempre skipeamos el smoke los viernes"). *Causa:* el control es demasiado lento o frágil. *Costo:* el control deja de significar algo. *Alternativa:* arreglar el control (hacerlo rápido y estable) en vez de institucionalizar el bypass.

---

## 7. Runbook: violación de gate

Cuando el gate bloquea, el equipo necesita un procedimiento, no improvisación. Plantilla:

1. **Leer el veredicto.** ¿Qué control falta? ¿Es evidencia ausente (no corrió) o control fallido (corrió y falló)?
2. **Clasificar:** ¿bug del cambio?, ¿flaky?, ¿incidente de entorno?, ¿artefacto faltante?, ¿permiso/secreto?
3. **Si es bug:** arreglar y re-push. No hay excepción para un bug real.
4. **Si es incidente de entorno** y el cambio es urgente: evaluar excepción con mitigación y rollback (§6). Registrar `risk_acceptance_id`.
5. **Si es flaky:** no reintentar hasta el verde. Marcar el test, crear ticket, decidir si el control queda temporalmente informativo (con excepción registrada).
6. **Cerrar el bucle:** ¿la política necesita ajustarse? ¿el control necesita mejorarse? Registrar el aprendizaje en `nexo-quality-control-tower`.

---

## 8. Conexión con el portfolio Nexo Finanzas

- **`nexo-quality-platform`**: hogar de `docs/quality/release-policy.yml`, los scripts `evaluate-quality-evidence.sh` / `check-control.sh` / `valid-exception.sh`, y un ADR que documente la decisión de gobierno.
- **`nexo-transfer-api`**: consume la política; sus jobs producen la evidencia (`unit`, `api`, `contract`, `security_authorization`, `integration_smoke`).
- **`nexo-quality-control-tower`**: correlaciona riesgo → control → excepción → defecto → aprendizaje; es donde se ve la deuda de excepciones.

**ADR sugerido** (`docs/adr/0002-quality-gates-policy-as-code.md`): contexto (gate opaco), decisión (política versionada + excepciones con vencimiento), alternativas descartadas (gate en UI del CI, aprobación puramente manual), consecuencias (más disciplina, política revisable, necesita mantenimiento).

---

## 9. Qué aprendimos y próximos pasos

- Un gate útil **explica**: clase, controles, faltantes, excepción y owner.
- Policy-as-code hace revisable y auditable la definición de "listo".
- La excepción es legítima **solo** si tiene responsable, mitigación, rollback y vencimiento.
- El gate habilita, pero **no reemplaza**, la release decision humana.

**Enlaces internos de la colección:**

- [Continuous Quality: pipeline de evidencia proporcional al riesgo](/blog/continuous-quality-pipeline-basado-en-riesgo/) (pilar).
- [Cadena de suministro en el pipeline: SBOM, provenance (SLSA v1.2) y firma](/blog/cadena-de-suministro-pipeline-sbom-slsa-provenance/) — para el control de seguridad y sus límites.
- [GitLab CI y Jenkins sin autoridad duplicada](/blog/gitlab-ci-jenkins-fuente-de-verdad-por-commit/) — quién ejecuta y decide el release.

## Checklist de gates auditables

- [ ] La política de gates está versionada y se revisa en PR.
- [ ] Cada clase de cambio declara sus controles requeridos.
- [ ] El evaluador lee la política y explica su veredicto (sin reglas ocultas).
- [ ] Las excepciones tienen owner, mitigación, rollback y vencimiento.
- [ ] Se distingue gate técnico, release decision y aprobación de negocio.
- [ ] La tasa/antigüedad de excepciones se mide y se usa para reducir deuda.
- [ ] Hay runbook para violación de gate con clasificación de causa.
- [ ] Ningún control promete "seguridad total" ni "cumplimiento".

---

*No constituye asesoramiento legal ni de cumplimiento. La aprobación regulatoria o de negocio puede requerir controles externos no automatizables; este artículo no los sustituye.*

