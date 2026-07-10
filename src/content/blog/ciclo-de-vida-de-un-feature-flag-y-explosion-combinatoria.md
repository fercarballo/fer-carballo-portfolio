---
title: "El ciclo de vida de un feature flag y la explosión combinatoria"
description: "Tipos de feature flags, ownership y fecha de retiro, OpenFeature en Java con su estado real de especificación, y una estrategia de pruebas combinatorias que no explota."
pubDate: 2026-07-10
tags: ['feature-flags', 'openfeature', 'testing', 'combinatoria', 'deuda-tecnica', 'sdet']
cluster: 'a03'
clusterTitle: "Progressive delivery, feature flags y GitOps"
type: satelite
order: 2
readingLevel: "Avanzado"
prerequisites: "Requiere Java y estrategia de pruebas."
icon: 'git'
iconHue: 205
---

> **Aviso.** Nexo Finanzas es **ficticio**. El código es didáctico y **no es código listo para producción**. **Ningún porcentaje ni umbral es una medición.** No hay usuarios reales: las cohortes son sintéticas.

> **Promesa del artículo.** Al terminar vas a poder clasificar un flag por su tiempo de vida esperado (que determina todo lo demás), diseñar una estrategia de pruebas que no requiera ejecutar 2^n combinaciones, y explicar el estado real de OpenFeature sin exagerarlo.

> Asume la separación deployment/release del [pilar](/blog/deployment-no-es-release/).

## Un flag es un `if` que sobrevivió a su autor

En el momento en que agregás un flag, agregás una rama de ejecución que **no se elimina sola**. Tu código ahora tiene dos comportamientos posibles, y tu sistema tiene un estado de configuración que decide cuál.

Con un flag, tenés 2 caminos. Con 10 flags independientes, tenés 1.024 estados posibles del sistema. Ninguna suite prueba 1.024 estados, así que en la práctica probás dos o tres y **rezás** por el resto.

Esto no es un argumento contra los flags. Es un argumento a favor de tratarlos como lo que son: **deuda técnica deliberada, contraída a cambio de un beneficio concreto, con un plan de pago.**

Un flag sin fecha de retiro es una deuda sin vencimiento. Y como toda deuda sin vencimiento, no se paga.

## No todos los flags son la misma cosa

La clasificación importa porque **el tiempo de vida esperado determina el ownership, la estrategia de prueba y la política de retiro.** Un solo tipo de gobierno para todos los flags es la razón por la que la mayoría de los sistemas de flags fracasan.

| Tipo | Propósito | Vida esperada | ¿Quién lo cambia? | ¿Se prueban sus combinaciones? |
|---|---|---|---|---|
| **Release** | Desacoplar deploy de exposición | Días a semanas | Equipo de desarrollo | **Sí**, con el camino viejo y el nuevo |
| **Operational / kill switch** | Degradar o apagar una funcionalidad ante un incidente | Meses a años (permanente por diseño) | On-call | Sí: el estado degradado es un requisito |
| **Experiment** | Comparar variantes | Duración del experimento | Producto / data | No exhaustivamente; sí el ruteo |
| **Permission / entitlement** | Habilitar por plan o rol | Permanente (**no es un feature flag**) | Producto | Es lógica de negocio: se prueba como tal |

La cuarta fila es una trampa frecuente. Un "flag" que decide si un usuario premium ve una funcionalidad **no es un feature flag**: es una regla de autorización. Si la tratás como flag, terminás con reglas de negocio en un panel de configuración, sin tests, sin revisión de código y sin auditoría. **Sacala del sistema de flags y ponela en el dominio.**

Los que **deben** morir son los de tipo *release*. Los operacionales están diseñados para vivir, y por eso necesitan lo contrario: pruebas de que el camino degradado funciona.

## El ciclo de vida, con las tres puertas que nadie pone

<figure class="diagram">
  <img src="/blog/diagrams/ciclo-de-vida-de-un-feature-flag-y-explosion-combinatoria-1.svg" width="506" height="834" alt="Diagrama: ciclo-de-vida-de-un-feature-flag-y-explosion-combinatoria (1)" loading="lazy" decoding="async" />
</figure>

Las tres puertas que hacen que esto funcione:

1. **Puerta de entrada.** Un flag no se crea en el código. Se crea en un **registro** con `owner`, `tipo`, `fecha_de_retiro` y `hipótesis`. Un flag sin entrada en el registro falla el build. Es una regla trivial de implementar y es la única que impide la proliferación.
2. **Puerta de salida.** `Retirado` significa **borrar el flag y el camino viejo**. Un flag "en 100 %" que sigue en el código no está retirado: es un `if (true)` que todavía te obliga a razonar sobre la rama muerta.
3. **La alarma.** Un job que lista flags con `fecha_de_retiro < hoy` y abre un ticket automáticamente. Sin esto, el estado `Vencido` no existe: los flags simplemente se quedan.

El estado `Vencido` merece un comentario. **No recomiendo que bloquee el build.** Bloquear el pipeline porque un flag venció es castigar al equipo que está intentando entregar otra cosa. Lo que sí funciona: un ticket automático, visible, con el owner asignado, y una revisión periódica de la lista. La presión social de una lista pública de deuda vencida es más eficaz que un gate que la gente aprende a saltear.

### El registro, como código

```yaml
# feature-flags/registry.yaml — la fuente de verdad. Datos ficticios.
flags:
  - key: beneficiary-validation-v2
    type: release
    owner: "@ficticio-alice"
    created: 2026-07-01
    expires: 2026-09-01          # OBLIGATORIO para type: release
    hypothesis: >
      La validacion v2 rechaza beneficiarios invalidos sin rechazar validos.
    removal_ticket: NEXO-1042    # el ticket de limpieza ya existe

  - key: risk-engine-enabled
    type: operational            # kill switch: permanente por diseno
    owner: "@ficticio-carol"
    created: 2026-03-15
    expires: null                # permitido SOLO para type: operational
    degraded_behavior: >
      Con el flag en off, las transferencias se procesan sin evaluacion de
      riesgo y se marcan con reasonCode RISK_ENGINE_UNAVAILABLE para
      revision posterior.
    tested_in: tests/degraded/RiskEngineDisabledTest.java
```

Dos reglas que este archivo hace cumplir:

- `expires: null` **solo** es válido si `type: operational`. Un flag de release sin fecha no compila.
- Un flag `operational` **debe** declarar `degraded_behavior` y `tested_in`. Un kill switch cuyo camino degradado nunca se probó es un botón que no sabés qué hace. Y lo vas a apretar en el peor momento.

Esa segunda regla es, en mi experiencia, la más valiosa del artículo. **El estado degradado es un requisito funcional, no un accidente.**

## OpenFeature: qué es y qué todavía no es

OpenFeature es una **abstracción vendor-neutral** para evaluar flags. Definís el flag en tu código contra una API estándar, y un *provider* la implementa contra el backend que uses (un archivo, un servicio propio, un SaaS). El valor es obvio: no acoplás tu dominio a un vendor.

**El estado real, verificado al 2026-07-10** (ver [verificación de fuentes](/blog/verificacion-de-fuentes-serie-avanzada/)):

- El **SDK de Java está en 1.x y es GA.** Podés usarlo.
- **La especificación de OpenFeature está en `0.8.0`**, es decir, **pre-1.0**. Y el SDK de Java declara conformidad con la **spec `0.7.0`**.

Esto no es una razón para no usarlo. Es una razón para **no escribir en tu README que estás siguiendo "el estándar de la industria para feature flags"**. La formulación honesta:

> "Usamos el SDK de Java de OpenFeature (1.x, GA) como capa de abstracción sobre nuestro proveedor de flags. La especificación de OpenFeature está en 0.8.0 (pre-1.0), por lo que la API podría evolucionar. Aislamos la evaluación detrás de una interfaz propia para acotar el impacto."

Esa última frase es la decisión de ingeniería real. Aun con una abstracción vendor-neutral, **envolvé la abstracción**. Suena redundante hasta que la spec pre-1.0 cambia.

```java
// Pseudocodigo didactico. NO es codigo listo para produccion.

// 1) La interfaz de TU dominio. No menciona OpenFeature.
public interface TransferFeatures {
    boolean useBeneficiaryValidationV2(TransferContext ctx);
    boolean isRiskEngineEnabled();
}

// 2) La implementacion, que si lo menciona. Es lo unico que cambia
//    si la spec 0.x evoluciona.
public class OpenFeatureTransferFeatures implements TransferFeatures {

    private final Client client;  // dev.openfeature.sdk.Client

    @Override
    public boolean useBeneficiaryValidationV2(TransferContext ctx) {
        EvaluationContext evalCtx = new MutableContext()
            // Targeting key OPACO. Nunca un documento, mail o nombre.
            // Ver el capitulo de privacidad.
            .setTargetingKey(ctx.pseudonymousId())
            .add("channel", ctx.channel());

        // El DEFAULT es una decision de diseno, no un relleno:
        // si el proveedor de flags esta caido, que comportamiento queremos?
        // Para una validacion nueva y no probada: false (camino conocido).
        return client.getBooleanValue("beneficiary-validation-v2", false, evalCtx);
    }

    @Override
    public boolean isRiskEngineEnabled() {
        // Para un kill switch, el default es true (comportamiento normal).
        // Si el proveedor de flags cae, NO queremos apagar el motor de riesgo.
        return client.getBooleanValue("risk-engine-enabled", true);
    }
}
```

Tres decisiones que merecen defensa en un review:

- **El valor por defecto es el comportamiento cuando el proveedor de flags no responde.** No es un relleno. Para un flag de release nuevo, el default seguro es `false` (el camino conocido). Para un kill switch, el default seguro es `true` (comportamiento normal). Elegir mal el default convierte una caída del sistema de flags en una caída de tu servicio.
- **El `targetingKey` es un identificador pseudónimo, opaco.** Nunca un documento, un email ni un `userId` con significado. Ese identificador viaja al proveedor de flags —posiblemente un tercero— en cada evaluación. Ver el [capítulo de privacidad](/blog/coleccion/a04/).
- **La evaluación no lanza excepción.** Un fallo del proveedor devuelve el default. Un flag que rompe el request cuando el servicio de flags está lento es un punto único de fallo que agregaste voluntariamente.

## La explosión combinatoria, y cómo no rendirse ante ella

Con `n` flags booleanos independientes hay `2^n` estados. Con 10, más de mil. Nadie los prueba todos, y probar 3 al azar no es una estrategia.

**Lo primero: la mayoría de los flags no interactúan.** El flag que cambia el color de un botón y el que cambia la validación de beneficiarios son ortogonales. La explosión combinatoria es un problema real **solo entre flags que tocan el mismo camino de código**.

Estrategia en cuatro pasos, de más barato a más caro:

### 1. Reducir el espacio: matriz de interacción

Antes de probar, dibujá qué flags se tocan. En serio, en una tabla:

| | `beneficiary-validation-v2` | `risk-engine-enabled` | `new-receipt-format` |
|---|---|---|---|
| `beneficiary-validation-v2` | — | **Sí**: ambos pueden rechazar la transferencia | No |
| `risk-engine-enabled` | **Sí** | — | No |
| `new-receipt-format` | No | No | — |

Tres flags, `2^3 = 8` combinaciones teóricas. Pero solo un par interactúa. El espacio real a probar exhaustivamente es `2^2 = 4` combinaciones del par, más los caminos individuales del tercero. **Pasaste de 8 a 6, y con 10 flags pasás de 1.024 a decenas.**

Esta matriz es un artefacto de diseño. Si nadie puede llenarla, nadie entiende el sistema, y ese es el hallazgo.

### 2. Probar exhaustivamente los pares que interactúan

Para el par que interactúa, `2^2 = 4` casos, y son casos con **significado**:

| `validation-v2` | `risk-engine` | Comportamiento esperado |
|---|---|---|
| off | on | Camino actual, con riesgo. Baseline |
| on | on | Ambos evalúan. **¿Quién rechaza primero? ¿Qué `reasonCode` gana?** |
| off | off | Modo degradado: sin riesgo, validación vieja |
| on | off | Validación nueva, sin riesgo |

La fila 2 es la que descubre bugs: **el orden de evaluación y la precedencia de los motivos de rechazo**. Es exactamente el tipo de defecto que ninguna prueba de flag aislado encuentra. Sin la matriz, no habrías escrito este test.

### 3. Pairwise para el resto

Para los flags sin interacción conocida, cubrir **todos los pares** de valores en vez de todas las combinaciones. Con 10 flags booleanos, un conjunto pairwise ronda la decena de casos en lugar de 1.024.

**El supuesto explícito:** pairwise asume que los defectos son causados por la interacción de **a lo sumo dos** factores. Es un supuesto empírico razonable y **puede fallar**. Escribilo en la estrategia de pruebas: *"cubrimos pares; los defectos de interacción de tres factores no están cubiertos por esta técnica."* Un supuesto declarado es una decisión. Uno tácito es una sorpresa.

### 4. Probar las dos configuraciones que realmente existen

Este es el paso que la teoría olvida. En cualquier momento, tu producción tiene **una** configuración de flags. Y hay dos que importan más que todas las combinaciones:

- **La configuración actual de producción.** Un test que la lee del registro y ejecuta el journey crítico contra ella. Si alguien cambia un flag en producción, este test cambia lo que prueba. Eso es deseable.
- **La configuración objetivo** (todos los flags de release en `on`), que es a donde vas. Corre en CI y te dice si el camino nuevo, completo, funciona.

Estas dos valen más que veinte casos pairwise, porque son las que van a existir.

## Anti-patrones

- **Flag sin owner ni fecha de retiro.** *Consecuencia:* deuda perpetua e intestable. *Alternativa:* registro como código; `expires` obligatorio para flags de release.
- **Kill switch cuyo camino degradado nunca se probó.** *Consecuencia:* apretás el botón durante un incidente y provocás un segundo incidente. *Alternativa:* `degraded_behavior` declarado y `tested_in` enlazado.
- **Lógica de autorización disfrazada de feature flag.** *Consecuencia:* reglas de negocio en un panel, sin tests ni auditoría. *Alternativa:* sacala del sistema de flags.
- **Default de flag elegido sin pensar.** *Consecuencia:* la caída del proveedor de flags se convierte en la caída de tu servicio. *Alternativa:* el default **es** el comportamiento ante fallo. Elegilo por tipo de flag.
- **`userId` o documento como `targetingKey`.** *Consecuencia:* enviás identificadores personales a un tercero en cada request. *Alternativa:* pseudónimo opaco.
- **La evaluación del flag lanza excepción.** *Alternativa:* devolver el default; nunca romper el request.
- **Intentar probar `2^n` combinaciones.** *Consecuencia:* o una suite imposible, o el abandono total. *Alternativa:* matriz de interacción → exhaustivo en pares que interactúan → pairwise para el resto → las dos configuraciones reales.
- **Declarar un flag "retirado" cuando está en 100 %.** *Consecuencia:* la rama muerta sigue en el código y hay que razonar sobre ella. *Alternativa:* retirado = flag borrado **y** camino viejo borrado.
- **"Usamos el estándar OpenFeature."** *Consecuencia:* afirmación falsa: la spec es 0.8.0. *Alternativa:* citar SDK GA + spec pre-1.0 y aislar detrás de una interfaz propia.

## Qué publicar en GitHub

```text
feature-flags/registry.yaml                    # con owner, tipo y expires
docs/release/feature-flag-policy.md            # tipos, ciclo de vida, las tres puertas
docs/quality/matriz-de-interaccion-flags.md    # qué flags se tocan
docs/quality/estrategia-combinatoria.md        # pairwise + supuesto declarado
tests/degraded/                                # un test por kill switch
tests/flags/ConfiguracionDeProduccionTest.java # lee el registro real
scripts/check-expired-flags.sh                 # abre ticket, NO bloquea el build
```

## Qué aprendimos / próximos pasos

- Un flag es deuda deliberada. La fecha de retiro es su vencimiento, y sin ella no se paga.
- El tipo de flag determina todo: ownership, default, estrategia de prueba y si debe morir.
- Un kill switch sin prueba del camino degradado es un botón desconocido.
- El default de un flag **es** el comportamiento cuando el proveedor de flags falla.
- La explosión combinatoria se domina con una matriz de interacción, no con más máquinas.
- OpenFeature: SDK de Java GA, **especificación 0.8.0 (pre-1.0)**. Decilo así.

**Siguiente:** [Canary, guardrails, GitOps y rollback ensayado](/blog/canary-guardrails-gitops-y-rollback-ensayado/).

## Checklist final

- [ ] Todo flag existe primero en el registro, con owner y tipo.
- [ ] `expires` es obligatorio para flags de tipo `release`.
- [ ] Los flags `operational` declaran `degraded_behavior` y `tested_in`.
- [ ] Hay un test por cada camino degradado.
- [ ] Ninguna regla de autorización vive en el sistema de flags.
- [ ] El valor por defecto de cada flag fue elegido por su comportamiento ante fallo del proveedor.
- [ ] El `targetingKey` es un pseudónimo opaco.
- [ ] Existe una matriz de interacción entre flags.
- [ ] Los pares que interactúan se prueban exhaustivamente; el resto, pairwise, con el supuesto declarado.
- [ ] Hay un test que ejecuta el journey crítico contra la configuración **real** de producción.
- [ ] Los flags vencidos generan un ticket, no un build roto.
- [ ] La documentación no llama "estándar" a la especificación 0.8.0 de OpenFeature.

---

## Fuentes (consultadas 2026-07-10)

- [OpenFeature](https://openfeature.dev/) — abstracción vendor-neutral.
- [OpenFeature — SDK compatibility](https://openfeature.dev/docs/reference/sdks/sdk-compatibility/) — **spec 0.8.0**; SDK de Java 1.x GA, conforme a spec 0.7.0.
- [OpenFeature — Java SDK](https://openfeature.dev/docs/reference/sdks/server/java/)
- [Verificación de fuentes de la serie](/blog/verificacion-de-fuentes-serie-avanzada/)
