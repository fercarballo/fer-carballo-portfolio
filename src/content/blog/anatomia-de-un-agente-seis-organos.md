---
title: "Anatomía de un agente: los seis órganos y dónde falla cada uno"
description: "Los seis órganos de todo agente leídos como un mapa de riesgos: qué es cada uno, qué decisión de diseño implica, cómo falla y con qué síntoma observable."
pubDate: 2026-07-15
tags: ['agentes', 'arquitectura', 'quality-engineering', 'tool-use', 'sdet']
cluster: 'g01'
clusterTitle: "Anatomía del agente y workflows"
type: pilar
order: 1
readingLevel: "Intermedio"
prerequisites: "Nociones de LLMs vía API; haber leído el espectro de autonomía ayuda."
icon: 'set'
iconHue: 205
---

> **Subtítulo:** Los seis componentes que forman cualquier agente —modelo, contexto, herramientas, memoria, condición de parada y guardrails— leídos no como partes sino como puntos de falla: qué decide cada uno y cómo se rompe.

> **Nota de alcance.** Ejemplos ilustrativos sobre sistemas ficticios. Los seis órganos son un modelo mental de diseño, no una arquitectura de referencia única; los nombres y los límites de cada pieza cambian entre frameworks. Revalidá contra tu stack.

---

## Resumen ejecutivo

- Todo agente, por más sofisticado que parezca, se descompone en **seis órganos**: modelo, contexto, herramientas, memoria, condición de parada y guardrails. No hay un séptimo escondido.
- **La anatomía no es un diagrama de cajas: es un mapa de riesgos. Cada órgano toma una decisión de diseño, y cada decisión trae su modo de fallo con un síntoma observable.**
- Los seis se acoplan en un loop: el modelo decide, las herramientas actúan, el contexto entra en cada vuelta, la condición de parada corta y los guardrails envuelven todo.
- Saber dónde vive cada falla convierte "el agente anda mal" —una queja inútil— en un diagnóstico con nombre y con un control asociado.
- Leída al revés, la lista de órganos es un checklist de review de diseño: seis preguntas que un agente tiene que contestar antes de salir a producción.

Al terminar vas a poder: nombrar los seis componentes de cualquier agente, ubicar en cuál vive un comportamiento defectuoso, anticipar el modo de fallo de cada decisión de diseño y usar la anatomía como guía de revisión antes de aprobar una arquitectura.

---

## 1. El problema: un agente es una caja negra hasta que se abre

Un agente en producción devuelve algo raro. Cerró un ticket que no debía, gastó diez veces lo esperado, o "se olvidó" de una instrucción que estaba escrita en el prompt. La conversación que sigue suele ser la misma en todos lados: alguien dice "el modelo alucinó", otro sospecha del prompt, un tercero propone cambiar de modelo. Tres hipótesis, cero método.

El problema no es la falta de ideas: es la falta de un mapa. Sin una descomposición del agente en partes, cada falla se atribuye a "la IA" en abstracto, y "la IA" no es un lugar donde se pueda poner un control. Un sistema que no se puede descomponer no se puede diagnosticar, y lo que no se puede diagnosticar se termina arreglando a fuerza de probar cosas hasta que el síntoma se calla.

Este artículo abre la caja. Un agente —cualquiera, del más simple al más autónomo— está hecho de seis órganos. Cada uno se puede nombrar, cada uno toma una decisión de diseño concreta y cada uno falla de una manera reconocible. La anatomía, leída con ojos de QA, es exactamente eso: un mapa de dónde puede romperse la casa antes de que se rompa.

## 2. El loop y dónde vive cada órgano

Antes de los órganos, la circulación que los conecta. Un agente no es una tubería de una sola pasada: es un loop. El modelo decide una acción, una herramienta la ejecuta, el resultado vuelve como observación, y el modelo decide otra vez — hasta que algo lo detiene.

```text
  ╭──── guardrails envuelven el loop: validan entradas y salidas ────╮

     contexto ─┐
     memoria  ─┼─► ┌─────────┐    acción     ┌──────────────┐
     estado   ─┘   │ modelo  │──────────────►│ herramientas │
                   │ decide  │◄──────────────│   ejecutan   │
                   └─────────┘  observación  └──────────────┘
                            │
                            ▼
                    ¿condición de parada?  ──no──►  otra vuelta
                            │ sí
                            ▼
                        resultado

  ╰──── guardrails envuelven el loop: validan entradas y salidas ────╯
```

Los seis órganos se ubican sobre ese loop: el **modelo** es el que decide; las **herramientas** son con lo que actúa; el **contexto** es lo que ve en cada vuelta; la **memoria** es lo que sobrevive de una vuelta a la siguiente y de una sesión a la otra; la **condición de parada** es lo que corta el loop; y los **guardrails** son la capa que valida lo que entra y lo que sale, sin depender del criterio del modelo. Ninguno es opcional: un agente sin condición de parada explícita igual tiene una, pero mala; y uno sin guardrails igual tiene una superficie de ataque, pero abierta.

## 3. El modelo: el motor de decisiones

**Qué es.** El LLM que, en cada vuelta del loop, elige qué hacer a continuación. Es el único órgano que no es código determinista: ante la misma entrada, puede responder distinto.

**La decisión de diseño.** Qué modelo usar, y con qué relación entre capacidad, costo y latencia. Un modelo más grande razona mejor en cadenas largas pero cuesta y tarda más; uno más chico abarata cada paso y encarece los errores. La elección no es "el mejor modelo", es "el modelo mínimo que sostiene la tarea".

**El modo de fallo.** Razonamiento incorrecto expresado con seguridad: el modelo elige una acción que no corresponde y la justifica como si correspondiera. No es ruido aleatorio, es un error convincente. El síntoma observable son trayectorias que se leen coherentes paso a paso pero no llegan al objetivo, y una tasa de éxito que se derrumba a medida que la tarea se alarga —porque la confiabilidad de la cadena es el producto de la de cada paso, y multiplicar números menores que uno solo puede bajar—.

## 4. El contexto: la ventana por la que mira el modelo

**Qué es.** Todo lo que el modelo recibe en cada llamada: instrucciones, historial, resultados de herramientas, fragmentos de memoria recuperados. Es la única realidad que el modelo conoce, y es finita: tiene que caber en una ventana de tokens.

**La decisión de diseño.** Qué entra y qué se comprime u omite. Meter todo "por las dudas" no es gratis: cuesta tokens, sube la latencia y —lo menos intuitivo— diluye la atención sobre lo que importa. El contexto es un recurso que se administra, no un balde que se llena.

**El modo de fallo.** Saturación: información clave queda enterrada entre relleno o directamente expulsada de la ventana. El síntoma observable es un agente que "olvida" una instrucción dada al inicio, repite trabajo que ya había hecho, o cuya calidad se degrada cuanto más larga se vuelve la conversación. La pieza que decide qué recordar y qué tirar tiene su propia colección en la serie; acá alcanza con fijar que el contexto es un órgano, que es finito y que se satura.

## 5. Las herramientas: la superficie de contacto con el mundo

**Qué es.** Las funciones que el modelo puede invocar para leer o modificar el mundo: una API, una query, un comando, una búsqueda. Son lo que convierte una decisión textual en un efecto real.

**La decisión de diseño.** Qué herramientas exponer, con qué esquema y con qué permisos. Cada herramienta agregada es una capacidad nueva y, al mismo tiempo, una superficie nueva de error y de ataque. La regla que conviene es la del privilegio mínimo: la herramienta más peligrosa es la que está disponible y no hacía falta.

**El modo de fallo.** Tiene dos sabores. El leve: una llamada mal formada que no respeta el esquema y falla ruidosamente. El grave: una llamada bien formada a una herramienta con efectos irreversibles, ejecutada cuando no correspondía. El síntoma observable del primero son errores de validación en los logs; el del segundo es peor porque es silencioso: un efecto real que no debía ocurrir —un mail enviado, un registro borrado, un pago disparado— y que ninguna validación de formato habría frenado.

## 6. La memoria: lo que sobrevive al paso siguiente

**Qué es.** Lo que persiste más allá de la ventana de contexto: la memoria de trabajo dentro de una tarea y la memoria de largo plazo entre sesiones. Es lo que permite que un agente no empiece de cero cada vez.

**La decisión de diseño.** Qué se guarda, cómo se recupera y —lo que más se descuida— cuándo se olvida. Una memoria sin política de olvido crece sin límite y se contamina: cada hecho guardado es un hecho que puede volver, correcto o no.

**El modo de fallo.** Memoria envenenada o desactualizada: un dato falso o vencido que se guardó una vez y se recupera para siempre. El síntoma observable es un agente que insiste en una preferencia que ya cambió, repite un error que se había corregido, o arrastra una "verdad" que nadie sabe de dónde salió. A diferencia de una alucinación, que dura un momento, la memoria envenenada es persistente: falla igual cada vez, hasta que alguien la limpia a mano.

## 7. La condición de parada: el freno

**Qué es.** La regla que decide cuándo el loop termina. Puede ser objetivo cumplido y verificado, presupuesto agotado, falta de progreso o escalada a un humano.

**La decisión de diseño.** Qué cuenta como "terminado" y qué límites duros —pasos, tokens, tiempo, dinero— cortan el loop pase lo que pase. Es el órgano más subestimado del agente, porque no aparece en la demo: la demo siempre usa tareas que terminan bien.

**El modo de fallo.** Ausente o mal definida, el loop no sabe cuándo parar. El síntoma observable son loops que divagan, se atascan en subtareas inútiles y queman presupuesto sin llegar a nada — exactamente lo que mostraron los loops autónomos virales de 2023 (AutoGPT, BabyAGI), la lección negativa que fundó buena parte de la disciplina. El fallo simétrico también existe: parar demasiado pronto y entregar incompleto. Un agente que sabe terminar bien, pero no cortar mal, no está listo para producción.

## 8. Los guardrails: el sobre que valida entradas y salidas

**Qué es.** La capa de validaciones que envuelve el loop: qué entradas se aceptan, qué acciones se permiten, qué salidas se dejan pasar. La distinción clave es que son código determinista, no criterio del modelo. Un guardrail no le pide al agente que se porte bien: le impide portarse mal.

**La decisión de diseño.** Qué se valida con reglas duras y qué se delega al juicio del modelo. Todo lo que tenga consecuencias —datos sensibles, acciones con efectos, límites de política— pertenece a los guardrails, no a la buena voluntad del prompt.

**El modo de fallo.** Ausentes o permisivos, dejan pasar lo que debían frenar. El síntoma observable es una inyección de prompt que consigue su objetivo, una acción fuera de política que el sistema ejecutó sin bloquear, o un dato que salió por un canal que no debía. Cuando conviven datos privados, contenido no confiable y un canal de salida, la falta de guardrails no es un riesgo teórico: es una fuga esperable.

## 9. El mapa de fallos, y la anatomía como checklist

Puestos en una tabla, los seis órganos dejan de ser un diagrama y se vuelven una lista de riesgos con su control al lado:

| Órgano | Decisión de diseño | Modo de fallo | Síntoma observable | Control asociado |
|---|---|---|---|---|
| Modelo | Capacidad vs costo y latencia | Razonamiento errado con seguridad | El éxito cae al alargarse la tarea | Evals de trayectoria; modelo acorde a la dificultad |
| Contexto | Qué entra, qué se comprime | Saturación; info clave expulsada | "Olvida" instrucciones; repite trabajo | Presupuesto de contexto; compactación |
| Herramientas | Cuáles, con qué permisos | Llamada inválida o efecto irreversible | Errores de esquema; efecto real no deseado | Esquemas tipados; permiso mínimo; dry-run |
| Memoria | Qué guarda, cuándo olvida | Memoria envenenada o vencida | Datos falsos que "vuelven" | Política de olvido; memoria auditable |
| Condición de parada | Qué es "terminado"; límites duros | Ausente o mal definida | Loops, divagación, costo sin techo | Presupuestos como SLO; detección de no-progreso |
| Guardrails | Qué valida el código, no el modelo | Ausentes o permisivos | Inyección exitosa; acción fuera de política | Validación determinista de entrada y salida; sandbox |

La utilidad de la tabla no es descriptiva sino operativa. Leída de arriba hacia abajo antes de aprobar un diseño, es un checklist de review: ¿el modelo elegido aguanta la longitud real de la tarea? ¿el contexto tiene un presupuesto o se llena solo? ¿las herramientas corren con el permiso mínimo? ¿la memoria tiene política de olvido? ¿la condición de parada está escrita en código o es un deseo? ¿los guardrails validan de verdad o confían en que el modelo se porte bien? Seis preguntas. Un agente que no las contesta no está terminado: está a la espera de que el modo de fallo correspondiente aparezca en producción.

Ese es el sentido de leer la anatomía como un mapa de riesgos: cada órgano es, a la vez, una capacidad y una amenaza. Diseñar el agente y testearlo no son dos tareas —son la misma tarea mirada desde los dos lados de cada pieza.

> Para evaluar con método las salidas de cada órgano —scorers, jueces, control estadístico—, ver [Evaluar aplicaciones con LLM](/blog/evaluar-aplicaciones-llm/), con la implementación de referencia en [`llm-evals-harness`](https://github.com/fercarballo/llm-evals-harness). La evaluación del comportamiento del loop completo —no de una pieza, sino de la trayectoria— es tema de [Trayectoria, outcome y pass^k](/blog/evaluar-agentes-trayectoria-outcome-pass-k/); la superficie de seguridad que abren juntas las herramientas, el contexto y la memoria, de [La tríada letal](/blog/la-triada-letal-seguridad-de-agentes/).
