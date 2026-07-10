---
title: "Telemetría, artefactos de CI y retención sin PII"
description: "Contrato de logging que preserva traceId y excluye PII, allowlist de atributos en trazas, cardinalidad de métricas, screenshots de Selenium/Appium, retención y una prueba que falla ante un patrón prohibido."
pubDate: 2026-07-10
tags: ['observabilidad', 'logging', 'opentelemetry', 'privacy-engineering', 'ci-cd', 'retencion']
cluster: 'a04'
clusterTitle: "Privacy engineering y gobierno de datos de prueba"
type: satelite
order: 3
readingLevel: "Avanzado"
prerequisites: "Requiere logs estructurados, trazas, métricas y CI."
icon: 'filter'
iconHue: 280
---

> **Aviso.** Nexo Finanzas es **ficticio**. Los datos son sintéticos. El código es didáctico y **no es código listo para producción**. **No es asesoramiento legal.** Los patrones de detección de los ejemplos son sintéticos y **no coinciden con formatos de documentos reales de ninguna jurisdicción**.

> **Promesa del artículo.** Al terminar vas a tener un contrato de logging que conserva la capacidad de depurar sin transportar datos personales, una prueba automatizada que falla cuando un patrón prohibido aparece en un log o un response, y una política de retención que alguien pueda ejecutar.

> Cierra el capítulo. Asume la clasificación del [pilar](/blog/como-una-suite-de-pruebas-se-convierte-en-una-fuga-de-datos/) y el generador del [artículo 2](/blog/datos-sinteticos-versus-subset-enmascarado/).

## El principio que resuelve la tensión aparente

Hay una tensión que parece irreductible: *para depurar necesito contexto; el contexto son datos.*

Se resuelve con una observación: **casi nunca necesitás el dato. Necesitás poder llegar al dato.**

Cuando investigás un fallo, no necesitás que el log diga `titular: Ficticio Pérez, documento: XX-00012345`. Necesitás poder responder *"¿qué transferencia fue?"* y, si el caso lo amerita y tenés autorización, ir a la base a mirar. El log necesita el **identificador**, no el **contenido**.

De ahí sale la regla que ordena todo el artículo:

> **Los identificadores viajan por la telemetría. Los datos personales, no.**
> `traceId`, `correlationId`, `transferId`, `accountId` (pseudónimo) → sí.
> `holderName`, `taxId`, `email`, `balanceMinor` (valor exacto), `token` → no.

Esto **no** te deja sin capacidad de depuración. Te obliga a que el acceso al dato pase por un sistema que registra quién lo miró. Que es exactamente lo que querías.

<figure class="diagram">
  <img src="/blog/diagrams/telemetria-artefactos-de-ci-y-retencion-sin-pii-1.svg" width="1604" height="631" alt="Diagrama: telemetria-artefactos-de-ci-y-retencion-sin-pii (1)" loading="lazy" decoding="async" />
</figure>

El identificador atraviesa todo; el dato no atraviesa nada. Y cuando alguien necesita el dato de verdad, llega a él **por un camino que deja registro**.

## El contrato de telemetría

Un contrato de telemetría declara qué campos pueden aparecer en cada salida. Es un documento y **un control automatizado**.

```yaml
# docs/privacy/telemetry-contract.yaml — ficticio.
version: 1.0.0

# Campos permitidos en logs, trazas y metricas.
allowed:
  identifiers:
    - traceId
    - spanId
    - correlationId
    - transferId
    - accountId          # pseudonimo, ver data-inventory.md
    - eventId
    - ruleSetVersion
  technical:
    - httpMethod
    - httpStatusCode
    - errorType          # la CLASE de la excepcion, no su mensaje
    - durationMs
    - version
  business_safe:
    - currency
    - transferStatus
    - amountBucket       # "0-100", "100-1000". El bucket, NO el valor exacto.

# Campos PROHIBIDOS en cualquier salida de telemetria.
denied:
  - holderName
  - taxId
  - email
  - phoneNumber
  - ipAddress
  - deviceFingerprint
  - balanceMinor         # el saldo exacto es confidencial
  - amountMinor          # el importe exacto identifica una transferencia
  - authorizationHeader
  - idempotencyKey       # elegida por el cliente; puede contener cualquier cosa
  - "*.password"
  - "*.token"
  - "*.secret"

# Reglas estructurales
rules:
  - id: no-free-text-in-logs
    description: >
      El mensaje de log es una PLANTILLA CONSTANTE. Los valores van como
      campos estructurados, nunca interpolados en el texto.
  - id: no-exception-messages
    description: >
      Se loguea la clase de la excepcion, no getMessage(): el mensaje suele
      incluir el valor que causo el error.
  - id: metric-labels-bounded
    description: >
      Toda etiqueta de metrica debe tener cardinalidad acotada y conocida.
      Prohibido cualquier identificador de entidad como label.
```

Cuatro entradas de esa lista merecen justificación, porque sorprenden:

- **`amountMinor` está prohibido.** El importe exacto de una transferencia, combinado con una marca de tiempo, identifica esa transferencia de forma casi única. Y a menudo, a la persona. Para depurar alcanza con el `transferId`; si querés una señal de magnitud, usá `amountBucket`.
- **`idempotencyKey` está prohibido.** La elige el cliente. Nada garantiza que sea un UUID: un cliente descuidado puede usar el número de documento. No podés controlar el contenido de un campo que no generás vos.
- **`errorType`, no `getMessage()`.** El mensaje de una excepción incluye, casi siempre, el valor que la causó. `Invalid tax ID: XX-00012345` es un log que filtra exactamente el dato que querías proteger. Logueá `IllegalArgumentException` y el `transferId`.
- **`ipAddress` está prohibido en telemetría** aunque sea necesaria para antifraude. Ahí vive en un sistema clasificado, con retención propia y accesos registrados; no en el log de aplicación que va a un índice de búsqueda que consulta medio equipo.

## Logging estructurado que no filtra

```java
// INCORRECTO. Tres problemas en dos lineas.
log.info("Transferencia rechazada para " + user.getName()
         + " documento " + user.getTaxId()
         + ": " + e.getMessage());
```

1. Interpola datos personales en el texto libre. Ningún filtro basado en nombre de campo lo va a encontrar.
2. `e.getMessage()` puede contener el valor que falló.
3. El mensaje no es constante, así que no podés agrupar estos logs ni alertar sobre ellos.

```java
// CORRECTO. Mensaje constante, valores como campos estructurados.
// El traceId y el spanId los inyecta el MDC desde el contexto de OpenTelemetry.
log.atInfo()
   .setMessage("transfer.rejected")           // constante: agrupa y alerta
   .addKeyValue("transferId", transfer.id())  // identificador: permite llegar al dato
   .addKeyValue("accountId", account.id())    // pseudonimo
   .addKeyValue("reasonCode", rejection.reasonCode())
   .addKeyValue("ruleSetVersion", rules.version())
   .addKeyValue("errorType", e.getClass().getSimpleName())  // NO getMessage()
   .log();
```

Con eso podés: agrupar por `reasonCode`, alertar sobre `transfer.rejected`, seguir el `traceId` hasta el request, y —si tenés autorización— consultar la base por `transferId` para ver el nombre. **Perdiste cero capacidad de diagnóstico y no transportaste un solo dato personal.**

### El filtro es una red, no la solución

Podés agregar un filtro en el appender que redacte patrones. Hacelo. Es una **red de seguridad**, no un control.

**Por qué no alcanza:** un filtro basado en regex encuentra lo que sabés buscar. No encuentra un nombre propio en un campo de texto libre, ni un documento con un formato que no anticipaste, ni un dato personal dentro de un JSON serializado en un campo `payload`.

**El control real es estructural:** el mensaje es constante y los valores son campos declarados. Si el desarrollador tiene que escribir `.addKeyValue("holderName", ...)` explícitamente, el problema se ve en el code review. Si escribe `"... " + user`, no se ve nunca.

## Trazas: allowlist, no denylist

En trazas la tentación es peor, porque los SDKs de instrumentación automática capturan mucho. Varios APM, por defecto, capturan **bodies de requests y responses**.

**Regla:** los atributos de span se agregan por **allowlist explícita**. Nunca "capturá todo y filtrá lo malo". Una denylist falla en silencio ante lo que no anticipaste; una allowlist falla ruidosamente ante lo que no declaraste, y eso es lo que querés.

```java
// Solo lo que el contrato de telemetria permite.
span.setAttribute("nexo.transfer.id", transfer.id());
span.setAttribute("nexo.transfer.status", transfer.status().name());
span.setAttribute("nexo.transfer.amount_bucket", bucket(transfer.amountMinor()));
span.setAttribute("nexo.rule_set.version", rules.version());

// PROHIBIDO, aunque sea comodo:
// span.setAttribute("http.request.body", requestBody);
// span.setAttribute("nexo.account.holder", account.holderName());
```

Y una advertencia de estado, verificada al 2026-07-10: las *semantic conventions* de **messaging** de OpenTelemetry siguen en `Development` (semconv 1.43.0). Si estás instrumentando el consumidor de eventos del [capítulo 01](/blog/coleccion/a01/), no asumas que los atributos `messaging.*` son estables. Usá `OTEL_SEMCONV_STABILITY_OPT_IN` si necesitás una transición controlada.

## Métricas: cardinalidad y privacidad son el mismo problema

Poner `user_id` como etiqueta de una métrica tiene dos consecuencias simultáneas:

- **Privacidad:** guardaste un identificador personal en el almacén de métricas, que probablemente nadie clasificó, con retención larga y acceso amplio.
- **Costo:** cada valor distinto de una etiqueta crea una **serie temporal** nueva. Un millón de usuarios son un millón de series. El sistema de métricas se degrada o se cae.

Es el ejemplo perfecto de que privacidad y [FinOps](/blog/coleccion/a06/) apuntan al mismo control.

```java
// PROHIBIDO: cardinalidad no acotada + dato personal.
meter.counterBuilder("nexo.transfers")
     .build()
     .add(1, Attributes.of(stringKey("user_id"), user.id()));       // NO

// CORRECTO: etiquetas de cardinalidad acotada y conocida.
meter.counterBuilder("nexo.transfers")
     .build()
     .add(1, Attributes.of(
         stringKey("status"),   transfer.status().name(),   // ~5 valores
         stringKey("currency"), transfer.currency(),        // ~10 valores
         stringKey("version"),  appVersion));               // ~3 valores en un canary
```

**Regla operativa:** toda etiqueta debe tener un conjunto de valores **enumerable y escrito**. Si no podés listar los valores posibles, no es una etiqueta: es un campo de log.

## Artefactos de CI: screenshots, reportes y trazas de red

Acá está el vector que más se subestima, porque los artefactos parecen efímeros y no lo son.

| Artefacto | Qué filtra | Control |
|---|---|---|
| **Screenshot de UI al fallar** | Toda la pantalla: nombres, saldos, documentos | Datos sintéticos + retención corta |
| **Grabación de video** | Lo mismo, en movimiento | Desactivado por defecto |
| **Trazas de red (HAR)** | Headers de autorización, bodies completos | **Nunca** subir sin sanear |
| **Reporte de test** | El body del response en el mensaje de aserción | Redacción en el reporter |
| **Volcado de la base al fallar** | Todo | Prohibido |
| **Logs del contenedor** | Lo que el contrato no evitó | Retención corta |

### La regla que hace todo esto tratable

> **Si tus tests corren contra datos sintéticos, un screenshot no es una fuga de datos.**

Esa es la razón por la que el [artículo 2](/blog/datos-sinteticos-versus-subset-enmascarado/) importa tanto. Los controles sobre artefactos son mitigaciones de segundo orden; **el control de primer orden es que no haya nada que filtrar**.

Aun así, defensa en profundidad:

- **Retención corta y explícita.** Los artefactos de un pipeline exitoso no le sirven a nadie después de unos días. Los de un pipeline fallido, tampoco después de que se arregló. Un TTL de 7 días es defendible; "para siempre" nunca lo es.
- **Un `expire_in` por artefacto**, no uno global. Los reportes de cobertura y los screenshots no necesitan la misma vida.
- **Los HAR nunca se suben.** Contienen headers de autorización. Si necesitás uno para depurar, generalo localmente.
- **Marcá los artefactos con la clasificación de datos que contienen.** Si un artefacto de CI puede contener datos de una copia de producción, no es un artefacto de CI: es un dato de producción en un lugar equivocado.

## La prueba que falla ante un patrón prohibido

Este es el artefacto más valioso del artículo, porque convierte una política en un control ejecutable.

```java
// Pseudocodigo didactico.
// Los patrones son SINTETICOS y no coinciden con formatos reales de ninguna jurisdiccion.
class TelemetryPrivacyTest {

    // Se derivan de docs/privacy/telemetry-contract.yaml: una sola fuente de verdad.
    private static final Map<String, Pattern> FORBIDDEN = Map.of(
        "documento_sintetico", Pattern.compile("\\bXX-\\d{8}\\b"),
        "email",               Pattern.compile("[\\w.+-]+@[\\w-]+\\.[\\w.]+"),
        "bearer_token",        Pattern.compile("(?i)bearer\\s+[A-Za-z0-9._-]{10,}"),
        "campo_prohibido",     Pattern.compile("(?i)\"(holderName|taxId|password|token|secret)\"\\s*:")
    );

    @Test
    void elResponseDeTransferenciaNoContieneDatosProhibidos() {
        String body = api.get("/transfers/tr_00001").body();
        assertNoForbiddenPatterns(body, "response de GET /transfers/{id}");
    }

    @Test
    void losLogsGeneradosDuranteElJourneyNoContienenDatosProhibidos() {
        // Captura los logs emitidos durante el journey completo, incluidos
        // los de los caminos de ERROR: es donde mas se filtra.
        try (LogCapture logs = LogCapture.attachToRoot()) {
            journey.crearTransferenciaConBeneficiarioInvalido();   // camino de error
            journey.crearTransferenciaExitosa();                   // camino feliz
            assertNoForbiddenPatterns(logs.allText(), "logs del journey");
        }
    }

    @Test
    void losAtributosDeSpanEstanEnLaAllowlist() {
        List<SpanData> spans = tracing.capture(journey::crearTransferenciaExitosa);
        for (SpanData span : spans) {
            for (String key : span.getAttributes().asMap().keySet()) {
                assertThat(ALLOWED_SPAN_ATTRIBUTES)
                    .as("atributo de span no declarado en el contrato: %s", key)
                    .contains(key);
            }
        }
    }

    private void assertNoForbiddenPatterns(String text, String where) {
        FORBIDDEN.forEach((name, pattern) -> {
            Matcher m = pattern.matcher(text);
            // NUNCA imprimir el valor encontrado: reportar ubicacion y tipo.
            assertThat(m.find())
                .as("patron prohibido '%s' encontrado en %s (posicion oculta a proposito)",
                    name, where)
                .isFalse();
        });
    }
}
```

Cuatro decisiones que hacen que este test sirva:

- **Los patrones se derivan del contrato de telemetría**, no se escriben dos veces. Una sola fuente de verdad, o divergen en tres semanas.
- **El camino de error se ejercita.** Ahí es donde se filtra: el happy path suele estar limpio porque alguien lo miró.
- **El test de spans usa allowlist.** Un atributo nuevo que nadie declaró rompe el test. Es exactamente el comportamiento deseado.
- **El mensaje de fallo no imprime el valor encontrado.** Si lo imprimiera, el dato personal terminaría en el reporte del test, que es un artefacto de CI. Reportá **ubicación y tipo, nunca el valor**. Es la misma regla que aplicás cuando encontrás un secreto en un repositorio.

## Retención y borrado

La matriz de retención responde cuatro preguntas por cada almacén: qué guarda, cuánto, quién lo borra, y **cuándo se ensayó el borrado**.

| Almacén | Contenido | Retención | Quién borra | Último ensayo |
|---|---|---|---|---|
| Logs de aplicación | Identificadores, sin PII | 30 días | Automático | `<fecha>` |
| Trazas | Atributos de allowlist | 7 días | Automático | `<fecha>` |
| Métricas | Etiquetas acotadas | 13 meses | Automático | `<fecha>` |
| Artefactos de CI | Reportes, screenshots sintéticos | 7 días | Automático | `<fecha>` |
| Base de datos de test | Datos sintéticos | Hasta el próximo reset | `make reset-test-data` | `<fecha>` |
| Backups de test | — | **No se hacen** | — | — |

La última fila es una decisión, no un olvido: **un entorno de test cuyos datos se regeneran con `--seed 42` no necesita backup.** Y un backup de datos de prueba es una copia más que nadie inventaría, y de la que nadie se acuerda. No hacerlo es el control.

La columna "último ensayo" es la que convierte la matriz en algo verificable. Un borrado automático que nunca nadie comprobó es un cron que puede llevar seis meses fallando en silencio.

## Anti-patrones

- **Interpolar valores en el mensaje de log.** *Alternativa:* mensaje constante + campos estructurados.
- **Loguear `e.getMessage()`.** *Consecuencia:* filtrás el valor que causó el error. *Alternativa:* `e.getClass().getSimpleName()` + identificadores.
- **Denylist de atributos de span.** *Consecuencia:* falla en silencio ante lo que no anticipaste. *Alternativa:* allowlist que rompe ruidosamente.
- **`user_id` como etiqueta de métrica.** *Consecuencia:* explosión de cardinalidad **y** dato personal. *Alternativa:* etiquetas enumerables.
- **`amountMinor` en telemetría.** *Consecuencia:* importe + timestamp identifica la transferencia. *Alternativa:* `amountBucket`.
- **Confiar en el filtro del appender.** *Consecuencia:* es una red de seguridad, no un control; no ve lo que no anticipaste. *Alternativa:* control estructural en el punto de escritura.
- **Subir HAR o volcados de red a los artefactos.** *Consecuencia:* headers de autorización públicos. *Alternativa:* nunca.
- **Screenshots sin retención.** *Alternativa:* TTL por artefacto.
- **Que el test de privacidad imprima el valor encontrado.** *Consecuencia:* el dato termina en el reporte de CI. *Alternativa:* ubicación y tipo.
- **Backups del entorno de test.** *Consecuencia:* una copia que nadie inventaría. *Alternativa:* no hacerlos; regenerar con la semilla.
- **Borrado automático nunca ensayado.** *Alternativa:* ensayo con fecha registrada.

## Qué publicar en GitHub

```text
docs/privacy/telemetry-contract.yaml    # allowed / denied / rules
docs/privacy/retention-matrix.md        # con la columna "último ensayo"
tests/privacy/TelemetryPrivacyTest.java # el test de arriba
.gitlab-ci.yml                          # expire_in por artefacto, no global
```

## Qué aprendimos / próximos pasos

- Los identificadores viajan por la telemetría; los datos personales, no. No perdés capacidad de diagnóstico: ganás un registro de accesos.
- El control es **estructural** (mensaje constante, campos declarados, allowlist). El filtro es una red.
- Cardinalidad y privacidad son el mismo problema en las métricas.
- Si tus tests corren contra datos sintéticos, un screenshot deja de ser una fuga.
- Un test de privacidad que imprime el hallazgo es una fuga nueva.
- Una retención automática nunca ensayada es un cron que puede llevar meses roto.

**Cierre del capítulo.** Con los datos clasificados, generados y contenidos, el siguiente paso es preguntarse si esos datos **dicen la verdad**: [data quality, lineage y reconciliación](/blog/coleccion/a05/).

## Checklist final

- [ ] Existe un contrato de telemetría con listas `allowed` y `denied`.
- [ ] Los mensajes de log son constantes; los valores van estructurados.
- [ ] No se loguean mensajes de excepción, solo la clase.
- [ ] Los atributos de span se agregan por allowlist, y un test lo verifica.
- [ ] Toda etiqueta de métrica tiene un conjunto de valores enumerable y escrito.
- [ ] `amountMinor` e `idempotencyKey` no aparecen en telemetría.
- [ ] Existe un test que falla ante un patrón prohibido en logs y responses, y que **ejercita el camino de error**.
- [ ] Ese test reporta ubicación y tipo, **nunca el valor**.
- [ ] Cada artefacto de CI tiene su propio `expire_in`.
- [ ] Los HAR nunca se suben.
- [ ] La matriz de retención tiene la columna "último ensayo" y está completa.
- [ ] No se hacen backups del entorno de test.

---

## Fuentes (consultadas 2026-07-10)

- [OWASP Logging Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html)
- [OpenTelemetry — Security](https://opentelemetry.io/docs/security/)
- [OpenTelemetry semantic conventions 1.43.0](https://opentelemetry.io/docs/specs/semconv/) — messaging en estado `Development`.
- [NIST Privacy Framework](https://www.nist.gov/privacy-framework) — versión **1.0** final.
- [Verificación de fuentes de la serie](/blog/verificacion-de-fuentes-serie-avanzada/)
