---
title: "De 'JMeter mejora el performance' a una hipótesis medible: cómo diseñar un experimento reproducible"
description: "Guía práctica para SDET: convertir una frase vaga sobre performance en una hipótesis falsable, diseñar un experimento reproducible con JMeter o k6, publicar un README de evidencia honesto y reportar resultados que contradicen tu hipótesis."
pubDate: 2026-07-09
tags: ["performance", "jmeter", "k6", "experimento", "sli-slo", "evidencia", "sdet", "reproducibilidad"]
cluster: "15"
clusterTitle: "Investigación técnica y escritura basada en evidencia"
type: "satelite"
order: 2
repo: "nexo-performance-lab"
icon: "book"
iconHue: 220
readingLevel: "Intermedio–Avanzado"
prerequisites: "QA/SDET con CLI, CI/CD y nociones de estadística básica"
---
> Este es un satélite del artículo pilar **[Escribir sobre calidad con evidencia](/blog/escribir-sobre-calidad-con-evidencia-metodo-editorial/)**. Cubre los claims de tipo **"resultado experimental"**: cómo producirlos para que otra persona los pueda repetir. Etiquetas usadas: <span class="em em--hecho">HECHO</span>, <span class="em em--inferencia">INFERENCIA</span>, <span class="em em--decision">DECISIÓN</span>, <span class="em em--opinion">OPINIÓN</span>.

## El problema: una frase que no se puede probar ni refutar

*"JMeter mejora el performance."* La frase circula en blogs y CVs, y no significa nada verificable. <span class="em em--inferencia">INFERENCIA</span> Tiene tres defectos:

1. **Confunde herramienta con efecto.** JMeter es un generador de carga; no "mejora" el rendimiento, lo **mide**. Lo que mejora (o no) el rendimiento es un cambio en tu sistema.
2. **No dice qué performance.** ¿Latencia p95? ¿Throughput? ¿Errores bajo carga? ¿De qué endpoint, con qué perfil de tráfico?
3. **No es falsable.** No hay condición bajo la cual sea "falsa", así que no es una hipótesis: es una consigna.

En este artículo tomamos el endpoint de pagos de la fintech ficticia **Nexo Finanzas** y convertimos esa consigna en una hipótesis medible, un experimento reproducible y un reporte honesto —incluido el caso incómodo en que **los datos contradicen tu hipótesis**.

**Recordatorio de veracidad:** todos los números que aparecen abajo son **plantillas con marcadores** (`<p95_ms>`), no mediciones reales. No voy a inventar resultados; voy a mostrarte la **forma** del resultado y de la evidencia.

---

## Prerrequisitos y glosario

Necesitás: línea de comandos, Git, y un endpoint de prueba propio (nunca corras carga contra un sistema que no controlás o no tenés autorización de probar).

- **Carga (load testing):** enviar tráfico sintético para observar cómo responde el sistema.
- **SLI (Service Level Indicator):** <span class="em em--hecho">HECHO</span> *"una medida cuantitativa cuidadosamente definida de algún aspecto del nivel de servicio"* — [Google SRE, Service Level Objectives](https://sre.google/sre-book/service-level-objectives/).
- **SLO (Service Level Objective):** <span class="em em--hecho">HECHO</span> *"un valor objetivo o rango de valores para un nivel de servicio medido por un SLI"* — misma fuente.
- **Percentil (p95, p99):** el valor por debajo del cual cae el 95 % (o 99 %) de las observaciones. <span class="em em--hecho">HECHO</span> El capítulo de SRE recomienda razonar con percentiles y no con promedios, porque el promedio esconde la cola. Fuente: [Google SRE — SLOs](https://sre.google/sre-book/service-level-objectives/).
- **Warm-up:** período inicial que se descarta para no medir el arranque en frío (JIT, cachés, pools).

---

## Concepto: de consigna a hipótesis falsable

Una hipótesis útil tiene **sujeto, cambio, métrica, dirección, umbral y condición**. Comparemos:

| Elemento | "JMeter mejora el performance" | Hipótesis reescrita |
|---|---|---|
| Sujeto | (ausente) | El endpoint `POST /payments` de Nexo Finanzas |
| Cambio | (ausente) | Activar caché de idempotencia en Redis |
| Métrica (SLI) | "performance" | Latencia **p95** de respuesta |
| Dirección | "mejora" | **No aumenta** |
| Umbral | (ausente) | en más de **10 %** |
| Condición | (ausente) | bajo **50 usuarios virtuales constantes, 5 min**, en el entorno local descrito |

> **Hipótesis (H1):** *Activar la caché de idempotencia en Redis no incrementa la latencia p95 de `POST /payments` en más de un 10 %, con 50 VUs constantes durante 5 minutos, en el entorno descrito.*
>
> **Hipótesis nula (H0):** *el cambio incrementa la p95 en más de 10 %* (o la reduce; toda dirección que no sea "sin degradación relevante").

<span class="em em--inferencia">INFERENCIA</span> Fijate qué ganamos: ahora el experimento puede **fallar**. Si la p95 sube 25 %, H1 queda refutada y —esto es clave— **eso también es un resultado publicable y valioso**.

### Definí el SLI/SLO antes de medir

Antes de generar carga, escribí el SLI y un SLO de referencia. Ejemplo para Nexo Finanzas (ficticio):

- **SLI:** proporción de respuestas de `POST /payments` con latencia < 800 ms, medida en el servidor.
- **SLO objetivo (interno, ficticio):** 99 % de las respuestas < 800 ms en ventana de 5 min.

Esto ancla la pregunta "¿mejoró?" a un objetivo, en vez de a una sensación. La distinción SLI/SLO/SLA y la recomendación de medir con percentiles vienen de la fuente primaria: [Google SRE — Service Level Objectives](https://sre.google/sre-book/service-level-objectives/).

---

## Concepto: el diseño experimental mínimo honesto

<figure class="diagram">
  <img src="/blog/diagrams/hipotesis-medible-experimento-reproducible-1.svg" width="2060" height="257" alt="Diagrama: hipotesis-medible-experimento-reproducible (1)" loading="lazy" decoding="async" />
</figure>

Puntos no negociables del diseño:

- **[DECISIÓN] Comparar baseline vs. cambio**, no medir solo el estado final. Sin línea base no hay "mejora" ni "degradación": hay un número suelto.
- **Repetir.** **[HECHO/OPINIÓN]** Concluir a partir de una sola corrida es un anti-patrón clásico: una ejecución puede estar contaminada por ruido (GC, vecinos ruidosos, throttling térmico). Corré al menos 3–5 veces y reportá la dispersión.
- **Descartar el warm-up.** Los primeros segundos miden arranque en frío, no estado estacionario.
- **Fijar y registrar el entorno.** Versión de la app, versión de la herramienta, CPU, RAM, SO, red. Sin esto el resultado no es reproducible.

---

## Implementación: dos formas de generar la carga

Vas a necesitar un generador de carga. Muestro dos, con su trade-off, y **ninguno es "el mejor"**: depende de tu contexto (ver el criterio de decisión en el [satélite de ADR](/blog/adr-seleccion-herramienta-katalon-selenium/)).

### Opción A — Apache JMeter (no-GUI)

<span class="em em--hecho">HECHO</span> JMeter es una herramienta de carga de la Apache Software Foundation. Al 2026-07-09, la línea estable es **5.6.x** (última publicada 5.6.3) y requiere **Java 8 o superior** (Java 17 recomendado; el próximo major mayor exigirá Java 17+). Fuentes primarias: [Apache JMeter — Download](https://jmeter.apache.org/download_jmeter.cgi), [Getting Started / requisitos](https://jmeter.apache.org/usermanual/get-started.html) y [Changes](https://jmeter.apache.org/changes.html). **Verificá la versión y el requisito de Java el día que publiques.**

<span class="em em--decision">DECISIÓN</span> Para evidencia reproducible, corré JMeter **en modo no-GUI** (la propia documentación recomienda no usar la GUI para cargar). El plan de prueba vive en un `.jmx` versionado:

```bash
# Prerrequisitos: JMeter 5.6.3, Java 17. Plan versionado en el repo.
# -n  : modo no-GUI (obligatorio para pruebas de carga reales)
# -t  : plan de prueba (.jmx) versionado
# -l  : archivo de resultados crudos (JTL/CSV)
# -e -o: genera el reporte HTML en ./report al terminar
jmeter -n \
  -t tests/perf/payments_50vu_5min.jmx \
  -l results/payments_baseline.jtl \
  -e -o report/payments_baseline
```

Explicación por bloque:

- `-n -t ... -l ...` separa el plan (entrada versionable) de los resultados (salida). El `.jtl` es tu dato crudo; guardalo o resumilo (ver [satélite de seguridad](/blog/publicar-evidencia-sin-filtrar-secretos/) sobre qué versionar).
- `-e -o` produce el dashboard HTML con percentiles. <span class="em em--inferencia">INFERENCIA</span> Ese HTML es pesado y puede contener URLs; publicá un **resumen**, no el dashboard completo, en un repo público.

*Trade-off de JMeter:* <span class="em em--opinion">OPINIÓN</span> maduro, con GUI para diseñar y gran ecosistema de plugins; el `.jmx` es XML difícil de revisar en un diff y la curva de scripting es más alta.

### Opción B — k6 (script como código)

<span class="em em--hecho">HECHO</span> k6 (mantenido por Grafana Labs) define las pruebas como scripts JavaScript, lo que las hace fáciles de versionar y revisar en un PR. Documentación primaria: [k6 docs](https://grafana.com/docs/k6/latest/). Verificá la versión vigente al publicar.

```javascript
// tests/perf/payments.js  — hipotesis: p95 < umbral con 50 VUs / 5 min
import http from 'k6/http';
import { check } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 50 }, // rampa
    { duration: '5m',  target: 50 }, // meseta (estado estacionario)
    { duration: '30s', target: 0 },  // bajada
  ],
  // El SLO se codifica como umbral: el test FALLA si p95 >= 800ms.
  thresholds: {
    http_req_duration: ['p(95)<800'],
    checks: ['rate>0.99'],
  },
};

export default function () {
  // Cuerpo SINTETICO: sin datos reales de tarjeta ni PII.
  const payload = JSON.stringify({
    amount: 1000, currency: 'ARS', idempotencyKey: `test-${__VU}-${__ITER}`,
  });
  const params = { headers: { 'Content-Type': 'application/json' } };
  const res = http.post(`${__ENV.BASE_URL}/payments`, payload, params);
  check(res, { 'status 200/201': (r) => r.status === 200 || r.status === 201 });
}
```

Explicación por bloque:

- `stages` implementa rampa → meseta → bajada; el análisis se hace sobre la **meseta**, no la rampa.
- `thresholds` **codifica el SLO como criterio de éxito**: si la p95 ≥ 800 ms, k6 sale con código distinto de cero y el pipeline falla. Esto convierte tu hipótesis en un guardián de CI.
- El payload usa `idempotencyKey` sintética y **cero PII**: no hay números de tarjeta reales (ver reglas del [satélite de seguridad](/blog/publicar-evidencia-sin-filtrar-secretos/)).

```bash
# BASE_URL apunta a un entorno LOCAL o de prueba que controlás.
BASE_URL=http://localhost:8080 k6 run tests/perf/payments.js
```

---

## Implementación: el README de evidencia mínima

Este es el corazón de la reproducibilidad. Todo experimento publicado lleva un `evidence/README.md` con estos campos. **Los valores entre `<...>` son marcadores: no invento resultados.**

```markdown
# Evidencia — Latencia p95 de POST /payments con caché de idempotencia

- **Pregunta**: ¿Activar la caché de idempotencia degrada la p95 de POST /payments?
- **Hipótesis (H1)**: la p95 no aumenta más de 10% (50 VUs, 5 min).
- **Commit probado**: `<sha-corto>`  (rama `exp/idempotency-perf`)
- **Herramienta**: k6 `<version>`  /  o JMeter 5.6.3 + Java 17
- **Entorno**: MacBook `<modelo>`, `<n>` vCPU, `<n>` GB RAM, macOS `<version>`,
  app en Docker local, Redis `<version>` local. Red: loopback.
- **Tipo de integración**: LOCAL (no productiva, no trial de terceros).
- **Perfil de carga**: rampa 30s → meseta 50 VUs 5m → bajada 30s. Warm-up: 30s descartados.
- **Corridas**: N = 5 por condición (baseline y con-cache).

## Comandos
    docker compose up -d            # levanta app + redis (compose versionado)
    BASE_URL=http://localhost:8080 k6 run tests/perf/payments.js

## Resultado (plantilla — completar con la corrida real)
| Condición | p50 (ms) | p95 (ms) | p99 (ms) | error % | corridas |
|-----------|----------|----------|----------|---------|----------|
| baseline  | <p50>    | <p95>    | <p99>    | <e>     | 5        |
| con-cache | <p50>    | <p95>    | <p99>    | <e>     | 5        |
| Δ p95     |          | <Δ%>     |          |         |          |

## Veredicto
- H1 <no refutada | refutada>: la Δ p95 fue <Δ%>, umbral 10%.

## Límites
- Una sola máquina, red loopback: NO representa producción ni latencia de red real.
- 5 corridas: dispersión reportada, pero no es significancia estadística formal.
- Datos sintéticos: no modela distribución real de montos ni concurrencia productiva.
- Fecha de medición: <YYYY-MM-DD>. Versiones válidas solo a esa fecha.
```

Explicación de por qué cada campo importa:

- **Commit + versión + entorno** → sin estos tres, "reproducible" es una palabra vacía.
- **Tipo de integración (LOCAL/trial/prod)** → el lector debe saber si mediste tu laptop o un cluster productivo. **[HECHO/regla editorial]** El pilar exige declararlo explícitamente.
- **Límites** → acota el alcance del claim; es lo que separa un resultado honesto de una generalización indebida.

---

## Verificación: cuando el benchmark contradice tu hipótesis

Este es el caso que distingue a un profesional. Supongamos que la corrida da **Δ p95 = +23 %**: la caché **degradó** la latencia, al revés de lo que esperabas. <span class="em em--opinion">OPINIÓN</span> Hay dos caminos: esconderlo (anti-patrón que destruye credibilidad) o reportarlo bien.

Cómo redactarlo honestamente:

1. **Enunciá el resultado sin adornos.** *"H1 refutada: activar la caché aumentó la p95 en 23 % (>10 %) en este entorno."*
2. **No conviertas la refutación en causa raíz sin evidencia.** Que la p95 subiera no prueba *por qué*. Distinguí: el **hecho medido** (subió 23 %) de la **hipótesis explicativa** (quizás un round-trip extra a Redis, quizás contención de conexiones). La explicación es una nueva hipótesis que exige su propio experimento.
3. **Mostrá el dato que contradice, no una versión recortada.** Si publicás la gráfica, publicá la que muestra la degradación, con su escala real.
4. **Derivá una acción.** *"Próximo experimento: medir con pool de conexiones Redis dimensionado; hipótesis H2 = la degradación se debe a contención del pool."*

<span class="em em--inferencia">INFERENCIA</span> Un post que dice *"probé mi hipótesis, se refutó, acá está el dato y acá el siguiente paso"* comunica más seniority que diez posts que "confirman" todo. La honestidad intelectual **es** la señal de autoridad.

---

## Límites y trade-offs del experimento

- **Local ≠ producción.** <span class="em em--hecho">HECHO</span> Medir en loopback elimina la latencia de red, que suele dominar la p95 real. Un experimento local sirve para comparar *baseline vs. cambio en igualdad de condiciones*, no para prometer números de producción.
- **Pocas corridas ≠ significancia.** 5 corridas dan una idea de dispersión, no un intervalo de confianza formal. Declaralo; no digas "estadísticamente significativo" si no corriste el test estadístico.
- **Carga sintética ≠ tráfico real.** Un perfil constante de 50 VUs no modela picos, colas ni la distribución real de operaciones.

---

## Anti-patrones (causa → consecuencia → alternativa)

- **Copiar un benchmark ajeno como propio.**
  *Causa:* pegar los números de otro blog/vendor. *Consecuencia:* presentás como evidencia algo que no medí­ste, en un entorno que desconocés. *Alternativa:* citá el benchmark ajeno **como fuente secundaria** y con su contexto, o corré el tuyo.

- **Concluir causalidad con una sola ejecución.**
  *Causa:* prisa. *Consecuencia:* confundís ruido con efecto. *Alternativa:* N ≥ 3–5 corridas + reporte de dispersión + warm-up descartado.

- **Omitir entorno, versión y método.**
  *Causa:* creer que "el número habla solo". *Consecuencia:* nadie puede reproducir ni criticar. *Alternativa:* el `evidence/README.md` completo de arriba.

- **Vender la herramienta como el efecto** ("JMeter mejora el performance").
  *Causa:* atajo de marketing. *Consecuencia:* claim no falsable. *Alternativa:* la herramienta **mide**; el efecto lo produce un cambio en el sistema, y se enuncia con umbral y condición.

---

## Conexión accionable con Nexo Finanzas

```text
docs/experiments/
  idempotency-perf/
    README.md          # evidencia mínima (plantilla de arriba)
    hypothesis.md      # H1, H0, SLI/SLO
tests/perf/
  payments.js          # script k6 versionado (o payments_50vu_5min.jmx)
  docker-compose.yml   # entorno reproducible (app + redis)
.github/workflows/
  perf-smoke.yml       # corre k6 con thresholds como gate (no bloqueante al inicio)
```

Acciones:

1. Versioná el script y el `docker-compose` que levanta el entorno; sin el entorno, el script no reproduce nada.
2. Codificá el SLO como `threshold` de k6 para que el experimento sea también un chequeo de regresión en CI.
3. Guardá en `docs/experiments/idempotency-perf/README.md` la evidencia con sus límites; enlazá esa carpeta desde el post y desde la tabla de claims del [pilar](/blog/escribir-sobre-calidad-con-evidencia-metodo-editorial/).

---

## Qué aprendimos / próximos pasos

- Una hipótesis medible tiene sujeto, cambio, métrica, dirección, umbral y condición. Si no puede fallar, no es hipótesis.
- El SLI/SLO ancla "¿mejoró?" a un objetivo; el capítulo de Google SRE es la fuente primaria para hacerlo bien.
- La evidencia reproducible = commit + versión + entorno + método + límites. Sin uno de esos cinco, no es reproducible.
- Un resultado que **refuta** tu hipótesis es tan publicable como uno que la confirma —y comunica más criterio.

**Continuá con:**
- El **[artículo pilar](/blog/escribir-sobre-calidad-con-evidencia-metodo-editorial/)** para clasificar este resultado como claim experimental en la tabla de claims.
- El **[satélite de ADR](/blog/adr-seleccion-herramienta-katalon-selenium/)** para decidir *entre* JMeter y k6 sin declarar un ganador universal.
- El **[satélite de seguridad](/blog/publicar-evidencia-sin-filtrar-secretos/)** para publicar el `.jtl`/dashboard sin filtrar URLs ni datos.

---

## Checklist final

- [ ] La hipótesis tiene umbral y condición, y puede refutarse.
- [ ] Definí SLI y SLO antes de medir (con fuente).
- [ ] Comparo baseline vs. cambio, no un número suelto.
- [ ] N ≥ 3–5 corridas; descarté el warm-up; reporto dispersión.
- [ ] `evidence/README.md` tiene commit, versión, entorno, comandos, resultado y límites.
- [ ] Declaré si la integración es local, trial o productiva.
- [ ] Los datos de carga son sintéticos (sin PII, sin tarjetas reales).
- [ ] Si el resultado refutó la hipótesis, lo reporté igual, sin inferir causa raíz sin evidencia.
- [ ] Fijé fecha de medición y versiones (verificadas ese día).

---

*Nota de veracidad: los valores numéricos de este artículo son plantillas con marcadores, no mediciones reales. Versiones de JMeter, k6, Selenium y demás herramientas fueron verificadas contra fuentes primarias el 2026-07-09; confirmá su vigencia antes de publicar. Nexo Finanzas y sus datos son ficticios.*

