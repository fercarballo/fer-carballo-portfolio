---
title: "Una suite verde no prueba que el artefacto sea íntegro"
description: "Pilar de supply-chain security para Quality Engineering: threat model del pipeline, taxonomía de amenazas de commit a deploy, controles prevenir/detectar/responder y least privilege en CI."
pubDate: 2026-07-10
tags: ['supply-chain-security', 'threat-modeling', 'ci-cd', 'slsa', 'sdet', 'devsecops']
cluster: 'a02'
clusterTitle: "Supply-chain security: SLSA y SBOM"
type: pilar
order: 1
readingLevel: "Avanzado"
prerequisites: "Requiere Git, Maven/Gradle, Docker y CI/CD."
icon: 'ship'
iconHue: 355
---

> **Aviso.** Nexo Finanzas es **ficticio**. **No se ejecutó ninguna herramienta de seguridad en este artículo**: todos los comandos son propuestas reproducibles. No se muestran tokens, claves ni firmas. Ningún CVE citado es real: los identificadores llevan el prefijo `EJEMPLO-`. Este contenido no es asesoramiento de cumplimiento.

> **Promesa del artículo.** Al terminar vas a poder construir el modelo de amenaza de tu propio pipeline, ubicar cada control de seguridad en la categoría correcta (prevenir, detectar, responder), y explicar por qué un badge verde y un artefacto íntegro son afirmaciones independientes.

## Dos preguntas que parecen la misma

Tu pipeline dice que todo está bien. Preguntémosle dos cosas distintas:

1. **"¿El código que escribimos se comporta como esperamos?"** — Esto lo responde tu suite de tests. Bien.
2. **"¿El artefacto que está corriendo en producción proviene del código que escribimos?"** — Esto **tu suite no lo responde en absoluto.**

La segunda pregunta importa porque entre el commit y el contenedor corriendo hay una cadena larga, y cada eslabón es un lugar donde alguien puede sustituir algo sin tocar tu repositorio:

- El `pom.xml` resuelve una dependencia transitiva que ayer no existía.
- Una GitHub Action referenciada como `@v3` apunta hoy a un commit distinto que ayer.
- La imagen base `eclipse-temurin:21-jre` es un tag mutable: la de hoy no es la de la semana pasada.
- El runner de CI tiene un token con permiso de escritura al registry, y ese token vive en el entorno de **todos** los pasos, incluido el que ejecuta código de terceros.
- El artefacto se subió al registry, y entre eso y el deploy, nadie verificó nada.

**Tesis del capítulo:**

> Una suite verde no demuestra que el artefacto sea íntegro. La evidencia de calidad debe conectar fuente, revisión, build aislado, dependencias, provenance, firma y despliegue. Cada eslabón que no produce evidencia es un eslabón donde confiás por costumbre.

Este es trabajo de Quality Engineering, no solo de seguridad. La palabra clave es **evidencia**, y es exactamente la misma disciplina que aplicás cuando exigís que un test falle por la razón correcta.

> **Prerrequisito.** Este artículo asume que ya leíste [Cadena de suministro en el pipeline: SBOM, provenance y firma](/blog/cadena-de-suministro-pipeline-sbom-slsa-provenance/), que introduce SBOM, SLSA y Sigstore. Acá no los reintroducimos: los usamos.

## La cadena, y dónde se rompe

<figure class="diagram">
  <img src="/blog/diagrams/una-suite-verde-no-prueba-que-el-artefacto-sea-integro-1.svg" width="1640" height="63" alt="Diagrama: una-suite-verde-no-prueba-que-el-artefacto-sea-integro (1)" loading="lazy" decoding="async" />
</figure>

Cada flecha es una **transición de confianza**. La pregunta de un Quality Engineer frente a cada una es siempre la misma: *¿qué evidencia acompaña a lo que cruza esta flecha, y quién la verifica del otro lado?*

En la mayoría de los pipelines reales, la respuesta entre `Artifact` y `Deployment` es: **ninguna, y nadie**. El artefacto se sube, y algo lo baja y lo corre. La confianza es implícita y transitiva: *"si está en nuestro registry, es nuestro"*.

## Modelo de amenaza del pipeline de `nexo-transfer-api`

Un threat model no es un documento de seguridad que se archiva. Es una **enumeración sistemática** que produce una lista de controles priorizados. Recorré la cadena y en cada nodo preguntá: *¿quién puede modificar esto, con qué privilegio, y qué lo detectaría?*

Actores relevantes (todos ficticios): un colaborador legítimo, un colaborador cuya cuenta fue comprometida, un mantenedor de una dependencia upstream, y alguien con acceso al runner de CI.

| # | Nodo | Amenaza | Qué la haría posible | Control (categoría) |
|---|---|---|---|---|
| T1 | Source | Commit directo a `main` sin revisión | Rama sin protección | Branch protection, revisión obligatoria (**prevenir**) |
| T2 | Source | Un commit falsifica la autoría | Commits sin firmar | Firma de commits (**detectar**) |
| T3 | Dependencias | Una transitiva nueva entra sin que nadie la vea | Rango de versiones abierto | Lockfile + revisión de diffs de lockfile (**prevenir**) |
| T4 | Dependencias | *Dependency confusion*: un paquete público suplanta a uno interno | Repositorio interno no priorizado | Configuración explícita de repos; namespaces (**prevenir**) |
| T5 | Build | Un paso de CI ejecuta código de un tercero con el token de deploy en el entorno | Secretos globales al job | Least privilege, secretos por paso (**prevenir**) |
| T6 | Build | Una acción/plugin referenciada por tag mutable cambia bajo tus pies | `uses: org/action@v3` | Pinning por SHA (**prevenir**) |
| T7 | Build | La imagen base cambia entre builds | Tag mutable (`:21-jre`) | Pinning por **digest** `@sha256:...` (**prevenir**) |
| T8 | Build | El build no es reproducible: dos builds del mismo commit difieren | Timestamps, orden no determinista | Provenance + build hermético (**detectar**) |
| T9 | Artefacto | Se sustituye el artefacto en el registry | Credenciales del registry amplias | Firma + verificación en el deploy (**detectar**) |
| T10 | Deploy | Se despliega una imagen que nadie construyó en este pipeline | No hay gate de verificación | Política de admisión (**prevenir**) |
| T11 | Escaneo | El scanner corre con permisos excesivos y se convierte en el vector | Scanner con acceso a secretos | Aislamiento del paso (**prevenir**) |
| T12 | Excepción | Una vulnerabilidad aceptada nunca se revisa | Excepciones sin vencimiento | Registro con owner y fecha (**responder**) |

**Cómo se usa esta tabla en un review:** ordenala por *facilidad de explotación × impacto*, no por severidad teórica. T6 y T7 son triviales de explotar y triviales de mitigar: van primero. T8 es difícil y caro: va después.

## Prevenir, detectar, responder

Todo control cae en una de tres categorías, y confundirlas produce una falsa sensación de cobertura.

<figure class="diagram">
  <img src="/blog/diagrams/una-suite-verde-no-prueba-que-el-artefacto-sea-integro-2.svg" width="694" height="496" alt="Diagrama: una-suite-verde-no-prueba-que-el-artefacto-sea-integro (2)" loading="lazy" decoding="async" />
</figure>

- **Prevenir** hace que la amenaza no pueda ocurrir. Pinning por digest **previene** T7: no hay forma de que la imagen base cambie.
- **Detectar** no impide nada; produce evidencia de que ocurrió. La firma **detecta** T9: no impide que alguien suba un artefacto, pero hace que la verificación falle.
- **Responder** gestiona lo que ya pasó o lo que aceptás vivir con ello.

**El error clásico:** contar controles de detección como si fueran de prevención. "Tenemos un scanner de vulnerabilidades" no previene que una dependencia vulnerable entre; detecta que entró. Son cosas distintas y el threat model debe decir cuál es cuál.

**El segundo error clásico:** no tener ningún control de la tercera categoría. Un equipo sin proceso de excepciones tiene, en la práctica, un proceso de excepciones: se llama "ignorar la alerta". La diferencia es que el informal no tiene owner ni fecha.

## Least privilege en CI: el control más barato que nadie implementa

De todas las filas de la tabla, T5 es la que mejor relación valor/costo tiene, y la que más se posterga.

El problema concreto: en muchos pipelines, el token con permiso de escritura al registry está disponible como variable de entorno **durante todo el job**. Eso significa que está disponible para:

- El paso que ejecuta `mvn test`, que a su vez ejecuta código de todos tus plugins de Maven.
- El paso que corre el linter, escrito por un tercero.
- El paso que genera el SBOM, escrito por otro tercero.

Cualquiera de esos puede leer el entorno. No hace falta un atacante sofisticado: alcanza con una dependencia comprometida en la cadena de plugins.

**Los tres principios, en orden de impacto:**

1. **Los secretos se inyectan en el paso que los necesita, no en el job.** El paso de push al registry tiene la credencial; el paso de tests no.
2. **El token por defecto del CI es de solo lectura**, y los permisos de escritura se elevan explícitamente donde hacen falta. En GitLab y en la mayoría de los CI modernos esto es configuración, no arquitectura.
3. **El paso que ejecuta código de terceros no toca la red hacia adentro.** Si tu scanner necesita internet para bajar la base de vulnerabilidades, dale internet; no le des el registry.

Y un principio operativo que vale por los tres: **si un secreto se expuso, rotalo; no lo borres del log.** El log es una copia; hay más.

> **Regla de escritura para el blog y el repo:** si encontrás un secreto en un repositorio, reportá **ubicación y tipo**, nunca el valor. Esta serie lo cumple: no hay un solo token, clave ni URL interna en ninguno de los 31 artículos.

## Pinning: la disciplina aburrida que corta más ataques

**Tags mutables** (`@v3`, `:latest`, `:21-jre`) son punteros. Alguien más decide a qué apuntan. Cada build resuelve un puntero distinto y vos no lo sabés.

**Digests** (`@sha256:abc...`) son direcciones de contenido. Si el contenido cambia, el digest cambia. No hay forma de sustituir sin que te enteres.

```dockerfile
# Fragil: el tag es un puntero que otro controla.
FROM eclipse-temurin:21-jre

# Verificable: si el contenido cambia, el build falla.
FROM eclipse-temurin:21-jre@sha256:0000000000000000000000000000000000000000000000000000000000000000
#                              ^ digest ILUSTRATIVO, no real. Obtenelo de tu registry.
```

**El trade-off honesto:** pinning por digest congela también las **actualizaciones de seguridad** de la imagen base. Si nadie actualiza el digest, en seis meses tenés una base con vulnerabilidades conocidas y ninguna alerta, porque el escaneo corre sobre lo que pineaste.

La respuesta no es dejar de pinear. Es **pinear y automatizar la actualización**: un bot que abre un PR cuando hay un digest nuevo, y una persona que revisa el diff. Convertís una sustitución silenciosa en un cambio revisado. Eso es exactamente lo que querías.

Lo mismo aplica a las acciones de CI: `uses: org/action@<sha>` con un comentario que diga qué versión es ese SHA, y un bot que lo actualice.

## Qué evidencia debería producir tu pipeline

Un pipeline maduro deja atrás una **cadena de evidencia** que alguien puede auditar meses después, sin acceso al pipeline. Concretamente, adjunto a cada release:

| Evidencia | Responde a | Amenaza que cubre |
|---|---|---|
| Commit SHA firmado | ¿De qué fuente salió? | T2 |
| Lockfile del build | ¿Qué dependencias exactas entraron? | T3, T4 |
| SBOM del artefacto y de la imagen | ¿Qué hay adentro? | T3 (parcial — ver artículo 2) |
| Reporte de escaneo, con fecha y versión de la base de datos | ¿Qué se sabía en ese momento? | Detección |
| **Provenance** (attestation) | ¿Quién lo construyó, desde qué fuente, con qué builder? | T8, T9 |
| **Firma** del artefacto y de la attestation | ¿Alguien lo modificó después? | T9 |
| Registro de excepciones vigentes | ¿Qué riesgos aceptamos, quién y hasta cuándo? | T12 |

La fila que casi nadie tiene es la última, y es la que un auditor técnico pide primero. Un escaneo sin proceso de excepciones produce dos resultados posibles: o bloqueás el deploy por un `EJEMPLO-2026-0001` de severidad alta en una librería que no exponés a red, o lo ignorás sin registro. Ambos son malos. El artículo 2 desarrolla la alternativa.

## Un camino incremental con rollback

El error de implementación más común es querer llegar a "policy as code que bloquea deploys no firmados" en un sprint. Se rompe, molesta a todo el mundo, y el equipo desactiva el gate.

El orden que funciona, donde **cada escalón es útil solo y reversible**:

1. **Inventario.** Generá el SBOM. No bloquees nada. Objetivo: saber qué tenés. *Rollback:* dejar de generarlo. Costo de revertir: cero.
2. **Escaneo.** Corré el scanner. **No bloquees todavía.** Objetivo: calibrar el ruido y construir el registro de excepciones con owners reales. *Rollback:* trivial.
3. **Provenance.** Generá la attestation. Todavía no la verifiques. Objetivo: que el artefacto tenga procedencia. *Rollback:* trivial.
4. **Firma.** Firmá artefacto y attestation. Todavía no bloquees. Objetivo: la firma existe y es verificable a mano.
5. **Verificación.** Ahora sí: el deploy **verifica** antes de correr. *Rollback:* una feature flag en el gate.
6. **Policy.** Reglas declarativas sobre qué se admite. *Rollback:* modo `warn` antes de modo `enforce`.

Entre el 4 y el 5 hay una advertencia que merece su propia línea: **firmar un artefacto y no verificarlo antes del deploy no aporta seguridad, aporta ceremonia.** La firma sin verificación es un adorno criptográfico. Si vas a hacer solo uno de los dos pasos, hacé el 5 sobre firmas de terceros que ya existen.

## Lo que la certificación no es

Tres frases que esta serie se prohíbe, y que conviene que vos también:

- **"Somos SLSA compliant."** SLSA v1.2 describe niveles de un *build track* (L0–L3) que caracterizan propiedades del proceso de build. No hay certificación, no hay auditor, y **no existe el nivel 4** en la especificación vigente. Lo correcto es: *"nuestro build cumple las propiedades de SLSA Build L2 porque el builder es un servicio hosteado que firma la provenance y no permite que el usuario altere el proceso"*.
- **"Ejecutamos un scanner, entonces cumplimos PCI DSS."** Un scanner es un control. El cumplimiento es un proceso auditado con alcance definido. Esta serie no afirma cumplimiento de ninguna norma.
- **"Publicamos un SBOM, entonces somos seguros."** El artículo 2 está enteramente dedicado a desarmar esta frase.

## Anti-patrones

- **Bloquear por CVSS sin contexto.** *Causa:* es un número fácil de poner en un gate. *Consecuencia:* bloqueás por una vulnerabilidad de parseo XML en una librería que nunca parsea XML no confiable, mientras dejás pasar una de severidad media directamente explotable. *Alternativa:* severidad **× alcance × explotabilidad**; ver artículo 2.
- **Guardar firmas o claves privadas en el repositorio.** *Alternativa:* firma keyless con identidad efímera (Sigstore/Fulcio); ver artículo 3.
- **Generar un SBOM que nadie consume.** *Consecuencia:* costo sin valor y falsa sensación de control. *Alternativa:* antes de generarlo, escribí quién lo lee y para qué decisión.
- **Firmar un artefacto sin verificarlo antes del deploy.** *Consecuencia:* ceremonia criptográfica. *Alternativa:* el gate de verificación.
- **Ejecutar scanners con permisos excesivos.** *Consecuencia:* el control de seguridad es el vector. *Alternativa:* aislar el paso; sin secretos de deploy.
- **Confundir SLSA con una certificación.** *Alternativa:* nombrar la propiedad concreta del build.
- **Tags mutables en imágenes base y acciones de CI.** *Alternativa:* digest/SHA + bot de actualización + revisión del diff.
- **Escaneo sin proceso de excepciones.** *Consecuencia:* el proceso existe igual, pero es "ignorar la alerta". *Alternativa:* registro con owner y vencimiento.

## Qué publicar en GitHub

```text
SECURITY.md                                   # cómo reportar, alcance, qué NO cubre
docs/security/supply-chain-threat-model.md    # la tabla T1-T12, priorizada
docs/security/vulnerability-exceptions.md     # owner, alcance, vencimiento, evidencia
docs/adr/ADR-001-sbom-format.md               # SPDX vs CycloneDX; ver artículo 2
policies/                                     # policy as code, en modo warn primero
scripts/verify-artifact.sh                    # el gate; ver artículo 3
.gitlab-ci.yml                                # permisos por paso, secretos por paso
```

El `SECURITY.md` de un proyecto de portfolio tiene una obligación extra que casi nadie cumple: **declarar que es un sandbox ficticio, que no procesa datos reales, y que no debe usarse como referencia de cumplimiento.** Eso no te resta seriedad. Te suma criterio.

## Métricas, sin metas mágicas

Definí cada una con fórmula, ventana y **la acción que dispara**. Una métrica que no dispara ninguna acción es un adorno de dashboard.

| Métrica | Definición | Acción que dispara |
|---|---|---|
| Cobertura de SBOM | artefactos publicados con SBOM ÷ artefactos publicados | Si < 100 %, identificar qué pipeline no lo genera |
| Builds con provenance verificable | releases cuya attestation valida ÷ releases | Si baja, investigar el builder |
| Tiempo de remediación por riesgo aceptado | mediana de (cierre − apertura) por excepción | Si crece, el proceso de excepciones es una papelera |
| Dependencias sin owner o sin versión fija | conteo | Cualquier valor > 0 es un ticket |
| **Excepciones vencidas** | conteo de excepciones con `expires_at < hoy` | **Cualquier valor > 0 bloquea el próximo release** |

La última es la única que recomiendo como gate bloqueante, y por una razón asimétrica: bloquear por una excepción vencida te obliga a hacer algo que ya te habías comprometido a hacer. No es una regla nueva; es la que ya aceptaste.

## Qué aprendimos / próximos pasos

- "El código funciona" y "el artefacto proviene del código" son afirmaciones independientes, y tu suite solo responde la primera.
- Todo control es prevenir, detectar o responder. Contarlos mal produce falsa cobertura.
- Least privilege y pinning son los controles más baratos y los más postergados.
- Firmar sin verificar es ceremonia.
- El camino es incremental y cada escalón es reversible.

**Siguiente:** [El SBOM no es un inventario perfecto](/blog/el-sbom-no-es-un-inventario-perfecto/), donde desarmamos el control más publicitado de todos.

## Checklist final

- [ ] Existe un threat model del pipeline con actores, amenazas y controles, priorizado por facilidad × impacto.
- [ ] Cada control está clasificado como prevenir, detectar o responder.
- [ ] Los secretos se inyectan por paso, no por job.
- [ ] El token por defecto del CI es de solo lectura.
- [ ] Las imágenes base y las acciones de CI están pineadas por digest/SHA.
- [ ] Existe un bot que propone actualizaciones de digest, y una persona que revisa el diff.
- [ ] Ningún artefacto se despliega sin verificación (o el gate está en modo `warn` con fecha de activación).
- [ ] Hay un registro de excepciones con owner y fecha de vencimiento.
- [ ] `SECURITY.md` declara que el proyecto es un sandbox ficticio y no una referencia de cumplimiento.
- [ ] En ningún artefacto público aparece un secreto, ni siquiera revocado.

---

## Fuentes (consultadas 2026-07-10)

- [SLSA v1.2 — especificación](https://slsa.dev/spec/v1.2/) — Build track L0–L3; el Source track pasó a *approved* en v1.2. **No existe nivel 4.**
- [SLSA — Specification Stages and Versioning](https://slsa.dev/spec-stages)
- [Sigstore Documentation](https://docs.sigstore.dev/) — firma keyless, Fulcio, Rekor.
- [OWASP — Cheat Sheet Series](https://cheatsheetseries.owasp.org/) — para el vocabulario de threat modeling.
- Documentación oficial del CI, el registry y el scanner que elijas.
- [Verificación de fuentes de la serie](/blog/verificacion-de-fuentes-serie-avanzada/)
