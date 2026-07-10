---
title: "CI, matriz de dispositivos, flakiness y evidencia: medir calidad mobile por riesgo, no por cantidad"
description: "Cómo ejecutar pruebas mobile por niveles en CI, decidir la matriz de dispositivos con evidencia, contener el flakiness con cuarentena y producir evidencia reproducible y saneada, midiendo calidad por riesgo y no por cantidad de casos."
pubDate: 2026-07-09
tags: ["ci-cd", "device-matrix", "flakiness", "test-metrics", "evidence", "privacy", "mobile-testing"]
cluster: "10"
clusterTitle: "Mobile Quality Engineering"
type: "satelite"
order: 4
icon: "phone"
iconHue: 300
readingLevel: "Intermedio–Avanzado"
---
## El problema: el pipeline que nadie mira

La corrida de Nexo tarda 55 minutos, es roja "por costumbre", y su reporte es una lista de tests sin video, sin versión de app y sin correlación con la API. Nadie confía en ella, así que se *mergea* igual.

Un pipeline que no produce **evidencia reproducible** ni distingue **flakiness** de bug real no es control de calidad: es teatro. Este artículo hace ejecutable la [estrategia del pilar](/blog/calidad-mobile-por-riesgo/).

## Prerrequisitos y glosario

Conviene conocer CI/CD, artefactos, secretos y datos sintéticos.

- **Cuarentena:** aislar un test flaky para que deje de bloquear el pipeline **sin** borrarlo, con un ticket y un dueño asignados.
- **Evidencia reproducible:** el artefacto que permite reconstruir un fallo. Video o captura, más logs, versión de app, build/commit, dispositivo, OS y el `request-id` de la API.
- **Segmento de matriz:** una combinación de dispositivo, OS, pantalla, idioma y red, elegida por criterio y sujeta a revisión.

## Ejecución por niveles: feedback antes que exhaustividad

El pipeline **escalona** por costo de feedback, de forma coherente con el modelo por capas de [Android](https://developer.android.com/training/testing/fundamentals/strategies): lo barato bloquea temprano; lo caro corre después.

<figure class="diagram">
  <img src="/blog/diagrams/ci-matriz-flakiness-evidencia-1.svg" alt="Diagrama: ci-matriz-flakiness-evidencia (1)" loading="lazy" decoding="async" />
</figure>

Un **smoke E2E deliberadamente pequeño** —un dispositivo por plataforma— protege el merge. La **matriz completa** corre de noche, cuando nadie está esperando el resultado. Ese smoke cross-channel vive en `nexo-cross-channel-regression`.

La tentación permanente es agregar "solo un test más" al smoke. Cada uno de ellos le cobra minutos a cada PR del equipo, todos los días.

## Configuración CI de matriz

Pseudoconfiguración YAML con jobs por plataforma y artefactos capturados **siempre**. Sin umbrales inventados: las políticas de reintento y cuarentena son **decisiones explícitas**, no magia del runner. El archivo completo está en [`artefactos/ci/mobile-e2e.yml`](../artefactos/ci/mobile-e2e.yml).

```yaml
mobile_e2e:
  stage: e2e
  parallel:
    matrix:
      - PLATFORM: ["android", "ios"]
  script:
    - ./gradlew runMobileE2E -Pplatform="$PLATFORM"
  # Politica de reintento como DECISION explicita, no como ocultador de flakiness:
  # reintento maximo 1, solo el test fallido; segunda falla -> cuarentena + ticket.
  retry:
    max: 1
    when: script_failure
  artifacts:
    when: always            # evidencia incluso (sobre todo) al fallar
    paths:
      - reports/mobile/      # JUnit / Allure saneado
      - artifacts/mobile/    # video, logs, screenshots saneados
```

Explicación: la sección `matrix` paraleliza Android e iOS. El `retry: max 1` absorbe ruido puntual —un emulador que tarda en arrancar— pero **no** oculta flakiness crónico: a la segunda falla, el test va a cuarentena. El `when: always` garantiza evidencia incluso en verde, que es cuando sirve para comparar contra el rojo de mañana.

Los reintentos **ilimitados** son un anti-patrón, y están abajo.

## La matriz de dispositivos como decisión basada en evidencia

Nexo no tiene analítica de parque real, así que su matriz es una **hipótesis de portfolio revisable**, y así se declara. Sus ejes:

- **Versión de OS**, porque la fragmentación de Android y el ritmo de adopción de iOS son distintos.
- **Densidad y tamaño de pantalla**, que rompen layouts.
- **Gama y RAM**, que determinan si el SO termina tu proceso en background.
- **Idioma**, que rompe cualquier localizador basado en texto.
- **Condición de red**, que es el eje que más defectos revela y el que más se ignora.

Los emuladores y simuladores cubren la mayoría de los segmentos en CI. Un conjunto **físico acotado** cubre las señales que el emulador no representa fielmente: biometría, rendimiento en gama baja, radios reales y terminación por presión de memoria.

Dos afirmaciones que sostengo explícitamente: los resultados de emulador o simulador **no sustituyen por definición** todas las validaciones en dispositivo físico, y la matriz **debe revisarse periódicamente** según los usuarios reales y los cambios de plataforma. Una matriz que no se revisó en un año no describe a tus usuarios; describe a los de hace un año.

## Métricas: medir riesgo y feedback, no volumen

No existe una meta universal. Se construye una **línea de base** y se observa su tendencia. Métricas útiles:

- **Cobertura de journeys y riesgos**, no de pantallas ni de líneas.
- **Distribución de ejecución por nivel** y **duración del feedback**. ¿Cuánto tarda el smoke que protege el merge?
- **Tasa de flakiness con categoría:** producto, app, API, dispositivo, red, dato, framework o ambiente. Sin categoría, "flaky" es una excusa, no un diagnóstico.
- **Éxito y falla segmentados** por plataforma, OS, tipo de dispositivo y condición de red, **solo cuando la muestra sea suficiente**. Reportar 1 de 1 como "100% de éxito" es ruido con formato de dato.
- **Defectos escapados** relacionados con ciclo de vida, accesibilidad, permisos o compatibilidad.
- **Porcentaje de evidencia reproducible:** video, logs, versión de app y build, dispositivo, OS y `request-id`.
- **Tiempo de triage** y **tiempo de restaurar un entorno de prueba**.

> **Opinión fundamentada vs. hecho citado.** Que el volumen de casos sea una mala métrica es mi opinión, sostenida por la experiencia del sector. Que la guía oficial priorice atrapar bugs temprano con tests pequeños es un hecho citado ([Android · Testing strategies](https://developer.android.com/training/testing/fundamentals/strategies)).

## Evidencia y privacidad: no publicar lo que no debe salir

Los artefactos son el producto del pipeline y también su **mayor superficie de fuga**. Controles alineados a MASVS-PRIVACY y MASVS-STORAGE ([MASVS](https://mas.owasp.org/MASVS/)), con procedimientos de verificación en [MASTG](https://mas.owasp.org/MASTG/):

- **Nunca** tokens, credenciales, PII ni capturas de usuarios reales en videos, logs o screenshots. Solo cuentas y datos **sintéticos**.
- **Sanear logs:** enmascarar `Authorization`, la clave de idempotencia si fuera sensible, y los identificadores de usuario.
- **Secretos en el secret store del CI**, nunca en el repositorio ni en el YAML.
- **Correlacionar con la API por `request-id`**, no por datos personales.

Un video de una corrida sobre datos reales es una filtración con reproducción automática. La única defensa robusta es que no haya datos reales que filtrar.

## Anti-patrones

**Esconder el flakiness con reintentos ilimitados.** *Causa:* querer el verde a cualquier costo. *Consecuencia:* los bugs reales quedan enmascarados y la confianza en la suite cae a cero. *Alternativa:* `retry` acotado más cuarentena con ticket y dueño.

**Compartir cuentas o datos entre corridas paralelas.** *Causa:* pereza en la estrategia de datos. *Consecuencia:* colisiones no deterministas que se ven como falsos rojos y se explican como "flaky". *Alternativa:* datos sintéticos aislados por ejecución.

**Publicar videos, logs o capturas con datos sensibles.** *Causa:* capturar "todo por las dudas". *Consecuencia:* fuga de PII o de secretos en un artefacto que queda archivado. *Alternativa:* saneo por defecto y datos sintéticos por diseño.

**Medir el éxito por cantidad de casos.** *Causa:* es la métrica de vanidad más fácil de producir. *Consecuencia:* incentiva escribir tests, no reducir riesgo. *Alternativa:* cobertura de riesgo más calidad del feedback.

## Evidencia reproducible

- **Entorno:** runners con emuladores Android y simuladores iOS; un conjunto físico acotado; Appium 3.x; `nexo-quality-platform` con entornos efímeros.
- **Comandos:** `./gradlew runMobileE2E -Pplatform=android|ios`; recolección de `reports/mobile/` y `artifacts/mobile/`.
- **Resultado esperado:** el smoke protege el merge en minutos; la matriz nocturna produce un reporte con evidencia saneada por segmento.
- **Limitaciones:** no se incluyen métricas ni tasas reales, porque se construyen como línea de base y no se pueden inventar. Los umbrales de cuarentena son una decisión del equipo. El emulador no equivale al dispositivo físico.

## Qué aprendimos y próximos pasos

Un pipeline útil **escalona** por costo de feedback, **contiene** el flakiness con reglas explícitas, y **produce evidencia reproducible y saneada**. La métrica que importa es la cobertura de riesgo, no la cantidad de casos.

- Marco de riesgo → **[Artículo 1](/blog/calidad-mobile-por-riesgo/)**
- Estabilidad de los E2E que este pipeline ejecuta → **[Artículo 2](/blog/testabilidad-appium-cross-platform/)**
- El journey crítico que verifica la matriz → **[Artículo 3](/blog/red-degradada-lifecycle-idempotencia/)**

Recurso operativo: el **runbook de flakiness**.

## Checklist final

- [ ] El pipeline escalona: unit/integración → UI nativa → smoke E2E → matriz nocturna.
- [ ] Los reintentos están acotados; la segunda falla dispara cuarentena con ticket y dueño.
- [ ] Los artefactos se capturan `when: always` y están saneados de PII y secretos.
- [ ] La matriz está declarada como hipótesis revisable, con eje de red y con dispositivos físicos.
- [ ] Las métricas miden riesgo y feedback, no volumen de casos.
- [ ] Existe un runbook de flakiness y una muestra de evidencia sin datos sensibles.

---

*Colección **Mobile Quality Engineering**. Fuentes verificadas al 2026-07-09; ver **Control de calidad editorial**.*

