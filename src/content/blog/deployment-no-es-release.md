---
title: "Deployment no es release: por qué un pipeline verde no garantiza una entrega saludable"
description: "Pilar de progressive delivery: separar deployment de release, blast radius, guardrails técnicos y de negocio, y por qué la entrega gradual no reemplaza a las pruebas."
pubDate: 2026-07-10
tags: ['progressive-delivery', 'feature-flags', 'canary', 'release-engineering', 'sre', 'sdet']
cluster: 'a03'
clusterTitle: "Progressive delivery, feature flags y GitOps"
type: pilar
order: 1
readingLevel: "Avanzado"
prerequisites: "Requiere CI/CD, Kubernetes introductorio, métricas y SLOs."
icon: 'git'
iconHue: 205
---

> **Aviso.** Nexo Finanzas es **ficticio**. **Todos los porcentajes, umbrales y valores de latencia son ilustrativos**, no mediciones. No se ejecutó ningún cluster ni rollout. **No hay usuarios reales en ningún experimento de este portfolio.**

> **Promesa del artículo.** Al terminar vas a poder explicar por qué separar deployment de release es una decisión de arquitectura y no de herramienta; vas a saber qué es un guardrail y en qué se diferencia de una métrica; y vas a poder defender, en un review, que la entrega progresiva **no reemplaza** a las pruebas.

## El pipeline verde que igual causó un incidente

El pipeline de `nexo-transfer-api` corre 1.400 tests. Todos verdes. Los contratos validan. El SBOM se generó, la imagen está firmada y el gate de verificación pasó (ver [capítulo 02](/blog/coleccion/a02/)). El deploy sale a las 14:00.

A las 14:07, la nueva validación de beneficiarios rechaza transferencias legítimas. No es un bug de código: es un supuesto equivocado sobre el formato de los identificadores de cuenta en un subconjunto de datos que ningún test cubría porque **nadie sabía que ese subconjunto existía**.

Tus tests verificaron las hipótesis que sabías formular. El incidente ocurrió en la hipótesis que no sabías que estabas haciendo.

Esa es la brecha estructural que la entrega progresiva ataca. Y ataca solo esa. **No reemplaza tus tests: reduce el costo de estar equivocado.**

> **Tesis del capítulo.** La calidad de una release no termina en el pipeline. Progressive delivery limita la exposición, observa señales reales y detiene o revierte el cambio cuando una hipótesis deja de ser segura.

## La distinción que ordena todo

Dos verbos que la mayoría de los equipos usan como sinónimos:

- **Deployment:** poner una versión del código a correr en un entorno. Es un evento **técnico**. Nadie externo lo nota.
- **Release:** exponer una funcionalidad a un conjunto de usuarios. Es un evento **de producto**. Alguien lo nota.

Cuando están acoplados —el código nuevo se ejecuta apenas se despliega— tenés un solo instante en el que todo cambia, y una sola perilla: *deployar o no deployar*. El riesgo es binario.

Cuando están **separados**, ganás algo enorme:

<figure class="diagram">
  <img src="/blog/diagrams/deployment-no-es-release-1.svg" width="1276" height="159" alt="Diagrama: deployment-no-es-release (1)" loading="lazy" decoding="async" />
</figure>

El código nuevo está **en producción, ejecutándose, y apagado**. Eso cambia la naturaleza del problema:

- El deployment se vuelve **aburrido**. Podés hacerlo diez veces por día, en horario laboral, sin ceremonia. Si el código nuevo no hace nada, desplegar no da miedo.
- La release se vuelve **reversible en segundos**, sin rebuild, sin redeploy, sin pipeline. Apagás un flag.
- Y —esto es lo que menos se aprovecha— **el rollback deja de requerir un deployment**. La operación más urgente del peor momento pasa a ser la más barata.

**Consecuencia contraintuitiva:** el mayor beneficio de los feature flags no es hacer experimentos. Es que **desacoplan la reversión del despliegue**.

## Blast radius: la única métrica que importa antes de exponer

Antes de cualquier discusión sobre porcentajes, respondé una pregunta: *si esto está mal, ¿a quién y a cuánto daña?*

El **blast radius** es el conjunto de efectos que un cambio puede producir si su hipótesis es falsa. Se dimensiona en tres ejes:

| Eje | Pregunta | Ejemplo en Nexo (ficticio) |
|---|---|---|
| **Alcance** | ¿Cuántas entidades afecta? | 5 % de las transferencias sintéticas |
| **Severidad** | ¿Qué tan malo es el peor caso? | Rechazar una transferencia válida (recuperable) vs. duplicar un débito (grave) |
| **Reversibilidad** | ¿Se deshace? ¿Cuánto tarda? | Apagar un flag: segundos. Revertir una migración de schema: horas o nunca |

**Un canary con el 1 % del tráfico sobre una operación irreversible no es un canary.** Es un incidente pequeño. Si la operación escribe en un ledger, el 1 % de daño es daño real y permanente.

De acá sale una regla que vale por medio artículo:

> **La entrega progresiva protege lo reversible.** Para lo irreversible —migraciones, escrituras de dinero, envío de notificaciones— necesitás controles distintos: idempotencia, compensación, dry-run, y aprobación humana. Un canary no te salva de un `DELETE`.

Y una segunda:

> **Un canary que comparte una dependencia crítica con el resto del sistema tiene el 100 % del riesgo, no el 5 %.** Si el 5 % de tráfico canario satura la base de datos compartida, cae el 100 % de los usuarios. El porcentaje de tráfico no es el porcentaje de riesgo.

## Guardrails: una métrica no es un guardrail

Estas dos frases no significan lo mismo:

- *"Miramos el error rate durante el canary."* → es una métrica. Alguien la observa. Alguien decide.
- *"Si el error rate del canary supera el del baseline en más de X durante Y minutos, el rollout se aborta automáticamente."* → es un **guardrail**.

Un guardrail tiene cinco componentes obligatorios. Si le falta uno, es una métrica con buenas intenciones:

1. **Una señal** con definición precisa (numerador y denominador).
2. **Un baseline** contra el cual comparar. Comparar el canary contra un umbral absoluto es frágil; compararlo contra la versión estable **en el mismo momento** controla las variaciones del entorno.
3. **Un umbral** —que es una **hipótesis**, no una constante universal.
4. **Una ventana temporal.** Sin ventana, un pico de un segundo aborta un rollout sano.
5. **Una acción automática.** Pausar, revertir, o escalar a una persona.

### Tres clases de señal, y por qué necesitás las tres

| Clase | Ejemplo | Qué detecta | Qué NO detecta |
|---|---|---|---|
| **Técnica** | error rate 5xx, latencia p99, saturación | El servicio está roto | El servicio funciona perfecto y hace lo incorrecto |
| **De negocio** | tasa de transferencias completadas ÷ iniciadas | La funcionalidad hace lo incorrecto | Un fallo que aún no se manifiesta en el flujo |
| **Sintética** | un chequeo periódico que ejecuta el journey crítico | Fallos en caminos de bajo tráfico | Lo que el chequeo no ejercita |

**El anti-patrón clásico:** promover un canary mirando solo CPU y latencia. El incidente de la introducción no habría movido ninguna de las dos. El servicio respondía rápido, con `200 OK`, rechazando transferencias legítimas.

La señal que lo habría detectado es de negocio: **transferencias completadas ÷ transferencias iniciadas, comparada contra el baseline, en la misma ventana.** Definirla bien es trabajo de Quality Engineering, no de SRE, porque requiere saber qué significa "completada" en el dominio.

Y un cuidado sobre las señales de negocio: son **más lentas** que las técnicas. Si tu tasa de completitud necesita 20 minutos de tráfico para ser estadísticamente distinguible del ruido, tu canary no puede durar 5 minutos. La duración del canary la determina la señal más lenta que necesitás observar, no la impaciencia del equipo.

## Dónde ponés la prueba: antes, durante y después

Progressive delivery no mueve las pruebas al final. Las **estratifica**.

| Momento | Qué se prueba | Dónde corre |
|---|---|---|
| **Antes** (pre-merge) | Unitarias, componente, contrato. Combinaciones de flags críticos | CI |
| **Antes** (pre-deploy) | Integración, verificación del artefacto | CI |
| **Durante** (post-deploy, pre-release) | **Smoke sobre el código desplegado y apagado**: health, readiness, dependencias | Entorno real |
| **Durante** (canary) | Guardrails automáticos + chequeos sintéticos | Producción |
| **Después** (release completa) | Chequeos sintéticos continuos; observación de la señal de negocio | Producción |

La fila que la gente omite es la tercera. **Se puede probar mucho de un código desplegado antes de exponerlo:** que arranca, que sus probes responden, que puede conectarse a la base y al broker, que su configuración se cargó. Eso es gratis y detecta una clase entera de fallos —"funciona en mi máquina, no arranca en el cluster"— antes de que nadie los vea.

## Lo que la entrega progresiva no arregla

Hay que decirlo, porque el prompt lo pide y porque es cierto:

- **No arregla la falta de tests.** Un canary sin suite detecta que algo se rompió, pero no antes de romperlo, y no te dice qué. Reducir el blast radius de un bug no es lo mismo que no tenerlo.
- **No arregla la falta de observabilidad.** Si no podés distinguir el canary del baseline en tus métricas, no tenés canary: tenés un despliegue parcial. Instrumentá la **versión** como dimensión antes de intentar un rollout.
- **No arregla operaciones irreversibles.**
- **No arregla una hipótesis que nadie escribió.** "Vamos a hacer canary" sin declarar qué esperás que pase y qué te haría frenar es un despliegue lento.

## El artefacto que cierra el círculo

Antes de un rollout progresivo, escribí esto. Cabe en media página y es la diferencia entre un experimento y una esperanza.

> **Hipótesis de release — Nueva validación de beneficiarios (`flag: beneficiary-validation-v2`)**
>
> - **Qué creemos.** La validación v2 rechaza correctamente beneficiarios inválidos sin rechazar válidos.
> - **Qué mediríamos si fuera falso.** Caída en la tasa de transferencias completadas ÷ iniciadas, en la cohorte expuesta, comparada con el baseline.
> - **Blast radius.** Alcance: cohorte sintética. Severidad: transferencias válidas rechazadas (recuperable, el usuario reintenta). Reversibilidad: apagar el flag, segundos.
> - **Guardrails.**
>   - Técnico: error rate del canary > baseline + `<umbral>` durante `<ventana>` → abortar.
>   - Negocio: tasa de completitud del canary < baseline − `<umbral>` durante `<ventana>` → abortar.
>   - *Los umbrales son hipótesis a calibrar contra el ruido histórico del baseline. No son constantes.*
> - **Duración mínima.** Determinada por la señal de negocio (la más lenta), no por la técnica.
> - **Owner.** Quién decide promover, quién puede abortar, y quién debe estar disponible.
> - **Kill switch.** `beneficiary-validation-v2` → `off`. Ensayado el `<fecha>`.
> - **Fecha de retiro del flag.** `<fecha>`. Sin esto, el flag es permanente.

Las dos últimas líneas son las que separan un rollout profesional de un rollout entusiasta.

## Anti-patrones

- **Confundir deployment con release.** *Consecuencia:* el rollback requiere un pipeline completo, justo cuando menos tiempo tenés. *Alternativa:* separarlos con un flag.
- **Promover por CPU y latencia únicamente.** *Consecuencia:* el servicio responde rápido y hace lo incorrecto. *Alternativa:* al menos una señal de negocio bien definida.
- **Umbrales copiados de un blog.** *Consecuencia:* abortás rollouts sanos o promovés rotos. *Alternativa:* calibrar contra el ruido histórico del propio baseline y declarar el umbral como hipótesis.
- **Canary sobre una operación irreversible.** *Consecuencia:* el 1 % de daño es daño. *Alternativa:* idempotencia, dry-run, compensación.
- **Canary que comparte la dependencia crítica.** *Consecuencia:* el 5 % de tráfico puede tumbar el 100 %. *Alternativa:* medir el riesgo, no el porcentaje de tráfico.
- **Rollback manual no ensayado.** *Consecuencia:* la primera vez que lo ejecutás es durante un incidente. *Alternativa:* ensayarlo en calendario, como un simulacro.
- **Usuarios reales en un experimento de portfolio.** *Consecuencia:* además de ser una mala práctica, es una afirmación de experiencia productiva que no tenés. *Alternativa:* cohortes sintéticas, y decirlo en el README.
- **Rollout sin hipótesis escrita.** *Consecuencia:* un despliegue lento disfrazado de método. *Alternativa:* la plantilla de arriba.
- **Entrega progresiva como sustituto de pruebas.** *Consecuencia:* detectás en producción lo que costaba centavos detectar en CI. *Alternativa:* estratificar, no reemplazar.

## Qué publicar en GitHub

```text
docs/release/hipotesis-de-release.md       # la plantilla, aplicada a un caso concreto
docs/release/feature-flag-policy.md        # ver artículo 2
docs/release/canary-analysis.md            # ver artículo 3
docs/adr/ADR-001-progressive-delivery.md   # qué desplega, qué reconcilia, quién es dueño del estado
docs/runbooks/disable-feature.md           # el kill switch, con la fecha del último ensayo
gitops/
feature-flags/
tests/post-deploy/                         # smoke sobre código desplegado y apagado
```

El README de `nexo-progressive-delivery` tiene una obligación no negociable: **declarar que las cohortes son sintéticas y que ningún usuario real participó.** Un portfolio que insinúa lo contrario es un portfolio que un entrevistador va a sondear, y con razón.

## Qué aprendimos / próximos pasos

- Separar deployment de release convierte el rollback en la operación más barata en vez de la más cara.
- El blast radius se mide en alcance, severidad y **reversibilidad**. La entrega progresiva protege lo reversible.
- Un guardrail necesita señal, baseline, umbral, ventana y **acción automática**. Sin la acción, es una métrica.
- La duración del canary la fija la señal más lenta.
- Progressive delivery no reemplaza pruebas, observabilidad, ni idempotencia. Las presupone.

**Siguiente:** [El ciclo de vida de un feature flag](/blog/ciclo-de-vida-de-un-feature-flag-y-explosion-combinatoria/), donde el flag que te salvó el rollback se convierte, si lo dejás, en la deuda que no podés probar.

## Checklist final

- [ ] Existe una decisión explícita y documentada de separar deployment de release.
- [ ] Cada rollout tiene una **hipótesis escrita** antes de empezar.
- [ ] El blast radius está dimensionado en alcance, severidad y reversibilidad.
- [ ] Ninguna operación irreversible se expone mediante canary sin un control adicional.
- [ ] Los guardrails comparan canary contra baseline **en la misma ventana**, no contra un absoluto.
- [ ] Al menos un guardrail usa una señal de **negocio**.
- [ ] Cada umbral está declarado como hipótesis, con la fuente de su calibración.
- [ ] La versión es una dimensión de las métricas, para poder distinguir canary de baseline.
- [ ] El kill switch fue **ensayado**, y la fecha del ensayo está registrada.
- [ ] El README declara que las cohortes son sintéticas.

---

## Fuentes (consultadas 2026-07-10)

- [Google SRE — Service Level Objectives](https://sre.google/sre-book/service-level-objectives/) — vocabulario de señales, ventanas y error budget.
- [Kubernetes — Deployments](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/) — rolling update y probes.
- [Argo Rollouts — Canary](https://argo-rollouts.readthedocs.io/en/stable/features/canary/) — análisis automatizado y aborto.
- [OpenFeature](https://openfeature.dev/) — ver artículo 2 para el estado real de la especificación.
- [Verificación de fuentes de la serie](/blog/verificacion-de-fuentes-serie-avanzada/)
