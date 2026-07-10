---
title: "Evolución de contratos y cambios rompientes en APIs y eventos"
description: "Cómo evolucionar contratos de API y eventos sin romper consumidores: aditivo vs. rompiente, compatibilidad, versionado, deprecación y convivencia."
pubDate: 2026-07-09
tags: ["versionado-apis", "compatibilidad", "contract-testing", "gobernanza-apis", "eventos"]
cluster: "02"
clusterTitle: "API contract testing y sistemas distribuidos"
type: "satelite"
order: 4
icon: "braces"
iconHue: 28
readingLevel: "Intermedio–Avanzado"
---
**Subtítulo:** Cambiar es inevitable; romper consumidores en silencio, no.

> *Nexo Finanzas es ficticio. Verificá versiones y sintaxis contra las ediciones vigentes de cada especificación.*

## El problema

`GET /v1/transfers/{id}` de Nexo devuelve `status: "PENDING" | "SETTLED" | "REJECTED"`. Producto pide agregar `"HELD"` (retención por control de fraude). Parece aditivo. Pero **Reconciliation** tiene un `switch` sin `default` y, al recibir `"HELD"`, lanza excepción. Un valor "agregado" rompió a un consumidor. La pregunta de este artículo: **¿cómo decido si un cambio es rompiente, y cómo lo despliego sin sorpresas?**

Asume el marco del pilar (*Contratos de API en una plataforma de transferencias*).

## Qué es "rompiente" (definición operativa)

Un cambio es **rompiente** si un consumidor *válido existente* deja de funcionar sin cambiar su código. La clave es **quién** consume y **cómo**:

- **Compatibilidad hacia atrás (backward):** consumidores viejos siguen funcionando con datos/respuestas nuevas. Se rompe al **quitar** o **restringir**.
- **Compatibilidad hacia adelante (forward):** consumidores nuevos toleran datos viejos. Depende de que el consumidor **ignore lo que no conoce**.

**El caso `"HELD"` enseña la asimetría:** agregar un valor a un `enum` de **respuesta** es rompiente para un consumidor que enumera exhaustivamente; agregar un valor aceptado en un **request** es rompiente para el proveedor viejo. **Dirección importa.**

<figure class="diagram">
  <img src="/blog/diagrams/evolucion-contratos-cambios-rompientes-apis-eventos-1.svg" width="530" height="665" alt="Diagrama: evolucion-contratos-cambios-rompientes-apis-eventos (1)" loading="lazy" decoding="async" />
</figure>

## Clasificación de cambios (con dirección)

| Cambio | ¿Rompiente? | Depende de |
|---|---|---|
| Agregar campo **opcional** en response | Normalmente no | Que el consumidor ignore lo desconocido |
| Agregar campo **requerido** en request | **Sí** | Rompe a clientes viejos |
| Quitar/renombrar un campo | **Sí** | — |
| Agregar valor a `enum` de **response** | **Sí** para consumidores que enumeran exhaustivo | Manejo de default del consumidor |
| Agregar valor a `enum` de **request** | **Sí** para el proveedor viejo | Validación del proveedor |
| Cambiar **tipo** (`"100.00"` → `100.0`) | **Sí** | — |
| Cambiar **semántica** con el mismo nombre | **Sí (el peor)** | Ninguna herramienta de esquema lo detecta |

> **El más peligroso** es cambiar la **semántica** manteniendo el nombre y el tipo: `amount` que pasa de "monto bruto" a "monto neto" valida contra el esquema y descuadra la contabilidad. Un JSON Schema **no** lo detecta; requiere revisión humana del contrato y pruebas de integración.

## Estrategia de versionado (trade-offs, sin universalismos)

- **Aditivo compatible → sin nueva versión mayor.** Preferí evolucionar en el lugar (tolerant reader del lado consumidor).
- **Rompiente → versión mayor explícita** con **periodo de convivencia**: `v1` y `v2` conviven, `v1` se marca **deprecada** con fecha, se comunica a consumidores conocidos, y recién luego se retira.
- **Versionar por URL** (`/v1/…`, `/v2/…`) es simple para rupturas mayores; **por media type** (`application/vnd.nexo.transfer.v2+json`) es más granular. Elegí uno y documentá la política.

**Anti-patrón:** versionar por URL en **cada cambio menor** sin política de compatibilidad ni deprecación → proliferación de versiones que nadie retira. **Alternativa:** reservá versión mayor para rupturas reales; lo aditivo va sin bump.

Concepto de apoyo (no obligación): **Semantic Versioning** distingue major/minor/patch de forma útil para comunicar intención de compatibilidad ([semver.org](https://semver.org/)). En eventos, muchas plataformas resuelven esto con un **schema registry** y reglas de compatibilidad (backward/forward/full).

## Eventos: evolución de mensajes

El mismo criterio aplica al evento `transfer.created` (ver *Idempotencia, dinero y eventos*):

- Agregar un campo **opcional** al payload: compatible si los consumidores ignoran lo desconocido.
- Agregar valor a `status` (`enum: [PENDING]` → `[PENDING, HELD]`): **rompiente** para consumidores que enumeran exhaustivo — igual que en HTTP.
- **Regla práctica:** consumidores **tolerantes** (ignoran campos extra, tienen `default`) hacen que la mayoría de los cambios aditivos sean seguros. La tolerancia es una **decisión de diseño del consumidor**, y conviene contratarla.

## Cómo la verificación de contrato ayuda —y dónde no llega

- **Detecta:** cambios de forma que rompen a consumidores **con contrato/pacto** (un `can-i-deploy` falla; ver *Consumer-Driven Contract Testing*).
- **No detecta:** cambios de **semántica** con misma forma; ni el impacto en consumidores **desconocidos**. Para eso: revisión humana del contrato, changelog explícito y **monitoreo posdespliegue**.

## Proceso de cambio sugerido (accionable)

1. **Clasificá** el cambio con la tabla (aditivo vs. rompiente, y en qué dirección).
2. Si es rompiente: **versión mayor** + periodo de convivencia + fecha de deprecación.
3. **Comunicá** a consumidores conocidos (changelog, header `Deprecation`/`Sunset` cuando aplique).
4. **Verificá** compatibilidad en CI (linter de esquema + pactos si existen).
5. **Monitoreá** post-release el uso de la versión vieja antes de retirarla.

## Anti-patrones

| Anti-patrón | Síntoma | Raíz | Impacto | Alternativa |
|---|---|---|---|---|
| **Cambiar tipo/semántica con el mismo nombre** | Consumidores descuadran sin error de esquema | Creer que "mismo nombre = mismo significado" | Bugs silenciosos, contables | Nuevo campo + deprecación del viejo; revisión humana |
| **Versionar por URL cada cambio menor** | Muchas versiones vivas, ninguna retirada | Sin política de compatibilidad | Costo de mantenimiento y confusión | Aditivo sin bump; versión mayor sólo para rupturas |
| **Deprecar sin fecha ni aviso** | Consumidores rotos "de golpe" | Falta de convivencia y comunicación | Incidentes evitables | `Deprecation`/`Sunset`, periodo de convivencia, changelog |

## Conexión con Nexo Finanzas

1. `nexo-transfer-api`: **política de versionado** documentada + **linter de compatibilidad** de OpenAPI en el PR como gate.
2. `nexo-quality-platform`: correr el diff de contrato y (si hay pactos) `can-i-deploy` antes de integrar; publicar changelog sanitizado.
3. `nexo-quality-control-tower`: relacionar cambio ↔ consumidores afectados ↔ estado de deprecación ↔ evidencia.
4. **ADR sugerido:** `ADR-000Y: política de compatibilidad y deprecación de la Transfer API`.

## Qué aprendimos / próximos pasos

- "Aditivo" no es sinónimo de "seguro": **la dirección y el manejo del consumidor** deciden.
- El cambio **semántico con mismo nombre** es el más peligroso y el que ninguna herramienta de esquema atrapa.
- Toda ruptura merece **versión mayor + convivencia + comunicación**, no un despliegue silencioso.

**Enlaces internos:** el marco en el **pilar**; qué expresan tus contratos (idempotencia, estados) en *Idempotencia, dinero y eventos*; cómo los pactos detectan rupturas en *Consumer-Driven Contract Testing*.

## Checklist final

- [ ] Clasifiqué el cambio (aditivo/rompiente) **y su dirección** (request/response, backward/forward).
- [ ] Revisé si hay cambio de **semántica** con el mismo nombre (revisión humana).
- [ ] Rupturas → versión mayor + periodo de convivencia + fecha de deprecación.
- [ ] Comuniqué a consumidores conocidos; declaré que los desconocidos no están cubiertos.
- [ ] Verifiqué compatibilidad en CI y planifiqué monitoreo posdespliegue.

