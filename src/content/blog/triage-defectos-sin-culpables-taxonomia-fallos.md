---
title: "Triage de defectos sin culpables: taxonomía de fallos y runbook de incidentes"
description: "Un runbook de triage que clasifica el fallo antes de asignar culpa: producto, ambiente, datos, automatización, dependencia o flakiness, con severidad, evidencia mínima, dueño inicial y próximo paso."
pubDate: 2026-07-09
tags: ["triage", "blameless", "postmortem", "flakiness", "incidentes", "runbook", "sdet", "nexo-finanzas"]
cluster: "12"
clusterTitle: "Liderazgo y operating model de calidad"
type: "satelite"
order: 3
icon: "chat"
iconHue: 330
readingLevel: "Intermedio"
prerequisites: "gestión de defectos y CI/CD básico"
repo: "nexo-cross-channel-regression"
---
> Artículo satélite de **"Liderar calidad sin convertirse en cuello de botella"**. Aquí desarrollamos la política de triage: cómo clasificar un fallo, con qué evidencia y quién lo toma primero —sin convertir la reunión en una cacería. **Datos de Nexo Finanzas: ficticios.**

## 1. El problema: el rojo que dispara la pregunta equivocada

Son las 09:15. La suite de regresión cross-channel de Nexo Finanzas amaneció en rojo. En el canal del equipo aparece la pregunta que arruina la mañana: *"¿quién rompió la suite?"*.

Esa pregunta tiene un costo oculto. Empuja a la gente a defenderse en lugar de diagnosticar, incentiva a *no* reportar fallos propios y confunde dos cosas distintas: **quién tocó el código** y **qué tipo de fallo es**. La mayoría de las veces, la suite en rojo no es "un bug que alguien metió": es un entorno caído, un dato expirado o un test frágil.

La [cultura de postmortem sin culpa de Google SRE](https://sre.google/sre-book/postmortem-culture/) parte de un principio verificable y práctico: *un postmortem escrito sin culpa asume que todos actuaron con buenas intenciones y con la mejor información disponible*. No es indulgencia; es la condición para obtener información honesta. Un sistema que castiga al que reporta se queda ciego. *(Hecho citado.)*

> **Decisión de diseño.** El triage **clasifica el fallo antes de asignar dueño**. La primera pregunta no es "de quién es la culpa" sino "qué tipo de fallo es y cuál es el próximo paso". La accountability existe (alguien toma el caso), pero llega *después* de la clasificación, no antes.

---

## 2. Taxonomía de fallos: seis categorías, un próximo paso cada una

Un fallo rojo puede tener seis orígenes muy distintos. Confundirlos es la causa número uno de tiempo perdido: se "arregla" un test que no estaba roto, o se ignora un bug real creyendo que "es flaky".

<figure class="diagram">
  <img src="/blog/diagrams/triage-defectos-sin-culpables-taxonomia-fallos-1.svg" width="1034" height="749" alt="Diagrama: triage-defectos-sin-culpables-taxonomia-fallos (1)" loading="lazy" decoding="async" />
</figure>

| Categoría | Señal distintiva | Confusión frecuente | Próximo paso correcto |
|---|---|---|---|
| **Producto (bug real)** | Falla determinística contra un criterio de aceptación | Se descarta como "flaky" | Abrir defecto priorizado con evidencia |
| **Ambiente** | Falla al desplegar/conectar; la lógica está bien | Se "arregla" el test | Reparar entorno; el test se queda como está |
| **Datos** | Falla por dato inconsistente, expirado o compartido | Se cambia la aserción | Revisar fixtures/semillas; aislar datos |
| **Automatización** | Falla el test, no el sistema (selector frágil, espera mal puesta) | Se abre un bug de producto inexistente | Corregir el test; endurecer selector/espera |
| **Dependencia externa** | Falla un tercero (IdP, gateway de pagos) | Se culpa al equipo | Aislar con contrato/stub; reintentar/observar |
| **Flakiness** | Falla intermitente sin cambio de código | Se re-ejecuta hasta que pase (peligroso) | Cuarentena + causa raíz; es deuda, no ruido |

**El caso más peligroso** es la re-ejecución compulsiva del flaky: "corré de nuevo, seguro pasa". A veces esconde un bug de concurrencia real. La cuarentena (aislar el test para que no bloquee, pero *sí* siga corriendo y midiéndose) es la alternativa honesta; la re-ejecución silenciosa entierra información.

---

## 3. Tabla de triage: severidad, evidencia mínima, dueño inicial, próximo paso

Este es el artefacto central del artículo. Va en `docs/runbooks/incident-triage.md` y se usa en vivo durante el triage. Las severidades son **ilustrativas** y deben calibrarse por equipo.

| Severidad | Impacto (ejemplo Nexo, ficticio) | Evidencia mínima para clasificar | Dueño inicial | Próximo paso / SLA orientativo |
|---|---|---|---|---|
| **S1 — Crítico** | Transferencias fallando o dinero en estado inconsistente en prod | Log con id de correlación + request/response saneados + timestamp | On-call + líder técnico | Mitigar ya (flag/rollback); postmortem obligatorio |
| **S2 — Alto** | Login degradado; una dependencia caída afecta un flujo | Traza del error + estado de la dependencia | Dueño del flujo afectado | Workaround + arreglo priorizado |
| **S3 — Medio** | Bug funcional sin pérdida monetaria; hay alternativa | Pasos reproducibles + entorno/versión/commit | Dev del área | Backlog priorizado |
| **S4 — Bajo** | Cosmético; texto; caso borde raro | Captura saneada + descripción | Quien lo detecta | Agrupar en limpieza |
| **Flaky** | Test intermitente que bloquea el pipeline | Historial de ejecuciones (pasa/falla sin cambio) | Dueño de la suite | Cuarentena + ticket de causa raíz |

**Regla de evidencia mínima:** sin la evidencia de la columna, el ítem **no se clasifica** —se pide la evidencia. Esto evita el triage basado en impresiones. Y la evidencia va **saneada**: nunca PII, credenciales, tokens, endpoints internos ni datos bancarios reales en un ticket.

---

## 4. El runbook de triage en vivo (10 minutos, no una hora)

```text
RUNBOOK — Triage de fallos (docs/runbooks/incident-triage.md)

1. CLASIFICAR (no culpar)
   - ¿Reproducible al reintentar? -> si no, Flakiness.
   - ¿Dónde está la causa? -> producto / ambiente / datos / automatización / dependencia.
   - Registrar categoría + severidad + evidencia mínima.

2. ASIGNAR DUEÑO INICIAL
   - Según la tabla. El dueño NO es "el que rompió"; es quien mejor
     puede dar el próximo paso.

3. DECIDIR PRÓXIMO PASO
   - Mitigar (S1/S2) / defecto (S3/S4) / cuarentena (flaky).
   - Un solo próximo paso claro por ítem.

4. REGISTRAR
   - Ticket con id de correlación, entorno, versión/commit.
   - Si S1/S2: agendar postmortem blameless.

5. CERRAR EL BUCLE
   - Postmortem con causas contribuyentes (no personas) y acciones
     con dueño y fecha. Revisar acciones en la próxima retro.
```

**Por qué "dueño inicial" y no "responsable del bug".** El dueño inicial es quien mejor puede *avanzar* el caso ahora, no quien lo causó. Puede reasignarse cuando se entiende mejor. Separar "quién avanza" de "quién causó" es lo que mantiene el triage rápido y sin fricción.

---

## 5. Postmortem blameless: la plantilla mínima

Para S1/S2, un postmortem corto y honesto vale más que un informe extenso que nadie lee.

```markdown
# Postmortem — [incidente] — [fecha]
Estado: [borrador | revisado]  |  Severidad: [S1/S2]

## Qué pasó (línea de tiempo, hora local)
- HH:MM detección -> HH:MM mitigación -> HH:MM resolución.

## Impacto (medido o estimado; marcar cuál)
- Usuarios/operaciones afectadas: [dato ilustrativo si no está medido].

## Causas contribuyentes (NO personas)
- Técnica, de proceso y de detección. Preguntar "por qué" varias veces.

## Qué funcionó / qué faltó
- Detección, comunicación, rollback.

## Acciones (con dueño y fecha)
- [ ] Acción correctiva  — dueño — fecha
- [ ] Acción de detección — dueño — fecha
```

**Lenguaje que delata culpa (evitar):** "el desarrollador olvidó…", "QA no probó…". **Lenguaje contributivo (preferir):** "no existía un test que cubriera este caso", "el gate no verificaba este contrato". El primero busca un culpable; el segundo, un arreglo del sistema.

> **Anti-patrón desmontado:** *triage usado para buscar culpables.* Consecuencia: la gente deja de reportar, los flaky se re-ejecutan en silencio y la información desaparece justo cuando más se necesita. Alternativa: clasificar primero, nombrar dueño después, y escribir causas contribuyentes en vez de nombres.

---

## 6. Flakiness: la categoría que merece su propia disciplina

El flaky es especial porque **erosiona la confianza en toda la suite**. Un solo test intermitente enseña al equipo a ignorar el rojo —y el día que el rojo es real, nadie lo mira.

Manejo recomendado:

1. **Detectar:** un test que pasa y falla sin cambio de código ni de entorno.
2. **Cuarentena:** aislarlo para que no bloquee el merge, pero **manteniéndolo en ejecución** y medido. Cuarentena no es borrar.
3. **Causa raíz:** casi siempre es una de tres: espera mal puesta (timing), dependencia de orden/estado compartido, o concurrencia real del sistema (¡a veces es un bug!).
4. **Presupuesto:** definir un umbral de flakiness por suite como deuda a pagar, no como ruido a tolerar.

La **medición** de flakiness (fórmula, ventana temporal y exclusiones) se desarrolla en el artículo satélite **"Métricas de calidad que enseñan y métricas que dañan"**.

---

## 7. Límites y honestidad

- El triage clasifica con la información disponible; una clasificación puede cambiar al entender mejor el fallo. Eso es correcto, no un error.
- "Blameless" **no** significa "sin responsabilidad": significa sin castigo por reportar. Las acciones correctivas siguen teniendo dueño y fecha.
- Ningún runbook sustituye la conversación: el triage es una decisión de personas apoyada en evidencia, no un algoritmo.

---

## Qué aprendimos y próximos pasos

- Clasificá el fallo (seis categorías) **antes** de asignar dueño.
- La evidencia mínima saneada es condición para clasificar.
- El postmortem blameless escribe causas contribuyentes, no nombres.
- El flaky es deuda con disciplina propia, no ruido a tolerar.

**Enlaces internos (misma colección):**
- [Pilar — Liderar calidad sin convertirse en cuello de botella](/blog/liderar-calidad-sin-ser-cuello-de-botella-operating-model/) — §7.
- [Artículo 2 — DoR y DoD como acuerdos vivos](/blog/dor-dod-acuerdos-vivos-quality-gates-por-riesgo/) — qué hacer cuando un gate falla.
- [Artículo 4 — Métricas de calidad que enseñan](/blog/metricas-de-calidad-que-ensenan-y-que-danan/) — cómo medir flakiness.

**Otras colecciones del blog:**
- [07 — Observabilidad para Quality Engineering](../07-observabilidad-para-quality-engineering/)
- [11 — Resiliencia y chaos engineering](../11-resiliencia-y-chaos-engineering/)

## Conexión con el portfolio Nexo Finanzas

Repos: `nexo-cross-channel-regression`, `nexo-quality-control-tower`. Archivos:

```text
docs/runbooks/incident-triage.md
docs/runbooks/postmortem-template.md
CONTRIBUTING.md   # sección: cómo reportar y clasificar un fallo
```

## Fuentes

- Google SRE — Postmortem Culture (blameless): <https://sre.google/sre-book/postmortem-culture/>
- Google SRE — Service Best Practices: <https://sre.google/sre-book/service-best-practices/>
- Xray Cloud (trazabilidad de ejecuciones/defectos): <https://getxraydocs.atlassian.net/wiki/spaces/XRAYCLOUD/overview>

## Checklist final para el lector

- [ ] Tu triage clasifica antes de asignar culpa.
- [ ] Cada categoría tiene un próximo paso distinto y claro.
- [ ] Exigís evidencia mínima saneada para clasificar.
- [ ] Los flaky van a cuarentena medida, no a re-ejecución silenciosa.
- [ ] Tus postmortems escriben causas contribuyentes, no personas.

