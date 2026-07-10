---
title: "Seis repositorios, una narrativa: cómo se diseña un portfolio con profundidad"
description: "Diseño de un portfolio avanzado de Quality Engineering: alcance y no-alcance por MVP, contratos entre repositorios, backlog por dependencias, riesgos de complejidad y criterio de descarte."
pubDate: 2026-07-10
tags: ['portfolio', 'github', 'quality-engineering', 'arquitectura', 'mvp', 'nexo-finanzas']
cluster: 'a10'
clusterTitle: "Nueva tanda de proyectos avanzados"
type: pilar
order: 1
readingLevel: "Avanzado"
prerequisites: "Requiere haber recorrido los capítulos 01 a 08."
icon: 'container'
iconHue: 260
---

> **Aviso.** Nexo Finanzas es **ficticio**. **Ningún repositorio fue creado ni ejecutado para escribir este artículo.** Las estimaciones son relativas, nunca fechas. No se afirma experiencia productiva.

> **Promesa del artículo.** Al terminar vas a saber elegir qué construir y qué no, definir un criterio de finalización que no dependa de tu propia satisfacción, y —lo más difícil— tener un criterio escrito para **matar un proyecto** antes de que te consuma tres meses.

## El portfolio que no funciona

Es reconocible al instante. Doce repositorios. Cada uno con un README que dice *"Demo de X con Y"*. El último commit de nueve de ellos es "Initial commit". El que tiene más trabajo tiene un `main` roto.

No falla por falta de esfuerzo. Falla porque **no demuestra nada que un entrevistador no pueda hacer en una tarde**.

Un portfolio senior no compite en cantidad de tecnologías. Compite en **profundidad de decisión**. La pregunta que responde no es *"¿sabe usar Kafka?"* sino *"¿sabe por qué eligió un broker en vez de una tabla con polling, y puede defender esa decisión contra la alternativa?"*

Esa es la única pregunta, y se responde con un ADR, no con un repositorio.

> **Regla de diseño del portfolio:** la prioridad es profundidad y evidencia. No crear repositorios vacíos ni siete demos superficiales.

## Los seis, y el criterio de la lista

| Orden | Repositorio | Capacidad central | Por qué está en la lista |
|---:|---|---|---|
| 1 | `nexo-event-platform` | Eventos, AsyncAPI, outbox, idempotencia | Es el cambio conceptual del que dependen tres de los otros |
| 2 | `nexo-data-reconciliation` | Data quality, lineage, reconciliación | Es lo que **demuestra** que el 1 funciona |
| 3 | `nexo-supply-chain-lab` | SBOM, provenance, firmas, policies | Alto valor, bajo prerrequisito. No necesita cluster |
| 4 | `nexo-progressive-delivery` | Flags, canary, GitOps, rollback | Requiere 1 y 3. No se puede adelantar |
| 5 | `nexo-risk-engine` | Reglas versionadas y evaluación | Requiere 1 y 2 |
| 6 | `nexo-quality-developer-platform` | Golden paths, self-service | Requiere haber recorrido todo lo anterior a mano |

**Lo que no está en la lista, y es deliberado:**

- **FinOps no es un repositorio.** Es una capacidad transversal. Un `nexo-quality-economics` vacío de datos reales sería una planilla con nombre de repo. Vive dentro del 6.
- **Privacidad tampoco.** Atraviesa los seis. Un repo de privacidad separado invita a tratarla como una etapa, que es exactamente el anti-patrón.

Y una nota sobre el orden: el 2 va antes que el 3 porque **la reconciliación es el test del outbox**. Podés escribir un outbox que parece funcionar y no funciona; solo la reconciliación te lo dice. Construir la evidencia antes que la siguiente capacidad es un patrón que se repite en toda la serie.

## Dependencias

<figure class="diagram">
  <img src="/blog/diagrams/seis-repositorios-una-narrativa-1.svg" width="1242" height="247" alt="Diagrama: seis-repositorios-una-narrativa (1)" loading="lazy" decoding="async" />
</figure>

Las flechas son **dependencias de contrato**, no de código. `nexo-data-reconciliation` no importa clases de `nexo-event-platform`: consume el `asyncapi.yaml` versionado. Esa distinción es lo que permite trabajar en un repositorio sin levantar los otros cinco.

## Las ocho reglas de diseño

Cada una es una restricción, y cada restricción existe porque su ausencia produce un fracaso conocido.

1. **Reusar contratos y datos ficticios de Nexo.** Un dominio compartido convierte seis demos en un sistema. Es lo que hace que la narrativa exista.
2. **Una responsabilidad principal por repo.** Si `nexo-event-platform` también hace reconciliación, no aprendiste a separar contextos.
3. **Integración por contratos versionados.** Ver arriba.
4. **Docker Compose antes que Kubernetes.** Compose se lee, se depura y se levanta en veinte segundos. Un cluster local es una barrera de entrada para cualquiera que quiera correr tu demo, incluido un entrevistador con quince minutos.
5. **No introducir broker, cluster o SaaS sin explicar el riesgo que resuelve.** Con un ADR que nombre la alternativa descartada.
6. **Todo servicio tiene health/readiness, logs correlacionables y tests.** Sin excepción. Un servicio sin readiness no se puede orquestar; uno sin `correlationId` no se puede depurar.
7. **Ningún proyecto depende de credenciales pagas para su demo básica.** Si tu demo requiere una cuenta de un SaaS, tu demo no se puede correr.
8. **Cada repo necesita modo local, evidencia y límites.**

La regla 8 esconde la más importante de todas, y merece su propia sección.

## "Qué NO demuestra este proyecto"

Cada README debe tener esa sección. Literalmente ese título.

```markdown
## Qué NO demuestra este proyecto

- **No demuestra escalabilidad.** El broker corre en un contenedor con una partición.
  No se ejecutaron pruebas de carga y no se afirma ningún throughput.
- **No demuestra operación en producción.** Nunca tuvo usuarios. Nunca hubo un incidente real.
- **No demuestra cumplimiento regulatorio.** Nexo Finanzas es ficticio y no procesa dinero.
- **No demuestra alta disponibilidad.** Una sola instancia de todo.
- **Los runbooks nunca se ejecutaron bajo presión real.** Se ensayaron en el sandbox,
  y la fecha del ensayo está registrada.
```

Contraintuitivamente, **esta sección hace que el proyecto se vea más serio, no menos.**

La razón es simple: un entrevistador senior va a probar exactamente esos límites. Si tu README ya los declaró, la conversación empieza en un nivel más alto —hablan de las decisiones— en vez de gastarse en desarmar una exageración. Y si no los declaraste, la conversación va a ser sobre por qué no.

Decir *"construí un sandbox que demuestra X; nunca operé esto con usuarios reales"* **suma**. Insinuar lo contrario resta, y se detecta con dos preguntas.

## Criterio de finalización

Un repositorio no está terminado cuando vos estás satisfecho. Está terminado cuando cumple siete condiciones **verificables por otra persona**:

- [ ] **Una persona nueva puede ejecutarlo.** No vos. Otra persona, en una máquina limpia, siguiendo el README.
- [ ] **El flujo feliz y los fallos críticos tienen pruebas.** Los fallos críticos, no solo el happy path.
- [ ] **Hay evidencia real y fechada.**
- [ ] **Los secretos están externalizados.** `.env.example`, nunca `.env`.
- [ ] **Existe al menos un ADR con trade-offs reales.** Un ADR que solo lista ventajas no es un ADR.
- [ ] **El README declara qué no demuestra el proyecto.**
- [ ] **Hay un artículo técnico asociado.**

La primera condición es la que más proyectos reprueba. Y hay una forma barata de verificarla: **borrá tu caché de Maven, cloná en un directorio nuevo, y seguí tu propio README línea por línea.** Cada vez que tengas que "saber" algo que no está escrito, encontraste una dependencia oculta.

El último punto merece una aclaración: **el artículo no es el tutorial del repositorio.** Es la explicación de una decisión. "Cómo montar Kafka con Docker Compose" no es un artículo técnico senior. "Por qué elegí polling sobre CDC en un sistema que no tiene volumen, y qué señal me haría cambiar" sí lo es.

## Riesgos de complejidad, y cómo se ven

Cinco formas concretas en que este plan puede fracasar. Reconocerlas temprano es la mitad del trabajo.

| Riesgo | Cómo se ve | Mitigación |
|---|---|---|
| **Big bang** | Empezás los seis a la vez | La regla de secuencia: uno por vez |
| **Yak shaving de infraestructura** | Tres semanas configurando el cluster local | Compose primero. Kubernetes solo en el nivel opcional |
| **Tecnología sin riesgo** | Agregás CDC porque es interesante | ADR que nombre el riesgo que resuelve. Si no hay riesgo, no entra |
| **Demo que nadie puede correr** | Requiere seis servicios levantados | Modo local por repo, con dependencias estrictas |
| **Documentación que miente** | El diagrama muestra un outbox que el código no tiene | Cada caja del diagrama señala un archivo |

Y una señal de alarma que vale por las cinco: **si llevás dos semanas sin escribir un test, no estás construyendo un portfolio de calidad. Estás construyendo un sistema.** Son cosas distintas y solo una es el objetivo.

## Cuándo detener o descartar un proyecto

Este es el criterio que casi nunca se escribe, y el que más valor tiene.

**Detené un proyecto cuando:**

- Llevás más tiempo del estimado y **no podés articular qué riesgo demuestra**. Si no podés terminar la frase *"este repo demuestra que sé controlar el riesgo de ___"*, no hay nada que terminar.
- La complejidad de infraestructura superó a la del problema. Si el 70 % de los commits son de `docker-compose.yml`, estás aprendiendo Docker, no Quality Engineering. Puede estar bien; no era el objetivo.
- El repositorio anterior **no cumple su criterio de finalización**. Volvé a él.

**Descartá un proyecto cuando:**

- Otro repositorio ya demuestra la misma capacidad, mejor.
- La capacidad requiere un prerrequisito que no tenés y no vas a tener en el horizonte del plan.
- Al escribir el ADR descubrís que **la respuesta honesta es "no lo necesitaría"**.

Ese último caso es un éxito, no un fracaso. Un ADR que concluye *"no incorporamos GitOps: el proyecto tiene un servicio y un desarrollador; el drift no es un problema que tengamos"* **demuestra más criterio que el repositorio que lo habría implementado.**

Y ese ADR es publicable. Es, de hecho, uno de los artículos más interesantes que podés escribir: *"Por qué no usé Kubernetes en mi portfolio"*.

**Escribí el criterio de descarte antes de empezar.** Cuando llevás seis semanas en algo, tu juicio sobre si vale la pena está comprometido por lo que ya invertiste. El criterio escrito hace tres meses no lo está.

## Documentación estándar

Idéntica en los seis. La uniformidad es lo que hace que un revisor pueda navegarlos sin reaprender.

```text
README.md              # incluye "Qué NO demuestra este proyecto"
docs/architecture/     # arquitectura ACTUAL; la objetivo va aparte y rotulada
docs/adr/              # con trade-offs reales y alternativas descartadas
docs/quality/risk-matrix.md
docs/quality/test-strategy.md
docs/runbooks/         # con tabla de "último ensayo"
docs/learning/         # qué aprendiste. Esto se lee más de lo que creés
CONTRIBUTING.md
SECURITY.md            # declara que es un sandbox ficticio
.env.example           # nunca .env
```

`docs/learning/` es la carpeta que más lee un entrevistador y la que menos gente tiene. Un archivo que dice *"intenté X, no funcionó por Y, terminé haciendo Z"* vale más que el código.

## Antes de escribir una línea de código

El prompt de diseño pide siete entregables antes de programar. Están en los artefactos:

1. **Alcance y no-alcance de cada MVP** → `artefactos/alcance-y-no-alcance-por-repo.md`
2. **Contratos entre repos** → `artefactos/backlog-por-dependencias.md`
3. **Arquitectura local** → ídem
4. **Backlog por dependencias** → ídem
5. **Riesgos de complejidad** → la tabla de arriba
6. **Criterio para detener o descartar** → la sección de arriba
7. **Estimación relativa, sin fechas** → en el backlog, como S/M/L

Sobre el 7: **no prometas fechas.** Un portfolio se construye en el tiempo que sobra, y ese tiempo es irregular. Estimá en tamaño relativo, medí en incrementos completados, y ajustá. Un plan con fechas que se incumplen enseña a ignorar el plan.

## La regla que hay que obedecer

> **Comenzá solo por `nexo-event-platform`. No inicies el segundo repositorio hasta que el primero tenga setup, tests, documentación y evidencia.**

Se va a sentir lento. Al terminar el primero vas a tener ganas de empezar tres. Y el resultado de resistir esa tentación es la diferencia entre un portfolio con un repositorio profundo y cinco esbozos, y uno con seis repositorios terminados.

Uno de esos dos resultados consigue entrevistas.

## Anti-patrones

- **Doce repositorios con "Initial commit".** *Alternativa:* uno terminado vale más que seis empezados.
- **Repositorio sin la sección "qué NO demuestra".** *Consecuencia:* el entrevistador la descubre, y ahora la conversación es sobre tu honestidad. *Alternativa:* declararlo suma.
- **Empezar el segundo repo antes de terminar el primero.** *Alternativa:* la regla de secuencia.
- **Kubernetes antes que Compose.** *Consecuencia:* nadie puede correr tu demo. *Alternativa:* Compose, y el cluster como nivel opcional.
- **Demo que depende de credenciales pagas.** *Alternativa:* la demo básica corre sin cuentas.
- **Agregar tecnología sin ADR del riesgo que resuelve.** *Alternativa:* si no hay riesgo, no entra.
- **Artículo que es el tutorial del repo.** *Consecuencia:* demuestra que seguiste una guía. *Alternativa:* el artículo explica una **decisión**.
- **ADR que solo lista ventajas.** *Alternativa:* alternativas descartadas y consecuencias negativas.
- **Un diagrama con componentes que el código no tiene.** *Alternativa:* cada caja señala un archivo.
- **No escribir el criterio de descarte antes de empezar.** *Consecuencia:* a las seis semanas tu juicio está comprometido por la inversión. *Alternativa:* escribilo hoy.
- **Prometer fechas.** *Alternativa:* estimación relativa, medición por incrementos completados.

## Qué aprendimos / próximos pasos

- Un portfolio senior compite en profundidad de decisión, no en cantidad de tecnologías.
- La reconciliación va antes que la siguiente capacidad, porque **es el test** del outbox.
- FinOps y privacidad son transversales. Convertirlas en repos las convierte en etapas.
- "Qué NO demuestra este proyecto" hace que el proyecto se vea más serio.
- El criterio de finalización lo verifica **otra persona**, en una máquina limpia.
- Un ADR que concluye "no lo necesitaría" demuestra más criterio que el repo que lo habría implementado. Y es publicable.
- Escribí el criterio de descarte antes de invertir, cuando tu juicio todavía es libre.

**Siguiente:** [el plan de integración con lo que ya existe](/blog/coleccion/a11/), o —si preferís un solo proyecto integral— [el capstone acotado](/blog/coleccion/a12/).

## Checklist final

- [ ] Está escrito el alcance **y el no-alcance** de cada MVP.
- [ ] Los contratos entre repos están definidos y versionados.
- [ ] El backlog respeta las dependencias del diagrama.
- [ ] Cada repo tiene modo local que corre sin credenciales pagas.
- [ ] Cada README tiene la sección "Qué NO demuestra este proyecto".
- [ ] Cada repo tiene al menos un ADR con la alternativa descartada.
- [ ] Ningún broker, cluster o SaaS entró sin ADR del riesgo que resuelve.
- [ ] Docker Compose antes que Kubernetes.
- [ ] Cada servicio tiene health, readiness y `correlationId`.
- [ ] El criterio de finalización lo verificó **otra persona**.
- [ ] El criterio de detención y descarte está escrito **antes** de empezar.
- [ ] Las estimaciones son relativas; no hay fechas prometidas.
- [ ] Solo hay **un** repositorio en curso.

---

## Fuentes (consultadas 2026-07-10)

- Este artículo es de diseño de portfolio; no depende de versiones de herramientas.
- Las capacidades que los seis repositorios encarnan están desarrolladas en los [capítulos 01 a 08](/blog/de-qa-automation-a-quality-engineering-mapa-de-180-dias/) de esta serie, cada uno con sus fuentes primarias.
- [Verificación de fuentes de la serie](/blog/verificacion-de-fuentes-serie-avanzada/)
