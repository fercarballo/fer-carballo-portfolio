---
title: "Provenance, firma y verificación antes de desplegar"
description: "Provenance in-toto y SLSA v1.2 Build L0-L3, firma keyless con cosign/Fulcio/Rekor, política de admisión que rechaza imágenes no firmadas, y script de verificación con rollback."
pubDate: 2026-07-10
tags: ['slsa', 'sigstore', 'cosign', 'provenance', 'attestation', 'policy-as-code', 'supply-chain-security']
cluster: 'a02'
clusterTitle: "Supply-chain security: SLSA y SBOM"
type: satelite
order: 3
readingLevel: "Avanzado"
prerequisites: "Requiere CI/CD, registries OCI y nociones de firma criptográfica."
icon: 'ship'
iconHue: 355
---

> **Aviso.** Nexo Finanzas es **ficticio**. **Ninguna herramienta fue ejecutada:** los comandos son propuestas reproducibles y las salidas son ilustrativas. Los digests y las identidades son placeholders obvios. No se muestran claves ni firmas reales. Este contenido no es asesoramiento de cumplimiento.

> **Promesa del artículo.** Al terminar vas a poder explicar qué campos de una attestation de provenance importan y por qué; vas a saber por qué la firma keyless resuelve un problema que la firma con clave privada creaba; y vas a tener un gate de verificación con un plan de rollback que no deja al equipo fuera de servicio.

> Cierra el capítulo. Asume el [threat model](/blog/una-suite-verde-no-prueba-que-el-artefacto-sea-integro/) y los [límites del SBOM](/blog/el-sbom-no-es-un-inventario-perfecto/).

## La pregunta que el SBOM no responde

Tenés el SBOM. Sabés qué componentes hay adentro del artefacto. Ahora respondé esto:

> **¿Este artefacto salió de tu pipeline, o alguien lo puso ahí?**

El SBOM no lo sabe. Es un documento que describe contenido; cualquiera puede escribir uno. Si un atacante sustituye la imagen en el registry y adjunta un SBOM perfectamente válido, tu inventario dice que todo está bien.

Lo que falta es **procedencia**: una afirmación firmada sobre **cómo, dónde y a partir de qué** se produjo el artefacto. En la jerga: una *attestation* de *provenance*.

## Qué es una attestation, sin misticismo

Una attestation es una afirmación firmada sobre un artefacto. Tiene tres partes:

1. **El sujeto:** qué artefacto. Identificado por su **digest** (`sha256:...`), no por su nombre. Los nombres son punteros; los digests son el contenido.
2. **El predicado:** qué se afirma. Para provenance: quién lo construyó, desde qué fuente, con qué parámetros.
3. **La firma:** quién lo afirma.

El formato estándar del sobre es *in-toto*, y SLSA define un predicado de provenance concreto. Lo importante no es el JSON: es qué campos mirás cuando verificás.

```json
{
  "_type": "https://in-toto.io/Statement/v1",
  "subject": [
    {
      "name": "registry/nexo-transfer-api",
      "digest": { "sha256": "0000...0000" }
    }
  ],
  "predicateType": "https://slsa.dev/provenance/v1",
  "predicate": {
    "buildDefinition": {
      "buildType": "https://example.invalid/gitlab-ci/v1",
      "externalParameters": {
        "repository": "https://example.invalid/nexo/nexo-transfer-api",
        "ref": "refs/heads/main"
      },
      "resolvedDependencies": [
        {
          "uri": "git+https://example.invalid/nexo/nexo-transfer-api@refs/heads/main",
          "digest": { "gitCommit": "1111...1111" }
        }
      ]
    },
    "runDetails": {
      "builder": { "id": "https://example.invalid/gitlab-runner/hosted" },
      "metadata": { "invocationId": "pipeline/98765" }
    }
  }
}
```

> **Fragmento ilustrativo.** Los digests son ceros y los dominios usan `.invalid` deliberadamente. No copiar como referencia de esquema: consultá la [especificación vigente](https://slsa.dev/spec/v1.2/).

**Los cuatro campos que realmente verificás:**

| Campo | Pregunta que responde | Si no coincide |
|---|---|---|
| `subject.digest` | ¿Esta attestation habla del artefacto que estoy por desplegar? | Alguien te dio la attestation de **otra** imagen |
| `predicate.runDetails.builder.id` | ¿Lo construyó **nuestro** builder? | Alguien construyó en su laptop y firmó |
| `predicate...resolvedDependencies[].digest.gitCommit` | ¿Desde qué commit exacto? | El artefacto no viene del código que revisaste |
| `externalParameters.ref` | ¿Desde qué rama? | Se construyó desde una rama sin protección |

El tercero es la joya. Conecta el contenedor que corre en producción con un commit específico que pasó por revisión. Esa es, literalmente, la cadena de custodia.

<figure class="diagram">
  <img src="/blog/diagrams/provenance-firma-y-verificacion-antes-de-desplegar-1.svg" width="2280" height="259" alt="Diagrama: provenance-firma-y-verificacion-antes-de-desplegar (1)" loading="lazy" decoding="async" />
</figure>

Fijate qué hace el rombo: **no pregunta si la firma es válida. Pregunta si los cuatro campos dicen lo que esperabas.** Una firma criptográficamente impecable sobre un artefacto construido en la laptop de alguien es exactamente el caso que el gate debe rechazar, y es el que casi todos los ejemplos de internet dejan pasar.

## SLSA Build L0–L3: propiedades, no medallas

SLSA v1.2 organiza esto en niveles del *build track*. **Al 2026-07-10, los niveles son L0 a L3. No existe L4** (existía en borradores pre-1.0; si lo ves citado, la fuente está desactualizada).

| Nivel | Propiedad | Qué exige, en la práctica |
|---|---|---|
| **L0** | Ninguna | No hay provenance |
| **L1** | Provenance existe | El build genera un documento que describe cómo se construyó |
| **L2** | Provenance **firmada por el builder** | Una plataforma de build hosteada la genera y la firma; el usuario no puede falsificarla |
| **L3** | Build **endurecido y aislado** | El builder impide que el proceso de build influya sobre la provenance; secretos del firmador inaccesibles al build |

Además, v1.2 promovió el **Source track** de experimental a *approved*: agrega requisitos sobre retención de historia del repositorio y protección continua contra manipulación, con sus propias *verification summary attestations*.

**Cómo se escribe esto de forma honesta:**

- ❌ "Somos SLSA nivel 3."
- ❌ "Cumplimos SLSA."
- ✅ "El build de `nexo-transfer-api` genera provenance firmada por el runner hosteado del CI, lo que corresponde a las propiedades de **SLSA Build L2**. **No** alcanzamos L3 porque el runner compartido no garantiza aislamiento del proceso de firma respecto del build."

La tercera frase demuestra que entendiste el modelo. Las dos primeras demuestran que leíste el nombre.

## Firma keyless: por qué la clave privada era el problema

La forma tradicional de firmar: generás un par de claves, guardás la privada en algún lado, y firmás.

El "algún lado" es el problema entero.

- Si la clave privada está en el repositorio, es pública.
- Si está en el gestor de secretos del CI, cualquier paso del job puede leerla (ver *least privilege* en el [pilar](/blog/una-suite-verde-no-prueba-que-el-artefacto-sea-integro/)).
- Si está en un HSM, resolviste el problema y agregaste costo y operación.
- Y en todos los casos: **si se filtra, ¿cómo lo sabés?** Una clave robada firma artefactos indistinguibles de los tuyos, indefinidamente.

**Sigstore invierte el modelo.** En vez de asociar la firma a una *clave* de larga vida, la asocia a una **identidad**:

1. El pipeline se autentica vía **OIDC** (su identidad de workload: "el job X del repositorio Y en la rama Z").
2. **Fulcio** emite un certificado **efímero** (del orden de minutos) que vincula una clave recién generada a esa identidad.
3. Se firma el artefacto.
4. La firma y el certificado se registran en **Rekor**, un log de transparencia **append-only**.
5. La clave privada se descarta.

**Qué gana:** no hay clave que robar, porque no hay clave que persista. Y si alguien logra firmar algo, queda **registrado públicamente en Rekor**. La detección deja de depender de que alguien note que la clave se filtró.

**Qué cuesta, y hay que decirlo:**

- Dependés de la disponibilidad de Fulcio y Rekor (o de una instancia propia).
- La verificación requiere **política sobre la identidad**: no alcanza con "está firmado", tenés que decir **quién** tenía permiso de firmarlo. Una firma válida de una identidad arbitraria no vale nada.
- El registro en un log público significa que los metadatos de tus builds son públicos. Para un portfolio, es una ventaja. Para una organización, es una decisión.

Línea de herramientas verificada al 2026-07-10: **cosign 2.4+**, con soporte de attestations in-toto y almacenamiento en el registry OCI.

## Firmar y attestar: propuesta reproducible

> **No ejecutado.** Los digests e identidades son placeholders.

```bash
# 1) Firmar la imagen por su DIGEST, nunca por el tag.
#    El tag es mutable; firmar un tag es firmar un puntero.
cosign sign "registry/nexo-transfer-api@sha256:<digest>"

# 2) Adjuntar la attestation de provenance (predicado SLSA).
cosign attest \
  --predicate provenance.json \
  --type slsaprovenance \
  "registry/nexo-transfer-api@sha256:<digest>"

# 3) Adjuntar el SBOM como attestation, para que tambien este firmado.
#    Un SBOM sin firmar es un documento que cualquiera pudo escribir.
cosign attest \
  --predicate sbom-image.json \
  --type cyclonedx \
  "registry/nexo-transfer-api@sha256:<digest>"
```

El paso 3 cierra un hueco que el artículo anterior dejó abierto: **el SBOM también hay que firmarlo.** Si tu SBOM viaja sin firma, un atacante que sustituye la imagen sustituye también el SBOM, y tu inventario describe felizmente el artefacto malicioso.

## El gate: verificar antes de desplegar

Acá es donde la firma se convierte en un control. Sin este paso, todo lo anterior es ceremonia.

> `scripts/verify-artifact.sh` — **propuesta, no ejecutado.**

```bash
#!/usr/bin/env bash
set -euo pipefail

IMAGE_DIGEST="${1:?uso: verify-artifact.sh <imagen@sha256:digest>}"

# La identidad que TIENE PERMITIDO firmar. Sin esto, cualquier firma valida pasa.
EXPECTED_IDENTITY="https://example.invalid/nexo/nexo-transfer-api/.gitlab-ci.yml@refs/heads/main"
EXPECTED_ISSUER="https://example.invalid"

echo "==> 1/3 Verificando firma e identidad del firmante"
cosign verify \
  --certificate-identity "${EXPECTED_IDENTITY}" \
  --certificate-oidc-issuer "${EXPECTED_ISSUER}" \
  "${IMAGE_DIGEST}"

echo "==> 2/3 Verificando attestation de provenance"
cosign verify-attestation \
  --type slsaprovenance \
  --certificate-identity "${EXPECTED_IDENTITY}" \
  --certificate-oidc-issuer "${EXPECTED_ISSUER}" \
  "${IMAGE_DIGEST}"

echo "==> 3/3 Verificando que la provenance apunte a una rama protegida"
# El paso que casi nadie hace: no alcanza con que la provenance exista y sea
# valida; hay que LEERLA y comprobar que dice lo que esperabas.
cosign verify-attestation --type slsaprovenance \
    --certificate-identity "${EXPECTED_IDENTITY}" \
    --certificate-oidc-issuer "${EXPECTED_ISSUER}" \
    "${IMAGE_DIGEST}" \
  | jq -e '.payload | @base64d | fromjson
           | .predicate.buildDefinition.externalParameters.ref == "refs/heads/main"' \
  > /dev/null

echo "OK: artefacto verificado."
```

Tres cosas que este script hace y la mayoría de los ejemplos no:

- **`--certificate-identity` es obligatorio.** `cosign verify` sin restringir la identidad acepta cualquier firma válida de cualquiera. Es el equivalente a verificar que un pasaporte no está falsificado sin mirar el nombre.
- **Verifica la imagen por digest**, no por tag.
- **Lee el contenido de la provenance** y comprueba que la rama sea la esperada. Una attestation válida que diga "construido desde `refs/heads/experimento-de-alguien`" es criptográficamente impecable y operacionalmente inaceptable.

## Policy as code, con un modo `warn` que salva el proyecto

El gate anterior corre en el pipeline. Una política de admisión lo hace en el cluster, y cubre el caso "alguien desplegó a mano".

La regla, en pseudo-política:

```text
deny[msg] {
  input.request.kind.kind == "Pod"
  image := input.request.object.spec.containers[_].image
  not startswith(image, "registry/")
  msg := sprintf("imagen de registry no permitido: %v", [image])
}

deny[msg] {
  input.request.kind.kind == "Pod"
  image := input.request.object.spec.containers[_].image
  contains(image, ":")            # tag, no digest
  not contains(image, "@sha256:")
  msg := sprintf("las imagenes deben referenciarse por digest: %v", [image])
}

deny[msg] {
  input.request.kind.kind == "Pod"
  image := input.request.object.spec.containers[_].image
  not verified_signature(image)   # consulta al verificador
  msg := sprintf("imagen sin firma verificable: %v", [image])
}
```

> Pseudocódigo ilustrativo, no específico de un motor de políticas concreto.

**El plan de despliegue de la política, que es más importante que la política:**

1. **Modo `warn`, sin bloquear.** Durante N semanas, la política registra qué habría rechazado. Objetivo: descubrir todos los deploys legítimos que romperías.
2. **Revisar los hallazgos.** Casi siempre aparecen: un job de migraciones que usa una imagen pública, un sidecar de un vendor, un `initContainer` que nadie recuerda.
3. **Excepciones explícitas y con vencimiento**, no `if namespace == "prod-legacy"` escondido en la regla.
4. **Modo `enforce`**, primero en un namespace, después en todos.
5. **Rollback documentado y ensayado:** cómo pasar de `enforce` a `warn` en un minuto, y quién tiene permiso de hacerlo.

El paso 5 no es opcional. Una política de admisión mal configurada **impide desplegar el fix de un incidente**. Es el clásico control de seguridad que se convierte en el incidente. Si no ensayaste el rollback, la política es un riesgo neto.

## Reproducibilidad: un objetivo, no un requisito

Un build es **reproducible** si dos ejecuciones desde el mismo commit producen artefactos bit a bit idénticos. Suena obvio y casi nunca ocurre: timestamps embebidos, orden de archivos en el JAR, rutas absolutas, número de build.

**Vale la pena perseguirlo,** porque un build reproducible convierte "confío en el builder" en "cualquiera puede verificarlo". Pero **no lo pongas como prerrequisito** de la firma y la verificación, porque:

- Llegar a reproducibilidad completa en un stack Java típico requiere trabajo real (`Implementation-Build-Date`, orden de entradas del JAR, plugins que embeben paths).
- Provenance + firma ya te dan un control fuerte sin él.

**El orden correcto:** provenance → firma → verificación → *(después)* reproducibilidad. Poner reproducibilidad primero es la forma más eficaz de no implementar nada.

## Caso hipotético fundamentado: el gate que verificaba todo menos quién firmaba

> **Incidente completamente ficticio**, construido como ejercicio didáctico sobre un error de configuración real y común. Las personas son ficticias. Ningún dato es una medición.

### Qué pasó

El equipo de `nexo-supply-chain-lab` implementó el camino incremental completo: SBOM, escaneo, provenance, firma keyless con Sigstore, y un gate de verificación en el pipeline de deploy. El gate corría `cosign verify` sobre la imagen antes de desplegar. Funcionaba: lo probaron, y una imagen sin firmar era rechazada.

Cuatro meses después, un colaborador del proyecto —una cuenta legítima, con permiso de push a una rama de feature— construyó una imagen desde su propia rama, la firmó con su identidad de GitHub vía Fulcio, la subió al registry, y la desplegó al entorno de demo.

**El gate la aceptó.** La firma era criptográficamente perfecta. Estaba registrada en Rekor. `cosign verify` devolvió `0`.

Nadie había sido malicioso. El colaborador solo quería probar su cambio en el entorno de demo. Pero el control que el equipo creía tener —*"solo desplegamos artefactos construidos por nuestro pipeline desde `main`"*— **no existía**.

### La línea de código

```bash
# Lo que el gate ejecutaba. Verifica que la firma sea valida.
cosign verify "registry/nexo-transfer-api@sha256:<digest>"
```

```bash
# Lo que debia ejecutar. Verifica que la firma sea valida
# Y QUE LA HAYA HECHO QUIEN CORRESPONDE.
cosign verify \
  --certificate-identity "${EXPECTED_IDENTITY}" \
  --certificate-oidc-issuer "${EXPECTED_ISSUER}" \
  "registry/nexo-transfer-api@sha256:<digest>"
```

`cosign verify` sin restringir la identidad responde *"¿alguien firmó esto?"*. La pregunta que el gate necesitaba responder era *"¿lo firmó nuestro pipeline?"*. **Son preguntas distintas, y la primera casi siempre tiene respuesta afirmativa.**

### Los cinco por qués

1. **¿Por qué se desplegó una imagen no autorizada?** Porque el gate aceptaba cualquier firma válida.
2. **¿Por qué aceptaba cualquier firma válida?** Porque `cosign verify` se invocó sin `--certificate-identity`.
3. **¿Por qué se invocó sin ese flag?** Porque el ejemplo de la documentación que el equipo copió mostraba el caso de firma con clave gestionada, donde la clave *es* la identidad. Al migrar a keyless, la identidad pasó a ser un parámetro explícito, y nadie notó que ahora faltaba.
4. **¿Por qué la prueba del gate no lo detectó?** Porque **la única prueba negativa era una imagen sin firmar**. Nunca se probó una imagen firmada por una identidad no autorizada.
5. **¿Por qué no se probó ese caso?** Porque el modelo mental del equipo era "firmado ⇒ nuestro". El threat model del pipeline enumeraba T9 (*sustitución del artefacto en el registry*) y asumía que la firma lo cubría. **Cubría la sustitución anónima; no la sustitución autenticada.**

### Lo que fallaron fueron los sistemas

Nadie actuó mal. El colaborador hizo lo que su permiso le habilitaba. El equipo siguió un ejemplo de documentación. La herramienta se comportó exactamente como está especificada.

Lo que faltó fue **una prueba negativa que ejercitara la frontera correcta**. Y eso es, precisamente, la contribución de un Quality Engineer a este capítulo: no implementar la firma, sino preguntar *"¿qué imagen, siendo válidamente firmada, debería igual ser rechazada?"*.

### Acciones correctivas

| # | Acción | Tipo | Owner |
|---|---|---|---|
| 1 | Agregar `--certificate-identity` y `--certificate-oidc-issuer` al gate | **Prevenir** | @ficticio-alice |
| 2 | Leer la provenance y verificar `ref == refs/heads/main` | **Prevenir** | @ficticio-alice |
| 3 | **Prueba negativa: imagen firmada por identidad no autorizada debe ser rechazada** | **Detectar** | @ficticio-bob |
| 4 | Prueba negativa: imagen construida desde una rama no protegida debe ser rechazada | Detectar | @ficticio-bob |
| 5 | Corregir T9 en el threat model: distinguir sustitución anónima de autenticada | Responder | @ficticio-carol |
| 6 | Consultar Rekor y alertar sobre firmas de identidades fuera de la allowlist | Detectar | @ficticio-carol |

**La acción 3 es la que habría prevenido todo, y es un test de cinco líneas.** La acción 6 solo es posible porque Sigstore registra las firmas en un log de transparencia público: **la firma que nadie autorizó quedó registrada, con la identidad de quien la hizo, desde el primer minuto.** Nadie estaba mirando.

Y notá la distribución: dos acciones de prevención, tres de detección, una de respuesta. Un postmortem que solo produce prevención está apostando a que la próxima causa sea la misma.

## Anti-patrones

- **Firmar el tag en vez del digest.** *Consecuencia:* firmaste un puntero. Mañana apunta a otra cosa. *Alternativa:* siempre `@sha256:`.
- **`cosign verify` sin `--certificate-identity`.** *Consecuencia:* aceptás cualquier firma válida de cualquier identidad del mundo. Es el bug de verificación más común. *Alternativa:* restringir identidad e issuer.
- **Verificar que la attestation existe sin leer su contenido.** *Consecuencia:* aceptás un build desde una rama sin protección. *Alternativa:* comprobar `ref`, `builder.id` y `gitCommit`.
- **Que la única prueba negativa del gate sea una imagen sin firmar.** *Causa:* el modelo mental "firmado ⇒ nuestro". *Consecuencia:* el caso de arriba. *Alternativa:* probar también una imagen **válidamente firmada por una identidad no autorizada**. Es un test de cinco líneas y es el único que ejercita la frontera real.
- **Firmar el artefacto y no el SBOM.** *Consecuencia:* el inventario es falsificable. *Alternativa:* attestar el SBOM también.
- **Política de admisión directo en `enforce`.** *Consecuencia:* rompés deploys legítimos y el equipo desactiva la política. *Alternativa:* `warn` → revisar → excepciones con vencimiento → `enforce` por namespace.
- **Política sin rollback ensayado.** *Consecuencia:* el control de seguridad bloquea el fix de un incidente. *Alternativa:* ensayarlo, y que más de una persona pueda ejecutarlo.
- **Clave privada de firma en el gestor de secretos del CI.** *Alternativa:* keyless, o HSM con acceso restringido al paso de firma.
- **Perseguir reproducibilidad antes que provenance.** *Consecuencia:* no implementás nada. *Alternativa:* el orden incremental.
- **"Somos SLSA nivel 3."** *Alternativa:* nombrar la propiedad concreta y qué falta para el siguiente nivel.

## Qué publicar en GitHub

```text
scripts/verify-artifact.sh                 # con --certificate-identity, no sin él
policies/admission/                        # con el modo warn y la fecha de enforce
docs/adr/ADR-002-firma-keyless.md          # keyless vs clave gestionada; costos declarados
docs/security/slsa-nivel-actual.md         # qué propiedades cumplimos y cuáles NO
docs/runbooks/desactivar-politica-admision.md   # el rollback, con quién puede ejecutarlo
.gitlab-ci.yml                             # sign + attest (provenance Y sbom)
```

`docs/security/slsa-nivel-actual.md` es el documento que más credibilidad da en una entrevista: una tabla de propiedades SLSA con "sí / no / por qué no", sin inflar.

## Qué aprendimos / próximos pasos

- El SBOM describe contenido; la provenance describe origen. Necesitás las dos.
- Los campos que importan de una attestation son `subject.digest`, `builder.id`, `gitCommit` y `ref`.
- La firma keyless elimina la clave de larga vida y registra la firma en un log público.
- **`cosign verify` sin restringir la identidad no verifica nada útil.**
- Una firma sin gate de verificación es un adorno. Una política sin rollback ensayado es un riesgo.

**Cierre del capítulo.** El siguiente paso natural es [progressive delivery](/blog/coleccion/a03/): ahora que podés demostrar *qué* estás desplegando, la pregunta pasa a ser *a cuánta gente* y *con qué señal para frenar*.

## Checklist final

- [ ] Todo lo que se firma se firma por **digest**.
- [ ] `cosign verify` incluye `--certificate-identity` y `--certificate-oidc-issuer`.
- [ ] El gate **lee** la provenance y comprueba `ref` y `builder.id`, no solo que exista.
- [ ] Existe una prueba negativa con una imagen **firmada por una identidad no autorizada**, y el gate la rechaza.
- [ ] Existe una prueba negativa con una imagen construida desde una rama no protegida, y el gate la rechaza.
- [ ] El SBOM se adjunta como attestation firmada.
- [ ] Existe un gate de verificación antes del deploy, y una política de admisión en el cluster.
- [ ] La política pasó por modo `warn` antes de `enforce`.
- [ ] El rollback de la política está documentado **y ensayado**, y más de una persona puede ejecutarlo.
- [ ] `docs/security/slsa-nivel-actual.md` declara qué propiedades **no** se cumplen y por qué.
- [ ] Ninguna documentación dice "SLSA nivel 4" ni "somos SLSA compliant".
- [ ] No hay claves privadas en el repositorio ni en variables de entorno globales del job.

---

## Fuentes (consultadas 2026-07-10)

- [SLSA v1.2 — especificación](https://slsa.dev/spec/v1.2/) y [Build: requisitos](https://slsa.dev/spec/v1.2/build-requirements) — niveles **L0–L3**; Source track *approved* en v1.2.
- [SLSA — Build Track Basics](https://slsa.dev/spec/v1.2/build-track-basics)
- [Sigstore — cosign, firma](https://docs.sigstore.dev/cosign/signing/overview/) — línea **cosign 2.4+**; Fulcio (certificados efímeros) y Rekor (log de transparencia).
- [in-toto Attestation Framework](https://github.com/in-toto/attestation) — formato del sobre y del sujeto.
- [CycloneDX — Specification Overview](https://cyclonedx.org/specification/overview/) — para el SBOM que se attesta.
- [Verificación de fuentes de la serie](/blog/verificacion-de-fuentes-serie-avanzada/)
