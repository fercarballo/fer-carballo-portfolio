#!/usr/bin/env node
/**
 * ─────────────────────────────────────────────────────────────
 *  import-blog.mjs — Importa el corpus editorial de Quality Engineering
 *  desde `QA BLOG POSTEOS` al blog del portfolio (Astro content collection).
 *
 *  Qué hace:
 *   1. Descubre los artículos (excluye READMEs, mapas editoriales y artefactos).
 *   2. Normaliza el frontmatter heterogéneo (titulo/title, meta_descripcion/…,
 *      5 variantes de fecha) a un esquema único.
 *   3. Deriva colección, orden, tipo (pilar/satélite) y repo canónico.
 *   4. Reescribe los enlaces internos .md → /blog/<slug> (resolviendo rutas
 *      relativas). Los enlaces a artefactos/READMEs no publicados se degradan
 *      a texto plano para no dejar 404.
 *   5. Extrae los bloques ```mermaid a .mmd y los reemplaza por una figura que
 *      apunta al SVG pre-renderizado (ver render-diagrams.mjs).
 *   6. Convierte los marcadores epistémicos **[HECHO]** en spans estilables.
 *
 *  Uso: node scripts/import-blog.mjs [--dry]
 * ─────────────────────────────────────────────────────────────
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, dirname, relative, basename } from 'node:path';
import { execFileSync } from 'node:child_process';
import matter from 'gray-matter';

const SRC = '/Users/fernandodanielcarballo/QA BLOG POSTEOS';
const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..');
const OUT_CONTENT = join(ROOT, 'src/content/blog');
const OUT_MMD = join(ROOT, '.mermaid-src');
const DRY = process.argv.includes('--dry');

// ── Metadatos de las 16 colecciones (orden de lectura del corpus) ──
export const CLUSTERS = {
  '00': { title: 'Mapa de estudio y arquitectura de calidad', short: 'Mapa de estudio', icon: 'grad', hue: 145, blurb: 'La puerta de entrada: cómo encaja todo y en qué orden estudiarlo.' },
  '01': { title: 'Arquitectura de Quality Engineering', short: 'Arquitectura de QE', icon: 'shield', hue: 152, blurb: 'Diseñar el sistema de decisiones: riesgo → control → evidencia.' },
  '02': { title: 'API contract testing y sistemas distribuidos', short: 'Contratos de API', icon: 'braces', hue: 28, blurb: 'Contratos, idempotencia y evolución sin romper consumidores.' },
  '03': { title: 'Framework engineering para automatización', short: 'Framework engineering', icon: 'bot', hue: 210, blurb: 'Tratar la automatización como un producto interno.' },
  '04': { title: 'CI/CD y continuous quality', short: 'CI/CD y calidad continua', icon: 'infinity', hue: 200, blurb: 'Pipelines basados en riesgo y quality gates auditables.' },
  '05': { title: 'Entornos y datos de prueba', short: 'Entornos y datos', icon: 'container', hue: 190, blurb: 'Reproducibilidad: el entorno también es parte de la prueba.' },
  '06': { title: 'Performance engineering, SLO y capacidad', short: 'Performance y SLO', icon: 'chart', hue: 12, blurb: 'De la carga a una decisión: percentiles, SLOs y error budgets.' },
  '07': { title: 'Observabilidad para Quality Engineering', short: 'Observabilidad', icon: 'search', hue: 265, blurb: 'Telemetría como contrato: diagnosticar en vez de adivinar.' },
  '08': { title: 'Seguridad y threat modeling para QA', short: 'Seguridad para QA', icon: 'shield', hue: 0, blurb: 'Modelar amenazas y probar lo que un atacante probaría.' },
  '09': { title: 'Accesibilidad como calidad', short: 'Accesibilidad', icon: 'check', hue: 175, blurb: 'Semántica primero; automatizar lo automatizable y evaluar el resto.' },
  '10': { title: 'Mobile Quality Engineering', short: 'Mobile QE', icon: 'phone', hue: 300, blurb: 'Riesgo móvil: red degradada, ciclo de vida y matrices de CI.' },
  '11': { title: 'Resiliencia y chaos engineering', short: 'Resiliencia y caos', icon: 'refresh', hue: 45, blurb: 'Experimentos de falla con blast radius mínimo y gobernanza.' },
  '12': { title: 'Liderazgo y operating model de calidad', short: 'Liderazgo de calidad', icon: 'chat', hue: 330, blurb: 'Liderar calidad sin ser el cuello de botella.' },
  '13': { title: 'Quality Engineering en fintech', short: 'Fintech', icon: 'flask', hue: 88, blurb: 'Probar dinero: idempotencia, representación y reconciliación.' },
  '14': { title: 'IA aplicada y evaluación de calidad', short: 'IA y evals', icon: 'sparkle', hue: 280, blurb: 'Evaluar sistemas no deterministas: evals, RAG y abstención.' },
  '15': { title: 'Investigación técnica y escritura basada en evidencia', short: 'Escritura con evidencia', icon: 'book', hue: 220, blurb: 'Cómo se investiga, se mide y se publica sin inventar.' },
};

const EXCLUDE_NAMES = new Set(['README.md', 'CONTROL-CALIDAD-EDITORIAL.md', 'IMPLEMENTACION-GITHUB.md', 'VERIFICACION-DE-FUENTES.md']);
const EXCLUDE_PATH = /\/(artefactos|artefactos-nexo|artefactos-nexo-transfer-api|implementation|diagramas|\.git|\.venv|\.claude)\//;
const META_DOC = /^(00-mapa-editorial-y-analisis|00-analisis-y-control-de-calidad)\.md$/;

const MARKERS = { 'HECHO': 'hecho', 'INFERENCIA': 'inferencia', 'DECISIÓN': 'decision', 'HIPÓTESIS': 'hipotesis', 'OPINIÓN': 'opinion' };

/** Recorre el árbol devolviendo los .md de artículo. */
function findArticles(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) {
      if (/^(\.git|\.venv|\.claude|artefactos|artefactos-nexo|artefactos-nexo-transfer-api|implementation|diagramas)$/.test(entry)) continue;
      findArticles(p, acc);
    } else if (entry.endsWith('.md') && !EXCLUDE_NAMES.has(entry) && !META_DOC.test(entry) && !EXCLUDE_PATH.test(p + '/')) {
      acc.push(p);
    }
  }
  return acc;
}

function gitDate(file) {
  try {
    return execFileSync('git', ['log', '-1', '--format=%aI', '--', file], { cwd: SRC, encoding: 'utf8' }).trim() || null;
  } catch { return null; }
}

function toDate(v, file) {
  if (v) {
    const d = new Date(String(v).trim());
    if (!isNaN(d)) return d.toISOString().slice(0, 10);
  }
  const g = gitDate(file);
  if (g) return g.slice(0, 10);
  return statSync(file).mtime.toISOString().slice(0, 10);
}

function firstH1(body) {
  const m = body.match(/^#\s+(.+)$/m);
  return m ? m[1].trim() : null;
}

/** Quita el primer H1 (el layout ya renderiza el título → un solo <h1>). */
function stripFirstH1(body) {
  return body.replace(/^#\s+.+$\n*/m, '');
}

/**
 * El corpus mezcla nivel y prerrequisitos en un solo campo, p. ej.
 * "Intermedio–avanzado. Requiere HTTP/APIs…" o "Intermedio (QA Automation)".
 * Separamos: badge corto (nivel) + nota de prerrequisitos.
 */
function normalizeLevel(raw) {
  const s = String(raw || '').trim();
  if (!s) return { level: '', prereq: '' };
  const head = s.split(/[.(]/)[0].trim();
  const rest = s.slice(head.length).replace(/^[.\s]+/, '').trim();
  const level = head
    .replace(/[-–—]/g, '–')
    .split('–')
    .map((w) => w.trim())
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join('–');
  const prereq = rest.replace(/^\((.*)\)$/s, '$1').trim();
  return { level, prereq };
}

function clusterOf(file) {
  const rel = relative(SRC, file);
  const id = rel.slice(0, 2);
  return CLUSTERS[id] ? id : null;
}

function orderOf(file) {
  const b = basename(file);
  let m = b.match(/^(\d{2})-(\d)-/); // 09-1-...
  if (m) return parseInt(m[2], 10);
  m = b.match(/^(\d{2})-/);
  return m ? parseInt(m[1], 10) : 99;
}

// ── PASO 1: descubrir y parsear (construye el mapa de slugs) ──
const files = findArticles(SRC).sort();
const bySrc = new Map();

for (const file of files) {
  const raw = readFileSync(file, 'utf8');
  const { data: fm, content } = matter(raw);
  const cluster = clusterOf(file);
  if (!cluster) { console.warn('⚠ sin colección:', file); continue; }

  const title = (fm.titulo || fm.title || firstH1(content) || basename(file, '.md')).toString().trim();
  const description = (fm.meta_descripcion || fm.meta_description || fm.description || fm.subtitle || '').toString().trim();
  const slug = (fm.slug || basename(file, '.md')).toString().trim();
  const order = orderOf(file);
  const isPillar = /pilar/i.test(basename(file)) || String(fm.tipo || '').startsWith('pilar') || fm.pillar === true || order === 1;

  const { level, prereq } = normalizeLevel(fm.nivel_de_lectura || fm.reading_level || fm.nivel);

  bySrc.set(resolve(file), {
    file, slug, title, description, cluster, order,
    type: isPillar ? 'pilar' : 'satelite',
    tags: Array.isArray(fm.tags) ? fm.tags : [],
    readingLevel: level,
    prerequisites: prereq,
    repo: fm.canonical_repo ? String(fm.canonical_repo).trim() : null,
    pubDate: toDate(fm.fecha_publicacion || fm.last_reviewed || fm.verified_at || fm.reference_date || fm.fecha_consulta_fuentes, file),
    content,
  });
}

// Slugs únicos
const seen = new Map();
for (const a of bySrc.values()) {
  if (seen.has(a.slug)) console.warn(`⚠ slug duplicado: ${a.slug}`);
  seen.set(a.slug, a.file);
}

// ── PASO 2: transformar cuerpo ──
const stats = { articles: 0, linksRewritten: 0, linksDegraded: 0, mermaid: 0, markers: 0 };
const mmdJobs = [];

function rewriteLinks(body, fromFile) {
  return body.replace(/\]\(([^)\s]+\.md)(#[^)]*)?\)/g, (full, target, anchor = '') => {
    const abs = resolve(dirname(fromFile), target);
    const hit = bySrc.get(abs);
    if (hit) { stats.linksRewritten++; return `](/blog/${hit.slug}/${anchor})`; }
    stats.linksDegraded++;
    return '__DEGRADE__'; // se resuelve abajo (quita el link, deja el texto)
  });
}

/**
 * Quita los enlaces a destinos no publicados conservando el texto.
 * Ojo: rewriteLinks ya consumió el `]` de cierre, así que el patrón que
 * queda en el cuerpo es `[texto__DEGRADE__` (sin corchete de cierre).
 */
function degradeLinks(body) {
  let out = body.replace(/\[([^[\]]*?)__DEGRADE__/g, (_m, text) => `**${text.trim()}**`);
  if (out.includes('__DEGRADE__')) {
    const left = (out.match(/__DEGRADE__/g) || []).length;
    console.warn(`⚠ ${left} marcador(es) __DEGRADE__ sin resolver; se eliminan.`);
    out = out.replace(/\[?([^[\]]*?)__DEGRADE__/g, (_m, t) => `**${t.trim()}**`).replace(/__DEGRADE__/g, '');
  }
  return out;
}

function transformMermaid(body, slug) {
  let i = 0;
  return body.replace(/```mermaid\n([\s\S]*?)```/g, (_m, code) => {
    i++; stats.mermaid++;
    const name = `${slug}-${i}`;
    mmdJobs.push({ name, code: code.trim() });
    return `<figure class="diagram">\n  <img src="/blog/diagrams/${name}.svg" alt="Diagrama: ${slug} (${i})" loading="lazy" decoding="async" />\n</figure>`;
  });
}

function transformMarkers(body) {
  return body.replace(/\*\*\[(HECHO|INFERENCIA|DECISIÓN|HIPÓTESIS|OPINIÓN)\]\*\*/g, (_m, k) => {
    stats.markers++;
    return `<span class="em em--${MARKERS[k]}">${k}</span>`;
  });
}

if (!DRY) {
  rmSync(OUT_CONTENT, { recursive: true, force: true });
  mkdirSync(OUT_CONTENT, { recursive: true });
  rmSync(OUT_MMD, { recursive: true, force: true });
  mkdirSync(OUT_MMD, { recursive: true });
}

for (const a of bySrc.values()) {
  let body = stripFirstH1(a.content);
  body = rewriteLinks(body, a.file);
  body = degradeLinks(body);
  body = transformMermaid(body, a.slug);
  body = transformMarkers(body);

  const c = CLUSTERS[a.cluster];
  const fm = {
    title: a.title,
    description: a.description,
    pubDate: a.pubDate,
    tags: a.tags,
    cluster: a.cluster,
    clusterTitle: c.title,
    type: a.type,
    order: a.order,
    icon: c.icon,
    iconHue: c.hue,
  };
  if (a.readingLevel) fm.readingLevel = a.readingLevel;
  if (a.repo) fm.repo = a.repo;

  const yaml = [
    '---',
    `title: ${JSON.stringify(a.title)}`,
    `description: ${JSON.stringify(a.description)}`,
    `pubDate: ${a.pubDate}`,
    `tags: [${a.tags.map((t) => JSON.stringify(String(t))).join(', ')}]`,
    `cluster: ${JSON.stringify(a.cluster)}`,
    `clusterTitle: ${JSON.stringify(c.title)}`,
    `type: ${JSON.stringify(a.type)}`,
    `order: ${a.order}`,
    `icon: ${JSON.stringify(c.icon)}`,
    `iconHue: ${c.hue}`,
    ...(a.readingLevel ? [`readingLevel: ${JSON.stringify(a.readingLevel)}`] : []),
    ...(a.prerequisites ? [`prerequisites: ${JSON.stringify(a.prerequisites)}`] : []),
    ...(a.repo ? [`repo: ${JSON.stringify(a.repo)}`] : []),
    '---',
    '',
  ].join('\n');

  if (!DRY) writeFileSync(join(OUT_CONTENT, `${a.slug}.md`), yaml + body.trimStart() + '\n');
  stats.articles++;
}

// Guardar los .mmd para el renderizador de diagramas
if (!DRY) for (const j of mmdJobs) writeFileSync(join(OUT_MMD, `${j.name}.mmd`), j.code + '\n');

console.log('─'.repeat(60));
console.log(`Artículos importados : ${stats.articles}`);
console.log(`Colecciones          : ${new Set([...bySrc.values()].map((a) => a.cluster)).size}`);
console.log(`Pilares              : ${[...bySrc.values()].filter((a) => a.type === 'pilar').length}`);
console.log(`Enlaces reescritos   : ${stats.linksRewritten}`);
console.log(`Enlaces degradados   : ${stats.linksDegraded} (artefactos no publicados)`);
console.log(`Diagramas Mermaid    : ${stats.mermaid}`);
console.log(`Marcadores epistémicos: ${stats.markers}`);
console.log('─'.repeat(60));
