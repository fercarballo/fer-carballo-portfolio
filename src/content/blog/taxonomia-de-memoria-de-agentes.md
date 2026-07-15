---
title: "Taxonomía de memoria: episódica, semántica y procedural"
description: "Las tres memorias del agente —episódica, semántica, procedural—, cinco mecanismos con su trampa y cómo se testea cada uno, y la memoria envenenada y su control."
pubDate: 2026-07-15
tags: ['agentes', 'memoria', 'arquitectura', 'quality-engineering', 'sdet']
cluster: 'g03'
clusterTitle: "Memoria y context engineering"
type: satelite
order: 2
readingLevel: "Intermedio–Avanzado"
prerequisites: "Nociones de context engineering."
icon: 'book'
iconHue: 280
---

> **Subtítulo:** Por qué los agentes maduros separan tres memorias —qué pasó, qué es verdad, cómo se hace—, cinco mecanismos para implementarlas con la trampa de cada uno, y cómo se testea una memoria: ¿recupera lo relevante o apenas lo parecido?

> **Nota de alcance.** Ejemplos ilustrativos. Los mecanismos se describen por su forma, no como productos: la implementación concreta cambia con las herramientas. Donde un enfoque tiene fuente canónica (MemGPT/Letta, Generative Agents, Voyager) se la nombra.

---

## Resumen ejecutivo

- "Memoria" en un agente no es una cosa: son tres. Episódica (qué pasó), semántica (qué es verdad) y procedural (cómo se hace) responden preguntas distintas y se guardan distinto. Mezclarlas produce agentes que recuerdan el evento pero olvidan la regla.
- **La pregunta que ordena el diseño no es "¿dónde guardo la memoria?" sino "¿qué tipo de memoria es esta?", porque de eso depende cómo se recupera, cuándo caduca y cómo se testea.**
- Hay cinco mecanismos de uso corriente —ventana con compaction, archivos estructurados, vector store, jerárquica gestionada (MemGPT/Letta), grafos temporales— y ninguno es "el correcto": cada uno guarda bien una cosa y mal otra.
- Testear memoria no es verificar que "guarda": es verificar que recupera lo relevante y no apenas lo parecido, y que los hechos caducos expiran. Se hace con evals de hechos plantados.
- La falla más traicionera es la memoria envenenada: un hecho falso guardado una vez se recupera, se reafirma y se auto-refuerza. Sin verificación en la escritura, la memoria amplifica el error en vez de corregirlo.

Al terminar vas a poder: clasificar qué tipo de memoria necesita una capacidad de tu agente, elegir el mecanismo que la sirve sin arrastrar su trampa, y escribir una eval de memoria que distinga recuperar lo relevante de recuperar lo parecido.

---

## 1. El problema: recuerda el evento, olvida la regla

Un agente de soporte atiende a un usuario que le dice, un martes: "de ahora en más facturame siempre en euros, no en dólares". Tres sesiones después, el agente recuerda con precisión la conversación de aquel día y sin embargo factura en dólares. Recordó el evento y olvidó la norma que el evento establecía.

El problema no es falta de memoria: la conversación estaba guardada. Es que trató un hecho semántico —una regla estable sobre este usuario— como un episodio más del historial, algo que pasó y quedó atrás, en vez de convertirlo en una verdad persistente que se consulta antes de facturar. Esa confusión —tratar tipos distintos de memoria como si fueran uno— es la causa raíz de una familia entera de fallos.

## 2. Las tres memorias

Los sistemas de memoria humana inspiran una distinción que a los agentes les sirve tal cual:

- **Episódica: qué pasó.** El registro de eventos concretos con su contexto temporal: "en la sesión del martes, el usuario pidió X". Reflexion (Shinn et al., 2023) la usa como memoria entre intentos —la auto-crítica de un fallo queda como episodio para el siguiente—; Generative Agents (Park et al., 2023) construye casi todo sobre un stream de episodios.
- **Semántica: qué es verdad.** Hechos y reglas estables, despegados del momento en que se aprendieron: "este usuario factura en euros". Es lo que queda cuando a un episodio le sacás el *cuándo* y te quedás con el *qué*.
- **Procedural: cómo se hace.** Habilidades y procedimientos reutilizables. Voyager (Wang et al., 2023) es el ejemplo canónico: acumula una biblioteca de habilidades en Minecraft y reutiliza las que funcionaron. Claude Skills (2025) lleva la idea a procedimientos empaquetados como archivos.

Los sistemas maduros las separan porque se recuperan y caducan distinto. Un episodio no caduca —pasó y ya—; un hecho semántico sí, porque el usuario puede cambiar de opinión; un procedimiento se versiona como código. Guardar los tres en la misma bolsa —el historial— es lo que produce el fallo de la sección 1.

## 3. Cinco mecanismos para implementarlas

Ninguno es el mecanismo correcto en abstracto; cada uno sirve bien un tipo de memoria y traiciona otro:

| Mecanismo | Qué guarda mejor | La trampa | Cómo se testea |
|---|---|---|---|
| Ventana + compaction | Episódica reciente | El resumen pierde el detalle que luego importa | Golden facts que sobreviven al resumen |
| Archivos estructurados | Semántica y procedural | Sin poda, crece y contamina | El agente relee y reproduce la decisión |
| Vector store / RAG | Episódica y semántica a escala | Recupera lo parecido, no lo relevante | Recall de hechos plantados vs. distractores |
| Jerárquica (MemGPT/Letta) | Todo, paginado por relevancia | La paginación deja afuera lo que hacía falta | ¿Trae el hecho correcto cuando la tarea lo pide? |
| Grafos temporales | Semántica con validez temporal | Costo de construir y mantener el grafo | ¿El hecho caduco expira? Consulta "as-of" |

No hay ganador universal: un chatbot de sesión corta vive bien con ventana más compaction; un agente que acumula conocimiento de un dominio necesita algo consultable —vector store, grafo o archivos—. MemGPT (Packer et al., 2023), continuado como Letta (2024), gestiona la memoria como un sistema operativo pagina RAM y disco: lo caliente en la ventana, lo frío afuera. Potente y, por lo mismo, con más piezas que pueden fallar.

## 4. Evals de memoria: hechos plantados

Testear memoria "a ojo" no sirve: el síntoma aparece sesiones después de la causa. La técnica es la de **hechos plantados** (planted facts):

1. Sembrá hechos conocidos en la historia del agente: uno relevante para una pregunta futura, más varios distractores parecidos en las palabras pero incorrectos en el contenido.
2. Más tarde, hacé la pregunta que solo se responde bien con el hecho relevante.
3. Medí: ¿recuperó el hecho relevante o trajo el distractor parecido?

Dos propiedades hay que afirmar, y son distintas:

- **Relevancia sobre similitud.** El caso de prueba que importa es el distractor: un hecho que suena parecido pero dice otra cosa. Un sistema que lo trae "porque se parece" reprueba, aunque su recall promedio sea alto. Es, punto por punto, la trampa del vector store.
- **Caducidad.** Plantá un hecho, después su reemplazo ("factura en euros" → "volvé a dólares"), y verificá que el agente usa el vigente y no el viejo. Una memoria que no expira es una memoria que miente con datos de ayer.

La mecánica es la misma que se usa para evaluar recuperación en RAG —recall, precisión y la distinción entre relevante y parecido—, aplicada acá a la memoria del propio agente (ver [RAG: evaluación de recuperación, citas y abstención](/blog/rag-evaluacion-recuperacion-citas-abstencion/)).

## 5. La memoria envenenada

Una memoria persistente que además se escribe sola tiene un modo de falla propio y grave. Si el agente guarda como hecho semántico algo falso —porque alucinó, porque un dato de entrada estaba mal, o porque alguien lo inyectó a través de un documento que el agente leyó—, ese hecho se va a recuperar en turnos futuros, va a sesgar las respuestas y, peor, puede reescribirse reforzado: "ya lo afirmé antes, debe ser verdad". El error no se diluye: se compone.

El control es en la escritura, no solo en la lectura:

- **Verificación al persistir.** No todo lo que el agente produce merece volverse memoria. Un gate antes de escribir —¿esto viene de una fuente confiable? ¿lo confirmó una herramienta o lo dijo el modelo?— es mucho más barato que limpiar memoria envenenada después.
- **Procedencia.** Guardar de dónde salió cada hecho (usuario, herramienta verificada, inferencia del modelo) permite despriorizar o purgar por origen cuando algo sale mal.
- **Caducidad.** Hechos semánticos con fecha y política de expiración no se vuelven verdades eternas por inercia.
- **El test.** Una eval de envenenamiento planta un hecho falso y verifica que el sistema no lo propaga a sus conclusiones, o que al menos lo marca como no confiable.

## 6. Por qué esto es Quality Engineering

Separar las tres memorias es una decisión de diseño con consecuencias testeables. La pregunta "¿qué tipo de memoria es esto?" es, en el fondo, dos preguntas de QA disfrazadas: "¿cómo la recupero y verifico?" y "¿cuándo debería caducar?". Un agente que no distingue episodio de regla no tiene un problema de almacenamiento: tiene un problema de diseño que ninguna ventana más grande arregla.

> La memoria es lo que alimenta el contexto; para administrar ese contexto como recurso finito, el pilar de esta colección: [Context engineering](/blog/context-engineering-el-contexto-como-recurso-finito/). El mecanismo de archivos —el más simple de los cinco y el más auditable— tiene su propio artículo: [Archivos como memoria del agente](/blog/archivos-como-memoria-del-agente/). Y para las evals de recuperación que esta nota reutiliza, [RAG: evaluación de recuperación, citas y abstención](/blog/rag-evaluacion-recuperacion-citas-abstencion/).
