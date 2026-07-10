---
title: "Riesgo, fraude y anomalía no son lo mismo"
description: "Pilar de calidad en decision systems: diferencia entre riesgo, fraude y anomalía; arquitectura de un rule engine simple; versionado con effective dates; reason codes y reproducibilidad de decisiones."
pubDate: 2026-07-10
tags: ['rule-engine', 'fraude', 'riesgo', 'decision-systems', 'versionado', 'auditoria', 'sdet']
cluster: 'a07'
clusterTitle: "Ingeniería de fraude y motores de reglas"
type: pilar
order: 1
readingLevel: "Avanzado"
prerequisites: "Requiere Java, APIs, SQL, eventos y testing basado en riesgo."
icon: 'search'
iconHue: 330
---

> **Aviso y límites.** Nexo Finanzas es **ficticio**. Este artículo trata la **calidad de ingeniería** de un motor de decisión de juguete. **No es una guía de evasión de controles**, ni un modelo de riesgo crediticio, regulatorio o productivo. Las reglas son deliberadamente simples y públicas: sirven para ilustrar versionado y pruebas, no para operar. Todos los datos son sintéticos. Ningún número es una medición. **No se automatiza ninguna decisión sensible sin límites ni revisión humana.**

> **Promesa del artículo.** Al terminar vas a poder distinguir tres conceptos que se usan como sinónimos y que exigen arquitecturas distintas; vas a saber por qué "reproducir una decisión de hace tres meses" es el requisito que reorganiza todo el diseño; y vas a entender qué convierte a una decisión en auditable.

## Tres palabras, tres problemas

| | Qué es | Ejemplo (ficticio) | Cómo se detecta |
|---|---|---|---|
| **Anomalía** | Un valor estadísticamente inusual | Una transferencia 50× mayor que el histórico de la cuenta | Estadística, sin etiqueta previa |
| **Riesgo** | Una probabilidad de pérdida, *estimada* | Cuenta nueva + destinatario nuevo + monto alto | Reglas o modelo, con una política de tolerancia |
| **Fraude** | Un **hecho**: alguien actuó con intención de engañar | Confirmado tras investigación | Solo se sabe **después**, y a veces nunca |

Confundirlos produce tres errores concretos:

- **Tratar una anomalía como fraude.** Una transferencia inusual puede ser una persona ficticia comprando un auto. La anomalía es una señal, no una conclusión.
- **Tratar el riesgo como un hecho.** Un score alto no significa "esto es fraude". Significa "la política dice que este caso merece fricción adicional".
- **Suponer que tenés etiquetas de fraude.** Y este es el problema profundo.

### El problema de las etiquetas, que casi nadie enuncia

Para evaluar un detector de fraude necesitás saber qué transacciones **fueron** fraude. Ese conjunto de etiquetas tiene tres defectos estructurales, y ninguno se arregla con más datos:

1. **Está sesgado por tus propias decisiones.** Si tu sistema rechazó una transferencia, nunca sabés si habría sido fraude. Solo tenés etiquetas de lo que **dejaste pasar**. Es un sesgo de selección irreducible.
2. **Llega tarde.** El fraude se confirma semanas después, cuando alguien reclama. Tu etiqueta de hoy es incompleta.
3. **Es incompleta para siempre.** El fraude que nadie reclamó nunca se etiqueta. Tu "tasa de fraude" es, en el mejor caso, "tasa de fraude reportado".

**Consecuencia para un Quality Engineer:** cuando alguien dice *"nuestro modelo tiene 99 % de accuracy"*, la primera pregunta no es sobre la métrica. Es **"¿contra qué etiquetas?"**. La segunda es *"¿cómo obtuviste etiquetas de lo que rechazaste?"*. Casi nunca hay una buena respuesta, y eso está bien —lo que no está bien es no saberlo.

Por eso este capítulo trata un motor de **reglas**, no de ML. Con reglas, la corrección es verificable: *"¿la regla que declaramos es la regla que se ejecutó?"* es una pregunta con respuesta.

## Lo que hace correcto a un motor de reglas

> **Tesis del capítulo.** Un motor de reglas correcto no solo detecta casos. Debe ser determinista cuando corresponde, explicable, versionado, observable, y evaluado por el impacto de sus falsos positivos y falsos negativos.

Cinco propiedades. La que más veces falta, y la que reorganiza todo el diseño:

> **Dada una transferencia de hace tres meses, ¿podés reproducir exactamente la decisión que se tomó, y explicar por qué?**

Si la respuesta es no, no tenés un sistema auditable. Tenés un sistema que decide.

Y la respuesta es "no" en la mayoría de las implementaciones, por una razón simple: **las reglas cambiaron y nadie guardó cuáles estaban vigentes.**

## Arquitectura de un motor de reglas simple

<figure class="diagram">
  <img src="/blog/diagrams/riesgo-fraude-y-anomalia-no-son-lo-mismo-1.svg" width="1252" height="256" alt="Diagrama: riesgo-fraude-y-anomalia-no-son-lo-mismo (1)" loading="lazy" decoding="async" />
</figure>

Cuatro observaciones sobre este diagrama, cada una con consecuencias:

### 1. La extracción de features es una frontera de pruebas propia

`F` convierte una transferencia en las variables que las reglas consultan: *¿el destinatario es nuevo? ¿cuántos días tiene la cuenta? ¿cuál es el percentil del monto respecto al histórico?*

**Esta caja es donde viven los bugs sutiles**, porque depende del tiempo y del estado. `esDestinatarioNuevo(cuenta, destinatario)` responde distinto hoy que ayer. Si la extracción consulta la base **en el momento de la evaluación**, la decisión no es reproducible: tres meses después, ese destinatario ya no es nuevo.

**La solución:** las features se **congelan** en la decisión. Se calculan una vez, se guardan con la decisión, y la regla se evalúa contra el snapshot. Reproducir la decisión es reejecutar las reglas contra las features guardadas, no recalcularlas.

Eso convierte a la extracción de features en un componente con sus propias pruebas unitarias, independiente del motor.

### 2. Hay tres resultados, no dos

`Allow`, `Review`, `Reject`. La existencia de `Review` es una decisión de **producto**, no técnica: significa que hay un presupuesto de atención humana y que el sistema puede admitir que no sabe.

Un motor con solo dos salidas obliga a elegir entre bloquear a una persona ficticia legítima o dejar pasar un caso dudoso. `Review` es la válvula, y su costo es real: alguien tiene que mirar. Ver el [artículo 3](/blog/metricas-tasa-base-y-revision-humana/).

### 3. El evento de auditoría no es opcional ni es un log

`E` recibe **todas** las decisiones, incluidas las `Allow`. Es la tentación más grande: *"¿para qué guardar las permitidas, si son el 99 %?"*.

Porque sin ellas no podés calcular una sola métrica. La tasa de falsos negativos requiere saber qué permitiste. El backtesting requiere el universo completo. **Un sistema que solo audita lo que rechaza no puede evaluarse.**

Y es un **evento**, no una línea de log: tiene schema, versión, contrato y consumidores. Va por el [outbox](/blog/outbox-inbox-dlq-y-replay-seguro/), en la misma transacción que la transferencia. Si el evento de auditoría se pierde, la decisión no ocurrió a efectos de auditoría.

### 4. El motor no debe conocer el dominio de la transferencia

`R` recibe features, no una transferencia. Esa indirección permite backtestear el motor sin levantar el sistema de transferencias, y permite que las reglas evolucionen sin tocar el dominio.

## Versionado: el requisito que reorganiza el diseño

Volvamos a la pregunta: *reproducir una decisión de hace tres meses*.

Para responderla necesitás cuatro cosas, y las cuatro se guardan **con la decisión**:

```java
// Pseudocodigo didactico. NO es codigo listo para produccion.
public record RiskDecision(
    String        transferId,
    Outcome       outcome,          // ALLOW | REVIEW | REJECT

    // 1) QUE conjunto de reglas se ejecuto. Inmutable, versionado.
    String        ruleSetVersion,   // "2026.07.01-3"

    // 2) POR QUE. Codigos estables, no texto libre.
    List<String>  reasonCodes,      // ["NEW_BENEFICIARY", "ACCOUNT_AGE_LOW"]

    // 3) CONTRA QUE se evaluo. El snapshot de features, congelado.
    //    Sin esto, la decision no se puede reproducir: las features cambian.
    Map<String, Object> featureSnapshot,

    // 4) CUANDO. Para saber que ruleSet estaba vigente.
    Instant       decidedAt,

    // Trazabilidad, sin PII. Ver el capitulo de privacidad.
    String        correlationId
) {}
```

**El `featureSnapshot` es la pieza que la mayoría omite**, y sin la cual las otras tres no alcanzan. Con `ruleSetVersion` podés recuperar las reglas; sin el snapshot, no tenés las entradas. Reejecutar las reglas viejas contra las features de hoy da un resultado distinto y no significa nada.

### Effective dates: un ruleset es inmutable

Un conjunto de reglas se **publica**, no se **edita**.

```yaml
# rules/2026.07.01-3.yaml — INMUTABLE una vez publicado.
ruleSetVersion: "2026.07.01-3"
effectiveFrom: "2026-07-01T00:00:00Z"
effectiveTo:   null                    # null = vigente
supersedes:    "2026.06.15-2"
author:        "@ficticio-carol"
approvedBy:    "@ficticio-dave"        # cuatro ojos sobre reglas de riesgo
backtestReport: "evidence/backtests/2026.07.01-3.md"   # NO se publica sin esto

rules:
  - id: R-001
    priority: 100
    description: "Cuenta muy nueva con destinatario nuevo requiere revision"
    when:
      all:
        - accountAgeDays: { lt: 7 }
        - beneficiaryIsNew: true
    then:
      outcome: REVIEW
      reasonCode: NEW_ACCOUNT_NEW_BENEFICIARY

  - id: R-002
    priority: 200
    description: "Monto por encima del umbral configurado requiere revision"
    when:
      amountMinor: { gt: "${THRESHOLD_HIGH_AMOUNT}" }   # parametrizado, no literal
    then:
      outcome: REVIEW
      reasonCode: AMOUNT_ABOVE_THRESHOLD
```

Cinco propiedades de este archivo:

- **`effectiveFrom`/`effectiveTo` permiten recuperar qué ruleset estaba vigente** en cualquier instante. Es una tabla de vigencias, y es la contraparte de `decidedAt`.
- **`supersedes` construye la cadena.** Podés reconstruir la historia completa de reglas.
- **`approvedBy` implementa cuatro ojos.** Una regla de riesgo que una sola persona puede publicar es un problema de control interno, no de calidad de código.
- **`backtestReport` es obligatorio.** Un ruleset sin backtest no se publica. El gate es simple de implementar y es el más valioso del capítulo.
- **`${THRESHOLD_HIGH_AMOUNT}` está parametrizado, no escrito.** Los umbrales de un motor de riesgo no se publican en un repositorio, ni siquiera ficticio. Es una práctica que conviene tener incorporada.

**El anti-patrón que esto previene:** editar el YAML de reglas en `main` y desplegar. Después de eso, `git log` es tu única fuente sobre qué reglas corrieron cuándo, y `git log` no sabe cuándo se desplegó.

## Reason codes: dos audiencias, dos vocabularios

Un `reasonCode` es un identificador estable que dice **por qué**. No un texto libre, porque el texto cambia y no se puede agregar ni traducir.

Y acá hay una tensión real que hay que resolver conscientemente:

| Audiencia | Qué necesita | Qué NO debe recibir |
|---|---|---|
| **Auditor / analista interno** | El detalle completo: qué regla, qué features, qué umbral | — |
| **Usuario final** | Que su operación necesita verificación y qué puede hacer | **Los umbrales y la lógica exacta** |

Si el mensaje al usuario dice *"rechazado porque el monto supera $X y la cuenta tiene menos de 7 días"*, acabás de publicar tu regla. En un sistema real, eso es exactamente lo que un atacante necesita.

**La solución:** dos capas.

```java
// Interno: completo, va al evento de auditoria.
reasonCodes = ["R-001:NEW_ACCOUNT_NEW_BENEFICIARY", "R-002:AMOUNT_ABOVE_THRESHOLD"]

// Externo: generico, estable, accionable.
userMessage = "Necesitamos verificar esta operacion. Te contactaremos."
```

El evento de auditoría lleva el detalle. La respuesta al usuario lleva una categoría genérica y una **acción posible**. Nunca el umbral, nunca la regla.

> **Esto no es seguridad por oscuridad.** El control real es la regla, y sigue funcionando aunque se conozca. Lo que se protege es la **calibración**: el valor exacto del umbral, cuyo conocimiento permite operar justo por debajo. La regla es pública en el diseño; el parámetro, no.

Y una consecuencia menos obvia: **`reasonCode` estable = métrica agregable.** Podés contar `NEW_BENEFICIARY` por semana y detectar drift. Con texto libre, no.

## Determinismo: cuándo sí y cuándo no

Un motor de reglas **debe ser determinista**: mismas features + mismo ruleset = misma decisión. Siempre.

Lo que rompe el determinismo, en orden de frecuencia:

- **Leer el reloj dentro de una regla.** `if (hora > 22)` hace que la misma transferencia decida distinto según cuándo la evalúes. Si el tiempo es una entrada, **es una feature**, y se congela en el snapshot.
- **Consultar la base dentro de una regla.** El estado cambió. Otra vez: es una feature.
- **Depender del orden de iteración de un `HashMap`.** Cuando dos reglas de la misma prioridad producen resultados distintos, el resultado depende del orden de las reglas. Ver conflictos en el [artículo 2](/blog/tablas-de-decision-golden-dataset-y-backtesting/).
- **Aleatoriedad**, incluso para muestreo.

**La prueba de determinismo es trivial de escribir y casi nadie la tiene:**

```java
@Test
void laMismaEntradaProduceLaMismaDecision() {
    FeatureSnapshot features = goldenDataset.case("cuenta-nueva-destinatario-nuevo");
    RuleSet rules = ruleSets.load("2026.07.01-3");

    RiskDecision first = engine.evaluate(features, rules);
    for (int i = 0; i < 100; i++) {
        assertThat(engine.evaluate(features, rules))
            .as("el motor debe ser determinista")
            .isEqualTo(first);   // incluye el ORDEN de los reasonCodes
    }
}
```

El detalle que la hace valiosa: **compara también el orden de los `reasonCodes`.** Si el orden varía entre ejecuciones, tenés una iteración no determinista, y ese es exactamente el bug que hace que un backtest no sea reproducible.

## Privacidad en un motor de riesgo

Un motor de riesgo es un imán de datos personales: quiere saber todo sobre la persona para decidir mejor. Tres reglas del [capítulo 04](/blog/coleccion/a04/), aplicadas acá:

- **Minimización.** La regla necesita `accountAgeDays`, no la fecha de apertura. Necesita `beneficiaryIsNew` (booleano), no el identificador del beneficiario. **La feature derivada es menos sensible que el dato crudo, y decide igual.**
- **El `featureSnapshot` se persiste durante años** (es evidencia de auditoría). Por eso importa que contenga booleanos y buckets, no PII. Un snapshot con `taxId` es una retención de datos personales de largo plazo que nadie decidió.
- **Los `reasonCode` y los logs no llevan PII.** Ni siquiera en el camino interno de auditoría, donde `transferId` alcanza para llegar al dato.

## Y si alguien propone agregar ML

Fuera del alcance de esta colección, deliberadamente: **el motor es de reglas deterministas.**

Si en algún momento se incorporara IA o ML, el marco a considerar es el [NIST AI Risk Management Framework](https://www.nist.gov/itl/ai-risk-management-framework) (**AI RMF 1.0**, NIST AI 100-1, enero de 2023; en proceso de actualización), y su [Generative AI Profile](https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.600-1.pdf) (NIST AI 600-1, 2024-07-26) si hubiera IA generativa involucrada.

Pero antes de eso, tres preguntas que casi siempre revelan que el ML no era necesario:

1. **¿El problema de las etiquetas está resuelto?** (Casi nunca lo está. Ver arriba.)
2. **¿Podés reproducir una decisión de hace tres meses?** Con un modelo, eso requiere versionar el modelo, sus pesos, su preprocesamiento **y** el snapshot de features. Es estrictamente más difícil que con reglas.
3. **¿Podés explicar una decisión individual a un auditor?** Con reglas, sí, por construcción.

**Un motor de reglas bien versionado y bien probado supera a un modelo mal gobernado**, y es infinitamente más fácil de defender. Empezá acá. Y si agregás ML, agregalo *junto* a las reglas, no en su lugar.

## Anti-patrones

- **Confundir anomalía con fraude.** *Consecuencia:* bloqueás a personas legítimas por comportamiento inusual. *Alternativa:* la anomalía es una señal, no una conclusión.
- **Hablar de "accuracy" sin nombrar el origen de las etiquetas.** *Consecuencia:* una métrica sin significado. *Alternativa:* declarar el sesgo de selección.
- **Recalcular las features al reproducir una decisión.** *Consecuencia:* la decisión no es reproducible. *Alternativa:* `featureSnapshot` congelado.
- **Auditar solo los rechazos.** *Consecuencia:* no podés calcular falsos negativos ni backtestear. *Alternativa:* auditar **todas** las decisiones.
- **El evento de auditoría como línea de log.** *Consecuencia:* se pierde, no tiene schema, no se puede consumir. *Alternativa:* evento por outbox, en la misma transacción.
- **Editar el ruleset en `main`.** *Consecuencia:* no sabés qué reglas corrieron cuándo. *Alternativa:* rulesets inmutables con `effectiveFrom`/`effectiveTo`.
- **Publicar un ruleset sin backtest.** *Alternativa:* `backtestReport` obligatorio en el manifiesto.
- **Un solo par de ojos sobre una regla de riesgo.** *Alternativa:* `approvedBy` distinto de `author`.
- **Umbrales literales en el repositorio.** *Alternativa:* parametrizados.
- **Mostrar al usuario el umbral y la regla exacta.** *Consecuencia:* publicás tu calibración. *Alternativa:* dos capas de reason codes.
- **`reasonCode` como texto libre.** *Consecuencia:* no se agrega, no se traduce, no se mide drift. *Alternativa:* códigos estables.
- **Leer el reloj o la base dentro de una regla.** *Consecuencia:* no determinismo. *Alternativa:* es una feature; se congela.
- **PII en el `featureSnapshot`.** *Consecuencia:* retención de datos personales por años, sin decisión. *Alternativa:* booleanos y buckets.

## Qué publicar en GitHub

```text
rules/2026.07.01-3.yaml               # inmutable, con effectiveFrom y backtestReport
src/                                  # motor + extracción de features, separados
docs/model-card-or-rule-card.md       # qué decide, con qué features, qué NO cubre
docs/adr/ADR-001-motor-de-reglas.md   # por qué reglas y no ML: el problema de las etiquetas
docs/adr/ADR-002-versionado.md        # effective dates, inmutabilidad, cuatro ojos
docs/runbooks/rule-rollback.md
tests/decision-tables/                # ver artículo 2
tests/DeterminismoTest.java
datasets/synthetic/
evidence/backtests/
```

`docs/model-card-or-rule-card.md` debe tener una sección explícita: **"Qué NO cubre este motor"**. Un rule card honesto dice que el sistema no detecta fraude, sino que aplica una política de riesgo declarada.

## Qué aprendimos / próximos pasos

- Anomalía, riesgo y fraude son tres cosas distintas; solo la última es un hecho, y llega tarde y sesgada.
- El requisito que reorganiza el diseño es **reproducir una decisión vieja**. Exige `ruleSetVersion` + `featureSnapshot` + `decidedAt` + `reasonCodes`.
- Las features se congelan; no se recalculan.
- Se auditan **todas** las decisiones, no solo los rechazos.
- Un ruleset es inmutable, aprobado por dos personas, y no se publica sin backtest.
- La explicabilidad hacia el auditor y hacia el usuario son dos vocabularios distintos.
- Un motor de reglas bien gobernado le gana a un modelo mal gobernado.

**Siguiente:** [Tablas de decisión, golden dataset y backtesting](/blog/tablas-de-decision-golden-dataset-y-backtesting/).

## Checklist final

- [ ] El vocabulario distingue anomalía, riesgo y fraude, y la documentación lo respeta.
- [ ] El `rule-card` declara **qué no cubre** el motor.
- [ ] Las features se congelan en un `featureSnapshot` y la reproducción las reusa.
- [ ] La extracción de features tiene pruebas propias, separadas del motor.
- [ ] **Todas** las decisiones, incluidas `ALLOW`, emiten evento de auditoría.
- [ ] El evento de auditoría va por outbox, en la misma transacción.
- [ ] Los rulesets son inmutables, con `effectiveFrom`, `effectiveTo` y `supersedes`.
- [ ] `approvedBy` es distinto de `author`.
- [ ] Ningún ruleset se publica sin `backtestReport`.
- [ ] Los umbrales están parametrizados, no escritos en el repositorio.
- [ ] Existen dos vocabularios de reason code: interno y externo.
- [ ] El mensaje al usuario no revela umbrales ni lógica.
- [ ] Existe un test de determinismo que compara también el **orden** de los reason codes.
- [ ] El `featureSnapshot` no contiene PII.
- [ ] No se afirma que el sistema "detecta fraude".

---

## Fuentes (consultadas 2026-07-10)

- [NIST AI Risk Management Framework](https://www.nist.gov/itl/ai-risk-management-framework) — **AI RMF 1.0** (NIST AI 100-1, ene-2023), en proceso de actualización. Citado **solo** como marco a considerar si se incorporara IA/ML; este motor no la usa.
- [NIST AI 600-1 — Generative AI Profile](https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.600-1.pdf) (2024-07-26).
- [NIST Privacy Framework](https://www.nist.gov/privacy-framework) — versión **1.0** final.
- Documentación oficial del motor de reglas que elijas, si usás uno. Este artículo describe un motor propio y simple, deliberadamente.
- **No se citan blogs de vendors como evidencia de efectividad antifraude.**
- [Verificación de fuentes de la serie](/blog/verificacion-de-fuentes-serie-avanzada/)
