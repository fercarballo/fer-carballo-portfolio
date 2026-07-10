---
title: "Datos y entornos de prueba reproducibles: la base invisible de una suite confiable"
description: "Guía práctica de datos sintéticos, aislamiento por ejecución, seed/reset, secretos y contratos de ambiente para tests confiables."
pubDate: 2026-07-09
tags: ["test-data", "test-environments", "docker-compose", "test-reliability", "sdet"]
cluster: "01"
clusterTitle: "Arquitectura de Quality Engineering"
type: "satelite"
order: 3
repo: "integration-testing-testcontainers"
icon: "shield"
iconHue: 152
readingLevel: "Intermedio"
prerequisites: "Requiere nociones de contenedores, variables de entorno y CI."
---
> Artículo **satélite** de la colección. El marco general está en **[Arquitectura de Quality Engineering orientada a riesgo](/blog/arquitectura-quality-engineering-orientada-a-riesgo/)** (§7). Acá respondemos una sola pregunta con profundidad: **¿cómo construyo datos y entornos de prueba que no arruinen la confiabilidad de la suite?**

> **Convención de honestidad.** Distingo **hecho citado**, **decisión de diseño**, **hipótesis** y **ejemplo ficticio** (*Nexo Finanzas*, fintech inventada, datos sintéticos).

---

## 1. El problema: el test que falla "a veces", y nunca es el test

En *Nexo Finanzas* (ficticio), un test de "la transferencia deja el saldo correcto" falla una vez cada varias corridas. El equipo lo mira, lo vuelve a correr, pasa, y sigue. La explicación real es incómoda: hay **una sola cuenta de prueba** (`test-user-01`) compartida por varios pipelines que corren en paralelo. Un pipeline la deja en saldo 200; otro esperaba 1000. El test no está roto: el **entorno** es una variable global sin candado.

Esto tiene una consecuencia cultural devastadora: el equipo aprende que "los rojos a veces no son nada" y empieza a **ignorar la señal**. A partir de ese momento, un bug real disfrazado de "flaky de ambiente" pasa desapercibido. La confiabilidad de una suite no se pierde por malos asserts; se pierde por malos datos y entornos.

> **Tesis del artículo.** Los datos y los entornos **son parte de la arquitectura de calidad**, no un detalle de infraestructura. Un control es tan confiable como el piso sobre el que corre.

---

## 2. Antes de seguir: glosario mínimo

- **Datos sintéticos.** Datos ficticios generados a propósito para la prueba (cuentas, DNIs, saldos inventados). Opuesto a copiar datos de producción.
- **Seed.** Cargar el estado inicial que un test necesita (crear la cuenta, fijar el saldo).
- **Reset / teardown.** Dejar el entorno como estaba, para que la próxima ejecución no herede basura.
- **Aislamiento.** Que dos ejecuciones no compartan estado mutable (cada una con sus propios datos).
- **Entorno efímero.** Uno que se crea para un uso (p. ej. un PR) y se destruye después.
- **Contrato de ambiente.** Declaración explícita de qué servicios, versiones y datos base componen el entorno.
- **Secretos.** Tokens, claves, credenciales. Nunca en el repo; siempre inyectados.
- **PII.** Información personal identificable (nombre real, DNI real, número de cuenta real). Prohibida en datos de prueba.

---

## 3. Datos: sintéticos, deterministas y sin PII

Tres propiedades que buscamos en los datos de prueba, con sus tensiones:

- **Sintéticos.** Generados por el setup, nunca copiados de producción. *Por qué:* copiar producción mete PII y te expone a una fuga si ese dump aparece en un reporte o una captura. También te ata a un estado que cambia bajo tus pies.
- **Deterministas donde importa, aleatorios donde conviene.** Un test de idempotencia necesita una `Idempotency-Key` *controlada*; un test de robustez puede beneficiarse de entradas variadas. *Trade-off:* el aleatorio encuentra casos que no imaginaste, pero hace más difícil reproducir un fallo. Regla práctica: aleatorio **con semilla registrada**, para poder reproducir.
- **Mínimos y con intención.** El dataset más chico que ejercita el riesgo. *Por qué:* datasets enormes esconden qué caso realmente importa y ralentizan el seed.

**Ejemplo (ficticio, deliberadamente incompleto):**

```python
# tests/support/factories.py  (ejemplo ilustrativo, no listo para producción)
def make_account(balance_ars=1000, kind="checking"):
    return {
        "account_id": new_synthetic_id("acc"),  # id ficticio único por ejecución
        "holder_doc": synthetic_doc(),           # documento FICTICIO, nunca real
        "balance_ars": balance_ars,
        "kind": kind,
    }

def make_transfer(source, target, amount_ars, idem_key=None):
    return {
        "idempotency_key": idem_key or new_uuid(),  # controlable para tests de duplicación
        "source_account": source["account_id"],
        "target_account": target["account_id"],
        "amount_ars": amount_ars,
    }
```

**Qué valida / qué no.** Estas *factories* permiten que cada test cree exactamente el estado que necesita (una cuenta con saldo conocido, una transferencia con `idem_key` controlada). **No** validan reglas de negocio por sí solas; son andamiaje. Lo importante: el `holder_doc` es sintético; **jamás** un documento real. Un generador de documentos de prueba debe producir valores con el *formato* correcto pero fuera del espacio de documentos válidos reales cuando sea posible, y siempre marcados como ficticios.

*Anti-patrón (del pilar, §13.6):* datos de producción o secretos en repos, reportes o capturas. La consecuencia no es solo técnica: es legal. La alternativa es esta: sintético siempre, y capturas saneadas.

---

## 4. Aislamiento: el pecado del estado compartido

Volvamos al problema del §1. La raíz es **estado mutable compartido entre ejecuciones**. Hay un espectro de soluciones, de más barato/menos aislado a más caro/más aislado:

| Estrategia | Aislamiento | Costo | Cuándo usar |
|---|---|---|---|
| Cuenta compartida fija | Nulo | Mínimo | Casi nunca; solo lecturas idempotentes triviales |
| Datos únicos por ejecución (mismo entorno) | Medio | Bajo | La mayoría de tests de API con datos que el test crea |
| Esquema/namespace por ejecución | Alto | Medio | Cuando los tests tocan estado difícil de aislar por dato |
| Entorno efímero completo por PR | Muy alto | Alto | Riesgo alto, o cuando el estado es sistémico |

**Decisión de diseño (Nexo).** Para los tests de API de transferencias, la regla es: **cada test crea sus propias cuentas** con `new_synthetic_id`, de modo que dos ejecuciones nunca se pisan aunque compartan el mismo servicio. Para los E2E críticos, se levanta un **entorno efímero por PR**. No usamos entornos efímeros para todo porque el costo (tiempo de arranque, recursos) no se justifica en la capa de API, donde el aislamiento por dato alcanza.

> **Hipótesis a medir en tu contexto:** pasar de cuenta compartida a datos únicos por ejecución suele reducir drásticamente el flaky de origen ambiental. Es coherente y lo he visto sostener en la práctica, pero **no** te doy un porcentaje: medí tu flaky rate antes y después (ver el satélite de gates, §7).

---

## 5. Seed y reset: dejar el entorno como lo encontraste

El ciclo de vida de datos de un test tiene tres momentos: **seed → ejecución → reset**. Omitir el reset es la causa silenciosa de que "el test que corre solo pasa, pero en la suite falla": hereda basura del anterior.

Dos filosofías, con trade-offs:

- **Reset por transacción/rollback.** El test corre dentro de una transacción que se revierte al final. *Ventaja:* rapidísimo y perfectamente limpio. *Límite:* no sirve cuando la operación cruza servicios o produce efectos fuera de la base (eventos, colas).
- **Reset por recreación.** Se destruye y recrea el estado (o el entorno). *Ventaja:* funciona con efectos sistémicos. *Costo:* más lento.

<figure class="diagram">
  <img src="/blog/diagrams/datos-y-entornos-de-prueba-reproducibles-1.svg" width="1255" height="85" alt="Diagrama: datos-y-entornos-de-prueba-reproducibles (1)" loading="lazy" decoding="async" />
</figure>

**Lectura.** El teardown no es opcional ni "lo hacemos cuando haya tiempo": es el eslabón que garantiza que la ejecución *N+1* empiece del mismo punto que la *N*. Sin él, el resultado de un test depende del orden en que corrieron los demás, que es la definición misma de una suite no reproducible.

**Decisión de diseño.** Preferí seed/reset **idempotente**: correr el seed dos veces debe dejar el mismo estado que correrlo una. Así, un teardown que falló a medias no envenena la próxima corrida.

---

## 6. Secretos: fuera del repo, siempre

Regla sin excepciones: **ningún secreto vive en el repositorio.** Ni en el código, ni en un `.env` commiteado, ni en un YAML de ejemplo, ni en un log, ni en una captura.

- **En local:** un `.env` *no versionado* (en `.gitignore`) o un secret manager local.
- **En CI:** variables inyectadas por el runner desde un almacén de secretos.
- **En los ejemplos y docs:** *placeholders* obvios (`TOKEN=__redacted__`), nunca valores reales aunque sean de un ambiente de prueba.

**Por qué también en ambientes de prueba.** Un token de "staging" filtrado sigue siendo un vector: muchas veces staging tiene datos parecidos a producción, o el mismo token sirve en varios entornos por error de configuración. El hábito de no filtrar debe ser universal, no depender de "qué tan importante" parece el secreto.

*Verificación reproducible (procedimiento):* un *pre-commit hook* o un job de CI que escanee secretos (por ejemplo con una herramienta de detección de secretos) antes de permitir el push. No reporto aquí una tasa de detección porque depende de tu configuración; documentá qué herramienta, qué versión y qué reglas usás, con fecha.

---

## 7. Contratos de ambiente con Compose

Un **contrato de ambiente** hace explícito qué compone el entorno de prueba, para que "en mi máquina anda" deje de ser una explicación. [Docker Compose](https://docs.docker.com/compose/) (consultado 2026-07-09) sirve para esto: describe servicios, redes y volúmenes en un YAML y los levanta con un comando. La documentación oficial lo define como "una herramienta para definir y ejecutar aplicaciones multi-contenedor".

```yaml
# docker-compose.test.yml  (ejemplo ilustrativo, no listo para producción)
services:
  transfer-api:
    image: nexo/transfer-api:${API_TAG:-local}
    environment:
      - DB_URL=postgres://app:app@db:5432/transfers
      - IDEMPOTENCY_ENABLED=true
    depends_on:
      db:
        condition: service_healthy
  db:
    image: postgres:16
    environment:
      - POSTGRES_USER=app
      - POSTGRES_PASSWORD=app          # credencial LOCAL y ficticia, entorno efímero
      - POSTGRES_DB=transfers
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U app -d transfers"]
      interval: 3s
      retries: 10
```

**Bloque por bloque.**
- `image: nexo/transfer-api:${API_TAG:-local}` — la versión del servicio bajo prueba es una variable: podés apuntar al artefacto exacto de un PR (`API_TAG`) o a `local`. Esto ata la evidencia a una versión concreta.
- `IDEMPOTENCY_ENABLED=true` — el contrato declara la configuración funcional relevante para el riesgo que probamos.
- `depends_on … condition: service_healthy` + `healthcheck` — el API no arranca hasta que la base está *lista*, no solo "encendida". Ignorar esto produce un tipo clásico de flaky: el test corre antes de que la dependencia responda.
- La contraseña `app/app` es **local, ficticia y de un entorno efímero** que se destruye. No es un secreto de producción; aun así, en CI real preferimos inyectarla que hardcodearla, por hábito.

**Límite honesto.** Compose es excelente para topologías chicas y locales/CI. **No** es la respuesta para toda topología: sistemas grandes con muchos servicios, mensajería y datos usan orquestadores y entornos gestionados. *Decisión de diseño:* usar Compose para el entorno de prueba de *un* servicio y sus dependencias inmediatas; no pretender replicar toda la plataforma en un laptop.

---

## 8. Entornos efímeros por PR: aislamiento máximo

Para riesgo alto, el ideal es un entorno **creado por y para cada PR**, destruido al cerrarlo. Ventajas:

- Aislamiento total: el PR-1421 no puede pisar al PR-1422.
- Reproducibilidad: el entorno se define en código (el Compose o su equivalente), versionado con el PR.
- Evidencia atada a una versión exacta del sistema.

Costos honestos: consumo de recursos, tiempo de arranque, y complejidad de *tear-down* garantizado (un entorno efímero que no se destruye es una fuga de costos). *Decisión de diseño:* efímeros para E2E de riesgo alto; para el grueso de tests de API, aislamiento por dato sobre un entorno compartido pero **inmutable** entre corridas.

<figure class="diagram">
  <img src="/blog/diagrams/datos-y-entornos-de-prueba-reproducibles-2.svg" width="264" height="732" alt="Diagrama: datos-y-entornos-de-prueba-reproducibles (2)" loading="lazy" decoding="async" />
</figure>

**Lectura.** El paso `DOWN` es tan importante como el `UP`: un entorno efímero sin destrucción garantizada no es efímero, es basura acumulándose. Automatizá la destrucción incluso cuando los tests fallan (bloque `finally`, no solo camino feliz).

---

## 9. Anti-patrones de datos y entornos

1. **Cuenta/ambiente compartido y mutable.** *Síntoma:* fallos "aleatorios" que pasan al reintentar. *Causa:* estado global sin candado. *Impacto:* se normaliza ignorar rojos. *Alternativa:* datos únicos por ejecución o entorno efímero (§4).
2. **Copiar datos de producción.** *Impacto:* PII en tests, riesgo legal, estado que cambia solo. *Alternativa:* datos sintéticos generados por el setup (§3).
3. **Sin teardown.** *Síntoma:* pasa solo, falla en suite. *Impacto:* resultados dependientes del orden. *Alternativa:* reset idempotente (§5).
4. **Secretos en el repo o en logs/capturas.** *Impacto:* fuga. *Alternativa:* inyección + escaneo de secretos (§6).
5. **Entorno no declarado ("anda en mi máquina").** *Impacto:* irreproducibilidad. *Alternativa:* contrato de ambiente en código (§7).
6. **Efímero que no se destruye.** *Impacto:* costos que crecen en silencio. *Alternativa:* destrucción garantizada en `finally` (§8).
7. **Esperar por tiempo fijo (`sleep 5`) en vez de por readiness.** *Impacto:* flaky por dependencias no listas. *Alternativa:* healthchecks y esperas por condición (§7).

---

## 10. Conexión con Nexo Finanzas (ficticio)

Distribución sugerida entre repos ficticios:

- **`nexo-transfer-api`**: `tests/support/factories.py` (datos sintéticos), `docker-compose.test.yml` (contrato de ambiente), seed/reset idempotente.
- **`nexo-quality-platform`**: la orquestación de entornos efímeros por PR y la publicación de evidencia como artefacto.
- **`nexo-web-banking-e2e`**: consume un entorno efímero para los journeys críticos; nunca comparte cuentas entre corridas.

**Artefactos mínimos a crear:**
- `docker-compose.test.yml` con healthchecks (§7).
- Un módulo de *factories* de datos sintéticos con generador de documentos ficticios (§3).
- Un ADR "aislamiento de datos de prueba": registra *por qué* elegimos datos únicos por ejecución para API y efímeros para E2E, con sus costos.
- Un job de CI de escaneo de secretos (§6), documentando herramienta/versión/reglas.

**Evidencia reproducible (procedimiento, sin resultados inventados):**

```bash
# Prerrequisitos: Docker + Docker Compose v2; imagen nexo/transfer-api:local disponible.
# Entorno: local o runner de CI. Sin datos reales.
export API_TAG=local
docker compose -f docker-compose.test.yml up -d --wait   # espera healthchecks
pytest tests/api/idempotency_spec.py -q                   # controles de API
docker compose -f docker-compose.test.yml down -v         # teardown + borrar volúmenes
# Resultado esperado: los tests corren contra un entorno declarado y aislado.
# Limitación: valida la reproducibilidad del ENTORNO, no la exhaustividad de los casos.
```

`--wait` es la diferencia entre "arrancó" y "está listo"; `down -v` garantiza que no queden datos entre corridas. No incluyo un tiempo de arranque ni un conteo de tests: esos números dependen de tu máquina y debés registrarlos vos, con fecha y hardware.

---

## 11. Qué aprendimos y próximos pasos

- La confiabilidad de una suite se gana o se pierde en los datos y entornos, no en los asserts.
- El estado mutable compartido es el enemigo número uno; el aislamiento por ejecución es la defensa base.
- Datos sintéticos siempre; PII y secretos, nunca en el repo, logs o capturas.
- Seed/reset idempotente y esperas por *readiness* eliminan clases enteras de flaky.
- Compose declara el contrato de ambiente para topologías chicas; los efímeros dan aislamiento máximo con costo real.

**Enlaces internos:**
- Pilar: **[Arquitectura de Quality Engineering orientada a riesgo](/blog/arquitectura-quality-engineering-orientada-a-riesgo/)** (§7).
- **[Quality gates proporcionales al riesgo](/blog/quality-gates-proporcionales-al-riesgo/)** — el flaky de ambiente, que este artículo ataca, es lo que manda un gate a `review`.
- **[Métricas y trazabilidad de calidad sin castigar personas](/blog/metricas-y-trazabilidad-de-calidad/)** — "confiabilidad del entorno" es una de las métricas centrales.

---

## 12. Checklist de datos y entornos

- [ ] ¿Cada test crea sus propios datos, sin depender de cuentas compartidas?
- [ ] ¿Los datos son sintéticos, sin PII, generados por el setup?
- [ ] ¿Hay teardown idempotente que deja el entorno limpio para la próxima corrida?
- [ ] ¿El aleatorio usa semilla registrada para poder reproducir un fallo?
- [ ] ¿Los secretos están fuera del repo, inyectados, y hay escaneo automático?
- [ ] ¿El entorno está declarado como contrato (Compose u equivalente) con versiones?
- [ ] ¿Las esperas son por *readiness* (healthcheck), no por `sleep` fijo?
- [ ] ¿Los entornos efímeros se destruyen incluso cuando los tests fallan?
- [ ] ¿La evidencia está atada a una versión/imagen concreta del sistema bajo prueba?

---

### Fuentes (consultadas 2026-07-09)

- Docker Compose documentation (definición y modelo de servicios/redes/volúmenes). https://docs.docker.com/compose/
- IETF, "The Idempotency-Key HTTP Header Field" (Internet-Draft, no RFC; para los tests de idempotencia). https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/

> *Aviso.* Los ejemplos usan datos y credenciales ficticios de entornos efímeros. No representan datos ni sistemas reales, ni constituyen asesoramiento de seguridad o cumplimiento.

