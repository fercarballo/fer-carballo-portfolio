---
title: "Framework engineering: tu suite de tests es un producto interno"
description: "Diseñá tu framework de automatización como producto interno: capas, contratos, datos, paralelismo y gobierno. Guía Java para QA con criterio senior."
pubDate: 2026-07-09
tags: ["test-automation", "sdet", "framework-engineering", "java", "quality-engineering"]
cluster: "03"
clusterTitle: "Framework engineering para automatización"
type: "pilar"
order: 1
icon: "bot"
iconHue: 210
readingLevel: "Intermedio"
prerequisites: "QA Automation con Java básico/intermedio; líderes técnicos"
---
> **Subtítulo:** Cómo diseñar automatización mantenible con contratos internos, capas explícitas y gobierno técnico, usando el caso ficticio Nexo Finanzas.

**Fecha de verificación de fuentes:** 2026-07-09.

---

## Resumen ejecutivo

- Un framework de automatización sostenible es una **plataforma interna con interfaces pequeñas y explícitas**, no una carpeta de `PageObjects` ni una `BaseTest` que todo lo sabe.
- Sus principios operativos son seis: **intención de negocio, encapsulación de lo volátil, determinismo, observabilidad, seguridad y extensibilidad**.
- Se diseña **desde riesgos y flujos**, decidiendo qué se verifica por API, qué por UI y qué es genuinamente cross-channel, no desde una estructura de carpetas heredada.
- La **arquitectura modular con dependencias dirigidas** (los escenarios no importan Selenium) es lo que permite que personas nuevas agreguen un journey sin romper el resto.
- El **gobierno técnico** (ADRs, guía de contribución, versionado de dependencias, revisión de arquitectura) es parte del producto, no un extra opcional.
- Ninguna herramienta es "la mejor": Selenium, Appium, Cucumber o una low-code son **decisiones con trade-offs** que dependen de producto, equipo y costo de mantenimiento.

## Nota de alcance

Este artículo es una guía de diseño con ejemplos ilustrativos. **No sustituye** la documentación oficial de las herramientas citadas, ni guía de seguridad de aplicaciones, accesibilidad, arquitectura de producto o cumplimiento regulatorio. Los fragmentos de código muestran forma y responsabilidad, no configuración lista para producción. **Nexo Finanzas** es un caso ficticio: todos los datos, cuentas y montos son sintéticos.

---

## 1. Cuando la suite deja de ser un activo

El equipo de Nexo Finanzas tiene 300 tests end-to-end sobre el home banking. Los síntomas son conocidos:

- La suite tarda 55 minutos y nadie mira el reporte hasta la mañana siguiente.
- Hay `Thread.sleep(3000)` sembrados "por las dudas" en decenas de archivos.
- Dos tests comparten la cuenta `usuario_qa_007`; si corren en paralelo, uno le cambia el saldo al otro.
- Cuando algo falla, el reporte dice `element not found` sin screenshot, sin log correlacionado, sin forma de saber si fue el producto, el ambiente o el propio test.
- El módulo `BaseTest` tiene 1.400 líneas, conoce la UI, la base de datos, los secretos y el reporting. Nadie quiere tocarlo.

Cuando una suite llega a este punto, dejó de ser un activo y pasó a ser un pasivo: cuesta más de lo que informa. El problema casi nunca es "falta de tests"; es **falta de ingeniería del framework**. Eso es lo que este artículo aborda.

El journey que usaremos como hilo conductor es una **transferencia a terceros**: la persona elige cuenta origen y destino, ingresa un monto, envía y recibe un comprobante con un identificador. Es un flujo con reglas de negocio, estado asíncrono, datos sensibles y múltiples canales (web, mobile, API). Ideal para mostrar decisiones.

## 2. Qué es framework engineering (y qué no)

Conviene separar cuatro cosas que suelen confundirse:

| Concepto | Qué es | Ejemplo en Nexo |
|---|---|---|
| **Test framework** | El runner y su ciclo de vida | JUnit / Cucumber ejecutando escenarios |
| **Biblioteca de soporte** | Utilidades reutilizables | Builders de datos, adaptadores de página |
| **Plataforma de pruebas** | Ejecución, perfiles, artefactos, CI | `nexo-quality-platform` con paralelismo y reportes |
| **Producto interno** | Todo lo anterior + contratos, gobierno y onboarding | La suite tratada como software que otros consumen |

> **Decisión razonada, no mandato:** llamar "producto interno" a la suite no es marketing. Implica que tiene **usuarios** (quienes escriben y leen tests), **contratos** (interfaces estables entre capas), **versionado**, **documentación** y **deuda técnica administrada**. Si esos elementos no existen, tenés scripts, no una plataforma.

Los **seis principios** que defenderemos:

1. **Intención:** el test expresa qué valida el negocio, no cómo se hace clic.
2. **Encapsulación:** los detalles volátiles (selectores, waits, endpoints) viven detrás de interfaces pequeñas.
3. **Determinismo:** el mismo test con la misma entrada produce el mismo resultado, o falla con diagnóstico.
4. **Observabilidad:** cada ejecución deja evidencia suficiente para clasificar la falla.
5. **Seguridad:** la evidencia no expone PII, credenciales ni tokens.
6. **Extensibilidad:** agregar un journey nuevo es barato y localizado.

## 3. Diseñar desde riesgos y flujos, no desde carpetas

El error fundacional es empezar por "creemos la carpeta `pages/` y `tests/`". Se empieza por preguntas de riesgo:

- ¿Qué pasa si una **transferencia se duplica**? → Riesgo alto, control primario en API/reglas de negocio.
- ¿Qué pasa si el **comprobante no se muestra** tras un envío válido? → Riesgo de experiencia, control en UI.
- ¿Qué pasa si la **wallet mobile pierde sesión** en red inestable? → Riesgo de plataforma, control en adaptador mobile.

De ahí se deriva **qué capa verifica qué**:

- La **API** prepara datos y verifica reglas (idempotencia, límites, estados). Es rápida y determinista.
- La **UI** verifica que el usuario puede completar el journey y ver el resultado correcto.
- El **mobile** verifica comportamiento específico de plataforma (permisos, ciclo de vida, red).
- El **cross-channel** verifica integración mínima entre canales, no una copia masiva de todo.

Criterios de selección de herramienta (decisiones, no reglas universales):

| Necesidad | Candidato | Cuándo conviene | Costo a asumir |
|---|---|---|---|
| Journeys web críticos | Selenium WebDriver | Navegador real, control fino del DOM | Mantenimiento de selectores y sincronización |
| Escenarios de negocio como documentación | Cucumber/BDD | Los ejemplos representan reglas de negocio compartidas con no-técnicos | Overhead de glue y disciplina de Gherkin |
| Tests técnicos de intención | JUnit puro | El lector es técnico y no hace falta lenguaje natural | Menos legible para stakeholders |
| Mobile nativo/híbrido | Appium | Se necesita cobertura de plataforma real | Matriz de dispositivos, tiempos y flakiness de emuladores |
| Dependencias efímeras en integración | Testcontainers | Se quiere un backend/DB descartable y reproducible | Tiempo de arranque y consumo de recursos |

> **Anti-patrón:** duplicar el mismo journey en Selenium, Appium y una herramienta low-code "por las dudas". Cada duplicado se paga en mantenimiento. Duplicá solo cuando el **riesgo por canal** lo justifica y declaralo.

## 4. Arquitectura modular y contratos internos

La propuesta es un conjunto de módulos con **dependencias dirigidas**: cada flecha indica "puede depender de", y lo que no está dibujado está prohibido.

<figure class="diagram">
  <img src="/blog/diagrams/framework-engineering-suite-producto-interno-1.svg" alt="Diagrama: framework-engineering-suite-producto-interno (1)" loading="lazy" decoding="async" />
</figure>

**Cómo leer el diagrama:**

- Los **escenarios** (`SCN`) hablan el lenguaje del negocio y solo conocen **acciones de dominio** (`DOM`) y **oráculos** (`ORA`). No importan `org.openqa.selenium.*`. Ese es el contrato clave.
- Las **acciones de dominio** deciden si un paso se resuelve por **API**, **web** o **mobile**. Son el punto de composición.
- Los **adaptadores** (`WEB`, `MOB`) encapsulan lo volátil: selectores, waits, capacidades de dispositivo. Cambiar de Selenium a otra tecnología web debería tocar `WEB`, no los escenarios.
- **Datos** (`DAT`) y **configuración** (`CFG`) son transversales de bajo nivel; nadie "de arriba" los importa saltándose las capas.
- **Evidencia** (`REP`) recibe eventos de los escenarios y los correlaciona con **observabilidad** (`OBS`).

**Dependencias prohibidas** (las que rompen el diseño):

- `SCN → WEB` directo (el escenario haciendo `driver.findElement`): rompe la intención.
- `WEB → DOM` (el adaptador conociendo reglas de negocio): convierte al Page Object en God Object.
- `ORA → WEB` (los oráculos escarbando el DOM): mezcla verificación con detalle de UI.

> **Cómo se hace cumplir esto en la práctica:** con módulos Maven/Gradle separados y visibilidad de dependencias (por ejemplo, el módulo `e2e-tests` no declara `selenium-java` como dependencia directa). Herramientas como ArchUnit permiten testear reglas de arquitectura, pero **verificá su API vigente** antes de adoptarla; acá la mencionamos como opción, no como requisito.

## 5. Diseñar un lenguaje de prueba que exprese intención

### Page/Screen Object: un adaptador, no un dueño de reglas

El siguiente ejemplo es **ilustrativo** (Java, Selenium 4.x). Muestra un adaptador de página que **no contiene reglas de negocio ni assertions de escenario**.

```java
// Ilustrativo. API verificada contra Selenium 4.45 (docs consultadas 2026-07-09).
public final class TransferPage {
  private final WebDriver driver;
  private final WebDriverWait wait;

  public TransferPage(WebDriver driver, Duration timeout) {
    this.driver = driver;
    this.wait = new WebDriverWait(driver, timeout); // ctor con Duration en Selenium 4
  }

  public TransferPage enter(TransferDraft draft) {
    fillByTestId("source-account", draft.sourceAccountId());
    fillByTestId("destination-account", draft.destinationAccountId());
    fillByTestId("amount", draft.amount().toPlainString());
    return this;
  }

  public ReceiptView submit() {
    driver.findElement(By.cssSelector("[data-testid='submit-transfer']")).click();
    WebElement receipt = wait.until(ExpectedConditions.visibilityOfElementLocated(
        By.cssSelector("[data-testid='transfer-receipt']")));
    return ReceiptView.from(receipt); // devuelve estado, no valida negocio
  }

  private void fillByTestId(String id, String value) {
    WebElement field = wait.until(ExpectedConditions.elementToBeClickable(
        By.cssSelector("[data-testid='" + id + "']")));
    field.clear();
    field.sendKeys(value);
  }
}
```

**Análisis por bloques:**

- **Responsabilidad:** llenar campos y enviar. El método `submit()` devuelve un `ReceiptView` (una representación de estado observable), **no** un `boolean transferOk`. La decisión de si la transferencia es válida es del **test**, no de la página. Así el mismo adaptador sirve para casos felices y de error.
- **Cuándo sí encapsular una comprobación técnica:** el objeto puede esperar a que el comprobante sea *visible* (una condición técnica de sincronización), pero no debe afirmar "el comprobante tiene el monto correcto" (una regla de negocio). La frontera es: *esperar a que la UI esté en estado observable* = técnico; *afirmar qué dice el negocio* = escenario.
- **Precondición:** existe un `data-testid='submit-transfer'` acordado con desarrollo (ver [artículo de selectores](/blog/selectores-sostenibles-contratos-ui/)).
- **Evidencia:** este código no produce evidencia por sí mismo; la observabilidad se agrega en la capa de reporting, no incrustada acá.
- **Revisión de seguridad/robustez:** la concatenación `"[data-testid='" + id + "']"` es segura solo si `id` viene de constantes controladas, no de datos de usuario. En un test es aceptable; documentarlo evita que alguien lo generalice a input no confiable.
- **Actualización ante cambios de API:** el constructor `new WebDriverWait(driver, Duration)` es el vigente en Selenium 4.x; la firma con `long seconds` quedó obsoleta. Verificá siempre contra la [documentación de Selenium](https://www.selenium.dev/documentation/) al copiar snippets viejos. Para el patrón general, ver [Page object models](https://www.selenium.dev/documentation/test_practices/encouraged/page_object_models/).

### Gherkin cuando el escenario es un ejemplo de negocio

```gherkin
Feature: Transferencias a terceros

  Scenario: La persona recibe un comprobante al enviar una transferencia válida
    Given una cuenta de origen sintética con saldo disponible
    And un destinatario sintético habilitado
    When la persona envía 10.00 USD al destinatario
    Then se muestra un comprobante con un identificador de transferencia
    And la API informa el estado PENDING para ese identificador
```

Este escenario es útil porque describe **comportamiento de negocio**, no clicks. Un `step definition` debe ser **delgado**: traduce la intención a acciones de dominio y delega preparación/verificación a la API cuando la UI no es el objetivo.

```java
// Ilustrativo. Cucumber-JVM 7.x (docs consultadas 2026-07-09).
@When("la persona envía {amount} al destinatario")
public void enviaTransferencia(Money amount) {
  ReceiptView receipt = journeys.transfer().send(world.source(), world.payee(), amount);
  world.remember(receipt); // guarda estado para los Then
}

@Then("la API informa el estado PENDING para ese identificador")
public void apiInformaPending() {
  TransferStatus status = transferApi.status(world.lastReceipt().transferId());
  assertThat(status).isEqualTo(TransferStatus.PENDING); // oráculo por API, no por UI
}
```

> **Cuándo NO usar Gherkin:** si el lector es siempre técnico y no hay stakeholders leyendo escenarios, el BDD agrega overhead (glue, mantenimiento de pasos) sin retorno. En ese caso, un test JUnit directo con nombres expresivos es preferible. Confirmá la sintaxis vigente en la [documentación de Cucumber](https://cucumber.io/docs/) y el lifecycle en la [guía de JUnit](https://docs.junit.org/current/user-guide/).

**Anti-patrón de Gherkin:** pasos genéricos tipo `When hago click en "Enviar"` y `Then veo el texto "Éxito"`. Reproducen la UI en lenguaje natural sin aportar semántica de negocio y se rompen con cada rediseño. La alternativa es escribir el paso en términos de **capacidad de producto** ("envía una transferencia válida"), no de interacción.

## 6. Gobernanza: el framework como producto con dueños

Un framework mantenido por una sola persona, sin guía de contribución ni revisión de arquitectura, es un **anti-patrón**: cuando esa persona se va o se satura, la suite se congela. El gobierno mínimo:

- **ADRs (Architecture Decision Records):** un archivo corto por decisión ("por qué preparamos datos por API", "por qué `data-testid` y no XPath"). Documenta el *porqué*, no solo el *qué*.
- **CONTRIBUTING.md:** cómo agregar un journey, convenciones de nombres, cómo correr local vs CI, checklist de PR.
- **Revisión de PR con foco de arquitectura:** ¿el escenario importa detalles de UI? ¿el Page Object ganó una assertion de negocio? ¿el selector es frágil?
- **Política de versiones de dependencias:** actualizar Selenium/JUnit/Cucumber/Appium es trabajo planificado, no una emergencia. A julio de 2026, por ejemplo, coexisten **JUnit 6.0** (baseline Java 17) y **JUnit 5.14.x** (runtime Java 8+); migrar tiene costo y beneficio que conviene registrar en un ADR ([release notes JUnit](https://docs.junit.org/current/release-notes/)).
- **Debt backlog visible:** los tests flaky y las abstracciones dudosas son tickets priorizados, no comentarios `// TODO`.

### Medir la suite como producto

No se gobierna lo que no se mide, pero medir mal es peor que no medir. Nada de "porcentajes mágicos": cada indicador necesita fórmula, fuente, ventana, sesgo, dueño y **la decisión que habilita**.

| Indicador | Fórmula | Ventana | Sesgo a vigilar | Decisión que habilita |
|---|---|---|---|---|
| Tiempo de feedback p50/p95 | Desde trigger de PR hasta evidencia de la capa | Por PR | Mezclar suites rápidas con nightly infla el p95 | Repartir o paralelizar suites lentas |
| Tasa de flakiness | Cambios de resultado sin cambio relevante / ejecuciones | 7–14 días | Requiere triage humano para confirmar "sin cambio" | Priorizar estabilización (ver [art. 4](/blog/confiabilidad-diagnostico-flakiness-evidencia/)) |
| Tiempo hasta diagnóstico útil (MTTD) | Desde fallo hasta evidencia que distingue producto/entorno/dato/test | Por incidente | No es tiempo de corrección | Invertir en observabilidad |
| Cobertura de journeys críticos por riesgo | Journeys con control primario + evidencia vigente / journeys prioritarios | Trimestral | No confundir con % de líneas | Decidir qué journey falta cubrir |
| Confiabilidad de dato/ambiente | Fallas por fixture/cleanup/dependencia / ejecuciones | 7–14 días | Solo tras investigación | Mejorar aislamiento (ver [art. 3](/blog/datos-aislados-paralelismo-seguro/)) |
| Costo de mantenimiento | Cambios en tests por cambio de UI/API, por causa | Mensual | No sirve para culpar a quien contribuye | Mejorar contratos y selectores |

> **Aclaración de honestidad intelectual:** las fórmulas anteriores son un marco de trabajo propuesto. No incluyo valores objetivo ("flakiness < 1%") porque dependen del contexto de cada equipo y no tengo datos reales de Nexo Finanzas para respaldarlos.

## 7. Caso Nexo Finanzas y plan de adopción en cuatro iteraciones

El objetivo no es reescribir todo, sino **evolucionar un journey frágil** hacia un conjunto mínimo de pruebas con roles claros. La división de responsabilidades por repositorio:

| Repositorio | Rol |
|---|---|
| `nexo-transfer-api` | Clientes API, builders sintéticos, reglas y contrato: base de preparación/verificación |
| `nexo-web-banking-e2e` | Framework Java + Selenium/Cucumber para journeys web; selectores como contrato |
| `nexo-wallet-mobile` | Adaptador Appium por plataforma, matriz de dispositivos, red/sesión |
| `nexo-cross-channel-regression` | Smoke acotado entre canales; no un duplicado masivo |
| `nexo-performance-lab` | Datos/identificadores controlados para carga, sin reusar cuentas de UI |
| `nexo-quality-platform` | CI, perfiles, artefactos, paralelismo medido, política de reintentos |
| `nexo-quality-control-tower` | Registro de evidencia, causa de falla, tendencia de flakiness |

**Iteración 1 — Un journey UI con preparación por API.** Tomar la transferencia. Preparar cuenta y destinatario vía `nexo-transfer-api` (rápido, determinista); ejecutar solo el envío por UI; verificar el estado por API. Deja fuera: paralelismo, mobile, dashboards.

**Iteración 2 — Reglas de selectores, datos y evidencia.** Acordar `data-testid` con desarrollo, builders de datos sintéticos, y evidencia sanitizada en cada fallo. Deja fuera: aislamiento avanzado.

**Iteración 3 — Aislamiento y paralelismo medido.** Driver por test, recursos con nombres únicos, workers según **capacidad medida** (no el máximo disponible). Deja fuera: matriz mobile completa.

**Iteración 4 — Gobierno y mejora de flakiness.** CONTRIBUTING, primer ADR, y convertir los flaky detectados en backlog priorizado. Deja fuera: todo lo que no tenga necesidad real todavía.

> **Qué dejar fuera hasta que exista necesidad real:** matriz mobile completa, herramientas low-code adicionales, dashboards elaborados y grids propios. La regla es agregar abstracción cuando el dolor aparece, no antes.

## 8. Checklist para decidir si agregar o eliminar una abstracción

**Agregar una abstracción se justifica si:**

- [ ] Elimina duplicación real en ≥3 lugares (no duplicación imaginada).
- [ ] Tiene un nombre que expresa intención de negocio o una frontera técnica clara.
- [ ] Reduce lo que un test necesita saber sobre herramientas.
- [ ] Su costo de aprendizaje es menor que el dolor que resuelve.

**Eliminar una abstracción se justifica si:**

- [ ] Envuelve una sola llamada sin agregar semántica.
- [ ] Obliga a saltar entre archivos para entender un test simple.
- [ ] Acumuló parámetros y flags hasta volverse un God Object.
- [ ] Nadie fuera de quien la escribió sabe cuándo usarla.

## Qué aprendimos y próximos pasos

Un framework sostenible no se define por sus herramientas sino por sus **contratos**: escenarios que expresan intención, adaptadores que encapsulan lo volátil, datos y configuración controlados, evidencia que habilita el diagnóstico y un gobierno que evita el dueño único. La mejor arquitectura es la mínima que sostiene el riesgo del producto sin repetirse.

Los detalles profundos de tres decisiones que solo esbozamos acá se desarrollan en la colección:

- **Selectores como contrato de colaboración** → [Selectores sostenibles y contratos de UI](/blog/selectores-sostenibles-contratos-ui/).
- **Datos y concurrencia sin contaminación** → [Datos aislados y paralelismo seguro](/blog/datos-aislados-paralelismo-seguro/).
- **Sincronización, flakiness y evidencia** → [Confiabilidad y diagnóstico](/blog/confiabilidad-diagnostico-flakiness-evidencia/).

## Checklist final de este artículo

- [ ] Puedo nombrar las capas de mi suite y sus dependencias permitidas/prohibidas.
- [ ] Mis escenarios no importan clases de Selenium/Appium.
- [ ] Mis Page Objects devuelven estado y no contienen assertions de negocio.
- [ ] Elijo API/UI/mobile por riesgo, no por costumbre.
- [ ] Tengo al menos un ADR y una guía de contribución.
- [ ] Mido la suite con indicadores que habilitan decisiones, sin metas mágicas.
- [ ] Tengo un plan de adopción por iteraciones con "qué dejar fuera" explícito.

---

*Prerrequisitos para aprovechar este artículo: Java (clases, interfaces, composición, `record`), Maven/Gradle, Git y PRs, fundamentos de testing (arrange-act-assert, fixtures, pirámide/portafolio) y nociones de HTTP/JSON, CI/CD y concurrencia. Enlazamos documentación oficial junto a cada API concreta; no reemplaza esos manuales.*

