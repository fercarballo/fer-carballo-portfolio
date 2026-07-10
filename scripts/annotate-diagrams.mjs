#!/usr/bin/env node
/**
 * Anota los <img> de diagrama con sus dimensiones intrínsecas.
 *
 * Sin `width`/`height` el navegador no puede reservar el alto del diagrama
 * hasta que descarga el SVG, y como los diagramas son `loading="lazy"` eso
 * ocurre después del primer layout → salto (CLS). Con el par width/height
 * más `height: auto` en CSS, el aspect-ratio queda reservado desde el HTML.
 *
 * Fuente de la verdad: el viewBox del <svg> raíz que ya generó render-diagrams.
 * Idempotente: si el <img> ya tiene width, lo actualiza.
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT = join(ROOT, 'src/content/blog');
const DIAGRAMS = join(ROOT, 'public/blog/diagrams');

/** Lee el viewBox del <svg> raíz (ignora los <svg> anidados de los iconos). */
function intrinsicSize(svgPath) {
  const svg = readFileSync(svgPath, 'utf8');
  const root = svg.match(/<svg\b[^>]*>/);
  if (!root) return null;
  const vb = root[0].match(/viewBox="([\d.\-\s]+)"/);
  if (!vb) return null;
  const [, , w, h] = vb[1].trim().split(/\s+/).map(Number);
  if (!w || !h) return null;
  return { w: Math.round(w), h: Math.round(h) };
}

let annotated = 0;
let missing = 0;

for (const file of readdirSync(CONTENT).filter((f) => f.endsWith('.md'))) {
  const path = join(CONTENT, file);
  let md = readFileSync(path, 'utf8');
  const before = md;

  md = md.replace(/<img src="\/blog\/diagrams\/([^"]+\.svg)"([^>]*?)\/>/g, (full, name, attrs) => {
    const svgPath = join(DIAGRAMS, name);
    if (!existsSync(svgPath)) {
      console.warn(`  ! falta el SVG: ${name}`);
      missing++;
      return full;
    }
    const size = intrinsicSize(svgPath);
    if (!size) {
      console.warn(`  ! sin viewBox utilizable: ${name}`);
      missing++;
      return full;
    }
    const clean = attrs.replace(/\s+(?:width|height)="\d+"/g, '');
    annotated++;
    return `<img src="/blog/diagrams/${name}" width="${size.w}" height="${size.h}"${clean}/>`;
  });

  if (md !== before) writeFileSync(path, md);
}

console.log(`✓ ${annotated} diagramas anotados con width/height${missing ? ` · ${missing} sin resolver` : ''}`);
