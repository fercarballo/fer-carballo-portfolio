---
title: "Agentes durables: journal, checkpoint y replay"
description: "Un journal append-only, la distinción re-ejecutar vs re-leer y el test de oro del crash en cada punto: la disciplina de outbox e idempotencia aplicada al agente."
pubDate: 2026-07-15
tags: ['agentes', 'durabilidad', 'idempotencia', 'event-sourcing', 'sdet']
cluster: 'g04'
clusterTitle: "Arquitecturas de agente"
type: satelite
order: 3
readingLevel: "Avanzado"
prerequisites: "Nociones de event sourcing ayudan."
repo: "durable-agent-workflow"
icon: 'refresh'
iconHue: 190
---

> **Subtítulo:** El problema de un agente que corre horas y se cae a la mitad, resuelto con la disciplina de siempre: un journal de eventos append-only, la distinción entre re-ejecutar y re-leer, y efectos idempotentes que el replay no duplica.

> **Nota de alcance.** Ejemplos ilustrativos. La implementación de referencia vive en [`durable-agent-workflow`](https://github.com/fercarballo/durable-agent-workflow): journal append-only, resume tras crash en cualquier punto, aprobación humana asíncrona y replay determinista con el LLM memoizado; TypeScript, cero dependencias, LLM mock y sin red. Es una implementación de referencia, no un orquestador de producción.

---

## Resumen ejecutivo

- Un agente que corre horas hereda un problema viejo: si el proceso muere a la mitad, reiniciar desde cero tira el trabajo hecho y, peor, puede repetir efectos que ya ocurrieron.
- La solución no es nueva: un journal de eventos append-only como única fuente de verdad. Cada decisión, tool-call y observación se anexa; el estado del agente es el resultado de releer ese journal.
- **La distinción central es re-ejecutar vs re-leer: al resumir, lo que ya está en el journal se re-lee memoizado, no se vuelve a ejecutar; solo lo que quedó pendiente se ejecuta de verdad. Eso vuelve el replay determinista y barato.**
- El test de oro es simple y brutal: inyectar un crash después de cada punto, resumir y verificar que el journal y el estado final son siempre los mismos. Si crashear en el paso 7 difiere de crashear en el 12, la durabilidad está rota.
- Es la misma disciplina de outbox e idempotencia de la mensajería, aplicada al agente. Lo que no resuelve —orquestación de producción a escala— es el terreno de herramientas como Temporal.

Al terminar vas a poder explicar por qué un agente long-running necesita un journal, distinguir re-ejecutar de re-leer, diseñar el test de crash en cada punto y reconocer que la durabilidad del agente es el patrón outbox/idempotencia que ya conocés.

---

## 1. El problema: un agente de horas muere a la mitad

Un agente de migración corre hace cuarenta minutos. Leyó doscientos archivos, llamó al modelo una docena de veces, abrió tres pull requests y va por el cuarto. Entonces el proceso muere: un deploy lo reinició, se quedó sin memoria, la spot instance se la llevaron. La pregunta no es retórica: ahora, ¿qué?

Reiniciar desde cero tiene dos costos. El obvio: se tiran cuarenta minutos de trabajo y de tokens. El caro: los efectos que ya ocurrieron no se deshacen solos. Si el agente arranca de nuevo, vuelve a abrir los tres pull requests que ya había abierto. Un agente sin durabilidad no es solo lento de recuperar: es peligroso de recuperar.

## 2. El journal de eventos como fuente de verdad

La salida es dejar de tratar la ejecución como algo que vive en la memoria del proceso y empezar a tratarla como una secuencia de hechos registrados. Cada paso del agente —una decisión del modelo, una tool-call, la observación que devolvió— se anexa a un journal append-only: se agrega al final, nunca se modifica ni se borra. El estado del agente en cualquier momento no es una variable en memoria: es el resultado de releer el journal desde el principio.

Es event sourcing —quien viene de mensajería lo reconoce— aplicado al bucle del agente, y trae la misma propiedad valiosa: el journal es auditable. Se puede leer, después del hecho, qué decidió el agente, en qué orden y con qué información. Es la misma verificabilidad que salvó a las técnicas que sobrevivieron a cada era de agentes: lo que se puede releer, se puede confiar.

## 3. Re-ejecutar vs re-leer: la distinción central

Al resumir, el agente relee el journal para reconstruir su estado. Acá está la trampa que hunde las implementaciones ingenuas, y la distinción que conviene tener grabada: releer el journal no es re-ejecutar el journal.

Cada evento ya registrado tiene su resultado guardado. Cuando el resume pasa por un paso que ya está en el journal, toma el resultado de ahí —lo re-lee, memoizado— en vez de volver a hacerlo. La llamada al modelo que ya se hizo no se repite: su respuesta está en el journal. La tool-call que ya se ejecutó no se repite: su observación está en el journal. Solo el primer paso que todavía no tiene resultado —lo pendiente— se ejecuta de verdad.

```typescript
// Al pasar por un paso: si su resultado ya está en el journal, se re-lee;
// si no está, se ejecuta una vez y el resultado se anexa (memoización).
async function paso(seq: number, ejecutar: () => Promise<Resultado>) {
  const previo = journal.buscar(seq);
  if (previo) return previo.resultado;   // re-leer: NO se re-ejecuta
  const resultado = await ejecutar();     // pendiente: se ejecuta una sola vez
  journal.anexar({ seq, resultado });     // queda memoizado para el próximo resume
  return resultado;
}
```

Esto es lo que vuelve el replay determinista: con las llamadas al modelo y las tool-calls memoizadas, resumir mil veces produce siempre la misma secuencia. Y es lo que lo vuelve barato: no se vuelve a pagar lo ya hecho.

## 4. El test de oro: crash en cada punto

Una implementación durable se prueba con una crueldad específica: inyectar un crash después de cada evento del journal, resumir, y verificar que el journal y el estado final quedan idénticos, sin importar dónde cayó.

```text
 Ejecución 1 (muere en el paso 3)          Ejecución 2 (resume del journal)
 ─────────────────────────────────         ────────────────────────────────
 [0] plan            ✓ journaled            [0] plan            ↺ re-leído
 [1] tool: leer      ✓ journaled            [1] tool: leer      ↺ re-leído
 [2] llm: decidir    ✓ journaled            [2] llm: decidir    ↺ re-leído
 [3] tool: escribir  ✗ CRASH                [3] tool: escribir  ▶ ejecuta (clave seq=3)
        │               (¿alcanzó a correr?  [4] …               ▶ continúa
        │                el journal no lo             ▲
        │                confirmó aún)                │
        └──── el proceso muere ────────────────────────┘
```

El test recorre ese crash para cada valor del paso —después del 0, del 1, del 2, del 3…— y compara el resultado final contra la corrida sin fallas. Si crashear en el paso 7 produce un journal distinto que crashear en el 12, la durabilidad está rota en alguna parte. Es el equivalente, para agentes, de las pruebas de duplicado y de pérdida de ack de la mensajería: no se confía en que "anda", se lo somete a la falla en cada frontera y se exige el mismo estado final.

## 5. Aprobación humana asíncrona

La durabilidad habilita algo que un agente en memoria no puede hacer bien: esperar a un humano durante horas o días sin bloquear nada. Cuando el agente llega a un paso que requiere aprobación —abrir el pull request, mandar el mail—, anexa un evento de "pendiente de aprobación" y el proceso termina. No hay un hilo colgado consumiendo recursos a la espera de un clic.

Cuando la persona aprueba, una nueva invocación resume desde el journal, encuentra la aprobación como un evento más y sigue. La pausa humana no es un caso especial del código: es otro evento en la misma secuencia, y por eso hereda gratis la durabilidad y la auditabilidad de todo lo demás.

## 6. Idempotencia de efectos: el puente con los cimientos

Queda un cabo suelto del diagrama de crash. En el paso 3 —"tool: escribir"— el proceso murió justo ahí, y el journal no alcanzó a confirmar si la escritura llegó a ocurrir. ¿El resume la repite? Solo es seguro si el efecto es idempotente.

La técnica es la de siempre: cada efecto lleva una clave de idempotencia derivada de su número de secuencia en el journal. La primera vez que se ejecuta, el destino registra esa clave; si el resume vuelve a intentarlo con la misma clave, el destino la reconoce y no duplica. Re-ejecutar el paso 3 con clave seq=3 es inofensivo: el efecto ocurre una sola vez aunque el intento se repita.

Si esto suena conocido, es porque es exactamente el mismo patrón que sostiene la mensajería confiable. Un agente durable es un caso más de [outbox, inbox y replay seguro](/blog/outbox-inbox-dlq-y-replay-seguro/), y sus efectos exigen la misma disciplina que un [consumidor idempotente](/blog/semanticas-de-entrega-y-consumidores-idempotentes/). La novedad no es el mecanismo: es el lugar donde se aplica.

## 7. Qué no resuelve, y por qué importa entenderlo

Conviene ser claro con los límites. La implementación de referencia muestra el patrón —journal, memoización, crash-resume, idempotencia— en su forma mínima y auditable, sin red y con un LLM mock para que el replay sea determinista y testeable. No es un orquestador de producción.

Para durabilidad a escala —miles de workflows concurrentes, reintentos con backoff gestionados, timers que sobreviven meses, versionado de workflows en vuelo— existe una categoría de herramientas dedicadas, de las que Temporal es el ejemplo más conocido. Entender el patrón a mano es, justamente, lo que permite adoptar esas herramientas con criterio en lugar de por moda, y saber qué garantizan de verdad y qué sigue siendo responsabilidad del diseño. Ese es el objetivo: que la durabilidad deje de ser magia de framework y pase a ser un mecanismo que se entiende, se testea y se explica.

> Para el bucle que este journal hace durable —cómo decide el agente qué paso viene—, el pilar [Del loop ReAct al plan-and-execute](/blog/del-loop-react-al-plan-and-execute/). El código completo de la implementación de referencia —journal, memoización, fault injection en cada punto y aprobación asíncrona— vive en [`durable-agent-workflow`](https://github.com/fercarballo/durable-agent-workflow).
