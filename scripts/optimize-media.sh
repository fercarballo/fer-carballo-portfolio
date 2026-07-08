#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
#  optimize-media.sh — comprime imágenes/videos manteniendo calidad
#  para que la web nunca sirva un archivo pesado (ej. foto de 5 MB).
#
#  Uso:
#    ./scripts/optimize-media.sh avatar <ruta-foto>        → public/avatar/fer.jpg (512px)
#    ./scripts/optimize-media.sh banner <ruta-imagen>      → public/banner/hero-park.jpg (1800px)
#    ./scripts/optimize-media.sh loop   <ruta-video>       → public/banner/hero-loop.mp4 (<4MB)
#    ./scripts/optimize-media.sh cert   <ruta-pdf> <slug>  → certificado + miniatura
# ─────────────────────────────────────────────────────────────
set -euo pipefail
kind="${1:?falta el tipo: avatar|banner|loop|cert}"
src="${2:?falta la ruta del archivo}"
root="$(cd "$(dirname "$0")/.." && pwd)"
out=""

case "$kind" in
  avatar)
    out="$root/public/avatar/fer.jpg"; mkdir -p "$(dirname "$out")"
    sips -Z 512 -s format jpeg -s formatOptions 78 "$src" --out "$out" >/dev/null
    ;;
  banner)
    out="$root/public/banner/hero-park.jpg"; mkdir -p "$(dirname "$out")"
    sips -Z 1800 -s format jpeg -s formatOptions 62 "$src" --out "$out" >/dev/null
    ;;
  loop)
    out="$root/public/banner/hero-loop.mp4"; mkdir -p "$(dirname "$out")"
    # requiere ffmpeg — CRF 28 + escala 1800 + sin audio = loop liviano
    ffmpeg -y -i "$src" -an -vf "scale=1800:-2" -c:v libx264 -crf 28 -preset slow -movflags +faststart "$out"
    ;;
  cert)
    slug="${3:?falta el slug del certificado}"
    mkdir -p "$root/public/certs/thumbs"
    cp "$src" "$root/public/certs/$slug.pdf"
    sips -s format png -Z 560 "$src" --out "$root/public/certs/thumbs/$slug.png" >/dev/null
    out="$root/public/certs/$slug.pdf"
    ;;
  *) echo "tipo desconocido: $kind"; exit 1 ;;
esac

[ -n "$out" ] && [ -f "$out" ] && echo "✓ $(basename "$out") → $(du -h "$out" | cut -f1)"
