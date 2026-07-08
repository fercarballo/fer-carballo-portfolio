# Portfolio — Fernando Carballo

Portfolio personal de QA Engineer · QA Manual & Automation · SDET, construido con [Astro 5](https://astro.build). Diseño dark tipo dashboard con banner de shader WebGL, partículas, tilt 3D, paleta de comandos ⌘K y blog integrado.

## Comandos

```bash
npm install      # instalar dependencias
npm run dev      # servidor de desarrollo → http://localhost:4321
npm run build    # build de producción → dist/
npm run preview  # previsualizar el build
```

## Dónde editar cada cosa

| Qué                                      | Dónde                                   |
| ---------------------------------------- | --------------------------------------- |
| **Todos tus datos** (perfil, skills, experiencia, proyectos, certificaciones) | `src/data/profile.ts` |
| Artículos del blog                       | `src/content/blog/*.md` (un archivo por post) |
| CV en PDF                                | `public/cv/Fernando-Carballo-CV.pdf`     |
| Colores y tipografía                     | `src/styles/global.css` (variables CSS)  |
| Dominio del sitio (SEO/sitemap/RSS)      | `astro.config.mjs` → `site`              |

### Agregar un artículo al blog

Creá `src/content/blog/mi-articulo.md`:

```markdown
---
title: 'Título del artículo'
description: 'Bajada corta que aparece en la card y en SEO.'
pubDate: 2026-07-06
tags: ['QA Automation', 'CI/CD']
icon: 'bot'        # bot | ship | shield | braces | infinity | chart | code | flask | terminal
iconHue: 152       # tono del ícono (0-360)
---

Contenido en **Markdown**...
```

Aparece automáticamente en `/blog`, en la home, en la paleta ⌘K y en el RSS.

## Pendientes (TODOs)

- [ ] Verificar el usuario de GitHub en `src/data/profile.ts` (verificado: `fercarballo`)
- [ ] Agregar links reales a repos en cada proyecto (`repo:` en `src/data/profile.ts`)
- [ ] Cambiar `site` en `astro.config.mjs` cuando tengas dominio propio

## Deploy

Es un sitio 100 % estático (`dist/`). Opciones gratis: **Cloudflare Pages**, **Vercel**, **Netlify** o **GitHub Pages**. Build command: `npm run build` · Output: `dist`.

## Performance

- ~15 KB de JavaScript total (≈6 KB gzip) — sin frameworks de UI en runtime
- Shader WebGL escrito a mano (~3 KB) en lugar de Three.js (~150 KB)
- Animaciones pausadas fuera del viewport y con `prefers-reduced-motion`
- Prefetch automático de páginas + View Transitions
