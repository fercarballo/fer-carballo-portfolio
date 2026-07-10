---
title: "DoR y DoD como acuerdos vivos: quality gates proporcionales al riesgo"
description: "Cómo escribir Definition of Ready y Definition of Done que cambian con el riesgo del cambio, con una DoD completa para una transferencia bancaria y una plantilla de pull request lista para adaptar."
pubDate: 2026-07-09
tags: ["definition-of-done", "definition-of-ready", "quality-gates", "pull-request", "riesgo", "sdet", "nexo-finanzas"]
cluster: "12"
clusterTitle: "Liderazgo y operating model de calidad"
type: "satelite"
order: 2
icon: "chat"
iconHue: 330
readingLevel: "Intermedio"
prerequisites: "conoce criterios de aceptación y PRs"
repo: "nexo-quality-platform"
---
> Artículo satélite de **"Liderar calidad sin convertirse en cuello de botella"**. Aquí bajamos a tierra dos artefactos: la Definition of Ready y la Definition of Done, y mostramos cómo evitar que se conviertan en checklists muertas. **Datos de Nexo Finanzas: ficticios.** Nada de esto es asesoramiento de cumplimiento.

## 1. El problema: la checklist que todos ignoran

Casi todos los equipos tienen una "Definition of Done". Casi ninguno la usa. El patrón es conocido: alguien la escribió hace dos años, tiene 22 ítems genéricos ("el código está testeado", "la historia está documentada"), y en la práctica cada quien la interpreta a su manera. El resultado es peor que no tener nada: da una **falsa sensación de acuerdo**.

El error de raíz es tratar la DoD como una lista **fija** en lugar de un **acuerdo proporcional al riesgo**. No tiene sentido exigir prueba de rollback y auditoría de autorización para un cambio de texto en un tooltip; tampoco tiene sentido dejar pasar una nueva ruta de transferencia con la misma DoD que ese tooltip.

La [Scrum Guide (2020)](https://scrumguides.org/scrum-guide.html) define la Definition of Done como el **compromiso** asociado al Incremento: una descripción formal del estado que debe alcanzar el trabajo para considerarse terminado. *(Hecho citado.)* Lo que la guía deja abierto —y es donde entra el criterio de ingeniería— es **cómo** hacer que ese compromiso sea útil sin ser burocrático.

> **Decisión de diseño de este artículo.** Definimos DoR y DoD como acuerdos con tres propiedades: (1) tienen dueño y fecha de revisión, (2) tienen un *núcleo común* mínimo, y (3) tienen *módulos que se activan por riesgo*.

---

## 2. Definition of Ready: el filtro de entrada

La DoR responde: *¿esta historia está lista para que la tomemos, o vamos a descubrir el problema a mitad del sprint?* Su costo es incomodidad temprana; su retorno es no frenar la implementación por ambigüedad.

**DoR — núcleo común (aplica a todo):**

- [ ] Hay un problema de usuario o negocio claro (no solo una solución).
- [ ] Los criterios de aceptación están escritos como **ejemplos verificables**.
- [ ] Se identificó el **tipo de riesgo dominante** (regla de negocio, autorización, dato, integración, performance, accesibilidad).
- [ ] Las dependencias externas están nombradas (IdP, gateway de pagos, otra squad).
- [ ] Cabe en un sprint; si no, se parte.

**Cómo escribir criterios como ejemplos.** En lugar de "el usuario puede transferir dinero", el enfoque [BDD de Cucumber](https://cucumber.io/docs/bdd/) sugiere ejemplos concretos que se convierten en verificación:

```gherkin
# Ejemplo acordado con negocio — NO es código de producción,
# es la especificación ejecutable del criterio de aceptación.
Escenario: Transferencia entre cuentas propias dentro del límite diario
  Dado una cuenta origen "AR-001" con saldo 50000.00 ARS
  Y una cuenta destino "AR-002" del mismo titular
  Y un límite diario de 100000.00 ARS con 0.00 ya consumido
  Cuando el titular transfiere 30000.00 ARS de "AR-001" a "AR-002"
  Entonces el saldo de "AR-001" es 20000.00 ARS
  Y el saldo de "AR-002" aumenta en 30000.00 ARS
  Y la operación queda registrada como idempotente con su clave
```

**Explicación por bloques.** El `Dado` fija el estado (dato ficticio); el `Cuando` es la acción única; el `Entonces` verifica **la regla de negocio** (saldos) **y** un invariante crítico de fintech (idempotencia). Un criterio así ya le dice a Dev y QA qué automatizar y dónde está el riesgo. La idempotencia se trata a fondo en el artículo 13 de la colección.

---

## 3. Definition of Done: núcleo + módulos por riesgo

Aquí está el corazón del artículo: una DoD que **crece con el riesgo**. Primero el núcleo (siempre), luego los módulos que se activan según el tipo de cambio.

### 3.1 Núcleo común (todo cambio)

- [ ] El código pasa revisión de al menos una persona distinta al autor.
- [ ] Los tests unitarios/componentes del cambio pasan en CI.
- [ ] El pipeline publica evidencia (reportes de test) como artefacto ([GitLab `artifacts:reports`](https://docs.gitlab.com/ci/yaml/artifacts_reports/)).
- [ ] El PR declara **riesgo, evidencia y plan de rollback** (ver §5).
- [ ] No se introducen secretos ni PII en el repo.

### 3.2 DoD completa para una transferencia de Nexo Finanzas (ejemplo)

Este es el caso de riesgo alto: mueve dinero. **Se activan todos los módulos.** Es un ejemplo completo pero acotado; adaptalo, no lo copies como norma universal.

```markdown
## Definition of Done — Feature: Transferencia entre cuentas propias
Riesgo dominante: regla de negocio + autorización + dato monetario (ALTO)

### 1. Reglas de negocio
- [ ] Límite diario aplicado y verificado con ejemplos límite (0, límite exacto, límite+0.01).
- [ ] Manejo de saldo insuficiente con mensaje claro y sin dejar estado a medias.
- [ ] Redondeo/decimales monetarios verificados (no hay pérdida de centavos).

### 2. Prueba de API (contrato + comportamiento)
- [ ] Contrato de la operación versionado y verificado (request/response, códigos de error).
- [ ] Idempotencia: reintento con misma clave NO duplica la transferencia.
- [ ] Casos de error mapeados (400 validación, 409 conflicto, 422 regla de negocio).

### 3. Seguridad de autorización
- [ ] La cuenta origen pertenece al titular autenticado (no se puede operar cuenta ajena).
- [ ] Prueba negativa: token de otro usuario recibe 403, no 200 ni 404 ambiguo.
- [ ] Sin exposición de datos de otra cuenta en errores. (Ver artículo 08 y OWASP ASVS.)

### 4. Accesibilidad (si el cambio toca UI)
- [ ] Flujo operable solo con teclado (foco visible, orden lógico).
- [ ] Errores anunciados a lectores de pantalla (rol/aria) según WCAG 2.2.
- [ ] Contraste de textos y estados verificado. (W3C WCAG 2.2.)

### 5. Observabilidad
- [ ] La operación emite log estructurado con id de correlación (sin PII).
- [ ] Métrica de éxito/fallo de transferencia expuesta.
- [ ] Alerta definida para tasa de fallo anómala. (Ver artículo 07.)

### 6. Documentación
- [ ] ADR si hubo una decisión no obvia (p. ej. estrategia de idempotencia).
- [ ] Changelog/nota de release con impacto para soporte.

### 7. Rollback
- [ ] Plan de rollback probado (no solo escrito): cómo revertir sin dejar
      transferencias en estado inconsistente.
- [ ] Feature flag o mecanismo de apagado rápido si aplica.
```

**Explicación por bloques.** Los módulos 1–3 son innegociables porque mueven dinero y tocan autorización. El módulo 4 (accesibilidad) **se activa solo si hay UI**: exige lo verificable de [WCAG 2.2](https://www.w3.org/TR/WCAG22/) —hoy Recomendación del W3C y también ISO/IEC 40500:2025— sin prometer "cumplimiento" (eso requiere auditoría formal). El módulo 7 pide rollback *probado*, no *escrito*: la diferencia entre un plan y una ilusión.

### 3.3 La misma DoD para un cambio de bajo riesgo

Para el tooltip del principio, la DoD colapsa al **núcleo común** más, quizá, el módulo 4 si toca UI. Activar módulos 2/3/7 ahí sería teatro de proceso: costo sin reducción de riesgo.

> **Anti-patrón desmontado:** *DoD genérica que no cambia según riesgo.* Consecuencia: o se ignora (demasiado pesada para lo trivial) o se subaplica (demasiado liviana para lo peligroso). Alternativa: núcleo + módulos activados por el "riesgo dominante" declarado en la DoR.

---

## 4. Quality gates proporcionales al riesgo

Un quality gate es el punto donde los criterios se **verifican de forma automática** para autorizar un avance. El principio es el mismo que la DoD: **proporcionalidad**.

<figure class="diagram">
  <img src="/blog/diagrams/dor-dod-acuerdos-vivos-quality-gates-por-riesgo-1.svg" width="913" height="442" alt="Diagrama: dor-dod-acuerdos-vivos-quality-gates-por-riesgo (1)" loading="lazy" decoding="async" />
</figure>

| Nivel de riesgo | Gates que se activan | Costo |
|---|---|---|
| Trivial (texto/UI menor) | Núcleo | Minutos |
| Cambio de API | Núcleo + contrato | Requiere contrato versionado |
| Autorización/datos | Núcleo + pruebas negativas de acceso | Diseñar casos negativos |
| Monetario | Todo lo anterior + idempotencia + rollback probado | Alto, justificado |

> **Trade-off.** Gates más estrictos dan más confianza y más lentitud. La proporcionalidad es la forma de no pagar la lentitud donde no compra confianza. **Cuándo NO usar un gate estricto:** en cambios reversibles de bajo impacto, donde el costo del gate supera el costo esperado del fallo.

---

## 5. Plantilla de pull request (lista para adaptar)

La plantilla convierte "confía en mí" en "acá está la evidencia". Va en `.github/pull_request_template.md`.

```markdown
## Contexto
<!-- Qué problema resuelve y por qué ahora. Link a la historia. -->

## Riesgo
- Tipo de riesgo dominante: [ ] negocio  [ ] autorización  [ ] datos
  [ ] integración  [ ] performance  [ ] accesibilidad  [ ] trivial
- Qué podría salir mal si esto falla en producción:

## Evidencia
<!-- Reportes de test, logs de ejecución, capturas SANEADAS.
     No pegar secretos, tokens, PII ni datos bancarios reales. -->
- Resultado de CI (link al pipeline / artefacto):
- Verificaciones manuales hechas (con entorno y versión):

## Pruebas omitidas (con motivo)
<!-- Honestidad > apariencia. Qué NO se probó y por qué. -->
- 

## Impacto de rollout
- Feature flag: [ ] sí  [ ] no  ->
- Migraciones de datos: [ ] sí  [ ] no  ->
- Comunicación a soporte/negocio necesaria: [ ] sí  [ ] no

## Rollback
- Cómo se revierte y en cuánto tiempo:
- ¿Se probó el rollback? [ ] sí  [ ] no
```

**Por qué la sección "Pruebas omitidas" es la más importante.** Premia la honestidad sobre la apariencia. Un PR que declara "no probé el caso de concurrencia por falta de entorno" es más confiable que uno que finge cobertura total. Esto conecta con el aprendizaje seguro del pilar: si el sistema castiga declarar lo que falta, la gente deja de declararlo.

> **Anti-patrón desmontado:** *documentación que solo narra pasos y no decisiones.* Un PR que dice "agregué el endpoint" no enseña nada; uno que dice "elegí idempotencia por clave de cliente en vez de por hash del payload porque el cliente puede reintentar con timestamps distintos" deja una decisión trazable.

---

## 6. Límites y honestidad

- Una DoD **no** garantiza ausencia de bugs; reduce la probabilidad de clases conocidas de fallo. Prometer "cero bugs" es deshonesto.
- Cumplir WCAG en la DoD **no** equivale a un certificado de accesibilidad ni de cumplimiento legal; delimitá jurisdicción y versión, y aclará que no es asesoramiento legal.
- Los gates automáticos verifican lo que sabés expresar como prueba. El riesgo que nadie anticipó no lo atrapa ningún gate; para eso está la observabilidad y el triage (artículos 3 y 7).

---

## Qué aprendimos y próximos pasos

- La DoR filtra ambigüedad **antes** de implementar; la DoD define "terminado" **según el riesgo**.
- Núcleo común + módulos activados por riesgo evita las dos fallas: checklist ignorada y checklist insuficiente.
- El PR es el lugar donde la evidencia y la honestidad se vuelven trazables.

**Enlaces internos (misma colección):**
- [Pilar — Liderar calidad sin convertirse en cuello de botella](/blog/liderar-calidad-sin-ser-cuello-de-botella-operating-model/) — §4 y §5.
- [Artículo 3 — Triage de defectos sin culpables](/blog/triage-defectos-sin-culpables-taxonomia-fallos/) — qué hacer cuando un gate falla.
- [Artículo 4 — Métricas de calidad que enseñan](/blog/metricas-de-calidad-que-ensenan-y-que-danan/) — cómo medir sin gamificar la DoD.

**Otras colecciones del blog:**
- [02 — API contract testing y sistemas distribuidos](../02-api-contract-testing-y-sistemas-distribuidos/)
- [08 — Seguridad y threat modeling para QA](../08-seguridad-y-threat-modeling-para-qa/)
- [09 — Accesibilidad como calidad](../09-accesibilidad-como-calidad/)
- [13 — Quality Engineering en fintech](../13-quality-engineering-en-fintech/)

## Conexión con el portfolio Nexo Finanzas

Repos: `nexo-transfer-api`, `nexo-web-banking-e2e`. Archivos:

```text
docs/quality/definition-of-ready.md
docs/quality/definition-of-done.md
.github/pull_request_template.md
docs/adr/0002-estrategia-de-idempotencia.md
```

## Fuentes

- The Scrum Guide (2020) — Definition of Done: <https://scrumguides.org/scrum-guide.html>
- Cucumber — BDD: <https://cucumber.io/docs/bdd/>
- GitLab — `artifacts:reports`: <https://docs.gitlab.com/ci/yaml/artifacts_reports/>
- W3C — WCAG 2.2: <https://www.w3.org/TR/WCAG22/>

## Checklist final para el lector

- [ ] Tu DoD tiene un núcleo común y módulos que se activan por riesgo.
- [ ] La DoR obliga a declarar el riesgo dominante antes de empezar.
- [ ] Tu plantilla de PR incluye "pruebas omitidas con motivo".
- [ ] Los gates monetarios exigen rollback **probado**, no escrito.
- [ ] Ningún ejemplo usa datos reales ni promete cumplimiento.

