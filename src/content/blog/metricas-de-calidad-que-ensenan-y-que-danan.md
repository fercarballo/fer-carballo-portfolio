---
title: "Métricas de calidad que enseñan y métricas que dañan"
description: "Cómo definir una métrica de flakiness con fórmula, ventana y exclusiones, por qué 'cantidad de casos automatizados' es una métrica dañina, y cómo usar DORA sin gamificar al equipo."
pubDate: 2026-07-09
tags: ["metricas", "flakiness", "dora", "goodhart", "observabilidad", "sdet", "nexo-finanzas"]
cluster: "12"
clusterTitle: "Liderazgo y operating model de calidad"
type: "satelite"
order: 4
icon: "chat"
iconHue: 330
readingLevel: "Intermedio–Avanzado"
repo: "nexo-quality-control-tower"
---
> Artículo satélite de **"Liderar calidad sin convertirse en cuello de botella"**. Aquí desarrollamos §8 del pilar: cómo definir métricas que produzcan aprendizaje en lugar de teatro. **Todos los números de Nexo Finanzas son ilustrativos y ficticios; no son mediciones reales.**

## 1. El problema: la métrica que empeora lo que mide

Un manager pide "un número de calidad para el dashboard". El equipo, sin mala intención, elige el más fácil de calcular: **cantidad de casos automatizados**. Sube mes a mes, se ve bien en el reporte, y seis meses después la suite tarda 40 minutos, tiene tests duplicados, y la confianza en el rojo bajó porque hay flaky por todos lados.

No es un accidente. Es una manifestación de la **ley de Goodhart**: *cuando una medida se convierte en objetivo, deja de ser una buena medida*. Al premiar "más casos", el equipo optimiza "más casos" —no "más riesgo cubierto". *(Opinión fundamentada en un principio ampliamente citado.)*

> **Decisión de diseño.** Una métrica de calidad solo sirve si cumple cuatro requisitos: (1) tiene **fórmula explícita**, (2) tiene **ventana temporal**, (3) declara **exclusiones**, y (4) tiene una **acción esperada** cuando cambia. Sin los cuatro, es decoración —o peor, un incentivo perverso.

---

## 2. Dos familias: métricas de aprendizaje vs. métricas de vanidad

| | Métrica de aprendizaje | Métrica de vanidad |
|---|---|---|
| Qué mide | Salud del sistema o del feedback | Actividad o esfuerzo |
| Ejemplo | Flakiness por suite; change failure rate | Cantidad de casos; nº de commits |
| Efecto al optimizarla | Mejora el sistema | Mejora el número, no el sistema |
| Nivel | Equipo/sistema | Suele derivar en individual |

**Anti-patrón desmontado:** *métricas de productividad individual usadas para medir calidad.* Consecuencia: se optimiza la apariencia personal (más commits, más casos) y se **penaliza reportar problemas** —lo contrario del aprendizaje seguro del pilar. Alternativa: medir salud del sistema a nivel de equipo, nunca de persona.

---

## 3. Una métrica bien definida: flakiness por suite

Este es el ejemplo completo que exige el estándar editorial. Definimos flakiness como la proporción de ejecuciones intermitentes de una suite en una ventana, con exclusiones explícitas.

### 3.1 Definición

**Flakiness de una suite `S` en la ventana `W`:**

```
                    ejecuciones_no_deterministas(S, W)
flakiness(S, W) = ---------------------------------------
                    ejecuciones_validas(S, W)
```

Donde:

- `ejecuciones_no_deterministas`: corridas del **mismo commit** y **mismo entorno** que dan resultados distintos (pasa/falla) sin cambio de código.
- `ejecuciones_validas`: total de corridas de `S` en `W`, **después de aplicar exclusiones**.
- `W`: ventana temporal fija —p. ej. 14 días o las últimas 200 corridas. La ventana evita que un mal día contamine para siempre y que una mejora tarde meses en verse.

### 3.2 Exclusiones (lo que NO cuenta como flaky)

Sin exclusiones, la métrica miente. Excluimos:

- Fallos por **ambiente caído** (categoría "ambiente" del triage): no es flaky, es infraestructura.
- Fallos por **dependencia externa degradada** conocida.
- Corridas sobre **commits distintos** (comparar peras con peras).
- Tests en **cuarentena** que ya tienen ticket de causa raíz (se miden aparte para no ocultar el problema, pero no inflan el flakiness "activo").

### 3.3 Acción esperada

Una métrica sin acción es un adorno. Definimos umbrales de acción (**ilustrativos**, calibrar por equipo):

| flakiness(S, W) | Interpretación | Acción esperada |
|---|---|---|
| < 1% | Suite sana | Mantener; observar tendencia |
| 1%–5% | Deuda emergente | Ticket de causa raíz por test flaky |
| > 5% | Feedback poco confiable | Cuarentena agresiva + freno a agregar tests nuevos a esa suite hasta estabilizar |

### 3.4 Pseudocódigo de cálculo (ilustrativo, no de producción)

```python
# Ilustrativo. Asume un registro de ejecuciones con:
# suite, commit, entorno, resultado, motivo_fallo, en_cuarentena, timestamp
def flakiness(runs, suite, ventana):
    validas, no_det = 0, 0
    grupos = agrupar_por(runs, clave=("commit", "entorno"),
                         filtro=lambda r: r.suite == suite
                                          and r.timestamp in ventana
                                          and not r.en_cuarentena
                                          and r.motivo_fallo not in
                                              ("ambiente", "dependencia_externa"))
    for _, corridas in grupos.items():
        validas += len(corridas)
        resultados = {c.resultado for c in corridas}  # {"pass","fail"}
        if len(resultados) > 1:            # mismo commit+entorno, distinto resultado
            no_det += len(corridas)
    return (no_det / validas) if validas else 0.0
```

**Explicación por bloques.** El filtro implementa las exclusiones de §3.2. El agrupamiento por `(commit, entorno)` es lo que define "no determinista": mismo insumo, distinto resultado. La división final es la fórmula de §3.1. No hay resultados de ejecución inventados aquí: es la **definición**, no una medición.

---

## 4. La métrica dañina, en detalle: "cantidad de casos automatizados"

Contrastémosla con los cuatro requisitos:

| Requisito | Flakiness por suite | Cantidad de casos automatizados |
|---|---|---|
| Fórmula explícita | Sí | "Sí" (contar), pero mide esfuerzo |
| Ventana temporal | Sí | No (es acumulativa, solo crece) |
| Exclusiones | Sí (ambiente, dependencia, cuarentena) | Ninguna: un test trivial cuenta igual que uno crítico |
| Acción esperada | Sí (cuarentena/causa raíz) | Ninguna útil: "agregá más" |

El problema de fondo: **cuenta actividad, no riesgo cubierto**. Diez tests sobre el mismo happy path suman diez; un test que cubre el caso de autorización cruzada suma uno. La métrica premia lo primero. Si querés medir cobertura de riesgo, medí *riesgos críticos con al menos una verificación*, no *cantidad de tests*.

> **Trade-off honesto.** "Riesgos cubiertos" es más difícil de calcular que "cantidad de casos": requiere un mapa de riesgos vivo. Ese costo es exactamente lo que la métrica fácil te ahorra —y por eso la métrica fácil no enseña nada.

---

## 5. Métricas de sistema: DORA, con matices

Para señales de entrega y estabilidad a nivel de sistema, la investigación de **DORA** ofrece un marco reproducible y ampliamente citado. Sus **cuatro métricas clave**:

| Métrica | Qué mide | Familia |
|---|---|---|
| Deployment frequency | Con qué frecuencia entregás a producción | Throughput |
| Lead time for changes | Cuánto tarda un cambio de commit a producción | Throughput |
| Change failure rate | Qué proporción de cambios causa un fallo | Estabilidad |
| Failed deployment recovery time | Cuánto tardás en recuperarte de un fallo | Estabilidad |

*(Hecho citado — fuente: [dora.dev](https://dora.dev/). **Matiz de vigencia:** el reporte 2024 de DORA incorporó una quinta señal, el* rework rate*; al publicar, citá la edición vigente del reporte y no congeles la lista en cuatro.)*

**Cómo NO usar DORA.** Estas métricas describen el sistema de entrega; **no** son un ranking de personas ni un objetivo a maximizar aisladamente. Convertir "deployment frequency" en cuota individual reproduce el error de Goodhart a otra escala. Se leen **juntas**: subir throughput degradando estabilidad no es una mejora.

**Un matiz honesto del propio dato:** en el reporte 2024, por primera vez el clúster de performance "medio" mostró un change failure rate más bajo que el "alto" —un recordatorio de que las cuatro señales no siempre se mueven juntas y de que ninguna métrica se interpreta sola. *(Hecho citado, con la salvedad de verificar la edición vigente.)*

---

## 6. Cómo elegir una métrica sin hacer daño

Un pequeño protocolo antes de agregar cualquier métrica al dashboard:

<figure class="diagram">
  <img src="/blog/diagrams/metricas-de-calidad-que-ensenan-y-que-danan-1.svg" alt="Diagrama: metricas-de-calidad-que-ensenan-y-que-danan (1)" loading="lazy" decoding="async" />
</figure>

Preguntas de control:

1. Si el equipo **optimiza este número al máximo**, ¿mejora el producto o solo el número? (test de Goodhart)
2. ¿Podría esta métrica **desincentivar reportar problemas**? Si sí, es tóxica.
3. ¿Quién actúa cuando cambia, y cómo? Si nadie, no la midas.

---

## 7. Límites y honestidad

- No existe "la métrica de calidad". La calidad es multidimensional; cualquier número único distorsiona.
- Las métricas informan decisiones; **no las toman**. Un change failure rate alto no dice *qué* arreglar, solo que algo merece atención.
- Los umbrales de este artículo son ilustrativos. Copiarlos sin calibrar reproduce el error de tratar una heurística como una cuota.
- Ninguna cifra de Nexo Finanzas aquí es real: son ejemplos para mostrar la forma de una métrica, no su valor.

---

## Qué aprendimos y próximos pasos

- Una métrica útil tiene fórmula, ventana, exclusiones y acción; sin eso es adorno o incentivo perverso.
- Flakiness por suite mide salud del feedback; "cantidad de casos" mide esfuerzo y engaña.
- DORA describe el sistema de entrega —úsalo a nivel de equipo, junto, y verificá la edición vigente.
- La mejor defensa contra métricas dañinas es preguntar: *si esto se maximiza, ¿mejora el producto o solo el número?*

**Enlaces internos (misma colección):**
- [Pilar — Liderar calidad sin convertirse en cuello de botella](/blog/liderar-calidad-sin-ser-cuello-de-botella-operating-model/) — §8.
- [Artículo 3 — Triage de defectos sin culpables](/blog/triage-defectos-sin-culpables-taxonomia-fallos/) — de dónde salen los datos de flakiness.
- [Artículo 2 — DoR y DoD como acuerdos vivos](/blog/dor-dod-acuerdos-vivos-quality-gates-por-riesgo/) — cómo no gamificar la DoD.

**Otras colecciones del blog:**
- [04 — CI/CD y continuous quality](../04-ci-cd-y-continuous-quality/)
- [06 — Performance, SLO y capacidad](../06-performance-engineering-slo-y-capacidad/)
- [07 — Observabilidad para Quality Engineering](../07-observabilidad-para-quality-engineering/)

## Conexión con el portfolio Nexo Finanzas

Repos: `nexo-quality-control-tower`, `nexo-performance-lab`. Archivos:

```text
docs/quality/metrics-catalog.md      # cada métrica con fórmula, ventana, exclusiones, acción
docs/quality/flakiness-policy.md
docs/adr/0003-que-metricas-medimos-y-cuales-no.md
```

## Fuentes

- DORA — Métricas de entrega de software (Four Keys y evolución): <https://dora.dev/>
- Google Cloud — Using the Four Keys to measure DevOps performance: <https://cloud.google.com/blog/products/devops-sre/using-the-four-keys-to-measure-your-devops-performance>
- GitLab — `artifacts:reports` (reportes de test/cobertura del pipeline): <https://docs.gitlab.com/ci/yaml/artifacts_reports/>

## Checklist final para el lector

- [ ] Cada métrica del dashboard tiene fórmula, ventana, exclusiones y acción.
- [ ] Ninguna métrica mide personas.
- [ ] Ninguna métrica desincentiva reportar problemas.
- [ ] Usás flakiness (salud) en vez de "cantidad de casos" (esfuerzo).
- [ ] Si usás DORA, lo leés junto y con la edición vigente.

