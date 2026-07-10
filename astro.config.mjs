// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { readdirSync, readFileSync } from 'node:fs';
import matter from 'gray-matter';
import { rehypeTaskList } from './src/plugins/rehype-task-list.mjs';

const SITE = 'https://fercarballo.com';

/**
 * Sitemap con `lastmod` y `priority` reales en lugar de los valores por defecto.
 *
 * `@astrojs/sitemap` sólo ve URLs, así que leemos el frontmatter de la colección
 * para saber la fecha de cada artículo y si es pilar o satélite. Los pilares
 * abren su colección: valen más que sus satélites.
 */
const posts = new Map(
  readdirSync('src/content/blog')
    .filter((f) => f.endsWith('.md'))
    .map((f) => {
      const { data } = matter(readFileSync(`src/content/blog/${f}`, 'utf8'));
      return [f.replace(/\.md$/, ''), data];
    })
);

const newest = [...posts.values()]
  .map((d) => new Date(d.pubDate))
  .sort((a, b) => b.getTime() - a.getTime())[0]
  .toISOString();

export default defineConfig({
  site: SITE,
  integrations: [
    sitemap({
      serialize(item) {
        const path = new URL(item.url).pathname;

        if (path === '/') return { ...item, changefreq: 'monthly', priority: 1.0, lastmod: newest };
        if (path === '/blog/') return { ...item, changefreq: 'weekly', priority: 0.9, lastmod: newest };
        if (path.startsWith('/blog/coleccion/'))
          return { ...item, changefreq: 'monthly', priority: 0.8, lastmod: newest };

        const post = posts.get(path.replace(/^\/blog\/|\/$/g, ''));
        if (post) {
          return {
            ...item,
            changefreq: 'yearly',
            priority: post.type === 'pilar' ? 0.8 : 0.64,
            lastmod: new Date(post.pubDate).toISOString(),
          };
        }

        return { ...item, changefreq: 'yearly', priority: 0.5 };
      },
    }),
  ],
  markdown: {
    rehypePlugins: [rehypeTaskList],
  },
  prefetch: {
    prefetchAll: true,
    defaultStrategy: 'viewport',
  },
  build: {
    inlineStylesheets: 'auto',
  },
});
