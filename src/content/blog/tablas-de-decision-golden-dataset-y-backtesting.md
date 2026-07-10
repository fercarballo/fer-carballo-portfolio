---
title: "Tablas de decisión, golden dataset y backtesting"
description: "Decision table testing con cobertura combinatoria, conflictos y prioridades entre reglas, tests parameterized en Java, golden dataset sintético con balance documentado y backtesting controlado."
pubDate: 2026-07-10
tags: ['decision-tables', 'testing', 'golden-dataset', 'backtesting', 'rule-engine', 'junit']
cluster: 'a07'
clusterTitle: "Ingeniería de fraude y motores de reglas"
type: satelite
order: 2
readingLevel: "Avanzado"
prerequisites: "Requiere Java, JUnit parameterized y testing basado en riesgo."
icon: 'search'
iconHue: 330
---

> **Aviso y límites.** Nexo Finanzas es **ficticio**. Las reglas son deliberadamente simples y **no constituyen una guía de evasión de controles**. El golden dataset es **100 % sintético**. Ningún número es una medición. El código es didáctico y **no es código listo para producción**.

> **Promesa del artículo.** Al terminar vas a poder detectar los conflictos entre reglas antes de que un usuario los descubra, construir un golden dataset cuyo sesgo esté documentado en vez de escondido, y ejecutar un backtest que responda una pregunta útil.

> Asume el versionado y el `featureSnapshot` del [pilar](/blog/riesgo-fraude-y-anomalia-no-son-lo-mismo/).

## El bug que las reglas individuales no tienen

Probá `R-001` sola. Funciona.
Probá `R-002` sola. Funciona.

Ahora una transferencia que dispara las dos: cuenta nueva **y** destinatario nuevo **y** monto sobre el umbral. `R-001` dice `REVIEW`. `R-002` dice `REVIEW`. Coinciden. Bien.

Agregá `R-003`, que dice: *"un canal verificado con dispositivo conocido puede continuar"* → `ALLOW`.

Ahora una transferencia dispara `R-001` (`REVIEW`) y `R-003` (`ALLOW`). **¿Qué gana?**

Si la respuesta es "depende del orden en que el motor itera las reglas", tenés un bug que va a aparecer en producción y va a ser casi imposible de reproducir. Y si la respuesta es "la de mayor prioridad", la siguiente pregunta es: *¿y si tienen la misma prioridad?*

> **El defecto característico de un motor de reglas no está en una regla. Está entre dos reglas.**

Ninguna prueba unitaria de regla individual lo encuentra. Se necesita una técnica distinta.

## La política de resolución de conflictos, primero

Antes de escribir un test, escribí la política. Es una decisión de diseño con consecuencias de negocio.

Tres políticas comunes, con sus efectos:

| Política | Regla | Efecto |
|---|---|---|
| **Prioridad numérica** | Gana la regla con `priority` más baja | Requiere que las prioridades sean **únicas**, o vuelve el no determinismo |
| **Más restrictivo gana** | `REJECT > REVIEW > ALLOW` | Sesga hacia el falso positivo. Seguro y molesto |
| **Primera coincidencia** | Gana la primera en el archivo | **Frágil**: reordenar el YAML cambia el comportamiento |

Para Nexo Finanzas (ficticio), la elección y su justificación:

> **ADR-003: resolución de conflictos entre reglas**
>
> **Decisión.** Se aplica **"más restrictivo gana"**, con `REJECT > REVIEW > ALLOW`. Las prioridades numéricas se usan **solo** para ordenar la evaluación y acumular reason codes, **no** para decidir el resultado.
>
> **Razón.** Una regla que dice `ALLOW` está afirmando *"no encontré motivo de riesgo"*. Una que dice `REVIEW` afirma *"encontré uno"*. La ausencia de evidencia no anula la evidencia. Que `R-003` no vea riesgo no significa que `R-001` esté equivocada.
>
> **Consecuencia negativa aceptada.** Aumenta el volumen de `REVIEW`, y eso cuesta atención humana. Es el costo de sesgar hacia el falso positivo. Se monitorea con la métrica de "% enviado a revisión" (ver [artículo 3](/blog/metricas-tasa-base-y-revision-humana/)).
>
> **Regla de implementación.** Todos los reason codes de todas las reglas que dispararon se acumulan en la decisión, aunque no hayan determinado el resultado. El auditor necesita ver que `R-003` también disparó.

Esa última línea es la que hace auditable el sistema: **el resultado es uno, pero la evidencia es toda.**

<figure class="diagram">
  <img src="/blog/diagrams/tablas-de-decision-golden-dataset-y-backtesting-1.svg" width="775" height="684" alt="Diagrama: tablas-de-decision-golden-dataset-y-backtesting (1)" loading="lazy" decoding="async" />
</figure>

Notá que `R-003` **no cambia el resultado y sí aporta evidencia**. El auditor necesita ver que la regla de dispositivo confiable disparó y fue sobreseída; sin eso, no puede entender por qué el sistema decidió como decidió.

## La tabla de decisión

Una tabla de decisión enumera las combinaciones de condiciones y el resultado esperado. No es documentación: **es la especificación ejecutable**.

Condiciones ficticias (deliberadamente simples y públicas):

- `C1`: antigüedad de la cuenta < 7 días
- `C2`: destinatario nuevo
- `C3`: monto por encima del umbral parametrizado
- `C4`: dispositivo conocido y canal verificado

`2^4 = 16` combinaciones. Con cuatro condiciones es tratable escribirlas todas, y **conviene**: cada fila es una decisión de negocio que alguien tiene que confirmar.

| # | C1 | C2 | C3 | C4 | Reglas que disparan | Resultado | Reason codes acumulados |
|---|---|---|---|---|---|---|---|
| 1 | N | N | N | N | — | `ALLOW` | `[]` |
| 2 | N | N | N | S | R-003 | `ALLOW` | `[TRUSTED_DEVICE]` |
| 3 | N | N | S | N | R-002 | `REVIEW` | `[AMOUNT_ABOVE_THRESHOLD]` |
| 4 | N | N | S | S | R-002, R-003 | **`REVIEW`** | `[AMOUNT_ABOVE_THRESHOLD, TRUSTED_DEVICE]` |
| 5 | N | S | N | N | — | `ALLOW` | `[]` |
| 6 | N | S | N | S | R-003 | `ALLOW` | `[TRUSTED_DEVICE]` |
| 7 | N | S | S | N | R-002 | `REVIEW` | `[AMOUNT_ABOVE_THRESHOLD]` |
| 8 | N | S | S | S | R-002, R-003 | **`REVIEW`** | `[AMOUNT_ABOVE_THRESHOLD, TRUSTED_DEVICE]` |
| 9 | S | N | N | N | — | `ALLOW` | `[]` |
| 10 | S | N | N | S | R-003 | `ALLOW` | `[TRUSTED_DEVICE]` |
| 11 | S | N | S | N | R-002 | `REVIEW` | `[AMOUNT_ABOVE_THRESHOLD]` |
| 12 | S | N | S | S | R-002, R-003 | **`REVIEW`** | `[AMOUNT_ABOVE_THRESHOLD, TRUSTED_DEVICE]` |
| 13 | S | S | N | N | R-001 | `REVIEW` | `[NEW_ACCOUNT_NEW_BENEFICIARY]` |
| 14 | S | S | N | S | R-001, R-003 | **`REVIEW`** | `[NEW_ACCOUNT_NEW_BENEFICIARY, TRUSTED_DEVICE]` |
| 15 | S | S | S | N | R-001, R-002 | `REVIEW` | `[NEW_ACCOUNT_NEW_BENEFICIARY, AMOUNT_ABOVE_THRESHOLD]` |
| 16 | S | S | S | S | R-001, R-002, R-003 | **`REVIEW`** | los tres |

**Las filas en negrita son los conflictos.** Son las que solo aparecen en la tabla, nunca en un test de regla individual. Y son exactamente las que un revisor de negocio debe confirmar: *"¿realmente queremos que un dispositivo conocido no compense un monto alto?"*.

Fijate qué reveló la tabla: **`R-003` (`ALLOW`) nunca cambia un resultado.** Bajo la política "más restrictivo gana", una regla que solo emite `ALLOW` es **inútil para decidir** y solo sirve para aportar un reason code.

Ese es un hallazgo de diseño que la tabla produjo gratis. Las opciones son dos, y ambas son legítimas: aceptar que `R-003` es puramente informativa (y renombrarla para que se note), o cambiar la política. Lo que no podés es tener una regla que la gente cree que hace algo y no hace nada.

## Tests parameterized

La tabla se convierte en tests directamente. Un caso por fila, con nombre.

```java
// Pseudocodigo didactico. NO es codigo listo para produccion.
class DecisionTableTest {

    static Stream<Arguments> tablaDeDecision() {
        return Stream.of(
            //        C1     C2     C3     C4     esperado         reason codes esperados
            arguments(false, false, false, false, ALLOW,  Set.of()),
            arguments(false, false, false, true,  ALLOW,  Set.of("TRUSTED_DEVICE")),
            arguments(false, false, true,  false, REVIEW, Set.of("AMOUNT_ABOVE_THRESHOLD")),
            // Fila 4: el CONFLICTO. Dispositivo conocido NO compensa monto alto.
            arguments(false, false, true,  true,  REVIEW, Set.of("AMOUNT_ABOVE_THRESHOLD",
                                                                 "TRUSTED_DEVICE")),
            // ... las 16 filas ...
            arguments(true,  true,  true,  true,  REVIEW, Set.of("NEW_ACCOUNT_NEW_BENEFICIARY",
                                                                 "AMOUNT_ABOVE_THRESHOLD",
                                                                 "TRUSTED_DEVICE"))
        );
    }

    @ParameterizedTest(name = "[{index}] cuentaNueva={0} destNuevo={1} montoAlto={2} disp={3} -> {4}")
    @MethodSource("tablaDeDecision")
    void laTablaDeDecisionSeCumple(boolean cuentaNueva, boolean destinatarioNuevo,
                                   boolean montoAlto, boolean dispositivoConocido,
                                   Outcome esperado, Set<String> reasonCodesEsperados) {

        FeatureSnapshot features = FeatureSnapshot.of(
            "accountAgeDays",     cuentaNueva ? 3 : 400,
            "beneficiaryIsNew",   destinatarioNuevo,
            "amountAboveThreshold", montoAlto,
            "trustedDevice",      dispositivoConocido
        );

        RiskDecision d = engine.evaluate(features, ruleSets.load("2026.07.01-3"));

        assertThat(d.outcome()).isEqualTo(esperado);
        // Se compara como Set: el ORDEN no debe importar para la asercion,
        // pero el test de determinismo del pilar SI verifica que el orden sea estable.
        assertThat(d.reasonCodes()).containsExactlyInAnyOrderElementsOf(reasonCodesEsperados);
    }

    /**
     * El test estructural: la tabla debe cubrir TODAS las combinaciones.
     * Si alguien agrega una condicion C5 y no actualiza la tabla, esto falla.
     */
    @Test
    void laTablaCubreTodasLasCombinaciones() {
        long condiciones = 4;
        assertThat(tablaDeDecision().count())
            .as("la tabla debe tener 2^%d filas", condiciones)
            .isEqualTo(1L << condiciones);
    }
}
```

`laTablaCubreTodasLasCombinaciones` es el test que **evita que la tabla se pudra**. Sin él, alguien agrega una condición, la tabla queda con 16 filas de 32 posibles, y las 16 que faltan son exactamente los conflictos nuevos.

### Cuando `2^n` deja de ser tratable

Con 4 condiciones, 16 filas. Con 10, 1.024. Ahí la estrategia cambia, igual que en [feature flags](/blog/ciclo-de-vida-de-un-feature-flag-y-explosion-combinatoria/):

1. **Agrupá por regla.** Las condiciones que ninguna regla combina son independientes. Solo importan las combinaciones **dentro** del `when` de una regla, y **entre** reglas que pueden disparar juntas.
2. **Exhaustivo sobre el conjunto que interactúa.** Es el subconjunto de condiciones que aparecen en más de una regla.
3. **Pairwise para el resto**, declarando el supuesto: *"se cubren interacciones de a pares; las de tres factores no."*
4. **Y siempre, las combinaciones que ya causaron un incidente**, con nombre.

## El golden dataset: honestidad sobre su construcción

Un **golden dataset** es un conjunto de casos con resultado esperado conocido, usado como referencia estable. Es lo que te permite decir "este cambio de reglas alteró estos 12 casos".

Y tiene un problema fundamental que hay que enunciar antes de usarlo:

> **Vos construiste el golden dataset. Refleja tu comprensión del dominio, incluidos sus huecos.** Un caso de fraude que no imaginaste no está en el dataset, y ningún backtest contra él lo va a encontrar.

Eso no lo invalida. Lo convierte en lo que es: **una prueba de regresión, no una prueba de eficacia.** El golden dataset responde *"¿este cambio rompió algo que antes funcionaba?"*. No responde *"¿nuestro motor detecta fraude?"*. Son preguntas distintas y solo la primera tiene respuesta.

### Balance: una decisión, no un accidente

En un sistema real, los casos de riesgo son una fracción minúscula del total. Si tu golden dataset replica esa proporción, tenés muy pocos casos de riesgo y tu regresión es débil sobre lo que más importa.

Si lo balanceás 50/50, tenés buena cobertura de reglas y **cualquier métrica calculada sobre él es una mentira**, porque la tasa base está inflada.

**La solución: dos datasets, con propósitos distintos y declarados.**

```yaml
# datasets/synthetic/manifest.yaml — 100% sintetico.
datasets:
  - name: golden-regression
    purpose: "Regresion: detectar si un cambio de reglas altera decisiones conocidas"
    size: 500
    balance:
      ALLOW:  200
      REVIEW: 200
      REJECT: 100
    balance_rationale: >
      DELIBERADAMENTE BALANCEADO. No refleja la distribucion real de ningun
      sistema. Sirve para cubrir ramas de reglas, NO para calcular metricas.
    metrics_valid: false          # <- explicito. Nadie puede calcular precision aqui.

  - name: distribution-sample
    purpose: "Estimar el impacto de un cambio sobre el volumen de revisiones"
    size: 100000
    balance:
      ALLOW:  99700
      REVIEW: 280
      REJECT: 20
    balance_rationale: >
      Tasa base SINTETICA elegida para ilustrar el efecto de una tasa base baja.
      NO es una medicion de ningun sistema real.
    metrics_valid: true
    caveat: >
      Las metricas calculadas aqui dependen enteramente de una tasa base que
      ELEGIMOS. Son utiles para comparar dos rulesets ENTRE SI, nunca como
      afirmacion sobre el desempeno absoluto.
```

**El campo `metrics_valid` es el que salva al equipo de sí mismo.** Sin él, alguien va a calcular precision sobre `golden-regression`, va a obtener un número hermoso, y lo va a poner en una presentación. Con él, la herramienta se niega a calcular métricas sobre ese dataset.

Es la clase de control que parece burocracia y previene un error de razonamiento caro.

### Casos límite con nombre

Igual que en el [generador de datos sintéticos](/blog/datos-sinteticos-versus-subset-enmascarado/), los casos límite tienen nombre y documentan un hecho:

```text
datasets/synthetic/edge-cases/
  monto-exactamente-en-el-umbral.json      # el clasico off-by-one: gt vs gte
  cuenta-creada-hace-exactamente-7-dias.json
  destinatario-nuevo-y-dispositivo-conocido.json   # el conflicto de la fila 4
  monto-cero.json                          # deberia rechazarse antes del motor
  moneda-no-soportada.json
  transferencia-a-si-mismo.json
```

`monto-exactamente-en-el-umbral` merece énfasis. El bug de `>` versus `>=` en un umbral de riesgo es trivial de escribir e invisible en revisión. Y su consecuencia es que una operación exactamente en el límite se decide al revés de lo que la política dice.

## Backtesting: qué pregunta responde

Un **backtest** ejecuta un ruleset nuevo contra datos históricos y compara sus decisiones contra las del ruleset vigente.

**Lo que un backtest responde:** *"Si hubiéramos tenido `2026.07.01-3` en vigencia, ¿qué decisiones habrían cambiado, y cuáles?"*

**Lo que un backtest NO responde:** *"¿El nuevo ruleset es mejor?"* Para eso necesitarías saber cuáles de las decisiones cambiadas eran correctas, y volvemos al [problema de las etiquetas](/blog/riesgo-fraude-y-anomalia-no-son-lo-mismo/).

Esa distinción es todo. Un backtest **cuantifica el cambio**, no la mejora.

### Cómo se ejecuta

```text
Para cada decision historica D en la ventana [T1, T2):
    features = D.featureSnapshot        # congeladas. NO recalcular.
    vieja    = D.outcome                # lo que se decidio
    nueva    = engine.evaluate(features, rulesetNuevo)

    si vieja != nueva:
        registrar(D.transferId, vieja, nueva, D.reasonCodes, nueva.reasonCodes)
```

**`features = D.featureSnapshot` es la línea que hace válido el backtest.** Recalcular las features contra el estado actual de la base compararía manzanas con naranjas: el destinatario que era nuevo hace tres meses ya no lo es. Todo el diseño de `featureSnapshot` del pilar existe para hacer esto posible.

### El reporte de backtest

Este es el artefacto obligatorio del manifiesto del ruleset. Números **ilustrativos**.

> ### Backtest `2026.06.15-2` → `2026.07.01-3`
>
> Ventana: 2026-04-01 a 2026-07-01. Decisiones evaluadas: 100.000 (dataset sintético `distribution-sample`).
> **Todos los números son ilustrativos, generados sobre datos sintéticos. No son mediciones de ningún sistema real.**
>
> | Transición | Cantidad | % del total |
> |---|---:|---:|
> | `ALLOW` → `ALLOW` | 99.412 | 99,41 % |
> | `ALLOW` → `REVIEW` | **288** | 0,29 % |
> | `REVIEW` → `REVIEW` | 271 | 0,27 % |
> | `REVIEW` → `ALLOW` | **9** | 0,01 % |
> | `REJECT` → `REJECT` | 20 | 0,02 % |
>
> **Impacto operativo.** El volumen de revisión pasa de 280 a 559 casos por cada 100.000: **un aumento del 99,6 %**. Con el presupuesto actual de revisión humana, esto es insostenible y **requiere una decisión de producto antes de desplegar**, no después.
>
> **Los 9 casos `REVIEW` → `ALLOW` fueron inspeccionados uno por uno.** Todos corresponden a `R-003` con dispositivo conocido y monto apenas sobre el umbral anterior. Es el efecto buscado del cambio.
>
> **Los 288 casos `ALLOW` → `REVIEW` fueron muestreados (n=30).** 28 corresponden al nuevo umbral de antigüedad. 2 son casos que la regla nueva captura por un efecto no previsto: cuentas migradas cuya `accountAgeDays` se reinició. **Es un bug de la extracción de features, no de la regla.**
>
> **Recomendación.** No desplegar hasta corregir el cálculo de `accountAgeDays` para cuentas migradas, y hasta acordar el presupuesto de revisión.

Ese reporte hace tres cosas que un reporte de métricas agregadas no hace:

1. **Cuantifica el impacto operativo** en la unidad que importa: casos que un humano tiene que mirar. Un ruleset "mejor" que duplica la carga de revisión no se puede desplegar.
2. **Inspecciona los casos que cambiaron**, no solo los cuenta. Los 9 se miraron todos; los 288 se muestrearon.
3. **Encontró un bug que no era de las reglas.** El backtest de un cambio de reglas descubrió un defecto en la extracción de features. Eso pasa a menudo y es una de las razones por las que el backtest vale la pena.

## Anti-patrones

- **Probar reglas individuales y no sus combinaciones.** *Consecuencia:* el conflicto aparece en producción. *Alternativa:* tabla de decisión.
- **No definir la política de conflictos.** *Consecuencia:* el resultado depende del orden de iteración. *Alternativa:* ADR explícito.
- **Prioridades numéricas duplicadas.** *Consecuencia:* no determinismo. *Alternativa:* unicidad forzada por validación del ruleset.
- **Perder los reason codes de las reglas que no ganaron.** *Consecuencia:* el auditor no ve la evidencia completa. *Alternativa:* acumular todos.
- **Tabla de decisión sin test de completitud.** *Consecuencia:* la tabla se pudre al agregar una condición. *Alternativa:* `assertEquals(1 << n, filas)`.
- **No probar el valor exacto del umbral.** *Consecuencia:* `>` vs `>=` decide al revés en el límite. *Alternativa:* caso límite con nombre.
- **Calcular precision sobre un dataset balanceado.** *Consecuencia:* un número hermoso y sin sentido. *Alternativa:* `metrics_valid: false`.
- **Un solo dataset para regresión y para métricas.** *Alternativa:* dos, con propósitos declarados.
- **Recalcular features en el backtest.** *Consecuencia:* comparás contra otro universo. *Alternativa:* `featureSnapshot`.
- **Presentar un backtest como prueba de mejora.** *Consecuencia:* afirmás algo que las etiquetas no soportan. *Alternativa:* el backtest cuantifica el **cambio**.
- **Backtest sin impacto operativo.** *Consecuencia:* desplegás un ruleset que duplica la carga de revisión y lo descubrís el lunes. *Alternativa:* la tabla de transiciones, en casos por cada 100.000.
- **Contar los casos que cambiaron sin mirarlos.** *Alternativa:* inspección total si son pocos, muestreo declarado si son muchos.

## Qué publicar en GitHub

```text
tests/decision-tables/DecisionTableTest.java     # con el test de completitud
tests/decision-tables/tabla-de-decision.md       # la tabla, revisada por negocio
docs/adr/ADR-003-resolucion-de-conflictos.md     # más restrictivo gana, y por qué
datasets/synthetic/manifest.yaml                 # con metrics_valid y balance_rationale
datasets/synthetic/edge-cases/                   # cada caso, con nombre
evidence/backtests/2026.07.01-3.md               # con impacto operativo e inspección
tools/backtest/                                  # rechaza datasets con metrics_valid: false
```

La herramienta de backtest debe **negarse a calcular métricas** sobre un dataset con `metrics_valid: false`. Es un control de dos líneas que previene un error de razonamiento que se propaga a presentaciones.

## Qué aprendimos / próximos pasos

- El defecto característico de un motor de reglas está **entre** dos reglas.
- La política de conflictos es una decisión de negocio, y se escribe antes del primer test.
- La tabla de decisión reveló que una regla que solo emite `ALLOW` no decide nada. Ese hallazgo fue gratis.
- Un golden dataset refleja tu comprensión del dominio, huecos incluidos. Es regresión, no eficacia.
- Un dataset balanceado no admite métricas. Declaralo en el manifiesto y hacé que la herramienta lo respete.
- Un backtest cuantifica el **cambio**, no la mejora. Y su salida más útil es el **impacto operativo**.

**Siguiente:** [Métricas, tasa base y revisión humana](/blog/metricas-tasa-base-y-revision-humana/), donde el 99 % de accuracy se desarma.

## Checklist final

- [ ] La política de resolución de conflictos está en un ADR, con su consecuencia negativa.
- [ ] Las prioridades numéricas son únicas y una validación lo fuerza.
- [ ] Todos los reason codes de todas las reglas que dispararon se acumulan.
- [ ] Existe una tabla de decisión con las `2^n` combinaciones, revisada por negocio.
- [ ] Existe un test que verifica que la tabla está completa.
- [ ] Hay un caso límite para el valor **exacto** de cada umbral.
- [ ] Hay dos datasets, con `purpose` y `balance_rationale` declarados.
- [ ] `metrics_valid` existe y la herramienta lo respeta.
- [ ] El backtest usa `featureSnapshot`, nunca recalcula.
- [ ] El reporte de backtest incluye **impacto operativo** en casos de revisión.
- [ ] Los casos que cambiaron fueron inspeccionados o muestreados, con el `n` declarado.
- [ ] Ningún backtest se presenta como prueba de mejora.
- [ ] Todo número del reporte está rotulado como ilustrativo y sintético.

---

## Fuentes (consultadas 2026-07-10)

- [JUnit 5 — Parameterized Tests](https://junit.org/junit5/docs/current/user-guide/#writing-tests-parameterized-tests)
- [NIST AI Risk Management Framework](https://www.nist.gov/itl/ai-risk-management-framework) — **AI RMF 1.0**; relevante solo si se incorporara ML.
- [NIST Privacy Framework](https://www.nist.gov/privacy-framework) — versión **1.0** final.
- Documentación oficial del motor de reglas que uses, si usás uno.
- **No se citan blogs de vendors como evidencia de efectividad antifraude.**
- [Verificación de fuentes de la serie](/blog/verificacion-de-fuentes-serie-avanzada/)
