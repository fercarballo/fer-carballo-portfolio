#!/usr/bin/env node
/**
 * import-blog-avanzada.mjs — Importa la serie avanzada (segunda tanda).
 *
 * Fuente: serie-avanzada/ dentro de la biblioteca editorial. A diferencia de
 * la primera tanda, estos artículos traen frontmatter homogéneo (title,
 * subtitle, slug, meta_description, tags, reading_level, role, part_of,
 * status: draft), así que el importador mapea en vez de adivinar.
 *
 * Qué hace:
 *  - 31 artículos → src/content/blog/<slug>.md con el schema del sitio.
 *  - 3 documentos transversales (GLOSARIO, MATRIZ, VERIFICACIÓN DE FUENTES)
 *    → satélites del capítulo a00; los artículos los citan 100+ veces y el
 *    README de la serie manda leerlos. CONTROL-CALIDAD y CATALOGO-DE-ADRS
 *    quedan como material interno (referencian artefactos no publicados).
 *  - Reescribe los enlaces relativos: capítulo → /blog/coleccion/aNN/,
 *    artículo → /blog/<slug>/, transversal publicado → /blog/<slug>/;
 *    lo no publicado (artefactos, docs internos) se degrada a texto plano.
 *  - Extrae los bloques ```mermaid a .mermaid-src/<slug>-N.mmd y deja una
 *    <figure class="diagram"> con <img> (después: npm run blog:diagrams).
 *
 * Idempotente: re-ejecutar regenera los mismos archivos.
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve, dirname, basename } from 'node:path';
import matter from 'gray-matter';

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..');
const SRC = '/Users/fernandodanielcarballo/QA BLOG POSTEOS/SEGUNDA TANDA POSTEOS BLOG/.claude/worktrees/advanced-qa-sr-prompts-715d06/serie-avanzada';
const OUT = join(ROOT, 'src/content/blog');
const MMD = join(ROOT, '.mermaid-src');

/** Fecha de referencia declarada por la propia serie (README y frontmatter). */
const PUB_DATE = '2026-07-10';

const CHAPTERS = readdirSync(SRC).filter((d) => /^\d{2}-/.test(d)).sort();

/** Metadatos por capítulo: cluster id 'aNN' + icon/hue coherentes con blog.ts. */
const CLUSTER_META = {
  '00': { icon: 'command', hue: 160, title: 'Mapa avanzado y priorización' },
  '01': { icon: 'bell', hue: 25, title: 'Event-driven y contratos asíncronos' },
  '02': { icon: 'ship', hue: 355, title: 'Supply-chain security: SLSA y SBOM' },
  '03': { icon: 'git', hue: 205, title: 'Progressive delivery, feature flags y GitOps' },
  '04': { icon: 'filter', hue: 280, title: 'Privacy engineering y gobierno de datos de prueba' },
  '05': { icon: 'set', hue: 190, title: 'Data quality, lineage y reconciliación' },
  '06': { icon: 'chart', hue: 88, title: 'FinOps y economía de la calidad' },
  '07': { icon: 'search', hue: 330, title: 'Ingeniería de fraude y motores de reglas' },
  '08': { icon: 'kube', hue: 210, title: 'Platform engineering para Quality Engineering' },
  '09': { icon: 'terminal', hue: 45, title: 'Relevamiento de un proyecto existente' },
  '10': { icon: 'container', hue: 260, title: 'Nueva tanda de proyectos avanzados' },
  '11': { icon: 'infinity', hue: 152, title: 'Plan de integración con Nexo Finanzas' },
  '12': { icon: 'flask', hue: 12, title: 'Capstone: Nexo Trusted Transfer Platform' },
  '13': { icon: 'book', hue: 220, title: 'RFC y design review de calidad' },
};

/** Transversales publicados: archivo → { slug, title, description, order en a00 }. */
const TRANSVERSAL = {
  'GLOSARIO.md': {
    slug: 'glosario-serie-avanzada',
    title: 'Glosario de la serie avanzada',
    description:
      'Los términos que se usan mal con frecuencia, definidos una sola vez: comando vs evento, ack vs efecto, pseudonimizar vs anonimizar, deployment vs release, RFC vs ADR vs runbook.',
    order: 2,
    tags: ['glosario', 'event-driven', 'privacy', 'progressive-delivery', 'quality-engineering'],
  },
  'MATRIZ-RIESGO-CONTROL-EVIDENCIA.md': {
    slug: 'matriz-riesgo-control-evidencia',
    title: 'Matriz transversal: riesgo → control → prueba → evidencia → señal → runbook',
    description:
      'El ciclo completo de la serie en una tabla: 22 riesgos de negocio con su control arquitectónico, la prueba que lo demuestra, la evidencia en CI, la señal en producción y el runbook. Una columna vacía es un riesgo sin controlar.',
    order: 3,
    tags: ['riesgo', 'evidencia', 'quality-engineering', 'gobernanza'],
  },
  'VERIFICACION-DE-FUENTES.md': {
    slug: 'verificacion-de-fuentes-serie-avanzada',
    title: 'Verificación de fuentes de la serie avanzada',
    description:
      'Única fuente de verdad sobre versiones y estados de estándares al 2026-07-10: qué se verificó, qué no pudo verificarse y las siete afirmaciones que la serie se prohíbe hacer.',
    order: 4,
    tags: ['evidencia', 'fuentes', 'metodo-editorial'],
  },
};

/**
 * Cruces hacia la primera tanda: la serie referencia artículos ya publicados
 * (rutas `../../<carpeta-raíz>/...`). Slugs verificados contra src/content/blog.
 */
const PUBLISHED_CROSS = {
  '04-ci-cd-continuous-quality/03-satelite-cadena-suministro-sbom-slsa-provenance.md':
    'cadena-de-suministro-pipeline-sbom-slsa-provenance',
  '13-quality-engineering-en-fintech/posts/02-idempotencia-y-reintentos-en-transferencias.md':
    'idempotencia-y-reintentos-en-transferencias',
  '13-quality-engineering-en-fintech/posts/03-representar-dinero-decimales-unidades-minimas.md':
    'representar-dinero-decimales-unidades-minimas',
};

// ── Pasada 1: mapa global archivo-relativo → slug ─────────────────────────
const fileToSlug = new Map(); // 'NN-carpeta/0X-archivo.md' → slug
const chapterOf = new Map(); // slug → 'aNN'
const articles = []; // { srcPath, rel, chapter }

for (const dir of CHAPTERS) {
  const nn = dir.slice(0, 2);
  for (const f of readdirSync(join(SRC, dir)).filter((x) => /^\d{2}-.*\.md$/.test(x)).sort()) {
    const raw = readFileSync(join(SRC, dir, f), 'utf8');
    const { data } = matter(raw);
    const slug = data.slug ?? basename(f, '.md').replace(/^\d{2}-/, '');
    fileToSlug.set(`${dir}/${f}`, slug);
    chapterOf.set(slug, `a${nn}`);
    articles.push({ srcPath: join(SRC, dir, f), rel: `${dir}/${f}`, chapter: nn, file: f });
  }
}
for (const [f, meta] of Object.entries(TRANSVERSAL)) {
  fileToSlug.set(f, meta.slug);
  chapterOf.set(meta.slug, 'a00');
}

// ── Reescritura de enlaces ────────────────────────────────────────────────
let linksOk = 0;
let linksDegraded = 0;
const degradedTargets = new Map();

function rewriteLinks(body, ownDir) {
  return body.replace(/\[([^\]]*)\]\(([^)\s]+)\)/g, (full, text, target) => {
    if (/^(https?:|mailto:|#)/.test(target)) return full;
    const [path, anchor = ''] = target.split('#');
    // normalizar relativo al capítulo del artículo ('' = raíz de la serie)
    let norm = path.replace(/^\.\//, '');
    if (norm.startsWith('../')) norm = norm.slice(3);
    else if (ownDir) norm = `${ownDir}/${norm}`;
    norm = norm.replace(/\/$/, '');

    const hash = anchor ? `#${anchor}` : '';
    // capítulo (carpeta o su README) → página de colección
    const chapDir = CHAPTERS.find((d) => norm === d || norm === `${d}/README.md`);
    if (chapDir) {
      linksOk++;
      return `[${text}](/blog/coleccion/a${chapDir.slice(0, 2)}/)`;
    }
    // transversal publicado
    const base = basename(norm);
    if (TRANSVERSAL[base]) {
      linksOk++;
      return `[${text}](/blog/${TRANSVERSAL[base].slug}/${hash})`;
    }
    // artículo
    if (fileToSlug.has(norm)) {
      linksOk++;
      return `[${text}](/blog/${fileToSlug.get(norm)}/${hash})`;
    }
    // cruce a un artículo publicado de la primera tanda (rutas ../../raíz)
    const cross = norm.replace(/^(\.\.\/)+/, '');
    if (PUBLISHED_CROSS[cross]) {
      linksOk++;
      return `[${text}](/blog/${PUBLISHED_CROSS[cross]}/${hash})`;
    }
    // el README raíz de la serie ≈ su capítulo 00 (el mapa)
    if (norm === 'README.md') {
      linksOk++;
      return `[${text}](/blog/coleccion/a00/)`;
    }
    // interno o artefacto no publicado → degradar a texto plano
    linksDegraded++;
    degradedTargets.set(norm, (degradedTargets.get(norm) ?? 0) + 1);
    return text;
  });
}

// ── Mermaid → figure + .mmd ───────────────────────────────────────────────
mkdirSync(MMD, { recursive: true });
let mermaidCount = 0;

function extractMermaid(body, slug) {
  let n = 0;
  return body.replace(/```mermaid\n([\s\S]*?)```/g, (_, code) => {
    n++;
    mermaidCount++;
    const name = `${slug}-${n}`;
    writeFileSync(join(MMD, `${name}.mmd`), code.trim() + '\n');
    return `<figure class="diagram">\n  <img src="/blog/diagrams/${name}.svg" alt="Diagrama: ${slug} (${n})" loading="lazy" decoding="async" />\n</figure>`;
  });
}

/** El H1 duplicaría el título del layout; el schema del sitio arranca en H2. */
const stripFirstH1 = (b) => b.replace(/^\s*# .+\n/m, '');

/** 'Avanzado. Requiere X.' → nivel + prerrequisitos por separado. */
function splitLevel(rl) {
  if (!rl) return {};
  const m = rl.match(/^([^.]+)\.\s*(.*)$/s);
  if (!m) return { readingLevel: rl.trim() };
  return { readingLevel: m[1].trim(), ...(m[2] ? { prerequisites: m[2].trim() } : {}) };
}

const esc = (s) => String(s).replace(/"/g, '\\"');

function writePost({ slug, front, body }) {
  const fm = [
    '---',
    `title: "${esc(front.title)}"`,
    `description: "${esc(front.description)}"`,
    `pubDate: ${PUB_DATE}`,
    `tags: [${front.tags.map((t) => `'${t}'`).join(', ')}]`,
    `cluster: '${front.cluster}'`,
    `clusterTitle: "${esc(front.clusterTitle)}"`,
    `type: ${front.type}`,
    `order: ${front.order}`,
    ...(front.readingLevel ? [`readingLevel: "${esc(front.readingLevel)}"`] : []),
    ...(front.prerequisites ? [`prerequisites: "${esc(front.prerequisites)}"`] : []),
    `icon: '${front.icon}'`,
    `iconHue: ${front.iconHue}`,
    '---',
  ].join('\n');
  writeFileSync(join(OUT, `${slug}.md`), `${fm}\n\n${body.trim()}\n`);
}

// ── Pasada 2: artículos ───────────────────────────────────────────────────
let written = 0;
for (const { srcPath, chapter, file } of articles) {
  const raw = readFileSync(srcPath, 'utf8');
  const { data, content } = matter(raw);
  const slug = data.slug ?? basename(file, '.md').replace(/^\d{2}-/, '');
  const meta = CLUSTER_META[chapter];
  const order = Number(file.slice(0, 2));

  let body = stripFirstH1(content);
  body = rewriteLinks(body, basename(dirname(srcPath)));
  body = extractMermaid(body, slug);

  writePost({
    slug,
    front: {
      title: data.title,
      description: data.meta_description ?? data.subtitle,
      tags: data.tags ?? [],
      cluster: `a${chapter}`,
      clusterTitle: meta.title,
      type: data.role === 'pilar' ? 'pilar' : 'satelite',
      order,
      ...splitLevel(data.reading_level),
      icon: meta.icon,
      iconHue: meta.hue,
    },
    body,
  });
  written++;
}

// ── Pasada 3: transversales ───────────────────────────────────────────────
for (const [f, meta] of Object.entries(TRANSVERSAL)) {
  const raw = readFileSync(join(SRC, f), 'utf8');
  let body = stripFirstH1(raw);
  body = rewriteLinks(body, '');
  body = extractMermaid(body, meta.slug);

  writePost({
    slug: meta.slug,
    front: {
      title: meta.title,
      description: meta.description,
      tags: meta.tags,
      cluster: 'a00',
      clusterTitle: CLUSTER_META['00'].title,
      type: 'satelite',
      order: meta.order,
      readingLevel: 'Transversal',
      icon: CLUSTER_META['00'].icon,
      iconHue: CLUSTER_META['00'].hue,
    },
    body,
  });
  written++;
}

console.log(`✓ ${written} posts escritos (${articles.length} artículos + ${Object.keys(TRANSVERSAL).length} transversales)`);
console.log(`✓ links reescritos: ${linksOk} · degradados: ${linksDegraded}`);
if (degradedTargets.size) {
  console.log('  degradados por destino:');
  for (const [t, n] of [...degradedTargets.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${String(n).padStart(3)}× ${t}`);
  }
}
console.log(`✓ diagramas mermaid extraídos: ${mermaidCount}`);
