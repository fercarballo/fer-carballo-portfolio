---
title: "Context engineering: el contexto es un recurso finito"
description: "Por qué el contexto es un recurso finito: qué entra en cada turno, las patologías que lo degradan, las técnicas para administrarlo y cómo QA detecta la deriva."
pubDate: 2026-07-15
tags: ['context-engineering', 'agentes', 'quality-engineering', 'llm-evaluation', 'sdet']
cluster: 'g03'
clusterTitle: "Memoria y context engineering"
type: pilar
order: 1
readingLevel: "Intermedio–Avanzado"
prerequisites: "Haber usado LLMs vía API; nociones de agentes."
icon: 'book'
iconHue: 280
---

> **Subtítulo:** Qué ocupa la ventana de contexto en cada turno, las tres patologías que la degradan a medida que crece, las técnicas para administrarla con su costo oculto, y cómo se detecta y testea la deriva desde QA.

> **Nota de alcance.** Ejemplos ilustrativos sobre sistemas ficticios; los tamaños y proporciones que aparecen son órdenes de magnitud, no benchmarks. Las ventanas de contexto y las APIs de herramientas cambian rápido: revalidá los límites contra tu versión.

---

## Resumen ejecutivo

- El salto de 2025 no fue de modelo sino de disciplina: de redactar el mejor prompt a administrar todo lo que el modelo ve en cada turno. "Effective context engineering" (Anthropic, 2025) le puso nombre y una tesis: el contexto es un recurso finito con retornos decrecientes.
- **Más contexto no es más capacidad: pasado cierto punto, cada token agregado compite por atención con el resto y la calidad cae. El contexto no es un balde que se llena; es un presupuesto que se gasta.**
- En cada turno entran cinco cosas —instrucciones, historial, memoria recuperada, resultados de herramientas y catálogo de tools— y algunas crecen solas. El catálogo es un impuesto fijo: se paga aunque no se use ninguna herramienta.
- Las técnicas para administrarlo (compaction, carga diferida, notas fuera del contexto, subagentes) no son gratis: cada una cambia un problema por otro, y ese costo oculto es lo que hay que testear.
- Para QA, la degradación de contexto es un modo de falla con síntomas medibles —olvida el objetivo, repite acciones, se contradice— y una estrategia de compaction es testeable: hay hechos que DEBEN sobrevivir al resumen.

Al terminar vas a poder: nombrar qué compone el contexto en cada turno, reconocer las tres patologías que lo degradan, elegir una técnica de administración sabiendo qué costo pagás, y diseñar una eval que detecte la deriva antes de que llegue a producción.

---

## 1. El problema: el agente que empieza brillante y termina perdido

Un agente de código arranca una tarea larga: migrar una API a través de una docena de archivos. Los primeros quince turnos son impecables —lee, entiende, propone, corrige—. Cerca del turno cuarenta algo se tuerce. Vuelve a abrir un archivo que ya había leído. Propone una solución que él mismo había descartado veinte turnos antes. En algún momento, pregunta cuál era el objetivo. El modelo no cambió. Lo que cambió es lo que tiene delante: una ventana atiborrada de su propia historia.

El reflejo es pedir una ventana más grande, pero el problema no es de tamaño: un agente con una ventana de 200.000 tokens llena de ruido rinde peor que uno con 30.000 bien elegidos. Lo que falla no es la capacidad, es la administración de un recurso escaso. Y esa administración tiene nombre desde 2025: context engineering.

## 2. De prompt engineering a context engineering

El prompt engineering optimiza una cosa: la instrucción que un humano escribe. Funciona perfecto en una interacción de un solo turno, texto a texto. Pero un agente corre decenas de turnos, y en cada uno la entrada no es un prompt redactado por una persona: es una acumulación que ensambló el sistema —instrucciones, historial, memoria recuperada, resultados de herramientas y catálogo de tools—. Nadie escribió a mano ese bloque de decenas de miles de tokens: se armó solo.

"Effective context engineering" (Anthropic, 2025) nombró la disciplina que se ocupa de eso y fijó su tesis central: el contexto es un recurso finito con retornos decrecientes. Pasado cierto punto, agregar deja de sumar y empieza a restar: cada token compite con los demás por la atención del modelo.

La diferencia con el prompt engineering es de pregunta. La vieja era "¿cómo redacto la instrucción?"; la nueva es **"¿qué merece ocupar un lugar en la ventana, y a costa de qué?"**. Context engineering decide qué ve el modelo en cada turno —qué se incluye, qué se recupera, qué se resume y qué se descarta— entendiendo que el espacio es finito y que agregar no siempre suma.

## 3. Qué compone el contexto en cada turno

Antes de administrar el recurso hay que saber quién lo consume. En cada turno el modelo recibe cinco cosas, y no todas se comportan igual:

```text
   EN CADA TURNO, EL MODELO RECIBE:

   Instrucciones del sistema     ──►  fijo        (se paga cada turno)
   Catálogo de herramientas      ──►  fijo        (impuesto: se use o no)
   Historial de la conversación  ──►  CRECE  ▲    (con cada turno)
   Memoria recuperada            ──►  variable    (según la tarea)
   Resultados de herramientas    ──►  CRECE  ▲    (a veces enorme)
                                        │
                          ▲ = crece sin que nadie lo decida turno a turno
```

- **Instrucciones y catálogo de herramientas:** el rol y las reglas, más la definición de cada tool —nombre, descripción, esquema—. Fijos: se pagan en cada turno, se usen o no.
- **Historial de la conversación:** todos los turnos previos, con pedidos, respuestas y razonamiento intermedio. Crece.
- **Memoria recuperada:** lo que un sistema de memoria trae para esta tarea puntual. Variable.
- **Resultados de herramientas:** la salida de cada tool call, y el que más sorprende: un archivo entero, una respuesta de API sin filtrar o un log de miles de líneas entran crudos si nadie los recorta.

Dos de los cinco se acumulan solos, sin que ninguna decisión explícita lo autorice: ahí nace la patología, el recurso finito se gasta sin permiso.

## 4. Las tres patologías

**Degradación con ventanas largas.** A medida que la ventana se llena, la capacidad del modelo de atender a lo relevante cae: no es un corte abrupto, es un deterioro gradual. En la práctica, los tokens del principio y del final pesan más que los del medio, y un hecho crítico sepultado en la mitad de una ventana enorme puede, para la decisión, no existir. Es la cara concreta de los "retornos decrecientes".

**Distracción por información irrelevante.** Cada resultado sin filtrar, cada archivo entero volcado al contexto, cada turno viejo que ya no importa, compite por atención con lo que sí importa. El contexto irrelevante no es neutro: activa asociaciones que empujan al modelo a divagar.

**El catálogo de herramientas como impuesto fijo.** Cada tool disponible ocupa su definición en el contexto en todos los turnos, se use o no. Cincuenta herramientas "por las dudas" es un costo que se paga cincuenta veces por conversación, y encima empeora la elección: más opciones no es mejor selección, es más superficie donde equivocarse.

Las tres se combinan y se potencian. Una ventana larga, llena de resultados sin filtrar y de definiciones de herramientas que nunca se usan, es el peor de los mundos: cara, lenta y peor que una ventana chica y curada. La intuición de "cuanto más sepa, mejor" es exactamente al revés.

## 5. Las técnicas y su costo oculto

Administrar el contexto es elegir qué sacrificar. Cada técnica resuelve una patología y paga por otro lado:

| Técnica | Qué hace | Cuándo conviene | Costo oculto |
|---|---|---|---|
| Compaction | Resume el historial viejo cuando la ventana se acerca al límite | Conversaciones largas donde el detalle literal ya no hace falta | El resumen puede tirar justo el hecho que después importa |
| Carga diferida de herramientas | Expone pocas tools y descubre las demás bajo demanda | Catálogos grandes que inflan el impuesto fijo | Agrega un paso de descubrimiento; lo que el modelo no sabe que existe, no lo pide |
| Notas fuera del contexto | El agente escribe lo importante afuera y lo relee cuando hace falta | Hechos que deben sobrevivir muchos turnos | Hay que decidir qué escribir y cuándo releer; una nota nunca releída da falsa persistencia |
| Subagentes | Delega una subtarea a un agente con ventana limpia que devuelve solo el resultado | Subtareas paralelizables o exploraciones que ensuciarían el contexto principal | Multiplica el costo en tokens (del orden de 15×, según Anthropic) y agrega coordinación |

Ninguna técnica elimina el problema: lo mueve de lugar. La compaction cambia "ventana llena" por "riesgo de perder un hecho"; los subagentes cambian "contexto sucio" por "costo y coordinación". Elegir bien no es encontrar la técnica sin costo —no existe—, sino saber qué costo podés pagar.

## 6. El ángulo QA: detectar la deriva y testear la compaction

La degradación de contexto es un modo de falla con síntomas observables que se pueden convertir en checks. Lo traicionero es que no tira una excepción: el agente sigue funcionando, apenas peor, hasta que la decisión final está mal.

Tres síntomas medibles sobre la trayectoria, no sobre la salida final:

- **Olvida el objetivo.** El agente pregunta algo que ya sabía o se desvía de la meta declarada. Test: sembrar el objetivo como golden fact y verificar que sigue presente y respetado a lo largo del recorrido.
- **Repite acciones.** Vuelve a ejecutar una tool call idéntica o relee un archivo ya leído. Test: contar acciones duplicadas; un pico es señal de deriva.
- **Se contradice.** Afirma algo que choca con un paso previo. Test: chequear consistencia entre afirmaciones, con un juez que recibe la trayectoria como evidencia.

Los tres evalúan la trayectoria, no la respuesta: es la unidad de análisis que estos sistemas exigen (ver [Del loop ReAct a plan-and-execute](/blog/del-loop-react-al-plan-and-execute/)).

La segunda pieza es testear una **estrategia de compaction**. Una compaction es código que transforma estado y, como toda transformación, es testeable. La técnica: definir golden facts —los hechos que la tarea necesita sí o sí: el objetivo, una decisión y su razón, una restricción del usuario, un ID—, sembrarlos en una conversación larga, forzar la compaction y verificar que cada uno sigue recuperable después del resumen.

```text
   Conversación larga con hechos sembrados
     · objetivo:    "migrar a la API v2 sin romper v1"   [golden]
     · decisión:    "se descartó el enfoque X porque…"   [golden]
     · restricción: "no tocar la tabla de pagos"         [golden]
     · 200 turnos de detalle intercambiable              [descartable]
                     │
                     ▼   COMPACTION
                     │
                     ▼
   Resumen  →  ¿sobreviven los 3 golden facts?
               sí = la estrategia pasa   ·   no = reprueba
```

Como la lista de golden facts es explícita, la eval es reproducible: corre en cada cambio del prompt de compaction, del modelo o de la política de recorte, como cualquier test de regresión.

## 7. Por qué esto es Quality Engineering

Context engineering es gestión de riesgo de un recurso escaso. El contexto es la memoria de trabajo del agente, y una memoria que se degrada en silencio —sin excepción, sin stack trace, solo con decisiones cada vez peores— es la clase de falla que QA sabe cazar. La disciplina que diseña casos por riesgo, mide comportamiento agregado y desconfía de las demos es la que este terreno necesita: el problema es nuevo, el criterio es el de siempre.

La consecuencia cierra el círculo con la sección 1: la solución a "el agente se pierde" casi nunca es una ventana más grande, sino curar lo que entra, medir la deriva con las tres señales y blindar la compaction con golden facts. Menos contexto, mejor elegido, testeado.

> El contexto es uno de los seis órganos del agente; para ver dónde encaja con los otros cinco, [Anatomía de un agente: seis órganos](/blog/anatomia-de-un-agente-seis-organos/). Para evaluar trayectorias y no solo salidas, [Del loop ReAct a plan-and-execute](/blog/del-loop-react-al-plan-and-execute/). El marco de evals que estas pruebas asumen está en [Evaluar aplicaciones con LLM](/blog/evaluar-aplicaciones-llm/), y los scorers y jueces con los que se implementan viven en [`llm-evals-harness`](https://github.com/fercarballo/llm-evals-harness).
