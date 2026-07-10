---
title: "Datos aislados y paralelismo seguro: correr rápido sin contaminarte"
description: "Paralelismo que no rompe: datos sintéticos por API, contexto de test inmutable, recursos con nombres únicos y capacidad medida. Guía Java para suites E2E."
pubDate: 2026-07-09
tags: ["paralelismo", "test-data", "aislamiento", "java", "ci-cd"]
cluster: "03"
clusterTitle: "Framework engineering para automatización"
type: "satelite"
order: 3
icon: "bot"
iconHue: 210
readingLevel: "Intermedio–Avanzado"
prerequisites: "QA Automation / SDET"
---
> **Subtítulo:** Builders sintéticos, preparación por API, contexto inmutable y aislamiento de recursos para que la concurrencia no te devuelva rojos falsos.

**Fecha de verificación de fuentes:** 2026-07-09.

---

## Resumen ejecutivo

- El paralelismo no crea bugs de contaminación: los **expone**. Si dos tests comparten estado, correrlos juntos revela el problema que ya estaba.
- Preparar datos por **API** (no por UI) es más rápido, más determinista y desacopla la preparación del flujo bajo prueba.
- Cada ejecución debe tener **datos y recursos con nombres únicos**: usuarios, cuentas, archivos, puertos. Nada compartido, nada permanente.
- El paralelismo se configura por **capacidad medida**, no por el máximo de cores disponibles.
- El aislamiento tiene **costo** (más datos sintéticos, más setup); no lo pagues donde no aporta.

## Nota de alcance

Guía de diseño con ejemplos ilustrativos. No cubre implementación productiva de autenticación ni gestión real de secretos. Nexo Finanzas es ficticio: cuentas, montos e identificadores son sintéticos. No usar datos, PII ni credenciales reales como fixtures.

---

## 1. El rojo falso de las 2 a. m.

La suite de Nexo Finanzas pasó de 1 a 4 workers para bajar el tiempo de 55 a 15 minutos. Al día siguiente, tests que nunca fallaban empezaron a fallar de forma intermitente. La causa: dos tests usaban la cuenta compartida `usuario_qa_007`. Uno hacía una transferencia que bajaba el saldo; el otro asumía saldo disponible. En serie nunca chocaban; en paralelo, sí.

Este es el patrón: **el paralelismo no rompió nada; hizo visible un acoplamiento de estado que ya existía**. La solución no es "volver a 1 worker": es diseñar para el aislamiento.

## 2. Preparar datos por API, no por UI

Si el objetivo del test es **la transferencia por UI**, no tiene sentido crear la cuenta y el destinatario haciendo clic por la UI de alta. Eso es lento, frágil y mezcla dos flujos. La preparación se hace por API.

```java
// Ilustrativo. Builder de datos sintéticos + preparación por API.
TransferDraft draft = TransferDraft.builder()
    .source(accounts.createFunded("USD", new BigDecimal("100.00"))) // API, no UI
    .destination(payees.createEnabled("USD"))
    .amount(new BigDecimal("10.00"))
    .build();
```

**Análisis por bloques:**

- **Responsabilidad:** `accounts.createFunded(...)` y `payees.createEnabled(...)` llaman a `nexo-transfer-api` para crear entidades sintéticas listas. El test se concentra en el envío.
- **Precondición:** existe un endpoint de preparación (idealmente solo en ambientes de prueba) que crea datos sin efectos colaterales de producción.
- **Evidencia:** el `draft` guarda los identificadores generados; se registran junto a la evidencia del test para reproducir.
- **Limitación:** requiere que la API de preparación exista y esté mantenida. Construirla es trabajo real; el retorno es velocidad y determinismo.
- **Alternativa:** si no hay API de preparación, un *seed* controlado por ejecución es aceptable como paso intermedio, pero evitá cuentas permanentes compartidas.

> **Anti-patrón:** automatizar el alta de cuenta por UI en cada test de transferencia. Reproduce trabajo, acopla flujos y multiplica puntos de fractura. La alternativa (API) también sirve para **verificar** sin UI cuando la UI no es el objetivo.

## 3. Datos y recursos con nombres únicos por ejecución

El aislamiento se logra cuando **nada se comparte entre ejecuciones concurrentes**. Cada worker crea sus propias entidades con identificadores únicos.

<figure class="diagram">
  <img src="/blog/diagrams/datos-aislados-paralelismo-seguro-1.svg" alt="Diagrama: datos-aislados-paralelismo-seguro (1)" loading="lazy" decoding="async" />
</figure>

**Cómo leer el diagrama:** ambos workers usan la misma aplicación, pero **cada uno tiene su propio conjunto de datos y recursos**, nombrados con un identificador de ejecución (`run-a1`, `run-b2`). No hay cuenta compartida, ni archivo de salida común, ni puerto fijo colisionable. El ambiente es compartido; el estado del test no.

Reglas prácticas:

- **Identificador de ejecución único** (`runId`) que prefija datos, archivos y nombres de recurso.
- **Nada de cuentas "permanentes"** reutilizadas entre corridas.
- **Limpieza determinista**: cada test borra o marca lo que creó; y hay un barrido periódico para lo que quedó huérfano por fallos.
- **Masking**: si algún dato sintético se parece a PII, enmascararlo en logs y evidencia (ver [artículo de evidencia](/blog/confiabilidad-diagnostico-flakiness-evidencia/)).

## 4. Contexto de test inmutable

La configuración por perfil se declara, no se hardcodea. Ejemplo de perfiles:

```yaml
# config/test-profiles.yml — ilustrativo
profiles:
  local:
    baseUrl: "http://localhost:8080"
    browser: "chrome"
    parallelWorkers: 1
  ci:
    baseUrl: "${NEXO_BASE_URL}"
    browser: "chrome-headless"
    parallelWorkers: "${CI_WORKERS}"
    evidence:
      screenshotOnFailure: true
      sanitizedLogs: true
```

Y un `TestContext` **inmutable** que cada worker recibe con su perfil, su `runId` y su `correlationId`:

```java
// Ilustrativo. Pseudocódigo Java (record inmutable).
public record TestContext(
    Profile profile,
    String runId,          // unico por ejecucion de test
    String correlationId,  // se propaga a logs/trazas del backend
    EvidencePolicy evidence) {

  public static TestContext bootstrap(Profile profile) {
    // Las variables de entorno se VALIDAN al inicio: si falta NEXO_BASE_URL, falla acá.
    requireResolved(profile.baseUrl());
    String runId = "run-" + ShortId.random();
    return new TestContext(profile, runId, "corr-" + runId, profile.evidence());
  }
}
```

**Análisis por bloques:**

- **Inmutabilidad:** un `record` sin setters evita que un test le pise la configuración a otro en paralelo. El contexto se crea una vez y se pasa hacia abajo.
- **Validación temprana:** `requireResolved(...)` falla al inicio si falta una variable, en vez de dar un error críptico a mitad del journey. Fail-fast con mensaje claro.
- **Correlation-id:** se genera acá y se propaga; es la costura entre el test y la telemetría del backend (ver [artículo 4](/blog/confiabilidad-diagnostico-flakiness-evidencia/)).
- **Seguridad:** el `.env.example` documenta las variables **sin valores** (no contiene secretos). Los secretos reales se inyectan en CI por el gestor de secretos de la plataforma.

## 5. Alcance del driver y estado por thread

En web con Selenium, el error clásico es un `WebDriver` estático compartido entre tests que corren en paralelo: se pisan la sesión y el resultado es ruido. Dos estrategias válidas:

- **Driver por test:** cada test crea y cierra su propio `WebDriver`. Simple y robusto; cuesta tiempo de arranque.
- **`ThreadLocal<WebDriver>` o inyección de contexto:** cuando el runner asigna un thread por test (por ejemplo, Cucumber con ejecución paralela o Surefire/Failsafe con `parallel`), un driver por thread evita colisiones. Verificá la configuración vigente en la [documentación de Cucumber sobre ejecución paralela](https://cucumber.io/docs/guides/parallel-execution/) y en [Maven Failsafe — fork options y ejecución paralela](https://maven.apache.org/surefire/maven-failsafe-plugin/examples/fork-options-and-parallel-execution.html).

```java
// Ilustrativo. Un driver por thread; se libera al terminar.
public final class Drivers {
  private static final ThreadLocal<WebDriver> TL = new ThreadLocal<>();

  public static WebDriver get() { return TL.get(); }

  public static void open(TestContext ctx) {
    TL.set(WebDriverFactory.create(ctx.profile().browser())); // Selenium Manager provee el driver binario
    // Selenium 4 gestiona los drivers de navegador automaticamente (Selenium Manager).
  }

  public static void quit() {
    WebDriver d = TL.get();
    if (d != null) { d.quit(); TL.remove(); } // remove() evita fugas entre reusos de thread
  }
}
```

> **Nota de vigencia:** desde Selenium 4, **Selenium Manager** descarga y configura los drivers de navegador automáticamente, por lo que ya no hace falta gestionar binarios a mano en la mayoría de los casos ([Selenium docs](https://www.selenium.dev/documentation/), consultado 2026-07-09). El `TL.remove()` es importante: los pools de threads reutilizan hilos, y un `ThreadLocal` sin limpiar filtra el driver anterior.

## 6. Capacidad medida, no máximo disponible

Subir `parallelWorkers` al número de cores no garantiza ir más rápido: si el ambiente de aplicación no aguanta la carga, aparecen timeouts y flakiness que parecen bugs de test pero son de capacidad. La regla:

- Empezá con pocos workers y **medí** tiempo total y tasa de fallos por concurrencia.
- Subí de a poco hasta que el tiempo deje de mejorar o la flakiness suba. Ese es tu techo real.
- Recordá el default de Failsafe/Surefire: `forkCount=1`, `reuseForks=true` crea un JVM que corre todos los tests del módulo; ajustá `forkCount` y `parallel` con criterio ([Failsafe fork options](https://maven.apache.org/surefire/maven-failsafe-plugin/examples/fork-options-and-parallel-execution.html)).
- Para **sharding** entre máquinas de CI, repartí por journeys/archivos con nombres de recurso únicos por shard, no por cuenta compartida.

> **Trade-off:** más paralelismo = menos tiempo de feedback pero más presión sobre el ambiente y más datos sintéticos generados. El punto óptimo se mide, no se asume. No prometas "paralelismo sin costo".

## 7. Dependencias efímeras con Testcontainers (cuándo sí)

Cuando un test de integración necesita una dependencia real y descartable (una base de datos, un broker, un stub de servicio), **Testcontainers** levanta contenedores efímeros por ejecución, evitando estado compartido entre corridas ([Testcontainers for Java](https://java.testcontainers.org/), consultado 2026-07-09; versión mayor actual 2.x).

- **Cuándo conviene:** integración donde querés una dependencia real aislada y reproducible, sin un ambiente compartido que otros tests contaminen.
- **Cuándo no:** para journeys E2E completos sobre la app desplegada, donde el ambiente ya existe; o cuando el costo de arranque de contenedores supera el beneficio. Cada contenedor cuesta tiempo y recursos.

> **Decisión razonada, no default:** Testcontainers es excelente para integración, pero no es "la" forma de correr todo. Ponerlo en la arquitectura "porque es popular" es un anti-patrón; justificá cada dependencia efímera por costo/tiempo.

## 8. Anti-patrones y salidas

| Anti-patrón | Consecuencia | Alternativa concreta |
|---|---|---|
| Cuentas/datos compartidos y permanentes | Rojos falsos en paralelo; contaminación | Datos sintéticos por `runId`, creados por API |
| Preparar todo por UI | Lento, frágil, mezcla flujos | Preparación y verificación por API cuando la UI no es el objetivo |
| `WebDriver` estático compartido | Sesiones que se pisan | Driver por test o `ThreadLocal` con `remove()` |
| Paralelismo al máximo de cores | Timeouts que parecen bugs de test | Capacidad medida incrementalmente |
| Puertos/archivos con nombres fijos | Colisiones entre workers | Nombres únicos por ejecución/shard |
| Limpieza no determinista | Datos huérfanos que ensucian corridas futuras | Cleanup por test + barrido periódico |

## Qué aprendimos y próximos pasos

El paralelismo es un amplificador: multiplica la velocidad y también cualquier estado compartido que hayas dejado pasar. Diseñar para el aislamiento —datos sintéticos por API, contexto inmutable, recursos con nombres únicos y capacidad medida— es lo que hace que "correr más rápido" no signifique "fallar más seguido". Y como todo, tiene un costo: pagalo donde el riesgo lo justifique.

Continuá con:

- Cómo el `correlationId` de esta guía se convierte en evidencia para diagnosticar → [Confiabilidad y diagnóstico](/blog/confiabilidad-diagnostico-flakiness-evidencia/).
- Dónde encaja todo esto en la arquitectura del framework → [Framework engineering: tu suite es un producto interno](/blog/framework-engineering-suite-producto-interno/).

## Checklist final

- [ ] Preparo datos por API cuando la UI no es el objetivo del test.
- [ ] Cada ejecución usa datos y recursos con nombres únicos (`runId`).
- [ ] No hay cuentas permanentes compartidas entre corridas.
- [ ] Mi `TestContext` es inmutable y valida variables al inicio.
- [ ] El driver es por test o por thread, con limpieza (`remove()`).
- [ ] Fijé `parallelWorkers` por capacidad medida, no por cores.
- [ ] La limpieza es determinista y hay barrido de huérfanos.

---

*Prerrequisitos: colecciones e inmutabilidad en Java (`record`), Maven/Gradle, HTTP/JSON y APIs, variables de entorno, Docker y concurrencia básica (procesos aislados, recursos compartidos). Enlazamos documentación oficial junto a cada API; no reemplaza esos manuales.*

