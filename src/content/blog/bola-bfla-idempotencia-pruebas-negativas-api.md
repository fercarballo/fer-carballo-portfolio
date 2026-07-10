---
title: "BOLA, BFLA e idempotencia: pruebas negativas de autorización en una API de transferencias"
description: "Cómo escribir pruebas API negativas que verifican autorización por objeto y por función, y una prueba de idempotencia/concurrencia, con ejemplos ilustrativos en Java/REST Assured sobre la API ficticia Nexo Finanzas."
pubDate: 2026-07-09
tags: ["bola", "bfla", "idempotencia", "rest-assured", "api-security", "sdet", "pruebas-negativas"]
cluster: "08"
clusterTitle: "Seguridad y threat modeling para QA"
type: "satelite"
order: 2
repo: "nexo-transfer-api"
icon: "shield"
iconHue: 0
readingLevel: "Avanzado"
prerequisites: "SDET / QA Automation / backend"
---
> **Este es un artículo satélite.** El marco conceptual —threat modeling, fichas de amenaza, la matriz de trazabilidad— está en el [pilar de la colección](/blog/threat-modeling-para-qa-api-transferencias/). Acá bajamos a código las amenazas **TM-01** (BOLA) y **TM-02** (idempotencia) que definimos allí.

> **Alcance y seguridad.** Todo el código opera contra **Nexo Finanzas**, un entorno ficticio con datos sintéticos. No hay dinero, PII ni servicios de terceros reales. Los ejemplos son **ilustrativos**: muestran *decisiones de prueba*, no son código listo para producción ni deben copiarse sin adaptarlos a tu contrato y tu framework. No incluyen instrucciones para atacar sistemas ajenos.

---

## El problema que casi todos los suites de QA tienen

Revisá tu suite de API. ¿Cuántas pruebas verifican que el login funciona? Probablemente varias. ¿Cuántas verifican que **Ana no puede leer la cuenta de Bruno**? En muchos equipos, cero.

Ese hueco tiene nombre: **Broken Object Level Authorization (BOLA)**, el riesgo **API1:2023** del [OWASP API Security Top 10](https://owasp.org/API-Security/) (edición 2023, consultada 2026-07-09). Es el primero de la lista por una razón: es fácil de introducir (te olvidás una verificación del lado servidor) y fácil de explotar (cambiar un número en una URL). Su hermano funcional, **BFLA (API5:2023)**, es acceder a *funciones* que no te corresponden (por ejemplo, un endpoint administrativo).

La causa raíz de por qué se escapan es conceptual: **autenticación ≠ autorización**. Un token válido responde "sos Ana". No responde "Ana puede tocar *esta* cuenta". Las pruebas que solo verifican "con token entro, sin token no" nunca tocan la segunda pregunta.

Este artículo muestra cómo escribir las pruebas que sí la tocan.

---

## Prerrequisitos

- Leíste (o entendés) el [pilar](/blog/threat-modeling-para-qa-api-transferencias/): fichas de amenaza y la receta `amenaza → control → criterio → prueba negativa → evidencia`.
- Java a nivel conceptual y una librería de pruebas HTTP como **REST Assured** (los ejemplos la usan por su legibilidad `given/when/then`; el patrón se traslada a cualquier cliente HTTP).
- Sabés qué es una clave de idempotencia (un identificador que el cliente envía para que reintentos de la *misma* operación no la ejecuten dos veces).

**Glosario express:**

| Término | Definición |
|---|---|
| **Prueba negativa** | Verifica que el sistema **rechaza** algo que debe rechazar. En seguridad, suelen ser más valiosas que las positivas. |
| **BOLA (API1:2023)** | Autorización rota a nivel de **objeto**: acceder a un recurso ajeno cambiando su identificador. |
| **BFLA (API5:2023)** | Autorización rota a nivel de **función**: invocar una operación/rol que no te corresponde. |
| **Idempotencia** | Propiedad por la cual ejecutar la misma operación N veces produce el mismo efecto que ejecutarla una vez. |

---

## Parte 1 — Prueba negativa de autorización por objeto (BOLA / TM-01)

### Criterio de aceptación que estamos verificando

> "Dado un token válido del usuario A, cuando A solicita los movimientos de una cuenta que pertenece a B, el sistema **debe denegar** el acceso de forma coherente con el contrato, sin filtrar datos de B."

### El montaje: dos usuarios sintéticos distintos

La prueba necesita dos identidades reales del sistema, no mocks. El helper crea (o siembra) dos usuarios sintéticos y devuelve sus tokens y sus IDs de cuenta.

```java
// Ilustrativo. tokenPara() y cuentaDe() encapsulan el alta/seed de datos
// sintéticos y la autenticación. En un repo real vendrían de un fixture
// o de un contenedor efímero, nunca de credenciales productivas.
String tokenDeAna   = tokenPara("ana-sintetica");
String cuentaDeBruno = cuentaDe("bruno-sintetico");
```

Punto no negociable: **jamás uses cuentas o datos productivos en automatización.** En Nexo todo es sintético; en un sistema real, mezclar datos productivos en tests es un antipatrón que expone PII y puede disparar operaciones reales.

### La prueba

```java
@Test
void unaPersonaNoPuedeOperarLaCuentaDeOtraPersona() {
    String tokenDeAna    = tokenPara("ana-sintetica");
    String cuentaDeBruno = cuentaDe("bruno-sintetico");

    given()
        .auth().oauth2(tokenDeAna)             // Ana está autenticada
        .contentType("application/json")
    .when()
        .get("/v1/cuentas/" + cuentaDeBruno + "/movimientos")
    .then()
        .statusCode(codigoDeDenegacionDefinidoPorElContrato());
}
```

### Por qué está escrita así (las decisiones que importan)

1. **El sujeto es legítimo, el objeto es ajeno.** Ana tiene un token perfectamente válido. Eso es lo que hace a BOLA insidioso: no es un problema de autenticación. Si tu prueba usa un token inválido, estás probando otra cosa.

2. **No fijamos `403`.** El código de denegación sale de `codigoDeDenegacionDefinidoPorElContrato()`, no de una constante. Distintas APIs, por diseño legítimo, deniegan con `403` (prohibido), `404` (para no revelar que el objeto existe) u otro código especificado. **Fijar `403` como universal es un error de diseño de la prueba.** La prueba debe seguir al contrato, no imponerle uno.

   > **Trade-off.** `404` protege contra *enumeración* (el atacante no sabe si la cuenta existe) pero puede complicar el debugging legítimo. `403` es más transparente pero revela existencia. Esa decisión es del contrato/diseño, no del test. El test la respeta; el [ADR del artículo de gates](/blog/quality-gates-seguridad-cicd-proporcionales/) la documenta.

3. **Falta un assert crucial: la no-filtración.** El ejemplo verifica el código, pero un control robusto también verifica que el *cuerpo* no contenga datos de B. Una mejora:

```java
    .then()
        .statusCode(codigoDeDenegacionDefinidoPorElContrato())
        .body("$", not(hasKey("movimientos")));   // no se filtran datos de B
```

   Verificar solo el status deja pasar el caso peligroso: deniega con `403` **pero** incluye los datos en el body "por las dudas". El control real es "no filtrar", no "responder con cierto número".

### Cobertura por rol, objeto y función

Una sola prueba no alcanza. BOLA/BFLA se cubren con una **matriz** de combinaciones (esto se parametriza, no se copia-pega):

| Sujeto | Objeto/Función | Esperado |
|---|---|---|
| Ana (dueña) | cuenta de Ana | permitido |
| Ana | cuenta de Bruno | denegado (BOLA) |
| Ana (rol usuario) | endpoint admin de reverso | denegado (BFLA) |
| Admin sintético | endpoint admin de reverso | permitido |
| sin token | cualquier cuenta | denegado (autenticación) |

La fila "Ana → cuenta de Ana = permitido" existe para no engañarte: si tu control deniega *todo*, tus pruebas negativas pasan pero el producto está roto. Necesitás el caso positivo como ancla.

> **Reportá esto separado de la cobertura de líneas.** "12 pruebas de autorización por objeto/función, 12 en verde" es una métrica de seguridad. "85% de cobertura de líneas" es otra cosa. Mezclarlas oculta huecos: podés tener 85% de líneas y 0 pruebas de BOLA.

---

## Parte 2 — Idempotencia y concurrencia (TM-02)

### El riesgo

En un flujo de dinero, ejecutar dos veces la "misma" transferencia por un reintento de red o un doble click es un **doble débito**. El control es la **idempotencia**: el cliente envía una clave (`Idempotency-Key`) y el servidor garantiza que reintentos con la misma clave produzcan **una sola** operación en el ledger.

Esto se relaciona con la debilidad de procesamiento duplicado (ver [CWE-837, Improper Enforcement of a Single, Unique Action](https://cwe.mitre.org/data/definitions/837.html), consultado 2026-07-09).

### El criterio de aceptación

> "Dada una transferencia válida con clave idempotente `K`, cuando se envía la misma solicitud con `K` más de una vez (secuencial o concurrentemente), el sistema **debe** registrar **una sola** operación en el ledger, devolver respuestas coherentes entre sí y emitir un evento de auditoría correlacionable."

### Pseudocódigo de la prueba

Uso pseudocódigo (no Java completo) a propósito: la lógica de verificación importa más que la sintaxis del cliente HTTP.

```text
# Prueba: reenvío con misma clave idempotente ⇒ una sola operación
PREPARAR:
    ana        = usuario_sintetico("ana")
    origen     = cuenta_de(ana)
    destino    = destinatario_sintetico_de(ana)
    K          = uuid()                 # clave idempotente única para esta operación
    payload    = { origen, destino, monto: 100, idempotencyKey: K }

EJECUTAR (secuencial):
    r1 = POST /v1/transferencias  con header Idempotency-Key=K  y payload
    r2 = POST /v1/transferencias  con header Idempotency-Key=K  y payload   # reenvío

VERIFICAR:
    # 1) Respuestas coherentes: ambas describen la MISMA operación
    assert r1.referenciaOperacion == r2.referenciaOperacion
    assert r2.status coherente_con_contrato   # p.ej. 200 con misma referencia, no una segunda creación

    # 2) Efecto único en el ledger
    ops = ledger.operaciones_para(referencia = r1.referenciaOperacion)
    assert count(ops) == 1                     # el corazón de la prueba

    # 3) Auditoría correlacionable, sin secretos
    ev  = auditoria.eventos_para(correlationId = r1.correlationId)
    assert existe(ev) y ev.no_contiene(token, pii, payload_sensible)
```

Y la variante de **concurrencia**, que es la que atrapa los bugs reales:

```text
EJECUTAR (concurrente):
    lanzar en paralelo:
        r1 = POST /v1/transferencias  Idempotency-Key=K  payload
        r2 = POST /v1/transferencias  Idempotency-Key=K  payload

VERIFICAR:
    # Aun con race condition, el ledger no debe duplicar
    ops = ledger.operaciones_para(referencia_comun(r1, r2))
    assert count(ops) == 1
    # Nota: una de las dos puede devolver "en curso"/conflicto según el contrato.
    # Verificamos el INVARIANTE (una sola op), no un timing específico.
```

### Las decisiones que importan

1. **El invariante es "una sola operación en el ledger", no "ambas devuelven 200".** El timing exacto de dos requests concurrentes es no determinista; lo que *no* puede variar es que haya un solo débito. Escribí el assert contra el invariante, no contra el timing, o tendrás una prueba inestable (*flaky*).

2. **Idempotencia no sustituye autorización ni consistencia transaccional.** Son controles ortogonales:
   - La clave idempotente evita *duplicar* una operación autorizada. **No** verifica que Ana pueda operar esa cuenta (eso es BOLA, Parte 1).
   - Tampoco garantiza *consistencia transaccional* (que débito y crédito ocurran atómicamente). Esa es una propiedad del diseño del ledger, verificada con otras pruebas.
   
   Un error común es creer que "pusimos Idempotency-Key" cierra el tema de dinero duplicado *y* de autorización. Son problemas distintos con controles distintos.

3. **La auditoría se correlaciona por ID, no por payload.** Guardamos un `correlationId` que enlaza request, operación de ledger y evento de auditoría, **sin** guardar el token ni el payload sensible. Esto permite trazar sin crear un vector de fuga (ver la sección de evidencia del [pilar](/blog/threat-modeling-para-qa-api-transferencias/)).

> **Anti-patrón: probar solo el happy path de la transferencia.**
> **Causa:** el flujo feliz es fácil de escribir y "demuestra que anda".
> **Daño:** no verifica ninguno de los controles que importan (autorización, no-duplicación). Un pipeline lleno de happy paths verdes da falsa confianza.
> **Alternativa:** por cada happy path de un flujo sensible, exigí al menos una prueba negativa de autorización y una de idempotencia. La regla en Nexo: "el dinero se mueve una vez, y solo quien puede lo mueve".

---

## Dónde vive cada prueba y qué NO prueba

| Prueba | Nivel | Verifica | **No** verifica |
|---|---|---|---|
| BOLA (Parte 1) | Integración/API | Autorización por objeto | Que el UI oculte el botón (eso es otra prueba); consistencia del ledger |
| BFLA (matriz) | Integración/API | Autorización por función/rol | Lógica interna de cálculo de permisos (eso es unidad) |
| Idempotencia secuencial | Integración/API | No-duplicación en reintento | Race conditions reales |
| Idempotencia concurrente | Integración/API | Invariante bajo carrera | Consistencia transaccional débito/crédito |

Ser explícito sobre lo que una prueba **no** cubre es una marca de criterio senior. Evita el peor error de todos: creer que una prueba verde "elimina" un riesgo. **Ninguna prueba exitosa elimina un riesgo; solo aporta evidencia de que un control funcionó bajo las condiciones probadas.**

---

## Evidencia reproducible

Para que otra persona reproduzca el aprendizaje localmente, documentá:

- **Entorno:** contra qué instancia efímera de Nexo corren (contenedor local sembrado con datos sintéticos), versión de Java y de la librería HTTP, y el commit bajo prueba.
- **Comando:** el invocador (por ejemplo, una tarea `./gradlew securityApiTest`) y sus prerequisitos (levantar el entorno efímero primero).
- **Resultado esperado:** las pruebas de la matriz BOLA/BFLA en verde y el conteo de ledger = 1 en las de idempotencia.
- **Limitaciones:** los helpers `tokenPara`/`cuentaDe` y el servicio externo simulado son andamiaje de demo; no representan la seguridad real de un banco.

> **No inventamos números.** Este artículo **no** reporta cobertura, cantidad de tests que "pasaron", ni benchmarks. Esos valores dependen de tu repositorio real. Lo que entregamos es el *diseño* de las pruebas y qué medir; los números los produce tu ejecución.

---

## Qué aprendimos / próximos pasos

- Las pruebas de seguridad de API más valiosas son **negativas** y verifican **autorización por objeto y función**, no solo autenticación.
- No fijes códigos de estado: verificá "deniega según contrato" y **no filtra datos**.
- La idempotencia se prueba contra un **invariante** (una sola operación), no contra un timing. Y no sustituye autorización ni consistencia transaccional.
- Sé explícito sobre lo que cada prueba **no** cubre.

**Continuá:**
- **[Quality gates de seguridad en CI/CD](/blog/quality-gates-seguridad-cicd-proporcionales/)** — cómo corren estas pruebas en cada PR, qué bloquea un merge y quién decide excepciones.
- **[Postmortem sin culpas y antipatrones](/blog/postmortem-sin-culpas-antipatrones-liderazgo-qa/)** — qué pasa cuando una de estas pruebas *debería* haber existido y no existía.
- Volvé al **[pilar](/blog/threat-modeling-para-qa-api-transferencias/)** para la matriz de trazabilidad completa.

---

## Checklist final

- [ ] Por cada flujo sensible tenés al menos una prueba negativa de **autorización por objeto** (BOLA).
- [ ] Tenés una matriz de **autorización por función/rol** (BFLA) con un caso positivo de ancla.
- [ ] Tus pruebas verifican "deniega según contrato" **y** "no filtra datos", no un `403` fijo.
- [ ] Tenés una prueba de **idempotencia** secuencial y una **concurrente**, ambas contra el invariante "una sola operación".
- [ ] Usás exclusivamente **datos y cuentas sintéticas**; cero datos productivos.
- [ ] La evidencia se correlaciona por ID, **sin** guardar tokens, PII ni payloads sensibles.
- [ ] Reportás las pruebas de autorización **separadas** de la cobertura de líneas.

---

## Fuentes y vigencia

Consultadas el **2026-07-09**.

- OWASP API Security Top 10 (2023) — API1 (BOLA), API5 (BFLA): https://owasp.org/API-Security/
- CWE-639, Authorization Bypass Through User-Controlled Key: https://cwe.mitre.org/data/definitions/639.html
- CWE-837, Improper Enforcement of a Single, Unique Action: https://cwe.mitre.org/data/definitions/837.html
- OpenAPI Specification v3.2.0 (contratos y respuestas de error): https://spec.openapis.org/oas/latest.html

> *Ejemplos ilustrativos con datos ficticios. No es código de producción ni asesoramiento de seguridad para un sistema real. Distingo hechos citados (OWASP/CWE) de decisiones de diseño de Nexo Finanzas.*

