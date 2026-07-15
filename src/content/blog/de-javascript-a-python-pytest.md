---
title: "De JavaScript a Python: llevé mi forma de testear APIs a pytest sin perder el criterio"
description: "Vengo de automatizar en JS/TS. Cuando armé una suite de testing de API en Python descubrí que lo difícil no era pytest, era mantener herméticos los tests. Así lo resolví con inyección de dependencias y dobles de prueba."
pubDate: 2026-07-09
tags: ['contract-testing', 'python', 'pytest', 'test-automation', 'sdet']
cluster: '03'
clusterTitle: "Framework engineering para automatización"
type: satelite
order: 5
readingLevel: "Intermedio"
prerequisites: "Experiencia en testing automatizado en algún lenguaje."
repo: "pytest-api-suite"
icon: 'braces'
iconHue: 210
---

Mi automatización de todos los días es en JavaScript y TypeScript. Cuando me propuse sumar Python en serio, la tentación era hacer un curso de pytest, memorizar la sintaxis y listo. Pero cuando me senté a armar una suite de testing de una API REST de verdad, me di cuenta de algo: **pytest se aprende en una tarde; lo que separa una suite buena de una mala no es la herramienta, es el diseño.**

Este post es lo que aprendí armando [`pytest-api-suite`](https://github.com/fercarballo/pytest-api-suite): una suite que testea una API en tres niveles (unitario, contrato e integración) y que corre en milisegundos porque casi todo es hermético.

## Lo que transfiere directo (spoiler: casi todo)

La buena noticia para cualquiera que venga de JS: los conceptos son los mismos. Cambia el envoltorio.

| En JavaScript (Playwright/Jest) | En Python (pytest) |
|---|---|
| `describe` / `it` | clases `Test*` / funciones `test_*` |
| `beforeEach` | fixtures |
| `test.each([...])` | `@pytest.mark.parametrize` |
| fixtures de Playwright | fixtures de pytest (más potentes, la verdad) |
| `expect(x).toBe(y)` | `assert x == y` |

O sea: si ya sabés *por qué* escribís un test, migrar es aprender vocabulario nuevo, no una disciplina nueva. Eso me sacó el miedo de encima.

## El problema real: que un "unit test" no toque la red

Acá está el 80% del valor del repo. El error más común que veo en suites de API —en cualquier lenguaje— es que los llamados "tests unitarios" en realidad golpean un servidor. Eso los hace lentos, intermitentes y dependientes de que algo externo esté vivo. Un test que a veces falla por la red es peor que no tener test: enseña al equipo a ignorar el rojo.

La solución que me funcionó: **inyección de dependencias en el cliente**. En vez de que el cliente cree su conexión HTTP por dentro, la recibe por parámetro.

```python
class BookingClient:
    def __init__(self, base_url, session=None, timeout=10):
        # en producción usa requests.Session; en tests, un doble
        self._session = session or requests.Session()
```

Con eso, en los tests le paso un **doble de prueba** que no toca la red: le encolo respuestas y grabo lo que el cliente intentó mandar.

```python
def test_404_se_traduce_a_NotFoundError(client, transport):
    transport.queue(FakeResponse(status_code=404, text="Not Found"))
    with pytest.raises(NotFoundError):
        client.get_booking(999)
```

Cero red. Determinista. Corre en un milisegundo. Y —clave— no depende de la librería HTTP: si mañana cambio `requests` por `httpx`, el test ni se entera, porque depende de un *contrato*, no de la implementación.

```text
   PRODUCCIÓN                          TESTS
   ──────────                          ─────
   BookingClient                       BookingClient
        │ usa                               │ usa
        ▼                                   ▼
   requests.Session  ← red real        FakeTransport  ← respuestas encoladas
        │                                   │
        ▼                                   ▼
   API restful-booker                  (nada, en memoria)
```

La misma clase, dos transportes. Eso es diseño testeable, y no es de Python ni de JS: es agnóstico.

## Los tres niveles y qué atrapa cada uno

No todos los tests cuestan igual. La suite los separa por marcador:

```text
                ╱╲
               ╱  ╲     integración  ← API real, lentos, saltan si no hay red
              ╱────╲
             ╱      ╲   contrato      ← ¿la RESPUESTA respeta el esquema?
            ╱────────╲
           ╱          ╲ unitario      ← reglas + lógica del cliente, herméticos
          ╱____________╲
```

- **Unitario:** reglas de negocio y traducción de errores. Sin red. Es la base ancha.
- **Contrato:** valida la *forma* de la respuesta con JSON Schema. Atrapa el bug más silencioso de una API — que siga respondiendo `200 OK` pero con un campo que cambió de `int` a `string`. Los tests de valores no lo ven; el contrato sí.
- **Integración:** el flujo real contra la API, marcado aparte y con *skip* elegante si no hay conectividad. Pocos, lentos, valiosos.

## El detalle que me pidieron y que me hizo entender pytest

En la búsqueda que disparó todo esto pedían "pytest **o** unittest". En vez de elegir, testeé la lógica del cliente **dos veces**: una con fixtures de pytest, otra con `unittest.TestCase` y `unittest.mock`. No por capricho: quería demostrarme algo, y lo confirmé —**pytest ejecuta los `TestCase` de unittest sin cambiarles una coma**.

Eso tiene una consecuencia práctica enorme: si heredás una suite vieja escrita en unittest, la podés correr con pytest hoy mismo y migrar de a poco, sin reescribir todo de golpe. Saber eso vale más que la sintaxis.

## Un detalle finito que un test fijó para siempre

En Python, `bool` es subclase de `int`. Entonces `totalprice = True` pasaría un `isinstance(x, int)` ingenuo y se colaría un booleano donde va un precio. Lo descubrí, lo corregí en la validación, y —esto es lo importante— **escribí un test que lo fija**, para que nadie lo rompa sin querer dentro de seis meses. Ese es el trabajo: no solo arreglar el bug, sino dejar un guardián que impida que vuelva.

## Lo que me llevo

Migrar de lenguaje me confirmó algo que sospechaba: **el criterio de QA es portable, las herramientas son detalles.** Saber por qué un test tiene que ser hermético, dónde poner la validación, cómo separar niveles — eso viaja conmigo a Python, a Java o a donde haga falta. La sintaxis la levanto en el camino.

> El repo está entero acá: [`pytest-api-suite`](https://github.com/fercarballo/pytest-api-suite), con la suite, el CI en GitHub Actions y dos documentos que explican la estrategia y las decisiones de diseño. Se corre con `pytest -m "not integration"` y arranca verde.
