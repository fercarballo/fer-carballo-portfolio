---
title: "Code execution vs tool calls: cuándo el agente escribe código"
description: "Dos formas de que un agente actúe: N llamadas a herramientas o un bloque de código ejecutable. El trade-off honesto de auditoría, permisos, sandbox y testeo."
pubDate: 2026-07-15
tags: ['agentes', 'tool-use', 'arquitectura', 'seguridad', 'sdet']
cluster: 'g02'
clusterTitle: "Herramientas y MCP"
type: satelite
order: 3
readingLevel: "Intermedio–Avanzado"
prerequisites: "Nociones de tool use."
icon: 'braces'
iconHue: 25
---

> **Subtítulo:** Un agente puede actuar con N llamadas discretas a herramientas o escribiendo un bloque de código ejecutable. El trade-off honesto entre las dos —auditoría, permisos, composición, sandbox— y cómo se testea cada una.

> **Nota de alcance.** Ejemplos ilustrativos. El terreno se mueve rápido y las capacidades de ejecución de código de cada plataforma cambian: revalidá contra la tuya. Los porcentajes y tamaños que aparecen son ilustrativos, no benchmarks.

---

## Resumen ejecutivo

- Hay dos maneras de que un agente actúe: emitir N llamadas a herramientas discretas, o escribir un bloque de código ejecutable como acción única (el patrón CodeAct, 2024).
- **El trade-off honesto: code execution reemplaza cientos de herramientas por una y compone mucho mejor, pero cambia N tool-calls auditables por código que necesita un sandbox serio.** No es "mejor": es otro punto en la curva riesgo/expresividad.
- Regla de decisión: tool-calls para acciones discretas con efecto real, auditables y con permisos finos; code execution para transformar datos, componer, o cuando el espacio de acciones es enorme.
- El ángulo de QA cambia con el modo: una tool-call se testea como una función con contrato; un bloque de código generado se testea por su **efecto** en un entorno controlado — y por no escaparse del sandbox.

Al terminar vas a poder: elegir entre tool-calls y code execution según la tarea, nombrar el riesgo que cada modo agrega y diseñar la prueba que le corresponde a cada uno.

---

## 1. El problema: dos formas de actuar sobre el mundo

La tarea es simple de enunciar: "de estas 300 corridas de tests, dame las 5 más flaky". Hay dos maneras de que un agente la resuelva, y son arquitectónicamente distintas.

La primera: una secuencia de llamadas a herramientas discretas. El modelo pide `get_run(1)`, observa, pide `get_run(2)`, observa, y así — trescientos viajes de ida y vuelta a través del modelo antes de poder rankear. Cada llamada es un paso auditable, con sus permisos, pero el conjunto es lento y devora contexto.

La segunda: el modelo escribe un bloque de código —cargar las corridas, calcular flakiness, ordenar, devolver las cinco primeras— y ese bloque se ejecuta como *una sola* acción. Es el patrón que CodeAct (Wang et al., 2024) formalizó: el código ejecutable como espacio de acción unificado, en lugar de un catálogo de funciones que el modelo encadena de a una.

```text
  MISMA TAREA: "de estas 300 corridas, dame las 5 más flaky"

  Tool-calls (N viajes)            Code execution (1 viaje)
  ─────────────────────            ────────────────────────
  modelo → get_run(1)              modelo → ejecutar_codigo:
  obs    ← ...                       │  runs  = cargar_todas()
  modelo → get_run(2)                │  flaky = rankear(runs)
  obs    ← ...                       │  return flaky[:5]
  ...  (300 veces)  ...            obs    ← [5 resultados]
  modelo → rankear(...)
     · auditás cada paso            · auditás el efecto final
     · permiso por herramienta      · corre dentro de un sandbox
```

## 2. El trade-off honesto

Code execution tiene dos ventajas grandes y reales.

- **Reemplaza cientos de herramientas por una.** En vez de exponer un catálogo enorme —que, como se ve en el pilar, es contexto que el modelo tiene que leer y entre el que se puede confundir—, se expone un intérprete y una API. El modelo escribe contra esa API el código que necesita. El catálogo deja de crecer.
- **Compone de forma nativa.** Loops, condicionales, variables intermedias, combinar tres fuentes en un paso: todo eso es lenguaje de programación, no una cadena de tool-calls con un viaje al modelo por cada eslabón. Donde componer con herramientas cuesta N turnos, el código compone en uno.

Y tiene un costo que no conviene maquillar. **Cambia N tool-calls auditables por un bloque de código que necesita un sandbox serio.** Cada tool-call era una acción con nombre, argumentos y permiso propio, registrada de a una. Un bloque de código es opaco a esa granularidad: puede hacer todo lo que el entorno le permita, y la única defensa real es el aislamiento del entorno donde corre. Correr código generado sin sandbox es correr código no revisado en tu máquina (ver [Sandbox y permisos para agentes](/blog/sandbox-y-permisos-para-agentes/)). No es un modo "mejor": es más expresivo y más peligroso a la vez.

## 3. Cuándo conviene cada uno

La decisión no es de gusto; la dicta la naturaleza de la acción.

Conviene **tool-calls** cuando:

- La acción es discreta y tiene efecto real e irreversible: mandar un mail, abrir un issue, cobrar. Cada una merece ser su propio gate, con su permiso y su registro.
- La auditabilidad por acción es un requisito, no un lujo — cuando alguien va a preguntar "¿qué hizo exactamente el agente?" y la respuesta tiene que ser una lista, no un diff de estado.

Conviene **code execution** cuando:

- La tarea es transformar datos: parsear, filtrar, agregar, reformatear. El código es la herramienta natural para eso, y forzarlo a tool-calls es traducirlo mal.
- Hay que componer muchos pasos o el espacio de acciones es enorme. "Hacele X a cada uno de estos 300 elementos" es una línea de código y trescientas tool-calls.

La línea que ordena: tool-calls donde importa *cada acción*; code execution donde importa *el resultado* y las acciones intermedias son plomería.

## 4. El ángulo QA: cómo se testea cada modo

Cambiar de modo cambia la prueba, y este es el punto que un equipo de QA no puede pasar por alto.

Una **tool-call se testea como una función con contrato**. Entrada, salida, verificación determinista: exactamente el contract testing del pilar de esta colección. Se fija el esquema, se prueban argumentos válidos e inválidos, se verifica que el proveedor honra lo que declara. Nada nuevo bajo el sol; la disciplina ya existe.

Un **bloque de código generado se testea por su efecto**, no por su texto. Y esto tiene dos consecuencias que hay que interiorizar:

- El código varía entre corridas —el modelo no escribe lo mismo dos veces— así que aseverar sobre el *código* es inútil. Lo que se asevera es el *efecto* en un entorno controlado: quedó el archivo, el CSV terminó ordenado, la fila de la base cambió al valor esperado. El oráculo mira el estado final, no las líneas.
- Hay una segunda prueba, de seguridad, que no existía con tool-calls: **el código no debe salir del sandbox**. Que no lea fuera de su directorio, que no abra red si no corresponde, que no persista más allá de su vida efímera. Eso se prueba como una regresión de seguridad, con casos que *intentan* escapar y deben fallar.

## 5. Por qué el código rinde donde hay oráculo

Hay una condición que vuelve a code execution no solo aceptable sino potente: **que exista un oráculo**. Si se puede escribir un verificador de estado —una función determinista que decide si el efecto es correcto—, entonces el modelo puede escribir código, ejecutarlo, y el verificador confirma si funcionó. El modelo propone; el test dispone. Ese bucle —generar, ejecutar, verificar el efecto— es exactamente donde el código generado brilla, porque el riesgo de que "parezca bien pero esté mal" lo corta una comprobación objetiva.

Al revés: sin oráculo, el código generado es una acción cuyo resultado nadie puede verificar barato. Ahí el modo se vuelve una apuesta, y la combinación de "expresivo" y "no verificable" es la peor de las dos. La pregunta previa a habilitar code execution no es "¿el modelo puede escribir esto?" sino "¿puedo verificar el efecto sin confiar en el modelo?".

| Aspecto | Tool-calls | Code execution |
|---|---|---|
| Auditabilidad | Cada llamada es un registro discreto | Bloque opaco: se audita el efecto, no cada paso |
| Permisos | Finos, por herramienta | Del sandbox entero, no por acción |
| Composición | N viajes al modelo, uno por eslabón | Nativa: loops y condicionales en un bloque |
| Testeo | Como función con contrato | Por efecto en entorno controlado + no escapar del sandbox |
| Riesgo | Acotado por lo que cada herramienta permite | Tan grande como lo que el sandbox permita |

## 6. Por qué esto es Quality Engineering

Elegir entre tool-calls y code execution es elegir dónde poner el punto de control. Con tool-calls, el control está en cada acción; con code execution, en el sandbox que la encierra y en el oráculo que verifica su efecto. Las dos son decisiones de calidad y de riesgo, no de comodidad. La disciplina de siempre —saber qué se verifica, con qué oráculo, y qué pasa cuando falla— es la que decide cuál corresponde. El modo más expresivo no gana por default: gana solo cuando su efecto se puede verificar y su radio de daño se puede acotar.

> Para el patrón de razonamiento donde estas acciones se insertan —el loop que decide qué hacer a continuación—, ver [Del loop ReAct al plan-and-execute](/blog/del-loop-react-al-plan-and-execute/). Y para el contrato que toda herramienta —código incluido— debe honrar, el pilar de esta colección: [De function calling a MCP](/blog/de-function-calling-a-mcp-el-contrato-de-las-herramientas/).
