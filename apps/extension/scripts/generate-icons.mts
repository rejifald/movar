/*
 * Rasterizes apps/extension/src/public/icon.svg to PNG at the four manifest
 * sizes (16, 32, 48, 128). Sharp uses libvips → librsvg → pango → fontconfig
 * for SVG text rendering; if Manrope is not installed system-wide, the
 * fallback sans-serif is used. Install Manrope (e.g., from
 * node_modules/@fontsource/manrope/files/) for pixel-accurate Manrope output.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const SIZES = [16, 32, 48, 128] as const;

const here = path.dirname(fileURLToPath(import.meta.url));
const sourceSvg = path.resolve(here, '..', 'src', 'public', 'icon.svg');
const outDir = path.resolve(here, '..', 'src', 'public', 'icon');

const svg = await readFile(sourceSvg);
await mkdir(outDir, { recursive: true });

await Promise.all(
  SIZES.map(async (size) => {
    const buffer = await sharp(svg, { density: 384 })
      .resize(size, size, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png({ compressionLevel: 9 })
      .toBuffer();
    const target = path.resolve(outDir, `${size}.png`);
    await writeFile(target, buffer);
    // eslint-disable-next-line no-console
    console.log(`wrote ${target}`);
  }),
);
