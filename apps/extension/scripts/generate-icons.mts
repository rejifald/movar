/*
 * Rasterises apps/extension/src/public/icon.svg to PNG at:
 *
 *   - The four manifest sizes (16, 32, 48, 128) under
 *     `src/public/icon/`, loaded by the WebExtension manifest.
 *   - The per-store pictograms under `store-assets/{firefox,chrome}/`,
 *     uploaded to AMO and the Chrome Web Store listings.
 *
 * Sharp uses libvips → librsvg → pango → fontconfig for SVG text
 * rendering; if Manrope is not installed system-wide, the fallback
 * sans-serif is used. Install Manrope (e.g., from
 * node_modules/@fontsource/manrope/files/) for pixel-accurate Manrope
 * output.
 *
 * Why this lives in the icon script (not Storybook): Sharp → libvips is
 * markedly higher quality than browser rasterisation at small sizes
 * (decision #4 in `store-assets/STORYBOOK-PIPELINE-PLAN.md`). Folding
 * the store pictograms into the same script keeps the single rasteriser
 * for every PNG sourced from the SVG.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const here = path.dirname(fileURLToPath(import.meta.url));
const sourceSvg = path.resolve(here, '..', 'src', 'public', 'icon.svg');
const svg = await readFile(sourceSvg);

/**
 * Targets keyed by output directory. Each entry lists the sizes to
 * emit; the size becomes the filename's numeric prefix (`{size}.png` for
 * the manifest pass, `icon-{size}.png` for the store passes — matches
 * the conventions on AMO and the Chrome Web Store dashboards).
 */
interface Target {
  /** Absolute directory to write PNGs into. */
  outDir: string;
  /** Filename pattern. `{size}` is substituted with each value below. */
  filename: (size: number) => string;
  /** Pixel sizes to emit. */
  sizes: readonly number[];
}

const targets: Target[] = [
  // Manifest icons. These are loaded by `wxt.config.ts` and shipped in
  // the extension zip. Keep size set in sync with the `icons` map in
  // `wxt.config.ts` — changing one without the other ships an empty
  // icon in some surface.
  {
    outDir: path.resolve(here, '..', 'src', 'public', 'icon'),
    filename: (size) => `${size}.png`,
    sizes: [16, 32, 48, 128],
  },
  // AMO listing pictograms. The dashboard reads the 128 as the canonical
  // icon and shows 32/64 in scattered places (sidebar, recommendations).
  // Emitting all three locks in the highest-fidelity raster Sharp can
  // produce rather than letting AMO downsample our 128 for the smaller
  // surfaces.
  {
    outDir: path.resolve(here, '..', 'store-assets', 'firefox'),
    filename: (size) => `icon-${size}.png`,
    sizes: [32, 64, 128],
  },
  // Chrome Web Store pictogram. CWS only needs the 128 from the icon
  // family (everything else on its listing is screenshot / promo-tile
  // surface area).
  {
    outDir: path.resolve(here, '..', 'store-assets', 'chrome'),
    filename: (size) => `icon-${size}.png`,
    sizes: [128],
  },
];

await Promise.all(
  targets.flatMap((target) => {
    return target.sizes.map(async (size) => {
      await mkdir(target.outDir, { recursive: true });
      const buffer = await sharp(svg, { density: 384 })
        .resize(size, size, {
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .png({ compressionLevel: 9 })
        .toBuffer();
      const out = path.resolve(target.outDir, target.filename(size));
      await writeFile(out, buffer);

      console.log(`wrote ${out}`);
    });
  }),
);
