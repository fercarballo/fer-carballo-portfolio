#!/usr/bin/env node
/**
 * import-blog-handson.mjs — Integra el lote de 5 posts "QA + IA hands-on"
 * (primera persona, anclados a repos prácticos propios) al blog.
 *
 * Vienen con frontmatter casi listo, pero hay que curar tres cosas que un
 * build verde NO detecta:
 *  1. `repo` viene como URL completa; el sitio espera el nombre corto
 *     (usa REPOS[nombre] para el blurb y repoUrl(nombre) para el href).
 *  2. Los tags venían en Title Case ('QA Automation'); el corpus usa
 *     kebab-minúscula y el bloque "Relacionados" matchea por string exacto.
 *     Se re-etiquetan al vocabulario vivo para que enganchen con los posts
 *     que solapan (en otras colecciones).
 *  3. cluster/order/type venían como propuesta (order:99). Se ubican como
 *     satélites al final de su colección destino.
 *
 * No traen mermaid ni marcadores epistémicos (verificado), así que no pasan
 * por render-diagrams. Se conserva la voz en primera persona: es deliberada.
 *
 * Idempotente.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import matter from 'gray-matter';

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..');
const SRC = '/Users/fernandodanielcarballo/posteos-blog-qa-ia-2026';
const OUT = join(ROOT, 'src/content/blog');

/**
 * Curaduría por post. `order` los ubica como satélites al final de cada
 * colección (verificado contra el estado vivo). `tags` alineados al
 * vocabulario del corpus para que "Relacionados" enganche cross-colección.
 * `hue` = hue de la colección destino.
 */
const PLAN = {
  'evaluar-aplicaciones-llm': {
    cluster: '14', order: 4, icon: 'flask', hue: 280,
    tags: ['evals', 'llm-evaluation', 'quality-engineering', 'ci-cd', 'sdet'],
  },
  'de-javascript-a-python-pytest': {
    cluster: '03', order: 5, icon: 'braces', hue: 210,
    tags: ['contract-testing', 'python', 'pytest', 'test-automation', 'sdet'],
  },
  'testing-sistemas-no-deterministas': {
    cluster: '07', order: 4, icon: 'refresh', hue: 265,
    tags: ['flakiness', 'playwright', 'test-automation', 'ci-cd', 'sdet'],
  },
  'quality-gate-en-cada-pull-request': {
    cluster: '04', order: 5, icon: 'infinity', hue: 200,
    tags: ['ci-cd', 'quality-gates', 'github-actions', 'quality-engineering', 'sdet'],
  },
  'validar-datos-tambien-es-testear': {
    cluster: '05', order: 2, icon: 'set', hue: 190,
    tags: ['data-quality', 'pandera', 'sql', 'test-data', 'sdet'],
  },
};

const CLUSTER_TITLE = {
  '03': 'Framework engineering para automatización',
  '04': 'CI/CD y continuous quality',
  '05': 'Entornos y datos de prueba',
  '07': 'Observabilidad para Quality Engineering',
  '14': 'IA aplicada y evaluación de calidad',
};

const esc = (s) => String(s).replace(/"/g, '\\"');
const bareRepo = (url) => String(url).replace(/^https?:\/\/github\.com\/[^/]+\//, '').replace(/\/$/, '');

let written = 0;
for (const [slug, plan] of Object.entries(PLAN)) {
  const raw = readFileSync(join(SRC, `${slug}.md`), 'utf8');
  const { data, content } = matter(raw);

  const repo = bareRepo(data.repo);
  const fm = [
    '---',
    `title: "${esc(data.title)}"`,
    `description: "${esc(data.description)}"`,
    `pubDate: ${new Date(data.pubDate).toISOString().slice(0, 10)}`,
    `tags: [${plan.tags.map((t) => `'${t}'`).join(', ')}]`,
    `cluster: '${plan.cluster}'`,
    `clusterTitle: "${esc(CLUSTER_TITLE[plan.cluster])}"`,
    `type: satelite`,
    `order: ${plan.order}`,
    ...(data.readingLevel ? [`readingLevel: "${esc(data.readingLevel)}"`] : []),
    ...(data.prerequisites ? [`prerequisites: "${esc(data.prerequisites)}"`] : []),
    `repo: "${repo}"`,
    `icon: '${plan.icon}'`,
    `iconHue: ${plan.hue}`,
    '---',
  ].join('\n');

  writeFileSync(join(OUT, `${slug}.md`), `${fm}\n${content.replace(/^\n+/, '\n')}`);
  written++;
  console.log(`  ✓ ${slug}  → cluster ${plan.cluster} (order ${plan.order}) · repo ${repo}`);
}

console.log(`\n✓ ${written} posts hands-on integrados`);
