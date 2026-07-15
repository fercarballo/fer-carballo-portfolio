---
title: "Construir un servidor MCP de herramientas de QA"
description: "Implementación de referencia de un servidor MCP con tres herramientas de QA, con la lógica de negocio separada del protocolo para poder testearla sin MCP."
pubDate: 2026-07-15
tags: ['mcp', 'agentes', 'quality-engineering', 'test-automation', 'sdet']
cluster: 'g02'
clusterTitle: "Herramientas y MCP"
type: satelite
order: 2
readingLevel: "Intermedio"
prerequisites: "Haber leído el pilar de MCP."
repo: "mcp-qa-toolbox"
icon: 'braces'
iconHue: 25
---

> **Subtítulo:** Tres herramientas de QA expuestas a un agente vía MCP, con la decisión de diseño que las hace testeables: la lógica de negocio separada del protocolo, un servidor delgado, y una prueba de integración in-memory que las llama de punta a punta.

> **Nota de alcance.** Ejemplos ilustrativos; los fragmentos de código son didácticos, no copia literal. La implementación de referencia —tres herramientas, lógica pura y tests de integración in-memory— vive en el repositorio [`mcp-qa-toolbox`](https://github.com/fercarballo/mcp-qa-toolbox). El SDK de MCP y su API cambian entre versiones: revalidá contra la tuya.

---

## Resumen ejecutivo

- Las herramientas de QA que vale la pena exponer a un agente comparten un rasgo: operan sobre datos locales, sin red. Acá son tres — parsear un reporte JUnit, reportar flakiness sobre varias corridas, y decidir un quality gate.
- **La decisión de diseño que ordena todo: la lógica de negocio vive separada de la capa de protocolo. Módulos puros testeables sin MCP, y una capa de servidor tan fina que casi no tiene qué romper.**
- La descripción de cada herramienta es prompt engineering: le dice al modelo cuándo usar cada una y —tan importante como eso— cuándo no, para que las componga en el orden correcto.
- Un servidor MCP se testea en dos niveles: la lógica pura con fixtures, y un test de integración in-memory que lista las herramientas y las llama de punta a punta, sin subproceso ni red.

Al terminar vas a poder: decidir qué lógica exponer como herramienta, estructurar un servidor MCP en dos capas testeables, escribir descripciones que guíen la composición del modelo y probar el servidor sin levantar nada externo.

---

## 1. El problema: qué herramientas de QA darle a un agente

No toda función merece ser una herramienta de agente. La pregunta de diseño es cuál le da al modelo una capacidad que no tiene y no lo mete en problemas que no puede manejar. Un buen filtro inicial: que opere sobre datos locales y no toque la red. Una herramienta sin red es determinista, barata de testear y no abre una superficie de exfiltración — tres propiedades que conviene defender de entrada.

Con ese criterio, tres herramientas de QA se ganan el lugar:

- **`parse_junit`** — convierte un reporte JUnit en XML en una estructura con totales, fallos y tiempos. Es la que traduce el formato crudo de una corrida en números que el agente puede razonar.
- **`flakiness_report`** — sobre *varias* corridas del mismo conjunto, identifica los tests que pasan y fallan sin que el código cambie: los flaky. Con una sola corrida no hay señal; la herramienta necesita el historial.
- **`quality_gate`** — compara las métricas de una corrida contra umbrales y devuelve un veredicto pasa/no-pasa con el motivo. Es la que convierte números en una decisión.

Las tres leen datos que ya están en el disco del entorno donde corre el agente. Ninguna llama a un servicio. Esa restricción no es pobreza de alcance: es lo que las vuelve testeables y seguras.

## 2. La decisión de diseño: lógica pura, protocolo aparte

Acá está el corazón del artículo, y es una decisión que se toma una vez y paga siempre. La tentación es escribir la lógica *adentro* del handler de cada herramienta MCP. La regla es la contraria: **la lógica de negocio va en módulos puros que no saben que MCP existe, y el servidor es una capa fina que solo traduce**.

```text
        cliente MCP  (el agente)
                │  stdio | HTTP
                ▼
   ┌──────────────────────────────┐
   │  server.py   (capa fina)     │   cada @tool: args ⇄ resultado
   │  registra las 3 herramientas │   CERO lógica de negocio acá
   └───────────────┬──────────────┘
                   │  llamadas a funciones puras
                   ▼
   ┌──────────────────────────────┐
   │  core/   (lógica pura)       │   parse_junit()      ← sin import de mcp
   │  sin red, sin protocolo      │   flakiness_report()
   │  testeable con fixtures      │   quality_gate()
   └──────────────────────────────┘
```

Un fragmento ilustrativo del núcleo puro — una función común, sin rastro de protocolo:

```python
# core/junit.py — lógica pura, no sabe que existe MCP
def parse_junit(xml: str) -> ParsedRun:
    """Parsea un reporte JUnit y devuelve totales, fallos y tiempos."""
    # ... parsing determinista sobre el string ...
    return ParsedRun(total=..., failed=..., failures=[...], duration_s=...)
```

Y la capa de servidor, que solo conecta el protocolo con esa función:

```python
# server.py — capa fina sobre FastMCP (SDK oficial de MCP)
from mcp.server.fastmcp import FastMCP
from core.junit import parse_junit

mcp = FastMCP("qa-toolbox")

@mcp.tool()
def parse_junit_tool(xml: str) -> dict:
    """Convierte un reporte JUnit XML en totales, fallos y tiempos.
    Usala cuando tengas el XML crudo de una corrida y necesites los
    números. No decide si el build pasa: para eso está quality_gate."""
    return parse_junit(xml).as_dict()
```

Por qué esta separación es la correcta, en tres consecuencias concretas:

- **La lógica difícil se testea sin levantar nada.** `parse_junit` es una función de string a estructura: se prueba con un XML de ejemplo y una aserción, en milisegundos, sin protocolo de por medio.
- **El servidor casi no tiene qué romper.** Si la lógica vive en `core/`, la capa MCP solo cablea. Un bug de cableado lo atrapa un único test de integración; no hace falta cubrir la lógica dos veces.
- **La misma lógica sirve a más de un consumidor.** El servidor MCP es *un* cliente de `core/`, no su casa. La misma función puede respaldar un CLI o un paso de CI sin cambiar una línea.

## 3. La descripción de cada herramienta es prompt engineering

En el fragmento de arriba, el docstring no es documentación para quien lee el código: es el prompt que el modelo lee para decidir — la tesis del [pilar de esta colección](/blog/de-function-calling-a-mcp-el-contrato-de-las-herramientas/), puesta a trabajar. Por eso incluye el "cuándo no". Escritas para el modelo, las tres descripciones tienen que guiar la *composición*:

- `parse_junit` aclara que devuelve números pero **no** decide el gate — así el modelo no la usa como veredicto.
- `flakiness_report` aclara que necesita **dos o más corridas** — así el modelo no la invoca con una sola y espera magia.
- `quality_gate` aclara que **no** parsea XML ni detecta flakiness por su cuenta — así el modelo entiende que primero llama a las otras y después a esta.

El resultado buscado es que el agente arme la cadena correcta —`parse_junit` → `flakiness_report` → `quality_gate`— sin que nadie se la escriba, porque cada descripción empuja hacia el orden que tiene sentido. Una descripción vaga rompe justamente eso: el modelo elige mal o compone al revés.

## 4. Cómo se testea un servidor MCP

La estructura en dos capas habilita una estrategia de pruebas en dos niveles.

**Nivel 1 — la lógica pura, con fixtures.** Cada función de `core/` se prueba como cualquier función determinista: una entrada conocida, una salida esperada.

```python
def test_parse_junit_cuenta_fallos():
    run = parse_junit(open("fixtures/con_fallos.xml").read())
    assert run.total == 12
    assert run.failed == 2
```

El valor de estas fixtures depende de que sean corridas reales capturadas —un XML que de verdad rompió alguna vez, con sus rarezas de formato—, no XML sintético prolijo. El mismo criterio que vuelve valioso a un golden dataset vale para el fixture de una herramienta: cubrir el caso borde real, no inflar el número.

**Nivel 2 — integración in-memory, de punta a punta.** Un test que conecta un cliente MCP al servidor *en el mismo proceso* —sin subproceso, sin red—, lista las herramientas y las llama como lo haría un agente. Prueba lo que el nivel 1 no ve: que el servidor registró las tres, que los esquemas están bien y que el cableado traduce sin perder nada.

```python
async def test_integracion_lista_y_llama():
    async with client_in_memory(mcp) as client:
        tools = await client.list_tools()
        assert {"parse_junit_tool", "flakiness_report_tool",
                "quality_gate_tool"} <= {t.name for t in tools}
        res = await client.call_tool("parse_junit_tool", {"xml": SAMPLE})
        assert res["failed"] == 2
```

El test in-memory es el que da confianza de que el servidor funciona como servidor, y corre en CI a la velocidad de un test unitario porque no levanta procesos ni puertos.

## 5. Cómo se conecta a un cliente MCP

Con el servidor listo, un cliente lo lanza como subproceso por stdio con una config declarativa. La forma exacta depende del cliente, pero el patrón es este:

```json
{
  "mcpServers": {
    "qa-toolbox": {
      "command": "python",
      "args": ["-m", "mcp_qa_toolbox"]
    }
  }
}
```

El cliente arranca el proceso, hace el handshake, pide la lista de herramientas y, a partir de ahí, el modelo las tiene disponibles. El mismo servidor que se testeó in-memory es el que corre en producción; no hay una segunda implementación para el modo real.

## 6. Por qué esto es Quality Engineering

Separar la lógica del protocolo no es una preferencia estética: es la decisión que hace que un servidor de herramientas sea testeable en vez de una caja que solo se puede probar entera y con suerte. La lógica pura se cubre con fixtures rápidas; la capa fina, con un test de integración que la ejercita de punta a punta. Es la misma disciplina de siempre —empujar la complejidad a donde se puede testear barato, y dejar delgada la frontera— aplicada a una herramienta que, esta vez, la va a elegir un modelo.

> El código completo —las tres herramientas, la lógica separada y los tests de integración in-memory— está en [`mcp-qa-toolbox`](https://github.com/fercarballo/mcp-qa-toolbox). Para la lógica de flakiness sobre una matriz de corridas, ver [CI, matriz y flakiness como evidencia](/blog/ci-matriz-flakiness-evidencia/); para el veredicto de gate en cada PR, [Un quality gate en cada pull request](/blog/quality-gate-en-cada-pull-request/).
