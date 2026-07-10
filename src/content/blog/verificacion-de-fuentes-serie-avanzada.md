---
title: "Verificación de fuentes de la serie avanzada"
description: "Única fuente de verdad sobre versiones y estados de estándares al 2026-07-10: qué se verificó, qué no pudo verificarse y las siete afirmaciones que la serie se prohíbe hacer."
pubDate: 2026-07-10
tags: ['evidencia', 'fuentes', 'metodo-editorial']
cluster: 'a00'
clusterTitle: "Mapa avanzado y priorización"
type: satelite
order: 4
readingLevel: "Transversal"
icon: 'command'
iconHue: 160
---

**Fecha de consulta: 2026-07-10.** Este documento es la única fuente de verdad sobre versiones y estados de estándares para los 31 artículos de la serie. Si un post afirma una versión, la afirmación se sostiene acá, con enlace y matiz.

Regla aplicada: **ninguna afirmación de versión se escribió de memoria.** Lo que no pudo verificarse contra documentación primaria está en la sección "No verificado" y aparece en los posts marcado como tal.

---

## 1. Verificado contra fuente primaria

| Afirmación usada en los posts | Estado | Matiz que los posts deben conservar | Fuente |
|---|---|---|---|
| **AsyncAPI 3.0.0** es la línea estable de la especificación (publicada 2023-11) | Confirmado | El sitio oficial documenta además **3.1.0**. Los posts fijan `asyncapi: 3.0.0` en los ejemplos y advierten que hay que verificar la versión vigente antes de congelar un contrato. | [asyncapi.com/docs](https://www.asyncapi.com/docs) · [spec releases](https://github.com/asyncapi/spec/releases) |
| **SLSA v1.2** es la versión vigente de la especificación | Confirmado | Build track = niveles **L0–L3** (no hay L4 en v1.0+). El cambio de cabecera de v1.2 es que el **Source track pasó de experimental a approved**. Nunca escribir "SLSA nivel 4". | [slsa.dev/spec/v1.2](https://slsa.dev/spec/v1.2/) |
| **CycloneDX 1.7** es la versión vigente; publicada 2025-10-21 | Confirmado | Estandarizada como **ECMA-424** (publicación de Ecma International el 2025-12-10). Retrocompatible con 1.4–1.6. | [cyclonedx.org/specification/overview](https://cyclonedx.org/specification/overview/) |
| **SPDX 3.0.1** es la versión vigente de la especificación | Confirmado | **La versión ISO sigue siendo SPDX 2.2.1** (ISO/IEC 5962:2021). SPDX 3.0 está en proceso ISO (ISO/IEC DIS 5962). Es incorrecto decir "SPDX 3.0 es norma ISO". | [spdx.github.io/spdx-spec/v3.0.1](https://spdx.github.io/spdx-spec/v3.0.1/) · [ISO/IEC DIS 5962](https://www.iso.org/standard/93810.html) |
| **Sigstore/cosign**: firma keyless con certificados efímeros de Fulcio y registro en Rekor | Confirmado | Línea recomendada **cosign 2.4+**. cosign genera y verifica **attestations in-toto**, y puede almacenarlas en el registry OCI. | [docs.sigstore.dev](https://docs.sigstore.dev/cosign/signing/overview/) |
| **OpenFeature**: SDK de Java **1.x, GA** | Confirmado **con matiz importante** | La **especificación** de OpenFeature está en **0.8.0** (pre-1.0) y el SDK de Java declara conformidad con **spec 0.7.0**. Es decir: *el SDK es GA, la especificación todavía no*. Ningún post puede presentar OpenFeature como estándar cerrado. | [SDK compatibility](https://openfeature.dev/docs/reference/sdks/sdk-compatibility/) |
| **OpenTelemetry semantic conventions 1.43.0** | Confirmado | Las convenciones de **messaging siguen en estado `Development`, no estables.** La transición usa `OTEL_SEMCONV_STABILITY_OPT_IN` (valores `messaging`, `messaging/dup`). Un post sobre eventos **no puede** presentar `messaging.*` como atributos estables. | [semconv](https://opentelemetry.io/docs/specs/semconv/) · [messaging spans](https://opentelemetry.io/docs/specs/semconv/messaging/messaging-spans/) |
| **Pact V4** soporta message pacts (asíncronos) y mensajes síncronos no-HTTP | Confirmado | Límite clave: un message pact verifica que el **handler** del consumidor procesa un mensaje conforme al contrato. **No verifica el broker, ni la serialización en el cable, ni el orden.** | [docs.pact.io](https://docs.pact.io/) · [Pact V4 y plugins](https://pactflow.io/blog/pact-v4-and-plugins/) |
| **NIST AI RMF 1.0** (NIST AI 100-1, ene-2023) y **Generative AI Profile** (NIST AI 600-1, 2024-07-26) | Confirmado | AI RMF 1.0 está en proceso de actualización; la revisión formal con la comunidad se espera **no más tarde de 2028**. | [NIST AI RMF](https://www.nist.gov/itl/ai-risk-management-framework) · [NIST AI 600-1](https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.600-1.pdf) |
| **NIST Privacy Framework 1.0** es la versión final vigente | Confirmado **con matiz** | La **1.1 es borrador** (CSWP 40, *Initial Public Draft*); el período de comentarios cerró el 2025-06-13 y la final se anuncia para 2026. Al 2026-07-10 **no debe citarse la 1.1 como final**. | [NIST Privacy Framework](https://www.nist.gov/privacy-framework) · [PF 1.1 (IPD)](https://csrc.nist.gov/pubs/cswp/40/nist-privacy-framework-11/ipd) |
| **FinOps Framework, edición 2026**: 4 Dominios y 22 Capabilities | Confirmado | La edición 2026 agrega la capability **Executive Strategy Alignment**, consolida **Scopes**, y **expande el alcance más allá de cloud** (AI, SaaS, licencias, datacenter). Varias capabilities fueron renombradas (p. ej. *Workload Optimization* → *Usage Optimization*). | [FinOps Framework](https://www.finops.org/framework/) · [Framework 2026](https://www.finops.org/insights/2026-finops-framework/) |
| **Argo Rollouts**: canary/blue-green con `AnalysisTemplate` que consulta métricas y aborta automáticamente | Confirmado | El análisis automatizado es lo que separa Argo Rollouts de un simple traffic shifting. Argo CD reconoce la salud del `Rollout`. | [argo-rollouts](https://argo-rollouts.readthedocs.io/en/stable/features/canary/) · [Argo CD](https://argo-cd.readthedocs.io/en/stable/) |
| **RFC 9110** define métodos idempotentes; `POST` no lo es | Confirmado (heredado de la primera tanda, revalidado) | El header `Idempotency-Key` sigue siendo **Internet-Draft**, no RFC. | [RFC 9110 §9.2.2](https://www.rfc-editor.org/rfc/rfc9110#name-idempotent-methods) |
| **VEX** tiene cuatro estados (`not_affected`, `affected`, `fixed`, `under_investigation`) y una afirmación `not_affected` **debe** llevar justificación o declaración de impacto | Confirmado | Los requisitos mínimos los publicó el VEX Working Group coordinado por **CISA en abril de 2023**; el documento de *status justifications* es de junio de 2022. VEX **no es un formato único**: puede ir embebido en un SBOM CycloneDX o como documento aparte (p. ej. OpenVEX). | [CISA — Minimum Requirements for VEX](https://www.cisa.gov/sites/default/files/2023-04/minimum-requirements-for-vex-508c.pdf) · [Status Justifications](https://www.cisa.gov/resources-tools/resources/vulnerability-exploitability-exchange-vex-status-justification-document-june-2022) · [OpenVEX](https://github.com/openvex/spec/blob/main/OPENVEX-SPEC.md) |
| **RFC 5737** reserva `192.0.2.0/24`, `198.51.100.0/24` y `203.0.113.0/24` para documentación | Confirmado | TEST-NET-1/2/3. **No deben aparecer en la Internet pública.** Para IPv6, RFC 3849 reserva `2001:db8::/32`. | [RFC 5737](https://www.rfc-editor.org/rfc/rfc5737) · [RFC 3849](https://www.rfc-editor.org/rfc/rfc3849) |
| **BOLA** es `API1:2023` en el OWASP API Security Top 10 | Confirmado | Mantuvo el primer puesto entre las ediciones 2019 y 2023. Se usa en la capa de pruebas de seguridad del capstone (riesgo R-8). | [OWASP API1:2023](https://owasp.org/API-Security/editions/2023/en/0xa1-broken-object-level-authorization/) |

---

## 2. No verificado — marcado como tal en los posts

Estas cosas **no** se afirmaron con versión concreta, o se afirmaron con una advertencia explícita:

- **Versiones de brokers** (Kafka, RabbitMQ, Redpanda, ActiveMQ Artemis). Los posts eligen un broker en un ADR y remiten a su documentación oficial, sin fijar número de versión. Motivo: el número envejece antes que el artículo, y ninguna afirmación del contenido depende de él.
- **Versión de Kubernetes** y de las herramientas de rollout. Se cita el concepto (`Deployment`, probes) y la documentación oficial, no una release.
- **Precios cloud.** No hay un solo número de dinero real en la serie. El post de FinOps usa un modelo de costo **paramétrico** (variables, no valores), precisamente porque un precio sin región, moneda, fecha y fuente es ruido.
- **Cualquier métrica, benchmark, cobertura o resultado de ejecución de Nexo Finanzas.** Nexo es ficticio y **en esta serie no se ejecutó ningún pipeline, test, scanner ni broker.** Todo comando aparece como *propuesta reproducible*, nunca como *resultado obtenido*. Las matrices de confusión, tablas de vulnerabilidades y porcentajes de canary están rotulados como **ilustrativos**.
- **Renderizado de los diagramas Mermaid.** La sintaxis usada es estándar (`flowchart`, `sequenceDiagram`, `stateDiagram-v2`) y las etiquetas son ASCII sin acentos ni paréntesis conflictivos, pero **no se renderizaron** en el motor de destino. Validar antes de publicar.
- **CVEs.** No se inventa ninguno. La tabla de vulnerabilidades del post de supply chain usa identificadores obviamente ficticios con el prefijo `EJEMPLO-`.

---

## 3. Afirmaciones que la serie se prohíbe hacer

Escritas acá para que el control de calidad final pueda buscarlas como cadenas:

1. "Cumplimos PCI DSS / GDPR / PSD2 / BCRA." → La serie **no afirma cumplimiento** de ninguna regulación. Menciona jurisdicción, versión y fecha cuando aparece una norma, y aclara que no es asesoramiento legal.
2. "Exactly-once." → Solo aparece para **explicar por qué el término engaña** y para diferenciarlo de *effectively-once*.
3. "SLSA nivel 4." → No existe en la especificación vigente.
4. "SPDX 3.0 es la norma ISO." → Falso; la ISO vigente pinea 2.2.1.
5. "El SBOM prueba que somos seguros." → El SBOM es un inventario; la serie dedica un post a sus límites.
6. "Este proyecto demuestra escala productiva." → Ningún demo local prueba escalabilidad. Cada README declara qué **no** demuestra.
7. Cualquier número de latencia, throughput, error rate o costo presentado como **medido**. Todos son hipótesis o umbrales de ejemplo, y así están rotulados.

---

## 4. Solapamiento con colecciones ya publicadas en este repositorio

La serie avanzada no vive sola. Hay tres cruces reales que se resolvieron **enlazando y profundizando**, no repitiendo:

| Colección existente | Cruce | Resolución |
|---|---|---|
| `04-ci-cd-continuous-quality/03-satelite-cadena-suministro-sbom-slsa-provenance.md` | Introduce SBOM, SLSA y Sigstore | La serie avanzada **asume** ese satélite como prerrequisito y va a threat model del pipeline, límites del SBOM, VEX/explotabilidad, gestión de excepciones y gate de verificación. Ver `02-supply-chain-security-slsa-sbom/README.md`. |
| `13-quality-engineering-en-fintech/04-reconciliacion-auditoria-observabilidad-financiera.md` | Reconciliación en el dominio fintech | La serie avanzada **no repite** el concepto: entra por lineage, contratos de datos, late-arriving, watermarks y backfill idempotente. Ver `05-data-quality-lineage-y-reconciliacion/README.md`. |
| `13-quality-engineering-en-fintech/02-idempotencia-y-reintentos-en-transferencias.md` | Idempotencia de **API** (`Idempotency-Key`) | La serie avanzada trata idempotencia de **consumidor de eventos** (`eventId` + restricción única en el inbox). Son problemas distintos con la misma palabra. El post `01/02` lo dice explícitamente. |
| `observabilidad-quality-engineering/` | Trazas y contrato de telemetría | La serie avanzada reusa el vocabulario y agrega la advertencia sobre semconv de messaging en estado `Development`. |

---

## 5. Cómo revalidar

Antes de publicar, y cada ~6 meses:

```text
# Estándares (mirar la versión, no el blog de un vendor)
https://www.asyncapi.com/docs/reference/specification
https://slsa.dev/spec-stages
https://cyclonedx.org/specification/overview/
https://spdx.dev/use/specifications/
https://docs.sigstore.dev/
https://openfeature.dev/docs/reference/sdks/sdk-compatibility/
https://opentelemetry.io/docs/specs/semconv/
https://www.finops.org/framework/
https://www.nist.gov/privacy-framework
https://www.nist.gov/itl/ai-risk-management-framework
```

Si una versión cambió, el orden de actualización es: **este archivo primero**, después los posts que lo citan. Cada post lleva `fecha_consulta_fuentes` en el frontmatter para hacer visible la deuda.
