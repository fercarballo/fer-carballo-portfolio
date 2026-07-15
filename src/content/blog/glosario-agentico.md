---
title: "Glosario agéntico: los términos que se usan mal"
description: "Veintitrés términos del mundo de los agentes de IA, definidos una sola vez y por su diferencia: agente vs workflow, pass@k vs pass^k, memoria episódica vs semántica, y el resto."
pubDate: 2026-07-15
tags: ['agentes', 'glosario', 'quality-engineering', 'sdet']
cluster: 'g00'
clusterTitle: "Mapa agéntico: de LLM apps a agentes"
type: satelite
order: 3
readingLevel: "Transversal"
prerequisites: "Ninguno. Es material de consulta."
icon: 'bot'
iconHue: 150
---

> **Subtítulo:** Las palabras del terreno agéntico que más se confunden, definidas por lo que **no** son. Cada entrada aclara el error común que la motiva, para que discutir arquitectura deje de ser discutir vocabulario.

> **Nota de alcance.** Definiciones operativas para uso práctico, no académicas. Donde un término tiene una fuente canónica (un paper, una spec), se la nombra; el resto son convenciones de uso corriente a mediados de 2026. Consultá el artículo que profundiza cada tema para el detalle.

---

## Resumen ejecutivo

- Buena parte de las discusiones sobre agentes son, en realidad, discusiones sobre palabras: dos personas usan "agente", "memoria" o "eval" para cosas distintas y creen que están en desacuerdo.
- Este glosario define **cada término por su diferencia**: agente frente a workflow, comando frente a evento, `pass@k` frente a `pass^k`. La diferencia es donde vive el malentendido.
- **La regla de lectura: si un término te suena obvio, leé igual el "no es" — ahí suele estar el error que arrastrás sin saberlo.**
- Está agrupado por tema para consulta, no para lectura lineal. Guardalo y volvé cuando una palabra empiece a significar dos cosas en la misma reunión.

Al terminar vas a poder usar los términos del campo sin ambigüedad y detectar cuándo una discusión es técnica y cuándo es solo de vocabulario.

---

## 1. Qué es un agente (y qué no)

**Agente.** Un sistema donde el LLM dirige su propio proceso: decide qué hacer, qué herramienta usar y cuándo terminar. *No es* cualquier cosa con un LLM adentro. Si el flujo está escrito en el código antes de correr, no es un agente.

**Workflow.** LLM y herramientas orquestados por caminos predefinidos en el código; el modelo completa pasos dentro de un flujo fijo. *No es* una versión inferior del agente: para la mayoría de las tareas es la opción correcta, más barata de testear y operar.

**Autonomía.** El grado en que el modelo —y no el código— decide el control de flujo. *No es* un booleano: es un espectro. "Es autónomo" sin decir *cuánto* no informa nada.

**Espacio de acción.** El conjunto de acciones que un agente puede tomar (las herramientas disponibles, el código que puede ejecutar). *No es* lo mismo que sus capacidades: un espacio de acción amplio mal diseñado rinde peor que uno chico y bien pensado.

## 2. Cómo actúa: herramientas y protocolos

**Tool use / function calling.** El mecanismo por el que el modelo invoca una función externa emitiendo argumentos estructurados (JSON tipado). *No es* "el modelo ejecuta código": el modelo *pide* que se ejecute; quien ejecuta es tu runtime, y ahí viven los permisos.

**MCP (Model Context Protocol).** Protocolo abierto (Anthropic, 2024) para que un agente descubra y llame herramientas, recursos y prompts de servidores externos. *No es* una librería ni un framework: es el contrato de conexión — el "USB-C de los agentes". Ver [De function calling a MCP](/blog/de-function-calling-a-mcp-el-contrato-de-las-herramientas/).

**A2A (agent-to-agent).** Protocolo (Google, 2025) para que agentes de distintas organizaciones se comuniquen entre sí. *No es* lo mismo que MCP: MCP conecta un agente con herramientas; A2A conecta un agente con otro agente.

**Code execution como acción.** El patrón donde el agente escribe código ejecutable en vez de encadenar muchas llamadas a herramientas (CodeAct, 2024). *No es* siempre mejor: cambia N tool-calls auditables por un bloque de código que necesita sandbox serio.

## 3. Cómo decide: arquitecturas

**ReAct.** El loop fundacional (Yao et al., 2022): Thought → Action → Observation, repetido hasta terminar. *No es* una arquitectura entre muchas: es la base de casi todas las demás.

**Plan-and-execute.** Un paso de planificación produce una lista de subtareas que un ejecutor recorre, replanificando al fallar. *No es* para todo: si el entorno cambia más rápido de lo que el plan se ejecuta, replanificás sin parar.

**Reflection (auto-crítica).** El agente critica su propio resultado y reintenta con esa crítica en contexto (Reflexion, 2023). *No es* confiable sin oráculo: sin una señal de verificación externa (tests, compilador, rúbrica), la "crítica" es opinión y el loop se auto-engaña.

**Multi-agente.** Varios agentes coordinados: supervisor jerárquico, handoffs entre pares, debate con juez o pizarra compartida. *No es* automáticamente mejor: rinde cuando los subagentes leen y comprimen en paralelo; falla cuando escriben estado compartido sin coordinación, y multiplica el costo (del orden de 15× tokens, según Anthropic). Ver [Multi-agente: el debate 2025](/blog/multi-agente-el-debate-2025/).

**Agentic RAG.** Recuperación de información decidida por el agente —reformula consultas, decide si buscar de nuevo, se abstiene si la evidencia no alcanza—, frente al RAG clásico de pipeline fijo. *No es* solo "RAG con más pasos": la decisión de cuándo y qué buscar pasa del código al modelo.

**Computer use.** El agente percibe la pantalla (screenshot o árbol de accesibilidad) y actúa con mouse y teclado (Anthropic, 2024). *No es* una API: opera el software como lo haría una persona, con la fragilidad que eso implica.

## 4. Qué recuerda: contexto y memoria

**Context engineering.** La disciplina de administrar qué ve el modelo en cada turno, entendiendo el contexto como un recurso finito con retornos decrecientes (Anthropic, 2025). *No es* prompt engineering renombrado: incluye qué se recupera, qué se resume y qué se descarta, no solo cómo se redacta la instrucción.

**Compaction.** Resumir el historial cuando la ventana se llena, para seguir sin perder el hilo. *No es* gratis: el resumen puede perder justo el detalle que después hace falta — por eso se testea qué información *debe* sobrevivir.

**Memoria episódica / semántica / procedural.** Tres memorias distintas: *episódica* (qué pasó), *semántica* (qué es verdad), *procedural* (cómo se hace). *No es* una sola cosa: mezclarlas produce agentes que recuerdan el evento pero olvidan la regla. Ver [Taxonomía de memoria de agentes](/blog/taxonomia-de-memoria-de-agentes/).

## 5. Cuándo para y con qué límites

**Condición de parada.** La regla que define qué significa "terminé": objetivo verificado, presupuesto agotado, sin progreso, o escalada a humano. *No es* un detalle: su ausencia fue la causa de los loops infinitos de la era AutoGPT.

**Guardrail.** Un límite que vuelve operable a un agente: permisos por herramienta, sandbox, presupuestos, aprobación humana. *No es* un clasificador de seguridad solamente: es toda restricción diseñada, y una capa nunca es la solución completa.

**HITL (human-in-the-loop).** Un punto donde el agente se detiene y pide aprobación humana antes de una acción irreversible. *No es* supervisión constante: es un gate en el lugar exacto donde el costo de equivocarse no se puede deshacer.

**Sandbox.** El entorno aislado donde el agente ejecuta acciones con efectos (contenedor, microVM, filesystem efímero). *No es* opcional cuando hay ejecución de código: correr código generado sin sandbox es correr código no revisado en tu máquina.

## 6. Cómo se mide

**pass@k vs pass^k.** `pass@k` = ¿pasa **al menos una** de k corridas? `pass^k` = ¿pasan **las k**? *No son* intercambiables: `pass@k` premia la suerte, `pass^k` mide consistencia. Para un sistema que actúa sobre el mundo, la métrica honesta es `pass^k`. Ver [Trayectoria, outcome y pass^k](/blog/evaluar-agentes-trayectoria-outcome-pass-k/).

**Trayectoria vs outcome.** El *outcome* es el estado final; la *trayectoria* es el camino que lo produjo. *No son* lo mismo: un agente puede llegar al estado correcto por un camino inaceptable (borró y recreó la base "para que cuadre"). Se evalúan los dos.

**Verificador de estado.** Una función que decide, con código, si el estado final de una tarea es correcto (existe el archivo, el CSV quedó ordenado). *No es* un juicio del modelo: es determinista, y por eso es el oráculo confiable de una eval de agente.

## 7. Cómo se rompe y cómo sobrevive

**Inyección indirecta.** El payload malicioso no viene del usuario: viene del documento, la página o el issue que el agente lee como parte de su tarea. *No es* la inyección clásica del chat: acá el atacante no le habla al agente, le habla a través de los datos que el agente consume.

**Tríada letal (lethal trifecta).** La combinación (Willison, 2025) de datos privados + contenido no confiable + un canal de salida. *No es* una vulnerabilidad puntual: es una condición de diseño — con las tres presentes, la exfiltración es esperable, y la defensa consiste en romper al menos una pata. Ver [La tríada letal](/blog/la-triada-letal-seguridad-de-agentes/).

**Agente durable / long-running.** Un agente que sobrevive a fallos, deploys y esperas humanas mediante un journal de eventos, checkpoint y resume. *No es* "un agente que tarda mucho": es uno diseñado para retomar exactamente donde quedó. Ver [Agentes durables: checkpoint y replay](/blog/agentes-durables-checkpoint-y-replay/).

**Replay determinista.** Reconstruir el estado de un agente releyendo su journal, sin volver a ejecutar las herramientas. *No es* re-ejecutar: distinguir "re-leer" de "re-ejecutar" es lo que evita duplicar efectos al reanudar.

**Idempotencia de efectos.** La propiedad de que aplicar el mismo efecto N veces produzca el mismo resultado que aplicarlo una. *No es* exclusiva de los agentes —viene de los sistemas distribuidos—, pero es la que permite reintentar una acción sin miedo a duplicarla.

> Este glosario es la contraparte agéntica del [Glosario de la serie avanzada](/blog/glosario-serie-avanzada/). Para ver los términos en acción, empezá por el pilar [De aplicaciones con LLM a agentes](/blog/de-llm-apps-a-agentes-el-espectro-de-autonomia/).
