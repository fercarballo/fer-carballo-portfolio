---
title: "De function calling a MCP: el contrato de las herramientas de un agente"
description: "Un agente sin herramientas es un chatbot. Cómo evolucionó de function calling a MCP, por qué su esquema es un contrato y su descripción es prompt engineering."
pubDate: 2026-07-15
tags: ['mcp', 'agentes', 'tool-use', 'contract-testing', 'sdet']
cluster: 'g02'
clusterTitle: "Herramientas y MCP"
type: pilar
order: 1
readingLevel: "Intermedio"
prerequisites: "Nociones de agentes y de APIs REST."
icon: 'braces'
iconHue: 25
---

> **Subtítulo:** Cómo la herramienta de un agente pasó de function calling a MCP, por qué su esquema es un contrato y su descripción es prompt engineering, y qué significa —en términos de QA— testear una herramienta que el modelo va a elegir solo.

> **Nota de alcance.** Ejemplos ilustrativos. Los protocolos de este terreno se mueven rápido: MCP es una spec abierta y viva, y las capacidades exactas de cada cliente cambian entre versiones — revalidá contra la tuya. La implementación de referencia de esta colección vive en el satélite.

---

## Resumen ejecutivo

- Un agente sin herramientas es un chatbot: puede describir con precisión cómo reiniciar el servicio, redactar el comando exacto, anticipar el error — y no tocar nada. La herramienta es lo que convierte texto en efecto.
- La línea evolutiva es corta y clara: function calling (OpenAI, junio de 2023) estandarizó la herramienta como JSON tipado contra un esquema; MCP (Anthropic, noviembre de 2024) estandarizó cómo un agente descubre y llama herramientas de servidores externos.
- **La descripción de una herramienta es prompt engineering de primera clase, y su esquema es un contrato: testear una herramienta de agente es contract testing, no un caso feliz más.**
- MCP se volvió el "USB-C de los agentes" por efecto de red, no por elegancia: adoptado por OpenAI y Google en 2025, un servidor que se escribe una vez lo usa cualquier cliente.
- Lo que sale mal no es exótico: descripción ambigua → el modelo elige mal; esquema laxo → argumentos inválidos; herramienta que miente sobre lo que hace → contrato roto que ninguna validación de tipos atrapa.

Al terminar vas a poder: distinguir function calling de MCP de A2A, leer la descripción y el esquema de una herramienta como dos contratos distintos con dos audiencias distintas, y diseñar la prueba que le corresponde a cada uno.

---

## 1. El problema: un agente sin herramientas es un chatbot

Un modelo de lenguaje, solo, hace una cosa: recibe texto y devuelve texto. Puede explicar con exactitud cómo reiniciar un servicio, escribir el comando línea por línea y hasta anticipar el mensaje de error que va a aparecer — pero no puede tocar el servicio. Entre "saber decir" y "hacer" hay una frontera, y la herramienta es lo que la cruza. Un agente es, antes que cualquier otra cosa, un modelo con manos. La herramienta es uno de sus órganos vitales (ver [Anatomía de un agente: seis órganos](/blog/anatomia-de-un-agente-seis-organos/)); sin ella, el resto del cuerpo razona en el vacío.

El problema histórico no fue que el modelo no pudiera pedir una acción. Fue *cómo*. Antes de que existiera un formato estándar, conectar un modelo a una herramienta era artesanía: había que hacerle escribir texto con una convención inventada, parsear ese texto con la esperanza de que respetara el formato, y pegar código a medida por cada herramienta y por cada proveedor de modelo. Con N modelos y M herramientas, el resultado eran N×M integraciones frágiles, cada una reinventada. La historia de este capítulo es la de dos estandarizaciones que redujeron ese número.

## 2. Function calling: la herramienta como JSON tipado

En junio de 2023, OpenAI llevó la primera estandarización a producto. La idea: en vez de esperar que el modelo emita texto parseable, se le declara la herramienta con un esquema —nombre, descripción y parámetros como JSON Schema— y el modelo, en lugar de prosa, emite un objeto estructurado: el nombre de la herramienta más argumentos que respetan ese esquema. El runtime valida y ejecuta.

El detalle que conviene fijar temprano: **el modelo no ejecuta nada**. El modelo *pide* que se ejecute; quien ejecuta es el runtime, y ahí —no en el modelo— viven los permisos. Toolformer (Schick et al., 2023) ya había mostrado que un modelo puede aprender *cuándo* llamar a una API; function calling volvió esa capacidad una primitiva de producto, con un formato tipado en lugar de texto a interpretar.

Pero function calling estandarizó la *forma* de una llamada, dentro de la API de un proveedor, contra herramientas que vos cableaste en tu runtime. No estandarizó cómo un modelo alcanza una herramienta que vive en el proceso de otro. Cada integración seguía siendo a medida — a medida, ahora, con argumentos tipados.

## 3. MCP: del cable a medida al estándar

En noviembre de 2024, Anthropic publicó MCP —Model Context Protocol— como spec abierta. Lo que estandariza es cómo un cliente (el agente) descubre y usa las capacidades que expone un servidor:

- **Herramientas (tools):** funciones con efecto que el modelo puede invocar.
- **Recursos (resources):** datos que el servidor ofrece para leer —archivos, filas, documentos—.
- **Prompts:** plantillas de interacción que el servidor pone a disposición.

El transporte es stdio (un subproceso local) o HTTP (un servidor remoto). El cliente pregunta "¿qué ofrecés?" (listar), recibe descripciones tipadas y llama con argumentos tipados. Nada de esto es una librería ni un framework: es un contrato de conexión.

```text
        ┌──────────────────────┐
        │        AGENTE         │   el modelo decide QUÉ herramienta
        │     (cliente MCP)     │   y con qué argumentos la llama
        └───────────┬──────────┘
                    │  protocolo MCP  (stdio local | HTTP remoto)
                    │  1) listar: ¿qué tools/resources/prompts hay?
                    │  2) llamar: nombre + argumentos tipados
        ┌───────────┼───────────────────────┐
        ▼           ▼                       ▼
  ┌───────────┐ ┌───────────┐       ┌──────────────┐
  │ servidor  │ │ servidor  │       │  servidor    │
  │  GitHub   │ │  Postgres │       │  QA toolbox  │
  └─────┬─────┘ └─────┬─────┘       └──────┬───────┘
        ▼             ▼                    ▼
   API / efecto   base de datos      datos locales
```

Por qué el efecto de red importa más que la elegancia del diseño: antes de un protocolo común, conectar N clientes con M servidores eran N×M puentes a medida. Con un protocolo compartido, son N+M — se escribe un servidor una vez y lo usa cualquier cliente MCP; se escribe un cliente una vez y habla con cualquier servidor. Por eso el apodo pegó: es el "USB-C de los agentes", un conector que sirve en las dos direcciones. Y por eso la adopción pesa más que la perfección: OpenAI lo adoptó en marzo de 2025 y Google lo siguió. Un protocolo usado por todos le gana a un protocolo mejor usado por uno solo; MCP se volvió estándar de facto por efecto de red, no por decreto.

Conviene no confundir capas. Function calling, MCP y A2A resuelven problemas distintos:

| Capa | Qué conecta | Cuándo aparece |
|---|---|---|
| Function calling | El modelo con una función de tu propio runtime | Siempre que el modelo tenga que *actuar*: es la primitiva base |
| MCP | Un agente con servidores de herramientas, recursos y prompts externos | Cuando las herramientas viven fuera de tu proceso y querés reusarlas entre clientes |
| A2A | Un agente con otro agente de otra organización | Cuando el que está del otro lado no es una herramienta sino un agente autónomo (Google, 2025) |

La regla mnemónica: function calling es *cómo pide* el modelo; MCP conecta un agente con **herramientas**; A2A conecta un agente con **otro agente**.

## 4. La tesis de la casa: la descripción es prompt, el esquema es contrato

Acá está el centro del artículo. La definición de una herramienta tiene dos partes, y son dos artefactos de ingeniería distintos, dirigidos a dos audiencias distintas:

- **El esquema (schema)** —tipos, campos obligatorios, enums, restricciones— es un **contrato**, dirigido a tu runtime y al generador de argumentos del modelo. Es el mismo tipo de artefacto que un contrato de API cruzando una frontera entre servicios (ver [Contratos de API en transferencias entre sistemas distribuidos](/blog/contratos-api-transferencias-sistemas-distribuidos/)). Declara: los argumentos válidos se ven *así*.
- **La descripción (description)** —el texto en lenguaje natural de la herramienta y de cada parámetro— es **prompt engineering**, dirigido a la decisión del modelo de *usar* la herramienta y de usarla *bien*. No es documentación para humanos: es una instrucción que el modelo lee en el momento de decidir. "Cuándo conviene esta herramienta, cuándo no" va acá.

De esa separación se desprende que testear una herramienta también se parte en dos, y cada mitad tiene su técnica:

- ¿El modelo la *elige* bien y la *completa* bien? Es una propiedad de la descripción. Se prueba con evals sobre pedidos realistas, midiendo si se selecciona la herramienta correcta con argumentos válidos. Este es el lado del *consumidor*: el modelo es un consumidor cuyas expectativas se pueden fijar y versionar (ver [Consumer-driven contract testing: cuándo sí, cuándo no](/blog/consumer-driven-contract-testing-cuando-si-cuando-no/)).
- ¿La herramienta *honra* su esquema y su descripción —devuelve lo que dice, con la forma que declara—? Es el lado del *proveedor*, y es exactamente contract testing: el proveedor no debe desviarse del contrato del que depende el consumidor sin que nadie se entere.

La frase para guardar: **la herramienta de un agente es un proveedor en un contrato, y el modelo es su consumidor.** El contract testing se inventó para esto —una frontera donde dos lados evolucionan por separado y no deben romperse en silencio—. La novedad es solo que uno de los dos lados es probabilístico.

## 5. Qué sale mal (y por qué la validación de tipos no alcanza)

Los modos de falla no son exóticos; escalan en gravedad, y el último es el que ninguna validación de tipos atrapa.

- **Descripción ambigua → el modelo elige mal.** Dos herramientas con descripciones que se pisan ("busca información", "consulta datos") y el modelo agarra la equivocada, o ninguna, o las dos. El esquema estaba perfecto; el *prompt* estaba mal escrito. Ningún type checker detecta esto: es una falla de eval, no de compilación.
- **Esquema laxo → argumentos inválidos.** Un parámetro tipado como string libre cuando debería ser un enum; una fecha como string sin formato; un `options: object` sin forma declarada. El modelo lo completa de manera plausible y equivocada. Un esquema estricto es un guardrail: achica el espacio de llamadas inválidas *antes* de que ocurran. La restricción no es burocracia, es prevención.
- **Herramienta que miente sobre lo que hace → contrato roto.** La descripción dice "búsqueda de solo lectura" y la herramienta escribe. El esquema valida, los argumentos son válidos, y el modelo —que confía en la descripción— la usa en un contexto donde escribir es catastrófico. Este es el peligroso: ni la validación de tipos ni la de argumentos atrapan una herramienta cuyo *comportamiento* contradice su *contrato*. Se detecta solo probando al proveedor contra lo que dice ofrecer, y además es una superficie de seguridad — una herramienta que miente es un vector de inyección.

## 6. Cuando hay cientos de herramientas: el catálogo también es contexto

Un agente real puede enfrentar decenas o cientos de herramientas repartidas en muchos servidores. El nombre, la descripción y el esquema de *cada* herramienta ocupan la ventana de contexto antes de que el modelo decida nada. El catálogo es contexto, y el contexto es un recurso finito con retornos decrecientes. De ahí, dos consecuencias:

- Más herramientas no es más capacidad. Pasado cierto punto, un catálogo inflado degrada la selección: el modelo confunde herramientas parecidas y gasta presupuesto leyendo definiciones que no va a usar. Un espacio de acción amplio y mal diseñado rinde peor que uno chico y bien pensado.
- Por eso aparece la búsqueda de herramientas (tool search) y la carga diferida (lazy loading): en vez de inyectar todas las definiciones, el agente recupera el subconjunto relevante para la tarea que tiene entre manos. El catálogo pasa de ser algo que se vuelca a ser algo que se consulta. El objetivo de diseño se da vuelta: no "exponer todo", sino "exponer el conjunto mínimo que cubre la tarea, y hacer que el resto sea descubrible".

La lectura de QA: el catálogo de herramientas es una superficie que se testea *bajo carga de selección*. ¿La herramienta correcta se sigue eligiendo cuando hay otras doscientas presentes? Esa es una regresión que solo aparece a escala, y que no se ve en la demo con tres herramientas.

## 7. Por qué esto es Quality Engineering

La frontera de la herramienta es donde un decisor probabilístico —el modelo— se encuentra con un ejecutor determinista —tu runtime— a través de un contrato. Todo lo que QA sabe sobre contratos, fronteras y pruebas de consumidor/proveedor aplica tal cual, más una capa nueva: la descripción, un artefacto que es a la vez prosa y especificación, y que se prueba con evals en lugar de aserciones.

La progresión ordena el terreno. Function calling le puso un tipo a la frontera; MCP le puso un protocolo; QA le pone una prueba. Quien testea agentes no está inventando una disciplina: está aplicando la de siempre —desconfiar del contrato, versionarlo, probar los dos lados— a una frontera donde uno de los lados, por primera vez, decide solo.

> La implementación de referencia —un servidor MCP con herramientas de QA reales, con la lógica separada del protocolo para poder testearla— vive en el satélite de esta colección, [Construir un servidor MCP de herramientas de QA](/blog/construir-un-servidor-mcp-de-herramientas-qa/), sobre el repositorio [`mcp-qa-toolbox`](https://github.com/fercarballo/mcp-qa-toolbox). Para decidir cuándo el agente escribe código en vez de encadenar herramientas, ver [Code execution vs tool calls](/blog/code-execution-vs-tool-calls/).
