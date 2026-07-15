---
title: "Simuladores de usuario: evaluar agentes conversacionales sin humanos"
description: "Un agente que conversa no tiene una respuesta única que verificar. El patrón tau-bench: usuario simulado, reglas como oráculo y un simulador que también se testea."
pubDate: 2026-07-15
tags: ['evals', 'agentes', 'quality-engineering', 'llm-evaluation', 'sdet']
cluster: 'g05'
clusterTitle: "Evaluar agentes"
type: satelite
order: 3
readingLevel: "Avanzado"
prerequisites: "Nociones de evaluación de agentes."
icon: 'flask'
iconHue: 145
---

> **Subtítulo:** Cómo se evalúa un agente que conversa cuando no hay una respuesta única que verificar: el patrón tau-bench de usuario simulado bajo reglas de negocio, por qué el simulador también se testea, y dónde termina lo que se puede medir sin humanos.

> **Nota de alcance.** Ejemplos ilustrativos sobre un agente de atención ficticio. Los papers y métricas citados son los del material de la serie; las reglas y diálogos son sintéticos. El terreno cambia rápido: revalidá contra tu versión de modelos y contra usuarios reales.

---

## Resumen ejecutivo

- Un agente conversacional no tiene una salida fija que comparar: **el usuario reacciona a lo que el agente dice**, así que cada corrida es un diálogo distinto. No hay `assertEquals` posible sobre la conversación.
- El patrón de tau-bench (Yao et al., 2024) resuelve el bloqueo con un **usuario simulado**: un modelo que juega al cliente bajo un objetivo y reglas de negocio, conversa con el agente, y al final se verifica el **estado del entorno** y el **cumplimiento de las reglas**.
- **Si el simulador no es realista, la métrica miente: un usuario simulado demasiado cooperativo infla el puntaje y uno incoherente lo hunde. Por eso el simulador también se testea, igual que se valida a un juez LLM.**
- Las conversaciones son multi-turno, y cada turno agrega un factor no determinista al producto: `pass^k` se desploma más rápido que en una tarea de un disparo.
- El simulado no cubre la creatividad de un usuario real hostil. Es un piso de regresión, no un techo de garantía.

Al terminar vas a poder montar una eval conversacional con usuario simulado, verificar estado y reglas como oráculo, testear al propio simulador y nombrar con honestidad qué queda fuera de su alcance.

---

## 1. El problema: no hay una respuesta única que verificar

Las [evals de LLM apps](/blog/evaluar-aplicaciones-llm/) todavía tienen algo firme donde pararse: una entrada y una salida que puntuar, aunque la salida admita variantes. Un agente que conversa pierde hasta eso. La conversación no es una función de la entrada: es una función de **la entrada y de todo lo que el agente fue diciendo**. Cambia una frase del agente en el turno dos y el usuario responde otra cosa en el tres. No hay una transcripción "correcta" que comparar.

Y no se puede poner un humano a chatear con el agente mil veces por cada cambio de prompt. Es lento, caro y —lo peor para una eval— **irrepetible**: dos personas nunca conducen la misma conversación, así que la métrica no aísla al agente del humano que le tocó. Hace falta un interlocutor reproducible.

## 2. El patrón tau-bench: un usuario simulado bajo reglas

La idea que ordenó este subcampo viene de tau-bench (Yao et al., 2024): en lugar de un humano, un **usuario simulado** —otro modelo— juega al cliente. Se le da un objetivo ("quiero cambiar mi vuelo al martes") y un entorno con reglas de negocio, y conversa con el agente hasta resolver o abandonar. Al terminar, no se juzga la charla palabra por palabra: se verifica **el estado final del entorno** y **el cumplimiento de las reglas** durante todo el diálogo. En 2025 el patrón se extendió como tau²-bench.

```text
  usuario simulado                      agente bajo prueba
  (objetivo + persona)                  (herramientas + políticas)
        │                                       │
        ├──────────── turno 1 ─────────────────►│
        │◄─────────── turno 2 ──────────────────┤
        │                 ...                    │
        └──────────── turno n ─────────────────►│
                          │
                          ▼
        verificación al cierre:
        · estado del entorno (¿el vuelo quedó cambiado?)  ← oráculo de código
        · reglas de negocio (¿respetó cada política?)     ← oráculo parcial
```

Lo elegante del patrón es que reusa el oráculo del pilar. La conversación es el medio; lo que se verifica sigue siendo el **estado del mundo** con [un verificador determinista](/blog/golden-tasks-y-verificadores-de-estado/), más un conjunto de reglas que se pueden chequear con código.

## 3. El simulador de usuario también se testea

Acá está la trampa que separa una eval seria de una que se miente sola. El usuario simulado es un modelo, y un modelo mal calibrado como interlocutor rompe la medición en las dos direcciones. Un simulado **demasiado cooperativo** —que acepta la primera respuesta, no repregunta, no se confunde nunca— infla el puntaje del agente. Uno **incoherente** —que cambia de objetivo, se contradice o le filtra la solución al agente— lo hunde sin que el agente haya hecho nada mal.

Es exactamente el problema del juez LLM en la [eval de LLM apps](/blog/evaluar-aplicaciones-llm/): un componente probabilístico que decide sobre otro y al que no se le puede creer sin validarlo. La cura es la misma —**meta-testing**—: al simulador se le corren escenarios de comportamiento conocido y se verifica que actúe como un usuario plausible. Que persiga su objetivo sin revelar la respuesta, que repregunte cuando el agente es ambiguo, que no se rinda antes de tiempo, que se mantenga en su persona. Si el simulador no pasa esos casos obvios, la métrica que produce no vale: se estaría midiendo con una regla de goma.

## 4. pass^k otra vez, y peor

El pilar mostró que la confiabilidad se multiplica por paso. Una conversación es multi-turno por definición, así que cada turno es un factor no determinista más que entra al producto —y encima el usuario simulado también es no determinista, con lo que hay dos fuentes de varianza componiéndose—. La consecuencia práctica: `pass^k` en tareas conversacionales cae más rápido que en una tarea de un solo disparo, y a la vez es más sensible al ruido del simulador.

Dos disciplinas que se siguen de ahí. Primero, [`pass^k` sobre varias corridas](/blog/evaluar-agentes-trayectoria-outcome-pass-k/) no es opcional: una única conversación exitosa no dice nada sobre consistencia. Segundo, hay que separar la varianza del agente de la del simulador —fijando seeds del simulador donde se pueda, o promediando sobre suficientes corridas— para no atribuirle al agente los tropiezos de su interlocutor sintético.

## 5. Las reglas de negocio como oráculo parcial

No todo en una conversación se verifica con el estado final. Hay obligaciones que son sobre **el proceso**: "nunca reembolsar sin autorización", "no prometer plazos que el sistema no garantiza", "escalar a humano si el monto supera el límite". Estas reglas funcionan como un **oráculo parcial**: no dicen que la conversación fue buena, pero atrapan de forma determinista las violaciones que no se pueden dejar pasar. Un agente que resolvió el pedido del usuario pero reembolsó sin autorización no aprueba, por más contento que haya quedado el usuario simulado.

Es un oráculo parcial, no total, y conviene decirlo: cubre lo prohibido, no lo excelente. La calidad difusa que queda —claridad, tono, si de verdad ayudó— sigue necesitando un juez con rúbrica, con todas las cautelas de siempre. Y cuando el agente además recupera información para responder, aparece otra capa entera de verificación: que cite lo que usó y que se abstenga cuando la evidencia no alcanza, el terreno de la [evaluación de RAG con recuperación, citas y abstención](/blog/rag-evaluacion-recuperacion-citas-abstencion/).

## 6. Límites honestos: lo que un simulado no captura

Un usuario simulado es un modelo imitando a una persona, y hereda el límite de esa imitación. No reproduce la creatividad de un usuario real hostil: el que escribe todo en minúscula y sin contexto, el que cambia de tema a la mitad, el que intenta manipular al agente con una historia inventada, el que encuentra el fraseo raro que nadie previó. Esa cola larga de comportamiento real es justo donde los agentes se rompen —y donde un simulador entrenado para ser "un usuario razonable" no va a llegar.

La conclusión senior es de encuadre: una eval con usuarios simulados es un excelente **piso de regresión** —detecta que un cambio de prompt empeoró el comportamiento, corre en CI, es reproducible— pero no es un **techo de garantía**. No reemplaza probar con usuarios reales, ni el red teaming adversarial que la colección de seguridad trata aparte. Medir sin humanos es posible y es valioso; creer que eso agota el riesgo es el error que la propia técnica invita a cometer.

> Para la matemática de por qué el multi-turno castiga la consistencia, ver el pilar [Trayectoria, outcome y pass^k](/blog/evaluar-agentes-trayectoria-outcome-pass-k/). Para el oráculo determinista que la verificación de estado reusa, [Golden tasks y verificadores de estado](/blog/golden-tasks-y-verificadores-de-estado/).
