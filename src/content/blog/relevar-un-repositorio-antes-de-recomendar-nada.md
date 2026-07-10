---
title: "Relevar un repositorio antes de recomendar nada"
description: "Método de relevamiento técnico en cinco fases: inventario verificable, arquitectura real vs objetivo, matrices de diagnóstico, validaciones permitidas y recomendación clasificada."
pubDate: 2026-07-10
tags: ['auditoria-tecnica', 'arquitectura', 'quality-engineering', 'adr', 'due-diligence']
cluster: 'a09'
clusterTitle: "Relevamiento de un proyecto existente"
type: pilar
order: 1
readingLevel: "Avanzado"
prerequisites: "Requiere leer código y configuración de varios stacks."
icon: 'terminal'
iconHue: 45
---

> **Aviso.** Nexo Finanzas es **ficticio**. **Para escribir este artículo no se relevó ningún repositorio real.** Describe un método; las matrices que lo acompañan están deliberadamente vacías. No se ejecutó ningún comando.

> **Promesa del artículo.** Al terminar vas a tener un método de cinco fases para entender un sistema que no escribiste, sin romperlo y sin opinar antes de tiempo. Y vas a saber por qué la primera entrega no es un plan: es evidencia.

## El impulso que hay que resistir

Te dan acceso a un repositorio. En veinte minutos ya viste tres cosas que están mal: no hay tests de integración, el `Dockerfile` usa `latest`, y hay un `TODO` de 2023 en el código de pagos.

El impulso es abrir un PR. O peor, escribir un documento titulado "Propuesta de mejora".

**Resistilo.** Por tres razones que se descubren siempre demasiado tarde:

1. **No sabés qué problema resuelve el sistema.** Ese `TODO` puede estar ahí porque la alternativa era peor y alguien lo decidió con información que vos no tenés.
2. **No sabés qué está compensando cada decisión.** La ausencia de tests de integración puede convivir con un entorno de staging que se recrea con producción cada noche. Mala idea, pero es una idea, y la persona que la tomó merece que la entiendas antes de reemplazarla.
3. **La credibilidad se gasta una sola vez.** Una recomendación que ignora una restricción obvia del contexto quema todas las siguientes.

> **Tesis del artículo.** La primera fase es estrictamente de lectura y diagnóstico. No se modifica ningún archivo, dependencia, pipeline ni infraestructura hasta presentar evidencia y un plan.

## La regla que ordena todo el método

En cada afirmación que escribas, distinguí explícitamente tres categorías:

| Categoría | Cómo se escribe | Ejemplo |
|---|---|---|
| **Observación** | Con path y línea | *"`Dockerfile:1` usa `FROM openjdk:17` (tag mutable)."* |
| **Inferencia** | Marcada como tal | *"**Infiero** que no hay política de pinning, porque las 3 imágenes usan tags. No encontré un ADR que lo justifique."* |
| **Recomendación** | Separada, y al final | *"**Recomiendo** pinear por digest, con un bot de actualización."* |

Mezclarlas es el error que convierte un relevamiento en una opinión. Y separarlas tiene un efecto secundario: **te obliga a notar cuándo estás infiriendo.** Muchas de las cosas que "sabés" de un repositorio son inferencias que no verificaste.

**El corolario más importante:** no supongas que el README refleja el estado real. Contrastá documentación contra código, configuración, tests, CI/CD, dependencias y comportamiento ejecutable. El README es la intención de alguien en algún momento; el código es lo que pasa.

## Reglas de seguridad, innegociables

Antes de la primera fase, porque un relevamiento mal hecho es un incidente:

- **No mostrar secretos, tokens, `.env`, credenciales, PII ni URLs internas** en ninguna salida.
- **Si encontrás un secreto: reportá ubicación y tipo, nunca el valor.** *"Hay una credencial de base de datos en `src/main/resources/application-prod.yml:14`"*. Nunca la credencial. Y recomendá rotarla, porque el historial de Git la conserva aunque la borres.
- **No ejecutar** cargas, migraciones, deploys, scanners invasivos ni comandos destructivos.
- **No modificar producción ni servicios externos.**
- **No declarar éxito de un comando que no ejecutaste.** Si proponés `mvn verify`, escribí que es una propuesta. Esta serie entera cumple esa regla, y es la razón por la que cada artículo lo dice en su aviso inicial.

## Fase 1 — Inventario verificable

El objetivo no es entender: es **enumerar con evidencia**. Cada fila del inventario tiene un path.

Qué relevar:

- **Lenguajes, frameworks, versiones y sistema de build.** No el README: el `pom.xml`, el `build.gradle`, el `Dockerfile`.
- **Módulos, servicios, procesos y dependencias externas.**
- **APIs síncronas, eventos y schemas.** ¿Hay un `openapi.yaml`? ¿Está actualizado o es de hace dos años?
- **Bases de datos, migraciones y datos de prueba.**
- **Tests por tipo, herramienta y momento de ejecución.** No cuántos: *cuáles corren en qué etapa.*
- **Docker, Kubernetes, CI/CD y environments.**
- **Observabilidad, seguridad y gestión de secretos.**
- **Documentación, ADRs, runbooks y ownership.**
- **Licencia, contribución y automatizaciones de repo.**

**El hallazgo más frecuente de esta fase es una ausencia.** No hay ADRs. No hay runbooks. No hay `CODEOWNERS`. Registralas: una ausencia es un dato, y a menudo el más importante.

Y una técnica concreta que ahorra horas: **leé el historial de Git antes que el código.** `git log --stat` sobre los últimos seis meses te dice qué partes del sistema están vivas, cuáles están congeladas, y quién sabe de qué. Un archivo que nadie tocó en tres años es una de dos cosas: perfecto, o abandonado. Y hay que averiguar cuál.

## Fase 2 — Arquitectura real, y aparte, la objetivo

<figure class="diagram">
  <img src="/blog/diagrams/relevar-un-repositorio-antes-de-recomendar-nada-1.svg" width="872" height="352" alt="Diagrama: relevar-un-repositorio-antes-de-recomendar-nada (1)" loading="lazy" decoding="async" />
</figure>

Dibujá **lo que existe**. No lo que debería existir. No lo que el README dice que existe.

> **La regla más violada de todo el método: no dibujes componentes futuros como actuales.**

Un diagrama de arquitectura que muestra un outbox que el código no tiene es peor que no tener diagrama, porque la gente lo cree. Si hay una arquitectura objetivo, va en una **sección separada**, rotulada, con un color distinto si hace falta.

Y una prueba de honestidad: por cada caja del diagrama, deberías poder señalar el archivo donde vive. Si no podés, la caja es una inferencia, y hay que marcarla.

## Fase 3 — Las cuatro matrices

Acá el relevamiento se convierte en algo accionable. Las plantillas están en `artefactos/matrices-de-diagnostico.md`.

**1. Riesgo y cobertura.** El riesgo primero, el control después. Nunca al revés.

| Riesgo | Impacto | Evidencia de control actual | Gap | Prioridad |
|---|---:|---|---|---:|

La columna "evidencia" es la que hace el trabajo. *"Hay tests"* no es evidencia. *"`IdempotencyTest.java:34` verifica que dos requests con la misma clave producen un solo asiento"* sí lo es.

**2. Trazabilidad.** De un requisito a su evidencia.

| Requisito/journey | Test | Pipeline | Evidencia | Defecto/observabilidad |
|---|---|---|---|---|

Casi siempre revela que hay tests que no cubren ningún riesgo declarado, y riesgos declarados que no tienen ningún test. Ambos hallazgos son valiosos.

**3. Reproducibilidad.** La matriz que más incomoda.

| Área | Comando documentado | Funciona/verificado | Dependencia oculta | Mejora |
|---|---|---|---|---|

La columna **"Funciona/verificado"** solo se llena si lo ejecutaste. Si no, se escribe "no verificado". Es tentador asumir que `docker compose up` funciona. Casi nunca funciona en una máquina limpia.

**4. Madurez avanzada.** Las ocho capacidades de esta serie.

| Capacidad | Estado actual | Prerrequisito | Costo | Valor | Recomendación |
|---|---|---|---|---|---|

Evaluá: eventos, supply chain, progressive delivery, privacidad, data quality, reconciliación, FinOps, rule engine y platform engineering.

**La columna "Prerrequisito" es la que evita el desastre.** Recomendar GitOps a un proyecto sin observabilidad por versión es recomendarle un canary a ciegas. Cada capacidad avanzada tiene una base que debe existir primero, y el [mapa de la serie](/blog/coleccion/a00/) las ordena.

## Fase 4 — Validaciones permitidas

Solo lo no invasivo, y solo lo que registrás:

- Build limpio (`mvn -B clean verify`, en un clon fresco).
- Tests existentes.
- Linter y validación de configuración.
- `docker compose up` local.
- Análisis de dependencias no invasivo (`mvn dependency:tree`).
- Revisión de que los diagramas y bloques de código de la documentación sean sintácticamente válidos.

Y registrá, para cada uno: **comando, fecha, entorno, resultado y limitación.**

```text
Comando:    mvn -B clean verify
Fecha:      2026-07-10
Entorno:    clon limpio, JDK 21, sin caché de Maven
Resultado:  FALLA en :integration-tests
Limitación: requiere una variable NEXO_DB_URL no documentada en el README.
            No se ejecutaron los tests de integración.
```

Ese bloque vale más que tres páginas de análisis. **Encontraste una dependencia oculta ejecutando el comando documentado.** Es exactamente el tipo de hallazgo que un relevamiento debe producir, y que ninguna lectura de código produce.

**Regla absoluta:** si no ejecutaste algo, no declares que funciona. Y si falló, decilo con la salida, sin suavizarlo.

## Fase 5 — Recomendación, clasificada

Cada propuesta entra en exactamente una de cuatro categorías. La clasificación **es** la recomendación:

| Categoría | Significado | Ejemplo |
|---|---|---|
| **Corregir ahora** | Riesgo o bloqueo real | Una credencial en el repositorio; el build no reproduce |
| **Consolidar antes de escalar** | Deuda fundacional | `docker compose up` no funciona en una máquina limpia |
| **Extender después** | Capacidad avanzada con prerrequisitos cumplidos | Agregar outbox, ahora que los contratos están versionados |
| **No incorporar** | Complejidad sin valor actual | GitOps en un proyecto de un servicio y un desarrollador |

**La cuarta categoría es la que demuestra criterio.** Un relevamiento que recomienda las ocho capacidades avanzadas no relevó nada: aplicó una plantilla. Un relevamiento que dice *"no incorporen Kubernetes, no resuelve ningún riesgo que tengan hoy, y les va a costar el 30 % de su capacidad"* es el que vale.

Y una regla de secuencia: **"Consolidar antes de escalar" bloquea a "Extender después".** Si el build no reproduce, no importa cuánto quieras agregar eventos. La deuda fundacional no se compensa con capacidades avanzadas: se amplifica.

## La salida obligatoria

Diez secciones. En este orden, porque el orden **es** el argumento:

1. **Resumen ejecutivo basado en evidencia.** Tres párrafos. Sin adjetivos.
2. Inventario y arquitectura actual.
3. Riesgos y gaps priorizados.
4. Calidad de tests, datos, entornos y CI/CD.
5. Evaluación de las ocho capacidades avanzadas.
6. **Quick wins de máximo una semana.**
7. Roadmap 30/60/90 días.
8. ADRs que deberían escribirse.
9. Propuesta de artículos de blog respaldados por el proyecto.
10. **Lista de información no encontrada o no verificable.**

Las dos que importan más son la 6 y la 10, y son las que se omiten.

**Los quick wins** son tu crédito. Si tu primera entrega es un roadmap de 90 días, nadie te cree. Si tu primera entrega incluye *"agregué el `NEXO_DB_URL` faltante al README y ahora el build corre en una máquina limpia"*, todo lo demás se lee distinto.

**La lista de lo no verificable** es tu integridad. *"No pude verificar si el pipeline de producción usa la misma imagen que el de staging: no tengo acceso a la configuración de producción."* Esa frase te protege y le dice al lector exactamente dónde tu análisis deja de ser confiable.

Un relevamiento sin sección 10 está afirmando implícitamente que lo vio todo. Nadie lo ve todo.

## Anti-patrones

- **Abrir un PR antes de entender el sistema.** *Consecuencia:* quemás credibilidad con una recomendación que ignora una restricción obvia.
- **Creerle al README.** *Alternativa:* contrastar contra código, configuración y ejecución.
- **Mezclar observación, inferencia y recomendación.** *Consecuencia:* el relevamiento es una opinión. *Alternativa:* tres categorías, marcadas.
- **Dibujar la arquitectura objetivo como si fuera la actual.** *Alternativa:* sección separada, rotulada.
- **Declarar que un comando funciona sin ejecutarlo.** *Alternativa:* "no verificado".
- **Suavizar un fallo.** *Alternativa:* la salida, tal cual.
- **Mostrar el valor de un secreto encontrado.** *Alternativa:* ubicación y tipo; recomendá rotarlo, porque el historial lo conserva.
- **Recomendar las ocho capacidades avanzadas.** *Consecuencia:* aplicaste una plantilla, no relevaste. *Alternativa:* usá la categoría "no incorporar".
- **Recomendar una capacidad avanzada sobre deuda fundacional.** *Consecuencia:* la amplificás. *Alternativa:* "consolidar antes de escalar" bloquea.
- **Entregar un roadmap sin quick wins.** *Consecuencia:* nadie te cree. *Alternativa:* una semana de valor primero.
- **Omitir la lista de lo no verificable.** *Consecuencia:* afirmás implícitamente que lo viste todo. *Alternativa:* escribila; es tu integridad.

## Qué aprendimos / próximos pasos

- La primera fase es de lectura. No se toca nada.
- Observación, inferencia y recomendación son tres cosas, y hay que marcarlas.
- El README es la intención; el código es lo que pasa. `git log --stat` te dice qué está vivo.
- No dibujes componentes futuros como actuales.
- Ejecutar el comando documentado en una máquina limpia produce el mejor hallazgo del relevamiento.
- "No incorporar" es la recomendación que demuestra criterio.
- Los quick wins compran la credibilidad que el roadmap necesita.
- La lista de lo no verificable es lo que hace confiable al resto.

**Artefactos para usar hoy:** las cuatro matrices y el prompt de relevamiento.

**Siguiente:** una vez relevado, [el diseño del portfolio avanzado](/blog/coleccion/a10/).

## Checklist final

- [ ] No se modificó ningún archivo durante la fase de diagnóstico.
- [ ] Cada afirmación está marcada como observación, inferencia o recomendación.
- [ ] Cada observación tiene un path.
- [ ] Ningún secreto aparece en la salida; los encontrados se reportan por ubicación y tipo, con recomendación de rotación.
- [ ] El diagrama de arquitectura actual solo contiene componentes que existen.
- [ ] La arquitectura objetivo está en una sección separada y rotulada.
- [ ] Las cuatro matrices están completas, con evidencia real en la columna de control.
- [ ] Cada comando ejecutado tiene comando, fecha, entorno, resultado y limitación.
- [ ] Ningún comando no ejecutado se presenta como exitoso.
- [ ] Cada recomendación está clasificada en una de las cuatro categorías.
- [ ] Hay al menos una recomendación de "no incorporar".
- [ ] Hay quick wins de máximo una semana.
- [ ] Existe la sección de información no encontrada o no verificable.
- [ ] Se esperó aprobación antes de cambiar arquitectura, dependencias, datos o despliegue.

---

## Fuentes (consultadas 2026-07-10)

- Este artículo describe un método, no una herramienta. No depende de versiones.
- Para las ocho capacidades que la matriz de madurez evalúa, ver [el mapa de la serie](/blog/de-qa-automation-a-quality-engineering-mapa-de-180-dias/).
- [Google SRE — Postmortem Culture](https://sre.google/sre-book/postmortem-culture/) — para el tono sin culpables que un relevamiento debe mantener.
- [Verificación de fuentes de la serie](/blog/verificacion-de-fuentes-serie-avanzada/)
