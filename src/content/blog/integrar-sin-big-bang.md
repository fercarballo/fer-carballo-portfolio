---
title: "Integrar sin big bang: contratos, incrementos y reversibilidad"
description: "Plan de integración incremental: catálogo de contratos versionados, tres niveles de entorno, orden de integración con incrementos reversibles y arquitectura objetivo rotulada como tal."
pubDate: 2026-07-10
tags: ['arquitectura', 'integracion', 'contratos', 'adr', 'nexo-finanzas', 'quality-engineering']
cluster: 'a11'
clusterTitle: "Plan de integración con Nexo Finanzas"
type: pilar
order: 1
readingLevel: "Avanzado"
prerequisites: "Requiere haber recorrido los capítulos 01 a 08."
icon: 'infinity'
iconHue: 152
---

> **Aviso.** Nexo Finanzas es **ficticio**. **Ningún componente fue integrado ni ejecutado.** Los diagramas de arquitectura objetivo están rotulados como tales. No se afirma haber operado el sistema completo.

> **Promesa del artículo.** Al terminar vas a poder planificar la integración de un ecosistema de repositorios en incrementos que se validan, se revierten y se explican por separado; y vas a entender por qué el primer incremento —agregar un outbox— es una prueba de disciplina antes que de arquitectura.

## Antes de integrar: no asumas que existe

El prompt de este capítulo lista trece repositorios. La primera acción no es integrarlos.

> **No asumir que todos existen. Primero relevar el estado real.**

Es la regla del [capítulo 09](/blog/coleccion/a09/), y se aplica también a lo que vos mismo escribiste hace seis meses. Un repositorio que "tiene tests" puede tener tres tests que no cubren ningún riesgo. Uno que "publica eventos" puede estar publicando dentro de `@Transactional`.

**Integrar sobre una base que no relevaste es construir sobre una inferencia.**

## Los principios que ordenan el plan

Siete restricciones. Cada una impide un fracaso conocido.

1. **El producto central sigue siendo la transferencia ficticia.** Todo componente que no ayude a demostrar un riesgo de la transferencia es un componente que agregaste porque te gustó.
2. **Los repos de pruebas no duplican ownership.** Si `nexo-cross-channel-regression` define el schema de eventos, ahora hay dos dueños. Un contrato tiene un owner.
3. **Los componentes avanzados se pueden ejecutar de manera parcial.**
4. **Los contratos son versionados y tienen owners.**
5. **La demo básica no depende de servicios pagos.**
6. **El sistema completo no necesita levantarse para contribuir a un repo.** Esta es la más importante y la más violada.
7. **La observabilidad usa `correlationId` consistentes, sin PII.**

El principio 6 tiene una prueba concreta que podés correr hoy: **cloná un repositorio, borrá los otros doce, y corré sus tests.** Si fallan, tenés acoplamiento de código donde debería haber acoplamiento de contrato.

## Arquitectura objetivo — **rotulada como objetivo**

<figure class="diagram">
  <img src="/blog/diagrams/integrar-sin-big-bang-1.svg" width="1115" height="306" alt="Diagrama: integrar-sin-big-bang (1)" loading="lazy" decoding="async" />
</figure>

> **Este diagrama es la arquitectura OBJETIVO. No describe ningún sistema existente.** El diagrama de arquitectura actual se produce en el relevamiento, con evidencia, y va en una sección distinta.

Escribo esa advertencia porque es la regla que más se rompe, incluso por gente que la conoce. Un diagrama es persuasivo, y una vez que existe, la gente lo cree.

## El catálogo de contratos

Los seis contratos mínimos. El detalle completo está en `artefactos/catalogo-de-contratos.md`.

| Contrato | Owner | Por qué importa |
|---|---|---|
| OpenAPI de transferencias | `nexo-transfer-api` | La frontera síncrona |
| AsyncAPI de eventos | `nexo-event-platform` | La frontera asíncrona |
| Schema de reason codes | `nexo-risk-engine` | El vocabulario de las decisiones |
| Formato de evidencia / test results | `nexo-quality-developer-platform` | Lo que permite comparar entre repos |
| Convenciones de trace/correlation IDs | Transversal | Lo que permite depurar |
| Dataset sintético base | `nexo-transfer-api` | Lo que permite reproducir |

**La regla de ownership:** un contrato tiene **un** owner, y vive en el repositorio del **productor**. Si dos repos lo editan, no es un contrato: es un archivo compartido, y va a divergir.

Y una regla que se descubre tarde: **el contrato se publica como artefacto versionado del release**, no solo vive en `main`. Durante un incidente vas a necesitar saber qué contrato regía en el momento del fallo, y `main` solo sabe qué contrato rige hoy.

## Tres niveles de entorno

| Nivel | Propósito | Componentes | Coste / complejidad | ¿Obligatorio? |
|---|---|---|---|---|
| **Local mínimo** | Desarrollo de **un** repo | Sus dependencias estrictas | Bajo | **Sí** |
| **Integración local** | Journeys entre servicios | Compose con perfiles | Medio | Para eventos y reconciliación |
| **Cluster demo** | GitOps, canary, políticas | Kubernetes local | Alto | **No. Opcional** |

El nivel 3 es opcional **por diseño**, no por falta de tiempo. Un cluster local es una barrera de entrada: cualquiera que quiera correr tu demo —un entrevistador con quince minutos, un colaborador— se topa con él primero.

Si tu proyecto requiere Kubernetes para mostrar algo, mostralo en un `README` con capturas y evidencia fechada, y dejá que la demo básica corra con Compose.

## Orden de integración: ocho incrementos reversibles

Cada uno se valida, se revierte y se explica **por separado**. Ninguno depende de que el siguiente exista.

### 1. Congelar y versionar los contratos actuales

No es glamoroso y es el prerrequisito de todo. Un `openapi.yaml` sin versión no se puede evolucionar: no sabés desde dónde.

**Reversible:** trivialmente.
**Cómo se valida:** el pipeline valida el contrato y falla ante un cambio incompatible sin plan de migración.

### 2. Agregar outbox sin cambiar el comportamiento externo

**Este es el incremento que separa un ingeniero disciplinado de uno entusiasta.**

Agregás una tabla `outbox_event` y escribís en ella dentro de la transacción de negocio. Y eso es todo. No hay publisher todavía. No hay broker. Nadie lee la tabla.

**La respuesta de `POST /transfers` no cambia ni un byte.** Ni un campo nuevo, ni un header, ni un cambio de latencia perceptible.

¿Por qué? Porque si el outbox introduce un bug, querés poder afirmar con certeza que ningún cliente lo notó. Un cambio que altera simultáneamente la persistencia y el contrato tiene dos causas posibles cuando falla, y vas a investigar la equivocada.

**Reversible:** borrás la tabla. Nadie la lee.
**Cómo se valida:** los tests de contrato existentes pasan **sin modificación**. Ese es el criterio. Si tuviste que tocar un test de contrato, cambiaste el comportamiento externo.

Y un test nuevo: **un rollback de la transferencia no deja fila en el outbox.**

### 3. Publicar un evento y crear un consumidor de prueba

Ahora sí: publisher, broker local, y un consumidor que **no hace nada de negocio**. Solo registra que recibió el evento.

**Por qué un consumidor tonto primero:** te permite verificar la mecánica —el evento sale, llega, el `traceparent` cruza— sin arriesgar un efecto de negocio. Cuando el consumidor real llegue, ya sabés que el transporte funciona.

**Reversible:** apagás el publisher. La tabla se llena y nada más pasa. Esa es, de hecho, otra propiedad valiosa del outbox: **la publicación se puede detener sin detener el negocio.**
**Cómo se valida:** un evento publicado dos veces produce un solo registro en el inbox del consumidor.

### 4. Añadir reconciliación

El consumidor tonto se convierte en la proyección de ledger. Y aparecen las cinco invariantes.

**Este incremento es el que prueba que el 2 y el 3 funcionaron.** Es la primera vez que alguien puede afirmar, con evidencia, que ningún evento se perdió ni se inventó.

**Reversible:** la proyección es derivada. Se puede reconstruir desde los eventos.
**Cómo se valida:** INV-3 (ningún asiento sin transferencia completada) devuelve cero filas.

### 5. Incorporar evidencia de supply chain

Ortogonal a los anteriores. Se puede hacer en paralelo, y por eso conviene: da resultados sin tocar el dominio.

**Reversible:** cada escalón (inventario → escaneo → provenance → firma → policy) se revierte solo.
**Cómo se valida:** un artefacto no firmado es **rechazado**, y podés demostrar el rechazo.

### 6. Agregar un feature flag y un rollout local

Un solo flag, sobre una sola regla. No diez.

**Reversible:** el flag es el mecanismo de reversión.
**Cómo se valida:** el kill switch se ensaya y la fecha se registra.

### 7. Integrar el risk engine, no bloqueante

**El motor de riesgo evalúa y registra su decisión, pero no la aplica.** Es shadow mode, y es la forma correcta de introducir cualquier sistema de decisión en un flujo existente.

Corre así durante suficiente tiempo como para que aparezcan los casos raros. Recién entonces se conecta.

**Reversible:** apagás el flag. El motor sigue evaluando en sombra, o deja de evaluar.
**Cómo se valida:** la distribución de decisiones en sombra es la que esperabas. Si el motor habría rechazado el 30 % del tráfico, **encontraste algo antes de romper nada.**

### 8. Extraer golden paths a la plataforma

Último, porque no se plataformiza lo que no se hizo a mano.

**Reversible:** el escape hatch **es** la reversión. Un equipo puede dejar de usar la plataforma sin bloquearse.

## Las diez decisiones que hay que escribir

El prompt exige preparar diez ADRs. Están desarrollados en `artefactos/adr-backlog.md`, cada uno con la pregunta que debe responder.

1. Polyrepo versus monorepo.
2. Broker y alcance local.
3. Ownership de schemas OpenAPI/AsyncAPI.
4. Source of truth de transferencia y ledger.
5. Correlation e idempotency identifiers.
6. Estrategia de versionado.
7. CI por repo y pipeline de integración.
8. GitOps y separación CI/CD.
9. Datos sintéticos compartidos.
10. Reportes y evidencia centralizada.

El más urgente es el **4**, y es contraintuitivo: parece una discusión filosófica y es la que resuelve la mitad de las discusiones operativas. Cuando la API dice `COMPLETED` y el ledger no tiene asientos, ¿quién tiene razón? Sin un ADR, esa pregunta se responde en cada incidente, de nuevo, y distinto.

## Pruebas de integración

Ocho, una por frontera. Cada una nombrada por el riesgo que cubre, no por su número.

| Prueba | Frontera | Riesgo |
|---|---|---|
| **API contract** | Síncrona | Romper un cliente |
| **Event contract** | Asíncrona | Romper un consumidor desconocido |
| **Duplicate/retry** | Broker → consumidor | Doble efecto |
| **Reconciliation invariant** | Cruzada | Descuadre silencioso |
| **Risk decision reason code** | Motor → auditoría | Decisión no explicable |
| **Post-deploy synthetic** | Producción | Camino de bajo tráfico roto |
| **Artifact verification** | Registry → deploy | Desplegar algo ajeno |
| **Observability correlation** | Transversal | No poder depurar |

La última es la que casi nadie escribe y la que más veces se necesita: **un test que verifica que un `correlationId` generado en la API aparece en el log del consumidor, al otro lado del broker.** Si esa cadena se rompe, todos los demás tests pueden pasar y aun así no vas a poder diagnosticar nada.

## Anti-patrones

- **Integrar sobre lo que no relevaste.** *Alternativa:* el capítulo 09, incluso sobre tu propio código.
- **Big bang.** *Consecuencia:* cuando falla, no sabés qué incremento lo causó. *Alternativa:* ocho incrementos, cada uno reversible.
- **El outbox cambia la respuesta de la API.** *Consecuencia:* un fallo tiene dos causas posibles. *Alternativa:* los tests de contrato pasan **sin modificación**.
- **Consumidor real antes que consumidor tonto.** *Consecuencia:* depurás el transporte y el negocio a la vez. *Alternativa:* verificá la mecánica primero.
- **Risk engine bloqueante desde el día uno.** *Consecuencia:* descubrís que rechaza el 30 % con usuarios. *Alternativa:* shadow mode.
- **Dos repos editando el mismo contrato.** *Alternativa:* un owner, en el repo del productor.
- **Contrato que solo vive en `main`.** *Consecuencia:* no sabés qué regía durante un incidente. *Alternativa:* artefacto versionado del release.
- **Diagrama objetivo presentado como actual.** *Alternativa:* rotularlo. Siempre.
- **Requerir Kubernetes para la demo básica.** *Alternativa:* Compose; el cluster es un nivel opcional.
- **Un repo cuyos tests necesitan los otros doce.** *Consecuencia:* nadie contribuye. *Alternativa:* cloná, borrá el resto, corré los tests.
- **Postergar el ADR de source of truth.** *Consecuencia:* la misma discusión en cada incidente. *Alternativa:* escribirlo primero.

## Qué aprendimos / próximos pasos

- Relevá antes de integrar, incluso lo que escribiste vos.
- Un contrato tiene **un** owner, vive en el productor, y se publica versionado con el release.
- Agregar un outbox no debe cambiar ni un byte de la respuesta. El criterio: los tests de contrato pasan sin tocarlos.
- Un consumidor tonto primero separa la depuración del transporte de la del negocio.
- La reconciliación es lo que **prueba** que los dos incrementos anteriores funcionaron.
- El risk engine entra en shadow mode. Siempre.
- Un diagrama objetivo se rotula, porque una vez dibujado, la gente lo cree.

**Alternativa a este capítulo:** si no tenés implementación estable, [el capstone acotado](/blog/coleccion/a12/) es un mejor punto de entrada que integrar siete repos a medio hacer.

## Checklist final

- [ ] Se relevó el estado real antes de asumir que un repositorio existe.
- [ ] Cada contrato tiene un único owner, en el repo del productor.
- [ ] Cada contrato se publica como artefacto versionado del release.
- [ ] Cada repositorio corre sus tests sin los demás.
- [ ] La demo básica no requiere Kubernetes ni credenciales pagas.
- [ ] El incremento del outbox **no modificó ningún test de contrato**.
- [ ] Hay un test que demuestra que un rollback no deja evento.
- [ ] El primer consumidor no tenía efecto de negocio.
- [ ] El risk engine corrió en shadow mode antes de aplicar decisiones.
- [ ] El diagrama de arquitectura objetivo está rotulado como objetivo.
- [ ] Existe un test de correlación de punta a punta a través del broker.
- [ ] El ADR de source of truth está escrito.
- [ ] Cada incremento se puede revertir y explicar por separado.

---

## Fuentes (consultadas 2026-07-10)

- [AsyncAPI Documentation](https://www.asyncapi.com/docs) — línea estable 3.0.0.
- [OpenTelemetry Documentation](https://opentelemetry.io/docs/) — propagación de contexto; ver la advertencia sobre semconv de messaging en la [verificación de fuentes](/blog/verificacion-de-fuentes-serie-avanzada/).
- [W3C Trace Context](https://www.w3.org/TR/trace-context/)
- Los ocho capítulos anteriores de esta serie, cada uno con sus fuentes primarias.
- [Verificación de fuentes de la serie](/blog/verificacion-de-fuentes-serie-avanzada/)
