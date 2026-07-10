#!/usr/bin/env node
/**
 * render-diagrams.mjs — Pre-renderiza los .mmd extraídos por import-blog.mjs
 * a SVG con el tema de la paleta "Parque".
 *
 * Los SVG se commitean: el build (y Cloudflare Pages) no necesitan Chromium,
 * y el sitio no embarca mermaid en el cliente (~1 MB de JS que no pagamos).
 * Por eso mermaid-cli NO es una dependencia del proyecto: se usa vía npx sólo
 * cuando hay que re-renderizar.
 *
 * Uso: npm run blog:diagrams -- [--force]
 *   Sin --force, salta los diagramas cuyo SVG ya está actualizado.
 */
import { readdirSync, mkdirSync, existsSync, statSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname, basename } from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..');
const SRC = join(ROOT, '.mermaid-src');
const OUT = join(ROOT, 'public/blog/diagrams');
const CONF = join(ROOT, 'scripts/mermaid-theme.json');
const FORCE = process.argv.includes('--force');

// mermaid-cli no está en package.json (arrastra Chromium). Usamos el binario
// local si existe; si no, npx lo resuelve on-demand.
const LOCAL_MMDC = join(ROOT, 'node_modules/.bin/mmdc');
const HAS_LOCAL = existsSync(LOCAL_MMDC);
const RUN = HAS_LOCAL
  ? (args) => [LOCAL_MMDC, args]
  : (args) => ['npx', ['-y', '@mermaid-js/mermaid-cli', ...args]];

if (!existsSync(SRC)) {
  console.error('No hay .mermaid-src/. Corré primero: node scripts/import-blog.mjs');
  process.exit(1);
}
mkdirSync(OUT, { recursive: true });

const files = readdirSync(SRC).filter((f) => f.endsWith('.mmd')).sort();
let rendered = 0, skipped = 0, failed = [];

for (const [i, f] of files.entries()) {
  const inPath = join(SRC, f);
  const outPath = join(OUT, basename(f, '.mmd') + '.svg');

  if (!FORCE && existsSync(outPath) && statSync(outPath).mtimeMs > statSync(inPath).mtimeMs) {
    skipped++; continue;
  }

  process.stdout.write(`[${String(i + 1).padStart(2)}/${files.length}] ${basename(f, '.mmd').slice(0, 52).padEnd(54)}`);
  try {
    const [cmd, args] = RUN(['-i', inPath, '-o', outPath, '-c', CONF, '-b', 'transparent', '-q']);
    execFileSync(cmd, args, { stdio: ['ignore', 'ignore', 'pipe'], timeout: 180000 });
    // El SVG sale con width/height fijos: los hacemos responsivos.
    let svg = readFileSync(outPath, 'utf8');
    svg = svg.replace(/<svg([^>]*?)\swidth="[^"]*"([^>]*?)\sheight="[^"]*"/, '<svg$1$2');
    if (!/preserveAspectRatio/.test(svg)) svg = svg.replace('<svg', '<svg preserveAspectRatio="xMidYMid meet"');
    writeFileSync(outPath, svg);
    console.log('✓');
    rendered++;
  } catch (e) {
    console.log('✗');
    failed.push({ file: f, err: String(e.stderr || e.message).split('\n').slice(0, 2).join(' ') });
  }
}

console.log('─'.repeat(60));
console.log(`Renderizados: ${rendered}  ·  Sin cambios: ${skipped}  ·  Fallidos: ${failed.length}`);
if (failed.length) {
  console.log('\nFallidos:');
  failed.forEach((f) => console.log(`  ${f.file}\n    ${f.err}`));
  process.exit(1);
}
