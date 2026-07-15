---
title: "Golden tasks y verificadores de estado: el oráculo confiable de un agente"
description: "El oráculo de una eval de agente no es el juicio de un modelo: es un verificador con código. Golden tasks, pass^k con cota de Wilson y un gate que se valida solo."
pubDate: 2026-07-15
tags: ['evals', 'agentes', 'quality-engineering', 'test-automation', 'sdet']
cluster: 'g05'
clusterTitle: "Evaluar agentes"
type: satelite
order: 2
readingLevel: "Intermedio–Avanzado"
prerequisites: "Haber leído el pilar de evaluación."
repo: "agent-evals-lab"
icon: 'flask'
iconHue: 145
---

> **Subtítulo:** Qué es una golden task, por qué el verificador de estado es el oráculo confiable de una eval de agente, y por qué el gate se aplica a la cota inferior de Wilson y no al `pass^k` crudo —con un gate que se prueba a sí mismo.

> **Nota de alcance.** Ejemplos ilustrativos sobre tareas ficticias. La implementación de referencia —golden tasks con workspace efímero, verificador de estado, `pass^k` con cota inferior de Wilson y un gate de CI que se autovalida con políticas deterministas— vive en el repositorio [`agent-evals-lab`](https://github.com/fercarballo/agent-evals-lab). Los números de la sección 3 son ilustrativos. Herramientas y modelos cambian: revalidá contra tu versión.

---

## Resumen ejecutivo

- Una **golden task** no es un caso de prueba de texto: es una instrucción más el **estado inicial de un entorno** más un **verificador programático del estado final**. Es el patrón de terminal-bench, trasladado a tu dominio.
- **El verificador de estado es el oráculo confiable de la eval porque es determinista: decide con código si el mundo quedó como debía, no con el juicio de un modelo.** Un oráculo que también es probabilístico no es un oráculo.
- El gate no se aplica al `pass^k` crudo. Con pocas corridas, `pass^k` rechazaría hasta a un agente casi perfecto por una sola mala suerte. El umbral se compara contra la **cota inferior de Wilson** sobre la tasa de éxito: honestidad estadística.
- Un gate se prueba como cualquier control: con un agente que debería pasar y uno que debería fallar. Si no distingue esos dos, no se le puede creer ningún veredicto.
- El verificador mira el outcome; la traza mira la trayectoria. Los dos chequeos conviven: estado final correcto **y** camino aceptable.

Al terminar vas a poder diseñar una golden task con verificador de estado, entender por qué el gate va contra la cota de Wilson y no contra `pass^k`, y montar un gate de CI que se valide a sí mismo antes de juzgar a un agente real.

---

## 1. El problema: una eval necesita un oráculo, y el modelo no puede serlo

En testing, el **oráculo** es la fuente de verdad que decide si un resultado es correcto. En un test tradicional es un `assertEquals`. En una [eval de LLM app](/blog/evaluar-aplicaciones-llm/), cuando el criterio es difuso, el oráculo puede ser otro modelo con una rúbrica. En un agente que actúa sobre el mundo hay una opción mejor y más barata: preguntarle **al mundo**.

Si la tarea era "dejá el CSV ordenado", no hace falta que un modelo juzgue si quedó ordenado: se abre el archivo y se comprueba con código. Ese chequeo es determinista, gratis y no se equivoca por temperatura. La regla de la colección: **cuando el outcome se puede verificar con código, el oráculo es código.** Un juez LLM se reserva para lo que de verdad no tiene verificación programática, no para lo que un `if` resuelve.

## 2. Qué es una golden task

Una golden task tiene tres partes, y ninguna es opcional:

1. **La instrucción.** Lo que se le pide al agente, en lenguaje natural, como lo recibiría en producción.
2. **El estado inicial del entorno.** Un workspace efímero preparado en un estado conocido: los archivos que existen, las filas de la base, los mocks de las APIs. El mismo `t0` para cada corrida.
3. **El verificador del estado final.** Una función que decide, con código, si el mundo quedó como debía.

Es el patrón que terminal-bench (2025) formalizó para tareas de terminal: se arma un entorno, el agente trabaja, y un verificador comprueba el estado final. El verificador es corto y brutal:

```python
# verificador de estado: determinista, sin modelo
def verificar(workspace) -> bool:
    salida = workspace / "salida.csv"
    if not salida.exists():              # el outcome tiene que existir
        return False
    filas = leer_csv(salida)
    return filas == sorted(filas)        # y quedar ordenado: el oráculo es código
```

Los verificadores útiles hablan del mundo, no del texto del agente: "el archivo existe y contiene X", "el CSV quedó ordenado", "el script que estaba roto ahora corre y devuelve 0". Un agente puede *decir* que ordenó el CSV; el verificador no le cree: lo abre.

## 3. Por qué el gate no se aplica al pass^k crudo

El pilar deja la métrica honesta: [`pass^k`](/blog/evaluar-agentes-trayectoria-outcome-pass-k/), ¿pasan las k corridas? El problema aparece al convertir esa métrica en una **decisión de gate**. `pass^k` crudo es un todo-o-nada sobre la muestra: una sola corrida fallida entre k lo manda a 0. Con pocas corridas, eso rechaza hasta a un agente excelente por mala suerte —un agente con 0.99 de éxito por corrida falla el `pass^k` de 20 corridas cerca de una vez de cada cinco—. Gatear ahí es gatear ruido.

La salida es la de siempre en estadística de proporciones: estimar la tasa de éxito por corrida y ponerle una **cota inferior de confianza**. La cota de Wilson es la robusta para muestras chicas —no devuelve valores imposibles y no colapsa cerca de 0 o de 1 como la aproximación normal—. El gate compara esa cota, no la estimación optimista, contra el umbral.

```text
  19 de 20 corridas OK
        │
        ├─ estimación puntual (p̂) ........ 0.95   ← lo optimista
        └─ cota inferior de Wilson (95%) .. ≈ 0.76  ← lo que el gate compara
                                                      (números ilustrativos)
```

La cota castiga la incertidumbre de la muestra chica y se acerca a la estimación puntual a medida que se agregan corridas. Es honestidad estadística: el gate no afirma "el agente acierta el 95%", afirma "hay confianza de que acierta al menos ~0.76". `pass^k` se sigue reportando —es la consistencia que el usuario va a sentir—, pero la decisión de merge va contra la cota. Es el mismo criterio de [hipótesis medible y experimento reproducible](/blog/hipotesis-medible-experimento-reproducible/): un número con intervalo, no un puntaje suelto.

## 4. El gate que se valida a sí mismo

Un control que nunca se probó es decoración. Antes de dejar que un gate juzgue a un agente real, hay que probar que el gate funciona —y eso se hace con dos agentes de comportamiento conocido, sin gastar un token de modelo:

```text
 tarea → k corridas → verificador → éxitos/k → p̂, Wilson_low, pass^k → gate
                                                                         │
   ScriptedPolicy (siempre resuelve bien) ─────────► el gate DEBE aceptar
   FlakyPolicy    (falla la mitad de las veces) ───► el gate DEBE rechazar
```

`ScriptedPolicy` y `FlakyPolicy` son políticas **deterministas**: resuelven la tarea con código fijo, sin llamar a ningún modelo. Una siempre deja el estado correcto; la otra falla de forma controlada. El gate se corre contra las dos y se verifica que acepte a la confiable y rechace a la inestable. Si no distingue esos dos casos obvios, no se le puede creer ningún veredicto sobre un agente real. Es el mismo meta-testing que valida a un juez LLM antes de usarlo: **se testea al que testea**.

El efecto de lado es enorme para CI: como esas políticas no llaman a un modelo, el harness corre en segundos, gratis y sin flakiness de red. El gate del pipeline se prueba a sí mismo en cada push, y recién después mide a los agentes que sí cuestan. Es un [quality gate en cada pull request](/blog/quality-gate-en-cada-pull-request/) que primero se gana el derecho a opinar.

## 5. La trayectoria también se verifica

El verificador de estado responde por el outcome. No dice nada del camino. Un agente puede dejar el CSV ordenado y, en el proceso, haber borrado tres archivos que no eran suyos. Por eso, además del verificador de outcome, la eval corre **aserciones sobre la traza** de acciones:

- No tocó nada fuera del workspace asignado.
- No superó el techo de N pasos.
- No repitió la misma acción en loop.
- No usó una herramienta fuera de la lista permitida.

Estos checks no miran el estado final: miran lo que el agente **hizo** para llegar. Un aprobado exige las dos cosas —outcome correcto y trayectoria aceptable—, porque el estado final prolijo por un camino destructivo es exactamente el fallo que el pilar advierte y que un chequeo de outcome, solo, deja pasar.

## 6. Por qué esto es Quality Engineering

Una golden task es un caso de prueba diseñado por riesgo, con un oráculo determinista y una decisión de aprobación con intervalo de confianza. Nada de eso es nuevo para la disciplina: es lo que se hace desde siempre con datos y con contratos, aplicado a un sujeto que actúa sobre un entorno en vez de devolver un valor. Lo nuevo es que el oráculo tiene que preguntarle al mundo, y que la decisión de gate tiene que ser estadísticamente honesta con muestras chicas.

> El código completo —golden tasks con workspace efímero, verificador de estado, `pass^k` con cota inferior de Wilson y el gate autovalidante con `ScriptedPolicy` y `FlakyPolicy`— está en [`agent-evals-lab`](https://github.com/fercarballo/agent-evals-lab). Para la matemática de por qué la consistencia se desploma, ver el pilar [Trayectoria, outcome y pass^k](/blog/evaluar-agentes-trayectoria-outcome-pass-k/).
