---
title: "Triage de fallos de CI con un agente que cita su evidencia"
description: "Un agente que clasifica el rojo de CI con reglas explicables: producto, entorno, dato o test, citando la línea exacta que disparó la categoría. Propone; decide un humano."
pubDate: 2026-07-15
tags: ['agentes', 'quality-engineering', 'ci-cd', 'flakiness', 'sdet']
cluster: 'g07'
clusterTitle: "Agentes para QA"
type: satelite
order: 2
readingLevel: "Intermedio"
prerequisites: "Haber leído el pilar de agentes para QA."
repo: "agent-triage-assistant"
icon: 'check'
iconHue: 88
---

> **Subtítulo:** Un agente que lee el JUnit y el log de un fallo de CI y propone una categoría —producto, entorno, dato o test— citando la línea exacta que lo llevó a esa conclusión, con un nivel de confianza y una salida para pegar en el PR. El agente propone; decide un humano.

> **Nota de alcance.** Ejemplos ilustrativos; las clasificaciones son sobre fallos sintéticos. La implementación de referencia —reglas explicables, taxonomía, salida en Markdown y JSON— vive en el repositorio [`agent-triage-assistant`](https://github.com/fercarballo/agent-triage-assistant): sin red, sin modelos, con el hook de segunda opinión mockeado. Las reglas de un triage real dependen de tu stack: tomá la taxonomía, no las regex.

---

## Resumen ejecutivo

- El rojo de CI que nadie triagea es deuda que se paga con desconfianza: cuando el tablero está siempre en rojo, el rojo deja de significar algo.
- Un agente puede hacer el primer paso mecánico —leer el JUnit y el log, y proponer una categoría— sin tocar la decisión: clasifica y explica, no cierra el bug.
- **La clasificación se hace con reglas explicables, no con un modelo opaco: cada categoría viene con la línea exacta del log que la disparó, así que un humano la confirma o la tumba leyendo una sola cita.**
- La confianza es parte de la salida. Cuando el agente no está seguro, no adivina: baja el nivel a "media" o "baja" y escala, con un hook para pedir una segunda opinión.
- La salida es un informe para pegar en el PR, con una sección explícita —"Decisiones que quedan en el humano"— que nombra lo que el agente deliberadamente no decidió.

Al terminar vas a poder: clasificar un fallo de CI con la taxonomía producto/entorno/dato/test, justificar por qué conviene una regla explicable antes que un modelo, definir qué hace el sistema cuando no está seguro y montar una salida de triage que sea revisable en el PR.

---

## 1. El problema: el rojo que nadie triagea

Una suite grande falla seguido, y no todos los fallos significan lo mismo. Algunos son bugs de producto reales. Otros son un runner sin memoria, una base de datos que no levantó, un dato de prueba que cambió, o un test frágil que falla uno de cada diez corridas por su cuenta. El problema no es que fallen: es que llegan todos con el mismo color y a la misma cola, y triagear a mano cuál es cuál es tedioso, repetitivo y se posterga.

Cuando se posterga lo suficiente, pasa lo peor que le puede pasar a una señal de calidad: se apaga. Un CI que está siempre en rojo no informa nada, porque el equipo aprendió a no mirarlo. El bug real se pierde en el ruido de los quince fallos de entorno que nadie clasificó. Triagear no es burocracia: es lo que mantiene vivo el significado del rojo.

Este es un trabajo mecánico en su primer paso —mirar el error, reconocer su forma, ponerle una etiqueta— y de juicio en el último —decidir qué se hace con esa etiqueta—. Es exactamente el reparto que la colección propone: el agente hace lo mecánico y presenta; el humano decide.

## 2. La taxonomía: producto, entorno, dato, test

Antes de automatizar nada hace falta un vocabulario de categorías, y no uno cualquiera: uno que separe fallos por su causa, no por su síntoma. La misma taxonomía que ordena un triage sin culpables sirve acá.

| Categoría | Qué significa | Quién lo dueña |
|---|---|---|
| Producto | El código bajo prueba se rompió de verdad; es un bug | Desarrollo |
| Entorno | Infra, red, runner, dependencia caída; el test no llegó a probar | Plataforma / CI |
| Dato | El dato de prueba cambió, expiró o no era el esperado | QA / dueños del fixture |
| Test | El test es frágil o está mal escrito; falla por su cuenta | Automatización |

La utilidad de separar así es directa: cada categoría tiene un dueño distinto y una acción distinta. Un fallo de producto abre un bug; uno de entorno reintenta o escala a plataforma; uno de dato refresca el fixture; uno de test manda a arreglar el test, no el producto. Confundir las categorías es mandar el trabajo a la persona equivocada. Para el método completo de clasificar sin buscar culpables, ver [Triage de defectos sin culpables](/blog/triage-defectos-sin-culpables-taxonomia-fallos/).

## 3. Por qué reglas explicables y no un modelo

La tentación es resolver esto con un modelo: darle el log a un LLM y pedirle la categoría. Para un triage que va a alimentar decisiones, es la opción equivocada, y por tres razones concretas.

- **Determinismo.** El mismo fallo tiene que clasificar igual las mil veces. Una regla lo garantiza; un modelo, no. Un triage que cambia de opinión entre corridas es un triage en el que no se puede confiar.
- **Auditable.** Cuando alguien pregunta "¿por qué esto es 'entorno'?", la respuesta tiene que ser una línea, no un encogimiento de hombros. Una regla apunta a la evidencia; un modelo devuelve una intuición que no se puede inspeccionar.
- **Cita la línea exacta.** El valor no está en la etiqueta sino en la prueba. La regla que clasificó es la que sabe qué línea del log la disparó, y esa cita es lo que vuelve la propuesta revisable en segundos.

```python
# Una regla explicable: dice qué categoría, y con qué evidencia
def clasificar(log: str) -> Hallazgo | None:
    for linea in log.splitlines():
        # patrón de infraestructura, no de producto
        if "Connection refused" in linea or "ECONNREFUSED" in linea:
            return Hallazgo(
                categoria="entorno",
                confianza="alta",
                evidencia=linea.strip(),   # la cita exacta que un humano confirma
                regla="conn-refused-01",
            )
    return None  # sin match: no adivina, escala
```

El punto no es que un modelo nunca sirva: es que la clasificación de base tiene que ser explicable, determinista y citable. El modelo, si aparece, entra como segunda opinión sobre lo que las reglas no resolvieron —nunca como el clasificador que nadie puede auditar.

## 4. La confianza: qué hace cuando no está seguro

Un buen triage no finge certeza que no tiene. Cada clasificación sale con un nivel de confianza, y el nivel cambia lo que el sistema hace con ella.

```text
   fallo ──► ¿alguna regla matchea con evidencia fuerte?
              │
      ┌───────┴────────┐
      sí               no / parcial
      │                │
  confianza alta   confianza media/baja
      │                │
  propone la       escala al humano
  categoría        + hook de segunda
  con su cita      opinión (mockeado)
      │                │
      └──────► informe con TODO explícito ◄──────┘
```

La regla de oro es que la duda se hace visible, no se esconde. Cuando ninguna regla matchea con evidencia fuerte, el sistema no elige la categoría más probable y sigue: baja la confianza y escala. Ahí entra el hook de segunda opinión —en la implementación de referencia está mockeado, para que el sistema corra sin red y sin modelos— que representa el lugar donde, en producción, un LLM o una persona daría el desempate. El diseño importa: el hook devuelve una sugerencia, no una decisión. La categoría final de un caso dudoso la sigue poniendo un humano.

Esto es lo contrario del agente que adivina para no quedar en blanco. Un triage que responde "no estoy seguro, mirá esto vos" es más útil que uno que clasifica todo con falsa confianza, porque el segundo devuelve a QA al punto de partida: revisar cada etiqueta porque ninguna es confiable.

## 5. La salida: un informe para el PR

El producto del agente no es una etiqueta suelta: es un informe que se pega en el PR y se lee de arriba a abajo. En Markdown para el humano, en JSON para el pipeline. Y tiene una sección que no es opcional.

```text
## Triage automático — build #4821

- test_transfer_balance   → PRODUCTO (alta)
  evidencia: AssertionError: expected 100, got 0  (línea 47)
- test_login_flow         → ENTORNO (alta)
  evidencia: ECONNREFUSED api:5432  (línea 12)
- test_report_export      → SIN CLASIFICAR (baja)
  evidencia: timeout tras 30s, sin patrón conocido

### Decisiones que quedan en el humano
- ¿test_report_export es flaky o es un bug real de performance?
- Confirmar que el ECONNREFUSED es infra y no un cambio de config del servicio.
```

Esa última sección —"Decisiones que quedan en el humano"— es la que hace honor a la regla de la casa. El agente no la incluye por modestia: la incluye porque nombrar lo que deliberadamente no decidió es parte de proponer bien. Un informe que solo lista certezas esconde sus límites; uno que separa lo resuelto de lo que escala le dice al revisor exactamente dónde poner la atención.

## 6. Cómo encaja en el pipeline

El triage no vive solo: es un paso dentro del quality gate. Corre después de la suite, lee sus resultados y produce el informe que acompaña al PR, del mismo modo que cualquier otro control proporcional al riesgo se ejecuta en cada cambio. Para el marco del gate por PR, ver [Quality gate en cada pull request](/blog/quality-gate-en-cada-pull-request/).

Y se apoya en una disciplina previa: para clasificar bien un fallo hay que saber leer una traza y distinguir un flaky de un bug con método, no con corazonada. Ese trabajo —el que el agente automatiza en su primer paso— está desarrollado en [Diagnosticar un test flaky con trazas](/blog/diagnosticar-test-flaky-con-trazas-metodo-evidencia/). El agente no inventa el método: lo aplica a escala y cita su evidencia, para que el humano confirme rápido y decida.

> La implementación —taxonomía, reglas explicables citando la línea, niveles de confianza, hook mockeado y salida Markdown más JSON— está en [`agent-triage-assistant`](https://github.com/fercarballo/agent-triage-assistant). Para el marco conceptual de por qué el agente propone y el humano decide, volvé al pilar [Agentes para QA](/blog/agentes-para-qa-propone-evidencia-humano-decide/).
