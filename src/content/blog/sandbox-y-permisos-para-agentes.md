---
title: "Sandbox y permisos: lo que vuelve operable a un agente"
description: "Permisos por herramienta y recurso, sandbox de ejecución, presupuestos duros y HITL en el punto irreversible: los guardrails que vuelven operable a un agente, y cómo se testean."
pubDate: 2026-07-15
tags: ['seguridad', 'agentes', 'guardrails', 'sandbox', 'sdet']
cluster: 'g06'
clusterTitle: "Seguridad agéntica"
type: satelite
order: 3
readingLevel: "Intermedio–Avanzado"
prerequisites: "Nociones de contenedores."
icon: 'shield'
iconHue: 355
---

> **Subtítulo:** Los guardrails que separan una demo de algo operable —permisos por herramienta y recurso, sandbox de ejecución, presupuestos duros y aprobación humana en el punto exacto— y por qué cada uno se testea probando que la acción prohibida se rechaza.

> **Nota de alcance.** Ejemplos ilustrativos sobre sistemas ficticios. Las herramientas de aislamiento y sus modos cambian rápido; los detalles concretos revalidalos contra tu plataforma. Acá se testean defensas propias, no se ataca nada ajeno.

---

## Resumen ejecutivo

- Una demo de agente y un agente que se puede operar se parecen en el video y se diferencian en todo lo demás: la diferencia son los **guardrails**. La demo muestra lo que el agente *puede* hacer; lo operable define lo que **no** puede.
- Los permisos se dan **por herramienta y por recurso**, no por agente entero: allowlists explícitas, read-only por defecto, y modos de aprobación para lo que escribe.
- **Ejecutar código generado sin sandbox es ejecutar código no revisado en tu máquina: el sandbox no es un lujo de la ejecución de código, es su condición.**
- Los presupuestos de tokens, tiempo y dinero son un **corte duro**, no una advertencia. Una advertencia que no frena nada es un comentario, no un control.
- El HITL se pone en el **punto irreversible exacto**, no en todos lados; y decidir qué se pregunta y cuándo es diseño de UX de seguridad. Todo guardrail se testea probando que lo prohibido efectivamente se rechaza.

Al terminar vas a poder diseñar permisos por herramienta y recurso, decidir qué ejecutar en sandbox, poner presupuestos como corte duro, ubicar el HITL en el punto de no retorno y escribir la prueba negativa que verifica que cada guardrail frena.

---

## 1. El problema: la demo funciona; lo operable es otra cosa

Un agente que en una demo abre el navegador, busca, edita un archivo y corre un script es hipnótico. También es, tal cual está, imposible de poner en producción sobre datos o infraestructura reales. La demo optimiza para mostrar capacidad; la operación exige lo contrario: **acotar** qué puede pasar cuando nadie está mirando y una instrucción hostil se cuela en el contexto.

Esa distancia tiene nombre: guardrails. No son un accesorio que se agrega si sobra tiempo; son lo que convierte "el agente *puede* hacer X" en "el agente puede hacer X **solo bajo estas condiciones**". El pilar de esta colección mostró por qué la seguridad de un agente es una condición de diseño; este artículo baja esa idea a los cuatro controles concretos que la hacen operable, y a cómo se prueba cada uno.

## 2. Permisos por herramienta y por recurso

El primer error es razonar en términos de "el agente tiene acceso". El acceso no es del agente: es de **cada herramienta sobre cada recurso**. Un agente con diez tools tiene diez superficies distintas, y cada una merece su propio permiso.

Tres reglas ordenan el diseño:

- **Allowlist, no denylist.** Se enumera lo permitido, no lo prohibido. Una denylist siempre olvida un caso; una allowlist falla cerrada: lo que no está listado, no se puede.
- **Read-only por defecto.** Una herramienta arranca sin capacidad de escritura, y la escritura se concede explícitamente y acotada. Leer un ticket y cerrar un ticket son permisos separados.
- **Modos de aprobación por herramienta.** Cada tool declara si corre sola, si pide confirmación, o si está deshabilitada en este contexto. La misma herramienta puede ser automática en staging y requerir aprobación en producción.

El permiso, además, es **por recurso**, no solo por tipo de acción. "Puede escribir en el repositorio" es demasiado grueso; "puede comentar en issues de este repo, no hacer push a `main`" es un permiso operable. Es la misma autorización por objeto que gobierna una API: un token no habilita a tocar cualquier cosa, sino un objeto específico bajo una regla. El [threat modeling de una API de transferencias](/blog/threat-modeling-para-qa-api-transferencias/) desarrolla esa lógica de autorización por objeto y función que acá se traslada a las herramientas.

## 3. Sandbox de ejecución: correr lo generado es correr lo no revisado

Cuando un agente ejecuta código —el que él mismo escribió o el que encontró—, aparece la regla más dura del capítulo: **ejecutar código generado sin sandbox es ejecutar código no revisado en tu máquina.** Nadie leyó ese código antes de correrlo; asumir que es inofensivo porque lo produjo el agente es exactamente la confianza que un atacante necesita.

El sandbox es el entorno aislado donde esa ejecución ocurre sin poder dañar el resto:

- **Contenedores o microVMs** que aíslan el proceso del host.
- **Filesystem efímero:** se crea para la tarea y se destruye al terminar; nada persiste ni escala privilegios entre corridas.
- **Perfil de red restringido:** sin salida a Internet por defecto, o con una allowlist mínima de destinos. Esto no es solo higiene: cortar la red **corta un canal de salida de la tríada letal**. Un sandbox sin red vuelve la exfiltración mucho más difícil aunque la inyección haya funcionado.

El sandbox no es opcional cuando hay ejecución de código. Un agente que corre scripts contra tu filesystem real, con red abierta y permisos del usuario, no tiene un problema de seguridad potencial: tiene uno actual esperando el input correcto.

## 4. Presupuestos como corte duro, no como advertencia

Un agente decide su propio control de flujo, así que puede iterar de más: reintentar, ramificar, quedar en loop. Sin un techo, eso se traduce en costo —de tokens, de tiempo, de dinero real cuando cada acción llama a un servicio pago—. La lección negativa de los loops autónomos de 2023 fue exactamente esa: sin freno, divagan y queman presupuesto.

La regla es que el presupuesto sea un **corte duro**, no una advertencia. Un log que dice "llevás muchos tokens" no frena nada; es un comentario. Un corte duro **aborta la corrida** al tocar el techo: tantos tokens, tantos segundos, tanto gasto, y el agente se detiene con un estado explícito de "presupuesto agotado". Esa condición de parada por presupuesto es parte del diseño del agente antes que de su seguridad, y tiene su propio desarrollo en [Condición de parada y presupuestos del agente](/blog/condicion-de-parada-y-presupuestos-del-agente/). Desde la óptica de seguridad, agrega algo: un presupuesto duro acota también el daño de un agente secuestrado, que no puede iterar indefinidamente ejecutando la voluntad del atacante.

## 5. HITL en el punto irreversible, y la UX de qué se pregunta

El human-in-the-loop es el guardrail que detiene al agente para pedir aprobación antes de una acción que no se puede deshacer. Su valor depende por completo de **dónde** se coloca. Pedir confirmación en cada paso convierte al agente en un formulario tedioso y entrena al humano para apretar "sí" sin leer —fatiga de aprobación, que es peor que no preguntar—. Pedirla en ninguno deja pasar lo irreversible.

El HITL va en el **punto de no retorno exacto**: mandar el mail, mover el dinero, borrar el recurso, publicar el cambio. Y ahí aparece un diseño que es, literalmente, UX de seguridad: **qué se pregunta y cuándo**.

```text
   acción que el agente quiere ejecutar
                 │
                 ▼
     ¿es reversible y de bajo impacto?
        │                     │
       sí                     no
        ▼                     ▼
   correr sola          pedir aprobación
   (auto)               en el punto exacto
                             │
              ┌──────────────┴──────────────┐
              │  mostrar: qué acción,        │
              │  sobre qué recurso,          │
              │  con qué efecto irreversible │
              └──────────────┬──────────────┘
                     aprueba  │  rechaza
                        ▼      │     ▼
                    ejecutar   │   abortar + registrar
```

Una buena pregunta de aprobación muestra la acción concreta, el recurso afectado y el efecto —no un genérico "¿continuar?"—. La aprobación informada es un control; el clic reflejo no lo es.

## 6. Cómo se testea que un guardrail realmente frena

Un guardrail no probado es decoración. Y la prueba de un guardrail no es que la acción permitida funcione: es que la **acción prohibida se rechace**. Es la misma idea del gate que valida al gate del [red teaming como regresión](/blog/red-teaming-de-agentes-como-regresion/): se verifica el control en la dirección del bloqueo, no en la del paso feliz. Un permiso read-only del que solo probaste que lee, sin probar que la escritura se deniega, no está verificado: está supuesto.

| Control | Qué previene | Cómo se testea |
|---|---|---|
| Allowlist de herramientas | Uso de una tool no autorizada en este contexto | Invocar una herramienta fuera de la lista y verificar que se rechaza |
| Read-only por recurso | Escritura o borrado no autorizados | Intentar la escritura prohibida y verificar denegación + que el recurso no cambió |
| Sandbox sin red | Exfiltración y acceso al host desde código generado | Correr una tarea que intente salir a la red y verificar que no hay salida |
| Filesystem efímero | Persistencia y escalada entre corridas | Escribir un archivo, terminar la tarea y verificar que no sobrevive |
| Presupuesto duro | Loops y costo sin techo | Forzar una corrida larga y verificar que aborta al tocar el límite |
| HITL en lo irreversible | Acción de no retorno sin aprobación | Disparar la acción y verificar que queda pendiente, sin ejecutarse, hasta aprobación |

Cada fila es una prueba negativa: define una acción que **no** debe ocurrir y verifica que el guardrail la frena. Corridas en CI, son la evidencia de que "el agente está acotado" es un hecho medible y no una intención. Es el mismo criterio de siempre: un control existe en el diseño, pero solo una prueba demuestra que funciona.

> Este satélite baja a controles concretos el marco del pilar [La tríada letal](/blog/la-triada-letal-seguridad-de-agentes/): cada guardrail de acá rompe o adelgaza una de sus patas. Para el corte por presupuesto como condición de parada del agente, [Condición de parada y presupuestos del agente](/blog/condicion-de-parada-y-presupuestos-del-agente/).
