#!/usr/bin/env bash
# Derives web brand assets from the private logo source sheet.
# Only crops and resizes (Lanczos); no redraw, recolor or retouch.
# The source sheet is NOT versioned; provide it locally (see public/brand/README.md).
# Usage: HACHISKY_LOGO_SOURCE=/path/to/source.png apps/web/scripts/derive-brand-assets.sh
#        (defaults to "LOGO HACHISKY.png" at the repository root)
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
web="$(cd "$here/.." && pwd)"
src="${HACHISKY_LOGO_SOURCE:-$web/../../LOGO HACHISKY.png}"
brand="$web/public/brand"
expected_sha256="5648ac7f611d6a99d5e7596c9548b637fd46392cef823c6cec253f3ecc3412b2"

[ -f "$src" ] || {
  echo "Missing private logo source: $src" >&2
  echo "Provide the original sheet locally or set HACHISKY_LOGO_SOURCE." >&2
  exit 1
}
actual_sha256="$(sha256sum "$src" | cut -d' ' -f1)"
[ "$actual_sha256" = "$expected_sha256" ] || {
  echo "Logo source sha256 mismatch: expected $expected_sha256, got $actual_sha256" >&2
  exit 1
}
mkdir -p "$brand"

# Crop rectangles (WxH+X+Y) on the 1536x1024 source sheet.
RECT_MARK="632x625+25+30"
RECT_ICON="316x316+62+655"

if command -v magick >/dev/null 2>&1; then
  im=(magick)
elif command -v convert >/dev/null 2>&1; then
  im=(convert)
else
  echo "ImageMagick not found (magick/convert). Install it or run inside an image that ships it." >&2
  exit 1
fi

# $1 crop rect, $2 output width (height keeps aspect) or WxH, $3 output.
derive() {
  "${im[@]}" "$src" -crop "$1" +repage -filter Lanczos -resize "$2" \
    -strip -define png:compression-level=9 "$3"
}

derive "$RECT_MARK" 512x "$brand/hachisky-mark.png"
derive "$RECT_ICON" 256x256! "$web/app/icon.png"
derive "$RECT_ICON" 180x180! "$web/app/apple-icon.png"

echo "Derived brand assets from: $src"
sha256sum "$brand"/*.png "$web/app/icon.png" "$web/app/apple-icon.png"
