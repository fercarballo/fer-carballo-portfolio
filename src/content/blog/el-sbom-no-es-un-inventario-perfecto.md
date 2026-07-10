---
title: "El SBOM no es un inventario perfecto"
description: "Límites reales del SBOM, ADR SPDX 3.0.1 vs CycloneDX 1.7 (ECMA-424), severidad frente a explotabilidad, VEX, y un registro de excepciones de vulnerabilidades que no es una papelera."
pubDate: 2026-07-10
tags: ['sbom', 'cyclonedx', 'spdx', 'vex', 'vulnerabilidades', 'supply-chain-security']
cluster: 'a02'
clusterTitle: "Supply-chain security: SLSA y SBOM"
type: satelite
order: 2
readingLevel: "Avanzado"
prerequisites: "Requiere Maven/Gradle, Docker y nociones de gestión de vulnerabilidades."
icon: 'ship'
iconHue: 355
---

> **Aviso.** Nexo Finanzas es **ficticio**. **Ninguna herramienta fue ejecutada:** los comandos son propuestas reproducibles y las salidas mostradas son ilustrativas, no resultados. **Ningún CVE citado es real**: usan el prefijo `EJEMPLO-`. Este contenido no es asesoramiento de cumplimiento.

> **Promesa del artículo.** Al terminar vas a poder enumerar cinco cosas concretas que tu SBOM no ve, defender la elección entre SPDX y CycloneDX contra un objetivo declarado, y convertir un reporte de 300 vulnerabilidades en una tabla de decisiones con dueño y vencimiento.

> Asume el threat model del [pilar](/blog/una-suite-verde-no-prueba-que-el-artefacto-sea-integro/) y la introducción de [SBOM/SLSA/Sigstore](/blog/cadena-de-suministro-pipeline-sbom-slsa-provenance/) de la colección de CI/CD.

## La frase que hay que dejar de decir

> "Generamos un SBOM, así que sabemos qué hay en nuestro software."

Un *Software Bill of Materials* es una lista de componentes. Como toda lista, tiene un **método de recolección**, y todo método tiene puntos ciegos. La frase honesta es:

> "Generamos un SBOM con `<herramienta>` `<versión>` sobre `<el artefacto o la imagen>`, en la etapa `<build o post-build>`. Eso nos da `<esto>` y **no nos da** `<esto otro>`."

Esa diferencia es lo que separa un inventario de una ilusión de control.

## Cinco cosas que tu SBOM no ve

### 1. Depende de dónde lo generes

No es lo mismo un SBOM del **build** que uno de la **imagen**.

- **SBOM de build** (a partir del `pom.xml`/`build.gradle` resuelto): ve las dependencias Java con precisión, incluidas las transitivas, con sus coordenadas exactas. **No ve** nada del sistema operativo de la imagen: ni `glibc`, ni `openssl`, ni el paquete `curl` que alguien agregó en el `Dockerfile`.
- **SBOM de imagen** (escaneando el filesystem del contenedor): ve los paquetes del SO. Ve los JAR. Pero **infiere** la identidad de cada JAR a partir de su nombre y metadatos, y ahí empieza a fallar.

**Necesitás los dos.** Un solo SBOM es medio inventario. Y necesitás decir cuál es cuál, porque el escáner que los consume produce resultados distintos.

### 2. Los fat JARs son un agujero negro

Si empaquetás con `maven-shade-plugin` o el `bootJar` de Spring Boot con dependencias embebidas, tenés un JAR que contiene clases de veinte librerías **sin sus metadatos originales**. Un escáner de imagen ve un archivo, `nexo-transfer-api.jar`, y no puede decirte que adentro hay una versión vulnerable de una librería de parseo.

**Mitigación:** generá el SBOM **antes** de empaquetar, desde el árbol de dependencias resuelto, y adjuntalo al artefacto. Cualquier SBOM generado a posteriori sobre un fat JAR es, en el mejor de los casos, incompleto.

### 3. Lo que no vino de un gestor de paquetes es invisible

Un binario que alguien descargó con `curl` en el `Dockerfile`. Un `.so` compilado a mano. Un JAR copiado desde un directorio `lib/` versionado en Git. Nada de eso tiene metadatos de paquete, así que ningún escáner lo identifica de forma confiable.

Aparecerá, si acaso, como un archivo con un hash. Y un hash sin base de datos que lo mapee a un componente no te dice nada.

### 4. El SBOM describe lo que hay, no lo que se ejecuta

Tu artefacto incluye una librería de serialización XML. El escáner encuentra `EJEMPLO-2026-0001`, severidad crítica, en su parser. ¿Estás expuesto?

**Depende de si tu código llama a ese parser con entrada no confiable.** Si la librería está en el classpath porque es una dependencia transitiva de algo que usás para otra cosa, y esa ruta de código nunca se ejecuta, la vulnerabilidad **existe en tu inventario y no en tu superficie de ataque**.

Un SBOM no distingue estos dos casos. Esta es la brecha entre *estar presente* y *ser explotable*, y es la fuente del 80 % del ruido de los escáneres.

### 5. El SBOM es una foto, la vulnerabilidad es una película

Un SBOM generado hoy es correcto hoy. Mañana se publica `EJEMPLO-2026-0042` contra un componente que ya estaba en la lista. El artefacto no cambió. Tu exposición sí.

**Consecuencia práctica:** el SBOM debe ser un **artefacto persistido y consultable**, no un archivo que se genera y se descarta. La pregunta operativa real no es "¿este build tiene vulnerabilidades?" sino **"¿qué artefactos desplegados contienen el componente X?"**, y esa pregunta se responde consultando el histórico de SBOMs, no regenerándolos.

Si tu SBOM se genera en CI y se borra con el workspace, no tenés un inventario: tenés un log.

### Los puntos ciegos, en un diagrama

<figure class="diagram">
  <img src="/blog/diagrams/el-sbom-no-es-un-inventario-perfecto-1.svg" width="1156" height="613" alt="Diagrama: el-sbom-no-es-un-inventario-perfecto (1)" loading="lazy" decoding="async" />
</figure>

Leelo así: **ninguno de los dos SBOM ve el sistema completo, y los dos juntos siguen sin ver el binario que alguien bajó con `curl`.** Por eso el inventario se declara con su método y sus límites, no como un hecho.

## SPDX o CycloneDX: la decisión depende del objetivo

Los dos son formatos maduros y ninguno es "mejor". Lo que hay que hacer es escribir el objetivo primero y elegir después.

**Estado verificado al 2026-07-10** (ver [verificación de fuentes](/blog/verificacion-de-fuentes-serie-avanzada/)):

| | SPDX | CycloneDX |
|---|---|---|
| Versión vigente de la spec | **3.0.1** | **1.7** (publicada 2025-10-21) |
| Estandarización | **ISO/IEC 5962:2021 pinea SPDX 2.2.1.** SPDX 3.0 está en proceso (ISO/IEC DIS 5962) | **ECMA-424** (2ª edición publicada por Ecma el 2025-12-10) |
| Origen | Linux Foundation | OWASP |
| Foco histórico | Cumplimiento de licencias, procedencia legal | Análisis de riesgo y seguridad de la cadena |
| Alcance | Software, y con 3.0, modelo extendido (AI, datasets, servicios) | SBOM, SaaSBOM, HBOM, ML-BOM, **CBOM** (criptografía), VDR/VEX |
| Retrocompatibilidad | 3.0 es un rediseño del modelo | 1.7 es retrocompatible con 1.4–1.6 |

**El error que hay que evitar:** decir "SPDX 3.0 es la norma ISO". No lo es. **La norma ISO vigente pinea la versión 2.2.1.** Si alguien en tu organización necesita "el SBOM en el formato ISO", está pidiendo SPDX 2.2.1, no 3.0.1. Esa distinción puede parecer trivia y es exactamente el tipo de precisión que se espera de un rol senior.

### ADR-001: formato de SBOM para `nexo-supply-chain-lab`

> **Contexto.** Necesitamos un inventario de componentes de `nexo-transfer-api` (aplicación Java) y de su imagen de contenedor, con dos objetivos: (a) responder "¿qué artefactos contienen el componente X?" ante una vulnerabilidad nueva, y (b) alimentar un escáner que produzca decisiones de riesgo con excepciones registradas.
>
> **Objetivo NO perseguido.** Auditoría de cumplimiento de licencias de código abierto. Si ese objetivo apareciera, esta decisión debe revisarse.
>
> **Opciones.**
> 1. **SPDX 3.0.1.** Modelo más expresivo; ecosistema de herramientas de licencias más maduro. Pero el objetivo (a) y (b) no necesitan su expresividad extra, y su versión ISO (2.2.1) está dos generaciones atrás del modelo actual.
> 2. **CycloneDX 1.7.** Diseñado alrededor del análisis de riesgo. Soporta **VEX** nativamente, que es exactamente el mecanismo que necesitamos para el objetivo (b). Estandarizado como ECMA-424. Retrocompatible con 1.4–1.6, lo cual reduce el riesgo de que una actualización rompa el consumidor.
> 3. **Ambos.** Generar los dos formatos. Costo de mantenimiento doble; ningún consumidor pide el segundo.
>
> **Decisión.** **CycloneDX 1.7**, porque el objetivo declarado es análisis de riesgo, no cumplimiento de licencias, y porque VEX nativo elimina la necesidad de un mecanismo de excepciones ad hoc.
>
> **Consecuencias.**
> - *Positiva:* el registro de excepciones (abajo) puede expresarse como documentos VEX, consumibles por herramientas, no solo por humanos.
> - *Negativa:* si aparece un requisito de licencias, habrá que convertir o generar SPDX en paralelo. La conversión entre formatos es lossy y hay que asumirlo.
> - *Riesgo aceptado:* CycloneDX no es la norma ISO. Si un tercero exige "SBOM ISO", entregamos SPDX **2.2.1**, no 3.0.1.
>
> **Fecha de revisión.** 12 meses, o antes si SPDX 3.x completa su proceso ISO.

Un ADR que no tiene la sección "Objetivo NO perseguido" y una fecha de revisión no está terminado.

## Generar el SBOM: propuesta, no resultado

> **Estos comandos no fueron ejecutados.** Son una propuesta reproducible. Fijá la versión de tu herramienta en el pipeline y registrala junto al SBOM: un SBOM sin la versión de la herramienta que lo produjo no es reproducible.

```bash
# SBOM del BUILD: dependencias Java resueltas, antes de empaquetar.
# Se genera desde el arbol de dependencias, no desde el JAR final.
mvn org.cyclonedx:cyclonedx-maven-plugin:makeAggregateBom \
    -DoutputFormat=json \
    -DschemaVersion=1.7 \
    -DoutputName=sbom-app

# SBOM de la IMAGEN: paquetes del sistema operativo + lo que se detecte.
# Nota: si el JAR es "fat", este SBOM NO vera las librerias embebidas.
syft "registry/nexo-transfer-api@sha256:<digest>" \
    -o cyclonedx-json=sbom-image.json

# Los DOS se adjuntan al release. Uno solo es medio inventario.
```

Y la parte que casi nadie hace: **persistir el SBOM en un almacén consultable**, indexado por artefacto y por componente. Sin eso, no podés responder "¿qué está desplegado y contiene `libfoo` 1.2.3?" cuando aparezca la vulnerabilidad de la semana.

## De 300 hallazgos a una decisión

Corrés el escáner. Devuelve 312 hallazgos, 47 de severidad alta o crítica. Bloquear el deploy por los 47 es inviable; ignorarlos es negligente. La salida es **contextualizar**.

### Severidad no es riesgo

Un puntaje CVSS mide la severidad **intrínseca** de una vulnerabilidad, en abstracto. No sabe nada de tu sistema. Tu riesgo depende de tres cosas más:

- **Alcance.** ¿El componente está en el artefacto que se despliega, o solo en el classpath de test? Una vulnerabilidad crítica en una dependencia `test`-scoped no llega a producción.
- **Explotabilidad en tu contexto.** ¿La ruta de código vulnerable es alcanzable con entrada no confiable? ¿El servicio está expuesto a internet o solo a la red interna?
- **Existencia de exploit conocido.** Una vulnerabilidad con exploit público y activamente explotada tiene una urgencia distinta a una teórica.

**El anti-patrón:** `if (cvss >= 7.0) fail()`. Produce dos daños simultáneos: bloquea deploys por hallazgos irrelevantes (y el equipo aprende a saltarse el gate) y deja pasar hallazgos de severidad media que sí son explotables en tu contexto.

### VEX: decir "no estamos afectados" de forma legible por máquinas

*Vulnerability Exploitability eXchange* es el mecanismo para afirmar, de manera consumible por herramientas, el **estado de explotabilidad** de una vulnerabilidad en un producto concreto. Es el **compañero del SBOM**: el SBOM dice qué hay adentro; VEX dice si eso te afecta.

Cuatro estados, definidos por el VEX Working Group coordinado por CISA:

| Estado | Significado |
|---|---|
| `not_affected` | La vulnerabilidad existe en un componente presente, pero **no es explotable en este producto** |
| `affected` | Explotable. Hay que remediar |
| `fixed` | Ya remediada en esta versión |
| `under_investigation` | Todavía no se sabe |

**La propiedad que lo hace útil:** según los [requisitos mínimos publicados por CISA](https://www.cisa.gov/sites/default/files/2023-04/minimum-requirements-for-vex-508c.pdf) (abril de 2023), una afirmación `not_affected` **debe** incluir **o bien una justificación de estado, o bien una declaración de impacto** que explique por qué el producto no está afectado. No podés decir "no nos afecta" y callarte.

Las justificaciones recomendadas están enumeradas en el [documento de status justifications de CISA](https://www.cisa.gov/resources-tools/resources/vulnerability-exploitability-exchange-vex-status-justification-document-june-2022) (junio de 2022) e incluyen, entre otras: el componente no está presente en el ejecutable, la ruta de código vulnerable no es alcanzable, o existe una mitigación compensatoria.

Eso es exactamente lo que necesitás. **La diferencia entre un equipo que gestiona vulnerabilidades y uno que las ignora no es la cantidad de hallazgos: es si las decisiones de "no nos afecta" están escritas, justificadas y firmadas, o si viven en la cabeza de alguien.**

VEX no es un formato único: se puede expresar embebido en un SBOM CycloneDX, o como documento independiente. [OpenVEX](https://github.com/openvex/spec/blob/main/OPENVEX-SPEC.md) es una implementación liviana que cumple los requisitos mínimos de CISA. **Elegí uno y decilo en el ADR.**

### Tabla de decisiones de vulnerabilidades

> Guardar como `docs/security/vulnerability-exceptions.md`. **Todos los identificadores son ficticios.**

| ID | Componente | Severidad | Alcance | ¿Explotable acá? | Decisión | Owner | Vence | Evidencia |
|---|---|---|---|---|---|---|---|---|
| `EJEMPLO-2026-0001` | `xml-parser` 2.1.0 | Crítica | Transitiva, runtime | **No.** No parseamos XML de entrada no confiable | `not_affected` (VEX, justificación: ruta no alcanzable) | @ficticio-alice | 2026-10-10 | Análisis de llamadas en `docs/security/analisis-0001.md` |
| `EJEMPLO-2026-0017` | `http-client` 4.5.1 | Alta | Directa, runtime, expuesta | **Sí.** Cliente usado contra terceros | `affected` → actualizar a 4.5.9 | @ficticio-bob | 2026-07-24 | PR #142 |
| `EJEMPLO-2026-0033` | `test-helper` 1.0.0 | Crítica | Solo scope `test` | **No.** No se empaqueta | `not_affected` (no presente en el artefacto) | @ficticio-alice | 2026-10-10 | SBOM del build muestra scope `test` |
| `EJEMPLO-2026-0044` | `base-image glibc` | Media | Imagen base | **Sí**, pero sin parche upstream | `affected` → riesgo aceptado con mitigación de red | @ficticio-carol | **2026-08-09** | ADR-007 + regla de red |

Cinco propiedades hacen que esta tabla funcione y no sea una papelera:

1. **Cada fila tiene un owner nominal.** No "el equipo".
2. **Cada fila vence.** Sin excepción. Una excepción sin fecha es una decisión permanente tomada sin querer.
3. **La columna "¿Explotable acá?" tiene una razón, no un sí/no.**
4. **Hay evidencia enlazada.** Un análisis, un PR, un ADR. Sin evidencia, la decisión no es auditable.
5. **La cuarta fila es la interesante:** riesgo aceptado, sin parche disponible, con mitigación compensatoria y un vencimiento corto. Eso es gestión de riesgo. "Lo silenciamos en el scanner" no lo es.

### El único gate bloqueante que recomiendo

De todo el capítulo, este:

```text
Si existe alguna excepción con expires_at < hoy  ->  el release se bloquea.
```

Es asimétricamente razonable. No inventa una regla nueva: te obliga a cumplir el compromiso que ya tomaste cuando escribiste esa fecha. Y es imposible de discutir en un incidente, porque la fecha la eligió el propio equipo.

Comparalo con `if (cvss >= 7.0) fail()`, que impone un criterio externo sobre un contexto que el criterio desconoce.

## Anti-patrones

- **"Tenemos SBOM, sabemos qué corremos."** *Alternativa:* declarar herramienta, versión, etapa, y los cinco puntos ciegos.
- **Generar el SBOM sobre un fat JAR.** *Consecuencia:* inventario incompleto que parece completo. *Alternativa:* generarlo desde el árbol de dependencias, antes de empaquetar.
- **Un solo SBOM (de build **o** de imagen).** *Alternativa:* los dos, declarando qué ve cada uno.
- **SBOM efímero.** *Consecuencia:* no podés responder "¿qué desplegado contiene X?". *Alternativa:* persistirlo indexado por componente.
- **`if (cvss >= 7.0) fail()`.** *Consecuencia:* ruido, gates salteados, y falsos negativos donde importa. *Alternativa:* severidad × alcance × explotabilidad.
- **Silenciar hallazgos en la configuración del scanner.** *Consecuencia:* la decisión existe pero no es auditable ni tiene dueño. *Alternativa:* VEX con justificación.
- **Excepciones sin fecha de vencimiento.** *Alternativa:* toda excepción vence; las vencidas bloquean.
- **"SPDX 3.0 es la norma ISO."** *Alternativa:* la ISO vigente pinea 2.2.1.

## Qué publicar en GitHub

```text
docs/adr/ADR-001-sbom-format.md            # el ADR de arriba, con "objetivo no perseguido"
docs/security/vulnerability-exceptions.md  # la tabla, con owners y vencimientos
docs/security/sbom-limitations.md          # los cinco puntos ciegos, aplicados a TU build
.gitlab-ci.yml                             # genera los DOS SBOMs y los adjunta al release
scripts/check-expired-exceptions.sh        # el único gate bloqueante
```

## Qué aprendimos / próximos pasos

- Un SBOM es una lista con un método de recolección, y todo método tiene puntos ciegos: etapa, fat JARs, binarios sin metadatos, presencia ≠ ejecución, y foto ≠ película.
- La elección de formato se deriva del objetivo. Escribí el objetivo primero.
- SPDX 3.0.1 es la spec vigente; **la ISO pinea 2.2.1**. CycloneDX 1.7 es ECMA-424.
- El riesgo es severidad × alcance × explotabilidad. VEX es cómo se escribe eso para que una máquina lo lea.
- El único gate bloqueante que se sostiene solo es "excepciones vencidas".

**Siguiente:** [Provenance, firma y verificación antes de desplegar](/blog/provenance-firma-y-verificacion-antes-de-desplegar/), donde el inventario se convierte en una cadena de evidencia.

## Checklist final

- [ ] Se generan **dos** SBOMs (build e imagen) y ambos se adjuntan al release.
- [ ] El SBOM del build se genera **antes** de empaquetar.
- [ ] La versión de la herramienta que generó el SBOM queda registrada junto a él.
- [ ] Los SBOMs se persisten en un almacén consultable por componente.
- [ ] Existe un ADR de formato con "objetivo no perseguido" y fecha de revisión.
- [ ] Ninguna documentación afirma que SPDX 3.0 sea la norma ISO.
- [ ] Ningún gate bloquea por CVSS aislado.
- [ ] Cada hallazgo no remediado tiene owner, justificación y **fecha de vencimiento**.
- [ ] Las decisiones `not_affected` están expresadas como VEX, no como silenciado en el scanner.
- [ ] Existe un gate que bloquea el release si hay excepciones vencidas.
- [ ] Ningún CVE mencionado en documentación pública es inventado.

---

## Fuentes (consultadas 2026-07-10)

- [CycloneDX — Specification Overview](https://cyclonedx.org/specification/overview/) — v1.7, publicada 2025-10-21; estandarizada como **ECMA-424** (2025-12-10).
- [SPDX Specification 3.0.1](https://spdx.github.io/spdx-spec/v3.0.1/)
- [ISO/IEC DIS 5962 — SPDX v3.0](https://www.iso.org/standard/93810.html) — SPDX 3.0 **en proceso**; la ISO vigente (ISO/IEC 5962:2021) corresponde a SPDX 2.2.1.
- [SLSA v1.2](https://slsa.dev/spec/v1.2/)
- [CISA — Minimum Requirements for VEX](https://www.cisa.gov/sites/default/files/2023-04/minimum-requirements-for-vex-508c.pdf) (abril 2023) — una afirmación `not_affected` **debe** llevar justificación o declaración de impacto.
- [CISA — VEX Status Justifications](https://www.cisa.gov/resources-tools/resources/vulnerability-exploitability-exchange-vex-status-justification-document-june-2022) (junio 2022).
- [OpenVEX — especificación](https://github.com/openvex/spec/blob/main/OPENVEX-SPEC.md) — implementación liviana conforme a los requisitos mínimos.
- Documentación oficial del escáner que elijas, para el alcance de su detección y su soporte de VEX.
- [Verificación de fuentes de la serie](/blog/verificacion-de-fuentes-serie-avanzada/)
