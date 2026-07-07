import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const blog = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/blog' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.coerce.date(),
    tags: z.array(z.string()).default([]),
    icon: z.string().default('terminal'),
    iconHue: z.number().default(217),
    draft: z.boolean().default(false),
  }),
});

export const collections = { blog };
