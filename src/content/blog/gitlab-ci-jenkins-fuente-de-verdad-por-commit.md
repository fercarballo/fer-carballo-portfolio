---
title: "GitLab CI y Jenkins: una sola fuente de verdad por commit"
description: "Evitá la doble autoridad GitLab/Jenkins: una fuente de verdad por commit, sin pipelines duplicados ni despliegues simultáneos. Patrones de interop y migración."
pubDate: 2026-07-09
tags: ["gitlab-ci", "jenkins", "ci-cd", "release-engineering", "migration"]
cluster: "04"
clusterTitle: "CI/CD y continuous quality"
type: "satelite"
order: 4
icon: "infinity"
iconHue: 200
readingLevel: "Intermedio–Avanzado"
prerequisites: "(DevOps, SDET, Platform Eng). Requiere haber leído el pilar."
---
> **Advertencia de uso.** Los ejemplos de `.gitlab-ci.yml` y `Jenkinsfile` son **ilustrativos**; validá la sintaxis contra tu versión (GitLab y Jenkins evolucionan). No incluyas secretos ni credenciales en pipelines ni en logs.

*Satélite de [Continuous Quality: pipeline de evidencia proporcional al riesgo](/blog/continuous-quality-pipeline-basado-en-riesgo/).*

## Resumen ejecutivo

- El riesgo no es "usar dos herramientas": es que **dos sistemas tomen decisiones de autoridad sobre el mismo commit** y lleguen a veredictos distintos.
- Regla central: **una sola fuente de verdad por commit.** Para cada repositorio, un sistema decide el gate y el release; el otro es informativo o está en migración.
- El peor caso concreto es el **doble deploy**: GitLab y Jenkins despliegan el mismo commit en paralelo y compiten por el entorno.
- Jenkins sigue siendo válido como **executor acordado** o durante una **migración**; no como "segundo juez" sin gobierno.
- La convivencia se diseña: quién dispara, quién decide, dónde vive la evidencia y cómo se evita el despliegue simultáneo.

---

## 1. El problema: dos semáforos para el mismo cruce

En Nexo Finanzas (ficticia; datos sintéticos), el equipo de `nexo-transfer-api` adoptó GitLab CI, pero Jenkins —heredado— sigue "porque algunos jobs viejos lo usan". Ambos observan `main`. Un día, GitLab pone **verde** un commit (sus contratos pasaron) y Jenkins lo pone **rojo** (corre una suite distinta y más vieja). ¿Cuál es la verdad?

Peor: ambos tienen un stage de deploy a *staging*. En el mismo commit, los dos intentan desplegar. El entorno queda en un estado indeterminado y nadie sabe qué versión quedó.

El problema de fondo no es técnico sino de **autoridad**: no se decidió **quién manda** sobre cada commit. Dos pipelines no son un problema si tienen roles claros; son un problema cuando **ambos creen ser la fuente de verdad**.

<figure class="diagram">
  <img src="/blog/diagrams/gitlab-ci-jenkins-fuente-de-verdad-por-commit-1.svg" width="1203" height="159" alt="Diagrama: gitlab-ci-jenkins-fuente-de-verdad-por-commit (1)" loading="lazy" decoding="async" />
</figure>

**Lectura:** dos flujos actúan sobre el mismo commit y el mismo entorno sin una autoridad única; el resultado es un estado del que nadie puede dar cuenta.

---

## 2. Cinco preguntas que definen la autoridad

Antes de tocar YAML o Groovy, respondé —y **documentá**— estas preguntas por repositorio:

1. **¿Quién dispara?** ¿Qué evento inicia qué pipeline? (evitar que un push cree dos pipelines redundantes).
2. **¿Quién decide el gate?** ¿Qué sistema evalúa los controles requeridos y produce el veredicto que importa?
3. **¿Quién decide el release/deploy?** Un solo sistema debe tener autoridad de despliegue por entorno.
4. **¿Dónde vive la evidencia?** Reportes, digests y decisión de release deben tener un hogar único y trazable.
5. **¿Cómo se vinculan commit, resultado y artefacto?** El mismo commit debe mapear a un solo veredicto y un solo artefacto versionado.

Si no podés responderlas, no tenés dos pipelines: tenés dos fuentes de verdad compitiendo.

---

## 3. Evitar el pipeline duplicado dentro de GitLab

Antes del problema GitLab-vs-Jenkins, existe un problema más chico y frecuente: **GitLab disparándose dos veces a sí mismo** (pipeline de branch + pipeline de merge_request para el mismo push). Se resuelve con `workflow:rules` (mismo patrón del pilar):

```yaml
# ILUSTRATIVO — un disparador por commit
workflow:
  rules:
    - if: '$CI_PIPELINE_SOURCE == "merge_request_event"'
    - if: '$CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH'
```

Esto declara: corré para eventos de merge request **o** para la rama default, evitando el doble pipeline. Es la versión "intra-herramienta" de la misma regla: **un veredicto por commit**. Ver la [documentación de `workflow` de GitLab](https://docs.gitlab.com/ci/yaml/workflow/) (consultada 2026-07-09).

---

## 4. Jenkins como executor acotado, no como segundo juez

Cuando Jenkins es el executor acordado (por infraestructura, plugins específicos o una migración en curso), su pipeline debe ser **mínimo y con rol declarado**. Retomamos el `Jenkinsfile` del encargo:

```groovy
// Jenkinsfile  (ILUSTRATIVO — validar contra tu version de Jenkins)
pipeline {
  agent any
  stages {
    stage('Verify') {
      steps {
        sh './mvnw -B test -Dgroups="unit,api"'
      }
      post {
        always {
          junit 'target/surefire-reports/TEST-*.xml'   // publica evidencia
        }
      }
    }
    stage('Compatibility smoke') {
      when { branch 'main' }
      steps {
        sh './scripts/run-compatibility-smoke.sh'
      }
    }
  }
}
```

**Puntos por bloque:**

- **`agent any`** es aceptable para un ejemplo, pero en producción se acota a un agente/label específico con permisos mínimos.
- **`post { always { junit ... } }`** publica los reportes **aunque el stage falle**: es el equivalente Jenkins de `artifacts:reports` con `when: always`. La evidencia se conserva.
- **`when { branch 'main' }`** limita el smoke de compatibilidad a la rama principal, análogo a las `rules` de GitLab.
- **Rol declarado:** este pipeline **verifica compatibilidad**; **no** despliega ni emite el veredicto de release. Ese rol es de GitLab (la fuente de verdad del ejemplo). Verificá la sintaxis vigente en [Jenkins Pipeline Syntax](https://www.jenkins.io/doc/book/pipeline/syntax/) (consultado 2026-07-09).

> **Decisión de diseño.** "Executor acotado" significa que Jenkins ejecuta un trabajo específico que aporta valor propio (p.ej. una matriz de compatibilidad que corre mejor en su infraestructura) y **reporta a la misma evidencia**, sin duplicar el gate ni el deploy.

---

## 5. Patrones de convivencia (elegí uno y documentalo)

Ninguno es "el mejor"; cada uno tiene un costo. Elegí según tu contexto y escribilo en un ADR.

| Patrón | Cómo funciona | Cuándo conviene | Costo / riesgo |
|---|---|---|---|
| **GitLab autoridad, Jenkins informativo** | GitLab decide gate y deploy; Jenkins corre jobs auxiliares que publican evidencia. | Ya migraste el núcleo a GitLab pero Jenkins aporta algo puntual. | Mantener dos configs; disciplina para que Jenkins no "decida". |
| **Jenkins autoridad, GitLab espejo** | Jenkins decide; GitLab solo refleja estado. | Organización con Jenkins maduro y GitLab reciente. | GitLab puede confundir a quien crea que decide. |
| **GitLab dispara Jenkins** | GitLab orquesta y llama a Jenkins como paso (trigger/API); un solo flujo. | Necesitás capacidades de Jenkins pero querés un solo hilo de decisión. | Acoplamiento; manejo de credenciales del trigger. |
| **Migración con fecha** | Ambos corren temporalmente; GitLab es autoridad, Jenkins queda de respaldo con **fecha de retiro**. | Estás migrando y querés red de seguridad. | Si no hay fecha, el "temporal" se vuelve permanente. |

> **Anti-patrón:** "los dejamos a ambos por las dudas" sin decidir autoridad. *Causa:* miedo a apagar Jenkins. *Costo:* veredictos contradictorios y doble deploy. *Alternativa:* declarar autoridad hoy y, si migrás, ponerle **fecha de retiro** a la red de seguridad.

---

## 6. La regla no negociable: un solo sistema despliega por entorno

El gate contradictorio es molesto; el **doble deploy** es peligroso. Mecanismos concretos para garantizar autoridad única de despliegue:

- **Credenciales de deploy en un solo sistema.** Si solo GitLab tiene el permiso/identidad para desplegar a *staging*, Jenkins **no puede** hacerlo aunque su YAML lo intente. La autoridad se hace cumplir con permisos, no con acuerdos verbales.
- **Un environment con concurrencia controlada.** GitLab modela [environments](https://docs.gitlab.com/ci/environments/) con despliegues y (según configuración) prevención de despliegues concurrentes. Definí que un solo pipeline despliega a la vez.
- **Lock explícito** si de verdad conviven dos ejecutores: un candado (por ejemplo, en el gestor de artefactos o un lock externo) que impida dos despliegues simultáneos al mismo entorno.
- **Trazabilidad commit → artefacto → deploy:** cada despliegue registra qué commit y qué digest de imagen desplegó, para que "qué versión está en staging" tenga siempre una respuesta.

---

## 7. Migración de Jenkins a GitLab (o viceversa) sin caos

Si vas a migrar, tratalo como un cambio gobernado, no como un big-bang:

1. **Inventariá** qué hace hoy Jenkins: jobs, credenciales, plugins críticos, quién depende de cada uno.
2. **Declará autoridad desde el día 1:** GitLab pasa a ser la fuente de verdad; Jenkins queda **informativo con fecha de retiro**.
3. **Portá por clase de control**, no todo junto: primero build/unit, luego contratos, luego smoke.
4. **Comparación en paralelo temporal:** durante un período acotado, corré ambos y compará veredictos para detectar diferencias (esto es aceptable **solo** con autoridad ya declarada, para que las diferencias sean diagnóstico, no confusión).
5. **Apagá Jenkins** cuando la clase esté migrada y verificada. La fecha de retiro evita el "temporal eterno".

> **Honestidad (inferencia).** No existe una migración sin costo. Vas a duplicar mantenimiento durante la transición; el objetivo es que esa duplicación sea **temporal y con fecha**, no una convivencia indefinida.

---

## 8. Conexión con Nexo Finanzas

- **`nexo-quality-platform`**: aloja un **ADR de fuente de verdad** (`docs/adr/0003-single-source-of-truth-ci.md`) que declara, por repositorio, quién decide gate y deploy, y —si aplica— la fecha de retiro de Jenkins.
- **`nexo-transfer-api`**: `.gitlab-ci.yml` como autoridad; si Jenkins persiste, su `Jenkinsfile` se limita a jobs auxiliares que publican a la misma evidencia.
- **`nexo-quality-control-tower`**: un solo lugar donde ver, por commit, el veredicto y el artefacto desplegado (sin ambigüedad de "cuál pipeline").

**ADR sugerido — contenido mínimo:** contexto (Jenkins heredado + GitLab nuevo), decisión (GitLab autoridad; Jenkins informativo/executor acotado), regla de despliegue único por entorno, plan/fecha de migración, consecuencias.

---

## 9. Qué aprendimos y próximos pasos

- El problema no es tener dos herramientas, sino **dos autoridades** sobre el mismo commit.
- Una fuente de verdad por commit; un solo sistema despliega por entorno.
- Jenkins es válido como executor acotado o en migración con fecha, no como segundo juez.
- La autoridad se hace cumplir con **permisos y locks**, no con acuerdos verbales.

**Enlaces internos:**

- [Continuous Quality (pilar)](/blog/continuous-quality-pipeline-basado-en-riesgo/)
- [Quality gates auditables](/blog/quality-gates-auditables-policy-as-code/) — quién decide y con qué política.
- [Cadena de suministro en el pipeline](/blog/cadena-de-suministro-pipeline-sbom-slsa-provenance/) — dónde vive la firma y qué se verifica antes de desplegar.

## Checklist de fuente de verdad

- [ ] Declaré, por repositorio, quién decide gate y quién decide deploy.
- [ ] Un solo disparador por commit (sin pipelines duplicados).
- [ ] Un solo sistema tiene credenciales/identidad de deploy por entorno.
- [ ] Existe prevención de despliegues concurrentes al mismo entorno.
- [ ] Cada deploy registra commit y digest desplegado.
- [ ] Si Jenkins convive, su rol está declarado y (si migro) tiene fecha de retiro.
- [ ] Hay un ADR de fuente de verdad en `nexo-quality-platform`.
- [ ] La evidencia tiene un hogar único y trazable.

---

*Este artículo describe prácticas de ingeniería. No es asesoramiento legal ni de cumplimiento. Verificá la sintaxis de GitLab CI y Jenkins contra la documentación oficial vigente para tu versión.*

