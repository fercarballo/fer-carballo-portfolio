---
title: "Canary, guardrails, GitOps y rollback ensayado"
description: "Análisis de canary con baseline, guardrails automáticos, GitOps y drift, frontera CI/CD, kill switch y un runbook de rollback ensayado para Nexo Finanzas."
pubDate: 2026-07-10
tags: ['canary', 'gitops', 'argocd', 'argo-rollouts', 'rollback', 'runbook', 'sre']
cluster: 'a03'
clusterTitle: "Progressive delivery, feature flags y GitOps"
type: satelite
order: 3
readingLevel: "Avanzado"
prerequisites: "Requiere Kubernetes, métricas y CI/CD."
icon: 'git'
iconHue: 205
---

> **Aviso.** Nexo Finanzas es **ficticio**. **Todos los porcentajes, umbrales, latencias y tasas de error son ILUSTRATIVOS**, no mediciones. No se ejecutó ningún cluster, rollout ni pipeline. **Las cohortes son sintéticas: ningún usuario real participó.**

> **Promesa del artículo.** Al terminar vas a poder escribir un análisis de canary que compare contra un baseline en vez de contra un número inventado, vas a entender por qué tener dos sistemas que escriben en el cluster es peor que tener uno malo, y vas a tener un runbook de rollback que alguien puede ejecutar bajo presión.

> Cierra el capítulo. Asume el [pilar](/blog/deployment-no-es-release/) y el [ciclo de vida de flags](/blog/ciclo-de-vida-de-un-feature-flag-y-explosion-combinatoria/).

## Canary, blue/green y rolling update: tres cosas distintas

Se confunden todo el tiempo y protegen contra riesgos distintos.

| Estrategia | Cómo funciona | Protege contra | No protege contra | Coste |
|---|---|---|---|---|
| **Rolling update** | Reemplaza pods de a poco | Que todos los pods caigan a la vez | Un bug lógico (llega al 100 % igual) | Bajo |
| **Blue/green** | Dos entornos completos; se conmuta el tráfico | Un deploy roto (conmutás de vuelta) | Un bug que solo aparece con tráfico real y volumen | Alto: doble infraestructura |
| **Canary** | Una fracción del tráfico va a la versión nueva | Un bug lógico, con exposición limitada | Bugs que necesitan tiempo o volumen para manifestarse | Medio: requiere observabilidad por versión |

**El rolling update no es entrega progresiva.** Es una estrategia de disponibilidad durante el reemplazo. Al final, el 100 % del tráfico está en la versión nueva, y nadie miró nada. Si tu "canary" es un `maxSurge`/`maxUnavailable`, no tenés canary.

Y una advertencia que arruina muchos canaries de laboratorio: **si tus métricas no tienen la versión como dimensión, no podés hacer análisis de canary.** Podés tener tráfico dividido, pero no podés comparar. Instrumentar `version` como atributo de tus métricas es el prerrequisito, no el rollout.

## El análisis de canary: comparar, no medir

El error de diseño más común: *"abortamos si el error rate del canary supera 1 %"*.

¿Por qué 1 %? Si el baseline normalmente está en 0,8 %, un canary en 0,95 % es una degradación seria y no dispara. Si el baseline está en 0,05 %, un canary en 0,9 % es un desastre y tampoco dispara. **El umbral absoluto no sabe nada de tu sistema.**

Lo correcto es **comparar el canary contra el baseline, en la misma ventana temporal**, y disparar sobre la diferencia. Esto controla automáticamente por el ruido del entorno: si un tercero está lento, ambos se degradan y la diferencia se mantiene.

```yaml
# AnalysisTemplate ILUSTRATIVO. Los valores NO son mediciones ni recomendaciones.
# Deben calibrarse contra el ruido historico del propio baseline.
apiVersion: argoproj.io/v1alpha1
kind: AnalysisTemplate
metadata:
  name: nexo-transfer-canary
spec:
  args:
    - name: canary-version
    - name: stable-version

  metrics:
    # --- Guardrail tecnico -------------------------------------------------
    - name: error-rate-vs-baseline
      # La ventana: cuanto tiempo debe sostenerse la senal.
      interval: 1m
      # Cuantas evaluaciones fallidas consecutivas abortan.
      failureLimit: 2
      # Cuantas evaluaciones exitosas se requieren antes de promover.
      count: 5
      provider:
        prometheus:
          address: http://prometheus.monitoring.svc
          # Diferencia canary - baseline. NO un absoluto.
          query: |
            (
              sum(rate(http_requests_total{version="{{args.canary-version}}",status=~"5.."}[2m]))
              /
              sum(rate(http_requests_total{version="{{args.canary-version}}"}[2m]))
            )
            -
            (
              sum(rate(http_requests_total{version="{{args.stable-version}}",status=~"5.."}[2m]))
              /
              sum(rate(http_requests_total{version="{{args.stable-version}}"}[2m]))
            )
      # UMBRAL ILUSTRATIVO. Calibrar contra la desviacion historica del baseline.
      successCondition: result[0] < 0.005

    # --- Guardrail de negocio ---------------------------------------------
    # El que habria detectado el incidente del pilar.
    - name: completion-rate-vs-baseline
      interval: 5m          # mas lento: la senal de negocio necesita volumen
      failureLimit: 1
      count: 4              # duracion minima determinada por ESTA metrica
      provider:
        prometheus:
          address: http://prometheus.monitoring.svc
          query: |
            (
              sum(rate(nexo_transfers_completed_total{version="{{args.canary-version}}"}[5m]))
              /
              sum(rate(nexo_transfers_initiated_total{version="{{args.canary-version}}"}[5m]))
            )
            -
            (
              sum(rate(nexo_transfers_completed_total{version="{{args.stable-version}}"}[5m]))
              /
              sum(rate(nexo_transfers_initiated_total{version="{{args.stable-version}}"}[5m]))
            )
      # Una CAIDA de completitud respecto al baseline aborta.
      successCondition: result[0] > -0.01
```

Cinco cosas que este manifiesto hace bien y que conviene señalar:

1. **Las dos métricas son diferencias, no absolutos.**
2. **`failureLimit: 2` en la técnica** evita abortar por un pico transitorio. **`failureLimit: 1` en la de negocio**, porque una caída sostenida de completitud durante 5 minutos ya es suficiente evidencia.
3. **`interval` distinto por métrica.** La señal de negocio necesita más volumen para separarse del ruido.
4. **`count: 4` × `interval: 5m` = 20 minutos mínimos de canary.** La duración la fija la señal más lenta, tal como dijimos en el pilar. Si el equipo quiere promover en 5 minutos, no puede usar la señal de negocio, y hay que decirlo en voz alta.
5. **Los umbrales están comentados como ilustrativos.** En un repositorio de portfolio, esa línea de comentario vale más que el número.

### El paso previo que casi nadie hace: medir el ruido

Antes de elegir `0.005` como umbral, corré el análisis **con el canary apuntando a la misma versión que el baseline**. Es decir: comparar estable contra estable.

El resultado debería ser cero. No lo va a ser. Va a oscilar, porque el tráfico no se reparte de forma perfectamente homogénea y las muestras son finitas. **Esa oscilación es tu piso de ruido**, y tu umbral tiene que estar cómodamente por encima.

Un canary que aborta cuando ambas versiones son idénticas es un generador de falsos positivos, y el equipo va a aprender a promover manualmente ignorándolo. Es la forma más rápida de destruir la confianza en el sistema de guardrails.

Este experimento —comparar estable contra estable— es de las cosas más valiosas que podés mostrar en un portfolio, porque demuestra que entendés que **un umbral es una hipótesis calibrada, no un número**.

## GitOps: un solo dueño del estado

<figure class="diagram">
  <img src="/blog/diagrams/canary-guardrails-gitops-y-rollback-ensayado-1.svg" width="283" height="686" alt="Diagrama: canary-guardrails-gitops-y-rollback-ensayado (1)" loading="lazy" decoding="async" />
</figure>

GitOps es un bucle de reconciliación: el estado deseado vive en Git, un controlador lo compara continuamente contra el estado real del cluster, y corrige la diferencia.

De ahí sale la propiedad que lo hace valioso para calidad: **el drift es visible.** Si alguien hace `kubectl edit` en producción, el controlador lo detecta y —según cómo lo configures— lo revierte o lo reporta. El cluster deja de tener un estado que nadie puede explicar.

### La frontera CI/CD: el error de arquitectura más caro

Acá está el error que veo repetido, y que merece un ADR propio:

> **El pipeline hace `kubectl apply` Y el controlador de GitOps reconcilia el mismo recurso.**

Ahora dos sistemas escriben el mismo estado. Consecuencias, todas reales:

- El pipeline aplica la imagen `v2`. El controlador ve que Git dice `v1` y **revierte a `v1`**. El deploy "no funcionó" y nadie entiende por qué.
- O el controlador está en modo no-auto-sync, y ahora Git **miente**: dice `v1` y en producción corre `v2`. Tu fuente de verdad no lo es.
- Y en un incidente, nadie sabe cuál de los dos ganó.

**La frontera correcta:**

| Responsabilidad | Dueño |
|---|---|
| Construir, probar, escanear, firmar el artefacto | **CI** (GitLab CI / Jenkins) |
| Escribir el nuevo digest de imagen en el repositorio de manifiestos | **CI** (un commit, con PR si querés revisión) |
| Aplicar el estado deseado al cluster | **GitOps controller** (Argo CD) |
| Detectar y corregir drift | **GitOps controller** |
| Analizar el canary y decidir promover o abortar | **Controlador de rollouts** (Argo Rollouts) |

**El CI nunca toca el cluster.** Escribe en Git. Eso es todo. El artefacto que produce el pipeline es un **commit**, y el deploy es una consecuencia del commit.

Beneficio secundario, y grande: el rollback se convierte en `git revert`. Auditable, revisable, y con el mismo mecanismo que cualquier otro cambio.

### ADR-001: quién despliega y quién reconcilia

> **Contexto.** Necesitamos desplegar `nexo-transfer-api` en un cluster local, con canary y rollback ensayable, sin que dos sistemas escriban el mismo estado.
>
> **Opciones.**
> 1. **Solo CI (`kubectl apply` desde el pipeline).** Simple; sin componentes nuevos. Pero el drift es invisible, el rollback es "correr un pipeline viejo", y no hay una fuente de verdad del estado.
> 2. **CI + GitOps, ambos escribiendo el cluster.** Descartada. Dos dueños del mismo estado.
> 3. **CI escribe en Git; GitOps reconcilia.** El pipeline construye, verifica y **commitea el digest**. Argo CD reconcilia. Argo Rollouts analiza el canary.
>
> **Decisión.** Opción 3.
>
> **Consecuencias.**
> - *Positiva:* una sola fuente de verdad. Drift detectable. `git revert` como rollback auditable.
> - *Positiva:* el pipeline no necesita credenciales de escritura al cluster. Reduce el blast radius de un runner comprometido (ver [T5 del threat model](/blog/una-suite-verde-no-prueba-que-el-artefacto-sea-integro/)).
> - *Negativa:* dos componentes más (Argo CD, Argo Rollouts) en el entorno de demo. **Costo real de complejidad.** El nivel "cluster demo" es opcional en la estrategia de entornos; el desarrollo local no lo requiere.
> - *Negativa:* la latencia entre commit y deploy depende del intervalo de reconciliación.
>
> **Lo que este demo NO demuestra.** No demuestra operar GitOps a escala, ni multi-cluster, ni gestión de secretos en Git. Un cluster local con datos sintéticos no prueba nada de eso.
>
> **Fecha de revisión.** 6 meses.

Esa penúltima sección —"lo que este demo no demuestra"— es la que debería estar en todos los ADR de un portfolio, y casi nunca está.

## Rollback ensayado

"Tenemos rollback" es una afirmación sobre un documento. "El rollback está ensayado" es una afirmación sobre una **ejecución**, con fecha.

Tres niveles de rollback, del más rápido al más lento. Elegís según lo que rompió:

| Nivel | Mecanismo | Tiempo | Cuándo |
|---|---|---|---|
| 1. **Kill switch** | Apagar el flag | Segundos | El código nuevo está desplegado pero hace algo mal |
| 2. **Abortar el rollout** | El controlador restaura el estable | Segundos a minutos | El canary está degradando señales |
| 3. **Revertir el estado deseado** | `git revert` del commit de manifiestos | Minutos | La versión desplegada es mala en sí misma |

**El nivel 1 es el que querés usar el 90 % de las veces**, y es la razón por la que separamos deployment de release. Si el único rollback que tenés es el nivel 3, cada incidente cuesta un pipeline.

### Runbook: kill switch de una funcionalidad

> Guardar como `docs/runbooks/disable-feature.md`. **Este runbook no fue ejecutado en un entorno productivo real. Se ensaya en el sandbox local, y la fecha del último ensayo se registra abajo.**

**Cuándo se usa.** Una funcionalidad detrás de un flag está causando daño, o un guardrail disparó y hay que detener la exposición.

**Quién puede ejecutarlo.** Cualquier persona de la rotación de on-call. **No requiere aprobación previa.** Un kill switch que necesita autorización no es un kill switch. La revisión ocurre después.

**Precondiciones:**
- [ ] El flag existe en `feature-flags/registry.yaml` y es de tipo `release` u `operational`.
- [ ] El `degraded_behavior` está documentado: sabés qué va a pasar cuando lo apagues.

**Procedimiento:**

1. **Apagar el flag.** El cambio de configuración de flags **no pasa por el pipeline**; ese es el punto.
   ```text
   # Propuesta. El comando depende del proveedor de flags.
   nexo-flags set beneficiary-validation-v2 --value=false --reason="NEXO-1099"
   ```
2. **Confirmar la propagación.** Verificá en una métrica —no en la UI del proveedor— que las evaluaciones del flag devuelven `false`. La UI muestra la intención; la métrica muestra el efecto.
3. **Verificar el efecto de negocio.** La tasa de completitud debe recuperarse hacia el baseline dentro de la ventana esperada. **Si no se recupera, el flag no era la causa.** Escalá a nivel 2 o 3.
4. **Registrar.** Quién, cuándo, por qué, ticket.

**Condiciones de escalada:**
- La métrica del paso 2 no cambia → el proveedor de flags no está propagando. Escalá a nivel 3.
- El efecto de negocio del paso 3 no mejora → el flag no era la causa. **No sigas apagando flags al azar**: eso agrega variables a un sistema que ya no entendés.

**Qué NO hacer:**
- No borres el flag del registro durante el incidente. Apagarlo y borrarlo son cosas distintas; borrarlo hace que el default del código decida, y el default puede ser `true`.
- No cambies el default en el código como "rollback rápido". Eso es un deploy.

**Registro de ensayos.**

| Fecha | Entorno | Quién | Duración | Hallazgo |
|---|---|---|---|---|
| `<YYYY-MM-DD>` | sandbox local | `<nombre>` | `<n>` min | *(completar tras el primer ensayo real)* |

Esa tabla vacía, con honestidad, vale más que una tabla llena de datos inventados. Y el día que la completes, el runbook pasa de hipótesis a capacidad.

## Chequeos sintéticos post-deploy

Un chequeo sintético ejecuta el journey crítico contra el entorno real, periódicamente, con datos sintéticos.

Su valor es cubrir **caminos de bajo tráfico**: si una funcionalidad se usa diez veces por día, el error rate no la detecta, porque diez requests no mueven una tasa.

Reglas para que no se conviertan en un problema:

- **Datos sintéticos con un marcador identificable** (`synthetic: true`), y **excluidos de las métricas de negocio**. Si tu chequeo sintético crea transferencias y esas transferencias cuentan en la tasa de completitud, tu guardrail está midiendo tu propio chequeo.
- **Idempotentes y limpiables.** Un chequeo que deja basura acumulándose se convierte en un incidente lento.
- **Un fallo del chequeo sintético no es automáticamente un incidente.** El chequeo también se rompe. Alertá con `failureLimit`, no con la primera falla.

## Anti-patrones

- **Rolling update presentado como canary.** *Consecuencia:* el 100 % del tráfico llega a la versión nueva sin que nadie mire nada. *Alternativa:* tráfico dividido + análisis.
- **Umbrales absolutos.** *Consecuencia:* falsos positivos o falsos negativos según dónde esté el baseline. *Alternativa:* diferencia canary − baseline en la misma ventana.
- **No medir el piso de ruido.** *Consecuencia:* el canary aborta con dos versiones idénticas; el equipo pierde la confianza y promueve a mano. *Alternativa:* correr estable contra estable y calibrar.
- **Métricas sin la versión como dimensión.** *Consecuencia:* no podés comparar; no hay análisis posible. *Alternativa:* instrumentar `version` **antes** del rollout.
- **Dos sistemas escribiendo el mismo estado del cluster.** *Consecuencia:* reverts fantasma o una fuente de verdad que miente. *Alternativa:* CI escribe en Git; GitOps aplica.
- **Modificar el cluster fuera de Git y ocultar el drift.** *Alternativa:* auto-sync o, como mínimo, alerta de drift.
- **Rollback manual no ensayado.** *Consecuencia:* la primera ejecución es durante el incidente. *Alternativa:* ensayo con fecha registrada.
- **Kill switch que requiere aprobación.** *Consecuencia:* no es un kill switch. *Alternativa:* ejecutable por on-call, revisado después.
- **Chequeos sintéticos que contaminan las métricas de negocio.** *Consecuencia:* tu guardrail se mide a sí mismo. *Alternativa:* marcador y exclusión.
- **Canary con el 100 % del riesgo en una dependencia compartida.** *Alternativa:* dimensionar el blast radius real, no el porcentaje de tráfico.

## Qué publicar en GitHub

```text
gitops/                                       # los manifiestos: única fuente de verdad
gitops/rollouts/nexo-transfer-api.yaml        # el Rollout con su AnalysisTemplate
docs/release/canary-analysis.md               # las señales, con "umbrales ilustrativos"
docs/release/calibracion-del-umbral.md        # el experimento estable-vs-estable
docs/adr/ADR-001-progressive-delivery.md      # la frontera CI/CD y "lo que NO demuestra"
docs/runbooks/disable-feature.md              # con la tabla de ensayos
docs/runbooks/abortar-rollout.md
tests/post-deploy/                            # smoke + sintéticos, con marcador
```

## Qué aprendimos / próximos pasos

- Un canary compara; no mide contra un número inventado.
- El umbral se calibra corriendo el análisis con dos versiones idénticas. Ese es tu piso de ruido.
- La duración mínima del canary la fija la señal más lenta que necesitás observar.
- CI escribe en Git; GitOps escribe en el cluster. Dos dueños del mismo estado es peor que un dueño malo.
- El rollback tiene tres niveles y el más barato es el flag. Por eso separaste deployment de release.
- Un runbook sin fecha de ensayo es una hipótesis.

**Cierre del capítulo.** El siguiente es [privacidad y gobierno de datos](/blog/coleccion/a04/). No es casual que vaya después: el `targetingKey` de tus flags, las cohortes de tu canary y los datos de tus chequeos sintéticos son todos decisiones de datos que acabás de tomar sin haberlas clasificado.

## Checklist final

- [ ] Las métricas tienen `version` como dimensión.
- [ ] El análisis de canary compara contra el baseline, no contra un absoluto.
- [ ] El umbral fue calibrado con un experimento estable-contra-estable, y el experimento está documentado.
- [ ] Cada umbral en el repositorio lleva un comentario que dice que es ilustrativo/calibrable.
- [ ] Al menos un guardrail es de negocio, y la duración del canary respeta su ventana.
- [ ] El pipeline **no** tiene credenciales de escritura al cluster.
- [ ] Solo un sistema escribe el estado del cluster.
- [ ] El drift se detecta y se reporta.
- [ ] Existen los tres niveles de rollback y está claro cuál usar en cada caso.
- [ ] El kill switch es ejecutable por on-call sin aprobación previa.
- [ ] Los runbooks tienen tabla de ensayos con fecha.
- [ ] Los chequeos sintéticos están marcados y excluidos de las métricas de negocio.
- [ ] El ADR declara **qué no demuestra** el demo.

---

## Fuentes (consultadas 2026-07-10)

- [Argo Rollouts — Canary](https://argo-rollouts.readthedocs.io/en/stable/features/canary/) — pasos de rollout, `AnalysisTemplate`, aborto automático ante métricas fallidas.
- [Argo CD Documentation](https://argo-cd.readthedocs.io/en/stable/) — reconciliación, salud de recursos `Rollout`, drift.
- [Kubernetes — Deployments](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/) — rolling update, `maxSurge`/`maxUnavailable`, probes.
- [Google SRE — Service Level Objectives](https://sre.google/sre-book/service-level-objectives/) — ventanas y señales.
- [Verificación de fuentes de la serie](/blog/verificacion-de-fuentes-serie-avanzada/)
