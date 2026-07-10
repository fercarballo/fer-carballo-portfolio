---
title: "Entornos y datos de prueba: el producto interno que decide si tu suite es confiable"
description: "Cómo diseñar entornos y datos de prueba reproducibles, seguros y gobernados: contrato de entorno, seeds deterministas, aislamiento por ejecución y evidencia trazable, aplicado al ecosistema ficticio Nexo Finanzas."
pubDate: 2026-07-09
tags: ["test-data", "test-environments", "reproducibility", "docker", "ci-cd", "quality-engineering"]
cluster: "05"
clusterTitle: "Entornos y datos de prueba"
type: "pilar"
order: 1
icon: "container"
iconHue: 190
readingLevel: "Intermedio"
repo: "nexo-transfer-api"
---
> **Bajada.** Un test automatizado es confiable solo si sus precondiciones pueden declararse, recrearse, observarse y limpiarse de forma segura. Los entornos y datos de prueba son un **producto interno** con contratos, ciclo de vida, ownership y evidencia; no una carpeta de credenciales ni una copia informal de producción. Este artículo desarrolla esa tesis con trade-offs explícitos: el nivel de aislamiento, fidelidad y costo se deriva del riesgo, no de una receta universal.

**Resumen ejecutivo.** Vas a salir de acá con: un modelo mental que separa entorno, configuración, secreto, dato y evidencia; una definición operativa de reproducibilidad (la "receta mínima" de una ejecución); una matriz de decisión para elegir aislamiento y fidelidad según riesgo; un seed determinista e idempotente con trazabilidad por `run_id`; y un plan de práctica en tres incrementos sobre el ecosistema ficticio **Nexo Finanzas**. Todos los datos, importes y nombres son sintéticos; ninguna cifra es una medición real.

## Índice

1. [El síntoma: "en mi máquina pasa"](#1-el-síntoma-en-mi-máquina-pasa)
2. [Modelo mental: cinco cosas que no son lo mismo](#2-modelo-mental-cinco-cosas-que-no-son-lo-mismo)
3. [Qué significa reproducibilidad (y qué no)](#3-qué-significa-reproducibilidad-y-qué-no)
4. [Diseño basado en riesgo: local, CI o integrado](#4-diseño-basado-en-riesgo-local-ci-o-integrado)
5. [El contrato de entorno como producto interno](#5-el-contrato-de-entorno-como-producto-interno)
6. [Configuración y secretos sin falsas promesas](#6-configuración-y-secretos-sin-falsas-promesas)
7. [Datos sintéticos, representativos y minimizados](#7-datos-sintéticos-representativos-y-minimizados)
8. [Lifecycle de datos: generar, usar, limpiar, auditar](#8-lifecycle-de-datos-generar-usar-limpiar-auditar)
9. [Aislamiento y concurrencia](#9-aislamiento-y-concurrencia)
10. [Dependencias externas: simular o integrar](#10-dependencias-externas-simular-o-integrar)
11. [Nexo Finanzas de punta a punta](#11-nexo-finanzas-de-punta-a-punta)
12. [Evidencia y troubleshooting sin privilegios](#12-evidencia-y-troubleshooting-sin-privilegios)
13. [Gobernanza y colaboración](#13-gobernanza-y-colaboración)
14. [Anti-patrones: causa, consecuencia, alternativa](#14-anti-patrones-causa-consecuencia-alternativa)
15. [Qué haría diferente en otro contexto](#15-qué-haría-diferente-en-otro-contexto)
16. [Costos, límites y evolución](#16-costos-límites-y-evolución)
17. [Cierre: plan de práctica en tres incrementos](#17-cierre-plan-de-práctica-en-tres-incrementos)
18. [Fuentes](#18-fuentes)

## Prerrequisitos y glosario mínimo

Para seguir el razonamiento alcanza con nociones de Git, HTTP/REST, SQL básico y contenedores. Repasamos lo justo:

- **Variable de entorno / `.env`:** un mecanismo de configuración por proceso. Un archivo `.env` **no** es automáticamente un mecanismo seguro de secretos: es texto plano que, si se versiona o se imprime en logs, queda expuesto.
- **Imagen vs. contenedor:** la imagen es la plantilla inmutable (idealmente fijada por versión o *digest*); el contenedor es la instancia en ejecución. `docker compose` orquesta varios contenedores, redes y volúmenes declarados en un archivo.
- **Transacción y migración (SQL):** una transacción agrupa operaciones que se confirman o revierten juntas; una migración es un cambio de esquema versionado. Un `TRUNCATE` o `DELETE` de reset debe ser una decisión deliberada, no un hábito.
- **Fixture / factory / mock / stub:** formas de establecer precondiciones. La fixture es un estado conocido; la factory lo genera con parámetros; mocks y stubs reemplazan dependencias. El *contract testing* verifica que la simulación no divergió del proveedor real.
- **Configuración vs. secreto vs. dato personal:** la configuración no confidencial puede versionarse; el secreto (credencial, token, clave) nunca; el dato personal o sensible además está alcanzado por normativa (consultá al equipo de seguridad/compliance de tu organización — este artículo no es asesoramiento legal).
- **CI/CD:** cada job debería ser una ejecución aislada y trazable por commit, que produce artefactos y evidencia.

## 1. El síntoma: "en mi máquina pasa"

Caso ficticio. En Nexo Finanzas, la suite E2E de transferencias falla todos los martes cerca de las 10:00. El test `transferencia_exitosa_entre_cuentas` transfiere ARS 1.000 desde la cuenta `demo-user-7`. El martes otra suite —regresión cross-channel— usa **la misma cuenta** en el mismo entorno compartido y la deja con saldo insuficiente. El producto no tiene ningún defecto: el test falla por **estado compartido**.

El costo real no es el rojo en el pipeline. Es lo que viene después: alguien re-ejecuta hasta que pasa, el equipo aprende a desconfiar de la señal y, cuando aparece un defecto real de saldo, nadie lo mira porque "ese test es flaky". La confiabilidad de una suite no se degrada por mala suerte; se degrada porque las precondiciones viven fuera del control del test.

La salida no es "más retries" ni "pedir otra cuenta al equipo de datos". Es tratar entornos y datos como lo que son: **parte de la arquitectura de calidad**, con el mismo rigor que el código de producción.

## 2. Modelo mental: cinco cosas que no son lo mismo

La confusión más cara del área es usar "el ambiente" como una bolsa donde entran credenciales, datos, URLs y estado. Separemos:

| Elemento | Definición | Ejemplo (ficticio) | Propietario | Dónde vive | Cómo rota / vence |
|---|---|---|---|---|---|
| **Entorno** | Conjunto de servicios en ejecución con versiones conocidas | `transfer-api` + PostgreSQL levantados por Compose | Equipo de plataforma / squad dueño | Se crea y destruye por ejecución | Se destruye al terminar; la *receta* persiste en Git |
| **Configuración** | Parámetros no confidenciales que ajustan comportamiento | `SPRING_PROFILES_ACTIVE=test`, URL interna de la base | Squad dueño del servicio | Versionada en el repo (Compose, YAML) | Cambia por PR revisado |
| **Secreto** | Credencial que otorga acceso | Password de la base, token de un sandbox | Seguridad + squad | Gestor de secretos / archivo local **ignorado por Git** | Rotación programada; efímero en CI |
| **Dato de prueba** | Estado de negocio que una prueba necesita | Cuenta `run-42-alice` con saldo ARS 150.000 | Quien escribe la prueba | Generado por seed/factory versionado | Se limpia al final de la ejecución |
| **Evidencia** | Registro que permite reconstruir qué pasó | Commit, tag de imagen, `run_id`, reporte, logs saneados | Quality engineering | Artefactos del pipeline con retención acotada | Expira por política de retención |

Dos consecuencias prácticas de esta tabla:

1. **Cada fila tiene un ciclo de vida distinto.** Versionar un secreto "porque es cómodo" mezcla la fila 3 con la fila 2 y convierte el repositorio en una superficie de ataque.
2. **Cada fila tiene un owner distinto.** Cuando "los datos de prueba son de todos", son de nadie, y el estado compartido del §1 es inevitable.

## 3. Qué significa reproducibilidad (y qué no)

**Reproducibilidad** es poder recrear una ejecución a partir de una receta declarada. La receta mínima:

```text
código (commit) + dependencias + versión/digest de imágenes + migraciones aplicadas
+ configuración no secreta + seed (script y parámetros) + comando de ejecución
= entorno equivalente; y la evidencia permite comparar resultados
```

Si cualquiera de esos ingredientes vive en la cabeza de una persona, en una wiki desactualizada o en un estado previo del ambiente, la ejecución no es reproducible: es repetible *con suerte*.

**Fidelidad** es otra cosa: cuánto se parece el entorno de prueba a producción (volumen de datos, topología, latencias, integraciones). Un entorno puede ser perfectamente reproducible y poco fiel (SQLite en memoria) o muy fiel y nada reproducible (un staging compartido que nadie sabe cómo quedó en ese estado). Son dos ejes independientes y se eligen **por riesgo**, no por ideología:

- Para verificar la lógica de idempotencia de una transferencia, la reproducibilidad importa más que la fidelidad.
- Para validar un plan de capacidad, la fidelidad (volumen, hardware, datos realistas en distribución, no en contenido) importa más — y eso pertenece a otro tipo de experimento (ver la colección de performance).

El primer diagrama resume el ciclo de vida que hace posible la receta:

<figure class="diagram">
  <img src="/blog/diagrams/entornos-y-datos-de-prueba-reproducibles-1.svg" width="1514" height="63" alt="Diagrama: entornos-y-datos-de-prueba-reproducibles (1)" loading="lazy" decoding="async" />
</figure>

Leelo de izquierda a derecha como una cadena de custodia: el commit fija código y contrato de entorno; de ahí salen imágenes y migraciones con versiones conocidas; el entorno se crea aislado para esta ejecución; el seed instala **solo** el estado que la suite declara necesitar; la suite corre; la evidencia se captura **antes** de limpiar; y el resultado queda asociado a todos los ingredientes anteriores. Si un eslabón se rompe —por ejemplo, el seed se ejecuta a mano "para ganar tiempo"— el resultado deja de ser trazable y la cadena entera pierde valor.

## 4. Diseño basado en riesgo: local, CI o integrado

No todo merece el mismo entorno. Cuadro de decisión (los valores son cualitativos, no benchmarks):

| Dónde | Velocidad de feedback | Costo | Aislamiento | Confianza que aporta | Úsalo para |
|---|---|---|---|---|---|
| **Local (Compose)** | Segundos–minutos | Bajo | Total (tu máquina) | Lógica, contratos, migraciones, seeds | Desarrollo diario, debugging de una falla puntual |
| **CI efímero (servicios por job)** | Minutos | Medio | Por ejecución | Regresión funcional, integración entre módulos propios | Gate de PR y de rama principal |
| **Entorno integrado (staging/sandbox)** | Horas (colas, dependencias) | Alto | Compartido, salvo diseño explícito | Integraciones con terceros, journeys cross-sistema | Pocos escenarios de alto riesgo, con datos y ventanas acordadas |

La regla senior no es "todo a integración porque es más real", sino la inversa: **empujá cada verificación al entorno más barato que pueda refutarla**. Un test de idempotencia no necesita el sandbox del proveedor de pagos; necesita una base aislada y un contrato verificado. Reservá el entorno integrado —el más caro, lento y frágil— para lo que solo él puede demostrar.

Señal de alarma: si tu plan dice "Kubernetes" antes de tener un `docker compose up` reproducible y un seed determinista, estás comprando complejidad operativa sin haber resuelto el problema de calidad. Kubernetes agrega primitivas útiles (namespaces para aislamiento lógico, `Secret`/`ConfigMap` para separar responsabilidades — ver §6), pero no arregla una receta que no existe.

## 5. El contrato de entorno como producto interno

Si el entorno es un producto interno, tiene que tener contrato. Propuesta mínima, versionada junto al código:

- **Inputs:** variables requeridas (con `.env.example` sin valores reales), secretos esperados (por nombre, nunca por valor), puertos.
- **Outputs:** endpoints expuestos, health checks (`/actuator/health` o equivalente), ubicación de logs estructurados.
- **Dependencias:** servicios y versiones compatibles (imagen por tag inmutable o digest), migraciones que deben estar aplicadas.
- **Datos iniciales:** qué instala el seed base y qué debe crear cada suite con su `run_id`.
- **Ownership y runbook:** quién mantiene la receta, cómo reportar una rotura, cómo regenerar el entorno desde cero.
- **SLO interno (si se mide):** tiempo esperado de provisión y de seed. Sin medición real, se declara como objetivo a validar, no como hecho.

El contrato convierte la pregunta "¿a quién le pido acceso?" en "¿qué versión del contrato estoy usando?". Ese cambio de pregunta es la diferencia entre un ambiente heredado y un producto.

## 6. Configuración y secretos sin falsas promesas

El segundo diagrama muestra la separación de responsabilidades que el contrato debe respetar:

<figure class="diagram">
  <img src="/blog/diagrams/entornos-y-datos-de-prueba-reproducibles-2.svg" width="678" height="352" alt="Diagrama: entornos-y-datos-de-prueba-reproducibles (2)" loading="lazy" decoding="async" />
</figure>

Del repositorio salen **dos** cosas: la receta de infraestructura (Compose/manifests) y la receta de datos (seeds/factories). Los secretos entran por un canal separado y ojalá efímero. El entorno es el punto de encuentro; las pruebas y reportes son su salida. Si una flecha va del repositorio directo a "credenciales", el diseño está roto.

Ejemplo ilustrativo de configuración local declarativa (verificá la sintaxis contra la [documentación de Compose](https://docs.docker.com/reference/compose-file/secrets/) vigente antes de usarla; consultada 2026-07-09):

```yaml
# docker-compose.test.yml — ILUSTRATIVO. No incluye ./secrets/ en Git.
services:
  transfer-api:
    image: ghcr.io/example/nexo-transfer-api:${IMAGE_TAG:-local}
    environment:
      SPRING_PROFILES_ACTIVE: test
      DATABASE_URL: jdbc:postgresql://postgres:5432/nexo_test
      DATABASE_USER: nexo_test
    secrets:
      - db_password
    depends_on:
      postgres:
        condition: service_healthy

  postgres:
    image: postgres:16.6        # fijada por versión; mejor aún: por digest
    environment:
      POSTGRES_DB: nexo_test
      POSTGRES_USER: nexo_test
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U nexo_test -d nexo_test"]

secrets:
  db_password:
    file: ./secrets/db_password.dev
```

Decisiones que este archivo encarna, y sus límites:

- **`IMAGE_TAG` con default `local`:** en desarrollo usás tu build; en CI el pipeline inyecta el tag del commit. La precedencia de variables en Compose está documentada ([Docker: environment variables](https://docs.docker.com/compose/how-tos/environment-variables/), consultado 2026-07-09) — conocerla evita el clásico "en CI toma otro valor y nadie sabe por qué".
- **`secrets:` en vez de `environment:` para el password:** evita que la credencial aparezca en `docker inspect` o en logs de arranque. **No afirmes que esto es "seguro" por sí solo:** el archivo `./secrets/db_password.dev` sigue siendo texto plano local; debe estar en `.gitignore`, con permisos restrictivos, y en CI debe reemplazarse por el mecanismo de secretos del proveedor.
- **`healthcheck` + `condition: service_healthy`:** el seed no debe correr contra una base que todavía no acepta conexiones; los tests no deben "dormir 10 segundos y rezar".
- **Qué se versiona:** este YAML y un `.env.example` con claves sin valores (`IMAGE_TAG=`, `DB_PASSWORD_FILE=`). Qué no: `.env` con valores, `./secrets/`, cualquier dump.

Sobre Kubernetes, dos aclaraciones honestas para cuando llegue el momento (§16): un [`ConfigMap`](https://kubernetes.io/docs/concepts/configuration/configmap/) es para datos **no confidenciales**; y un objeto [`Secret`](https://kubernetes.io/docs/concepts/configuration/secret/) almacena el dato codificado en **base64, que es codificación, no cifrado** — la protección real depende de cifrado en reposo, RBAC y montaje explícito, todo configuración de la plataforma, no defaults mágicos (ambas páginas consultadas 2026-07-09). La [guía de OWASP sobre gestión de secretos](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html) (consultada 2026-07-09; es una guía, no una norma) resume el resto: mínimo privilegio, rotación, detección de exposición accidental.

## 7. Datos sintéticos, representativos y minimizados

"Sintético" no significa "aleatorio". Un buen conjunto de datos de prueba se diseña desde el riesgo:

- **Particiones de equivalencia y límites:** saldo suficiente, saldo exacto, saldo insuficiente por un centavo, monto en el límite regulatorio diario.
- **Estados de negocio:** cuenta activa, bloqueada, recién creada sin validar, con moneda distinta a la de la transferencia.
- **Relaciones:** una transferencia toca dos cuentas, un titular y (si hay eventos) un consumidor downstream; el dato de prueba tiene que instalar el grafo completo, no una fila suelta.
- **Datos negativos:** destinatario inexistente, autorización de otra cuenta (el clásico BOLA que la colección de seguridad desarrolla), idempotency key reutilizada con otro monto.

**Minimización:** el dato de prueba lleva lo que la prueba necesita y nada más. Nada de nombres reales, DNI plausibles ni emails de personas: `alice-demo`, `run-42-bob`, `ars`, importes redondos rotulados como ficticios. Esto no es solo higiene legal; también hace los fallos legibles — cuando `run-42-alice` aparece en un log, ya sabés qué ejecución la creó.

Factory determinista (pseudocódigo Java, ilustrativo):

```java
// Mismo seed => mismos datos. El run_id garantiza no-colisión entre ejecuciones.
TestAccount origen = accountFactory
    .withRunId(runId)                       // p.ej. "run-20260709-a1b2"
    .withDeterministicSeed(seed)            // reproducibilidad del caso
    .withAvailableBalance(Money.ars("250.00"))
    .build();

TestAccount bloqueada = accountFactory
    .withRunId(runId)
    .withDeterministicSeed(seed)
    .withState(AccountState.BLOCKED)        // riesgo: transferencia a cuenta bloqueada
    .build();
```

Cada variación existe porque hay un riesgo o criterio de aceptación detrás (saldo insuficiente, destinatario bloqueado, monto límite, autorización cruzada) — no porque a la automatización le resulte cómodo. Si no podés nombrar el riesgo, el dato sobra.

## 8. Lifecycle de datos: generar, usar, limpiar, auditar

El dato de prueba tiene ciclo de vida: **generar → versionar la receta → usar → observar → limpiar → auditar**. El seed es el corazón, y tiene que ser transaccional, idempotente y trazable:

```sql
-- Seed ILUSTRATIVO (PostgreSQL). La estrategia de limpieza depende del motor
-- y del modelo de concurrencia; no extrapolar a otros motores sin verificar.
BEGIN;

INSERT INTO test_run (run_id, created_at, source_commit)
VALUES (:run_id, CURRENT_TIMESTAMP, :commit_sha)
ON CONFLICT (run_id) DO NOTHING;

INSERT INTO account (id, owner_alias, currency, available_balance, test_run_id)
VALUES
  (:run_id || '-alice', 'alice-demo', 'ARS', 150000, :run_id),
  (:run_id || '-bob',   'bob-demo',   'ARS',  25000, :run_id)
ON CONFLICT (id) DO NOTHING;

COMMIT;
```

Por qué cada decisión:

- **El importe es ficticio y redondo** — nadie puede confundirlo con un saldo real, y el test que lo use declara el mismo número.
- **Todo dato lleva `test_run_id`** — la limpieza (`DELETE ... WHERE test_run_id = :run_id`) y el troubleshooting quedan acotados a la ejecución. Es la alternativa quirúrgica al `TRUNCATE` global.
- **`ON CONFLICT DO NOTHING` da idempotencia de inserción**, útil si el seed se re-ejecuta tras una falla parcial. Pero no es una política de consistencia ni de limpieza: si la primera corrida dejó datos a medias con otros valores, el conflicto los preserva. La idempotencia del seed complementa —no reemplaza— la limpieza por `run_id` y la creación del entorno desde cero.
- **La transacción (`BEGIN`/`COMMIT`) garantiza todo-o-nada** dentro del seed. El comportamiento exacto bajo concurrencia depende del nivel de aislamiento del motor ([PostgreSQL: transaction isolation](https://www.postgresql.org/docs/current/transaction-iso.html), consultado 2026-07-09).

La **receta** del seed (script + parámetros + checksum) se versiona; los datos generados no. Auditar significa poder responder, meses después: ¿qué seed, con qué parámetros, produjo el estado de la ejecución `run-20260709-a1b2`? La respuesta sale de la evidencia (§12), no de la memoria de nadie.

## 9. Aislamiento y concurrencia

Opciones ordenadas de menor a mayor aislamiento, con su costo:

| Estrategia | Cómo funciona | Riesgo principal | Cuándo alcanza |
|---|---|---|---|
| **Reset global** (`TRUNCATE` + reseed) | Una base, se limpia entre corridas | Prohíbe paralelismo; bloqueos; borra lo que otro job estaba usando | Un solo job secuencial, proyectos chicos |
| **Prefijos / tenant lógico por `run_id`** | Una base, datos namespaced por ejecución | Fugas por queries sin filtro; contención en tablas calientes | Suites que comparten esquema y corren en paralelo moderado |
| **Esquema por job** | `CREATE SCHEMA run_x` + migraciones | Migraciones lentas si son pesadas; límite de conexiones | Paralelismo alto sobre una misma instancia |
| **Base/contenedor por ejecución** | Cada job levanta su PostgreSQL | Costo de arranque; imágenes y storage | CI efímero; es el default sano con Compose |
| **Namespace de Kubernetes por ejecución** | Aislamiento lógico de recursos y nombres ([Kubernetes: namespaces](https://kubernetes.io/docs/concepts/overview/working-with-objects/namespaces/), consultado 2026-07-09) | Complejidad operativa; cuotas y limpieza de namespaces huérfanos | Cuando ya operás Kubernetes y el volumen de jobs lo justifica |

Sobre `TRUNCATE`: además de exigir permisos amplios, en PostgreSQL toma bloqueos exclusivos sobre las tablas afectadas y arrasa con datos de **todas** las ejecuciones, no solo la tuya. En un pipeline con dos jobs paralelos, un `TRUNCATE` en el job A es la explicación del fallo "imposible" del job B. La contaminación cruzada casi siempre entra por ahí o por datos "heredados" que ningún seed declaró.

Regla práctica: **el aislamiento se elige por ejecución, no por equipo.** "La base de QA del squad X" reproduce el problema del §1 a escala organizacional.

## 10. Dependencias externas: cuándo simular y cuándo integrar

Vocabulario primero, porque las palabras esconden decisiones distintas: un **mock** verifica interacciones; un **stub** devuelve respuestas fijas; un **fake** implementa el comportamiento de forma simplificada (una base en memoria); un **sandbox** es un entorno real del tercero con datos de juguete; el **servicio real** es producción del tercero — y no es un laboratorio.

La decisión no es estética, es de **riesgo de contrato**:

- Si el riesgo es *mi lógica ante las respuestas conocidas del proveedor* → stub/fake, barato y determinista.
- Si el riesgo es *que el contrato con el proveedor cambie sin que yo me entere* → contract testing (la colección 02 profundiza) más una verificación periódica contra sandbox.
- Si el riesgo es *el journey completo con el tercero real* → sandbox del proveedor, con datos sintéticos, credenciales propias del sandbox y ventanas acordadas.

El anti-patrón simétrico también existe: simular todo y declarar "integración validada". Un fake nunca valida la integración; valida tu modelo del proveedor. La honestidad editorial del reporte de pruebas exige decir cuál de las dos cosas se probó.

## 11. Nexo Finanzas de punta a punta

Cómo se materializa todo esto en el portfolio ficticio (propuesta de diseño; ningún repositorio afirma tener esto ya funcionando):

- **`nexo-transfer-api`:** el contrato OpenAPI, las migraciones, el `docker-compose.test.yml` del §6, el seed del §8 y una prueba de idempotencia que reutiliza la misma `Idempotency-Key` y espera un único débito. Es el ancla del incremento 1 del plan de práctica.
- **`nexo-web-banking-e2e` y `nexo-wallet-mobile`:** consumen cuentas aisladas por `run_id`; dos jobs paralelos jamás comparten el mismo usuario mutable. La factory del §7 es la interfaz; el seed es un detalle interno.
- **`nexo-cross-channel-regression`:** usa un conjunto chico, estable y explícitamente versionado de journeys; no hereda datos de otras suites ni asume estado previo.
- **`nexo-performance-lab`:** receta de datos independiente — mezclar datos de performance con los funcionales contamina métricas y, peor, puede disparar carga accidental contra una dependencia no autorizada.
- **`nexo-quality-platform`:** conserva la relación ejecución ↔ commit ↔ entorno ↔ seed ↔ evidencia, sin almacenar secretos.

Y el job de CI que ata todo (pseudocódigo genérico; la sintaxis exacta depende del proveedor y debe verificarse en su documentación oficial):

```yaml
# Pipeline ILUSTRATIVO — adaptar al proveedor de CI (GitLab CI, GitHub Actions, Jenkins…)
test-transfer-api:
  variables:
    RUN_ID: "run-${CI_COMMIT_SHORT_SHA}-${CI_JOB_ID}"   # único por ejecución
  script:
    - docker compose -f docker-compose.test.yml up -d --wait
    - ./scripts/migrate.sh                                # migraciones versionadas
    - ./scripts/seed.sh --run-id "$RUN_ID" --commit "$CI_COMMIT_SHA"
    - ./gradlew test -Prun_id="$RUN_ID"
  after_script:
    - ./scripts/collect-evidence.sh --run-id "$RUN_ID"    # reportes + logs saneados
    - docker compose -f docker-compose.test.yml down -v   # limpieza verificable
  artifacts:
    when: always            # la evidencia importa MÁS cuando falla
    expire_in: 14 days      # retención acotada, no "para siempre"
    paths: [build/reports/, evidence/]
```

Detalles que no son decorativos: el secreto de la base **no aparece** en el YAML (lo inyecta el mecanismo de secretos del proveedor de CI); `when: always` captura evidencia justamente en el fallo; `expire_in` implementa la política de retención; y `down -v` deja el runner como lo encontró.

## 12. Evidencia y troubleshooting sin privilegios

Prueba ácida: una persona que entró ayer al equipo, sin acceso a ninguna base ni secreto, ¿puede reconstruir por qué falló `run-20260709-a1b2`? Debería alcanzarle con los artefactos del pipeline:

| Evidencia | Cómo obtenerla | Decisión que habilita | Límite |
|---|---|---|---|
| Commit, versión de imagen y migración | Metadatos del pipeline y manifiesto | Reproducir la ejecución localmente | No prueba por sí sola calidad funcional |
| `run_id` y checksum/versión del seed | Log estructurado no sensible o artefacto | Distinguir defecto de contaminación de datos | No debe revelar PII ni secretos |
| Tiempos de provisión, seed y limpieza | Métricas del job en varias corridas | Detectar degradación; evaluar costo del aislamiento | No es un benchmark universal |
| Tasa de fallas por estado/contaminación | Clasificación de fallas con causa comprobada | Priorizar inversión en aislamiento o en datos | Requiere taxonomía y revisión humana |
| Escaneo de secretos/PII en artefactos | Herramienta + revisión documentada | Reducir exposición accidental | No certifica cumplimiento legal |

La cuarta fila necesita una **taxonomía de fallas** explícita: producto, automatización, infraestructura, configuración, datos, dependencia externa. Reglas para que no se convierta en maquillaje: la clasificación la propone quien investiga y la revisa otra persona; "causa desconocida" es una categoría legítima; y el indicador se usa para priorizar inversión, nunca para evaluar personas (la colección 12 desarrolla por qué esto último destruye la señal).

## 13. Gobernanza y colaboración

Lo que sostiene todo lo anterior en el tiempo no es la técnica, son los acuerdos:

- **Ownership declarado** en el contrato de entorno (§5): un equipo responde por la receta; cualquiera puede proponer cambios por PR.
- **`CONTRIBUTING.md`** que explique cómo agregar un dato de prueba: qué riesgo cubre, qué factory usar, cómo se limpia.
- **Revisión obligatoria de cambios de schema y fixtures:** una migración o un fixture nuevo puede romper todas las suites; se revisa como código de producción.
- **Checklist de PR** (dos preguntas bastan): ¿este cambio introduce datos no sintéticos o secretos? ¿este test depende de estado que no crea?
- **Definition of Done para datos/entornos:** un test está terminado cuando declara sus precondiciones, las crea con `run_id`, y su limpieza es verificable.

Propuesta de ADR para dejar la decisión registrada — **ADR-003 — Estrategia de datos sintéticos y aislamiento por ejecución**: *Contexto:* suites paralelas fallan por estado compartido; datos actuales heredados y sin owner. *Decisión:* todo dato de prueba se genera por factory/seed determinista, se namespacea por `run_id` y se limpia por `run_id`; datos reales prohibidos. *Alternativas consideradas:* base compartida con reset nocturno (rechazada: prohíbe paralelismo y esconde acoplamientos); clon saneado de producción (rechazada: costo de anonimización verificable mayor que el valor para pruebas funcionales). *Consecuencias:* setup más lento por job; los tests deben declarar precondiciones. *Riesgos aceptados:* menor fidelidad de distribución de datos; se compensa con experimentos específicos donde el riesgo lo pida. *Condición de revisión:* si el tiempo de seed supera el presupuesto del pipeline o aparece un requisito de fidelidad regulatorio, se revisa.

## 14. Anti-patrones: causa, consecuencia, alternativa

1. **Base única mutable para todo.** Causa: comodidad inicial. Consecuencia: el §1. Alternativa: aislamiento por ejecución (§9).
2. **`TRUNCATE` global sin entender concurrencia.** Causa: "limpiar rápido". Consecuencia: bloqueos y fallos cruzados. Alternativa: limpieza por `run_id` o base efímera.
3. **Versionar `.env`, tokens o dumps con PII.** Causa: "es solo test". Consecuencia: exposición real; los secretos de prueba también abren puertas. Alternativa: `.env.example`, gestor de secretos, escaneo en CI.
4. **Clon de producción como estrategia de realismo.** Causa: fe en la fidelidad. Consecuencia: PII en riesgo, datos que nadie entiende, tests acoplados a casualidades. Alternativa: datos sintéticos diseñados por riesgo (§7); fidelidad de *distribución* solo donde el riesgo la exige.
5. **Retries hasta que pase.** Causa: presión por el verde. Consecuencia: la señal muere. Alternativa: taxonomía de fallas y causa registrada (§12).
6. **Simular todo y declarar integración validada.** Causa: velocidad. Consecuencia: confianza falsa en contratos. Alternativa: decir qué se probó; contract testing + sandbox para el riesgo real (§10).
7. **Saltar a Kubernetes sin receta reproducible.** Causa: currículum-driven engineering. Consecuencia: misma fragilidad, más capas. Alternativa: Compose + contrato primero; Kubernetes cuando el volumen lo justifique (§16).
8. **Comandos que solo funcionan en una máquina.** Causa: documentación como memoria personal. Consecuencia: bus factor 1. Alternativa: el contrato de entorno es ejecutable (`make test-env-up`) y se verifica en CI.
9. **Configuración de prueba mezclada con lógica de negocio.** Causa: "facilitar el seed". Consecuencia: el código de producción conoce sus tests; comportamiento distinto en test y producción. Alternativa: seams explícitos (perfiles, inyección de dependencias), datos por API o SQL externo.
10. **Artefactos retenidos para siempre.** Causa: "por las dudas". Consecuencia: costo creciente y superficie de fuga. Alternativa: retención acotada (`expire_in`) y redacción de datos en evidencia.

## 15. Qué haría diferente en otro contexto

Nada de lo anterior es una receta universal; el contexto manda:

- **Monolito con una sola base y equipo chico:** el reset global secuencial es defendible; el costo del aislamiento por ejecución no se paga hasta que aparezca paralelismo real.
- **Datos con requisitos de fidelidad estadística** (scoring, detección de fraude): los sintéticos "de diseño" no alcanzan; haría un pipeline de generación con distribución realista o anonimización verificada por gente de datos/seguridad — y lo trataría como proyecto propio, no como fixture.
- **Dependencia dominante de un tercero** (core bancario externo): invertiría primero en contract testing y en un fake de alta fidelidad mantenido como producto, antes que en entornos integrados frágiles.
- **Regulación estricta sobre entornos** (auditorías que exigen segregación formal): el contrato de entorno crece hasta incluir controles de acceso documentados; parte del "costo innecesario" de otros contextos acá es obligatorio.
- **Equipo sin contenedores en el stack:** el modelo mental (§2, §3) sobrevive intacto con VMs o SQLite + procesos locales; la receta mínima no depende de Docker, depende de la disciplina de declararla.

## 16. Costos, límites y evolución

Señales de que la solución simple dejó de alcanzar, y el siguiente incremento razonable:

| Señal medida | Diagnóstico | Siguiente incremento |
|---|---|---|
| El seed tarda más que la suite | Receta de datos sobredimensionada | Seeds por suite, no globales; datos mínimos por riesgo |
| Cola de jobs esperando la base compartida | Aislamiento insuficiente | Base/contenedor por ejecución |
| Migraciones lentas dominan el arranque | Esquema pesado recreado por job | Imagen de base pre-migrada por versión de esquema |
| Fallas por dependencias externas caídas | Frontera real/simulado mal puesta | Stubs con contract testing; sandbox solo en el gate nocturno |
| Decenas de jobs paralelos, limpieza manual de recursos | Compose quedó chico | Namespaces efímeros en Kubernetes, con cuotas y TTL |

El límite honesto de todo el enfoque: la reproducibilidad perfecta no existe — relojes, redes y versiones de SO introducen variación residual. El objetivo no es eliminarla sino **acotarla y declararla**, para que una diferencia de resultado sea información y no ruido.

## 17. Cierre: plan de práctica en tres incrementos

1. **Local reproducible (una tarde).** Cloná `nexo-transfer-api` (o tu proyecto), escribí el `docker-compose.test.yml` con imagen fijada y healthcheck, el `.env.example`, y un seed con `run_id`. Criterio de éxito: otra persona levanta el entorno y corre la suite con dos comandos documentados.
2. **CI aislado (una semana).** Llevá la misma receta al pipeline: `run_id` único por job, secretos por el mecanismo del proveedor, evidencia con `when: always` y retención acotada, limpieza verificable. Criterio de éxito: dos ejecuciones paralelas del mismo pipeline no se ven entre sí.
3. **Evolución justificada (cuando una señal del §16 lo pida).** Recién acá: esquema por job, imagen pre-migrada o namespaces de Kubernetes — con el ADR-003 actualizado explicando qué señal disparó el cambio. Criterio de éxito: podés mostrar la medición que justificó el costo.

Si solo te llevás una idea: **la próxima vez que un test falle, preguntate si podés reconstruir sus precondiciones desde la evidencia.** Si la respuesta es no, el defecto más urgente no está en el producto.

## 18. Fuentes

Documentación oficial (fecha de consulta: **2026-07-09**; verificá versión vigente antes de reutilizar):

- Docker — [Set environment variables in Compose](https://docs.docker.com/compose/how-tos/environment-variables/): precedencia y uso de variables.
- Docker — [Compose file: secrets](https://docs.docker.com/reference/compose-file/secrets/): comportamiento y límites de secrets en Compose.
- Kubernetes — [ConfigMaps](https://kubernetes.io/docs/concepts/configuration/configmap/): datos no confidenciales.
- Kubernetes — [Secrets](https://kubernetes.io/docs/concepts/configuration/secret/): base64 ≠ cifrado; protección depende de configuración.
- Kubernetes — [Namespaces](https://kubernetes.io/docs/concepts/overview/working-with-objects/namespaces/): aislamiento lógico.
- PostgreSQL — [Transaction Isolation](https://www.postgresql.org/docs/current/transaction-iso.html): concurrencia y niveles de aislamiento.

Guías (secundarias respecto de la documentación de producto):

- OWASP — [Secrets Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html): prácticas de gestión y exposición de secretos.

---

**Declaración editorial.** Nexo Finanzas es un caso ficticio; todo dato, importe y nombre es sintético. Los fragmentos de código son ilustrativos y se rotulan como tales: verificá sintaxis y versiones contra la documentación oficial vigente antes de usarlos. Este artículo no constituye asesoramiento legal ni afirmación de cumplimiento de PCI DSS, GDPR, Ley 25.326 u otra normativa.

