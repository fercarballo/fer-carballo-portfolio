---
title: "La evolución de los agentes 2022–2026: qué murió y qué quedó"
description: "Cinco eras de agentes de IA, de Chain-of-Thought a los agentes durables. Cada una murió por un problema concreto, y lo que lo resolvió definió la siguiente."
pubDate: 2026-07-15
tags: ['agentes', 'historia-tecnica', 'quality-engineering', 'sdet']
cluster: 'g00'
clusterTitle: "Mapa agéntico: de LLM apps a agentes"
type: satelite
order: 2
readingLevel: "Intermedio"
prerequisites: "Nociones de LLMs vía API; haber leído el pilar del espectro de autonomía ayuda."
icon: 'bot'
iconHue: 150
---

> **Subtítulo:** Un recorrido de cuatro años en cinco eras, contadas por su modo de fallo: cada etapa murió por un problema concreto, y la solución de ese problema fundó la etapa que siguió.

> **Nota de alcance.** Fechas, papers y nombres verificados contra la fuente. La narrativa "cada era murió por X" es un ordenamiento didáctico, no una ley histórica: las eras se solapan. No hay benchmarks propios en este artículo; los números que aparecen están rotulados como ilustrativos o citados de su fuente.

---

## Resumen ejecutivo

- La historia de los agentes no es una línea de mejoras: es una **secuencia de problemas**. Cada era resolvió el cuello de botella de la anterior y destapó el siguiente.
- **2022** puso los cimientos (razonar antes de actuar: Chain-of-Thought y ReAct). **2023** prometió autonomía y no la cumplió — y esa lección negativa fue el aporte más valioso del año.
- **2024** profesionalizó el campo con benchmarks reales y protocolos; **2025** lo puso en producción y le puso nombre a sus problemas (el debate multi-agente, la tríada letal).
- **2026** ya no discute si los agentes sirven: discute cómo se gobiernan, cuánto cuestan y quién garantiza su calidad. Ese último problema es el que abre la puerta a Quality Engineering.
- El patrón que se repite: **lo que sobrevivió de cada era fue lo verificable.** Function calling tipado, benchmarks con verificador de estado, journals auditables. Lo que murió fue lo que no se podía medir.

Al terminar vas a poder ubicar cualquier técnica agéntica en su era, explicar qué problema resolvía y contar la historia como lo que es: la lenta domesticación de un sistema que actúa.

---

## 1. El problema de contar esta historia

Es tentador narrar los agentes como una escalada de logros: cada año, modelos más capaces haciendo más cosas. Esa versión es cómoda y engaña, porque esconde lo único que importa para quien tiene que construir o testear uno: **por qué cada técnica existe**.

La lente honesta es la del modo de fallo. Ninguna era inventó su técnica estrella por elegancia; la inventó porque la anterior chocaba contra una pared concreta. Contada así, la historia se vuelve un mapa de riesgos con fechas — y anticipa contra qué pared vas a chocar vos.

```text
 2022         2023            2024              2025             2026
 ───┬──────────┬───────────────┬─────────────────┬────────────────┬───►
    │          │               │                 │                │
 CIMIENTOS   FIEBRE       PROFESIONALIZA     PRODUCCIÓN         HOY
 razonar     autonomía    benchmarks +       agentes que       durabilidad
 antes de    prometida    protocolos         facturan +        gobernanza
 actuar      e incumplida (SWE, MCP)         sus problemas      costo
    │          │               │              con nombre         │
    ▼          ▼               ▼                 ▼                ▼
 ReAct     AutoGPT        SWE-agent, tau      multi-agente,   ¿quién
 CoT       (la lección    computer use,      tríada letal,    garantiza
           negativa)      Building eff.      context eng.     la calidad?
```

## 2. 2022 — Los cimientos: razonar antes de actuar

Antes de que un modelo pudiera actuar con criterio, tuvo que aprender a mostrar su razonamiento. **Chain-of-Thought** (Wei et al., 2022) mostró que pedirle al modelo que pensara paso a paso mejoraba el resultado en tareas de razonamiento. Parece obvio en retrospectiva; no lo era.

El salto agéntico llegó con **ReAct** (Yao et al., 2022), que entrelazó razonamiento y acción en un loop: *Thought → Action → Observation*, repetido hasta terminar. Esa estructura —pensar el próximo paso, ejecutarlo, observar el resultado, volver a pensar— sigue siendo el esqueleto de casi todo agente moderno. Cambió el modelo, cambiaron las herramientas; el loop no.

Lo que quedó de esta era es tan fundacional que ya no se nombra: cuando alguien dice "el agente", asume ReAct sin decirlo.

## 3. 2023 — La fiebre: autonomía prometida, autonomía incumplida

En marzo y abril de 2023, **AutoGPT** y **BabyAGI** capturaron la imaginación de todos: un agente que se daba objetivos, los descomponía y trabajaba solo hasta cumplirlos. La demo era hipnótica. El uso real, decepcionante — y esa decepción fue el aporte más valioso del año.

Sin condición de parada ni forma de evaluar su propio progreso, esos loops autónomos **divagaban, se atascaban en subtareas inútiles y quemaban presupuesto** sin llegar a nada. La lección negativa quedó grabada: la autonomía sin frenos no es una capacidad, es un riesgo. Todo lo que vino después —presupuestos, condiciones de parada, evals— es, en parte, una respuesta a este fracaso.

El año también trajo la pieza que volvió confiable la acción: en junio, el **function calling nativo** de OpenAI convirtió las herramientas de un parsing frágil de texto a JSON tipado contra un esquema. Fue el primer gran salto de confiabilidad, y la primera vez que "el agente llamó a la herramienta" dejó de ser una lotería de formato.

Y fue un año de papers que fundaron géneros enteros, cada uno todavía vigente:

| Paper (2023) | Qué aportó | Qué género fundó |
|---|---|---|
| Toolformer | El modelo aprende solo cuándo llamar una API | Uso de herramientas autosupervisado |
| Reflexion | Auto-crítica verbal guardada entre intentos | Los loops de reflexión |
| Tree of Thoughts | Búsqueda deliberada sobre ramas de razonamiento | Razonamiento como búsqueda |
| Voyager | Biblioteca de habilidades que se acumula (Minecraft) | Aprendizaje de skills |
| Generative Agents | 25 agentes con memoria y vida social (Smallville) | Agentes con memoria episódica |
| MemGPT | Memoria jerárquica gestionada como un sistema operativo | Gestión de memoria de agente |
| AutoGen · MetaGPT | Conversación entre agentes · SOPs como código | Multi-agente |

## 4. 2024 — La profesionalización: del juguete al banco de pruebas

Si 2023 fue la fiebre, 2024 fue la fiebre bajando y dejando método. La pregunta cambió de "¿qué cosa impresionante puede hacer?" a "¿cómo mido si de verdad funciona?".

- **SWE-bench** (Jimenez et al., 2023) y **SWE-agent** (Yang et al., 2024) instalaron la idea de medir agentes contra *issues reales de GitHub*, y con SWE-agent nació el concepto de **ACI** (agent-computer interface): diseñar la interfaz pensada para el agente —búsqueda, edición, feedback compacto— importa tanto como el modelo.
- **tau-bench** (Yao et al., 2024) puso a los agentes a conversar con usuarios simulados bajo reglas de negocio, y expuso la métrica que este campo necesitaba: **pass^k**, la consistencia en k corridas, no el mejor de k intentos. Un agente brillante una vez de cada cinco no sirve para operar dinero.
- **OSWorld** (Xie et al., 2024) llevó la evaluación al escritorio completo; los números humillantes de estos benchmarks se volvieron una vacuna contra el hype.
- En octubre, **computer use** (Anthropic) dejó al agente ver la pantalla y operar mouse y teclado. En noviembre, **MCP** (Model Context Protocol, Anthropic) estandarizó cómo un agente descubre y llama herramientas — el "USB-C de los agentes".
- Y en diciembre, **"Building effective agents"** (Anthropic) ordenó el vocabulario que todavía usamos: workflows vs agentes, y la advertencia que abre esta serie — empezá simple.

Lo que sobrevivió de 2024 es method: benchmarks con verificador, interfaces diseñadas para el agente, un protocolo de herramientas. Todo medible, todo auditable.

## 5. 2025 — La producción: agentes que facturan y problemas con nombre

En 2025 los agentes dejaron de ser demos. **Claude Code** (febrero) y los background agents pusieron a trabajar agentes de código sobre repos reales; el terminal —shell, archivos, git— resultó ser el espacio de acción ganador, porque es componible, verificable (los tests son el oráculo) y auditable (queda todo en el historial).

La estandarización se consolidó: OpenAI adoptó MCP y publicó su Agents SDK (marzo); Google lanzó **A2A** (abril) para comunicación agente-a-agente. MCP pasó a estándar de facto.

Y el campo maduró lo suficiente como para tener debates serios, no hype:

- **El debate multi-agente.** En junio, Cognition publicó *"Don't build multi-agents"* (los subagentes pierden contexto y toman decisiones en conflicto) casi el mismo día en que Anthropic publicaba cómo construyó su sistema de investigación multi-agente. No se contradicen: la síntesis es que el multi-agente rinde cuando los subagentes **leen y comprimen** en paralelo, y falla cuando **escriben estado compartido** sin coordinación. Tiene su artículo propio en [Multi-agente: el debate 2025](/blog/multi-agente-el-debate-2025/).
- **La seguridad con nombre.** Simon Willison acuñó la *lethal trifecta*: datos privados + contenido no confiable + un canal de salida. Con las tres presentes, la exfiltración es cuestión de tiempo. Le dedicamos [La tríada letal](/blog/la-triada-letal-seguridad-de-agentes/).
- **Context engineering** desplazó a "prompt engineering" como disciplina: el contexto pasó a entenderse como un recurso finito con retornos decrecientes, tema de [Context engineering](/blog/context-engineering-el-contexto-como-recurso-finito/).

## 6. 2026 — Hoy: durabilidad, gobernanza y costo

El campo ya no discute si los agentes sirven. Discute cómo se los gobierna. Los temas abiertos de este año son operativos: agentes long-running con checkpoint y resume, orquestación de equipos de agentes, presupuestos de tokens tratados como SLO, observabilidad con las convenciones de OpenTelemetry para GenAI, y una pregunta que define contrataciones enteras: **¿quién garantiza la calidad de un sistema que actúa solo?**

Esa pregunta no es retórica. Es exactamente la vacante que abre este terreno para Quality Engineering, y el motivo por el que esta serie existe.

## 7. El patrón: sobrevive lo verificable

Puesta en una línea por era, la historia deja un patrón nítido:

| Era | Qué murió | Qué quedó |
|---|---|---|
| 2022 | — (fundacional) | El loop ReAct: Thought → Action → Observation |
| 2023 | La autonomía sin frenos (AutoGPT) | Function calling tipado; los papers que fundaron géneros |
| 2024 | Las demos sin medición | Benchmarks con verificador; MCP; el vocabulario workflow/agente |
| 2025 | El multi-agente ingenuo (todo paralelo) | La síntesis "leer sí, escribir compartido no"; la tríada letal |
| 2026 | (en curso) | Lo que se pueda auditar: journals, presupuestos, observabilidad |

Lo que sobrevivió de cada era tiene una propiedad en común: **se podía verificar**. El JSON tipado se valida contra un esquema; el benchmark tiene un verificador de estado; el journal se puede releer. Lo que murió —la autonomía sin frenos, la demo sin métrica, el enjambre sin coordinación— compartía el defecto opuesto: no había forma de medir si estaba funcionando.

Ese es, quizás, el aprendizaje más útil de cuatro años de agentes, y da la bienvenida al resto de la serie: en un sistema que actúa solo, lo que no se puede verificar no se puede confiar.

> Para las definiciones precisas de cada término que apareció acá, el [Glosario agéntico](/blog/glosario-agentico/). Para entender por qué "empezar simple" no es timidez sino aritmética, el pilar [De aplicaciones con LLM a agentes](/blog/de-llm-apps-a-agentes-el-espectro-de-autonomia/).
