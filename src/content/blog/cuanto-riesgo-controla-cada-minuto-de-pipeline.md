---
title: "Cuánto riesgo controla cada minuto de pipeline"
description: "Pilar de FinOps para Quality Engineering: unit economics de una ejecución, costo por feedback útil, modelo paramétrico sin precios, cost allocation y el costo de diagnóstico humano."
pubDate: 2026-07-10
tags: ['finops', 'economia-de-la-calidad', 'ci-cd', 'costo', 'riesgo', 'staff-engineer']
cluster: 'a06'
clusterTitle: "FinOps y economía de la calidad"
type: pilar
order: 1
readingLevel: "Avanzado"
prerequisites: "Requiere CI/CD, cloud básico y nociones de riesgo."
icon: 'chart'
iconHue: 88
---

> **Aviso.** Nexo Finanzas es **ficticio**. **Este artículo no contiene un solo precio.** El modelo de costo es paramétrico: sustituí las variables con los valores de tu proveedor, tu región y tu fecha, desde su calculadora oficial. Ninguna cifra acá es una medición.

> **Promesa del artículo.** Al terminar vas a poder construir un modelo de costo de tu ciclo de calidad sin depender de precios que caducan, vas a saber por qué "costo por ejecución" es una métrica incompleta, y vas a tener el lenguaje para conversar con finanzas sin convertir la calidad en un renglón de ahorro.

## La pregunta mal formulada

Alguien de finanzas mira la factura del CI y pregunta: *"¿Por qué gastamos tanto en testing?"*

La respuesta reflexiva —defender la suite, hablar de cobertura, mencionar el costo de un bug en producción— pierde la discusión. No porque esté equivocada, sino porque **responde a la pregunta que hicieron en vez de a la que importa**.

La pregunta correcta es:

> **¿Cuánto riesgo controla cada dólar, cada minuto de pipeline y cada ambiente que mantenemos?**

Reformular así cambia todo. Ya no defendés un gasto: mostrás una **cartera de controles con costo y cobertura**. Y una cartera se puede optimizar de forma inteligente: sacás lo que cuesta mucho y controla poco, mantenés lo que cuesta mucho y controla el único riesgo que no podés aceptar.

> **Tesis del capítulo.** La pregunta senior no es cuánto cuesta testear, sino cuánto valor y riesgo controla cada dólar, minuto de pipeline y ambiente mantenido. Calidad y costo tienen que conversar, y ninguna de las dos gana por defecto.

## El costo que nadie factura

Antes del modelo, la corrección más importante: **el costo dominante de tu ciclo de calidad no aparece en ninguna factura.**

Considerá un test flaky. Corre en 30 segundos. Falla el 5 % de las veces sin razón.

- **Costo de infraestructura:** 30 segundos de runner × la tasa de fallo × las reejecuciones. Es literalmente centavos, y es lo único que la factura ve.
- **Costo real:** cada falla espuria interrumpe a una persona. Esa persona mira el log, no entiende, reejecuta, espera, y vuelve a lo que estaba haciendo. Perdió entre diez y treinta minutos, la mitad en recuperar el contexto.

Un test flaky que falla espuriamente una vez al día, con un equipo de seis personas, consume **horas de ingeniería por semana**. Ese costo es uno o dos órdenes de magnitud mayor que el de infraestructura, y **no está en ningún dashboard de FinOps.**

De ahí la primera regla operativa, y la más contraintuitiva:

> **Nunca optimices el costo de un pipeline inestable.** Arreglá la inestabilidad primero. Optimizar los minutos de un pipeline flaky es pulir el marco de una ventana rota: reducís el costo visible mientras el costo real —la atención humana— sigue intacto.

Ningún equipo que persiga la reducción del costo de CI debería tocar una sola configuración antes de mirar su tasa de flakiness.

## El modelo paramétrico

Los precios caducan. Las relaciones entre variables, no. Definí las variables, escribí las fórmulas, y sustituí los valores desde la calculadora oficial de tu proveedor, con **región, moneda y fecha** anotadas al lado.

### Variables

```text
# Runner
t_exec       duracion de la ejecucion (minutos)
c_runner     costo por minuto del tipo de runner elegido
n_exec       ejecuciones por unidad de tiempo (dia, semana)
p_fail       probabilidad de fallo ESPURIO (flakiness), 0..1
n_retry      reejecuciones promedio ante fallo espurio

# Ambiente
c_env_hour   costo por hora del ambiente
t_env_alive  horas que el ambiente esta VIVO (no las que se USA)
u_env        utilizacion = horas usadas / horas vivas, 0..1

# Almacenamiento
s_artifact   tamano promedio del artefacto por ejecucion
r_days       dias de retencion
c_storage    costo por unidad de almacenamiento por dia
c_egress     costo por unidad de transferencia de salida

# Humano  <- la variable que la factura no ve
c_eng_min    costo por minuto de ingenieria (cargado)
t_diag       minutos de diagnostico humano por fallo espurio
```

### Fórmulas

```text
# 1) Costo de infraestructura por ejecucion
C_infra = t_exec * c_runner
        + (t_exec * c_runner * p_fail * n_retry)      # reejecuciones
        + (s_artifact * r_days * c_storage)           # artefactos retenidos

# 2) Costo humano por ejecucion  <- casi siempre el termino dominante
C_human = p_fail * t_diag * c_eng_min

# 3) Costo TOTAL por ejecucion
C_exec = C_infra + C_human

# 4) Costo de un ambiente, ajustado por lo que NO se usa
C_env = c_env_hour * t_env_alive
C_env_desperdiciado = c_env_hour * t_env_alive * (1 - u_env)

# 5) La metrica que importa: costo por feedback UTIL
#    Denominador: ejecuciones que produjeron una senal ACCIONABLE
#    (un fallo real que llevo a un fix, o un verde que habilito un merge).
#    Las reejecuciones por flakiness NO cuentan como feedback util.
C_feedback = (C_exec * n_exec) / n_ejecuciones_accionables
```

**La fórmula 5 es el corazón del artículo.** "Costo por ejecución" trata igual a una ejecución que detectó un bug y a una que falló porque un contenedor tardó en levantar. Solo la primera es feedback.

Y fijate qué hace `C_feedback` cuando `p_fail` sube: el numerador crece (más reejecuciones, más diagnóstico) **y el denominador cae** (más ejecuciones sin señal accionable). La métrica se degrada por los dos lados a la vez. **Está construida para castigar la inestabilidad más que el gasto**, que es exactamente el incentivo correcto.

Compará con "costo por ejecución": bajo flakiness alto, esa métrica *mejora* si comprás runners más baratos y lentos. Es una métrica que premia la decisión equivocada.

## Cost allocation: no podés optimizar lo que no podés atribuir

Antes de cualquier optimización, tenés que poder responder: **¿qué repositorio, qué suite y qué ambiente consumieron qué?**

Sin atribución, toda discusión de costo es política. Con atribución, es aritmética.

El mecanismo es **etiquetado consistente** de todo recurso que se pueda etiquetar:

```yaml
# Etiquetas obligatorias. Un recurso sin ellas es un recurso sin dueño.
labels:
  cost-center: quality-engineering
  repository: nexo-transfer-api
  suite: integration          # unit | integration | e2e | performance
  environment: ephemeral      # ephemeral | shared | permanent
  owner: "@ficticio-alice"
  ttl: "4h"                   # ver artículo 2
```

Y la regla que hace que funcione: **un recurso sin etiquetas se apaga.** No se investiga, no se pregunta en el canal, no se deja "por las dudas". Se apaga. Un recurso que nadie reclama en 48 horas es un recurso que nadie necesita.

Suena drástico y es lo único que evita el crecimiento monotónico de ambientes huérfanos. Implementalo con aviso previo, ventana de gracia, y la posibilidad de recrear desde código —que es, de paso, la prueba de que tu infraestructura es reproducible.

## El inventario de costos que la gente olvida

Cuando pedís "el costo del testing", casi siempre te dan los minutos de CI. Es entre un tercio y la mitad del total. El inventario completo:

| Categoría | Componente | Frecuentemente olvidado |
|---|---|---|
| **Cómputo** | Minutos de runner | — |
| | Runners de tipo especial (GPU, macOS, ARM) | **Sí**: cuestan múltiplos |
| **Ambientes** | Ambientes permanentes | — |
| | Ambientes efímeros mal apagados | **Sí** |
| | Bases de datos y brokers de los ambientes | **Sí** |
| **Almacenamiento** | Artefactos de build | — |
| | Screenshots y videos de UI | **Sí**: crecen sin límite |
| | Logs y trazas del entorno de test | **Sí** |
| | Imágenes de contenedor sin política de purga | **Sí** |
| **Red** | Egress al descargar imágenes y dependencias | **Sí** |
| **Servicios** | Grid de dispositivos, SaaS de reportes, APM | — |
| **Carga** | Generadores de carga y su infraestructura | **Sí**: el generador cuesta como el sistema |
| **Humano** | **Diagnóstico de fallos espurios** | **Sí, y es el dominante** |
| | Mantenimiento de la suite | Sí |

Cuatro comentarios sobre lo olvidado:

- **El egress muerde en silencio.** Cada pipeline descarga imágenes base y dependencias. Multiplicado por miles de ejecuciones, es un renglón visible. Un caché de proxy lo elimina casi por completo, y es de las optimizaciones con mejor relación esfuerzo/resultado.
- **Los screenshots y videos crecen monotónicamente.** Nadie los borra porque nadie es dueño. Ver el [capítulo de privacidad](/blog/coleccion/a04/): la retención corta es simultáneamente un control de privacidad y de costo. **Un mismo control, dos justificaciones.** Esos son los que se aprueban.
- **El generador de carga cuesta.** Para saturar un sistema hay que generar carga, y eso requiere infraestructura comparable. Un test de performance mal presupuestado consume más que el sistema que prueba.
- **Los runners especiales cuestan múltiplos.** Un runner macOS para tests de iOS puede costar varias veces un runner Linux. Correr la suite completa de mobile en cada commit es una decisión con precio, y hay que tomarla a sabiendas.

## Costo y valor: la matriz de decisión

Con el modelo y la atribución, la decisión se vuelve tratable.

<figure class="diagram">
  <img src="/blog/diagrams/cuanto-riesgo-controla-cada-minuto-de-pipeline-1.svg" width="542" height="555" alt="Diagrama: cuanto-riesgo-controla-cada-minuto-de-pipeline (1)" loading="lazy" decoding="async" />
</figure>

La caja `Critical risk?` es la única que requiere criterio, y **no es una decisión de costo**. Es una decisión de riesgo, tomada por quien entiende el dominio.

Para Nexo Finanzas, ejemplos ficticios de cómo se ve la clasificación:

| Suite | Riesgo que controla | ¿Crítico? | Decisión |
|---|---|---|---|
| Idempotencia de transferencias | Doble débito | **Sí** | **No se toca.** Corre en cada commit, cueste lo que cueste |
| Invariantes del ledger | Descuadre contable | **Sí** | No se toca |
| Verificación del artefacto | Desplegar algo no construido acá | **Sí** | No se toca |
| Regresión visual de UI | Estética | No | Nocturna, o solo en PRs que tocan CSS |
| Suite completa de mobile | Cobertura de dispositivos | Parcial | Subconjunto en cada commit, completa antes del release |
| Performance baseline | Degradación gradual | Parcial | Semanal, no por commit |

**La primera columna del "no se toca" es lo que hace defendible al resto.** Cuando llegás a la reunión de costos con una lista explícita de lo que **no** vas a optimizar y por qué, la conversación sobre lo que sí se puede optimizar es constructiva. Sin esa lista, cada propuesta de ahorro es una amenaza y cada defensa suena a resistencia al cambio.

Y una advertencia sobre la fila de idempotencia: **el costo de esa suite es irrelevante frente al costo de un doble débito.** No porque el segundo sea grande en dinero, sino porque es **asimétrico**: un doble débito daña la confianza, y la confianza no se recupera con un refund.

## El FinOps Framework, y lo que aporta acá

El FinOps Framework, en su **edición 2026**, organiza la práctica en **4 Dominios** y **22 Capabilities** (verificado; ver [verificación de fuentes](/blog/verificacion-de-fuentes-serie-avanzada/)). La edición 2026 trae tres cambios relevantes para nosotros:

1. **Amplía el alcance más allá de cloud**, incorporando AI, SaaS, licencias y datacenter. Esto importa porque buena parte del costo de un ciclo de calidad **no es cloud**: son licencias de grids de dispositivos y suscripciones SaaS.
2. **Consolida el constructo de *Scopes***, que es exactamente el vocabulario que necesitás para atribuir costo a un repositorio, una suite o un ambiente.
3. **Agrega la capability *Executive Strategy Alignment***, en el dominio *Manage the FinOps Practice*, que formaliza la conexión entre la práctica y las decisiones ejecutivas.

Varias capabilities fueron renombradas (por ejemplo, *Workload Optimization* pasó a *Usage Optimization*, y *Policy & Governance* a *Governance, Policy & Risk*). **Verificá los nombres vigentes antes de citarlos en un documento interno**; no los cites de memoria.

Lo que el framework aporta a un Quality Engineer no es una fórmula: es un **lenguaje común**. Cuando decís "necesito allocation por scope para mi cost center", finanzas entiende. Cuando decís "necesitamos más runners", no.

## Métricas saludables, y las que dañan

| Métrica saludable | Definición | Por qué funciona |
|---|---|---|
| **Costo por feedback útil** | `(C_exec × n_exec) ÷ ejecuciones accionables` | Se degrada con flakiness por numerador **y** denominador |
| **Minutos desperdiciados por flakiness** | `t_exec × n_exec × p_fail × n_retry` | Hace visible el costo del que nadie habla |
| **Ambientes ociosos** | `c_env_hour × t_env_alive × (1 − u_env)` | Convierte "está levantado por las dudas" en un número |
| **Storage por artefacto y política** | Bytes × días, por tipo | Revela lo que nadie borra |
| **Costo estimado de una regresión completa** | Suma de `C_exec` de la cartera | Permite decidir cuándo correrla |

Y las que dañan, con la razón:

- **"Costo por tester".** Convierte a las personas en el renglón a optimizar. Nadie va a proponer una mejora que reduzca el trabajo si el resultado es que sobra gente.
- **"Cantidad de tests".** Es una métrica de output, no de outcome. Se maximiza escribiendo tests triviales. **Goodhart en estado puro.**
- **"Ahorro logrado", sin medir el impacto en riesgo.** Es la más peligrosa. Se puede ahorrar el 100 % del costo de testing borrando la suite. Cualquier cifra de ahorro que no venga acompañada de "y estos son los riesgos que ahora controlamos menos" está incompleta.

## Sostenibilidad: opcional, y verificable

*Carbon awareness* es una consideración legítima: correr trabajos batch en horarios de menor intensidad de carbono, o en regiones con matriz energética más limpia, tiene efecto medible.

Dos condiciones para incluirlo sin caer en el greenwashing:

1. **Los datos de intensidad de carbono vienen de una fuente citable**, con región y fecha.
2. **No se convierte en una métrica de vanidad.** Si tu suite es flaky y corre cinco veces, el impacto ambiental está en las cuatro ejecuciones desperdiciadas, no en la región del datacenter. **Arreglar el flakiness es la mayor optimización de carbono disponible**, y también la de costo, y también la de experiencia de desarrollo.

Es la misma acción con tres justificaciones. Esas son las que se financian.

## Anti-patrones

- **Eliminar pruebas porque son caras.** *Consecuencia:* ahorrás un costo visible y aceptás un riesgo invisible. *Alternativa:* clasificar por riesgo primero; declarar qué no se toca.
- **Optimizar pipelines inestables antes de corregir la flakiness.** *Consecuencia:* pulís el costo menor y dejás intacto el dominante. *Alternativa:* `p_fail` primero, siempre.
- **Ignorar el costo de diagnóstico humano.** *Consecuencia:* tu modelo omite el término dominante. *Alternativa:* `C_human` en la fórmula.
- **"Costo por ejecución" como métrica principal.** *Consecuencia:* premia runners baratos y lentos. *Alternativa:* costo por feedback útil.
- **Comparar precios sin región, moneda y fecha.** *Consecuencia:* la comparación no significa nada. *Alternativa:* modelo paramétrico + calculadora oficial.
- **"Costo por tester" o "cantidad de tests".** *Consecuencia:* Goodhart. *Alternativa:* métricas de outcome.
- **Mostrar ahorro sin medir el impacto en riesgo.** *Alternativa:* toda cifra de ahorro se acompaña de qué riesgo se controla menos.
- **Mantener ambientes por miedo a no poder recrearlos.** *Consecuencia:* pagás una suscripción a tu propia deuda de reproducibilidad. *Alternativa:* arreglar la reproducibilidad; ver artículo 2.
- **Recursos sin etiquetas.** *Consecuencia:* no hay atribución y toda discusión es política. *Alternativa:* etiquetas obligatorias; sin etiqueta, se apaga.

## Qué publicar en GitHub

```text
cost-model/modelo-parametrico.md      # las variables y fórmulas, SIN precios
cost-model/supuestos.md               # qué asumimos, y qué haría cambiar el modelo
docs/finops/cost-allocation.md        # esquema de etiquetas y la regla de apagado
docs/finops/cartera-de-controles.md   # la tabla de "no se toca" y por qué
docs/finops/retention-policy.md       # ver artículo 2
dashboards/
budgets/
```

`docs/finops/cartera-de-controles.md` es el documento que llevás a la reunión con finanzas. No lleva números: lleva la lista de riesgos que controlás y cuáles no aceptás dejar de controlar.

## Qué aprendimos / próximos pasos

- La pregunta correcta es cuánto riesgo controla cada dólar, no cuánto cuesta testear.
- El costo dominante es el **diagnóstico humano de fallos espurios**, y no está en ninguna factura.
- Nunca optimices un pipeline inestable: arreglá `p_fail` primero.
- "Costo por feedback útil" se degrada por numerador y denominador con flakiness. Está diseñado para eso.
- Sin atribución por etiquetas, la discusión de costo es política.
- La lista de lo que **no** se toca es lo que hace posible optimizar el resto.
- Arreglar flakiness es simultáneamente la mayor optimización de costo, de carbono y de experiencia. Esas coincidencias se financian.

**Siguiente:** [Ambientes, retención y optimización sin degradar riesgo](/blog/ambientes-retencion-y-optimizacion-sin-degradar-riesgo/).

## Checklist final

- [ ] El modelo de costo incluye el término humano `C_human`.
- [ ] Ningún precio aparece sin región, moneda, fecha y fuente oficial.
- [ ] La métrica principal es costo por **feedback útil**, no por ejecución.
- [ ] `p_fail` se mide y se ataca **antes** de cualquier optimización de infraestructura.
- [ ] Todo recurso lleva etiquetas de `cost-center`, `repository`, `suite`, `environment`, `owner` y `ttl`.
- [ ] Un recurso sin etiquetas se apaga tras una ventana de gracia.
- [ ] Existe una lista explícita de suites que **no se optimizan**, con el riesgo que controla cada una.
- [ ] Ninguna cifra de ahorro se presenta sin su impacto en riesgo.
- [ ] No se usa "costo por tester" ni "cantidad de tests" como métrica.
- [ ] Si se menciona sostenibilidad, la fuente de intensidad de carbono está citada.

---

## Fuentes (consultadas 2026-07-10)

- [FinOps Framework](https://www.finops.org/framework/) — 4 Dominios, 22 Capabilities.
- [FinOps Framework 2026](https://www.finops.org/insights/2026-finops-framework/) — *Executive Strategy Alignment*, consolidación de *Scopes*, alcance más allá de cloud, capabilities renombradas.
- [FinOps Capabilities](https://www.finops.org/framework/capabilities/) — **verificá los nombres vigentes antes de citarlos.**
- [Google SRE — Service Level Objectives](https://sre.google/sre-book/service-level-objectives/)
- Calculadora oficial y documentación de precios de **tu** proveedor cloud. Este artículo deliberadamente no cita ninguna cifra.
- Documentación oficial de los runners y artefactos de tu CI.
- [Verificación de fuentes de la serie](/blog/verificacion-de-fuentes-serie-avanzada/)
