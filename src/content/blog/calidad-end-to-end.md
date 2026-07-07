---
title: 'Del caso de prueba al pipeline: cómo pienso la calidad end-to-end'
description: 'La calidad no es una etapa, es una propiedad del sistema. Cómo conecto testing manual, automatización, API testing y CI/CD en un solo flujo trazable.'
pubDate: 2026-04-15
tags: ['QA Manual', 'Testing', 'CI/CD']
icon: 'shield'
iconHue: 145
---

Vengo de atención al cliente. Años escuchando a usuarios frustrados me dejaron una convicción que hoy guía mi trabajo como QA: **cada bug que llega a producción es una conversación difícil que alguien va a tener con un cliente**. La calidad empieza mucho antes del testing y termina mucho después del deploy.

## La calidad como cadena, no como etapa

El modelo mental que uso es una cadena de custodia — si un eslabón se corta, perdés trazabilidad:

**Requerimiento → Criterios de aceptación → Casos de prueba → Ejecución → Evidencia → Resultado → Deploy**

### 1. Requerimiento y criterios de aceptación

Si no puedo escribir un criterio de aceptación verificable, el requerimiento está incompleto. Documentar esto en Confluence *junto a desarrollo y producto* (no después) evita la mitad de los defectos antes de que exista el código.

### 2. Diseño de casos: riesgo primero

No todo se testea con la misma profundidad. Priorizo por riesgo e impacto:

- **Flujos críticos de negocio** (login, pagos, alta de servicio): cobertura completa + automatización.
- **Funcionalidad estándar**: casos funcionales y de regresión dirigidos.
- **Bordes de bajo impacto**: testing exploratorio con timebox.

### 3. Manual y automatizado no compiten

El testing manual exploratorio encuentra los bugs que nadie predijo; la automatización garantiza que los bugs conocidos no vuelvan. Automatizo **regresiones de flujos críticos** (Cypress/Playwright) y **contratos de API** (Postman/Newman), y reservo el ojo humano para lo que las máquinas no ven: UX rota, inconsistencias, comportamientos raros.

### 4. El pipeline como guardián

La suite corre en cada merge request. Si falla, no se mergea — sin excepciones ni "después lo arreglamos". Un quality gate que se puede saltear no es un quality gate, es una sugerencia.

### 5. Evidencia y trazabilidad

Cada defecto en Jira lleva su prueba en Xray, su evidencia (trace, video, response de API) y su vínculo al requerimiento. Cuando un stakeholder pregunta "¿esto se probó?", la respuesta es un link, no un "sí, creo".

## El resultado

Cuando la cadena está completa, pasan tres cosas:

1. Los releases dejan de dar miedo.
2. Las discusiones "¿es bug o es feature?" se resuelven con documentación, no con memoria.
3. El equipo confía en la suite — y una suite en la que se confía es la única que vale el costo de mantenerla.

> La calidad no la pone QA al final: la ponemos todos desde el principio. QA la hace visible, medible y trazable.
