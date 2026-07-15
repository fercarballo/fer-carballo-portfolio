---
title: "Self-healing de selectores: reparar sí, auto-mergear no"
description: "Un agente puede detectar un selector roto y proponer uno mejor, pero abrir un PR revisable, nunca auto-mergear: un selector arreglado a ciegas puede estar tapando un bug de UI."
pubDate: 2026-07-15
tags: ['agentes', 'test-automation', 'flakiness', 'quality-engineering', 'sdet']
cluster: 'g07'
clusterTitle: "Agentes para QA"
type: satelite
order: 3
readingLevel: "Intermedio"
prerequisites: "Automatización E2E (Playwright/Selenium)."
icon: 'check'
iconHue: 88
---

> **Subtítulo:** Qué puede hacer bien un agente frente a un selector roto —detectarlo, proponer uno más estable, abrir un PR con el diff y la evidencia— y la línea que no puede cruzar: auto-mergear, porque un selector "arreglado" solo puede estar ocultando un cambio de UI que era un bug.

> **Nota de alcance.** Ejemplos ilustrativos sobre suites E2E genéricas. La técnica de self-healing existe en varias herramientas comerciales con nombres distintos; lo que acá se discute es el criterio de diseño, no una implementación puntual. Revalidá contra tu framework: lo que no cambia es la regla —reparar sí, auto-mergear no.

---

## Resumen ejecutivo

- Un selector roto no falla solo: tira la suite entera de un flujo y esconde, entre el ruido, si además había un bug real detrás del cambio.
- Un agente puede hacer bien tres cosas: detectar el selector que dejó de resolver, proponer uno de reemplazo con criterio —estable, no frágil— y abrir un PR revisable con el diff y la evidencia del cambio de DOM.
- **La línea roja es el auto-merge: un selector reparado a ciegas puede estar tapando exactamente el bug que la suite tenía que atrapar. Reparar es una propuesta; confirmar que la reparación no encubre nada es una decisión humana.**
- El criterio de un buen selector no lo inventa el agente: un `data-testid` estable es un contrato de UI; un XPath posicional es una apuesta que se rompe al primer refactor.
- El paralelo es exacto con el reintento que oculta flakiness: automatizar la reparación sin revisión convierte una señal de que algo cambió en silencio, y el silencio es lo que deja pasar los bugs.

Al terminar vas a poder: describir qué parte del self-healing conviene automatizar, argumentar por qué el auto-merge es el anti-patrón, distinguir un selector estable de uno frágil y diseñar el flujo para que la reparación no tape una regresión.

---

## 1. El problema: el selector roto que tira la suite

Una suite E2E depende de encontrar elementos en la pantalla. Cuando un selector deja de resolver —porque la UI cambió, porque una clase se renombró, porque un contenedor se movió—, el test no falla con un mensaje útil: falla con "elemento no encontrado", y arrastra con él a todos los tests que pasaban por ese punto del flujo. Un cambio menor de maquetado puede pintar de rojo media suite.

El costo inmediato es el tiempo de arreglar selectores a mano, uno por uno, en un trabajo mecánico y desagradecido. Pero hay un costo más traicionero, y es el que ordena este artículo: entre esos rojos, ¿cuántos son un selector desactualizado y cuántos un bug real de UI que se manifiesta como un elemento que desapareció? Desde el "elemento no encontrado", las dos causas se ven igual. Ahí está el peligro de automatizar sin cuidado: un agente que "arregla" el selector para que el test vuelva a verde puede estar borrando la única evidencia de que la feature se rompió.

## 2. Qué puede hacer un agente

La parte mecánica del problema es real, y un agente la hace bien si se la acota. Frente a un selector que no resuelve, puede:

- **Detectar** cuál es, con precisión: no "el test falló" sino "el locator `#checkout-btn` no encontró nodo en esta página".
- **Proponer** un reemplazo con criterio: buscar el elemento que antes matcheaba por otras señales —texto, rol, atributos estables— y sugerir un selector nuevo que prefiera lo estable sobre lo posicional.
- **Abrir** un PR revisable con todo lo que hace falta para decidir: el selector viejo, el nuevo, el diff, y la evidencia del cambio de DOM que motivó la propuesta.

```text
  selector no resuelve
        │
        ▼
  el agente compara DOM viejo vs nuevo
        │
        ▼
  propone selector estable  ──►  abre PR con diff + evidencia
        │                              │
        │                              ▼
        │                       un humano revisa:
        │                       ¿refactor o bug?
        └──────────────────────────────┘
                 el agente no mergea
```

Todo lo de arriba es proponer. Ninguno de esos verbos es "mergear". El agente llega hasta el PR y se detiene, que es exactamente donde tiene que detenerse.

## 3. La línea roja: nunca auto-merge

El auto-merge de un selector reparado es tentador porque, la enorme mayoría de las veces, el selector solo se desactualizó y la reparación es correcta y aburrida. El problema es la minoría restante, y que desde adentro los dos casos son indistinguibles sin criterio humano.

Cuando un `#submit-order` deja de existir, hay dos historias posibles. Una: alguien renombró el botón en un refactor legítimo y el flujo funciona igual. Otra: la feature de confirmación de orden se rompió y el botón directamente no se renderiza. En la primera, reparar el selector es lo correcto. En la segunda, reparar el selector es **el peor resultado posible**: apaga la alarma que estaba sonando por la razón correcta. Un agente con auto-merge, ante el segundo caso, silencia el bug y deja la suite en verde. El test que existía para atrapar justo eso ahora certifica que todo está bien.

Por eso la reparación es una propuesta y no una acción. La pregunta que decide —¿este selector cambió por un refactor o porque la feature se rompió?— necesita contexto que el agente no tiene: qué se estaba desarrollando y qué se esperaba que cambiara. Esa pregunta la contesta una persona mirando el PR. El agente prepara la decisión; no la toma.

## 4. El criterio de un buen selector

Para que la propuesta del agente valga, tiene que proponer selectores estables, no cualquier cosa que resuelva. Y "estable" tiene una definición concreta que no inventa el agente: la trae el diseño de la UI.

| Tipo de selector | Estabilidad | Por qué |
|---|---|---|
| `data-testid` dedicado | Alta | Es un contrato explícito: existe para testear y cambia solo a propósito |
| Rol + texto accesible | Media-alta | Atado a la semántica, que cambia menos que la maquetación |
| Clase de CSS | Baja | Las clases son de estilo; se renombran en cualquier refactor visual |
| XPath posicional | Muy baja | "El tercer div del segundo span" se rompe al mover un pixel |

Un agente que propone reemplazar un XPath frágil por otro XPath frágil no arregló nada: movió el problema unos días. Un agente que propone un `data-testid` —o, mejor, que detecta que el elemento no tiene uno y lo señala como deuda— está reparando de verdad. Ese criterio es un contrato entre la UI y la suite, desarrollado en [Selectores sostenibles: contratos de UI](/blog/selectores-sostenibles-contratos-ui/). El agente lo aplica; no lo reemplaza por lo primero que matchee.

## 5. Cómo se evita que el self-healing tape bugs

La defensa contra la reparación que encubre no es técnica sino de proceso, y cabe en una pregunta que el PR obliga a responder: *¿el selector cambió por un refactor legítimo o porque la feature se rompió?* Mientras esa pregunta la conteste un humano con el diff a la vista, el self-healing suma. En el momento en que la contesta el agente mergeando solo, el self-healing se vuelve una máquina de ocultar regresiones.

El paralelo con el reintento no es una metáfora: es el mismo error con otra ropa. Un test flaky que se "arregla" reintentándolo hasta que pasa no dejó de ser flaky; dejó de avisar. La flakiness sigue ahí, ahora invisible: el día que el fallo sea real, el reintento lo va a tapar. Reparar un selector con auto-merge es reintentar a nivel de código: ambos convierten una señal en silencio. Ese mecanismo —cómo el reintento a ciegas oculta el no-determinismo en vez de resolverlo— está en [Testing de sistemas no deterministas](/blog/testing-sistemas-no-deterministas/).

La regla, entonces, se sostiene sola: el self-healing es excelente para el trabajo mecánico de proponer la reparación, y una pésima idea como mecanismo autónomo de merge. La diferencia entre una cosa y la otra es el PR, y el humano que lo lee.

## 6. Por qué esto es Quality Engineering

Reparar un selector es fácil; saber cuándo no repararlo es el trabajo. Esa distinción —entre el cambio cosmético que hay que absorber y el cambio que era un bug disfrazado— es criterio de calidad puro, y es justo lo que no se puede delegar a un merge automático. Un agente de self-healing bien diseñado respeta esa frontera: automatiza el tedio de proponer y deja intacta la decisión de aceptar.

Es la misma línea roja de toda la colección, aplicada a un caso donde la tentación de cruzarla es máxima porque el trabajo repetitivo es máximo. Y es precisamente cuando más tienta el atajo que más importa la regla.

> Para el criterio de selectores que el agente debe aplicar, [Selectores sostenibles: contratos de UI](/blog/selectores-sostenibles-contratos-ui/); para el mecanismo por el que un arreglo a ciegas oculta señales, [Testing de sistemas no deterministas](/blog/testing-sistemas-no-deterministas/). El estilo de evidencia que un PR de reparación debería adjuntar vive en [`flakiness-hunting-playwright`](https://github.com/fercarballo/flakiness-hunting-playwright). El marco de por qué el agente propone y el humano decide está en el pilar [Agentes para QA](/blog/agentes-para-qa-propone-evidencia-humano-decide/).
