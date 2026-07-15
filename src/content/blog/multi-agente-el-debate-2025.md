---
title: "Multi-agente: supervisor, handoffs y el debate de 2025"
description: "Cuatro topologías multi-agente, el debate Cognition vs Anthropic de junio de 2025 y una síntesis honesta: leer en paralelo rinde, escribir estado compartido falla."
pubDate: 2026-07-15
tags: ['multi-agente', 'agentes', 'arquitectura', 'quality-engineering', 'sdet']
cluster: 'g04'
clusterTitle: "Arquitecturas de agente"
type: satelite
order: 2
readingLevel: "Avanzado"
prerequisites: "Haber leído el pilar de arquitecturas."
icon: 'refresh'
iconHue: 190
---

> **Subtítulo:** Cuatro topologías multi-agente y el debate que las ordenó en 2025: cuándo repartir el trabajo entre varios agentes rinde de verdad, y cuándo agrega una superficie de fallo —la que vive entre ellos— más cara que el problema original.

> **Nota de alcance.** Ejemplos ilustrativos. Las dos piezas de junio de 2025 se citan por su tesis pública; no se reproduce su contenido. El costo en tokens es un orden de magnitud publicado por su autor, no una medición propia: revalidá contra tu caso.

---

## Resumen ejecutivo

- Multi-agente no es "más agentes, mejor": es repartir una tarea entre varios hilos de decisión, y cada frontera entre ellos es una superficie de fallo nueva.
- Cuatro topologías cubren casi todo: supervisor jerárquico, handoffs entre pares, debate con juez y blackboard de estado compartido. Se diferencian por quién decide y por dónde vive el estado.
- **En junio de 2025, Cognition ("Don't build multi-agents") y Anthropic ("How we built our multi-agent research system") publicaron tesis opuestas casi el mismo día; no se contradicen: describen los dos lados de una misma línea.**
- La síntesis honesta: el multi-agente rinde cuando los subagentes leen y comprimen en paralelo, y falla cuando escriben estado compartido sin coordinación. Y cuesta —del orden de 15× los tokens de un chat, según Anthropic—.
- El fallo multi-agente no vive dentro de un agente: vive entre agentes. Por eso se testea como la integración entre servicios: contratos y trazas correlacionadas.

Al terminar vas a poder distinguir las cuatro topologías por quién decide y dónde vive el estado, ubicar el debate de 2025 en su síntesis operativa, anticipar cuándo el multi-agente paga su costo y diseñar las pruebas para la coordinación, no solo para cada agente.

---

## 1. El problema: cuando un agente no alcanza

Una tarea grande tienta a repartirla. "Que un agente investigue la competencia, otro redacte y un tercero revise" suena a división del trabajo bien entendida, y a veces lo es. Pero sumar agentes no suma solo capacidad: suma fronteras. Donde antes había un contexto y un hilo de decisión, ahora hay varios que tienen que ponerse de acuerdo, y el acuerdo entre agentes no es gratis ni automático. El fallo más caro de un sistema multi-agente casi nunca está dentro de un agente: está en el espacio entre ellos, donde dos subagentes toman decisiones coherentes por separado e incompatibles juntas.

Las cuatro arquitecturas mono-agente del [pilar de esta colección](/blog/del-loop-react-al-plan-and-execute/) siguen valiendo dentro de cada agente; lo que se agrega acá es la capa de coordinación que las envuelve.

## 2. Cuatro topologías

Casi todos los diseños multi-agente son variaciones de cuatro topologías, y se distinguen por dos preguntas: quién decide y dónde vive el estado.

**Supervisor jerárquico.** Un agente supervisor descompone la tarea, delega en subagentes especializados y compone sus salidas.

```text
        ┌────────────┐
        │ Supervisor │  delega y reúne resultados
        └──────┬─────┘
       ┌───────┼───────┐
       ▼       ▼       ▼
    ┌────┐  ┌────┐  ┌────┐
    │ A  │  │ B  │  │ C  │   subagentes especializados
    └────┘  └────┘  └────┘   no se hablan entre sí
```

Pro: rumbo claro, un solo responsable de la síntesis. Contra: el supervisor es cuello de botella y punto único de mala decisión.

**Handoffs entre pares.** Cada agente resuelve su parte y cede el control —y el contexto— al siguiente.

```text
   ┌────┐   handoff   ┌────┐   handoff   ┌────┐
   │ A  │ ──────────► │ B  │ ──────────► │ C  │
   └────┘             └────┘             └────┘
   cada uno pasa el control al siguiente; no hay jefe
```

Pro: simple, sin coordinador. Contra: el contexto se degrada en cada salto; lo que A sabía y no escribió, B no lo tiene.

**Debate con juez.** Dos o más agentes argumentan posiciones enfrentadas y un juez decide.

```text
   ┌────┐   ┌────┐
   │ A  │   │ B  │   proponen posiciones enfrentadas
   └──┬─┘   └─┬──┘
      └───┬───┘
          ▼
       ┌──────┐
       │ Juez │   decide con criterio explícito
       └──────┘
```

Pro: expone supuestos que un solo agente daría por ciertos. Contra: caro, y sin un juez con criterio verificable el debate es teatro.

**Blackboard / estado compartido.** Todos los agentes leen y escriben un estado común.

```text
   ┌────┐   ┌────┐   ┌────┐
   │ A  │   │ B  │   │ C  │
   └─┬──┘   └─┬──┘   └─┬──┘
     ▼        ▼        ▼
   ┌─────────────────────────┐
   │  Pizarra (estado común)  │  todos leen y escriben
   └─────────────────────────┘
```

Pro: máxima flexibilidad. Contra: máxima superficie de conflicto —dos agentes que escriben la misma casilla sin coordinarse producen, exactamente, el fallo que abre este artículo—.

## 3. El debate de junio de 2025

El campo maduró lo suficiente como para discutir en serio. En junio de 2025, Cognition publicó "Don't build multi-agents": los subagentes pierden contexto, toman decisiones en conflicto y el resultado es más frágil que un buen agente único. Casi el mismo día, Anthropic publicó cómo construyó su sistema de investigación multi-agente, que paraleliza la lectura y la investigación y gana con eso.

Leídos como titulares, se contradicen. Leídos con cuidado, describen los dos extremos de una misma línea: uno mira las tareas donde el multi-agente se rompe; el otro, las tareas donde brilla. La pregunta útil no es quién tiene razón, sino qué separa un caso del otro.

## 4. La síntesis: leer sí, escribir compartido no

La distinción que reconcilia los dos textos es simple y accionable: importa qué hacen los subagentes con el estado.

- Cuando **leen y comprimen** —cada subagente explora una fuente, la resume y devuelve un puñado de conclusiones—, el multi-agente rinde. La lectura es paralelizable por naturaleza, los contextos no chocan y el supervisor integra resúmenes cortos. Es el caso de investigación de Anthropic.
- Cuando **escriben estado compartido** —cada subagente modifica un artefacto común, decide sobre el mismo recurso, avanza sobre el trabajo del otro—, el multi-agente falla. Sin un protocolo de coordinación, decisiones locales coherentes se suman en un estado global incoherente. Es el caso que Cognition advierte.

Y hay un costo que ningún diseño elude. Según Anthropic, su sistema multi-agente consume del orden de 15× los tokens de un chat corriente. Repartir el trabajo entre agentes multiplica el contexto que hay que pagar: el paralelismo se cobra en tokens. Un sistema multi-agente que no rinde lo bastante como para justificar ese múltiplo es, lisa y llanamente, un agente único caro.

## 5. El ángulo QA: el fallo vive entre los agentes

Si el fallo característico vive entre agentes, ahí hay que apuntar las pruebas. Testear cada agente por separado —que A investigue bien, que B redacte bien— deja sin cubrir justo la superficie que se rompe: la coordinación. Y el paralelo no es casual: coordinar agentes es un problema de sistemas distribuidos, y las pruebas que sirven son las mismas.

- **Contratos entre agentes.** Lo que un agente le pasa a otro —el handoff, el resultado que el supervisor espera— es una interfaz, y una interfaz se testea por contrato: qué campos, qué formato, qué significa cada valor. Es [contract testing](/blog/consumer-driven-contract-testing-cuando-si-cuando-no/) aplicado a agentes en lugar de a servicios: si el productor cambia lo que emite, el consumidor tiene que enterarse antes del incidente, no durante.
- **Trazas correlacionadas.** Un fallo que emerge de la interacción de tres agentes es imposible de depurar mirando tres registros sueltos. Hace falta un identificador de correlación que cruce a todos los agentes para reconstruir la secuencia completa de quién decidió qué y con qué información. Es el mismo requisito que en mensajería asíncrona: [recibir un mensaje no es procesarlo](/blog/recibir-un-mensaje-no-es-procesarlo/), y recibir un handoff no es haberlo entendido.

## 6. La decisión, en una línea

El multi-agente no es un escalón obligatorio de sofisticación: es una decisión con un costo concreto y un modo de fallo concreto. Rinde cuando el trabajo se puede partir en lecturas independientes que después se comprimen; se cae cuando obliga a varios agentes a escribir sobre el mismo estado sin un árbitro. Y como su fallo vive en las costuras, se lo prueba como a cualquier sistema distribuido: por sus contratos y por sus trazas, no por sus componentes de a uno.

La síntesis de 2025, resumida: antes de sumar un agente, comprobá que el trabajo se deja leer en paralelo. Si en realidad hay que escribir un estado compartido, lo que falta no es otro agente: es coordinación.

> Para las cuatro arquitecturas que operan dentro de cada agente, el pilar [Del loop ReAct al plan-and-execute](/blog/del-loop-react-al-plan-and-execute/). Y para el repertorio completo de pruebas de coordinación —cuándo un contrato entre partes ayuda y cuándo estorba—, [Consumer-driven contract testing: cuándo sí, cuándo no](/blog/consumer-driven-contract-testing-cuando-si-cuando-no/).
