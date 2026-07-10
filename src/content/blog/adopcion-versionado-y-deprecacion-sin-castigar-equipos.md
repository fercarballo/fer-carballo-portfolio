---
title: "Adopción, versionado y deprecación sin castigar equipos"
description: "Métricas de adopción voluntaria, fallos de plataforma vs de producto, versionado semántico de componentes de test, deprecación con migración asistida y retiro de capabilities."
pubDate: 2026-07-10
tags: ['platform-engineering', 'adopcion', 'versionado', 'deprecacion', 'developer-experience', 'metricas']
cluster: 'a08'
clusterTitle: "Platform engineering para Quality Engineering"
type: satelite
order: 3
readingLevel: "Avanzado"
prerequisites: "Requiere versionado semántico y operación de servicios internos."
icon: 'kube'
iconHue: 210
---

> **Aviso.** Nexo Finanzas es **ficticio**. **Todas las métricas de adopción son ilustrativas.** No se operó ninguna plataforma con usuarios reales. Este contenido describe diseño y criterio, no experiencia productiva.

> **Promesa del artículo.** Al terminar vas a poder medir si tu plataforma sirve sin convertir la métrica en un instrumento de presión, versionar componentes compartidos sin romper a nadie el martes, y retirar una capability muerta sin dejar equipos varados.

> Cierra el capítulo y la sección editorial de la serie. Asume el pilar y el artículo 2.

## La métrica que se corrompe al medirla

Un director pregunta: *"¿cuál es la adopción de la plataforma?"*. Respondés 60 %. Se fija un objetivo de 90 % para el trimestre.

En ese instante, la métrica dejó de medir adopción.

Lo que ocurre después es predecible:

- El equipo de plataforma presiona a los equipos rezagados.
- Los equipos adoptan la plataforma en el repositorio que menos importa, para figurar.
- Nadie reporta que el escape hatch les hace falta, porque usarlo cuenta como no-adopción.
- La plataforma pierde su única señal de producto honesta.
- Y cuando la plataforma falla, los equipos que fueron forzados no la arreglan: la culpan. Con razón.

Es la [ley de Goodhart](https://en.wikipedia.org/wiki/Goodhart%27s_law): cuando una medida se convierte en objetivo, deja de ser una buena medida.

> **La adopción voluntaria es la métrica.** Si la adopción es forzada, no medís si tu plataforma sirve: medís cuánta autoridad tenés.

La consecuencia práctica es incómoda y hay que defenderla: **una plataforma con 60 % de adopción voluntaria está en mejor estado que una con 95 % de adopción mandatoria.** En la primera, el 40 % que no adopta es información. En la segunda, no sabés nada.

## Métricas que informan

Cada una con su definición, y con la pregunta que responde. Ninguna con meta numérica.

| Métrica | Definición | Qué te dice |
|---|---|---|
| **Tiempo hasta el primer pipeline útil** | Mediana desde `git init` hasta un pipeline verde con evidencia | Si el golden path es más rápido que hacerlo a mano. **La métrica más importante** |
| **Adopción voluntaria por capability** | Repos que la usan ÷ repos que podrían | Si esa capability resuelve un problema real |
| **Fallos de plataforma vs de producto** | Fallos de pipeline clasificados por causa | Si sos confiable. Si el ratio sube, la adopción va a caer |
| **Tiempo de provisionamiento** | p95 de la CLI de entornos | Si cumplís tu SLO |
| **Uso del escape hatch, por motivo** | Conteo de issues `escape-hatch-usage` | **Tu backlog de producto, escrito por tus usuarios** |
| **Versiones obsoletas pendientes** | Repos en versión deprecada, por versión | Cuánta deuda de migración generaste |
| **Satisfacción cualitativa** | Entrevistas, no encuestas de 1 a 5 | Por qué |

Tres comentarios:

- **"Tiempo hasta el primer pipeline útil" es la mejor métrica de una plataforma.** Es un proxy directo del valor entregado y no se puede gamificar: o el camino es rápido o no lo es.
- **"Fallos de plataforma vs de producto" es la métrica de confianza.** Requiere clasificar cada fallo de pipeline. Cuesta disciplina y es la que predice la adopción futura: nadie adopta voluntariamente algo que le rompe el build.
- **"Uso del escape hatch, por motivo" no es una métrica de fracaso.** Es tu backlog, escrito por tus usuarios, con evidencia de demanda. Tratarla como fracaso es la forma más rápida de perderla, porque la gente deja de reportar.

### Y las que dañan

- **"% de repos en la plataforma" como objetivo.** Goodhart. Ver arriba.
- **Rankings entre equipos.** Convierten una herramienta en una competencia. El equipo que más necesita ayuda es el que peor queda, y el que peor queda es el que menos pide ayuda.
- **Encuestas de satisfacción de 1 a 5.** Producen un 3,7 que no le sirve a nadie. Cinco entrevistas de veinte minutos producen tres tickets accionables.
- **Cantidad de capabilities.** Es una métrica de output. Se maximiza construyendo cosas que nadie usa.

## Versionado: la promesa que hacés al publicar

Un componente compartido es una **API**. Y romperla en silencio es la forma más rápida de que veinte equipos dejen de confiar en vos.

Versionado semántico, aplicado a un componente de test:

| Cambio | Versión | Ejemplo en `nexo-evidence-adapter-junit` |
|---|---|---|
| **PATCH** | `2.3.0 → 2.3.1` | Corrige un bug; el comportamiento observable no cambia |
| **MINOR** | `2.3.1 → 2.4.0` | Agrega un campo opcional al contrato de evidencia |
| **MAJOR** | `2.4.0 → 3.0.0` | Cambia el significado de `riskId`; requiere acción del consumidor |

Y la parte difícil, que la teoría no cubre: **¿qué cuenta como breaking change en un componente de test?**

Estos rompen, aunque `semver` ingenuo diría que no:

- **Un test que antes pasaba ahora falla.** Aunque el nuevo comportamiento sea "más correcto". Si tu componente de aserción empieza a comparar mayúsculas y minúsculas, rompiste a todos. Es MAJOR, y una nota en el changelog no lo arregla.
- **Un default cambia.** El timeout por defecto pasa de 30 s a 10 s. Nada compila distinto; tres suites se vuelven flaky y nadie relaciona la causa. **MAJOR.**
- **La salida cambia de formato.** Aunque sea "mejor". Si alguien parsea tu salida —y alguien lo hace— la rompiste.
- **Cambia el orden de ejecución.** Los tests que dependían implícitamente del orden fallan. Sí, esos tests estaban mal. Y sí, los rompiste igual.

**La regla que resume:** en un componente de test, **cualquier cambio que altere el resultado de un test existente es MAJOR.** El contrato de un componente de test no es su firma: es su **comportamiento observable**, y un test verde es parte del comportamiento observable.

Esta regla parece exagerada hasta que rompés tres suites un martes.

### El contrato de compatibilidad

```yaml
# components/reporting/evidence-adapter-junit/COMPATIBILITY.md (resumen)
version: 2.3.0

guarantees:
  - "El schema de evidencia emitido es 1.x. Los consumidores de 1.0 siguen funcionando."
  - "Los defaults documentados no cambian dentro de una MAJOR."
  - "Un test que pasa con 2.x sigue pasando con cualquier 2.y posterior."

not_guaranteed:
  - "El orden de los campos en el JSON."
  - "El contenido exacto de los mensajes de log."
  - "Comportamiento ante entradas no documentadas."

support_window:
  current: "2.x"
  supported: "1.x hasta 2027-01-10"     # 6 meses desde la publicación de 2.0
  end_of_life: "0.x — sin soporte desde 2026-01-10"
```

`not_guaranteed` es tan importante como `guarantees`. Sin esa lista, alguien va a parsear tus logs y te va a reportar un bug cuando los cambies. Con la lista, la conversación es distinta y breve.

## Deprecación sin abandonar a nadie

Deprecar es la operación que separa un producto interno maduro de un repositorio con dueño.

Y la regla que la hace posible:

> **La deprecación es un trabajo del equipo de plataforma, no de los equipos usuarios.**

Si tu política de deprecación consiste en "avisamos y ellos migran", vas a tener veinte repos en la versión vieja durante tres años, y no vas a poder borrar nada.

<figure class="diagram">
  <img src="/blog/diagrams/adopcion-versionado-y-deprecacion-sin-castigar-equipos-1.svg" width="433" height="1095" alt="Diagrama: adopcion-versionado-y-deprecacion-sin-castigar-equipos (1)" loading="lazy" decoding="async" />
</figure>

La transición `SinAdopcion --> Promocionada` existe porque una capability sin adopción puede resolver un problema real que **nadie sabe que existe**. Un mes de promoción cuesta menos que retirarla y volver a construirla en dos años. Pero si tras eso sigue sin adopción, se retira.

### El proceso

**1. Anunciar, con fecha y alternativa.**

Nunca deprecar sin decir qué usar en su lugar. "Esta capability está deprecada" sin alternativa es abandonar a un usuario.

```text
[DEPRECADO] nexo env create --legacy
  Alternativa: nexo env create (sin flag)
  Fin de soporte: 2027-01-10
  Guía de migración: docs/deprecations/2026-07-env-legacy.md
  Migración asistida: `nexo migrate env-legacy` (automática en el 90% de los casos)
  Dudas: #nexo-quality-platform
```

**2. Advertir en runtime, no solo en el changelog.**

Nadie lee el changelog. La advertencia va donde el usuario la ve:

```text
⚠️  nexo env create --legacy está deprecado y dejará de funcionar el 2027-01-10.
    Corré `nexo migrate env-legacy` para migrar automáticamente.
    Detalles: docs/deprecations/2026-07-env-legacy.md
```

Y con una restricción que se olvida: **la advertencia no puede aparecer en cada línea de salida de una suite de 400 tests.** Una advertencia repetida 400 veces se filtra mentalmente en dos días. Una vez por ejecución, al final, donde se ve.

**3. Migración asistida.**

Este es el paso que la mayoría omite y el que define si la deprecación funciona. Si podés escribir un `codemod`, un script o una PR automática, **escribilo**. El costo es tuyo una vez; el costo de no escribirlo es de veinte equipos, veinte veces.

Y si no se puede automatizar: **el equipo de plataforma abre las PRs a mano.** Sí, en veinte repositorios. Es más barato que la alternativa: mantener dos versiones durante años.

**4. Medir la migración, no anunciarla.**

`Versiones obsoletas pendientes` por repositorio, en un dashboard público. Sin ranking, sin vergüenza pública: una lista de trabajo pendiente con owner.

**5. Retirar.**

En la fecha anunciada. Ni antes, ni "cuando todos migren" —eso nunca pasa.

Y si en la fecha quedan repos sin migrar, **la decisión es de la plataforma, no de los equipos**: extendés el soporte (y anunciás la nueva fecha) o migrás vos esos repos. Lo que no hacés es romperlos sin aviso, ni dejar la deprecación abierta para siempre.

### Ventana de soporte: escribila antes de necesitarla

Una política simple y defendible:

- **MINOR/PATCH:** sin ventana. Actualizá cuando quieras.
- **MAJOR:** la versión anterior se soporta **6 meses** desde la publicación de la nueva.
- **Retiro de una capability:** **12 meses** de anuncio.

Los números son ilustrativos y **deben decidirse antes de la primera deprecación**, no durante. Una ventana negociada bajo presión es una ventana que se negocia cada vez.

## Retirar una capability que nadie usa

El caso más incómodo, y el que cierra el ciclo del [pilar](/blog/una-quality-platform-es-un-producto-no-un-repo-de-utilidades/).

Construiste el generador de reportes visuales. Lo usan dos repos, uno es tuyo. Mantenerlo cuesta un día por mes.

**La tentación:** dejarlo. No molesta a nadie.

**El costo real:** ese día por mes no está en la capability que sí se usa. Y cada capability muerta hace más difícil navegar el catálogo, así que hace menos descubribles a las vivas.

**El procedimiento:**

1. **Preguntá por qué nadie la usa.** Puede ser que resuelva un problema real y nadie sepa que existe. Es un problema de descubribilidad, no de producto. Un mes de promoción cuesta menos que retirarla y volver a construirla.
2. **Si tras eso sigue sin adopción, retirala.** Con el mismo proceso de deprecación: anuncio, alternativa, ventana, migración asistida para los dos repos.
3. **Escribí por qué la retiraste.** `docs/deprecations/` no es solo un archivo de avisos: es la memoria institucional de qué se intentó y no funcionó. Sin eso, alguien la reconstruye en dos años.

El paso 3 es el que convierte una retirada en aprendizaje. Y es, en un portfolio, uno de los documentos que más criterio demuestra: **saber qué construiste y decidiste borrar.**

## Soporte: el trabajo invisible

Una plataforma sin soporte no es un producto. Y el soporte tiene un costo que hay que presupuestar, no absorber.

- **Un canal, con horario declarado.** "Respondemos en horario laboral" es honesto. "Respondemos siempre" es mentira.
- **Una rotación.** Si la misma persona responde todo, esa persona no construye, y cuando se va, la plataforma muere.
- **Un umbral de escalamiento**: si una pregunta se repite tres veces, es un bug de documentación. Si se repite cinco, es un bug de diseño.
- **Y una métrica:** tiempo hasta la primera respuesta. Si crece, la plataforma está creciendo más rápido que su capacidad de sostenerla, y eso es una señal para **dejar de agregar capabilities**.

Esa última señal es la que casi nadie escucha, y es la que separa una plataforma que envejece bien de una que colapsa bajo su propio catálogo.

## Anti-patrones

- **Convertir la adopción en cuota.** *Consecuencia:* Goodhart; perdés la única señal honesta. *Alternativa:* adopción **voluntaria** como métrica, sin meta.
- **Rankings de adopción entre equipos.** *Consecuencia:* el que más ayuda necesita, menos pide. *Alternativa:* lista de trabajo pendiente sin vergüenza pública.
- **Encuestas de 1 a 5.** *Consecuencia:* un 3,7 inútil. *Alternativa:* cinco entrevistas.
- **Tratar el uso del escape hatch como fracaso.** *Consecuencia:* la gente deja de reportarlo y perdés el backlog. *Alternativa:* es demanda de producto con evidencia.
- **Breaking change silencioso.** *Consecuencia:* tres suites rotas un martes y confianza destruida. *Alternativa:* en un componente de test, cualquier cambio que altere el resultado de un test existente es MAJOR.
- **Cambiar un default en una MINOR.** *Consecuencia:* flakiness sin causa aparente. *Alternativa:* MAJOR.
- **Deprecar sin alternativa.** *Consecuencia:* abandonás a un usuario. *Alternativa:* nunca sin la alternativa nombrada.
- **Advertencia de deprecación en cada línea de salida.** *Consecuencia:* se filtra mentalmente en dos días. *Alternativa:* una vez por ejecución, al final.
- **"Avisamos y que migren ellos".** *Consecuencia:* veinte repos en la versión vieja por tres años. *Alternativa:* migración asistida; si no se automatiza, abrís las PRs vos.
- **Esperar a que todos migren para retirar.** *Consecuencia:* nunca retirás. *Alternativa:* fecha anunciada; si quedan repos, la decisión es tuya, no de ellos.
- **Ventana de soporte negociada durante la deprecación.** *Alternativa:* escribila antes.
- **Mantener una capability muerta porque "no molesta".** *Consecuencia:* le roba tiempo a la viva y hace menos descubrible el catálogo. *Alternativa:* preguntá por descubribilidad, después retirá y **documentá por qué**.
- **Soporte sin rotación ni horario declarado.** *Consecuencia:* una persona sostiene todo y la plataforma muere con su salida. *Alternativa:* rotación, horario, y la señal de "dejar de agregar capabilities".

## Qué publicar en GitHub

```text
docs/deprecations/policy.md            # ventanas de soporte, escritas ANTES
docs/deprecations/2026-07-env-legacy.md
docs/deprecations/RETIRADAS.md         # qué se construyó, se retiró, y por qué
docs/platform-slos/                    # con not_promised
components/*/COMPATIBILITY.md          # guarantees y not_guaranteed
docs/quality/metricas-de-plataforma.md # sin metas numéricas
tools/migrate/                         # las migraciones asistidas
```

`docs/deprecations/RETIRADAS.md` es el documento que más criterio demuestra en un portfolio: la lista de lo que construiste, decidiste borrar, y por qué. Muy poca gente lo tiene, y dice más sobre madurez técnica que cualquier diagrama.

## Qué aprendimos / próximos pasos

- Cuando la adopción se vuelve objetivo, deja de medir adopción. 60 % voluntario > 95 % mandatorio.
- "Tiempo hasta el primer pipeline útil" es la mejor métrica, y no se puede gamificar.
- El uso del escape hatch es tu backlog de producto, escrito por tus usuarios.
- En un componente de test, **cualquier cambio que altere el resultado de un test existente es MAJOR.**
- La deprecación es trabajo de la plataforma, no de los equipos. Migración asistida, o PRs a mano.
- Retirar una capability muerta es un acto de mantenimiento, y documentar por qué se retiró es memoria institucional.
- Si el tiempo de respuesta del soporte crece, dejá de agregar capabilities.

**Cierre de la sección editorial de la serie.** Los capítulos que siguen ([09](/blog/coleccion/a09/) a [12](/blog/coleccion/a12/)) son de ejecución: cómo relevar, diseñar, integrar y construir. Y el [13](/blog/coleccion/a13/) es la capacidad transversal que debería haberte acompañado todo el camino: escribir la decisión **antes** de implementarla.

## Checklist final

- [ ] Ninguna métrica de adopción tiene meta numérica.
- [ ] La adopción medida es **voluntaria**.
- [ ] No hay rankings de adopción entre equipos.
- [ ] Se mide "tiempo hasta el primer pipeline útil".
- [ ] Los fallos de pipeline se clasifican en plataforma vs producto.
- [ ] El uso del escape hatch se registra por motivo y alimenta el backlog.
- [ ] Cada componente tiene `COMPATIBILITY.md` con `guarantees` y `not_guaranteed`.
- [ ] Un cambio que altera el resultado de un test existente se publica como MAJOR.
- [ ] Ningún default cambia en una MINOR.
- [ ] La política de ventanas de soporte se escribió **antes** de la primera deprecación.
- [ ] Ninguna deprecación se anuncia sin alternativa nombrada.
- [ ] Las advertencias de deprecación aparecen una vez por ejecución.
- [ ] Existe migración asistida, o la plataforma abre las PRs.
- [ ] El retiro ocurre en la fecha anunciada, y la decisión sobre los rezagados es de la plataforma.
- [ ] Existe `RETIRADAS.md` con lo que se borró y por qué.
- [ ] El soporte tiene canal, horario declarado y rotación.

---

## Fuentes (consultadas 2026-07-10)

- [Semantic Versioning 2.0.0](https://semver.org/) — con la salvedad, propia de este artículo, de que en un componente de test el comportamiento observable incluye el resultado de los tests.
- [OpenTelemetry Documentation](https://opentelemetry.io/docs/) — para clasificar fallo de plataforma vs de producto.
- [SLSA v1.2](https://slsa.dev/spec/v1.2/)
- [OpenFeature](https://openfeature.dev/) — **spec 0.8.0 (pre-1.0)**; un ejemplo de por qué `not_guaranteed` importa.
- Sobre platform engineering: **campo en evolución.** Verificá y citá las fuentes originales que uses.
- [Verificación de fuentes de la serie](/blog/verificacion-de-fuentes-serie-avanzada/)
