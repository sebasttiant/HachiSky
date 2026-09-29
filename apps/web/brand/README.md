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
| `public/brand/hachisky-mark-96.png` | 632x625+25+30 | 96x95 (16,822 B) | `9c451e3d0769d91ae8e67ab5cf625b85ea648d5f345218846ec0caa468802501` |
| `public/brand/hachisky-mark-144.png` | 632x625+25+30 | 144x142 (34,889 B) | `be333e70061a76ef50b73823f96a1b5f412829faebba88ad4909f1a5bd87c154` |
| `app/icon.png` | 316x316+62+655 | 96x96 (19,091 B) | `2bb07852da2a6a62fae66504f92aed7411e8bd8a4e08695283f6223a2eac2362` |
| `app/apple-icon.png` | 316x316+62+655 | 180x180 (20,240 B) | `a5ab6082959e8c5df29c48667514352bc3c7bbd9f9f8cfb9fa6cefc07db1e54e` |

The header mark is shown at 48 px and the report mark at 56 px; the 96/144 px
files are selected with `srcSet` for 1x/2x/3x screens. `apple-icon.png` is an
8-bit palette PNG (254 colors, no dithering, opaque) to cut it from ~57 KB to
~20 KB; it was compared against the truecolor version at 300% (PSNR ~37.9 dB)
with no visible difference. The other files are truecolor.
The script prints the current hashes; re-run it to verify.

## Quality review (honest)

- The source is a 1536x1024 sheet, so every derivative is resolution-limited.
  The mark is a 632 px crop downscaled to 96/144 px and the app icon source
  square is only ~316 px downscaled to 96/180 px. None is upscaled.
- All outputs are opaque with a near-white background (about 254,254,254).
  There is NO transparency; use them on white or very light surfaces. The app
  icon has white (not transparent) rounded-square corners.
- The source shows faint JPEG-like halo noise around the fur and letters; it is
  visible only when magnified or on tinted surfaces.
- Only the derivatives the app uses are generated and versioned. The site
  header and the report sheet use the mark plus a live HTML wordmark, so no
  tagline is rendered at an illegible size. A horizontal logo (crop
  `1500x603+25+35`) and a 512 px mark were evaluated and dropped because the
  app does not use them.
- Not suitable as-is for: dark backgrounds, print at large size, or a
  maskable/transparent PWA icon. A vector or transparent master is
  recommended before those uses.
