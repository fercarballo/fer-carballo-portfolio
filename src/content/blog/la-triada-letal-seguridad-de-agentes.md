---
title: "La tríada letal: por qué un agente seguro se diseña, no se parchea"
description: "Inyección directa e indirecta, la tríada letal de Willison y por qué en un agente que actúa la exfiltración es una condición de diseño que se rompe por una pata, no un parche."
pubDate: 2026-07-15
tags: ['seguridad', 'agentes', 'threat-modeling', 'quality-engineering', 'sdet']
cluster: 'g06'
clusterTitle: "Seguridad agéntica"
type: pilar
order: 1
readingLevel: "Intermedio–Avanzado"
prerequisites: "Nociones de agentes y de seguridad web básica."
icon: 'shield'
iconHue: 355
---

> **Subtítulo:** Por qué en un agente la inyección ya no produce texto malo sino acciones, qué cambia entre inyección directa e indirecta, y por qué la tríada letal vuelve la exfiltración una propiedad del diseño y no un bug puntual que se parchea.

> **Nota de alcance.** Ejemplos ilustrativos sobre sistemas ficticios. No hay payloads reutilizables ni técnicas para vulnerar sistemas ajenos: acá se testean defensas propias. Las herramientas y las taxonomías de este terreno cambian rápido; revalidá contra tu versión.

---

## Resumen ejecutivo

- En una app de chat, una inyección exitosa produce **una respuesta mala**, y una respuesta mala se descarta. En un agente con herramientas, la misma inyección produce **una acción**, y una acción con efectos ya ocurrió cuando la detectás.
- La inyección peligrosa casi nunca entra por el usuario: entra por el **documento, la página o el issue** que el agente lee para hacer su tarea. Todo contenido observado es entrada no confiable, aunque el usuario sea de confianza.
- **La tríada letal (Simon Willison, 2025) —datos privados + contenido no confiable + un canal de salida— no describe una vulnerabilidad: describe una condición de diseño. Con las tres patas presentes, la exfiltración es esperable, no excepcional.**
- Por eso un agente seguro no se parchea: se diseña para que falte al menos una pata. La defensa no es "detectar el ataque", es "romper el circuito que lo vuelve rentable".
- Los clasificadores de prompts adversariales son una capa útil e imperfecta, no una solución. Toda mitigación se evalúa por qué pata rompe y a qué costo, igual que cualquier control de seguridad.

Al terminar vas a poder distinguir inyección directa de indirecta, nombrar las tres patas de la tríada letal en un sistema concreto, decidir cuál romper según el costo, y explicar por qué la seguridad de un agente es una decisión de arquitectura y no un filtro que se agrega al final.

---

## 1. El problema: el issue que abre una pull request que nadie pidió

Un agente de mantenimiento clasifica los issues de un repositorio privado: los lee, los ordena por tipo, y para los triviales propone un cambio y abre una pull request. Tiene acceso de lectura al código —incluida la configuración— y permiso para comentar y abrir PRs. Es útil, ahorra horas, y funciona.

Un día alguien abre un issue que, entre un reporte de bug perfectamente legítimo, incluye una línea dirigida no al mantenedor sino al agente: una instrucción para que lea un archivo de configuración y lo incluya, "como contexto", en un comentario público del issue. El agente lee el issue como parte de su tarea. Obedece. El secreto queda publicado en un hilo abierto.

Nadie escribió nada hostil en un chat. El usuario que reportó el bug real no hizo nada malo. El ataque viajó **dentro del dato que el agente tenía que procesar**, y el daño no fue un párrafo desafortunado: fue una acción con efecto en el mundo. Ese salto —de texto a acción— es lo que vuelve la seguridad de agentes un problema distinto, y este artículo fija el marco para pensarlo.

## 2. De texto malo a acción: qué cambia cuando el sistema actúa

En una aplicación con LLM que solo genera texto, el peor caso de una inyección es una salida incorrecta, ofensiva o filtrada en pantalla. Es un problema real, pero acotado: la salida es el final del recorrido, y una salida mala se revisa, se descarta o se regenera.

Un agente rompe ese límite porque la salida del modelo no termina en pantalla: **alimenta una herramienta**. El modelo no solo *dice*, decide *hacer* —llamar una API, escribir un archivo, mandar un mail, ejecutar un comando—. La inyección, entonces, no compite por convencerte a vos: compite por dirigir la próxima acción del agente. Cuando lo logra, no hay un paso de revisión humana entre la decisión y el efecto, porque justamente el valor del agente era no tener que revisarlo.

Esto reordena las prioridades. La pregunta de seguridad deja de ser "¿puede el modelo decir algo indebido?" y pasa a ser "¿qué es lo peor que este agente puede *hacer* si una instrucción hostil se cuela en su contexto?". El tamaño de esa respuesta es el tamaño del riesgo, y depende por completo de las herramientas que le diste. Un agente de solo lectura y uno con permiso de escritura sobre producción sufren la misma inyección con consecuencias incomparables.

## 3. Directa vs indirecta: el atacante le habla a los datos, no al agente

Conviene separar dos vías, porque las defensas no son las mismas.

- **Inyección directa.** El atacante es el usuario: escribe la instrucción hostil en el mensaje. Es la versión visible, la que casi todos imaginan, y la más fácil de acotar cuando el usuario es de confianza.
- **Inyección indirecta.** El atacante no le habla al agente: le habla **a través de los datos que el agente consume**. El payload vive en la página que se resume, el issue que se clasifica, el PDF que se procesa, el correo que se responde. El usuario puede ser completamente legítimo y aun así entregar el veneno sin saberlo, porque el veneno estaba en el material.

La inyección indirecta es la peligrosa, y la razón es estructural: **el contenido observado no es confiable por defecto**, aunque provenga de una fuente que sí lo es. Un agente que lee la web, un buzón compartido o un repositorio con contribuciones externas está, por definición, ingiriendo texto que un tercero pudo escribir. Tratar ese texto como "contexto" en lugar de como "entrada de un desconocido" es el error de diseño original del que salen casi todos los incidentes.

La regla mínima, entonces: **separá instrucciones de datos**. Lo que el agente *lee* nunca debería tener la misma autoridad que lo que el operador le *ordena*. En la práctica esa separación es difícil de sostener al cien por ciento —el modelo puede confundir los roles—, y por eso no alcanza sola. Es una pata del problema, no el problema entero. El problema entero tiene nombre.

## 4. La tríada letal: por qué la exfiltración es esperable

Simon Willison le puso nombre en 2025 a la combinación que convierte la inyección indirecta en un desastre: la **tríada letal** (*lethal trifecta*). Son tres capacidades que, juntas en el mismo agente, hacen que la exfiltración de datos deje de ser un accidente para volverse un resultado esperable.

```text
                     EXFILTRACIÓN
                 (resultado esperable)
                          ▲
                          │  el ataque cierra el circuito
          ┌───────────────┼───────────────┐
          │               │               │
    [1] DATOS       [2] CONTENIDO    [3] CANAL DE
       PRIVADOS         NO CONFIABLE      SALIDA
    en el contexto   que el agente     hacia afuera
    del agente       lee como dato     (red, mail, PR,
    (secretos, PII,  (web, issue,       comentario,
     repos, mails)    PDF, correo)      tool de escritura)

   las 3 patas presentes  →  hay circuito: leer secreto y sacarlo
   falta una pata         →  el circuito no cierra; el ataque no rinde
```

La lógica es la de un circuito eléctrico: hace falta que las tres estén conectadas para que la corriente fluya. Con **datos privados** en el contexto, **contenido no confiable** que puede portar instrucciones, y un **canal de salida** hacia afuera, un atacante puede, mediante inyección indirecta, ordenarle al agente que lea lo privado y lo empuje por el canal. No necesita romper nada: usa el sistema exactamente para lo que fue construido, con una instrucción que el agente encontró en sus propios datos.

El punto que cambia todo el enfoque es este: **la tríada no es una vulnerabilidad puntual que se parchea, es una propiedad de la arquitectura**. Mientras las tres patas coexistan, no existe el "prompt lo suficientemente robusto" que la neutralice, porque el ataque no explota un bug del prompt: explota la forma del sistema. Un canal de salida sutil basta —un agente que puede hacer una request HTTP puede exfiltrar codificando datos en la URL; uno que renderiza markdown con imágenes puede filtrarlos en el `src` de una imagen a un dominio ajeno—. La superficie de salida es más grande de lo que parece.

## 5. Una condición de diseño, no una vuln: romper una pata

Si la exfiltración nace de la coexistencia de las tres patas, la defensa es geométrica antes que criptográfica: **hacer que falte al menos una**. No se trata de detectar cada ataque —eso es una carrera perdida contra un atacante creativo—, sino de diseñar el agente para que, aun con una inyección adentro, el circuito no cierre.

Cada mitigación conocida se lee mejor por la pata que ataca y por el costo que impone. No hay opciones gratis: elegir es aceptar un límite.

| Mitigación | Qué pata rompe (o adelgaza) | Costo o límite honesto |
|---|---|---|
| Mínimo privilegio por tarea: solo las herramientas que esa tarea concreta necesita | Achica el canal de salida y la exposición de datos privados | Hay que modelar cada tarea; fricción de configuración y de mantenimiento |
| Read-only por defecto / sin herramientas de escritura | Elimina el canal de salida hacia el mundo | No siempre aplica: a veces el agente existe para escribir algo |
| Sandbox de ejecución efímero y sin red | Corta el canal: sin salida a Internet no hay a dónde exfiltrar | Operación más compleja; algunas tareas legítimas piden red |
| HITL (human-in-the-loop) en la acción irreversible | Interrumpe el canal justo en el punto de no retorno | Latencia y carga humana; no escala a alto volumen de acciones |
| Separación instrucciones/datos: lo leído nunca es orden | Ataca la pata de contenido no confiable | Difícil al 100%; el modelo puede confundir roles igual |
| Clasificador de prompts adversariales sobre lo que entra | Adelgaza la pata de contenido no confiable | Capa imperfecta: convive con falsos negativos y falsos positivos |

Dos lecturas de la tabla. Primera: **las defensas más fuertes son las de arquitectura, no las de detección.** Quitarle a un agente la capacidad de escritura vuelve una familia entera de ataques imposible por construcción; un clasificador solo la vuelve menos probable. Segunda: **un clasificador es una capa, nunca la solución.** Bloquear algunos prompts adversariales no vuelve seguro un agente cuyas tres patas siguen conectadas —da la tranquilidad de haber hecho algo, que es distinto de haber roto el circuito—.

La consecuencia práctica es incómoda para el que quiere agregar seguridad al final: si tu agente necesita las tres patas para justificar su existencia, el trabajo de seguridad no es afinar el prompt, es rediseñar el alcance. A veces la respuesta correcta es que dos capacidades no deberían vivir en el mismo agente.

## 6. El puente con el corpus: es el STRIDE de un sistema que actúa

Nada de esto es ajeno al método de seguridad que este blog ya venía usando para APIs. Modelar la tríada letal de un agente es el mismo ejercicio que modelar amenazas sobre un journey de transferencias: enumerar activos (los datos privados), límites de confianza (dónde entra el contenido no confiable) y flujos de abuso (el canal de salida), y convertir cada amenaza en un control con una prueba que lo verifica. Para el marco completo —de la regla de negocio a la hipótesis verificable, con STRIDE como andamio— ver [Threat modeling para QA de una API de transferencias](/blog/threat-modeling-para-qa-api-transferencias/).

Lo que agrega el agente es que el "sistema" ya no expone endpoints fijos: expone un **espacio de acción** que el propio modelo recorre en tiempo de ejecución. Por eso el inventario de amenazas se organiza alrededor de las herramientas —qué puede hacer cada una, sobre qué recurso, con qué reversibilidad—, y no alrededor de rutas HTTP. Ese espacio de acción es una de las piezas que compone el agente; para verlo dentro de la anatomía completa, [Anatomía de un agente: seis órganos](/blog/anatomia-de-un-agente-seis-organos/).

Y es Quality Engineering por la misma razón de siempre: la disciplina que sabe diseñar casos por riesgo, medir comportamiento agregado y desconfiar de una demo verde es la que puede convertir "diseñamos contra la tríada letal" en "acá está la prueba que demuestra que la acción prohibida se rechaza". La seguridad de un agente no se declara; se verifica, y se verifica en cada cambio, porque las defensas retroceden sin que nadie lo note.

> Este pilar fija el porqué; los satélites fijan el cómo. Para tratar las defensas como una suite de regresión que corre en CI —con un banco de payloads versionado como [`prompt-injection-arena`](https://github.com/fercarballo/prompt-injection-arena)—, seguí con [Red teaming de agentes como regresión](/blog/red-teaming-de-agentes-como-regresion/). Para el antecedente en asistentes LLM/RAG que solo leen —la versión estática de este mismo ataque—, [Seguridad de asistentes LLM/RAG: prompt injection](/blog/seguridad-asistentes-llm-rag-prompt-injection/).
