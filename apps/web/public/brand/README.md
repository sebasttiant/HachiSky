# HachiSky brand assets

All files are derived by `apps/web/scripts/derive-brand-assets.sh` from the
approved logo sheet (1536x1024, RGB, no alpha). Operations: crop and Lanczos
resize only; no redraw, recolor or retouch.

The original sheet is private and is **not** part of this repository (it is
listed in the root `.gitignore`). The application builds and runs only from the
versioned derivatives below; the original is needed solely to regenerate them.

- Source sha256: `5648ac7f611d6a99d5e7596c9548b637fd46392cef823c6cec253f3ecc3412b2`
- Tool: ImageMagick (`magick` or `convert`), `-strip`, PNG compression 9.

## Regenerating the derivatives

1. Obtain the original sheet from the brand owner (it is never committed).
2. Verify it: `sha256sum <sheet>` must print the source sha256 above.
3. Either place it as `LOGO HACHISKY.png` at the repository root (ignored by
   Git) or point the script to it:
   `HACHISKY_LOGO_SOURCE=<sheet> apps/web/scripts/derive-brand-assets.sh`
4. The script refuses to run if the file is missing or its sha256 differs, and
   prints the output hashes; compare them with the table below.
5. Review the outputs visually before committing them.

| Output | Crop rect (WxH+X+Y) | Size | sha256 |
| --- | --- | --- | --- |
| `public/brand/hachisky-mark.png` | 632x625+25+30 | 512x506 | `591a3df88c74530af2ab02a47bfa3e6da2f56c0be2978772ac7b06da264db44d` |
| `app/icon.png` | 316x316+62+655 | 256x256 | `92a4211cb223720ac1dbe90c74cce920c388f52ffc5a859bc05e88689b078213` |
| `app/apple-icon.png` | 316x316+62+655 | 180x180 | `c8c794a82131c9ed1cdcd5da1f2abd293691335d349e5ff08e10cbfe84bbab7b` |

The script prints the current hashes; re-run it to verify.

## Quality review (honest)

- The source is a 1536x1024 sheet, so every derivative is resolution-limited.
  The mark is a 632 px crop resized to 512 (mild downscale). The app icon source square is
  only ~316 px: `icon.png` (256) is a slight downscale; `apple-icon.png` (180)
  is a downscale. None is upscaled beyond the source.
- All outputs are opaque RGB with a near-white background (about 254,254,254).
  There is NO transparency; use them on white or very light surfaces. The app
  icon has white (not transparent) rounded-square corners.
- The source shows faint JPEG-like halo noise around the fur and letters; it is
  visible only when magnified or on tinted surfaces.
- Only the derivatives the app uses are generated and versioned. The site
  header and the report sheet use `hachisky-mark.png` plus a live HTML
  wordmark, so no tagline is rendered at an illegible size. A horizontal
  logo (crop `1500x603+25+35`, which stops at y=638 to avoid the logo row
  below) was evaluated and dropped because the app does not use it.
- Not suitable as-is for: dark backgrounds, print at large size, or a
  maskable/transparent PWA icon. A vector or transparent master is
  recommended before those uses.
