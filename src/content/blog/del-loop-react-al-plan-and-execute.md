---
title: "Del loop ReAct al plan-and-execute: elegir arquitectura por su modo de fallo"
description: "Las cuatro arquitecturas mono-agente explicadas por lo que las rompe, y una regla para elegir entre ellas: por el modo de fallo tolerable y el oráculo disponible."
pubDate: 2026-07-15
tags: ['agentes', 'arquitectura', 'react', 'quality-engineering', 'sdet']
cluster: 'g04'
clusterTitle: "Arquitecturas de agente"
type: pilar
order: 1
readingLevel: "Intermedio–Avanzado"
prerequisites: "Haber leído la anatomía del agente ayuda."
icon: 'refresh'
iconHue: 190
---

> **Subtítulo:** Las cuatro arquitecturas mono-agente contadas por lo que las rompe: qué oráculo necesita cada una para converger y qué falla cuando ese oráculo no existe. La tesis: se elige por el modo de fallo tolerable, no por moda.

> **Nota de alcance.** Ejemplos ilustrativos sobre agentes de QA ficticios. Las arquitecturas se describen por su estructura, no por una implementación concreta: la tuya seguramente combine varias. Los papers citados están fechados; plan-and-execute y las variantes se presentan como patrones generales, sin atribuirles una autoría única que no tienen.

---

## Resumen ejecutivo

- "Agente" no nombra una arquitectura: nombra una familia. Las cuatro piezas base —ReAct, plan-and-execute, reflection y code agents— resuelven problemas distintos y, sobre todo, se rompen de maneras distintas.
- ReAct (Yao et al., 2022) es el esqueleto común: Thought → Action → Observation en un solo contexto. Todo lo demás son variaciones que atacan alguno de sus límites.
- **La arquitectura no se elige por moda ni por capacidad máxima: se elige por el modo de fallo que el sistema puede tolerar y por el oráculo disponible para saber, durante la ejecución, si el agente va bien.**
- Reflection sin un oráculo verificable no converge: se auto-engaña. Los code agents rinden justamente porque el test o el compilador son un oráculo fuerte que corta ese auto-engaño.
- Elegir mal no se ve en la demo: se ve en el percentil que falla en producción. Por eso la elección de arquitectura es, antes que nada, una decisión de riesgo.

Al terminar vas a poder ubicar las cuatro arquitecturas mono-agente por su estructura, nombrar el modo de fallo característico de cada una, identificar qué oráculo necesita para converger y defender una elección de arquitectura por riesgo en lugar de por tendencia.

---

## 1. El problema: elegir arquitectura por la razón equivocada

Un equipo arma su primer agente serio: un triage de fallos de CI que lee un log, propone una causa raíz y sugiere a qué dueño asignar el ticket. Alguien leyó que "los agentes que se auto-critican mejoran solos" y propone reflection: el agente revisa su conclusión antes de entregarla. Tres semanas después es más elocuente y no más certero, y sus segundas opiniones erran con la misma seguridad que las primeras.

El diagnóstico no es el modelo. Reflection necesita algo contra qué converger —un veredicto externo que diga "esto está mal"— y en el triage de causa raíz ese veredicto no existe al momento de decidir. El agente se critica contra su propio juicio, que ya era el equivocado.

El error de fondo fue la pregunta. "Cuál arquitectura es la más potente" no tiene respuesta útil; la que ordena la decisión es doble: qué modo de fallo puede tolerar el sistema, y qué **oráculo** hay disponible —en la jerga de testing, el mecanismo que decide si un resultado es correcto—. Este artículo recorre las cuatro arquitecturas mono-agente con esa lente. La [anatomía del agente](/blog/anatomia-de-un-agente-seis-organos/) describe las piezas; acá se discute cómo se las hace girar.

## 2. ReAct: el loop que sostiene todo lo demás

La arquitectura base la fijó ReAct (Yao et al., 2022): entrelazar razonamiento y acción en un loop de tres tiempos que se repite hasta terminar.

```text
 Tarea: "¿Cuántos tests marcados 'flaky' siguen abiertos?"
    │
    ▼  ┌─────────────────────────────────────────────┐
    │  │ Thought       razona el próximo paso         │
    │  │   "Necesito consultar la API de issues"      │
    │  ├─────────────────────────────────────────────┤
    └─►│ Action        invoca una herramienta         │
       │   buscar_issues(label="flaky", estado=open)  │
       ├─────────────────────────────────────────────┤
       │ Observation   el entorno responde            │
       │   "17 resultados"                            │
       └─────────────────┬───────────────────────────┘
                         │  se repite, con la observación en contexto
                         ▼
       Thought  "Ya tengo el dato" ──► respuesta final: 17
```

El modelo razona el próximo paso, ejecuta una herramienta, lee el resultado y vuelve a razonar con esa observación incorporada. Todo ocurre en un solo contexto que crece turno a turno.

La virtud de ReAct es que no tiene partes móviles: un solo contexto, una traza legible de principio a fin, cero coordinación. Para tareas de pocos pasos con herramientas bien definidas es difícil de superar, y sigue siendo el esqueleto que las otras tres arquitecturas envuelven. Su oráculo, en cambio, es débil por diseño: la Observation, lo que el entorno devuelve tras cada acción. Alcanza cuando el entorno responde con claridad —un 404, una fila encontrada— y calla cuando el error es silencioso.

**Dónde NO.** ReAct se degrada en horizonte largo. Como todo vive en un contexto que solo crece, una tarea de treinta pasos termina razonando sobre una ventana saturada de observaciones viejas: el objetivo original queda sepultado bajo el historial, sin un plan aparte que lo sostenga. Y cuantos más pasos encadena un único loop, más probable es que alguno descarrile sin red antes de llegar al final.

## 3. Plan-and-execute: separar el rumbo de los pasos

La respuesta directa al horizonte largo de ReAct es partir en dos lo que ReAct mezcla: decidir el rumbo y ejecutar cada paso. En plan-and-execute, un planificador produce primero un plan —una lista ordenada de subtareas— y un ejecutor las cumple una por una. El plan es un TODO persistente que vive fuera del contexto de ejecución: aunque la ventana se llene, el rumbo sigue escrito aparte.

```text
   Planificador ─────────► Plan (TODO persistente, vive fuera del loop)
        ▲                    │  1. leer configuración
        │                    │  2. correr la suite
        │ replan             │  3. resumir los fallos
        │ (un paso falló      └──────────┬──────────
        │  o el mundo cambió)            │  una subtarea por vez
        │                                ▼
        └──────────────────────────  Ejecutor ──► herramientas
```

Lo que lo vuelve robusto es el replan: cuando un paso falla, el sistema vuelve al planificador para rehacer lo que queda en vez de improvisar dentro del loop. La ventaja es el rumbo. Un plan explícito sobrevive a la deriva del contexto, se inspecciona antes de ejecutar —revisar un plan es más barato que auditar una traza— y ofrece puntos naturales de control.

**Dónde NO.** El plan rígido caduca. Un plan trazado en el paso cero se apoya en supuestos sobre un mundo que todavía no se tocó; si ese mundo cambia durante la ejecución —el archivo no tenía la estructura esperada, la API devolvió otra cosa—, un ejecutor obediente sigue el plan viejo derecho contra la pared. Plan-and-execute sin una disciplina de replan seria es más frágil que ReAct, no menos: cambia la divagación por la obstinación.

## 4. Reflection: converge sólo si hay oráculo

Reflexion (Shinn et al., 2023) agregó una idea distinta: que el agente genere una auto-crítica verbal después de un intento y la guarde como memoria para el siguiente. En vez de reintentar a ciegas, escribe qué salió mal y arranca el próximo intento con esa lección en contexto.

Acá está el matiz que decide todo, y el que el equipo del ejemplo pasó por alto: reflection converge solo cuando hay un oráculo verificable que le confirme al agente que su intento falló. Con tests que pasan o fallan, con un compilador que acepta o rechaza, la auto-crítica tiene contra qué corregir y el loop mejora de verdad. Sin ese oráculo, el agente se critica contra su propio juicio —el mismo que produjo el error— y el resultado no es corrección sino auto-engaño: segundas opiniones más elaboradas, con la misma tasa de acierto o peor, porque la elocuencia sube la confianza sin subir la exactitud. Un modelo que se equivocó suele estar igual de equivocado sobre por qué se equivocó.

**Dónde NO.** En cualquier dominio sin verificador al momento de decidir —resúmenes, juicios de causa raíz, recomendaciones sin ground truth—, reflection amplifica confianza en lugar de corregir errores. Ahí no es una arquitectura: es un multiplicador de riesgo con buena prosa.

## 5. Code agents: el código como espacio de acción (y como oráculo)

La cuarta arquitectura no cambia el loop: cambia el espacio de acción. En lugar de elegir de un menú fijo de herramientas, el agente escribe y ejecuta código. SWE-agent (Yang et al., 2024) mostró que la interfaz importa tanto como el modelo y acuñó el concepto de **ACI** —agent-computer interface, la interfaz diseñada para un agente y no para una persona—; CodeAct (Wang et al., 2024) lo llevó a su forma limpia: el código ejecutable como espacio de acción unificado. Una sola primitiva —correr código— reemplaza decenas de herramientas puntuales.

La razón por la que rinden tanto no es estética: traen el oráculo más fuerte de los cuatro. El código se ejecuta y el resultado es inequívoco —el test pasa o no, el compilador acepta o rechaza—. El agente no tiene que creerse su conclusión: la corre, y el entorno la aprueba o la falla. Por eso reflection sobre código sí converge, y por eso el terminal resultó ser el espacio de acción ganador para tareas de ingeniería.

**Dónde NO.** El poder de ejecutar código arbitrario es, exactamente, la superficie de ataque: un code agent sin sandbox es una vulnerabilidad con forma de feature. Y la arquitectura solo aplica donde el dominio se expresa como código con un verificador; forzar un problema difuso a este molde no le agrega el oráculo que no tenía.

## 6. La tesis: el oráculo manda

Puestas una al lado de otra, las cuatro dejan de competir y se ordenan. No hay una mejor: hay una adecuada para cada combinación de horizonte, tolerancia al fallo y —sobre todo— oráculo disponible.

| Arquitectura | Oráculo que requiere | Modo de fallo característico | Cuándo NO |
|---|---|---|---|
| ReAct | La observación del entorno (débil) | Se pierde en horizonte largo cuando el contexto se satura | Muchos pasos sin un plan que sobreviva al ruido |
| Plan-and-execute | El progreso medible contra el plan | El plan rígido caduca: obedece supuestos que ya no valen | Entornos que cambian en ejecución y no hay replan serio |
| Reflection | Uno verificable y externo (tests, compilador) | Sin oráculo, auto-engaño: critica contra su propio juicio | Dominios sin verificador al momento de decidir |
| Code agents | El test / el compilador (fuerte) | Efectos peligrosos sin aislamiento | Dominios no expresables como código; o sin sandbox |

Leída de derecha a izquierda, la tabla es una guía de decisión. Preguntate primero: ¿qué dice, durante la ejecución, que el agente va bien? Si la respuesta es "un test, un compilador, un verificador de estado", reflection y code agents van a converger. Si es "nada firme hasta que un humano lo revise al final", ninguna cantidad de auto-crítica fabrica el oráculo que falta, y conviene un diseño simple con revisión humana en la salida. Segundo: ¿cuántos pasos? Pocos y definidos, ReAct; muchos con un rumbo planificable, plan-and-execute con replan. La moda no entra en ninguna de las dos preguntas.

Estas cuatro son arquitecturas mono-agente: un solo hilo de decisión. Cuando una tarea tienta a repartir el trabajo entre varios agentes aparecen otras topologías y otro conjunto de fallos —los que viven entre agentes—, tema de [Multi-agente: el debate 2025](/blog/multi-agente-el-debate-2025/). Y cuando el agente debe sobrevivir a horas de ejecución y a caídas, la dimensión nueva es la durabilidad, que trata [Agentes durables: checkpoint y replay](/blog/agentes-durables-checkpoint-y-replay/).

## 7. Por qué esto es Quality Engineering

La pregunta que ordena la elección de arquitectura —"¿qué oráculo tengo?"— es, palabra por palabra, la primera pregunta del testing. Una prueba sin oráculo no es una prueba: es una ejecución que nadie sabe leer. Diseñar un agente y diseñar su plan de pruebas resultan la misma actividad desde dos ángulos, porque las dos empiezan por definir qué evidencia dirá si el comportamiento es correcto.

De ahí que la elección no sea un detalle de implementación sino una decisión de riesgo. Elegir reflection en un dominio sin verificador no es un problema de rendimiento: es aceptar un modo de fallo —la confianza infundada— que no se ve en la demo y sí en el percentil que falla con un usuario real. Poner el modo de fallo tolerable y el oráculo disponible en el centro de la decisión es lo que separa elegir una arquitectura de seguir una tendencia.

> Para medir cuál de estas arquitecturas rinde de verdad hace falta evaluarlas por su comportamiento agregado, no por una corrida afortunada: el marco está en [Evaluar agentes: trayectoria, outcome y pass^k](/blog/evaluar-agentes-trayectoria-outcome-pass-k/). Y para el fondo probabilístico de por qué una arquitectura sin oráculo no se puede confiar aunque la demo brille, [Testing de sistemas no deterministas](/blog/testing-sistemas-no-deterministas/).
