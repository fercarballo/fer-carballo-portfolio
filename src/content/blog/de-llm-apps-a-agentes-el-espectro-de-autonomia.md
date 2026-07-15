---
title: "De aplicaciones con LLM a agentes: el espectro de autonomía"
description: "Definición operativa de agente vs workflow, cinco escalones de autonomía con sus riesgos, por qué empezar simple es la regla y el mapa completo de la serie."
pubDate: 2026-07-15
tags: ['agentes', 'quality-engineering', 'llm-evaluation', 'arquitectura', 'sdet']
cluster: 'g00'
clusterTitle: "Mapa agéntico: de LLM apps a agentes"
type: pilar
order: 1
readingLevel: "Intermedio"
prerequisites: "Haber usado un LLM vía API; nociones de testing automatizado."
icon: 'bot'
iconHue: 150
---

> **Subtítulo:** Una definición operativa de agente que se puede testear, cinco escalones de autonomía con la clase de riesgo que cada uno agrega, y el mapa de las ocho colecciones que componen esta serie.

> **Nota de alcance.** Ejemplos ilustrativos sobre sistemas ficticios. Las probabilidades de la sección 4 son un modelo simplificado con independencia asumida, no benchmarks. Las herramientas y los protocolos de este terreno cambian rápido: revalidá contra tu versión.

---

## Resumen ejecutivo

- "Agente" se volvió una palabra de goma: nombra desde un prompt con búsqueda hasta un loop autónomo que trabaja durante horas. Sin una definición operativa no se puede estimar riesgo ni elegir qué testear.
- La definición que ordena el terreno viene de "Building effective agents" (Anthropic, diciembre de 2024): en un **workflow**, el código define los caminos y el modelo completa pasos; en un **agente**, el LLM dirige su propio proceso.
- **La autonomía no es un booleano: es un espectro de cinco escalones, y lo que cambia en cada escalón es quién decide el control de flujo.**
- Cada escalón agrega una clase nueva de riesgo que el anterior no tenía. Por eso cada escalón también cambia qué se testea — y por eso QA es central en esta historia, no un apéndice.
- "Empezá simple" no es timidez: es la regla profesional. Subir de escalón se justifica con evidencia de que el actual no alcanza, no con entusiasmo.

Al terminar vas a poder: ubicar cualquier sistema con LLM en el espectro, nombrar el riesgo nuevo que aparece en cada escalón, argumentar por qué no conviene saltar escalones y navegar la serie sabiendo qué colección responde qué pregunta.

---

## 1. El problema: todo se llama "agente" y casi nada lo es

Una reunión de arquitectura cualquiera, en 2026. Alguien presenta "el agente de soporte": un prompt con búsqueda sobre la documentación. Otro menciona "el agente de reportes": tres llamadas a un modelo encadenadas por un cron. Un tercero propone "agregar un agente" que abra pull requests solo. Tres sistemas con perfiles de riesgo completamente distintos; una sola palabra para los tres.

El costo no es estético. Si todo es "agente", ninguna de las preguntas que importan tiene respuesta: ¿qué puede salir mal acá? ¿qué clase de pruebas necesita? ¿cuánto cuesta operarlo? ¿quién responde cuando actúa mal? El plan de pruebas del primer sistema es inútil para el tercero, y el presupuesto del tercero es un despilfarro para el primero.

Este artículo hace una sola cosa: fija una definición operativa y un espectro con escalones, para que "agente" vuelva a ser una palabra con contenido. El resto de la serie cuelga de este mapa.

## 2. La definición operativa: workflow vs agente

La distinción más útil publicada hasta hoy está en "Building effective agents" (Anthropic, diciembre de 2024), y entra en dos líneas:

- **Workflow:** LLM y herramientas orquestados por **caminos predefinidos en el código**. El flujo está escrito antes de ejecutar; el modelo completa pasos dentro de él.
- **Agente:** el **LLM dirige su propio proceso**: decide qué hacer a continuación, qué herramienta usar y cuándo terminar.

La pregunta que separa una cosa de la otra no es "¿usa herramientas?" ni "¿tiene varios pasos?". Es: **¿quién decide el control de flujo?** Prueba práctica: si el diagrama del sistema se puede dibujar completo antes de correrlo, es un workflow. Si el diagrama recién existe después de la ejecución —porque el modelo eligió el camino en tiempo de ejecución—, es un agente.

Para QA la diferencia es estructural. Un workflow se testea como cualquier pipeline: cada paso con sus casos, más la integración. Un agente no tiene pasos fijos que testear: tiene **trayectorias posibles**, y la unidad de evaluación cambia de "la salida de este paso" a "el comportamiento del recorrido completo".

## 3. El espectro: cinco escalones de autonomía

Entre "una llamada a la API" y "un agente que trabaja horas sin supervisión" no hay un salto: hay una escalera.

```text
 menos autonomía ◄──────────────────────────────────────────► más autonomía

 [1] LLM solo     [2] LLM +          [3] Workflow     [4] Agente      [5] Agente
     una llamada,     herramientas,      caminos fijos     acotado:        long-running:
     texto→texto      un turno           en código         loop con        sesiones largas,
                                                           límites         estado, memoria

 el código decide todo ◄───────── control de flujo ─────────► el modelo decide casi todo
```

Qué cambia al subir cada escalón:

| Escalón | Quién decide el control de flujo | Qué se testea | Riesgo nuevo que aparece |
|---|---|---|---|
| 1. LLM solo | El código: una llamada, una respuesta | Calidad de la salida (evals de texto) | Alucinación; formato inválido |
| 2. LLM + herramientas (un turno) | El código invoca; el modelo elige herramienta y argumentos una vez | Selección de herramienta; validez de argumentos | Efectos: la llamada equivocada ejecuta algo real |
| 3. Workflow | El código: caminos predefinidos; el modelo llena pasos | Cada paso aislado + la integración | Propagación: el error de un paso contamina los siguientes |
| 4. Agente acotado | El modelo, dentro de límites (presupuesto, herramientas, condición de parada) | Trayectorias; condición de parada; uso de presupuesto | No terminar: loops, divagación, costo sin techo |
| 5. Agente long-running | El modelo, a través de sesiones con estado persistente | Durabilidad; replay; idempotencia de efectos; memoria | Estado corrupto que sobrevive; deriva del contexto; superficie de seguridad acumulada |

Los escalones 1 a 3 comparten una propiedad tranquilizadora: el flujo pertenece al código. El modelo puede equivocarse, pero el error queda contenido en el paso donde ocurrió, y las técnicas de testing conocidas —más evals para las salidas— alcanzan. La primera frontera seria aparece en el escalón 2: el modelo ya no solo *dice*, también *hace*. Una respuesta mala se descarta; una llamada mala a una herramienta con efectos ya ocurrió.

Del escalón 3 al 4 se cruza la línea de la definición: el control de flujo pasa del código al modelo. Y del 4 al 5 la dimensión nueva es el tiempo: estado que persiste entre sesiones, memoria que se acumula con sus errores adentro, y efectos que deben poder reintentarse sin duplicarse.

Un detalle que conviene fijar temprano: la columna de riesgos es **acumulativa**. Un agente long-running no tiene el quinto riesgo; tiene los cinco. Nada de lo que preocupaba en el escalón 1 desaparece por subir.

## 4. Por qué "empezar simple" es la regla profesional

"Building effective agents" deja una regla que suena conservadora y es matemática: buscá la solución más simple que alcance, y subí de escalón solo si la tarea lo exige.

La aritmética que la respalda es incómoda. Si cada paso de un agente sale bien con probabilidad 0.9, la probabilidad de que 10 pasos independientes salgan todos bien ronda 0.35. Es un modelo simplificado —los pasos reales no son independientes—, pero la dirección es correcta: **la confiabilidad se multiplica, y multiplicar números menores que 1 solo puede bajar**. Cada escalón de autonomía agrega pasos que el código ya no garantiza.

La historia lo confirmó rápido y en público: los loops autónomos virales de 2023 (AutoGPT, BabyAGI) demostraron divagación, atascos y costo sin control. Esa lección negativa fundacional tiene su propio artículo en esta colección: [La evolución de los agentes 2022–2026](/blog/evolucion-de-los-agentes-2022-2026/).

La regla profesional, en tres cláusulas:

1. Si un prompt bien hecho resuelve la tarea, no hay proyecto de agente: hay un prompt. Festejalo, es la opción barata.
2. Si el flujo se puede dibujar antes de correr, es un workflow — y un workflow es más barato de testear, operar y explicar que un agente.
3. Un agente se justifica cuando el camino no se conoce de antemano. Y aun entonces, acotado: presupuesto explícito, herramientas mínimas y condición de parada escrita en código.

Subir de escalón sin evidencia de que el actual no alcanza no es ambición técnica: es deuda de riesgo con intereses.

## 5. El mapa de la serie

Esta serie tiene ocho colecciones. Cada una responde una pregunta, y cada una se sostiene sola: el orden de la tabla es el sugerido, no el obligatorio.

| Colección | Pregunta que responde | Artículos |
|---|---|---|
| g00 — Mapa (esta) | ¿Qué es un agente y en qué escalón está cada sistema? | Este pilar · [La evolución de los agentes 2022–2026](/blog/evolucion-de-los-agentes-2022-2026/) · [Glosario agéntico](/blog/glosario-agentico/) |
| g01 — Anatomía | ¿De qué piezas está hecho un agente? | [Anatomía de un agente: seis órganos](/blog/anatomia-de-un-agente-seis-organos/) · [Los cinco workflows antes del agente](/blog/los-cinco-workflows-antes-del-agente/) · [Condición de parada y presupuestos](/blog/condicion-de-parada-y-presupuestos-del-agente/) |
| g02 — Herramientas | ¿Cómo se conecta con el mundo? | [De function calling a MCP](/blog/de-function-calling-a-mcp-el-contrato-de-las-herramientas/) · [Un servidor MCP de herramientas QA](/blog/construir-un-servidor-mcp-de-herramientas-qa/) · [Code execution vs tool calls](/blog/code-execution-vs-tool-calls/) |
| g03 — Contexto y memoria | ¿Qué recuerda, qué olvida y quién lo decide? | [Context engineering](/blog/context-engineering-el-contexto-como-recurso-finito/) · [Taxonomía de memoria de agentes](/blog/taxonomia-de-memoria-de-agentes/) · [Archivos como memoria](/blog/archivos-como-memoria-del-agente/) |
| g04 — Patrones de ejecución | ¿Cómo decide, coordina y sobrevive? | [Del loop ReAct a plan-and-execute](/blog/del-loop-react-al-plan-and-execute/) · [Multi-agente: el debate 2025](/blog/multi-agente-el-debate-2025/) · [Agentes durables: checkpoint y replay](/blog/agentes-durables-checkpoint-y-replay/) |
| g05 — Evaluación | ¿Cómo se mide que funciona, y cuán seguido funciona? | [Trayectoria, outcome y pass^k](/blog/evaluar-agentes-trayectoria-outcome-pass-k/) · [Golden tasks y verificadores de estado](/blog/golden-tasks-y-verificadores-de-estado/) · [Simuladores de usuario](/blog/simuladores-de-usuario-para-agentes/) · [Observabilidad de agentes con OTel](/blog/observabilidad-de-agentes-otel/) |
| g06 — Seguridad | ¿Cómo se rompe y cómo se defiende? | [La tríada letal](/blog/la-triada-letal-seguridad-de-agentes/) · [Red teaming como regresión](/blog/red-teaming-de-agentes-como-regresion/) · [Sandbox y permisos](/blog/sandbox-y-permisos-para-agentes/) |
| g07 — Agentes para QA | ¿Qué puede hacer un agente por el trabajo de testing? | [Propone evidencia, humano decide](/blog/agentes-para-qa-propone-evidencia-humano-decide/) · [Triage de fallos con un agente](/blog/triage-de-fallos-con-un-agente/) · [Self-healing de selectores como PR](/blog/self-healing-de-selectores-como-pr/) · [Testing exploratorio sintético](/blog/testing-exploratorio-sintetico-computer-use/) |

Guía rápida de lectura: para construir, el camino natural es g01 → g02 → g03 → g04. Para evaluar y operar, g05 → g06. Para aplicar agentes al propio trabajo de testing, directo a g07 — con g00 y g05 como red de seguridad.

## 6. Por qué esto es Quality Engineering

El espectro de autonomía, leído de derecha a izquierda, es un modelo de riesgo. Cada escalón transfiere una decisión más del código —determinista, testeable con las herramientas de siempre— al modelo —probabilístico, testeable solo con evals, análisis de trayectorias y verificación de estado—. La pregunta "¿en qué escalón está este sistema?" y la pregunta "¿qué puede salir mal y cómo lo detecto?" son la misma pregunta con distinta ropa.

Por eso esta serie está escrita desde QA y no desde el entusiasmo: la disciplina que sabe diseñar casos por riesgo, medir comportamiento agregado y desconfiar de las demos es exactamente la que este terreno necesita. El dominio es nuevo; el criterio es el de siempre.

> Para el marco de evaluación continua que esta serie asume —evals como control estadístico de calidad y gate en CI—, ver [Evaluación continua de sistemas con IA](/blog/evaluacion-continua-sistemas-ia-quality-engineering/); los experimentos con scorers y jueces viven en [`llm-evals-harness`](https://github.com/fercarballo/llm-evals-harness). Para ubicar todo esto en un plan de carrera, [De QA Automation a Quality Engineering: el mapa de 180 días](/blog/de-qa-automation-a-quality-engineering-mapa-de-180-dias/).
