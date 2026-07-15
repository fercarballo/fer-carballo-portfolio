---
title: "De JavaScript a Python: llevar el criterio de testing de APIs a pytest sin perderlo"
description: "Migrar de JS/TS a Python para testear una API no es aprender pytest, es sostener el diseño: tests herméticos con inyección de dependencias y dobles de prueba. Qué transfiere directo y qué hay que cuidar."
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

> **Subtítulo:** Por qué el criterio de QA es portable entre lenguajes, y cómo se sostiene el diseño testeable —inyección de dependencias, dobles de prueba, tres niveles— al pasar de Playwright/Jest a pytest.

> **Nota de alcance.** Ejemplos ilustrativos sobre una suite de referencia contra [restful-booker](https://restful-booker.herokuapp.com), una API pública de reservas. El código completo, con CI y documentación de diseño, vive en el repositorio [`pytest-api-suite`](https://github.com/fercarballo/pytest-api-suite).

---

## Resumen ejecutivo

- **pytest se aprende en una tarde; lo que separa una suite buena de una mala no es la herramienta, es el diseño.** La sintaxis es lo barato de migrar.
- El criterio de QA **transfiere directo** de JS/TS a Python: si ya sabés *por qué* escribís un test, migrar es aprender vocabulario, no una disciplina nueva.
- El 80 % del valor está en un principio agnóstico del lenguaje: **un "unit test" no debe tocar la red.** Se logra con inyección de dependencias y dobles de prueba, y hace la suite rápida, determinista y estable.
- La suite se separa en **tres niveles** —unitario, contrato e integración—, y cada uno atrapa una clase distinta de defecto. El de contrato es el que caza el bug más silencioso: la respuesta que sigue en `200 OK` pero cambió un tipo.
- Dos hechos de Python que un test debe fijar: **pytest ejecuta `unittest.TestCase` sin cambios** (migración incremental posible) y **`bool` es subclase de `int`** (un booleano se cuela donde va un número si la validación es ingenua).

Al terminar vas a poder mapear tu vocabulario de testing de JS a pytest, diseñar un cliente testeable con inyección de dependencias, separar los tres niveles por marcador y escribir el test que fija un borde de tipos para que no regrese.

---

## 1. Lo que transfiere directo (casi todo)

La buena noticia para quien viene de JS: los conceptos son los mismos, cambia el envoltorio.

| En JavaScript (Playwright/Jest) | En Python (pytest) |
|---|---|
| `describe` / `it` | clases `Test*` / funciones `test_*` |
| `beforeEach` | fixtures |
| `test.each([...])` | `@pytest.mark.parametrize` |
| fixtures de Playwright | fixtures de pytest (más potentes) |
| `expect(x).toBe(y)` | `assert x == y` |

Si ya está claro *por qué* se escribe un test, migrar es aprender vocabulario nuevo, no una disciplina nueva. Eso baja el costo real de cambiar de lenguaje a casi cero.

## 2. El problema real: que un "unit test" no toque la red

Acá está el grueso del valor. El error más común en suites de API —en cualquier lenguaje— es que los llamados "tests unitarios" en realidad golpean un servidor. Eso los hace lentos, intermitentes y dependientes de que algo externo esté vivo. Un test que a veces falla por la red es peor que no tenerlo: enseña al equipo a ignorar el rojo.

La solución es **inyección de dependencias en el cliente**. En vez de que el cliente cree su conexión HTTP por dentro, la recibe por parámetro:

```python
class BookingClient:
    def __init__(self, base_url, session=None, timeout=10):
        # en producción usa requests.Session; en tests, un doble
        self._session = session or requests.Session()
```

Con eso, en los tests se le pasa un **doble de prueba** que no toca la red: se le encolan respuestas y se graba lo que el cliente intentó mandar.

```python
def test_404_se_traduce_a_NotFoundError(client, transport):
    transport.queue(FakeResponse(status_code=404, text="Not Found"))
    with pytest.raises(NotFoundError):
        client.get_booking(999)
```

Cero red. Determinista. Corre en un milisegundo. Y —clave— no depende de la librería HTTP: si mañana se cambia `requests` por `httpx`, el test ni se entera, porque depende de un *contrato*, no de la implementación.

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

La misma clase, dos transportes. Eso es diseño testeable, y no es de Python ni de JS: es agnóstico del lenguaje.

## 3. Los tres niveles y qué atrapa cada uno

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

## 4. El detalle que enseña pytest: corre unittest sin tocarlo

Frente a la disyuntiva "pytest **o** unittest", conviene una tercera opción: testear la lógica del cliente **dos veces**, una con fixtures de pytest y otra con `unittest.TestCase` y `unittest.mock`. No por redundancia, sino para demostrar un hecho con consecuencias prácticas: **pytest ejecuta los `TestCase` de unittest sin cambiarles una línea**.

La consecuencia es concreta: si se hereda una suite vieja escrita en unittest, se la puede correr con pytest hoy mismo y migrar de a poco, sin reescribir todo de golpe. Ese hecho vale más que la sintaxis.

## 5. El borde de tipos que un test debe fijar para siempre

En Python, `bool` es subclase de `int`. Entonces `totalprice = True` pasaría un `isinstance(x, int)` ingenuo y se colaría un booleano donde va un precio. Detectarlo y corregir la validación es la mitad del trabajo; la otra mitad —la que importa— es **escribir un test que lo fije**, para que nadie lo rompa sin querer dentro de seis meses. El trabajo no es solo arreglar el bug: es dejar un guardián que impida que vuelva.

## 6. Lo que se lleva de la migración

Cambiar de lenguaje confirma algo que conviene tener presente: **el criterio de QA es portable, las herramientas son detalles.** Saber por qué un test tiene que ser hermético, dónde poner la validación, cómo separar niveles — eso viaja a Python, a Java o a donde haga falta. La sintaxis se levanta en el camino.

> El repositorio [`pytest-api-suite`](https://github.com/fercarballo/pytest-api-suite) tiene la suite, el CI en GitHub Actions y dos documentos que explican la estrategia y las decisiones de diseño; se corre con `pytest -m "not integration"` y arranca verde. El nivel de contrato conecta con [Consumer-Driven Contract Testing](/blog/consumer-driven-contract-testing-cuando-si-cuando-no/), y la idea de tratar la automatización como producto, con el pilar [Framework engineering](/blog/framework-engineering-suite-producto-interno/).
