---
title: "Calidad mobile por riesgo: diseñar la cartera de pruebas de una billetera, no automatizar clics"
description: "Estrategia de Quality Engineering mobile por riesgo para una billetera Android/iOS: cómo distribuir la verificación entre código, integración, UI nativa y E2E sin dejar que Appium absorba toda la cobertura."
pubDate: 2026-07-09
tags: ["mobile-testing", "quality-engineering", "sdet", "android", "ios", "appium", "test-strategy", "nexo-wallet"]
cluster: "10"
clusterTitle: "Mobile Quality Engineering"
type: "pilar"
order: 1
repo: "nexo-wallet-mobile"
icon: "phone"
iconHue: 300
readingLevel: "Intermedio"
prerequisites: "requiere base de testing web/API"
---
## El problema que resuelve Nexo Wallet

Un equipo hereda `nexo-wallet-mobile`, una billetera Android/iOS conectada a una API sintética. La suite "de calidad" son 140 tests Appium que tardan 55 minutos, fallan de forma intermitente dos de cada cinco corridas y, aun así, **no atraparon** el bug que importó: al perder señal en medio de una transferencia, la app reintentó y el *ledger* registró **dos** operaciones. El bug no vivía en la UI; vivía en la frontera cliente-servidor, exactamente donde un E2E lento es el peor lugar para buscarlo.

La lección no es "mejor Appium". Es que la calidad mobile se **diseña** distribuyendo verificaciones según **riesgo** y **costo de feedback**. Este artículo es el mapa; los tres satélites cubren el terreno: [testabilidad y Appium](/blog/testabilidad-appium-cross-platform/), [red degradada e idempotencia](/blog/red-degradada-lifecycle-idempotencia/) y [CI, matriz y evidencia](/blog/ci-matriz-flakiness-evidencia/).

> **Aclaración de alcance.** Ninguna estrategia aquí "prueba todos los dispositivos" ni declara a Nexo "listo para producción". Emulador/simulador no sustituye por definición al dispositivo físico. Todos los datos son sintéticos.

## Prerrequisitos y glosario mínimo

Deberías conocer HTTP/APIs, autenticación y manejo de **sesión** (token, expiración, *refresh*), y la idea de cartera de pruebas (unit → integración → UI → E2E). Si venís de web/API, el salto conceptual es que en mobile el *entorno de ejecución* es parte del sistema bajo prueba.

- **Device matrix:** conjunto de combinaciones dispositivo/OS/pantalla/idioma/red que decidís cubrir, con criterio y revisión.
- **Fragmentación:** dispersión de hardware, versiones de OS y personalizaciones de fabricante que rompen la equivalencia "un Android = todos".
- **Test double:** *stub/mock/fake* que reemplaza una dependencia real (API, reloj, red) para aislar y acelerar.
- **Flakiness:** test que pasa y falla sin cambios en el código; ruido que erosiona la confianza.
- **Testability:** propiedad del producto que lo hace verificable (IDs estables, *deep links* de prueba, inyección de reloj/red, *reset* de estado).
- **Build reproducible:** artefacto que, dado el mismo commit y entorno, se construye igual y se puede correlacionar con la evidencia.
- **Observabilidad:** capacidad de explicar por qué falló algo a partir de logs, video, versión de app/build, dispositivo, OS y correlación con la API (`request-id`).

## Por qué mobile cambia el modelo de calidad

En web, el navegador absorbe gran parte de la variabilidad. En mobile no existe ese amortiguador: el **dispositivo** (RAM, CPU, densidad de pantalla), el **sistema operativo** (versiones y personalizaciones de fabricante), la **red** (de 5G a EDGE a offline) y el **ciclo de vida** (foreground, background, terminación por el SO, relanzamiento, rotación) forman parte del sistema bajo prueba. Un mismo código se comporta distinto según permisos concedidos o denegados, *deep links*, notificaciones o biometría.

Por eso la guía oficial de Android hoy describe una **estrategia por capas** (unit, component, feature, application, release-candidate) donde subís de fidelidad a medida que bajás de velocidad, en lugar de una pirámide rígida de tres niveles ([Android · Testing strategies](https://developer.android.com/training/testing/fundamentals/strategies)). Apple, por su parte, estructura el testing en Xcode con unit y UI tests, y desde Swift 6 / Xcode 16 convive **Swift Testing** con **XCTest** ([Apple · Testing in Xcode](https://developer.apple.com/documentation/xcode/testing)).

Un corolario incómodo: **no podés reproducir toda esa combinatoria** en cada commit. La estrategia consiste en decidir *qué defecto es más barato atrapar en qué nivel* y aceptar explícitamente qué queda fuera hasta la corrida nocturna o de release.

## Fundamentos: fidelidad, costo y el bucle de feedback

El siguiente diagrama muestra el **bucle de feedback** —no una jerarquía de prestigio—: cada nivel alimenta reporte y evidencia, que a su vez informa dónde reforzar la lógica de dominio.

<figure class="diagram">
  <img src="/blog/diagrams/calidad-mobile-por-riesgo-1.svg" width="290" height="449" alt="Diagrama: calidad-mobile-por-riesgo (1)" loading="lazy" decoding="async" />
</figure>

Qué es más barato detectar en cada nivel:

- **Lógica de dominio (unit, JVM/Swift, sin device):** validación de montos, formateo de moneda, máquinas de estado de la transferencia, reglas de sesión. Milisegundos; corre en cada commit. Aquí atrapás la mayoría de los bugs de reglas.
- **Integración con API:** contratos, serialización, manejo de `401` → *refresh*, códigos de error, **claves de idempotencia**. Corre sin UI, contra la API sintética o un *fake*. Atrapa desalineaciones cliente/servidor —incluida la del bug de duplicación.
- **UI nativa** ([Espresso](https://developer.android.com/training/testing/espresso) / [Compose testing](https://developer.android.com/develop/ui/compose/testing) en Android; [XCUITest](https://developer.apple.com/documentation/xctest) en iOS): que la pantalla refleje el estado, que un permiso denegado no rompa el flujo, que la rotación no pierda datos. Requiere emulador/simulador o device; segundos a minutos.
- **E2E con Appium:** *journeys* cross-platform seleccionados, de punta a punta, sobre un *build* real. Minutos; frágil y caro. Verifica la **integración del sistema**, no la lógica.

Señales que **exigen dispositivo** (no bastan tests JVM): densidad de pantalla y *layout* real, rendimiento en gama baja, biometría, comportamiento del SO ante presión de memoria (terminación en background), y radios/red reales.

Un E2E **no debe reemplazar** tests rápidos: si un fallo de validación de monto solo aparece en Appium, tenés un test lento haciendo el trabajo de uno de milisegundos, y un diagnóstico órdenes de magnitud más caro.

> **Hecho citado vs. decisión de diseño.** Que Android proponga capas es hecho citado. **Cuántas** capas materializa Nexo y **qué** journey sube a Appium es decisión de diseño, documentada en el **ADR-002**.

## Arquitectura de calidad de Nexo Wallet

Cuatro planos que **no** hay que confundir al diagnosticar:

1. **App** (`nexo-wallet-mobile`): UI nativa Android/iOS, IDs de accesibilidad, cola local, suite Appium.
2. **Backend** (`nexo-transfer-api`): contrato, endpoint de **datos sintéticos** e **idempotencia de servidor**.
3. **Infraestructura y entornos** (`nexo-quality-platform`): entornos efímeros, pipeline, reportes, runbook de flakiness.
4. **Dispositivos**: emuladores/simuladores en CI, más un conjunto físico acotado para las señales que lo requieren.

Regla de oro de triage: **antes de decir "es flaky", clasificá el plano**. Un fallo puede ser del producto, de la app, de la API, del dispositivo, de la red, del dato, del framework o del ambiente. Cómo se mide esto está en el [Artículo 4](/blog/ci-matriz-flakiness-evidencia/).

## Cómo definir journeys y riesgos

Un *journey* que merece cobertura combina **frecuencia de uso**, **impacto de falla** y **dificultad de detección tardía**. Para la billetera, el de mayor riesgo no es "ver el saldo" (frecuente, bajo impacto, fácil de atrapar barato) sino **transferir con red inestable**: menos frecuente, impacto financiero, y defecto que escapa a los niveles bajos. Ese es el journey obligatorio de Nexo:

> iniciar sesión con cuenta de prueba → elegir cuenta → preparar transferencia → **perder red** → recuperar conectividad → **confirmar una sola operación**.

### Matriz de pruebas por riesgo (ejemplo revisable)

Es una **decisión basada en evidencia**, no una tabla fija. "Nivel dueño" indica dónde vive la verificación primaria; los demás niveles no la duplican.

| Escenario | Riesgo principal | Nivel dueño | Ambiente | Dispositivo/OS | Evidencia | Frecuencia |
|---|---|---|---|---|---|---|
| Login cuenta de prueba | Sesión no persiste / credencial mal manejada | Integración (contrato) + UI nativa | Staging sintético | 1 device por plataforma | `request-id`, captura al fallar | UI: cada PR · E2E: nocturno |
| Elegir cuenta origen | Selección incorrecta | UI nativa | Emulador/simulador | Matriz reducida | Screenshot semántico | Pre-merge |
| Preparar transferencia (monto/beneficiario) | Validación de monto y formato | **Unit** (dominio) + UI nativa | Local JVM/Swift | No aplica para unit | Assert de dominio | Cada commit |
| **Red degradada durante el envío** | **Duplicación o pérdida de la operación** | **E2E Appium + API de idempotencia** | Entorno controlado con *toggle* de red | Físico + emulador | Video + ledger sintético + `request-id` | Nocturno / release |
| Sesión vencida (token expira) | Reautenticación fallida o crash | Integración API + UI nativa | Staging | 1 device | Log `401` → refresh | Pre-merge |
| Permiso denegado (notificaciones/biometría) | Flujo bloqueado o crash | UI nativa instrumentada | Emulador con permiso revocado | Android + iOS | Captura de estado | Pre-merge |
| Recuperación de app (kill/relaunch) | Estado inconsistente | UI nativa / E2E | Físico | Segmento acotado | Video | Nocturno |
| Confirmación de no-duplicación | Doble cargo | E2E + **API (idempotencia de servidor)** | Controlado | Físico | Ledger = 1 operación | Release |

El *cómo* del renglón resaltado se desarrolla en el [Artículo 3](/blog/red-degradada-lifecycle-idempotencia/); su ejecución y evidencia, en el [Artículo 4](/blog/ci-matriz-flakiness-evidencia/).

## Matriz de dispositivos: por qué es una hipótesis, no un dogma

Nexo **no** tiene analítica de parque real, así que su matriz se declara **hipótesis de portfolio** y se revisa periódicamente según usuarios y cambios de plataforma. La fragmentación de Android obliga a segmentar por versión de OS, densidad de pantalla, RAM/gama e idioma; iOS es más homogéneo pero cambia rápido entre versiones.

Correr **siempre en el mismo emulador y llamarlo "compatibilidad"** es un anti-patrón (ver abajo). El detalle de segmentos y criterios de revisión está en el [Artículo 4](/blog/ci-matriz-flakiness-evidencia/).

## Seguridad y privacidad: dónde termina la app y empieza la API

A nivel de **verificación** —no de *pentest*— la referencia es OWASP MAS. **MASVS 2.1.0** define grupos de control: almacenamiento, criptografía, autenticación, red, plataforma, código, resiliencia y **privacidad** ([MASVS](https://mas.owasp.org/MASVS/)). **MASTG** aporta los procedimientos de prueba ([MASTG](https://mas.owasp.org/MASTG/)).

El **límite** importa: verificar que la **app** no guarda secretos en la cola local ni en logs (MASVS-STORAGE / MASVS-PRIVACY) es distinto de verificar que la **API** aplica autorización e idempotencia. Este artículo no enseña a **evadir** protecciones; enseña a **verificar** que existen.

> Si la billetera manejara datos de tarjetas, aplicarían marcos como **PCI DSS**; con datos personales de residentes de la UE, el **GDPR** (Reglamento UE 2016/679); en Argentina, la **Ley 25.326** y la normativa del BCRA para entidades financieras. Delimitá jurisdicción y versión con tu equipo legal y de cumplimiento: **esto no es asesoramiento legal ni de cumplimiento**.

## Android e iOS: diferencias que importan, sin falsear equivalencia

- **Android:** UI nativa con Espresso y Compose testing (basado en semántica), Robolectric para tests de *component/feature* rápidos, UI Automator, y la [Espresso Device API](https://developer.android.com/studio/test/espresso-api) para cambios de configuración y estado del dispositivo.
- **iOS:** **XCUITest** (parte de XCTest) para UI y E2E. **Swift Testing** (Swift 6 / Xcode 16+) es excelente para unit e integración, pero **no cubre UI ni performance tests** ([Swift Testing](https://developer.apple.com/documentation/testing)); esos siguen en XCTest.

Consecuencia práctica: **no existe un único framework que cubra todo cross-platform**. Appium unifica los *journeys* seleccionados, pero por debajo cada plataforma usa su stack nativo, y un test "verde en Android" no implica verde en iOS.

## Anti-patrones estratégicos

**Automatizar toda la pirámide con Appium.** *Causa:* creer que "E2E = calidad". *Consecuencia:* suites lentas y frágiles, diagnóstico caro, bugs de dominio que escapan. *Alternativa:* empujar validaciones a unit e integración; reservar Appium para journeys cross-platform.

**Usar siempre el mismo emulador y llamarlo compatibilidad.** *Causa:* comodidad. *Consecuencia:* falsa confianza; la fragmentación queda sin cubrir. *Alternativa:* matriz por evidencia revisable, más las señales que exigen dispositivo físico.

**Elegir dispositivos por preferencia personal.** *Causa:* sesgo del equipo. *Consecuencia:* cobertura desalineada con los usuarios reales. *Alternativa:* segmentos derivados de analítica permitida o, en su defecto, una hipótesis declarada y revisada.

**Medir QA por cantidad de casos.** *Causa:* es la métrica más fácil de contar. *Consecuencia:* incentiva volumen en lugar de riesgo. *Alternativa:* cobertura de journeys y riesgos, más calidad del feedback (ver [Artículo 4](/blog/ci-matriz-flakiness-evidencia/)).

## Qué aprendimos y próximos pasos

Mobile Quality Engineering es **diseño de cartera**: ubicar cada verificación donde el defecto es más barato de atrapar, aceptar explícitamente lo que queda fuera, y tratar dispositivo, OS, red y ciclo de vida como parte del sistema bajo prueba. Appium es una pieza, no el todo.

- Para hacer la app testeable y escribir E2E estables → **[Artículo 2: Testabilidad y Appium](/blog/testabilidad-appium-cross-platform/)**
- Para el journey de red y no-duplicación → **[Artículo 3: Red degradada e idempotencia](/blog/red-degradada-lifecycle-idempotencia/)**
- Para ejecutar, medir y evidenciar sin filtrar datos → **[Artículo 4: CI, matriz y evidencia](/blog/ci-matriz-flakiness-evidencia/)**

## Checklist final

- [ ] Cada journey tiene riesgo, nivel dueño, evidencia y frecuencia declarados.
- [ ] La matriz de dispositivos está marcada como hipótesis revisable.
- [ ] La documentación distingue app, backend, infraestructura y dispositivos.
- [ ] Se separa la seguridad de la app (MASVS/MASTG) de la seguridad de la API.
- [ ] Ninguna afirmación dice "prueba todos los dispositivos" ni "listo para producción".
- [ ] Existe `docs/calidad/estrategia-mobile.md` que refleja esta cartera.

---

*Colección **Mobile Quality Engineering**. Fuentes verificadas al 2026-07-09; ver **Control de calidad editorial**.*

