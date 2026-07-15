---
title: "Red teaming de agentes como regresión continua"
description: "Por qué la seguridad de un agente se trata como una suite de regresión y no como una auditoría única: corpus de payloads versionado, métricas por categoría y un gate que corre en cada cambio."
pubDate: 2026-07-15
tags: ['seguridad', 'agentes', 'red-teaming', 'ci-cd', 'sdet']
cluster: 'g06'
clusterTitle: "Seguridad agéntica"
type: satelite
order: 2
readingLevel: "Intermedio–Avanzado"
prerequisites: "Haber leído la tríada letal ayuda."
repo: "prompt-injection-arena"
icon: 'shield'
iconHue: 355
---

> **Subtítulo:** Por qué las defensas de un agente se evalúan como una suite de regresión —corpus versionado, métricas por categoría, gate contra baseline— y por qué medir falsos positivos es tan parte de la tesis como medir bloqueos.

> **Nota de alcance.** Ejemplos ilustrativos sobre defensas propias; los porcentajes que aparecen son ilustrativos, no benchmarks. La implementación de referencia —banco de payloads versionado y harness que mide bloqueo y falsos positivos por categoría, con guards deterministas y sin modelos ni red— vive en [`prompt-injection-arena`](https://github.com/fercarballo/prompt-injection-arena). El corpus describe clases de ataque para testear tus propios guards, no para vulnerar sistemas ajenos.

---

## Resumen ejecutivo

- La seguridad de un agente no es un estado que se certifica una vez: es una propiedad que **se erosiona**. Los payloads evolucionan y las defensas retroceden sin que nadie lo quiera, en cada cambio de prompt, de modelo o de guard.
- Por eso se trata como **regresión, no como auditoría**: un corpus de payloads versionado que corre en cada cambio, igual que una suite de tests, y no un pentest anual cuyo resultado caduca al primer commit.
- **Un guard que bloquea todo no es seguro, es inútil: medir la tasa de falsos positivos sobre casos benignos de control es tan parte de la tesis como medir cuántos ataques frena.**
- Se mide por categoría —override directo, inyección indirecta, exfiltración por markdown, ofuscación, manipulación de rol, benignos de control— porque un promedio agregado esconde en qué familia estás ciego.
- El gate corre en CI y falla si el recall de maliciosos cae o los falsos positivos suben respecto del baseline. Y hay un gate que valida al gate: comprobar que un guard ingenuo **no** pasa la suite.

Al terminar vas a poder montar un corpus de seguridad versionado con casos malos y benignos, medir recall y falsos positivos por categoría, definir un gate de regresión contra un baseline y verificar que ese gate realmente discrimina.

---

## 1. El problema: la auditoría de seguridad caduca al primer commit

Un pentest o un red team clásico produce un informe: una foto de las defensas en una fecha. Para una API estable es valioso. Para un agente es insuficiente por dos razones que actúan a la vez.

La primera: **los payloads evolucionan.** La inyección indirecta que ayer no se le ocurría a nadie mañana circula en un blog. Un informe con fecha no cubre la clase de ataque que apareció después.

La segunda, más silenciosa: **las defensas retroceden sin querer.** Alguien reescribe el system prompt para mejorar el tono y, de paso, debilita una instrucción defensiva. Se actualiza el modelo y cambia su tendencia a obedecer texto incrustado. Se ajusta un guard para reducir quejas por bloqueos molestos y se abre un hueco. Ninguno de esos cambios se hizo pensando en seguridad, y justo por eso nadie mide su efecto sobre ella.

La conclusión es la misma que en el resto del testing: lo que no corre en cada cambio, no está protegido. La seguridad de un agente necesita ser una **suite de regresión**, no un evento.

## 2. El corpus versionado: casos malos y benignos de control

El activo central es un banco de casos etiquetados, guardado en el repositorio y versionado como código. Cada caso trae su categoría, su entrada (descrita por intención, sin ser un payload afinado para dañar) y el veredicto esperado del guard: bloquear o dejar pasar.

La parte que casi todos omiten es la mitad benigna. Un corpus de seguridad honesto tiene **dos clases de casos**:

- **Maliciosos:** entradas que el guard *debe* bloquear. Miden su capacidad de frenar ataques.
- **Benignos de control:** entradas legítimas que *superficialmente* se parecen a un ataque —hablan de "ignorar" algo, mencionan "system", incluyen un bloque de código o una URL— y que el guard **no** debe bloquear.

Sin la mitad benigna, la métrica engaña. Un guard que bloquea absolutamente todo tiene recall perfecto contra maliciosos y es, a la vez, completamente inservible: rompe el uso normal del agente. **Medir falsos positivos no es un refinamiento, es parte de la definición de "funciona".** Un guard paranoico falla de una forma distinta a un guard permisivo, pero falla igual.

## 3. Las seis categorías

Agrupar por categoría permite ver dónde está el hueco en vez de mirar un promedio que lo tapa. Estas seis son públicas y clásicas; alcanzan para estructurar una suite defensiva.

| Categoría | Qué modela | Veredicto esperado |
|---|---|---|
| Override directo | Instrucción que pide ignorar las reglas o el system prompt | Bloquear |
| Inyección indirecta | Instrucción incrustada en contenido que el agente lee (página, issue, doc) | Bloquear |
| Exfiltración por markdown | Intento de filtrar datos por el `src` de una imagen o un enlace a un dominio ajeno | Bloquear |
| Ofuscación | El mismo intento hostil escondido con codificación, espaciado o rodeos | Bloquear |
| Manipulación de rol | Encuadres del tipo "actuá como si no tuvieras restricciones" | Bloquear |
| Benignos de control | Texto legítimo que *parece* riesgoso pero no lo es | Dejar pasar |

Las cinco primeras son las patas de ataque; la sexta es la vara que evita que la defensa se vuelva un portón cerrado. Una suite sin la fila de benignos mide solo la mitad de la historia.

## 4. Las métricas: recall, falsos positivos y un score que las equilibra

Tres números por categoría, y ninguno solo alcanza:

- **Recall de maliciosos:** de los casos que había que bloquear, ¿qué fracción bloqueó? Mide la cobertura defensiva.
- **Tasa de falsos positivos:** de los benignos, ¿qué fracción bloqueó por error? Mide el costo de usabilidad.
- **Score balanceado:** combina las dos anteriores para que subir una a costa de la otra no se lea como una mejora. Un guard no "mejora" si sube el recall dos puntos y triplica los falsos positivos.

El detalle clave es que se reportan **por categoría, no en agregado**. Un recall global de, digamos, 90 % (número ilustrativo) puede convivir con un 50 % en exfiltración por markdown: el promedio quedó lindo porque las categorías fáciles lo levantaron. La media esconde justo la familia donde estás ciego. La misma lección que las evals de calidad: un puntaje agregado no dice si fallás en un slice sensible.

## 5. El gate de regresión en CI

Con el corpus y las métricas, el gate se vuelve mecánico: se guarda un **baseline** con los números de la versión buena conocida, y cada cambio se compara contra él. El gate falla —y bloquea el merge— si el recall de alguna categoría cae o si los falsos positivos suben respecto del baseline.

```text
  cambio en un guard / prompt / modelo, o nuevo payload
                        │
                        ▼
        ┌───────────────────────────────┐
        │  corpus versionado (6 categs.) │  maliciosos + benignos, etiquetados
        └───────────────┬───────────────┘
                        ▼
        ┌───────────────────────────────┐
        │  harness: corre cada caso      │  ¿el guard bloquea? sí / no
        │  contra cada guard             │
        └───────────────┬───────────────┘
                        ▼
        ┌───────────────────────────────┐
        │  métricas por categoría        │  recall(malos), FP(benignos)
        └───────────────┬───────────────┘
                        ▼
        ┌───────────────────────────────┐      baseline
        │  gate: ¿recall bajó?           │◄──── guardado
        │        ¿falsos positivos       │
        │        subieron?               │
        └───────────────┬───────────────┘
                 pasa    │    falla
                  ▼      │      ▼
               merge     │   bloquea el PR + reporte por categoría
```

Así, el cambio de prompt que mejoraba el tono pero debilitaba una defensa no llega a producción en silencio: el gate lo detiene con un reporte que dice exactamente qué categoría retrocedió. Es el mismo principio del [quality gate en cada pull request](/blog/quality-gate-en-cada-pull-request/), aplicado a la superficie de seguridad, y con la proporcionalidad que corresponde según el riesgo, tema de [quality gates de seguridad proporcionales](/blog/quality-gates-seguridad-cicd-proporcionales/).

## 6. El gate que valida al gate, y por qué un guard es una capa

Una suite de seguridad tiene una trampa propia: puede estar verde porque es débil. Si el corpus es fácil o el guard no discrimina, el gate pasa siempre y no protege de nada —da tranquilidad sin dar seguridad—. La defensa contra eso es **un gate que valida al gate**: incluir un guard deliberadamente ingenuo (uno que, por ejemplo, solo mira una palabra) y verificar que la suite **lo reprueba**. Si un guard que no debería pasar pasa, el que está roto es el corpus, no el guard. Es el mismo control que en cualquier meta-test: se testea al que testea, probando que rechaza lo que tiene que rechazar.

Y una honestidad que conviene dejar escrita, porque el gate verde tienta a olvidarla: **un guard es una capa, no la solución.** Frenar los payloads conocidos no rompe la tríada letal; solo la vuelve un poco menos probable. La seguridad de fondo sigue viniendo de la arquitectura —mínimo privilegio, sandbox, romper una pata—, y el guard es el cinturón de seguridad, no el hecho de manejar con cuidado. Una suite de regresión demuestra ausencia de fallos *conocidos*, nunca ausencia de fallos.

> **Nota ética.** Todo esto es para endurecer defensas propias: el corpus describe clases de ataque para probar tus guards en tu entorno, no técnicas para vulnerar sistemas de terceros. El red teaming legítimo se corre con autorización y sobre lo propio; esa es la línea que separa la seguridad defensiva de un incidente.

> El porqué de todo esto —por qué la exfiltración es esperable y qué significa romper una pata— está en el pilar [La tríada letal](/blog/la-triada-letal-seguridad-de-agentes/). La implementación de referencia, con los guards KeywordGuard, HeuristicGuard y ChainGuard y el harness de métricas, vive en [`prompt-injection-arena`](https://github.com/fercarballo/prompt-injection-arena).
