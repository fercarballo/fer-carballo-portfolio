---
title: "Seguridad para Quality Engineering: threat modeling de una API de transferencias, de la regla de negocio a la hipótesis verificable"
description: "Cómo un perfil senior de QA convierte activos, límites de confianza y abusos de flujo en amenazas priorizadas y criterios de aceptación de seguridad verificables, usando la API ficticia Nexo Finanzas."
pubDate: 2026-07-09
tags: ["threat-modeling", "api-security", "quality-engineering", "owasp-api-top-10", "sdet", "seguridad"]
cluster: "08"
clusterTitle: "Seguridad y threat modeling para QA"
type: "pilar"
order: 1
icon: "shield"
iconHue: 0
readingLevel: "Intermedio–Avanzado"
prerequisites: "QA Automation / SDET / backend / líderes técnicos"
---
> **Subtítulo:** Cómo pasar de "el escáner dio verde" a "tengo una hipótesis de abuso, un control y una prueba que la verifica", usando la API ficticia **Nexo Finanzas** como hilo conductor.

> **Aviso de alcance.** Este artículo usa exclusivamente un entorno ficticio, datos sintéticos y escenarios defensivos. No es asesoramiento legal, bancario ni de cumplimiento. Cuando menciono un estándar (OWASP, NIST, CWE) indico versión y fecha de consulta; verificá siempre la URL canónica antes de decidir. Ninguna prueba "garantiza" seguridad ni cumplimiento normativo.

---

## Resumen ejecutivo

Si tu equipo mide seguridad por "el pipeline está verde" y "pasó el escáner", estás midiendo actividad, no riesgo. Este post muestra el trabajo previo que hace que esas señales signifiquen algo: **modelar amenazas sobre un journey concreto** —una transferencia de dinero— y traducir cada amenaza priorizada en un **criterio de aceptación de seguridad verificable**.

Al terminar vas a poder:

1. Facilitar una sesión de threat modeling corta y con backlog, no una reunión que se evapora.
2. Dibujar un inventario de activos y un diagrama de flujo de datos (DFD) de un journey.
3. Priorizar riesgos usando la taxonomía de **OWASP API Security Top 10 (2023)** sin tratarlos a todos igual.
4. Convertir cada riesgo en un criterio de aceptación y un caso de prueba **negativo**.

Lo que **no** vas a encontrar acá: recetas de códigos de estado fijos, promesas de "cumplimiento", ni instrucciones para atacar sistemas de terceros. Las pruebas concretas (autorización, idempotencia), el quality gate en CI y el postmortem viven en los artículos satélite de esta colección.

**Promesa de aprendizaje verificable:** al final tenés una plantilla de ficha de amenaza y una matriz `amenaza → control → caso → evidencia` que podés aplicar a tu propio repositorio en una tarde.

---

## Prerrequisitos y glosario mínimo

Este artículo asume conocimientos básicos y repasa lo esencial. No necesitás ser especialista en AppSec.

**Deberías estar cómodo/a con:**

- HTTP y REST: métodos, códigos de estado, JSON, cabeceras y TLS.
- La diferencia entre **autenticación** (¿quién sos?) y **autorización** (¿qué podés hacer?).
- Contratos de API: OpenAPI, versionado y datos de prueba **sintéticos** (inventados, sin PII real).
- Git, pull requests y CI/CD a nivel conceptual.

**Glosario que definimos al usar, no antes:**

| Término | Definición breve | Su límite |
|---|---|---|
| **Amenaza** | Un evento potencial que daña un activo (ej.: "un usuario lee la cuenta de otro"). | No es lo mismo que vulnerabilidad; una amenaza puede existir sin que haya un fallo explotable. |
| **Vulnerabilidad** | Una debilidad concreta que hace posible la amenaza (ej.: el endpoint no valida el dueño del objeto). | Se cataloga con [CWE](https://cwe.mitre.org/). Tener una CWE no dice nada del impacto de negocio sin contexto. |
| **Control** | Medida que reduce probabilidad o impacto. Puede ser **preventivo**, **detectivo** o **correctivo**. | Un control existe en el diseño; una prueba verifica que *funciona*. No son lo mismo. |
| **Evidencia** | Artefacto reproducible que demuestra que el control se verificó (log, reporte, ejecución con ID de correlación). | Un test verde no es evidencia si no es reproducible ni trazable. |
| **BOLA / BFLA** | Broken Object/Function Level Authorization: acceder a *objetos* ajenos o a *funciones* que no te corresponden. Son API1 y API5 en OWASP API Top 10 (2023). | Ver [OWASP API Security](https://owasp.org/API-Security/). |
| **SAST / DAST / SBOM** | Análisis estático de código / análisis dinámico de la app corriendo / inventario de componentes. **No son sinónimos** ni intercambiables. | Ninguno reemplaza threat modeling ni pruebas de autorización. |

> **Cuidado con confundir siglas.** OAuth (un framework de autorización delegada), JWT (un formato de token), OWASP (una organización y sus proyectos), CVE (una vulnerabilidad publicada concreta) y CWE (una *clase* de debilidad) resuelven problemas distintos. A lo largo del texto los distingo cuando aparecen.

---

## 1. Por qué seguridad es responsabilidad de Quality Engineering (y no una etapa al final)

Una imagen común: la seguridad como un peaje al final del camino. El equipo construye, y antes de publicar "pasa por seguridad": un escaneo, quizá un pentest anual, un checklist. Ese modelo tiene un problema estructural: **encuentra tarde y verifica poco**.

La tesis de este post —que voy a defender con matices— es que un perfil senior de QA no "agrega seguridad al final": participa **desde el diseño** para descubrir activos, límites de confianza, abusos de flujo y controles, y luego incorpora **verificaciones repetibles** al ciclo de entrega.

Hay respaldo para esta postura en marcos primarios:

- El **NIST Secure Software Development Framework (SSDF), SP 800-218 v1.1** (final, febrero 2022) organiza las prácticas de desarrollo seguro en cuatro grupos —*Prepare the Organization, Protect the Software, Produce Well-Secured Software, Respond to Vulnerabilities*— e incluye explícitamente prácticas de **revisión y prueba** del código y del diseño a lo largo del ciclo, no como fase final ([NIST SP 800-218](https://csrc.nist.gov/pubs/sp/800/218/final), consultado 2026-07-09). *(Nota: existe un borrador de v1.2 en curso; verificá el estado en la URL canónica antes de citarlo como final.)*
- El **OWASP Threat Modeling Cheat Sheet** describe el threat modeling como una actividad que responde cuatro preguntas —*¿qué estamos construyendo? ¿qué puede salir mal? ¿qué vamos a hacer al respecto? ¿lo hicimos bien?*— y ubica la última pregunta (la verificación) como parte inseparable del proceso ([OWASP Threat Modeling Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Threat_Modeling_Cheat_Sheet.html), consultado 2026-07-09).

Esa cuarta pregunta —"¿lo hicimos bien?"— es exactamente donde Quality Engineering aporta valor único: **transformar controles de diseño en pruebas que se ejecutan solas, una y otra vez, en cada entrega.**

> **Distinción importante.** Esto **no** convierte a QA en el equipo de seguridad ofensiva, ni reemplaza a AppSec, ni al pentest, ni a la revisión humana. Un escáner no reemplaza threat modeling. Un pentest anual no reemplaza pruebas de autorización automatizadas en cada PR. Cada capa cubre un hueco distinto; el error es creer que una sustituye a las otras.

**Decisión de diseño (no un hecho universal):** en Nexo Finanzas asignamos a QA la responsabilidad de *verificar controles de autorización, idempotencia y trazabilidad del journey de transferencia mediante pruebas automatizadas*, y a AppSec la de *modelar amenazas con el equipo y revisar hallazgos de escáneres*. Es un reparto razonable para un equipo de producto; no es la única forma de organizarlo.

---

## 2. El escenario: Nexo Finanzas

**Nexo Finanzas es ficticio.** No representa a un banco real, no procesa dinero real y no usa credenciales, PII ni APIs de terceros reales. Todos los usuarios, cuentas y montos son sintéticos. Distingo siempre entre *datos de demostración* (lo que uso para enseñar) y *evidencia de producción* (que en un sistema real jamás debería contener secretos ni PII).

Nexo ofrece una API de transferencias, un portal web y una app móvil. El journey que vamos a modelar:

> Una persona autenticada registra un destinatario y solicita una transferencia desde una cuenta propia; la operación debe respetar **autorización**, **límites de negocio**, **idempotencia**, **auditoría** y **protección de datos**.

Para modelar amenazas necesitamos cinco elementos, no solo "el endpoint":

| Elemento | En Nexo Finanzas |
|---|---|
| **Activo** | El dinero sintético en el ledger, y los datos de la cuenta/destinatario. |
| **Actor** | Persona autenticada (legítima), persona autenticada abusiva, atacante no autenticado, integración externa. |
| **Regla de negocio** | "Solo el dueño de una cuenta puede transferir desde ella, dentro de sus límites". |
| **Consecuencia** | Pérdida de fondos sintéticos, fuga de datos, doble ejecución, pérdida de trazabilidad. |
| **Límite de confianza** | Frontera donde cambia el nivel de confianza de los datos (cliente ↔ API, API ↔ servicio externo, API ↔ ledger). |

---

## 3. Inventario de activos y diagrama de flujo de datos

El primer artefacto de una sesión de threat modeling útil es un DFD *para modelar amenazas*, no un diagrama de arquitectura completo. Debe ser simple y revisable.

<figure class="diagram">
  <img src="/blog/diagrams/threat-modeling-para-qa-api-transferencias-1.svg" width="1109" height="256" alt="Diagrama: threat-modeling-para-qa-api-transferencias (1)" loading="lazy" decoding="async" />
</figure>

**Qué representa cada flecha, y dónde está el límite de confianza:**

- `U → W`: el usuario opera sobre el portal/app. **La app cliente es territorio no confiable**: todo lo que llega de ahí a la API cruza un límite de confianza y debe validarse del lado servidor. Nunca confíes en controles que viven solo en el cliente.
- `W → G`: la solicitud entra a la API. Acá se decide autenticación y se **debe** decidir autorización.
- `G → A`: la API consulta la decisión de autorización. Esta flecha es el corazón del post: es donde viven BOLA (API1:2023) y BFLA (API5:2023).
- `A → L`: si se autoriza, se escribe en el ledger sintético. Acá importan idempotencia y consistencia transaccional.
- `G → O`: se registra el evento de auditoría. **Sin secretos, sin PII, sin payloads sensibles.**
- `G ↔ E`: la API consume un servicio externo simulado. Ese servicio es **otro límite de confianza**: su respuesta no es confiable por defecto (API10:2023, Unsafe Consumption of APIs; y API7:2023, SSRF).

> **Declaración de alcance del diagrama.** Este DFD **no** es la arquitectura completa de Nexo. Omite balanceadores, colas, cachés, IAM real y mil detalles. Es deliberadamente parcial: su único trabajo es hacer visibles los límites de confianza para poder preguntarnos "¿qué puede salir mal en cada cruce?".

Ahora la vista de secuencia del "flujo feliz":

<figure class="diagram">
  <img src="/blog/diagrams/threat-modeling-para-qa-api-transferencias-2.svg" width="1050" height="452" alt="Diagrama: threat-modeling-para-qa-api-transferencias (2)" loading="lazy" decoding="async" />
</figure>

**El flujo feliz no demuestra autorización correcta.** Que esta secuencia funcione para Ana operando la cuenta de Ana no dice *nada* sobre qué pasa cuando Ana intenta operar la cuenta de Bruno. Por eso el trabajo real de QA está en las ramas que este diagrama **no** muestra:

- ¿Qué pasa si `Verificar sujeto y cuenta` devuelve "denegado"? → prueba negativa de autorización.
- ¿Qué pasa si el `POST` llega dos veces con la misma clave idempotente? → una sola operación en el ledger.
- ¿Qué pasa si el servicio externo hace timeout entre `AZ` y `LD`? → reintentos y consistencia.
- ¿Cómo correlaciono el evento de auditoría con la operación sin guardar el token? → ID de correlación.

Dónde ubicar cada prueba negativa, timeout, reintento y correlación de evidencia es el tema del [artículo satélite sobre BOLA/BFLA e idempotencia](/blog/bola-bfla-idempotencia-pruebas-negativas-api/).

---

## 4. Cómo facilitar una sesión de threat modeling que no se evapore

El antipatrón número uno del threat modeling es la **reunión sin backlog**: dos horas de pizarra, mucho asentir, cero tareas, cero pruebas, cero dueños. La sesión existió pero no cambió nada.

Una sesión útil tiene una estructura mínima y produce artefactos. Propongo este formato (decisión de facilitación, no norma):

**Antes (15 min de preparación):**
- Llevá el DFD ya dibujado. La sesión es para *encontrar amenazas*, no para dibujar por primera vez.
- Definí el journey y sus activos en una línea cada uno.

**Durante (60–90 min):**
1. **Recorrer el DFD flecha por flecha** haciendo la pregunta 2 del cheat sheet: *"¿qué puede salir mal acá?"*. Para dar estructura, se puede usar un mnemónico como **STRIDE** (Spoofing, Tampering, Repudiation, Information disclosure, Denial of service, Elevation of privilege), que el propio OWASP menciona como una de las metodologías posibles ([OWASP Threat Modeling Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Threat_Modeling_Cheat_Sheet.html)). No es obligatorio; es un andamio para no olvidarse categorías.
2. **Anotar cada amenaza como una ficha**, no como un post-it suelto (plantilla más abajo).
3. **Priorizar por riesgo = probabilidad × impacto × contexto de negocio**, no por un ranking fijo. Una CWE "crítica" en un endpoint sin datos sensibles puede importar menos que una "media" en el flujo de dinero.

**Después (la parte que casi nadie hace):**
- Cada ficha de amenaza aceptada se convierte en **al menos un ítem de backlog** con dueño.
- Los controles verificables se convierten en **criterios de aceptación de seguridad** (sección 6).
- La sesión tiene un **acta de una página**: amenazas, decisiones, dueños, fecha de revisión.

> **Anti-patrón: threat modeling como reunión sin backlog.**
> **Causa:** se trata la sesión como un evento de concienciación, no como generación de trabajo.
> **Daño:** la organización cree que "hace threat modeling" pero no cambia el producto ni las pruebas. Es *security theater*.
> **Alternativa:** ninguna sesión termina sin fichas, dueños y al menos un criterio de aceptación verificable. Si no generó backlog, no ocurrió.

---

## 5. Riesgos priorizados con OWASP API Security Top 10 (2023)

Para no inventar una taxonomía propia, anclamos los riesgos del journey a **OWASP API Security Top 10, edición 2023** —la edición vigente al momento de consulta (2026-07-09), verificada en la [página canónica del proyecto](https://owasp.org/API-Security/)—. Es una lista de *riesgos frecuentes*, no un requisito normativo ni una garantía: que cubras el Top 10 no significa que estés "seguro".

Estos son los riesgos más relevantes para nuestra transferencia, con su traducción a Nexo:

| ID OWASP API (2023) | Riesgo | En el journey de transferencia | Tipo de control principal |
|---|---|---|---|
| **API1:2023** Broken Object Level Authorization (BOLA) | Acceder a objetos de otro usuario cambiando un ID | Ana consulta/opera la cuenta de Bruno cambiando el `id` en la URL | Preventivo: autorización por objeto del lado servidor |
| **API5:2023** Broken Function Level Authorization (BFLA) | Ejecutar funciones/roles que no te corresponden | Un usuario normal invoca un endpoint administrativo de reverso | Preventivo: autorización por función/rol |
| **API3:2023** Broken Object Property Level Authorization | Leer/escribir propiedades del objeto que no deberías | Modificar el campo `montoLimite` en el body y que se persista | Preventivo: validación de propiedades (mass assignment) |
| **API4:2023** Unrestricted Resource Consumption | Consumir recursos sin límite | Miles de solicitudes de transferencia en un segundo | Preventivo/detectivo: rate limiting **contextual** |
| **API6:2023** Unrestricted Access to Sensitive Business Flows | Abusar de un flujo de negocio legítimo automatizándolo | Automatizar el alta de destinatarios para dispersar fondos | Detectivo: límites de flujo, no solo de request |
| **API8:2023** Security Misconfiguration | Configuración insegura por defecto | Cabeceras faltantes, verbose errors que filtran datos | Preventivo: hardening y verificación de configuración |
| **API7:2023** / **API10:2023** SSRF / Unsafe Consumption | Confiar ciegamente en el servicio externo | La API sigue un redirect del servicio simulado a un destino interno | Preventivo: validar entradas *y* salidas del `G ↔ E` |

**Por qué la autorización domina esta tabla.** En un flujo de dinero, la pregunta "¿este sujeto puede operar *este* objeto/función?" es la que más veces se responde mal en la práctica: BOLA es API1 desde hace ediciones y sigue siendo la número uno. Un detalle que a menudo se descuida: **autenticación correcta no implica autorización correcta**. Un token válido de Ana no autoriza a Ana a tocar la cuenta de Bruno. Probar solo login (autenticación) y olvidar la autorización por objeto, función y propiedad es uno de los errores más caros.

> **Rate limiting no es "poné un límite y listo".** El rate limiting es un control **contextual**: hay que definir *qué flujo* estás protegiendo, *qué actor* lo ejerce y *cómo se recupera* la experiencia legítima cuando pega el límite. Un límite mal calibrado castiga a usuarios reales (daña la experiencia) sin frenar a un abusador paciente. Volvemos a esto en los antipatrones del [artículo de liderazgo](/blog/postmortem-sin-culpas-antipatrones-liderazgo-qa/).

**Nota sobre las dos listas OWASP.** Existe además el **OWASP Top 10 (web apps), edición 2025**, que es un proyecto *separado* con su propio calendario; en él "Broken Access Control" sigue en el puesto #1 ([OWASP Top 10:2025](https://owasp.org/Top10/2025/)). Para una **API**, la referencia primaria es el **API Security Top 10**, no el de web apps. No los mezcles.

---

## 6. Del riesgo al criterio de aceptación de seguridad (y al caso de prueba negativo)

Acá está el puente que convierte a QA de "el que prueba el happy path" en "el que verifica controles". La receta:

> **amenaza → control propuesto → criterio de aceptación de seguridad → caso de prueba (idealmente negativo) → evidencia.**

Un criterio de aceptación de seguridad se escribe como cualquier criterio de aceptación, pero describe un **comportamiento del control**, y muchas veces se expresa mejor en negativo: "el sistema **debe rechazar** X".

**Ejemplo trabajado (BOLA / API1:2023):**

- **Amenaza:** una persona autenticada accede a los movimientos de una cuenta ajena cambiando el `id` en la URL.
- **Control propuesto (preventivo):** la API valida, del lado servidor, que el sujeto del token sea dueño (o tenga rol autorizado sobre) la cuenta solicitada, antes de devolver datos.
- **Criterio de aceptación:** "Dado un token válido del usuario A, cuando A solicita `GET /v1/cuentas/{id}/movimientos` con un `id` que pertenece a B, el sistema **debe denegar** el acceso con una respuesta coherente con el contrato y **no debe** filtrar datos de B."
- **Caso de prueba negativo:** crear dos usuarios sintéticos, autenticar como A, pedir la cuenta de B, verificar la denegación definida por el contrato.
- **Evidencia:** ejecución del test con ID de correlación, request/response saneados (sin token en claro), y el commit/versión bajo prueba.

Fijate un matiz clave que muchos ejemplos ignoran: **no impongo que la respuesta sea siempre `403`.** Distintas APIs, por diseño legítimo, pueden responder `404` (para no revelar que el objeto existe), `403`, o un error de contrato específico. El test verifica *"deniega de forma coherente con el contrato"*, no *"devuelve 403"*. Fijar el código de estado como si fuera universal es un error de diseño de la prueba.

### Ficha de amenaza y control (plantilla)

Este es el artefacto central que deberías poder reproducir. Cada fila viaja desde la amenaza hasta el dueño:

| ID | Activo | Actor | Precondición | Abuso | Impacto de negocio | Control (tipo) | Prueba automatizada | Evidencia | Dueño |
|---|---|---|---|---|---|---|---|---|---|
| TM-01 | Movimientos de cuenta ajena | Persona autenticada abusiva | A y B existen; A tiene token válido | A pide `GET /cuentas/{B}/movimientos` | Fuga de datos de B (API1:2023 / [CWE-639](https://cwe.mitre.org/data/definitions/639.html)) | Autorización por objeto del lado servidor (preventivo) | Test API negativo: A→cuenta de B ⇒ denegación por contrato | Ejecución con ID de correlación, response saneado | QA + backend |
| TM-02 | Ledger sintético | Persona autenticada / red inestable | Transferencia válida con clave idempotente | Reenvío de la misma solicitud (doble submit / reintento) | Doble débito, dinero duplicado ([CWE-837](https://cwe.mitre.org/data/definitions/837.html), procesamiento duplicado) | Idempotencia por clave + una sola escritura (preventivo) | Test que reenvía misma clave ⇒ una sola operación en ledger | Conteo de operaciones, evento de auditoría correlacionado | QA + backend |

> **Distinción que el artículo mantiene siempre.** En la columna "Control" separo *preventivo* (evita que ocurra), *detectivo* (avisa que ocurrió) y *correctivo* (repara). La autorización por objeto es preventiva; un alerta por picos de transferencias es detectiva; un proceso de reverso es correctivo. Necesitás las tres capas: ninguna sola alcanza.

La implementación concreta de TM-01 y TM-02 (código Java/REST Assured y pseudocódigo de concurrencia) está en el [satélite técnico](/blog/bola-bfla-idempotencia-pruebas-negativas-api/).

---

## 7. Qué verificar en cada nivel de prueba (visión de diseño)

No todo se prueba en el mismo nivel. Sobre-testear en E2E lo que corresponde a unidad genera pruebas lentas e inestables; sub-testear autorización porque "ya lo cubre el escáner" deja huecos. Una asignación razonable (decisión de diseño, ajustable a tu contexto):

| Nivel | Qué verifica de seguridad en este journey | Trade-off |
|---|---|---|
| **Unidad** | Lógica de la decisión de autorización, validación de propiedades, cálculo de límites | Rápida y estable, pero no prueba la integración real ni el contrato HTTP |
| **Integración / API** | BOLA, BFLA, mass assignment, idempotencia, códigos y cuerpos según contrato | El sweet spot para seguridad de API; necesita datos y roles sintéticos bien montados |
| **Contrato** | Que request/response cumplan el OpenAPI y que los errores de denegación estén *especificados* | No verifica que la autorización *funcione*, solo que la forma sea correcta |
| **UI / E2E** | Que el flujo sensible respete límites de negocio de punta a punta | Costosa e inestable; reservá para journeys críticos, no para cubrir autorización |
| **Pipeline** | Que todo lo anterior corra en cada cambio, con evidencia y gate proporcional | Ver el [satélite de quality gates](/blog/quality-gates-seguridad-cicd-proporcionales/) |

Un apunte sobre contratos: **OpenAPI 3.2.0** (publicada el 19 de septiembre de 2025; ver [OpenAPI Specification](https://spec.openapis.org/oas/latest.html)) sigue usando JSON Schema 2020-12 y permite describir con precisión también las respuestas de error. Eso importa para seguridad: si el contrato **especifica** cómo se ve una denegación, tus pruebas negativas pueden verificar contra el contrato en vez de contra un número mágico.

---

## 8. Trazabilidad: la matriz que conecta todo

Todo lo anterior colapsa si no podés responder, para cualquier amenaza, "¿qué la controla y dónde está la prueba?". La herramienta es una matriz trazable:

> **amenaza → control → caso de prueba → ejecución → evidencia**

| Amenaza | Control | Caso | Última ejecución | Evidencia |
|---|---|---|---|---|
| TM-01 (BOLA) | Autorización por objeto | `unaPersonaNoPuedeOperarLaCuentaDeOtra` | commit `abc123`, pipeline #482 | reporte + ID correlación `req-7f3a` |
| TM-02 (idempotencia) | Clave idempotente + escritura única | `reenvioNoDuplicaLedger` | commit `abc123`, pipeline #482 | conteo ledger + evento auditoría |

Esta matriz es la diferencia entre "creemos que está cubierto" y "acá está la ejecución que lo demuestra". Es también el insumo del portfolio: cuando un reclutador o un auditor pregunta "¿cómo sabés que la autorización funciona?", señalás la fila.

> **Métricas: qué medir sin engañarte.** Contá pruebas de autorización *por rol, objeto y función* **separadas** de la cobertura de líneas (son cosas distintas). Medí porcentaje de journeys críticos modelados (definí "crítico" explícitamente: p. ej., "mueve dinero o expone PII"). Medí edad de hallazgos aceptados y tasa de pruebas inestables con causa clasificada. Y grabá esta advertencia en piedra: **cobertura de código alta + muchos escaneos + pipeline verde ≠ riesgo cero.** Son señales necesarias, no suficientes.

---

## 9. Qué se conserva como evidencia (y qué jamás)

La trazabilidad exige guardar cosas. La seguridad exige no guardar otras.

**Se conserva:** logs estructurados, IDs de correlación, hashes de artefactos, reportes de ejecución, request/response **saneados**, y las decisiones humanas (quién aceptó qué hallazgo y por qué).

**Jamás se conserva como evidencia:** tokens, contraseñas, PII, datos bancarios reales, payloads sensibles ni capturas sin sanear.

> **Anti-patrón: registrar secretos, tokens o PII como evidencia.**
> **Causa:** se copia el request/response crudo al reporte "para tener contexto".
> **Daño:** la evidencia se vuelve un vector de fuga; el artefacto que debía dar confianza se convierte en un pasivo.
> **Alternativa:** sanear en la capa de prueba (enmascarar `Authorization`, redaccionar campos PII) *antes* de escribir cualquier reporte. En Nexo, como todo es sintético, esto es fácil de ensayar; en producción es obligatorio.

---

## 10. Un plan incremental de 30 días

No intentes modelar todo el sistema el primer día. Una adopción realista, journey por journey:

- **Semana 1 — Un journey.** Elegí el más crítico (mueve dinero). Dibujá el DFD, hacé una sesión de threat modeling de 90 min, producí 5–8 fichas de amenaza con dueños.
- **Semana 2 — Criterios y primeras pruebas.** Convertí las 3 amenazas top en criterios de aceptación y escribí las pruebas negativas de autorización (BOLA/BFLA). Montá cuentas y roles sintéticos.
- **Semana 3 — Idempotencia y trazabilidad.** Sumá la prueba de idempotencia/concurrencia y armá la matriz `amenaza → control → caso → evidencia`.
- **Semana 4 — Gate y ritual.** Meté las pruebas en CI con un gate proporcional (qué bloquea, qué es hallazgo), y definí el ritual: threat modeling como parte del *Definition of Ready* de features sensibles.

Al final del mes tenés un journey modelado, controles verificados con pruebas repetibles, y evidencia trazable. Eso es infinitamente más valioso que "escaneamos todo una vez".

---

## Qué aprendimos / próximos pasos

- Seguridad es una responsabilidad de Quality Engineering ejercida **desde el diseño**, no una etapa final. Su aporte único es la **verificación repetible** de controles.
- El threat modeling útil produce **fichas con dueños y backlog**, no actas que se evaporan.
- La receta central es `amenaza → control → criterio de aceptación → prueba negativa → evidencia`, anclada a una taxonomía verificable (**OWASP API Security Top 10, 2023**) y a debilidades catalogadas (**CWE**).
- Ninguna señal aislada (escáner, cobertura, pipeline verde) equivale a riesgo cero. La honestidad intelectual es parte del oficio.

**Seguí con los satélites de esta colección:**

1. **[BOLA, BFLA e idempotencia: pruebas negativas de autorización en Java](/blog/bola-bfla-idempotencia-pruebas-negativas-api/)** — el código concreto de TM-01 y TM-02.
2. **[Quality gates de seguridad proporcionales en CI/CD](/blog/quality-gates-seguridad-cicd-proporcionales/)** — qué bloquea un merge, quién decide excepciones y qué evidencia se publica.
3. **[Postmortem sin culpas y antipatrones: cómo liderar seguridad desde QA](/blog/postmortem-sin-culpas-antipatrones-liderazgo-qa/)** — el incidente simulado y la práctica de equipo.

---

## Checklist final (aplicable a tu repo)

- [ ] Elegí **un** journey crítico y definiste su activo, actor, regla de negocio, consecuencia y límites de confianza.
- [ ] Dibujaste un DFD simple, declarándolo como vista para modelar amenazas (no arquitectura completa).
- [ ] Hiciste una sesión que terminó con **fichas de amenaza, dueños y backlog** (no un acta muerta).
- [ ] Priorizaste por probabilidad × impacto × contexto, anclando a OWASP API Top 10 (2023) y CWE.
- [ ] Convertiste las amenazas top en **criterios de aceptación de seguridad** en negativo.
- [ ] Tus criterios verifican "deniega según contrato", no un código de estado fijo.
- [ ] Armaste la matriz `amenaza → control → caso → ejecución → evidencia`.
- [ ] Definiste qué evidencia conservás y confirmaste que **no** incluye secretos ni PII.
- [ ] Documentaste, junto a cada afirmación, si es hecho citado, recomendación de estándar o decisión de Nexo.

---

## Fuentes y vigencia

Todas consultadas el **2026-07-09**. Verificá versión y fecha en la URL canónica antes de reutilizar.

- OWASP API Security Top 10 — **edición 2023** (vigente): https://owasp.org/API-Security/
- OWASP Top 10 (web apps) — **edición 2025** (proyecto separado): https://owasp.org/Top10/2025/
- OWASP Threat Modeling Cheat Sheet (documento vivo): https://cheatsheetseries.owasp.org/cheatsheets/Threat_Modeling_Cheat_Sheet.html
- OWASP Application Security Verification Standard — **v5.0.0** (mayo 2025): https://owasp.org/www-project-application-security-verification-standard/
- OWASP Web Security Testing Guide: https://owasp.org/www-project-web-security-testing-guide/
- NIST SP 800-218, SSDF — **v1.1** (final, feb 2022): https://csrc.nist.gov/pubs/sp/800/218/final
- NIST SP 800-207, Zero Trust Architecture — final (ago 2020): https://csrc.nist.gov/pubs/sp/800/207/final
- OpenAPI Specification — **v3.2.0** (sep 2025): https://spec.openapis.org/oas/latest.html
- CWE — línea 4.x, índice canónico: https://cwe.mitre.org/data/

> *Este artículo distingue deliberadamente hechos citados, recomendaciones de estándares, decisiones de diseño de Nexo Finanzas y opiniones. Ninguna afirmación implica que Nexo, un repositorio o una práctica "cumpla", "certifique" o "garantice" una norma o ley. No es asesoramiento legal ni de cumplimiento.*

