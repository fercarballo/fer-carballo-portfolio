---
title: "Postmortem sin culpas y antipatrones: cómo liderar seguridad desde Quality Engineering"
description: "Un incidente simulado en la API ficticia Nexo Finanzas, su postmortem blameless, los antipatrones de seguridad que más daño hacen en QA y cómo institucionalizar la práctica en un equipo."
pubDate: 2026-07-09
tags: ["postmortem", "blameless", "liderazgo-tecnico", "antipatrones", "security-theater", "quality-engineering"]
cluster: "08"
clusterTitle: "Seguridad y threat modeling para QA"
type: "satelite"
order: 4
icon: "shield"
iconHue: 0
readingLevel: "Intermedio–Avanzado"
prerequisites: "líderes técnicos / SDET senior / QA managers"
---
> **Artículo satélite.** Cierra la colección. El marco está en el [pilar](/blog/threat-modeling-para-qa-api-transferencias/); las pruebas en el [satélite técnico](/blog/bola-bfla-idempotencia-pruebas-negativas-api/); el pipeline en el [de quality gates](/blog/quality-gates-seguridad-cicd-proporcionales/). Acá tratamos lo más difícil de automatizar: **aprender de un fallo sin buscar culpables y sostener la práctica en el tiempo.**

> **Alcance.** El incidente es **simulado** sobre **Nexo Finanzas** (ficticio, datos sintéticos). No describe una brecha real, no expone datos de nadie y no es asesoramiento legal ni de respuesta a incidentes. Es un ejercicio de aprendizaje.

---

## Por qué el liderazgo es la parte que no se puede tercerizar a una herramienta

Podés comprar el mejor escáner del mercado, montar el gate más elegante y escribir pruebas de autorización impecables. Nada de eso te salva de la falla más común: que **la práctica no se sostenga**. Que el threat modeling sea una reunión que ocurrió una vez, que las excepciones se acumulen, que después de un incidente el equipo aprenda a esconder errores en vez de a prevenir clases enteras de ellos.

Esa parte —cultura, ritual, aprendizaje— es responsabilidad de liderazgo técnico, y un QA senior está en una posición privilegiada para ejercerla, porque vive en la intersección entre producto, riesgo y evidencia.

Este artículo la aborda con tres piezas: un **incidente simulado con postmortem sin culpas**, un catálogo de **antipatrones** con causa/daño/alternativa, y un modelo para **institucionalizar** la práctica.

---

## Parte 1 — Un incidente simulado (Nexo Finanzas)

> **Recordatorio:** todo lo siguiente es ficticio y sintético. Ningún dato, persona o monto es real.

### Cronología (sintética)

- **T0.** Se despliega una nueva versión de la API de transferencias que agrega el endpoint `GET /v1/cuentas/{id}/movimientos` para alimentar una pantalla de historial.
- **T0 + 3 días.** Durante una prueba exploratoria interna con dos cuentas sintéticas, una QA nota que, autenticada como "ana-sintetica", puede leer los movimientos de "bruno-sintetico" cambiando el `id` en la URL. Es un **BOLA (API1:2023)** de manual.
- **T0 + 3 días, +2 h.** Se confirma en el entorno efímero. El control de autorización por objeto existía para *operar* la cuenta, pero **no** se aplicó al nuevo endpoint de *lectura*.
- **T0 + 3 días, +4 h.** Se despliega el fix (la verificación de dueño se agrega al endpoint de lectura) y se agrega la prueba negativa que faltaba.

**Impacto (sintético):** exposición de datos de movimientos entre cuentas sintéticas en un entorno de prueba. Cero dinero real, cero PII real. En un sistema productivo, un BOLA así sería fuga de datos financieros.

### Lo que hace a esto instructivo

El bug no fue "no sabíamos de autorización". El control existía. El fallo fue que **una superficie nueva (el endpoint de lectura) no heredó el control**, y **no existía una prueba negativa** que lo verificara. Es el patrón real de la mayoría de los BOLA: no ignorancia, sino una verificación que faltó en un lugar nuevo.

---

## Parte 2 — El postmortem sin culpas

Un postmortem *blameless* parte de una premisa: **las personas actúan razonablemente con la información y las herramientas que tienen en el momento**. Cuando algo falla, la pregunta no es "¿quién se equivocó?" sino "¿qué del sistema hizo que este error fuera fácil de cometer y difícil de detectar?". Buscar culpables garantiza que la próxima persona esconda el próximo error.

### Plantilla de postmortem (llenada con el incidente)

```markdown
# Postmortem PM-2026-03 — BOLA en endpoint de movimientos (SIMULADO)

## Resumen
Un endpoint de lectura nuevo no aplicó la autorización por objeto existente,
permitiendo leer movimientos de una cuenta ajena (sintética) cambiando el id.
Detectado en prueba exploratoria interna; corregido el mismo día.

## Impacto
Exposición de datos sintéticos entre cuentas de prueba. Sin dinero ni PII real.

## Línea de tiempo
- T0: deploy del endpoint.
- T0+3d: detección en exploratoria.
- T0+3d +4h: fix + prueba negativa agregada.

## Qué funcionó
- La prueba exploratoria con dos identidades distintas atrapó el problema.
- El entorno efímero permitió confirmar sin tocar datos reales.

## Qué falló (del sistema, no de las personas)
- El control de autorización no era transversal: se aplicaba por endpoint,
  no por una capa común, así que una superficie nueva pudo quedar sin cubrir.
- No existía una prueba negativa de BOLA para endpoints de lectura nuevos;
  la plantilla de "Definition of Done" no la exigía.

## Causas raíz (5 porqués, resumido)
El endpoint quedó sin autorización → porque el control se implementa por
endpoint → porque no hay un middleware/capa común → porque nunca se decidió
centralizarlo → porque no había un incidente que lo forzara. (Ahora sí.)

## Acciones (con dueño y fecha)
- [ ] AC-1: agregar prueba negativa de BOLA a la plantilla de DoD de todo
      endpoint que exponga objetos. Dueño: QA lead. Fecha: T0+10d.
- [ ] AC-2: evaluar centralizar la autorización por objeto en una capa común
      (ADR). Dueño: backend lead. Fecha: T0+20d.
- [ ] AC-3: agregar al threat model del journey la superficie "endpoints de
      lectura". Dueño: squad. Fecha: T0+15d.

## Qué NO hicimos
No asignamos culpa individual. El objetivo es que la clase de error sea
difícil de repetir, no señalar a quien escribió el endpoint.
```

### Las decisiones de liderazgo detrás de la plantilla

1. **"Qué falló" habla del sistema, no de personas.** "El control no era transversal" es accionable; "Fulano se olvidó" no lo es y envenena la cultura.
2. **Las acciones atacan la *clase* de error, no la instancia.** Arreglar este endpoint es obligatorio pero insuficiente. La acción valiosa (AC-1, AC-2) evita el *próximo* BOLA en un endpoint que todavía no existe.
3. **Cada acción tiene dueño y fecha.** Un postmortem sin acciones con dueño es el mismo antipatrón que la sesión de threat modeling sin backlog: catarsis sin cambio.
4. **Se registra qué funcionó.** El postmortem no es solo autopsia; la exploratoria con dos identidades y el entorno efímero funcionaron y hay que reforzarlos.

> **Distinción honesta:** este postmortem no "cierra el riesgo de BOLA para siempre". Reduce la probabilidad de esta clase de fallo y mejora la detección. Ninguna acción elimina un riesgo; lo gestiona. Prometer lo contrario es deshonestidad técnica.

---

## Parte 3 — Catálogo de antipatrones (causa, daño, alternativa)

Estos son los patrones que más veces vi convertir una buena intención de seguridad en teatro. Cada uno con su antídoto concreto.

**1. Ejecutar un escáner y declarar el producto seguro.**
- *Causa:* se confunde "corrí una herramienta" con "verifiqué un control".
- *Daño:* falsa confianza; los riesgos de lógica de negocio (BOLA, abuso de flujo) que ningún escáner genérico entiende quedan intactos.
- *Alternativa:* el escáner es una capa; sumale threat modeling y pruebas de autorización específicas. Reportá qué se verificó y qué no.

**2. Tratar todos los riesgos como idénticos.**
- *Causa:* ausencia de priorización por impacto × probabilidad × contexto.
- *Daño:* se gasta el mismo esfuerzo en un riesgo trivial que en uno crítico; el equipo se agota y baja la guardia donde importa.
- *Alternativa:* priorizá por contexto de negocio (ver [pilar](/blog/threat-modeling-para-qa-api-transferencias/)). "Crítico" = mueve dinero o expone PII.

**3. Probar solo autenticación y olvidar autorización por objeto/función/propiedad.**
- *Causa:* login es lo visible y fácil de probar.
- *Daño:* BOLA/BFLA/BOPLA (API1/API5/API3:2023) se escapan; son el origen de las fugas más comunes.
- *Alternativa:* por cada flujo sensible, pruebas negativas de autorización (ver [satélite técnico](/blog/bola-bfla-idempotencia-pruebas-negativas-api/)).

**4. Usar cuentas o datos productivos en automatización.**
- *Causa:* "es más realista" o "es más rápido que sembrar datos".
- *Daño:* exposición de PII, operaciones reales disparadas por tests, contaminación de datos.
- *Alternativa:* datos y cuentas **sintéticas** siempre; entorno efímero.

**5. Registrar secretos, tokens o PII como evidencia.**
- *Causa:* se vuelca el request/response crudo al reporte.
- *Daño:* la evidencia se vuelve vector de fuga.
- *Alternativa:* sanear en la capa de prueba antes de escribir cualquier reporte.

**6. Hacer rate limiting sin definir flujo, actor y recuperación.**
- *Causa:* se pone "un límite" sin modelar el flujo de negocio (API4/API6:2023).
- *Daño:* castiga usuarios legítimos (daña la experiencia) sin frenar a un abusador paciente; o no frena nada.
- *Alternativa:* definí *qué flujo* protegés, *qué actor* lo ejerce y *cómo se recupera* la experiencia legítima al pegar el límite.

**7. Aceptar falsos positivos sin dueño, fecha ni evidencia.**
- *Causa:* "es falso positivo" dicho de palabra.
- *Daño:* se repite la discusión; si era verdadero, se escapa.
- *Alternativa:* todo falso positivo es un waiver con dueño, evidencia del análisis y fecha de revisión (ver [gates](/blog/quality-gates-seguridad-cicd-proporcionales/)).

**8. Convertir una excepción de seguridad en solución permanente.**
- *Causa:* waiver sin fecha de caducidad.
- *Daño:* deuda oculta que se vuelve arquitectura de facto.
- *Alternativa:* fecha de revisión obligatoria + job que reactiva el hallazgo al caducar.

**9. Dejar el threat modeling como una reunión sin backlog, pruebas ni responsables.**
- *Causa:* se trata como evento de concienciación.
- *Daño:* la organización cree que "hace threat modeling" sin cambiar nada. Security theater puro.
- *Alternativa:* ninguna sesión termina sin fichas, dueños y al menos un criterio de aceptación verificable.

> **El hilo común de todos:** confunden **actividad** (correr una herramienta, hacer una reunión, poner un límite) con **verificación de un control**. El antídoto siempre es el mismo: atar cada actividad a un riesgo concreto y a una evidencia reproducible.

---

## Parte 4 — Cómo institucionalizar la práctica

Un incidente bien aprendido no sirve si la organización vuelve a las andadas. Cómo convertir esto en hábito:

### Definition of Ready / Definition of Done con seguridad incorporada

- **DoR** para una feature sensible: tiene journey, activos y límites de confianza identificados; pasó por (o tiene agendado) un mini threat model.
- **DoD:** tiene criterios de aceptación de seguridad, pruebas negativas de autorización donde exponga objetos/funciones, y evidencia trazable. (AC-1 del postmortem nace acá.)

### Pairing y revisión de PR con lente de seguridad

- En la revisión de PR, una pregunta fija: *"si este endpoint expone un objeto, ¿dónde está la verificación de dueño y su prueba negativa?"*. No es control de la persona; es un checklist del sistema.
- Pairing QA + backend en los primeros endpoints sensibles difunde el patrón mejor que un documento.

### Aprendizaje del equipo

- Postmortems blameless compartidos (sin datos sensibles) como material de aprendizaje.
- Rotar la facilitación del threat modeling: que no dependa de una sola persona.

### Plan incremental de 30 días (para el equipo, no solo el individuo)

- **Semana 1:** primer threat model de un journey crítico + acordar la DoD de seguridad.
- **Semana 2:** primeras pruebas negativas de autorización en CI; definir qué bloquea.
- **Semana 3:** primer postmortem de práctica (puede ser sobre un incidente simulado como este) para instalar el formato sin culpas.
- **Semana 4:** revisar waivers, medir tiempo de feedback del gate y flakiness, ajustar el ritual.

La meta no es "estar seguros" (nadie lo está); es tener una **práctica que mejora sola**: cada incidente reduce una clase de error, cada feature sensible nace modelada, cada excepción caduca.

---

## Qué aprendimos / próximos pasos

- El liderazgo —cultura, ritual, aprendizaje— es la parte de seguridad que ninguna herramienta cubre, y un QA senior está bien ubicado para ejercerla.
- Un postmortem sin culpas ataca la **clase** de error, no a la persona, y produce acciones con dueño y fecha.
- Los antipatrones comparten una raíz: confundir actividad con verificación. El antídoto es atar todo a riesgo y evidencia.
- Institucionalizar = DoR/DoD con seguridad, revisión de PR con lente de autorización, y una práctica que mejora con cada incidente.

**Repasá la colección completa:**
- **[Pilar: threat modeling para QA](/blog/threat-modeling-para-qa-api-transferencias/)**
- **[BOLA, BFLA e idempotencia](/blog/bola-bfla-idempotencia-pruebas-negativas-api/)**
- **[Quality gates de seguridad en CI/CD](/blog/quality-gates-seguridad-cicd-proporcionales/)**

---

## Checklist final

- [ ] Tus postmortems son **blameless**: "qué falló del sistema", no "quién se equivocó".
- [ ] Cada postmortem produce acciones que atacan la **clase** de error, con dueño y fecha.
- [ ] Registrás también **qué funcionó**, para reforzarlo.
- [ ] Revisaste tu práctica contra los 9 antipatrones y tenés antídoto para cada uno presente.
- [ ] La seguridad está en tu **DoR/DoD**, no como paso opcional.
- [ ] La revisión de PR incluye la pregunta de autorización por objeto/función.
- [ ] Tenés un plan de 30 días para el **equipo**, no solo para vos.
- [ ] Comunicás honestamente que la meta es gestionar riesgo, no "eliminarlo".

---

## Fuentes y vigencia

Consultadas el **2026-07-09**.

- OWASP API Security Top 10 (2023) — API1/API3/API4/API5/API6: https://owasp.org/API-Security/
- OWASP Threat Modeling Cheat Sheet (documento vivo): https://cheatsheetseries.owasp.org/cheatsheets/Threat_Modeling_Cheat_Sheet.html
- NIST SP 800-218, SSDF v1.1 (Respond to Vulnerabilities): https://csrc.nist.gov/pubs/sp/800/218/final

> *Incidente y postmortem simulados con datos ficticios. No describe una brecha real ni es asesoramiento de respuesta a incidentes. Se distinguen decisiones de Nexo Finanzas de recomendaciones de estándares.*

