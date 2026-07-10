---
title: "Golden paths, escape hatches y contrato de evidencia"
description: "Template de servicio Java con pipeline de calidad, CLI ficticia de entornos efímeros, contrato normalizado de resultados de test, y escape hatches soportados."
pubDate: 2026-07-10
tags: ['golden-paths', 'templates', 'developer-experience', 'evidencia', 'reporting', 'platform-engineering']
cluster: 'a08'
clusterTitle: "Platform engineering para Quality Engineering"
type: satelite
order: 2
readingLevel: "Avanzado"
prerequisites: "Requiere CI/CD, Java, contenedores y reporting de tests."
icon: 'kube'
iconHue: 210
---

> **Aviso.** Nexo Finanzas es **ficticio**. **La CLI `nexo` no existe**: es una interfaz ilustrativa. **Ningún pipeline, template ni comando fue ejecutado.** El código es didáctico y no es código listo para producción.

> **Promesa del artículo.** Al terminar vas a poder diseñar un golden path que la gente elija en vez de tolerar, escribir un escape hatch que sea una ruta y no una disculpa, y normalizar la evidencia de cuatro herramientas distintas para que un líder técnico pueda leerla junta.

> Asume el marco de plataforma-como-producto del [pilar](/blog/una-quality-platform-es-un-producto-no-un-repo-de-utilidades/).

## Un golden path es una opinión, no una restricción

Un **golden path** es el camino recomendado, opinado y soportado para hacer algo común. La palabra clave es **soportado**: si te salís, funcionás igual; si te quedás, tenés ayuda.

Un golden path bien hecho se reconoce porque **la gente lo elige**. Uno mal hecho se reconoce porque hay que obligarla.

Las cuatro propiedades de uno que la gente elige:

1. **Es más rápido que hacerlo a mano.** Si tu template tarda más en configurarse que copiar el `pom.xml` del vecino, nadie lo usa. La métrica es *tiempo hasta el primer pipeline útil*.
2. **Tiene los defaults correctos**, no todos los defaults. Un template con 40 parámetros configurables no es un camino: es un formulario.
3. **Es transparente.** El usuario puede ver qué genera y por qué. Nada de magia.
4. **Es actualizable.** Un template que se copia una vez y diverge no es un camino: es un punto de partida. Ambas cosas son válidas, pero hay que elegir cuál es, y decirlo.

El punto 4 es la decisión de arquitectura más importante del artículo.

## Copiar versus heredar: la decisión que define tu plataforma

| | **Template que se copia** (scaffold) | **Componente que se hereda** (dependencia) |
|---|---|---|
| Actualización | El equipo la aplica cuando quiere | Llega con la versión |
| Divergencia | Inevitable y **aceptada** | Controlada |
| Breaking change | Imposible: ya copiaron | **Posible, y peligroso** |
| Autonomía | Total | Limitada por el contrato |
| Bueno para | Estructura, ADRs, `SECURITY.md`, configuración inicial | Lógica que **debe** ser consistente |

**La regla que funciona:**

> **Copiá la estructura. Heredá el comportamiento.**

Concretamente, en `templates/java-service/`:

- Se **copia** (y el equipo es dueño): el `pom.xml`, la estructura de directorios, los ADRs de ejemplo, `SECURITY.md`, `CONTRIBUTING.md`, `.env.example`.
- Se **hereda** (la plataforma es dueña, y versiona): el componente de pipeline que genera el SBOM, firma el artefacto y verifica la firma. Es la lógica que **no puede** divergir, porque la verificación de la cadena de suministro depende de que todos hagan lo mismo.

Lo que **nunca** se hereda: la estrategia de pruebas del equipo, sus assertions, su definición de riesgo. Eso es autonomía, y centralizarlo es el error del [ADR de qué no centralizar](/blog/una-quality-platform-es-un-producto-no-un-repo-de-utilidades/).

<figure class="diagram">
  <img src="/blog/diagrams/golden-paths-escape-hatches-y-contrato-de-evidencia-1.svg" width="1094" height="445" alt="Diagrama: golden-paths-escape-hatches-y-contrato-de-evidencia (1)" loading="lazy" decoding="async" />
</figure>

La caja `Nunca se centraliza` es la que convierte una plataforma en un producto y no en un mandato. **Una plataforma que rellena la matriz de riesgo del equipo le está enseñando que ese documento no importa.**

## Golden path 1: de cero a un servicio con pipeline de calidad

```text
templates/java-service/
├── README.md                        # qué genera, qué NO genera, cómo salirse
├── pom.xml                          # copiado. El equipo es dueño
├── src/main/java/...
├── src/test/java/...
├── .gitlab-ci.yml                   # incluye el componente heredado
├── docs/
│   ├── adr/ADR-000-plantilla.md     # con las secciones obligatorias
│   ├── quality/risk-matrix.md       # VACÍA, con instrucciones. No se puede autogenerar
│   └── runbooks/.gitkeep
├── SECURITY.md                      # con el aviso de sandbox ficticio
├── CONTRIBUTING.md
└── .env.example                     # nunca .env
```

Y el `.gitlab-ci.yml` generado, donde se ve la frontera copiar/heredar:

```yaml
# Generado por templates/java-service. Este archivo es TUYO: editalo.
include:
  # Esto NO es tuyo: es un componente versionado de la plataforma.
  # Genera SBOM, firma y verifica. Si cambia, cambia para todos.
  - component: nexo/quality-platform/java-supply-chain@2.3.0

stages: [build, test, evidence]

variables:
  # Los defaults de la plataforma. Cambialos si tu contexto lo pide.
  NEXO_COVERAGE_REPORT: "true"
  NEXO_SBOM_FORMATS: "cyclonedx"

# Tu trabajo. La plataforma no opina sobre qué probás.
test:unit:
  stage: test
  script: [ "mvn -B test" ]
  artifacts:
    when: always
    expire_in: 7 days
    reports:
      junit: target/surefire-reports/*.xml
```

Dos detalles deliberados:

- **`docs/quality/risk-matrix.md` se genera vacía, con instrucciones.** Es la parte que la plataforma **no puede** hacer por el equipo: nombrar los riesgos de su dominio. Un template que la rellena con riesgos genéricos le enseña al equipo que el documento no importa.
- **El comentario "este archivo es TUYO"** aparece literalmente. Le dice al usuario dónde termina la opinión de la plataforma. Sin eso, la gente tiene miedo de editar lo que puede editar.

## Golden path 2: de cero a evidencia de un journey

El segundo camino cubre al SDET. Su entregable no es un pipeline: es **evidencia comparable**.

```java
// Componente HEREDADO de la plataforma. Version 2.3.0.
// El SDET no escribe esto: lo usa.
public class EvidenceRecorder implements TestWatcher {

    @Override
    public void testFailed(ExtensionContext ctx, Throwable cause) {
        Evidence.builder()
            .testId(ctx.getUniqueId())
            .riskId(ctx.getTags().stream()                    // el test declara qué riesgo cubre
                       .filter(t -> t.startsWith("risk:"))
                       .findFirst().orElse("risk:undeclared"))
            .outcome(FAILED)
            .durationMs(ctx.duration())
            .commitSha(BuildInfo.commitSha())
            .environment(BuildInfo.environment())
            .timestamp(Instant.now())
            // La causa, SIN el mensaje: el mensaje puede contener PII.
            // Ver el capítulo de privacidad.
            .failureType(cause.getClass().getSimpleName())
            .artifacts(artifactStore.collect(ctx))            // con TTL, ver FinOps
            .emit();
    }
}
```

`risk:undeclared` es una decisión de producto de la plataforma: **no falla el test**, pero aparece en el reporte. Es una nudge, no un gate. Un gate que exige declarar riesgo en cada test produce `risk:whatever` en masa.

## El contrato de evidencia

Acá está el problema real que resuelve una Quality Platform, y que ninguna librería resuelve:

Un equipo reporta con JUnit XML. Otro con Cucumber JSON. Otro corre colecciones de Postman. Otro tiene un `.jtl` de JMeter. **Un líder técnico no puede responder "¿este riesgo está cubierto?" sin abrir cuatro herramientas.**

La solución no es imponer una herramienta. Es imponer un **contrato de salida**.

```json
{
  "$schema": "https://nexo.invalid/schemas/evidence/1.0.0",
  "evidenceVersion": "1.0.0",

  "execution": {
    "id": "exec_01H8X...",
    "commitSha": "1111111111111111111111111111111111111111",
    "pipelineId": "98765",
    "environment": "ephemeral-pr-1042",
    "startedAt": "2026-07-10T14:03:11Z",
    "durationMs": 184320
  },

  "source": {
    "tool": "junit",
    "toolVersion": "5.x",
    "adapter": "nexo-evidence-adapter-junit@2.3.0"
  },

  "results": [
    {
      "id": "com.nexo.transfer.IdempotencyTest#duplicateDelivery_producesSingleEffect",
      "outcome": "PASSED",
      "durationMs": 1240,
      "riskId": "RISK-001-doble-debito",
      "layer": "integration",
      "flakyHistory": { "runs": 50, "failures": 0 }
    },
    {
      "id": "TransferJourney.crear_y_observar",
      "outcome": "FAILED",
      "durationMs": 8100,
      "riskId": "RISK-004-journey-critico",
      "layer": "journey",
      "failureType": "AssertionError",
      "artifacts": [
        { "type": "screenshot", "uri": "artifacts/...", "expiresAt": "2026-07-17T00:00:00Z" }
      ]
    }
  ],

  "summary": { "total": 412, "passed": 410, "failed": 1, "skipped": 1 }
}
```

Cinco decisiones que hacen útil a este contrato:

- **`riskId` es el campo central.** Es lo que permite responder *"¿qué riesgos están cubiertos?"* en vez de *"¿cuántos tests hay?"*. Conecta la evidencia con la matriz de riesgo, que es el único vínculo que le importa a un líder técnico.
- **`layer`** permite comparar cobertura por frontera entre equipos sin comparar números de tests.
- **`flakyHistory` viaja con el resultado.** Un test que pasó pero falla el 20 % de las veces no es la misma evidencia que uno estable. Sin este campo, un verde miente.
- **`expiresAt` en cada artefacto**, coherente con la política de retención de [FinOps](/blog/ambientes-retencion-y-optimizacion-sin-degradar-riesgo/) y de [privacidad](/blog/telemetria-artefactos-de-ci-y-retencion-sin-pii/). La evidencia sabe cuándo caduca.
- **No hay mensaje de excepción**, solo `failureType`. El mensaje puede contener datos personales.

**Los adaptadores son la capability.** `nexo-evidence-adapter-junit`, `-cucumber`, `-postman`, `-jmeter`. Cada uno traduce el formato nativo a este contrato. El equipo sigue usando su herramienta; la plataforma normaliza la salida.

Eso es respetar la autonomía y ganar la agregación. Y es, concretamente, la diferencia entre una plataforma y un mandato.

## La CLI de entornos efímeros

```text
# CLI FICTICIA. El binario `nexo` no existe.

$ nexo env create --for-pr 1042
✔ Namespace pr-1042 creado
✔ PostgreSQL listo (12s)
✔ Broker listo (8s)
✔ Datos sintéticos sembrados (seed=42, 500 cuentas, 7 casos límite)
✔ Servicio desplegado

  URL:  https://pr-1042.nexo.invalid
  TTL:  4h (expira 18:07 UTC) · extender: nexo env extend pr-1042

  Comando subyacente (por si necesitás depurar):
    docker compose -f infra/compose/full.yml --project-name pr-1042 up -d
```

**La última línea es la más importante de todo el artículo.**

La CLI **imprime el comando que ejecutó**. Cuando algo falla a las 3 de la mañana, el on-call no necesita leer el código de la plataforma: copia el comando, lo corre a mano, y ve el error real de Docker Compose.

Esto es lo que significa *"la abstracción no puede esconder cómo depurar"*, en una línea de código. Cuesta nada implementarlo y es la diferencia entre una plataforma en la que se confía y una que se tolera.

Y fijate que ese comando **es** el escape hatch. La CLI no lo esconde: lo enseña.

## Escape hatches que no dan vergüenza

Un escape hatch documentado, soportado, y presentado como una opción legítima:

> ### `docs/golden-paths/entorno-local-sin-plataforma.md`
>
> **Cuándo usar esto.** Necesitás modificar la topología del entorno (agregar un servicio, cambiar la versión de PostgreSQL, conectar un debugger remoto), o la plataforma está caída y necesitás avanzar.
>
> **Esto está soportado.** No es un workaround. El equipo de plataforma prueba este camino en CI. Si se rompe, es un bug nuestro.
>
> ```bash
> cp .env.example .env
> docker compose -f infra/compose/full.yml up -d
> make reset-test-data SEED=42
> ```
>
> **Lo que perdés al salirte:** TTL automático (acordate de bajarlo), datos sintéticos sembrados automáticamente (por eso el `make`), y la publicación automática de evidencia.
>
> **Lo que ganás:** control total sobre la topología.
>
> **Contanos por qué te saliste.** No para convencerte de volver: para saber qué nos falta. Abrí un issue con la etiqueta `escape-hatch-usage`. Si tres equipos se salen por lo mismo, eso es nuestra próxima capability.

Cuatro cosas que este documento hace bien:

- **Dice explícitamente "esto está soportado"** y respalda la afirmación: la plataforma prueba el escape hatch en su CI.
- **Enumera lo que perdés**, sin dramatizarlo.
- **Enumera lo que ganás.** Un escape hatch presentado solo como pérdida es una amenaza.
- **Pide feedback sin condicionar el retorno.** La etiqueta `escape-hatch-usage` es un canal de descubrimiento de producto, y es la métrica más honesta que va a tener la plataforma.

## Anti-patrones

- **Template con 40 parámetros.** *Consecuencia:* no es un camino, es un formulario. *Alternativa:* defaults correctos, no todos los defaults.
- **Heredar la estructura y copiar el comportamiento.** *Consecuencia:* al revés de lo que querés: la estructura no puede evolucionar y el comportamiento diverge. *Alternativa:* copiá estructura, heredá comportamiento.
- **Heredar la estrategia de pruebas del equipo.** *Consecuencia:* quitás autonomía donde más duele. *Alternativa:* la matriz de riesgo se genera vacía, con instrucciones.
- **Rellenar la matriz de riesgo con ejemplos genéricos.** *Consecuencia:* el equipo aprende que el documento no importa. *Alternativa:* vacía y con instrucciones.
- **Imponer una herramienta de test para poder agregar reportes.** *Consecuencia:* pérdida de autonomía por un problema de formato. *Alternativa:* contrato de evidencia + adaptadores.
- **Evidencia sin `riskId`.** *Consecuencia:* podés contar tests, no responder si el riesgo está cubierto. *Alternativa:* `riskId` obligatorio en el contrato, `undeclared` visible pero no bloqueante.
- **Reportar un verde sin historial de flakiness.** *Consecuencia:* el verde miente. *Alternativa:* `flakyHistory` en el resultado.
- **Incluir el mensaje de excepción en la evidencia.** *Consecuencia:* PII en un artefacto de CI. *Alternativa:* `failureType`.
- **Una CLI que no muestra el comando subyacente.** *Consecuencia:* el on-call tiene que leer tu código a las 3 AM. *Alternativa:* imprimirlo siempre.
- **Escape hatch presentado como derrota.** *Consecuencia:* la gente lo usa igual, pero en silencio, y perdés la señal. *Alternativa:* soportado, probado, y con canal de feedback.
- **Un gate que exige `riskId`.** *Consecuencia:* `risk:whatever` en masa. *Alternativa:* nudge visible.

## Qué publicar en GitHub

```text
templates/java-service/               # con "este archivo es TUYO" en el CI
templates/test-automation/
components/pipelines/java-supply-chain/    # versionado; se hereda
components/reporting/evidence-adapters/    # junit, cucumber, postman, jmeter
docs/evidence/contrato-de-evidencia.md     # el schema, versionado
docs/evidence/evidence-1.0.0.schema.json
docs/golden-paths/servicio-java.md
docs/golden-paths/evidencia-de-journey.md
docs/golden-paths/entorno-local-sin-plataforma.md   # el escape hatch
examples/
```

## Qué aprendimos / próximos pasos

- Un golden path bueno se elige; uno malo se impone.
- **Copiá la estructura, heredá el comportamiento.** Y no heredes nunca la estrategia de pruebas.
- El contrato de evidencia con `riskId` es lo que convierte "cuántos tests" en "qué riesgo está cubierto".
- Un verde sin historial de flakiness miente.
- Una CLI que imprime su comando subyacente es una plataforma en la que se puede confiar a las 3 AM.
- El escape hatch es un canal de descubrimiento de producto, no una derrota.

**Siguiente:** [Adopción, versionado y deprecación sin castigar equipos](/blog/adopcion-versionado-y-deprecacion-sin-castigar-equipos/).

## Checklist final

- [ ] Cada golden path es más rápido que hacerlo a mano, y hay una métrica que lo demuestra.
- [ ] El template distingue explícitamente lo que se copia de lo que se hereda.
- [ ] Los archivos generados dicen cuáles son del equipo.
- [ ] La matriz de riesgo se genera **vacía**, con instrucciones.
- [ ] Existe un contrato de evidencia versionado, con schema publicado.
- [ ] Hay un adaptador por herramienta; ninguna herramienta se impone.
- [ ] La evidencia lleva `riskId`, `layer` y `flakyHistory`.
- [ ] La evidencia **no** lleva mensajes de excepción.
- [ ] Cada artefacto de evidencia lleva `expiresAt`.
- [ ] Toda CLI imprime el comando subyacente que ejecutó.
- [ ] Cada golden path tiene un escape hatch documentado, **probado en CI** y presentado sin dramatismo.
- [ ] Existe una etiqueta o canal para reportar uso del escape hatch.

---

## Fuentes (consultadas 2026-07-10)

- [JUnit 5 — Extension Model (`TestWatcher`)](https://junit.org/junit5/docs/current/user-guide/#extensions)
- [SLSA v1.2](https://slsa.dev/spec/v1.2/) — el componente de pipeline heredado genera y verifica provenance.
- [CycloneDX](https://cyclonedx.org/specification/overview/) — v1.7, formato del SBOM que el componente genera.
- [OpenTelemetry Documentation](https://opentelemetry.io/docs/)
- Documentación oficial de los componentes de pipeline de tu CI.
- [Verificación de fuentes de la serie](/blog/verificacion-de-fuentes-serie-avanzada/)
