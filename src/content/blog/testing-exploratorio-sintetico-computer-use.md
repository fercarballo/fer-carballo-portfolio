---
title: "Testing exploratorio sintético con computer use"
description: "Un agente que ve la pantalla y opera como un usuario puede explorar caminos que un script fijo no cubre. La promesa, los límites honestos y cómo usarlo con criterio QA."
pubDate: 2026-07-15
tags: ['agentes', 'computer-use', 'test-automation', 'quality-engineering', 'sdet']
cluster: 'g07'
clusterTitle: "Agentes para QA"
type: satelite
order: 4
readingLevel: "Intermedio–Avanzado"
prerequisites: "Nociones de computer-use agents."
icon: 'check'
iconHue: 88
---

> **Subtítulo:** Computer use como el "usuario sintético" que recorre flujos reales viendo la pantalla, la promesa de explorar lo que un script fijo no cubre, los límites honestos —frágil, lento, caro— y cómo se lo usa con criterio QA: como complemento exploratorio, no como reemplazo del E2E determinista.

> **Nota de alcance.** Ejemplos ilustrativos. Los benchmarks que se mencionan (WebArena, OSWorld) se citan por su hallazgo cualitativo —los mejores agentes quedan lejos del humano—, sin porcentajes propios; revalidá los números contra la tabla vigente al momento de leer. Computer use es un terreno que cambia rápido: lo que hoy es lento y frágil puede no serlo mañana, y al revés.

---

## Resumen ejecutivo

- Un script E2E recorre exactamente lo que alguien previó. Un explorador sintético que ve la pantalla puede recorrer lo que nadie previó, que es donde suelen vivir los bugs raros.
- Computer use (Anthropic, 2024) hizo viable al "usuario sintético": un agente que percibe la interfaz —captura o árbol de accesibilidad— y opera mouse y teclado como lo haría una persona.
- **La promesa es real pero acotada: es frágil ante cambios visuales, lento porque razona por captura y paso, y su costo por tarea puede superar al de un humano. Los benchmarks lo confirman —en WebArena y OSWorld los mejores agentes quedan lejos de lo que una persona resuelve con facilidad.**
- Con criterio QA se usa como complemento, no como reemplazo: presupuesto acotado, objetivos por riesgo, reporte de hallazgos revisable. El E2E determinista sigue siendo el guardián de la regresión.
- A un explorador sintético se lo evalúa por su señal: ¿encontró algo real o produjo ruido? La métrica que importa no es cuánto recorrió, sino su tasa de falsos hallazgos.

Al terminar vas a poder: explicar qué aporta computer use al exploratorio, enumerar sus límites sin marketing, diseñar una corrida con presupuesto y objetivos por riesgo, y evaluar si un explorador sintético produce señal o ruido.

---

## 1. El problema: el script solo recorre lo que ya conocés

La automatización E2E tiene una virtud y una ceguera, y son la misma. La virtud: recorre un flujo de manera repetible, y por eso sirve de regresión —si mañana se rompe, avisa—. La ceguera: recorre *solo* ese flujo, el que alguien pensó y escribió. Todo camino que nadie previó queda fuera de la suite por definición, porque un script no explora: ejecuta un guion.

Los bugs interesantes tienden a esconderse justo ahí, en los caminos que nadie escribió: la combinación rara de opciones, el orden de pasos que no estaba en el happy path, el estado al que se llega solo si se hace algo "mal". El testing exploratorio existe para cubrir ese hueco, y siempre fue trabajo humano: una persona hábil recorriendo el producto con curiosidad y sospecha. La pregunta de este artículo es qué tanto de ese recorrido puede hacer un agente, y a qué costo.

## 2. Computer use: el usuario sintético que ve la pantalla

Durante años, automatizar la UI significó atarse al DOM o a una API de accesibilidad: el programa no "veía" la pantalla, la leía por debajo. Computer use (Anthropic, 2024) cambió el punto de entrada: el agente percibe la interfaz como una imagen —o un árbol de accesibilidad— y opera mouse y teclado sobre ella, igual que una persona. No necesita un selector; necesita mirar y decidir dónde hacer clic.

Eso lo convierte en el usuario sintético más parecido a un usuario real que hubo hasta ahora. No sigue un guion: recibe un objetivo —"intentá comprar un producto y aplicar un cupón"— y decide sus pasos mirando lo que aparece. Puede toparse con un estado inesperado y reaccionar, cosa que un script fijo no hace. Ahí está la promesa: explorar el producto como lo haría un tester curioso, sin que nadie tenga que escribir cada paso de antemano.

```text
   ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
   │  PERCEPCIÓN  │ ──► │    ACCIÓN    │ ──► │   HALLAZGO   │
   │  ve la       │     │  clic, tipeo,│     │  ¿algo se    │
   │  pantalla    │     │  scroll      │     │  rompió?     │
   └──────────────┘     └──────────────┘     └──────────────┘
          ▲                                         │
          │                                         ▼
          └────────── observa el resultado ─────────┘
                 (un ciclo por captura: lento)
```

## 3. Los límites honestos

La promesa viene con una factura, y contarla completa es parte del trabajo de QA. Un explorador sintético con computer use tiene tres límites que no son de implementación sino de la técnica misma, al menos hoy.

- **Es frágil ante lo visual.** Como decide mirando, un cambio de layout, un color, un overlay inesperado lo pueden confundir de maneras que un humano ni registra. Su robustez es la de la percepción, no la de un contrato.
- **Es lento.** Razona por captura y por paso: mira, piensa, actúa, vuelve a mirar. Cada acción cuesta un ciclo completo. Un flujo que una persona hace en veinte segundos le puede llevar varios minutos.
- **Puede ser caro.** El costo por tarea —cómputo, tokens, tiempo— puede superar al de que la haga un humano. Para un flujo puntual, sale más barato el tester; el agente rinde cuando la exploración se repite o se paraleliza.

Y hay un dato que vacuna contra el entusiasmo: en los benchmarks que miden esto —WebArena (2023) para tareas web, OSWorld (2024) para el escritorio completo—, los mejores agentes disponibles resuelven una fracción de lo que una persona hace con facilidad. La brecha con el humano es grande y está documentada. Cualquiera que venda computer use como un reemplazo del tester exploratorio está ignorando su propio marcador.

## 4. Cómo se usa con criterio QA

Que tenga límites no lo vuelve inútil: lo vuelve una herramienta con condiciones de uso. Usarlo bien es aplicarle el mismo criterio que a cualquier técnica cara y ruidosa.

- **Presupuesto acotado.** Nunca "explorá el sitio" sin límite. Se le da un techo de pasos, de tiempo y de costo, y una condición de parada. Un explorador sin presupuesto es la lección de AutoGPT repetida.
- **Objetivos por riesgo.** No explora todo por igual: se lo apunta a las zonas donde un bug duele más —checkout, alta de cuenta, permisos—, que es el mismo diseño por riesgo de siempre.
- **Reporte revisable.** Su salida es una lista de hallazgos con la secuencia de pasos y la captura donde algo se rompió, para que un humano confirme o descarte. Propone; no cierra bugs solo.
- **Complemento, no reemplazo.** El E2E determinista sigue siendo el guardián de la regresión, porque es repetible y barato de correr. El explorador sintético cubre el hueco de lo no previsto. Son capas distintas, no sustitutas.

La postura es la misma de toda la colección: el agente explora y presenta evidencia; una persona decide si el hallazgo es un bug que entra al backlog o ruido que se descarta.

## 5. Qué se evalúa de un explorador sintético

Un explorador que recorre mucho y no encuentra nada útil no es bueno: es caro. Y uno que reporta cien "hallazgos" de los cuales noventa son ruido es peor que no tenerlo, porque consume el recurso más escaso de QA —la atención— en descartar falsos positivos. Por eso a un explorador sintético no se lo evalúa por su actividad sino por su señal.

Las dos preguntas que importan son concretas: ¿los hallazgos son reales o son ruido? Y ¿cuál es su tasa de falsos hallazgos? Un explorador con tasa alta de falsos positivos entrena al equipo a ignorar sus reportes —la misma flakiness social que erosiona cualquier señal automatizada—. La utilidad no está en cuántos caminos recorrió, sino en la proporción de sus hallazgos que sobrevivió a la revisión humana. Ese marco —evaluar a un agente por su trayectoria y su outcome, no por la demo— está desarrollado en [Evaluar agentes: trayectoria, outcome y pass^k](/blog/evaluar-agentes-trayectoria-outcome-pass-k/).

## 6. Por qué esto es Quality Engineering

Computer use no reemplaza al testing exploratorio humano; le agrega una capa sintética que hay que saber dónde poner. Decidir eso —cuánto presupuesto, qué riesgo, cómo leer sus hallazgos, cuándo confiar y cuándo no— es criterio de calidad, no configuración de una herramienta. La disciplina que sabe diseñar por riesgo y desconfiar de las demos es la que puede sacarle valor sin creerle de más.

El puente natural es el mundo mobile, donde la exploración por riesgo ya era una necesidad por la explosión de dispositivos y estados: la lógica de acotar por riesgo que ordena una estrategia mobile es la misma que ordena una corrida de exploración sintética. Ese criterio está en [Calidad mobile por riesgo](/blog/calidad-mobile-por-riesgo/).

> Para evaluar si un explorador sintético produce señal o ruido, [Evaluar agentes: trayectoria, outcome y pass^k](/blog/evaluar-agentes-trayectoria-outcome-pass-k/); para la lógica de acotar la exploración por riesgo, [Calidad mobile por riesgo](/blog/calidad-mobile-por-riesgo/). El marco de por qué el agente propone y el humano decide está en el pilar [Agentes para QA](/blog/agentes-para-qa-propone-evidencia-humano-decide/).
