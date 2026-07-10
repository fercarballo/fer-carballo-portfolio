---
title: "Consumer-Driven Contract Testing: cuándo vale la pena y cuándo alcanza un OpenAPI gobernado"
description: "Guía de decisión sobre CDCT con Pact: qué verifica realmente, sus costos de gobernanza y cuándo un OpenAPI versionado bien gobernado es suficiente."
pubDate: 2026-07-09
tags: ["contract-testing", "pact", "consumer-driven", "quality-engineering", "gobernanza-apis"]
cluster: "02"
clusterTitle: "API contract testing y sistemas distribuidos"
type: "satelite"
order: 2
repo: "visual-and-contract-testing"
icon: "braces"
iconHue: 28
readingLevel: "Intermedio–Avanzado"
---
**Subtítulo:** Una decisión de arquitectura de calidad, no una moda de herramienta.

> *Nexo Finanzas es ficticio. Los ejemplos son ilustrativos; verificá la sintaxis contra la versión vigente de cada herramienta.*

## El problema

El equipo de plataforma de Nexo propone "hacer contract testing con Pact en todos los servicios este trimestre". Suena responsable. Pero tres semanas después, dos equipos discuten quién es dueño de un `ProviderState`, un pacto roto bloquea un release por un cambio *aditivo*, y nadie sabe si un consumidor del data-lake —que también lee la Transfer API— está cubierto. El problema no era Pact: era adoptarlo **sin decidir cuándo aporta más de lo que cuesta**.

Este artículo es una guía de decisión. Asume que ya distinguís contrato, especificación e integración (ver el pilar: *Contratos de API en una plataforma de transferencias*).

## Qué verifica —y qué no— un contrato consumer-driven

En consumer-driven contract testing (CDCT), **el consumidor** declara las interacciones que necesita; esa expectativa se publica como *pacto*; **el proveedor** la verifica contra su implementación real usando estados controlados ([Pact Docs](https://docs.pact.io/)).

- **Verifica:** que el proveedor responde con la *forma y semántica* que ese consumidor espera, para las interacciones que el consumidor declaró.
- **No verifica:** reglas de negocio no expresadas en el pacto, concurrencia real, integridad contable, autorización de todos los roles, UX, ni la existencia de **consumidores que no publicaron pacto** (por definición, los desconocidos quedan fuera).

**Flujo** (mismo que el diagrama de verificación del pilar): `consumer → registro/broker → provider verification → estado de compatibilidad`. La pieza que hace CDCT *gobernable* es un **broker** que responde "¿puedo desplegar esta versión sin romper a un consumidor?" — en Pact, `can-i-deploy` ([Pact Docs](https://docs.pact.io/)).

## Ejemplo — verificación del proveedor (ilustrativo, desarmado)

```java
@ProviderState("source account has sufficient synthetic balance")
void sourceAccountReady() {
  testData.reset();
  testData.createAccount("acct-source", "USD", "100.00");
  testData.createAccount("acct-target", "USD", "0.00");
}

@ContractVerification
void createTransfer(ProviderClient client) {
  Response response = client.post(
      "/v1/transfers",
      headers("Idempotency-Key", "test-key-001"),
      body("{...synthetic payload...}"));

  assertThat(response.status()).isEqualTo(201);
  assertThat(response.json("$.status")).isEqualTo("PENDING");
}
```

**Bloque por bloque:**
- `@ProviderState(...)`: define un **estado controlado**. El proveedor real debe poder *ponerse* en ese estado con datos **sintéticos** — este es el corazón (y el costo) de CDCT.
- `testData.reset()`: aísla la verificación; sin reset, un pacto contamina a otro.
- `createTransfer`: ejercita la **implementación real** del proveedor, no un mock.
- Los `assertThat`: verifican **una expectativa contractual bajo un estado controlado**.

**Qué NO valida este ejemplo (obligatorio decirlo):** concurrencia real, integridad contable, autorización de *todos* los roles, ni la UX. **Qué deben conservar los artefactos:** versión del contrato, commit, imagen/entorno, logs *sanitizados* y resultado.

## Cuándo CDCT vale la pena

CDCT rinde cuando se cumplen varias de estas condiciones (decisión, no regla universal):

- **Muchos consumidores conocidos e internos**, con equipos que pueden mantener sus pactos.
- **Despliegues independientes** frecuentes donde querés un gate "¿rompo a alguien?" *antes* de integrar.
- **Ownership claro** de estados del proveedor y de los datos de prueba.
- El costo de una falla de integración es alto (aquí: dinero) y el ciclo de e2e es lento.

## Cuándo NO conviene (y qué hacer en su lugar)

- **API pública o con consumidores desconocidos.** CDCT sólo cubre a quien publica pacto. Aquí un **OpenAPI versionado y gobernado** + validación de compatibilidad de esquema (linter en el PR) suele ser más honesto: no promete cubrir a quien no conocés.
- **Un solo consumidor y proveedor en el mismo equipo/repo.** El overhead de broker y estados supera el beneficio; un test de integración directo alcanza.
- **Contrato inestable / producto en exploración temprana.** Vas a pelear con pactos que cambian cada día.
- **Sin capacidad de poner al proveedor en estados controlados.** Sin `ProviderState` reproducible, CDCT degenera en respuestas *hardcodeadas* — el anti-patrón que sigue.

> **Decisión práctica para Nexo:** empezar con **OpenAPI gobernado** para `POST /v1/transfers` (contrato de proveedor versionado, linter de compatibilidad en CI). Introducir **Pact sólo** cuando haya ≥2 consumidores internos que desplieguen por separado y puedan mantener sus pactos. Es una *decisión de diseño*, no una verdad universal.

## Comparación (con trade-offs, sin declarar "el mejor")

| Criterio | OpenAPI gobernado (provider-driven) | CDCT (Pact) |
|---|---|---|
| Cubre consumidores desconocidos | Parcial (spec pública) | **No** (sólo quien publica pacto) |
| Detecta "rompo a un consumidor concreto" | No directamente | **Sí** (`can-i-deploy`) |
| Costo de gobernanza | Bajo–medio | **Medio–alto** (broker, estados, ownership) |
| Requiere estados del proveedor | No | **Sí** |
| Mejor cuando… | 1 owner, API abierta, arranque | Muchos consumers internos, deploys independientes |

Ninguna es "la mejor": **dependen del contexto** (cantidad y tipo de consumidores, madurez del contrato, costo de falla).

## Anti-patrones

| Anti-patrón | Síntoma | Raíz | Impacto | Alternativa |
|---|---|---|---|---|
| **Proveedor "pasa" con respuestas hardcodeadas** | Verificación verde sin ejecutar lógica real | No poder crear `ProviderState` reproducible | Contrato que miente; falsa confianza | Estados con datos sintéticos sobre la implementación real |
| **Pact en todo, sin decidir dónde aporta** | Overhead, pactos frágiles, releases bloqueados por cambios aditivos | Adopción por moda | Fricción y desconfianza en la suite | Decidir por frontera; OpenAPI gobernado donde alcanza |
| **Ignorar consumidores desconocidos** | "Tenemos 100% de pactos" | Confundir *conocidos* con *todos* | Rompés a quien no medías | Declarar el límite; sumar monitoreo posdespliegue |

## Conexión con Nexo Finanzas

1. `nexo-transfer-api`: OpenAPI versionado + linter de compatibilidad en el PR como **primer gate** (sin broker).
2. `nexo-web-banking-e2e` / `nexo-wallet-mobile`: si adoptan Pact, **consumen sólo la API documentada** y declaran interacciones de journeys de alto riesgo.
3. `nexo-quality-platform`: si hay broker, ejecutar `can-i-deploy` antes de integrar; guardar reportes **sanitizados**.
4. **ADR sugerido:** `ADR-000X: contract testing provider-driven ahora, CDCT cuando ≥2 consumers internos`.

## Qué aprendimos / próximos pasos

- CDCT es una **decisión de costo/beneficio**, no un default.
- El broker y los estados del proveedor son el *core* del valor —y del costo—.
- Declará siempre el límite: **los consumidores desconocidos no están cubiertos**.

**Enlaces internos:** el marco general está en el **pilar**; la semántica que tus pactos deben expresar (idempotencia, dinero, estados) está en *Idempotencia, dinero y eventos*; cómo evolucionar sin romper pactos, en *Evolución de contratos y cambios rompientes*.

## Checklist final

- [ ] Conté cuántos consumidores conocidos/desconocidos tiene la frontera.
- [ ] Verifiqué que puedo poner al proveedor en estados controlados y reproducibles.
- [ ] Decidí, por frontera, entre OpenAPI gobernado y CDCT — con un ADR.
- [ ] Ningún proveedor "pasa" con respuestas hardcodeadas.
- [ ] Los artefactos guardan versión, commit, entorno, logs sanitizados y resultado.
- [ ] Documenté cuándo evitar CDCT.

