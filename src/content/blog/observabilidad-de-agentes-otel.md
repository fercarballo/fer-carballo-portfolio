---
title: "Observabilidad de agentes: el trace como evidencia de lo que no se reproduce"
description: "Un fallo de agente no se reproduce cuando lo vas a mirar. El trace es su única evidencia: spans por turno y tool-call, OpenTelemetry para GenAI y presupuesto como SLO."
pubDate: 2026-07-15
tags: ['observabilidad', 'agentes', 'evals', 'opentelemetry', 'sdet']
cluster: 'g05'
clusterTitle: "Evaluar agentes"
type: satelite
order: 4
readingLevel: "Intermedio–Avanzado"
prerequisites: "Nociones de observabilidad ayudan."
icon: 'flask'
iconHue: 145
---

> **Subtítulo:** Por qué un agente en producción necesita observabilidad propia —cada turno y cada tool-call es un span—, cómo lo modelan las convenciones OpenTelemetry para GenAI, y por qué el trace es la única evidencia de un fallo que no se reproduce.

> **Nota de alcance.** Ejemplos ilustrativos sobre agentes ficticios. Las semantic conventions de OpenTelemetry para GenAI están en evolución al momento de escribir: los nombres de atributos que se mencionan son orientativos, revalidá contra la versión vigente de la especificación. Ejemplos de instrumentación, no configuración lista para producción.

---

## Resumen ejecutivo

- Un agente en producción no se observa como un servicio REST. La unidad no es el request: es la **trayectoria**. Cada turno del loop y cada llamada a herramienta es un **span**, y el trace completo es el recorrido que el pilar dice que hay que evaluar.
- **Un fallo de agente, por no determinista, no se reproduce cuando lo vas a mirar. El trace de la corrida que falló es la única evidencia que va a existir: si no se capturó, el bug no ocurrió a efectos prácticos.** Es el mismo rol que el trace de Playwright cumple con un test flaky.
- OpenTelemetry viene estandarizando semantic conventions para GenAI: spans de llamada a modelo, spans de herramienta y atributos de tokens y costo. Instrumentar contra un estándar abierto evita quedar preso de un vendor.
- Se instrumenta el loop completo: las decisiones, el presupuesto consumido, las escaladas a humano. No solo lo que salió mal.
- Los traces de agente pueden arrastrar datos sensibles —van adentro los prompts y las respuestas de herramientas—. La telemetría necesita su propio contrato de privacidad.

Al terminar vas a poder instrumentar un agente con spans anidados por turno y tool-call, leer un trace como evidencia de un fallo irrepetible, tratar el presupuesto como SLO y proteger la privacidad de lo que la telemetría captura.

---

## 1. El problema: el fallo que no está cuando lo vas a mirar

Un agente falla en producción. Alguien abre el caso una hora después, corre la misma tarea para reproducirlo… y sale bien. No porque se haya arreglado: porque el agente es no determinista y esta vez el camino fue otro. El fallo no está. Y sin evidencia, no hay diagnóstico posible.

Este problema no es nuevo. Es exactamente el del [testing de sistemas no deterministas](/blog/testing-sistemas-no-deterministas/), donde un test flaky falla una vez de cada veinte y no se lo puede pescar a mano. La respuesta que la disciplina ya tiene es capturar la evidencia **en el momento del fallo**, no reconstruirla después: en Playwright, eso es el trace de la corrida. En un agente, es el trace de la trayectoria. La regla de [observabilidad como evidencia explicable](/blog/observabilidad-quality-engineering-evidencia-explicable/) se traslada intacta: **lo que no se instrumentó, no ocurrió** —no hay forma de demostrarlo.

## 2. Cada turno y cada tool-call es un span

En un servicio REST, la unidad de observabilidad es el request. En un agente no alcanza: un solo pedido del usuario dispara un loop de varios turnos, y cada turno hace una o más llamadas —al modelo, a herramientas—. La estructura natural es un árbol de **spans anidados**: la sesión contiene turnos, el turno contiene la llamada al modelo y las llamadas a herramientas.

```text
 span: sesión         (agente=triage, task_id=8f21)
 ├─ span: turno 1
 │  ├─ span: llm.call      (modelo, tokens_in, tokens_out, costo)
 │  └─ span: tool.call     (nombre=buscar_orden, args, latencia, status=ok)
 ├─ span: turno 2
 │  ├─ span: llm.call
 │  └─ span: tool.call     (nombre=escribir_db, status=error)
 │     └─ evento: presupuesto_consumido = 62%
 └─ evento: escalada_a_humano   (motivo=monto > limite)
```

Ese árbol **es** la trayectoria. Leído de arriba abajo cuenta la historia completa: qué decidió el agente en cada turno, qué herramienta llamó, con qué argumentos, cuánto costó y dónde se rompió. Es la misma trayectoria que el pilar manda a evaluar, ahora capturada en vivo desde producción en vez de en una corrida de eval.

## 3. Las convenciones OpenTelemetry para GenAI

Instrumentar a mano cada framework de agentes lleva a un dialecto por equipo y a quedar preso de una herramienta. OpenTelemetry —el estándar abierto de trazas, métricas y logs— viene estandarizando **semantic conventions para GenAI**: un vocabulario común para nombrar estos spans y atributos. En líneas generales, define spans para la llamada al modelo y para la invocación de herramientas, bajo un espacio de nombres propio (del orden de `gen_ai.*`), con atributos para el modelo usado, los tokens de entrada y salida, y el costo.

La ventaja es la de cualquier contrato: instrumentás una vez contra el estándar y cualquier backend que lo entienda —el propio o el de un proveedor— sabe leer tus traces. La cautela, la de siempre en este terreno: estas convenciones están en evolución. Tomá los nombres de atributos como orientativos y revalidá contra la especificación vigente antes de fijarlos en tu pipeline; el patrón —spans anidados con tokens y costo— es estable aunque los nombres exactos todavía se muevan.

## 4. Qué se instrumenta

El error común es instrumentar solo lo que se rompió. Un agente pide más: para poder evaluar la trayectoria hay que ver también las corridas que salieron bien, porque la consistencia se mide sobre todas. Lo mínimo que un trace de agente debería llevar:

- **El loop.** Cada turno como span, con el número de paso, para poder contar cuántos tomó y detectar cuando se acerca al techo.
- **Las decisiones.** Qué herramienta eligió y con qué argumentos. Sin esto no se puede distinguir "eligió mal la herramienta" de "la herramienta falló".
- **El presupuesto consumido.** Tokens y costo acumulados por tarea, como atributo que crece turno a turno. El presupuesto es un SLO —service level objective—, y un SLO que no se mide no existe.
- **Las escaladas y paradas.** Cuándo pidió aprobación humana, cuándo se detuvo por condición de parada, cuándo se quedó sin presupuesto. Son los eventos que explican por qué una trayectoria terminó donde terminó.

## 5. De la observabilidad al eval de producción

Producción es la eval más honesta que existe: tráfico real, entornos reales, la cola larga de casos que ningún golden dataset previó. Los traces son el sustrato que la vuelve medible, y cierran el círculo de esta colección con tres prácticas:

- **Canarios.** Se enruta un porcentaje chico del tráfico a la versión nueva del agente y se comparan sus trayectorias contra la versión estable —costo, pasos, tasa de escalada, fallos de herramienta— antes de promoverla. Es la regresión contra un baseline del [pilar de evals](/blog/evaluar-agentes-trayectoria-outcome-pass-k/), corriendo en vivo.
- **Presupuestos como SLO.** El costo y la latencia por tarea que la eval trataba como requisito se vuelven alertas en producción: si el presupuesto medio se dispara, algo cambió en el comportamiento del agente aunque el outcome siga siendo correcto.
- **Muestreo de trayectorias para revisión.** No se revisan todas las corridas a mano: se muestrea —al azar y, sobre todo, sesgado hacia lo raro (escaladas, presupuestos altos, herramientas con error)— y esos traces alimentan nuevos golden tasks. La producción le escribe casos a la suite de eval.

## 6. La privacidad de los traces, y por qué esto es Quality Engineering

Un trace de agente es tentador de guardar entero, y ahí está el riesgo. Adentro van los prompts, las respuestas de las herramientas, a veces datos del usuario que el agente manejó para resolver la tarea. Un trace completo puede ser una filtración esperando pasar. Vale el mismo [contrato de telemetría: privacidad, cardinalidad y gobernanza](/blog/contrato-de-telemetria-privacidad-cardinalidad-gobernanza/) que cualquier observabilidad seria —redacción de campos sensibles, retención acotada, control de quién puede leer—, con el agravante de que el contenido acá es lenguaje natural libre, más difícil de sanitizar que un campo tipado.

Al final, esto es lo de siempre: un fallo que no se puede reproducir se diagnostica con la evidencia que se capturó, o no se diagnostica. Un agente sube la apuesta —la evidencia es toda una trayectoria, no un stack trace— pero el principio es el que la disciplina ya practica con los tests flaky. La observabilidad no es el adorno del final: es la que hace evaluable lo que en producción no se repite.

> Este satélite cierra la colección de evaluación. Para el marco completo —qué medir y por qué la consistencia se desploma—, volvé al pilar [Trayectoria, outcome y pass^k](/blog/evaluar-agentes-trayectoria-outcome-pass-k/).
