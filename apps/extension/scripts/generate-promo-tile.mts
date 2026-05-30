/*
 * Rasterises a 440×280 promo tile for the Chrome Web Store listing into
 * `apps/extension/store-assets/chrome/promo-tile-440x280.png`.
 *
 * The tile composes the brand mark (an inline copy of the same `r` +
 * green accent dot used in `src/public/icon.svg`) with the wordmark
 * `Movar` and the tagline `Keep the internet in your language.` over the
 * brand's dark `#1C1917` background. Layout matches the marketing site's
 * hero composition so the listing reads as one brand.
 *
 * Sharp → libvips → librsvg, same render path as the manifest icons (see
 * `generate-icons.mts`). Manrope must be installed system-wide for
 * pixel-accurate text; otherwise libvips falls back to the system
 * sans-serif. CWS does not enforce pixel-exact typography, so the
 * fallback path is acceptable in a pinch.
 *
 * Why a separate script: this is a one-off tile aimed at one store
 * (Chrome) — folding it into `generate-icons.mts` would muddy that
 * script's contract (rasterise every icon size from `icon.svg`).
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(here, '..', 'store-assets', 'chrome');
const outPath = path.resolve(outDir, 'promo-tile-440x280.png');

// SVG composed at 880×560 (2× the final size) so libvips downsamples
// rather than upsamples — keeps the text edges crisp at 440×280.
const W = 880;
const H = 560;

// Brand-mark side: square, vertically centred, ~⅓ of the tile width.
// The mark uses the same 128-unit viewBox as src/public/icon.svg so the
// inner shapes stay perfectly proportional.
const MARK_SIZE = 280;
const MARK_X = 50;
const MARK_Y = (H - MARK_SIZE) / 2;
const MARK_SCALE = MARK_SIZE / 128;

// Text block: wordmark on top, two-line tagline below. Starts after the
// mark with a generous gap so the tile reads as two clear elements.
const TEXT_X = MARK_X + MARK_SIZE + 60;
const TEXT_TOP = 200;

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <rect width="${W}" height="${H}" fill="#1C1917"/>

  <!-- Brand mark: identical proportions to src/public/icon.svg. -->
  <g transform="translate(${MARK_X} ${MARK_Y}) scale(${MARK_SCALE})">
    <rect x="6" y="6" width="116" height="116" rx="28" fill="#0F0E0D" stroke="#272220" stroke-width="2"/>
    <text
      x="56"
      y="100"
      text-anchor="middle"
      font-family="Manrope, sans-serif"
      font-weight="800"
      font-size="96"
      fill="#FFFFFF"
      letter-spacing="-0.02em"
    >r</text>
    <circle cx="89.6" cy="90.4" r="9.6" fill="#15803D"/>
  </g>

  <!-- Wordmark + two-line tagline. Two lines because at 440×280 a single
       line of 36px text overflows the right edge before the period. -->
  <g transform="translate(${TEXT_X} ${TEXT_TOP})">
    <text
      x="0"
      y="0"
      font-family="Manrope, sans-serif"
      font-weight="800"
      font-size="96"
      fill="#FFFFFF"
      letter-spacing="-0.04em"
    >Movar<tspan fill="#15803D">.</tspan></text>
    <text
      x="0"
      y="60"
      font-family="Manrope, sans-serif"
      font-weight="500"
      font-size="32"
      fill="#A8A29E"
      letter-spacing="-0.01em"
    >
      <tspan x="0" dy="40">Keep the internet</tspan>
      <tspan x="0" dy="44">in your language.</tspan>
    </text>
  </g>
</svg>`;

await mkdir(outDir, { recursive: true });
const buffer = await sharp(Buffer.from(svg), { density: 192 })
  .resize(440, 280, { fit: 'fill' })
  .png({ compressionLevel: 9 })
  .toBuffer();
await writeFile(outPath, buffer);
console.log(`wrote ${outPath}`);
