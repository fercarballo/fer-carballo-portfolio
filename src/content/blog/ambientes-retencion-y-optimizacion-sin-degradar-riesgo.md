---
title: "Ambientes, retención y optimización sin degradar riesgo"
description: "Ambientes efímeros vs permanentes con supuestos explícitos, política de expiración de artefactos por criticidad, test impact analysis como hipótesis con red de seguridad, y presupuesto para pruebas de carga."
pubDate: 2026-07-10
tags: ['finops', 'ambientes-efimeros', 'retencion', 'test-impact-analysis', 'jmeter', 'ci-cd']
cluster: 'a06'
clusterTitle: "FinOps y economía de la calidad"
type: satelite
order: 2
readingLevel: "Avanzado"
prerequisites: "Requiere CI/CD, contenedores y estrategia de pruebas."
icon: 'chart'
iconHue: 88
---

> **Aviso.** Nexo Finanzas es **ficticio**. **Este artículo no contiene un solo precio.** Las comparaciones son paramétricas. Ninguna cifra es una medición.

> **Promesa del artículo.** Al terminar vas a poder comparar un ambiente permanente contra uno efímero con supuestos explícitos en vez de con intuiciones, diseñar una política de retención que se defienda sola, y adoptar test impact analysis sin perder la red de seguridad.

> Asume el modelo paramétrico y la cartera de controles del [pilar](/blog/cuanto-riesgo-controla-cada-minuto-de-pipeline/).

## El ambiente que nadie apaga

Existe, en casi toda organización, un ambiente de test que lleva años levantado. Nadie sabe exactamente qué corre ahí. Nadie recuerda cómo se creó. Alguien lo usó en marzo.

Y no se apaga, con un argumento que suena razonable: *"¿y si lo necesitamos y no podemos recrearlo?"*

Esa frase es un diagnóstico, no una justificación.

> **Mantener un ambiente porque no sabés recrearlo es pagar una suscripción mensual a tu propia deuda de reproducibilidad.**

El costo del ambiente es el síntoma. La enfermedad es que la infraestructura no está en código, o está y nadie la probó. El ahorro real no viene de apagar el ambiente: viene de **poder** apagarlo.

Y hay un beneficio secundario, mayor que el dinero: un ambiente que se recrea desde cero en cada uso es un ambiente sin **deriva de configuración**. Los ambientes de larga vida acumulan cambios manuales, y esos cambios son la razón por la que "funciona en staging y falla en producción".

## Efímero versus permanente, con los supuestos a la vista

La comparación honesta requiere escribir los supuestos, porque el resultado **depende enteramente de ellos**.

```text
# Ambiente PERMANENTE
C_perm = c_env_hour * 24 * 30                       # vivo todo el mes
       + c_mantenimiento_mensual                    # parches, deriva, deuda

# Ambiente EFIMERO (uno por pull request)
C_efim = c_env_hour * t_vida_promedio * n_prs_mes   # vivo solo mientras se usa
       + (t_provisioning * c_runner * n_prs_mes)    # el costo de crearlo
       + c_desarrollo_amortizado                    # hacerlo reproducible cuesta
```

Las variables que deciden el resultado, y que casi nadie escribe:

| Supuesto | Si es alto, favorece a... | Por qué |
|---|---|---|
| `n_prs_mes` (volumen de PRs) | **Permanente** | Muchos ambientes efímeros × creación = caro |
| `t_vida_promedio` | Permanente | Si el efímero vive 20 h, no es efímero |
| `t_provisioning` | Permanente | Un ambiente que tarda 25 min en levantar bloquea el feedback |
| `c_mantenimiento_mensual` | **Efímero** | Es el costo invisible del permanente |
| Necesidad de **aislamiento** entre PRs | **Efímero** | Un ambiente compartido serializa el trabajo |

**El resultado no es universal, y ese es el punto.** Un equipo con 3 PRs al día y provisioning de 2 minutos gana claramente con efímeros. Un equipo con 200 PRs al día y provisioning de 20 minutos, no —hasta que optimice el provisioning, que probablemente sea la inversión correcta.

**El factor decisivo casi nunca es el dinero.** Es el aislamiento. Dos PRs que comparten un ambiente comparten estado, y el estado compartido produce fallos que no son de nadie. El costo de eso vuelve a ser humano, y vuelve a no estar en la factura.

### El punto medio que suele ganar

Un híbrido, casi siempre subestimado:

- **Efímero para lo que se puede levantar rápido:** la aplicación, su base de datos, un broker. Docker Compose, segundos.
- **Compartido para lo que es caro:** un cluster de Kubernetes de demo, un grid de dispositivos.
- **Y el aislamiento se consigue con namespacing**, no con infraestructura separada: cada PR tiene su namespace, su schema de base de datos, su prefijo de topics.

Es más barato que el efímero completo y más aislado que el compartido. Requiere disciplina en el naming, y requiere que el [reset de datos](/blog/datos-sinteticos-versus-subset-enmascarado/) funcione. Otra vez: la reproducibilidad es la palanca.

### La regla del TTL

Todo ambiente efímero nace con `ttl`. Sin excepción.

```yaml
# El TTL no es una sugerencia: es un cronjob que apaga.
environment:
  name: pr-1042
  ttl: 4h
  extend_max: 8h        # se puede extender UNA vez, con motivo
  owner: "@ficticio-alice"
```

<figure class="diagram">
  <img src="/blog/diagrams/ambientes-retencion-y-optimizacion-sin-degradar-riesgo-1.svg" width="550" height="672" alt="Diagrama: ambientes-retencion-y-optimizacion-sin-degradar-riesgo (1)" loading="lazy" decoding="async" />
</figure>

La transición `PorExpirar --> Extendido` parece una debilidad de la política y es lo que la mantiene viva. Sin ella, la primera persona a la que se le muere el ambiente mientras depura algo importante crea un ambiente permanente para no volver a arriesgarse, y la política queda derrotada por una sola mala experiencia.

Dos detalles que hacen que la política sobreviva al contacto con el equipo:

- **`extend_max` existe.** Una política sin válvula de escape se rompe: alguien va a estar depurando algo importante cuando el ambiente muera, y la próxima vez va a crear un ambiente permanente para no arriesgarse. Permitir una extensión, con motivo, mantiene la política viva.
- **El apagado avisa antes.** Un mensaje a los 30 minutos previos convierte una interrupción en una decisión.

## Retención de artefactos: por criticidad, no por defecto

El valor de un artefacto de CI **decae con el tiempo**, y decae a velocidades muy distintas según qué sea.

| Artefacto | Vida útil real | Retención propuesta | Justificación |
|---|---|---|---|
| Screenshot de un test fallido | Hasta que se arregla | **7 días** | Nadie mira un screenshot de hace un mes |
| Video de un test | Casi nula | **Desactivado por defecto** | Enorme, rara vez se abre |
| Log de un job exitoso | Casi nula | 7 días | Nadie lee logs de un job verde |
| Log de un job fallido | Hasta el fix | 30 días | Se consulta durante el triage |
| Reporte de tests (JUnit XML) | Alimenta métricas | 90 días | Tendencias de flakiness |
| **SBOM** | **Vida del artefacto desplegado** | **Años** | *"¿Qué desplegado contiene el componente X?"* |
| **Provenance / firma** | Vida del artefacto | **Años** | Cadena de custodia |
| Imagen de contenedor de un release | Vida del release | Años, con purga de no-releases | Rollback |

Dos observaciones que cambian la política:

**El SBOM y la provenance rompen la regla.** Todo lo demás caduca rápido; estos dos **tienen que sobrevivir al artefacto**. Cuando aparezca una vulnerabilidad nueva contra un componente, la pregunta será "¿qué está desplegado y lo contiene?", y esa pregunta se responde con SBOMs históricos (ver [capítulo 02](/blog/el-sbom-no-es-un-inventario-perfecto/)). Un SBOM con retención de 7 días no sirve para nada.

**Los videos son el caso más claro de costo sin valor.** Son órdenes de magnitud más grandes que un screenshot y se abren una fracción de las veces. Desactivalos por defecto; habilitalos por job, cuando alguien esté depurando algo específico.

Y la coincidencia que hace fácil aprobar esta política: la retención corta es simultáneamente un control de **costo** y de **privacidad** (ver [capítulo 04](/blog/telemetria-artefactos-de-ci-y-retencion-sin-pii/)). Un mismo control, dos justificaciones, dos presupuestos.

```yaml
# .gitlab-ci.yml — expire_in POR artefacto, nunca global.
test:integration:
  artifacts:
    when: always
    expire_in: 7 days
    paths: [target/screenshots/]
    reports:
      junit: target/surefire-reports/*.xml   # este vive 90 días por política de reportes

build:release:
  artifacts:
    expire_in: never          # SBOM y provenance: sobreviven al artefacto
    paths: [sbom-app.json, sbom-image.json, provenance.json]
```

## Test impact analysis: una hipótesis, no un ahorro

**Test impact analysis (TIA)** selecciona qué tests correr según qué código cambió. La promesa es seductora: si tocaste una clase, ¿para qué correr los 1.400 tests?

Es una técnica legítima. Y es **una hipótesis sobre tu grafo de dependencias**, no una certeza. Falla —silenciosamente— cuando:

- El acoplamiento es **dinámico**: reflexión, inyección de dependencias, carga por SPI. El análisis estático no lo ve.
- El cambio es de **configuración**, no de código: un archivo YAML, una variable de entorno, una migración SQL.
- El cambio es en una **dependencia transitiva**.
- El test depende de **datos** que cambiaron, no de código.

Cuando TIA se equivoca, no falla ruidosamente. **Simplemente no corre el test que habría encontrado el bug.** Y como el pipeline queda verde, nadie se entera hasta producción. Es el peor modo de fallo posible para una optimización.

### La adopción responsable

**No cambies "correr todo" por "correr lo impactado". Agregá una red de seguridad y una fase de validación.**

1. **Fase de sombra.** Durante N semanas, corré TIA **y** la suite completa. Registrá cada test que TIA habría omitido y que **falló**. Ese conjunto es tu tasa de falsos negativos, medida, no supuesta.
2. **Suite de seguridad, siempre.** Un subconjunto que **corre siempre**, sin importar qué dijo TIA. Contiene los tests de la cartera crítica: idempotencia, invariantes del ledger, verificación del artefacto, autorización. Su costo es el precio de usar TIA con tranquilidad.
3. **Red completa periódica.** La suite entera corre en `main` tras cada merge, o al menos cada noche. Si TIA dejó pasar algo, se detecta en horas, no en producción.
4. **Regla de escape.** Si el cambio toca configuración, migraciones, dependencias o el propio pipeline, **TIA se ignora** y corre todo.

Con esas cuatro condiciones, TIA es una optimización sensata. Sin ellas, es una reducción de cobertura disfrazada de eficiencia, y el día que falle, la conversación va a ser muy incómoda.

```text
# La decision, escrita:
si (cambio toca: config | migraciones | dependencias | .gitlab-ci.yml)
    -> correr TODO
sino
    -> correr (suite_de_seguridad UNION tests_impactados)

# Y siempre, en main y de noche:
    -> correr TODO
```

## Presupuesto para una prueba de carga

Una prueba de performance puede consumir más que el sistema que prueba, y puede hacerlo por accidente. Un test mal configurado que corre toda la noche contra un autoescalador es la anécdota que todos conocen.

Cuatro controles, en orden de importancia:

1. **Límite duro de duración.** El proceso se mata a los `N` minutos, sin importar el estado del test. Es un `timeout` del job, no una configuración del generador —el generador puede colgarse.
2. **Límite de recursos del generador.** El generador de carga necesita infraestructura comparable al sistema. Presupuestala explícitamente; no la descubras en la factura.
3. **Presupuesto de la infraestructura bajo prueba.** Si el sistema autoescala, una prueba de carga es una orden de compra. Poné un **límite máximo de réplicas** en el entorno de prueba y una alerta de gasto.
4. **Condición de aborto por gasto.** Además de las condiciones técnicas, una condición económica: si el gasto acumulado del experimento supera `X`, se aborta. `X` lo definís vos, antes de empezar.

```yaml
# Presupuesto de un experimento de carga. Valores ILUSTRATIVOS.
experiment:
  id: PERF-TRANSFER-BASELINE-001
  hypothesis: >
    El servicio sostiene el throughput objetivo con latencia p99 dentro
    del SLO, sin degradar el error rate.
  hard_timeout: 45m               # el job se mata, pase lo que pase
  generator:
    max_instances: 3
    instance_type: <parametrico>
  system_under_test:
    max_replicas: 6               # el autoescalador NO es ilimitado aqui
  abort_conditions:
    - technical: "error rate > baseline + <umbral> durante <ventana>"
    - technical: "el generador es el cuello de botella (CPU > 80%)"
    - economic:  "gasto acumulado del experimento > <presupuesto>"
  cleanup: obligatorio            # el ambiente se destruye al terminar
```

La segunda condición de aborto técnica —*"el generador es el cuello de botella"*— es la que salva la validez del experimento. Si el generador está saturado, tus mediciones de latencia miden el generador, no el sistema. Es un experimento caro que no mide nada, y ocurre más de lo que la gente admite.

## Guardrails: qué no se optimiza

Repitiendo la regla del pilar, porque acá es donde se aplica:

> **Antes de optimizar, escribí la lista de lo que no vas a tocar.**

Para Nexo Finanzas (ficticio):

| Control | Riesgo | ¿Se optimiza? |
|---|---|---|
| Test de idempotencia de transferencias | Doble débito | **Nunca.** Está en la suite de seguridad de TIA |
| Invariantes del ledger | Descuadre | **Nunca** |
| Verificación de firma del artefacto | Desplegar algo ajeno | **Nunca** |
| Test de privacidad (patrones prohibidos) | Fuga de datos | **Nunca** |
| Regresión visual | Estética | Sí: nocturna |
| Suite completa de mobile | Cobertura de dispositivos | Sí: subconjunto por commit |
| Performance baseline | Degradación gradual | Sí: semanal |

Cuatro filas de "nunca". Es una lista corta, y es corta a propósito: si todo es crítico, nada lo es. Un equipo que no puede nombrar qué **sí** puede optimizar no ha hecho el análisis de riesgo, ha hecho una defensa.

## Anti-patrones

- **Mantener un ambiente por miedo a no poder recrearlo.** *Consecuencia:* pagás una suscripción a tu deuda de reproducibilidad, y acumulás deriva de configuración. *Alternativa:* arreglar la reproducibilidad; el ahorro es una consecuencia.
- **Comparar efímero vs permanente sin escribir los supuestos.** *Consecuencia:* la conclusión es una preferencia. *Alternativa:* modelo paramétrico con las variables que deciden.
- **Ambiente efímero sin TTL.** *Consecuencia:* deja de ser efímero. *Alternativa:* TTL con `extend_max` y aviso previo.
- **Política de TTL sin válvula de escape.** *Consecuencia:* alguien crea un ambiente permanente para evitarla. *Alternativa:* una extensión, con motivo.
- **`expire_in` global.** *Consecuencia:* o guardás screenshots años, o borrás SBOMs en 7 días. *Alternativa:* retención por criticidad.
- **SBOM y provenance con retención corta.** *Consecuencia:* no podés responder "¿qué desplegado contiene X?". *Alternativa:* `expire_in: never`.
- **Videos de test activados por defecto.** *Alternativa:* desactivados; habilitados por job durante una depuración.
- **TIA reemplazando la suite completa.** *Consecuencia:* reducción de cobertura silenciosa; falla sin ruido. *Alternativa:* fase de sombra, suite de seguridad, red completa periódica y regla de escape.
- **Prueba de carga sin límite duro de duración ni de gasto.** *Consecuencia:* la anécdota de la factura. *Alternativa:* `hard_timeout`, `max_replicas` y condición de aborto económica.
- **Prueba de carga sin verificar que el generador no es el cuello de botella.** *Consecuencia:* medís el generador. Experimento caro, cero información. *Alternativa:* condición de aborto técnica.
- **Optimizar sin la lista de lo intocable.** *Consecuencia:* cada propuesta es una amenaza y cada defensa suena a resistencia. *Alternativa:* escribí la lista primero.

## Qué publicar en GitHub

```text
docs/adr/ADR-001-ephemeral-environments.md   # con los supuestos que deciden
docs/finops/retention-policy.md              # por criticidad; SBOM y provenance aparte
docs/finops/tia-adopcion.md                  # fase de sombra, suite de seguridad, regla de escape
docs/finops/cartera-de-controles.md          # la lista de "nunca se optimiza"
budgets/PERF-TRANSFER-BASELINE-001.yaml      # presupuesto y condiciones de aborto
.gitlab-ci.yml                               # expire_in por artefacto
```

## Qué aprendimos / próximos pasos

- Un ambiente que no podés apagar es un síntoma de reproducibilidad, no un problema de costo.
- La comparación efímero/permanente depende enteramente de supuestos que hay que escribir. El factor decisivo suele ser el **aislamiento**, no el dinero.
- El híbrido con namespacing suele ganar, y depende de que el reset de datos funcione.
- La retención es por criticidad. El SBOM y la provenance son la excepción: sobreviven al artefacto.
- TIA es una hipótesis sobre tu grafo de dependencias, y falla en silencio. Adoptala con sombra, suite de seguridad y red completa.
- Una prueba de carga necesita un presupuesto y una condición de aborto económica, además de las técnicas.
- La lista de lo intocable es lo que hace posible optimizar el resto.

**Cierre del capítulo.** El siguiente es [fraude y motores de reglas](/blog/coleccion/a07/), donde el costo de un falso positivo y el de un falso negativo son la misma clase de conversación que acabamos de tener.

## Checklist final

- [ ] Todo ambiente efímero tiene `ttl`, `extend_max` y `owner`.
- [ ] El apagado avisa antes de ejecutarse.
- [ ] La comparación efímero/permanente está escrita con supuestos explícitos.
- [ ] La infraestructura de test se recrea desde código, y eso se prueba.
- [ ] `expire_in` está definido **por artefacto**, no globalmente.
- [ ] SBOM y provenance tienen retención larga.
- [ ] Los videos de test están desactivados por defecto.
- [ ] Si se usa TIA: hubo fase de sombra con falsos negativos medidos.
- [ ] Existe una suite de seguridad que corre siempre.
- [ ] La suite completa corre en `main` y de noche.
- [ ] Los cambios de configuración, migraciones y dependencias ignoran TIA.
- [ ] Toda prueba de carga tiene `hard_timeout`, límite de réplicas y condición de aborto económica.
- [ ] Toda prueba de carga verifica que el generador no es el cuello de botella.
- [ ] Existe la lista de controles que **nunca** se optimizan, y es corta.

---

## Fuentes (consultadas 2026-07-10)

- [FinOps Framework](https://www.finops.org/framework/) y [Framework 2026](https://www.finops.org/insights/2026-finops-framework/) — *Usage Optimization* (antes *Workload Optimization*), *Scopes*.
- [Google SRE — Service Level Objectives](https://sre.google/sre-book/service-level-objectives/)
- Documentación oficial de artefactos y `expire_in` de tu CI.
- Documentación oficial de tu herramienta de carga (JMeter, k6, Gatling) para límites y condiciones de aborto.
- Calculadora oficial de precios de tu proveedor cloud, **con región y fecha**.
- [Verificación de fuentes de la serie](/blog/verificacion-de-fuentes-serie-avanzada/)
