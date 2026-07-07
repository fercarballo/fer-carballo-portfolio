---
title: 'GitOps con ArgoCD: cuando Git es la única fuente de verdad'
description: 'Cómo implementé GitOps sobre OpenShift/Kubernetes: sincronización declarativa, self-healing, detección de drift y qué aprendí operando incidentes reales.'
pubDate: 2026-05-27
tags: ['DevOps', 'ArgoCD', 'Kubernetes']
icon: 'ship'
iconHue: 200
---

Antes de GitOps, la pregunta "¿qué versión está corriendo en producción?" se respondía entrando al cluster. Con ArgoCD, la respuesta está en Git — siempre. Este es el flujo que implementé y lo que aprendí operándolo.

## La idea en una frase

El estado deseado de la plataforma vive en un repositorio Git; ArgoCD se encarga de que el cluster converja a ese estado. **Un deploy es un merge.**

## El flujo completo

1. El pipeline de CI construye y testea la imagen (los quality gates de QA bloquean acá).
2. Se publica la imagen versionada al registry.
3. Un commit actualiza el manifiesto (tag de imagen) en el repo de configuración.
4. ArgoCD detecta el cambio y sincroniza el cluster: deployments, services, routes, configmaps, secrets, namespaces y PVCs.

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: mi-servicio
spec:
  source:
    repoURL: https://gitlab.com/equipo/config-repo.git
    path: overlays/produccion
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
```

## Lo que me salvó en incidentes

- **Self-healing**: alguien hizo un `kubectl edit` a mano en un apuro. ArgoCD revirtió el drift solo, y el diff quedó visible para el postmortem.
- **Rollback = `git revert`**: sin snowflakes, sin "pasos manuales documentados en un wiki desactualizado".
- **Auditoría gratis**: cada cambio de producción tiene autor, revisión y timestamp — porque es un commit.

## Los errores que cometí (para que no los repitas)

- **Secrets en el repo**: no. Usá Sealed Secrets o un secret manager externo desde el día uno.
- **Un solo repo para app + config**: separalos; el ciclo de vida del código y el de la configuración no es el mismo.
- **Sync automático en todo**: en entornos productivos sensibles, empezá con sync manual + diff visible, y automatizá cuando el equipo confía en el flujo.

## El vínculo con QA

GitOps no es solo una práctica de DevOps: es **trazabilidad**, el mismo principio que aplico en testing con Jira/Xray. Requerimiento → prueba → evidencia → resultado, y ahora también → commit → deploy. El ciclo completo del software, auditable de punta a punta.
