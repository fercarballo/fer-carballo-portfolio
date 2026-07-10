import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const blog = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/blog' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.coerce.date(),
    tags: z.array(z.string()).default([]),

    // ── Estructura editorial: colección (cluster) + pilar/satélite ──
    /** Id de colección: '00'…'15' */
    cluster: z.string(),
    clusterTitle: z.string(),
    /** 'pilar' abre la colección; los 'satelite' la profundizan. */
    type: z.enum(['pilar', 'satelite']).default('satelite'),
    /** Orden de lectura dentro de la colección. */
    order: z.number().default(99),

    /** Nivel de lectura normalizado: 'Intermedio', 'Avanzado', 'Intermedio–Avanzado'… */
    readingLevel: z.string().optional(),
    /** Prerrequisitos / audiencia declarados por el artículo. */
    prerequisites: z.string().optional(),
    /** Repo canónico del ecosistema Nexo que implementa lo que el artículo explica. */
    repo: z.string().optional(),

    icon: z.string().default('terminal'),
    iconHue: z.number().default(152),
    draft: z.boolean().default(false),
  }),
});

export const collections = { blog };
