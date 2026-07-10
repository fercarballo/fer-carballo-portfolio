---
title: "Cadena de suministro en el pipeline: SBOM, provenance y firma"
description: "Seguridad de cadena de suministro en CI/CD: SBOM con CycloneDX, provenance SLSA v1.2, firma keyless Sigstore e imágenes por digest, con límites honestos."
pubDate: 2026-07-09
tags: ["supply-chain-security", "sbom", "slsa", "sigstore", "ci-cd"]
cluster: "04"
clusterTitle: "CI/CD y continuous quality"
type: "satelite"
order: 3
icon: "infinity"
iconHue: 200
readingLevel: "Avanzado"
prerequisites: "(QE, Sec/Platform Eng). Requiere Docker y nociones de firma criptográfica."
---
> **Advertencia de uso.** Los comandos y fragmentos son **ilustrativos** y deben validarse contra la versión vigente de cada herramienta. **No** incluyas secretos, tokens ni imágenes privadas en YAML, logs ni evidencia. Este artículo describe controles de ingeniería; **no** es asesoramiento de cumplimiento ni certificación de seguridad.

*Satélite de [Continuous Quality: pipeline de evidencia proporcional al riesgo](/blog/continuous-quality-pipeline-basado-en-riesgo/).*

## Resumen ejecutivo

- La seguridad de cadena de suministro responde: **¿qué contiene mi artefacto, cómo se construyó y puedo probarlo?** Son tres preguntas distintas: SBOM, provenance y firma.
- **SBOM** (inventario de componentes) ≠ **provenance** (cómo/dónde se construyó) ≠ **firma** (autenticidad e integridad). Se complementan; ninguna reemplaza a las otras.
- Estándares vigentes (consultados 2026-07-09): **CycloneDX 1.7** para SBOM (también estandarizado como **ECMA-424**); **SLSA v1.2** para provenance (¡ojo: v1.1 quedó *retirada*!); **Sigstore/Cosign** para firma keyless.
- Un **scanner de vulnerabilidades es una señal, no un veredicto**. Verde no significa "seguro"; rojo no siempre significa "explotable". La revisión humana sigue siendo parte del sistema.
- Fijá versiones e imágenes **por digest inmutable**; usá **identidad de workload (OIDC)** en vez de secretos de larga vida; aplicá **mínimo privilegio**.

---

## 1. El problema: no sabemos qué desplegamos

En Nexo Finanzas (ficticia; datos sintéticos), un aviso de seguridad reporta una vulnerabilidad crítica en una librería de serialización. La pregunta del equipo de respuesta es simple y, sin embargo, no la pueden responder: **"¿la imagen de `nexo-transfer-api` que está en producción incluye esa librería, y en qué versión?"**.

Sin un inventario (SBOM), la respuesta es "revisemos a mano". Sin trazabilidad de cómo se construyó esa imagen (provenance), no saben *qué código y qué dependencias* entraron. Y sin firma, no pueden probar que la imagen desplegada es la que su pipeline produjo y no una sustituida.

Estas tres carencias corresponden a las tres capas de este artículo. Ninguna es opcional cuando manejás dinero, pero **se implementan por necesidad demostrada y en orden**, no todas de golpe.

---

## 2. Tres preguntas, tres artefactos

| Pregunta | Artefacto | Estándar de referencia | Qué NO responde |
|---|---|---|---|
| ¿Qué contiene? | **SBOM** | [CycloneDX 1.7](https://cyclonedx.org/specification/overview/) (ECMA-424) | si esos componentes son explotables |
| ¿Cómo/dónde se construyó? | **Provenance** | [SLSA v1.2](https://slsa.dev/spec/v1.2/) | que el código fuente sea correcto |
| ¿Es auténtico e íntegro? | **Firma / attestation** | [Sigstore/Cosign](https://docs.sigstore.dev/cosign/signing/overview/) | que el firmante tenga buenas intenciones |

La confusión típica es pedirle a una capa lo que da otra. Un SBOM perfecto no prueba que la imagen no fue manipulada; una firma válida no te dice qué librerías incluye. Se usan **juntas**.

---

## 3. SBOM con CycloneDX 1.7

Un **SBOM** (Software Bill of Materials) es el inventario de componentes de tu artefacto: librerías, versiones, licencias y relaciones. [CycloneDX](https://cyclonedx.org/specification/overview/) es un estándar de OWASP; su versión vigente es **1.7** (cerrada en febrero de 2026) y desde 2024 está también publicado como estándar **ECMA-424** (verificado 2026-07-09).

Generación ilustrativa (Maven, ecosistema Java de Nexo):

```bash
# ILUSTRATIVO — verificá la versión/goal del plugin vigente
./mvnw org.cyclonedx:cyclonedx-maven-plugin:makeAggregateBom \
  -DoutputFormat=json \
  -DoutputName=sbom.cdx
# Produce target/sbom.cdx.json  (CycloneDX JSON)
```

Qué hacer con el SBOM:

- **Publicarlo como evidencia** del release (ver §7), asociado al **digest** de la imagen, no a un tag mutable.
- **Consultarlo ante un CVE**: "¿qué releases incluyen el componente X?". Ese es exactamente el caso que abrió el artículo.
- **NO** tratarlo como prueba de ausencia de vulnerabilidades: un SBOM lista lo que hay; el análisis de si eso es explotable es otro paso.

> **Límite honesto (inferencia).** La calidad del SBOM depende de cómo se genera. Un SBOM que solo lista dependencias declaradas puede omitir componentes traídos por el sistema base de la imagen. Por eso conviene generar SBOM del artefacto **y** de la imagen final, y declarar el método.

---

## 4. Provenance con SLSA v1.2 (y por qué v1.1 ya no)

**Provenance** es metadata verificable sobre **cómo y dónde** se construyó el artefacto: qué fuente, qué builder, qué parámetros. El marco de referencia es [SLSA](https://slsa.dev/spec/v1.2/).

> **Corrección de vigencia importante.** El encargo original apuntaba a *SLSA v1.1*. Verificado el 2026-07-09, **v1.1 figura como "Retired"** en el sitio oficial y la versión **Approved/actual es v1.2**. Uso v1.2 como fuente primaria. Es un buen recordatorio de por qué se verifican los estándares antes de publicar: las versiones se mueven.

El **Build track** de SLSA define niveles de garantía crecientes (descripción conceptual; consultá la [especificación v1.2](https://slsa.dev/spec/v1.2/) para el texto normativo):

| Nivel | Idea central | Qué agrega |
|---|---|---|
| **Build L1** | Existe provenance | El build genera metadata de cómo se produjo el artefacto; consumible pero no necesariamente resistente a manipulación. |
| **Build L2** | Provenance firmada por un servicio de build hospedado | Autenticidad: la provenance viene de una plataforma de build y está firmada, dificultando la falsificación tras el build. |
| **Build L3** | Plataforma de build endurecida | La provenance es difícil de falsificar incluso para quien controla el job; builds aislados/efímeros. |

**Qué NO afirma SLSA (crítico):**

- Alcanzar un nivel **no** certifica que tu software sea seguro ni que cumplas una regulación. SLSA mide **integridad del proceso de build**, no corrección del código.
- No hay "certificación automática por tener carpetas de evidencia". El nivel se sostiene con **mecanismos reales** (builder hospedado, firma, aislamiento), no con una convención de nombres.

> **Anti-patrón:** decir "tenemos SLSA L3" porque guardamos archivos de provenance en un directorio. El nivel depende de propiedades del **builder** y de la firma, no de dónde guardás los JSON.

---

## 5. Firma keyless con Sigstore/Cosign

Firmar prueba **autenticidad** (quién) e **integridad** (no fue alterado). [Sigstore/Cosign](https://docs.sigstore.dev/cosign/signing/overview/) permite firma **keyless**: en vez de manejar claves privadas de larga vida, usa una identidad **OIDC** del pipeline; Fulcio emite un certificado de corta duración y Rekor registra la firma en un log de transparencia (verificado 2026-07-09).

```bash
# ILUSTRATIVO — firma keyless de una imagen por digest
# La identidad OIDC la provee el CI; NO hay clave privada persistida.
cosign sign \
  registry.example/nexo-transfer-api@sha256:<DIGEST>

# Adjuntar una attestation con el SBOM (in-toto)
cosign attest \
  --predicate target/sbom.cdx.json \
  --type cyclonedx \
  registry.example/nexo-transfer-api@sha256:<DIGEST>
```

Puntos clave:

- **Se firma el `@sha256:<DIGEST>`**, nunca un tag mutable. Firmar `:latest` es firmar "lo que sea que apunte ese tag ahora": inútil como garantía.
- **Keyless con OIDC** elimina el secreto de larga vida que, si se filtra, compromete todo. La identidad es efímera y el evento queda en un log de transparencia (Rekor).
- GitLab documenta el uso nativo de Sigstore para firma keyless en pipelines (ver [signing examples](https://docs.gitlab.com/ci/yaml/signing_examples/), consultado 2026-07-09).
- **Verificación en deploy:** el paso de despliegue puede exigir firma válida antes de admitir la imagen. La firma no sirve si nadie la verifica.

> **Límite honesto.** Una firma válida prueba que *esa identidad* firmó *ese digest*. No prueba que el contenido sea seguro ni que el firmante sea confiable: eso depende de tu política de qué identidades aceptás.

---

## 6. Dependencias, scanners e imágenes inmutables

**Señales de dependencias.** Herramientas como [OpenSSF Scorecard](https://scorecard.dev/) (verificado 2026-07-09: ~18 checks en 3 temas —prácticas de seguridad, riesgo de código fuente y riesgo del proceso de build) ayudan a **enmarcar** el riesgo de un proyecto del que dependés. Pero un *score* es una señal agregada, **no un veredicto**: un 8/10 no significa "seguro" y un 4/10 no significa "no usar".

**Scanners de vulnerabilidades.** Un SAST o un escáner de imágenes produce una lista de hallazgos. Tratar esa lista como garantía es el anti-patrón más común:

- **Falsos positivos:** un CVE reportado puede no ser alcanzable en tu uso.
- **Falsos negativos:** el scanner solo conoce lo que está en su base; no ve el 0-day de mañana.
- **Verde ≠ seguro:** significa "no encontré lo que sé buscar", no "no hay problemas".

*Alternativa:* usar el scanner como **una** señal dentro del gate (ver [gates auditables](/blog/quality-gates-auditables-policy-as-code/)), con umbrales por severidad **y** revisión humana para lo crítico. Documentá qué scanner, qué versión de base de datos y cuándo corrió.

**Imágenes inmutables.** Todo lo anterior se apoya en una base: **fijar por digest**.

```dockerfile
# ILUSTRATIVO — base fijada por digest, no por tag mutable
FROM eclipse-temurin:21-jre@sha256:<DIGEST>
```

Un tag como `21-jre` puede cambiar de contenido con el tiempo; el `@sha256:` no. Sin inmutabilidad, tu SBOM, provenance y firma describen algo que ya no es lo que corre.

---

## 7. Estructura de evidencia (qué se guarda y qué NO)

Retomamos la estructura del encargo y la explicamos con criterio de acceso y retención.

```text
evidence/
  2026-07-09/
    commit.txt              # sha del commit (fuente)
    source-digest.txt       # digest del arbol fuente
    image-digest.txt        # digest de la imagen construida
    sbom.cdx.json           # SBOM CycloneDX del artefacto/imagen
    unit-junit.xml          # reporte de tests
    contract-report.json    # reporte de contrato
    smoke-junit.xml         # reporte de smoke
    release-decision.json   # gate + excepcion si aplica
    sanitized-trace-links.md# enlaces a trazas SANEADOS
```

**Reglas:**

- **Qué va en artifacts de CI:** reportes y digests del build actual, con retención acotada (`expire_in`).
- **Qué va en un repositorio de evidencia** (más duradero, acceso controlado): SBOM, provenance, decisión de release, para poder responder auditorías y CVEs meses después.
- **Qué NO se persiste jamás:** secretos, tokens, PII, datos bancarios reales, URLs internas, screenshots sin sanear. Los enlaces a trazas deben ser **saneados** (sin identificadores personales).
- **Acceso mínimo y borrado:** la evidencia puede contener información sensible aunque sanitizada; definí quién accede y cuándo se borra.

> **Aclaración crítica (fact).** Una **estructura de carpetas no constituye provenance verificable** por sí sola. La provenance verificable depende del mecanismo de la plataforma (builder que la emite y firma) y de la [especificación SLSA v1.2](https://slsa.dev/spec/v1.2/). Guardar un `provenance.json` a mano no equivale a generar provenance confiable.

---

## 8. Secretos e identidad de workload

- **Nunca** en YAML, logs, imágenes, fixtures ni variables sin protección (ver anti-patrones del pilar).
- Usá **variables protegidas/enmascaradas** del CI para secretos que aún necesites.
- Preferí **identidad de workload / OIDC**: el pipeline obtiene un token efímero para hablar con el registry o el gestor de secretos, sin claves de larga vida. Es el mismo principio que habilita la firma keyless (§5).
- **Mínimo privilegio:** el runner que construye no necesita permisos de deploy a producción; separá roles.

---

## 9. Conexión con Nexo Finanzas y hoja de ruta

- **`nexo-transfer-api`**: genera SBOM (CycloneDX) e imagen por digest; publica reportes JUnit.
- **`nexo-quality-platform`**: aloja la configuración de firma/verificación, la política de qué identidades se aceptan y un ADR de cadena de suministro.
- **`nexo-quality-control-tower`**: correlaciona un CVE con los releases afectados usando SBOMs.

**Orden incremental (no todo de golo):**

1. **SBOM primero** (barato, alto valor para respuesta a incidentes).
2. **Imágenes por digest + verificación de firma en deploy** (integridad).
3. **Provenance** cuando el proceso de build lo justifique (avanzar hacia SLSA L2/L3 con builder hospedado y firma).
4. **Scanners** integrados como señal en el gate, con revisión humana.

Cada paso **valida una hipótesis** ("puedo responder qué contiene un release") y **deja claro lo que aún no resuelve** ("no garantiza ausencia de vulnerabilidades").

---

## 10. Qué aprendimos y próximos pasos

- SBOM, provenance y firma responden preguntas **distintas**; se usan juntas.
- Verificá los estándares antes de publicar: SLSA saltó de v1.1 (retirada) a **v1.2**.
- Un scanner es una señal; la seguridad no se "certifica" con un pipeline verde.
- La inmutabilidad por digest es la base sobre la que se apoya todo lo demás.

**Enlaces internos:**

- [Continuous Quality (pilar)](/blog/continuous-quality-pipeline-basado-en-riesgo/)
- [Quality gates auditables](/blog/quality-gates-auditables-policy-as-code/) — cómo el scanner entra como señal, no como veredicto.
- [GitLab CI y Jenkins sin autoridad duplicada](/blog/gitlab-ci-jenkins-fuente-de-verdad-por-commit/).

## Checklist de cadena de suministro

- [ ] Genero SBOM (CycloneDX) asociado al digest de la imagen.
- [ ] Fijo imágenes y bases por `@sha256:<digest>`, no por tag.
- [ ] Firmo el digest (no tags) y **verifico** la firma en deploy.
- [ ] Uso OIDC / identidad de workload en vez de secretos de larga vida.
- [ ] Trato los scanners como señal, con umbrales y revisión humana.
- [ ] No persisto secretos/PII en evidencia; aplico acceso mínimo y retención.
- [ ] Cito SLSA v1.2 y CycloneDX 1.7 como versiones vigentes (revalidar).
- [ ] No prometo seguridad total ni cumplimiento por tener evidencia.

---

*No es asesoramiento legal ni de cumplimiento. Menciones a estándares (SLSA, CycloneDX, OpenSSF) refieren a sus fuentes oficiales vigentes al 2026-07-09; delimitá versión y jurisdicción para tu caso. Un pipeline no certifica PCI DSS, GDPR ni normativa del BCRA.*

