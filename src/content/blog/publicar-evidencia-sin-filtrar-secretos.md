---
title: "Publicar evidencia sin filtrar secretos: sanear reportes, capturas y artefactos en un repo público"
description: "Guía de seguridad para blogs y repos de QA: qué nunca publicar (.env, tokens, PII, datos bancarios), cómo sanear capturas y reportes, escanear secretos con gitleaks, y versionar resúmenes en vez de artefactos pesados. Con SECURITY.md y notas de PCI DSS/GDPR/BCRA."
pubDate: 2026-07-09
tags: ["seguridad", "privacidad", "secretos", "pci-dss", "gdpr", "gitleaks", "evidencia", "sdet"]
cluster: "15"
clusterTitle: "Investigación técnica y escritura basada en evidencia"
type: "satelite"
order: 4
repo: "performance-reliability-testing-suite"
icon: "book"
iconHue: 220
readingLevel: "Intermedio"
prerequisites: "QA/SDET con Git, CI/CD y nociones de seguridad"
---
> Satélite del pilar **[Escribir sobre calidad con evidencia](/blog/escribir-sobre-calidad-con-evidencia-metodo-editorial/)**. Cubre cómo publicar evidencia sin exponer secretos, PII ni datos sensibles. Etiquetas: <span class="em em--hecho">HECHO</span>, <span class="em em--inferencia">INFERENCIA</span>, <span class="em em--decision">DECISIÓN</span>, <span class="em em--opinion">OPINIÓN</span>.
>
> **Aviso de alcance:** las referencias a PCI DSS, GDPR y BCRA delimitan jurisdicción y versión, y **no constituyen asesoramiento legal ni de cumplimiento**. Ante datos reales, consultá al equipo de seguridad/legal de tu organización.

## El problema: la evidencia que te delata

El artículo pilar te pide publicar evidencia reproducible: comandos, reportes, capturas, configuración. <span class="em em--inferencia">INFERENCIA</span> Justo ahí aparece el riesgo: la evidencia que hace creíble tu post es la misma que puede filtrar un token, una URL interna, un número de tarjeta o el correo de un cliente. Un dashboard de JMeter trae URLs completas; un `.env` "de ejemplo" trae una API key real; una captura de un test trae, en la esquina, el email de una persona.

**[HECHO/OPINIÓN]** Un secreto commiteado no se borra con un `git commit` posterior: queda en el historial y, en un repo público, puede haber sido clonado, indexado o cacheado en segundos. La regla operativa: **tratá todo secreto que tocó un repo público como comprometido y rotalo**.

Este satélite es la lista de control de seguridad y privacidad para que la fintech ficticia **Nexo Finanzas** —y tu portfolio— publiquen evidencia sin convertirse en un incidente.

---

## Prerrequisitos y glosario

- **Secreto:** cualquier credencial que da acceso: token, API key, contraseña, cadena de conexión, clave privada, cookie de sesión.
- **PII (Información Personal Identificable):** datos que identifican a una persona: nombre, email, teléfono, documento, y —en pagos— PAN (número de tarjeta), CVV, etc.
- **PAN / CHD:** *Primary Account Number* y *Cardholder Data*, términos del universo de tarjetas de pago.
- **Sanear (redact):** eliminar o enmascarar datos sensibles de un artefacto **antes** de publicarlo.
- **Artefacto:** salida de una prueba: reporte HTML/XML, log, `.jtl`, screenshot, traza.

---

## Concepto: qué nunca se publica

Lista dura (el prompt del pilar la exige explícitamente):

| Nunca publicar | Por qué | Dónde suele filtrarse |
|---|---|---|
| Tokens, API keys, contraseñas | Acceso directo a sistemas | `.env`, configs, logs, capturas de terminal |
| Archivos `.env` reales | Concentran secretos | Commit accidental; falta de `.gitignore` |
| URLs/endpoints internos | Mapa de superficie de ataque | Dashboards de carga, logs, HAR |
| PII | Privacidad y normativa | Screenshots, datos de fixtures, reportes |
| Datos bancarios reales (PAN/CVV) | Riesgo legal y de fraude | Fixtures "copiados de prod", capturas |
| Reportes sin sanear | Mezclan todo lo anterior | Artefactos de CI subidos "tal cual" |

<span class="em em--decision">DECISIÓN</span> La contramedida de fondo: **usá siempre datos sintéticos** para el contenido público (como hace toda esta colección con Nexo Finanzas). Si nunca hubo un dato real en tu fixture, no hay nada que filtrar. Para tarjetas de prueba, usá los **números de test que publican los procesadores de pago** (por ejemplo, los rangos de prueba documentados por Stripe u otros gateways), nunca un PAN real.

---

## Concepto: el flujo de saneo antes de publicar

<figure class="diagram">
  <img src="/blog/diagrams/publicar-evidencia-sin-filtrar-secretos-1.svg" width="657" height="1254" alt="Diagrama: publicar-evidencia-sin-filtrar-secretos (1)" loading="lazy" decoding="async" />
</figure>

Tres compuertas, en orden: **secretos → PII/URLs → tamaño/crudo**. Nada se publica sin pasar las tres.

---

## Implementación 1: prevenir el commit del secreto

### `.gitignore` primero

<span class="em em--decision">DECISIÓN</span> La prevención más barata es no rastrear lo que no debe versionarse:

```gitignore
# Secretos y entorno
.env
.env.*
!.env.example         # el ejemplo SIN valores reales SI se versiona
*.pem
*.key
secrets/

# Artefactos crudos y pesados de pruebas
results/*.jtl
report/                # dashboards HTML de JMeter/k6 (pueden traer URLs)
*.har                  # capturas de red: casi siempre traen tokens/PII
screenshots/raw/       # capturas sin sanear
```

Explicación por bloque:

- `.env.*` se ignora, pero `!.env.example` se **incluye**: versioná una plantilla con claves sin valores (`API_KEY=`), para que otro sepa qué variables necesita sin recibir tus secretos.
- `report/`, `*.jtl`, `*.har`: los artefactos crudos se ignoran por defecto; se publica un **resumen saneado** (ver más abajo), no el crudo.

### Escaneo automático de secretos

<span class="em em--hecho">HECHO</span> Existen escáneres de secretos open source de uso extendido: **gitleaks** ([github.com/gitleaks/gitleaks](https://github.com/gitleaks/gitleaks)) y **TruffleHog** ([github.com/trufflesecurity/trufflehog](https://github.com/trufflesecurity/trufflehog)). GitHub, además, ofrece *secret scanning* nativo en sus repos ([docs de GitHub secret scanning](https://docs.github.com/en/code-security/secret-scanning/about-secret-scanning)). Verificá el estado y las opciones vigentes al configurarlo.

Hook de pre-commit para frenar el secreto **antes** de que entre al historial:

```yaml
# .pre-commit-config.yaml  (framework pre-commit)
repos:
  - repo: https://github.com/gitleaks/gitleaks
    rev: <tag-vigente>          # fijá un tag; verificá el vigente al instalar
    hooks:
      - id: gitleaks
```

```bash
# Instalación local y ejecución sobre TODO el historial (no solo el diff)
pip install pre-commit
pre-commit install                     # activa el hook en cada commit
gitleaks detect --source . --redact    # --redact oculta el valor en el output
```

Explicación:

- `pre-commit install` hace que el escaneo corra en cada commit: un secreto detectado **aborta** el commit.
- `gitleaks detect ... --redact` escanea el historial completo y **oculta el valor** del secreto en su propio reporte (para no filtrarlo en los logs de CI).
- <span class="em em--inferencia">INFERENCIA</span> Ponelo también como job de CI: la máquina no se olvida de correrlo, la persona sí.

> **Si ya commiteaste un secreto:** <span class="em em--hecho">HECHO</span> eliminarlo del último commit no basta; sigue en el historial. Hay que **rotar la credencial** (invalidarla en el proveedor) y reescribir el historial (por ejemplo con `git filter-repo`, [git-filter-repo](https://github.com/newren/git-filter-repo)). Rotar primero; limpiar el historial después.

---

## Implementación 2: sanear PII y URLs en artefactos

Cuando el artefacto ya existe y necesitás publicar una parte:

### Capturas de pantalla

- <span class="em em--decision">DECISIÓN</span> Recortá antes de subir: la barra de URL, los emails, los nombres reales, los IDs internos. <span class="em em--inferencia">INFERENCIA</span> El enmascarado con un rectángulo negro *encima* en algunos editores no borra el pixel subyacente si se guarda mal; preferí **recortar** (crop) o **repintar** la zona y reexportar el PNG, no superponer una forma en un PDF/SVG editable.
- Reemplazá datos por sintéticos legibles: `cliente@ejemplo.test`, `Ana Prueba`, `**** **** **** 4242`.

### Logs y reportes de texto

Un `sed` puede enmascarar patrones antes de versionar un resumen (ejemplo ilustrativo, ajustá los patrones a tus datos):

```bash
# Enmascara emails y (fragmentos tipo) PAN en un log antes de publicar un extracto.
# Revisar SIEMPRE la salida a mano: una regex no captura todo.
sed -E \
  -e 's/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/<email>/g' \
  -e 's/\b[0-9]{13,19}\b/<pan-enmascarado>/g' \
  results/run.log > results/run.public.log
```

Explicación y **límite importante**:

- La primera regla enmascara emails; la segunda, secuencias largas de dígitos (posibles PAN).
- **[OPINIÓN/advertencia]** Una regex **no es un saneador completo**: no entiende contexto, no captura formatos partidos ni datos en campos codificados. Usala como primer filtro y **revisá el resultado a ojo** antes de publicar. Nunca confíes el saneo de datos regulados únicamente a un `sed`.

---

## Implementación 3: resumen versionado vs. artefacto pesado

<span class="em em--decision">DECISIÓN</span> Diferenciá qué va al repositorio:

| Artefacto | ¿Versionar en el repo? | Alternativa |
|---|---|---|
| Reporte **resumido** y saneado (tabla de percentiles, veredicto) | **Sí** — es liviano, legible en diff y es la evidencia que respalda el post | — |
| Dashboard HTML crudo de JMeter/k6 (MBs, con URLs) | **No** | Publicar el resumen; guardar el crudo fuera del repo público |
| `.jtl` / `.har` crudos, videos de e2e | **No** | Artifact store del CI con retención/acceso controlado |
| Datasets grandes | **No** (hincha el repo y su historial para siempre) | Almacenamiento de artefactos o Git LFS, según sensibilidad |

<span class="em em--hecho">HECHO</span> En pipelines, la forma correcta de manejar reportes es declararlos como *reports* del CI, que la plataforma parsea y expone de forma controlada. En GitLab, por ejemplo, `artifacts:reports` soporta `junit`, `coverage_report` (Cobertura/JaCoCo), `codequality`, `sarif` (SARIF 2.1.0) y otros; y esos artefactos se suben **siempre**, aun si el job falla. Fuente primaria: [GitLab — CI/CD artifacts reports types](https://docs.gitlab.com/ci/yaml/artifacts_reports/).

```yaml
# .gitlab-ci.yml — publica el reporte JUnit de forma estructurada,
# en vez de subir el dashboard crudo al repo.
test:
  stage: test
  script:
    - npm test -- --reporter junit --output report/junit.xml
  artifacts:
    when: always            # se sube aun si el job falla (util para evidencia)
    reports:
      junit: report/junit.xml
    expire_in: 30 days      # retencion acotada; no eternizar artefactos
```

Explicación:

- `reports:junit` deja que GitLab **parse y muestre** los resultados en la UI del MR, sin que subas HTML pesado al repo.
- `when: always` conserva la evidencia incluso cuando el test rojo es justamente lo que querés mostrar (resultado negativo honesto, como en el [satélite de experimentos](/blog/hipotesis-medible-experimento-reproducible/)).
- `expire_in` evita acumular artefactos indefinidamente.

---

## Verificación: etiquetá la naturaleza de la integración

El pilar exige declarar si un resultado es **simulado, con trial, local o productivo**. <span class="em em--decision">DECISIÓN</span> Poné una etiqueta visible en cada pieza de evidencia:

- `SIMULADO`: mock/stub, ningún sistema real detrás.
- `TRIAL`: cuenta de prueba de un tercero (sandbox del gateway, plan free).
- `LOCAL`: tu máquina/Docker, sin datos ni infraestructura productiva.
- `PRODUCTIVO`: **rara vez** debería publicarse; solo con datos sintéticos y aprobación.

<span class="em em--inferencia">INFERENCIA</span> Esta etiqueta protege dos cosas: la seguridad (nadie confunde tu laptop con prod) y la honestidad (nadie cree que probaste en prod cuando probaste en local).

---

## Nota de cumplimiento (delimitada y sin asesoramiento legal)

**Aviso:** lo siguiente ubica jurisdicción y versión de algunos marcos; **no es asesoramiento legal ni de cumplimiento**. Verificá siempre la versión vigente en la fuente oficial y consultá a tu equipo legal/seguridad.

- **PCI DSS** (tarjetas de pago) — administrado por el **PCI Security Standards Council**; la familia vigente es la **v4.x**. <span class="em em--hecho">HECHO</span> El PAN, el CVV y demás *cardholder data* están sujetos a requisitos estrictos de protección; publicarlos es incompatible con el estándar. Fuente oficial: [PCI SSC — Document Library](https://www.pcisecuritystandards.org/document_library/). *(Alcance: aplica a entidades que almacenan/procesan/transmiten datos de tarjeta; verificá la versión vigente el día que lo cites.)*
- **GDPR** (protección de datos, UE) — Reglamento (UE) **2016/679**. <span class="em em--hecho">HECHO</span> Regula el tratamiento de datos personales de personas en la UE; publicar PII sin base legal es un riesgo. Fuente oficial: [EUR-Lex — Reglamento 2016/679](https://eur-lex.europa.eu/eli/reg/2016/679/oj). *(Alcance: jurisdicción de la UE/EEE.)*
- **BCRA** (Argentina) — el **Banco Central de la República Argentina** emite normativa para el sistema financiero argentino. <span class="em em--inferencia">INFERENCIA</span> Si tu portfolio simula una fintech argentina, mencioná el marco pero **no cites números de comunicación de memoria**: remití a la fuente oficial y aclarante que es contexto ficticio. Fuente oficial: [bcra.gob.ar](https://www.bcra.gob.ar/). *(Alcance: jurisdicción argentina.)*
- **OWASP API Security Top 10 (2023)** — estándar de facto de riesgos de API; útil para razonar qué exponés en endpoints de evidencia. Fuente: [OWASP API Security](https://owasp.org/API-Security/).

---

## Límites y trade-offs

- <span class="em em--opinion">OPINIÓN</span> El saneo perfecto no existe: siempre podés omitir un dato en una esquina de una captura. Por eso la mejor defensa es **no tener datos reales** en el material público, no confiar en enmascararlos después.
- **Menos crudo publicado = menos reproducibilidad literal.** Al publicar resúmenes en vez de artefactos crudos, sacrificás algo de reproducibilidad exacta. <span class="em em--decision">DECISIÓN</span> Es un trade-off correcto: describís cómo regenerar el crudo (comando + entorno) en vez de exponerlo.
- **Los escáneres tienen falsos negativos.** gitleaks/TruffleHog no detectan todo; son una red, no una garantía.

---

## Anti-patrones (causa → consecuencia → alternativa)

- **Subir el reporte "tal cual".**
  *Causa:* comodidad. *Consecuencia:* URLs internas, tokens y PII en un repo público. *Alternativa:* las tres compuertas (secretos → PII → resumen) antes de publicar.

- **Enmascarar con un rectángulo encima en un formato editable.**
  *Causa:* creer que taparlo es borrarlo. *Consecuencia:* el dato sigue debajo y se recupera. *Alternativa:* recortar/repintar el pixel y reexportar.

- **"Borré el secreto en el commit siguiente".**
  *Causa:* desconocer cómo funciona Git. *Consecuencia:* el secreto sigue en el historial y probablemente ya fue clonado. *Alternativa:* rotar la credencial + reescribir historial.

- **`.env` real "de ejemplo" versionado.**
  *Causa:* copiar el `.env` de trabajo. *Consecuencia:* filtración directa. *Alternativa:* `.env.example` con claves vacías + `.env` en `.gitignore`.

- **Fixtures con datos "copiados de producción".**
  *Causa:* atajo para tener datos "realistas". *Consecuencia:* PII/PAN reales en el repo. *Alternativa:* datos sintéticos y números de tarjeta de prueba oficiales del gateway.

---

## Conexión accionable con Nexo Finanzas

```text
SECURITY.md                    # qué reportar, qué nunca publicar, cómo rotar
.gitignore                     # .env, artefactos crudos, capturas sin sanear
.pre-commit-config.yaml        # gitleaks como hook
evidence/
  README.md                    # SOLO resúmenes saneados + etiqueta (LOCAL/TRIAL/...)
docs/runbooks/
  sanitize-evidence.md         # pasos para sanear capturas y reportes
.env.example                   # plantilla sin valores
```

Acciones:

1. Creá `SECURITY.md` con: qué no se publica, cómo reportar una filtración, y el procedimiento de rotación de credenciales.
2. Activá gitleaks como pre-commit **y** como job de CI.
3. Escribí `docs/runbooks/sanitize-evidence.md` con la checklist de saneo, y exigí en `CONTRIBUTING.md` que toda evidencia pase por él.

---

## Qué aprendimos / próximos pasos

- La evidencia que da credibilidad es también la que puede filtrar datos: publicá con tres compuertas (secretos → PII/URLs → resumen vs. crudo).
- La defensa de fondo es **usar datos sintéticos**: si nunca hubo un dato real, no hay filtración posible.
- Un secreto que tocó un repo público se considera comprometido: rotá primero, limpiá el historial después.
- Versioná **resúmenes saneados**, no dashboards crudos; usá el *report* del CI para los artefactos estructurados.

**Continuá con:**
- El **[pilar](/blog/escribir-sobre-calidad-con-evidencia-metodo-editorial/)** para integrar el saneo al flujo editorial de la semana.
- El **[satélite de experimentos](/blog/hipotesis-medible-experimento-reproducible/)**: aplicá el saneo a los reportes de JMeter/k6.
- El **[satélite de ADR](/blog/adr-seleccion-herramienta-katalon-selenium/)**: al publicar capturas de tu suite, saneá antes.

---

## Checklist final

- [ ] `.gitignore` cubre `.env*`, `*.pem/*.key`, artefactos crudos y capturas sin sanear.
- [ ] Hay escaneo de secretos en pre-commit **y** en CI.
- [ ] Si hubo un secreto commiteado, se rotó la credencial y se limpió el historial.
- [ ] Toda captura/reporte pasó por saneo (recorte real, no rectángulo encima).
- [ ] Los datos son sintéticos; las tarjetas usan números de prueba oficiales.
- [ ] Se publica el resumen saneado, no el dashboard/`.jtl`/`.har` crudo.
- [ ] Cada evidencia lleva etiqueta: SIMULADO / TRIAL / LOCAL / PRODUCTIVO.
- [ ] Las menciones a PCI DSS/GDPR/BCRA delimitan versión y jurisdicción y aclaran que no son asesoramiento legal.
- [ ] Existe `SECURITY.md` con procedimiento de reporte y rotación.

---

*Nota de veracidad: Nexo Finanzas y todos sus datos son ficticios. Las herramientas (gitleaks, TruffleHog, git-filter-repo) y los marcos (PCI DSS v4.x, GDPR 2016/679, BCRA, OWASP API Security 2023) fueron ubicados contra fuentes oficiales el 2026-07-09; verificá versión y vigencia antes de publicar. Este artículo no es asesoramiento legal ni de cumplimiento.*

