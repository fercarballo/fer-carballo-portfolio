// Genera los rasters de favicon que Google y los navegadores necesitan a partir
// del monograma FC. El SVG (public/favicon.svg) sigue siendo la fuente para
// navegadores modernos; acá derivamos:
//   - favicon.ico     (16/32/48 empaquetados) -> sonda por defecto de Googlebot-Favicon
//   - favicon-96.png  (icon PNG explícito)
//   - apple-touch-icon.png (180, iOS/Safari)
// Uso: node scripts/gen-favicons.mjs
import sharp from 'sharp';
import { writeFile } from 'node:fs/promises';

const PUBLIC = new URL('../public/', import.meta.url);

// Fuente full-bleed (sin esquinas redondeadas) para que rasterice nítido a 16px
// y para que la máscara de iOS aplique su propio redondeo.
const raster = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#00e0ff"/><stop offset="0.7" stop-color="#2f6bff"/>
  </linearGradient></defs>
  <rect width="64" height="64" fill="url(#g)"/>
  <text x="32" y="44" font-family="Inter, Helvetica, Arial, sans-serif" font-size="34"
        font-weight="800" fill="#fff" text-anchor="middle" letter-spacing="-1.5">FC</text>
</svg>`;
const src = Buffer.from(raster);

const png = (size) =>
  sharp(src, { density: 512 })
    .resize(size, size, { fit: 'cover' })
    .png()
    .toBuffer();

// Empaqueta PNGs (Vista+ PNG-in-ICO) en un contenedor .ico válido.
function ico(entries) {
  const count = entries.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(count, 4);
  const dir = Buffer.alloc(16 * count);
  let offset = 6 + 16 * count;
  entries.forEach((e, i) => {
    const b = i * 16;
    dir.writeUInt8(e.size >= 256 ? 0 : e.size, b + 0); // width
    dir.writeUInt8(e.size >= 256 ? 0 : e.size, b + 1); // height
    dir.writeUInt16LE(1, b + 4); // color planes
    dir.writeUInt16LE(32, b + 6); // bits per pixel
    dir.writeUInt32LE(e.buf.length, b + 8);
    dir.writeUInt32LE(offset, b + 12);
    offset += e.buf.length;
  });
  return Buffer.concat([header, dir, ...entries.map((e) => e.buf)]);
}

const sizes = [16, 32, 48];
const bufs = await Promise.all(sizes.map(png));
const icoBuf = ico(sizes.map((size, i) => ({ size, buf: bufs[i] })));

await writeFile(new URL('favicon.ico', PUBLIC), icoBuf);
await writeFile(new URL('favicon-96.png', PUBLIC), await png(96));
await writeFile(new URL('apple-touch-icon.png', PUBLIC), await png(180));

console.log('favicon.ico', icoBuf.length, 'bytes ·', sizes.join('/'));
console.log('favicon-96.png, apple-touch-icon.png escritos en public/');
