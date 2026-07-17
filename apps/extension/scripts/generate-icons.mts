/*
 * Rasterises apps/extension/src/public/icon.svg to PNG at:
 *
 *   - The four manifest sizes (16, 32, 48, 128) under
 *     `src/public/icon/`, loaded by the WebExtension manifest.
 *   - The per-store pictograms under `store-assets/{firefox,chrome}/`,
 *     uploaded to AMO and the Chrome Web Store listings.
 *   - The Safari native app icons under
 *     `safari/.../Assets.xcassets/AppIcon.appiconset/` — platform-correct
 *     (macOS dark squircle, iOS/App Store full-bleed), replacing Apple's
 *     `safari-web-extension-converter` silver-plate placeholder.
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
import { ACTION_ICON_STATES, actionIconSvg, defaultActionIconSvg } from '@movar/ui/action-icon-svg';

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

// ---------------------------------------------------------------------------
// Per-state toolbar icons — browser.action.setIcon (packages/ui action-icon).
//
// The stateful toolbar button (packages/ui/src/action-icon-svg.ts) is rasterised
// here to packaged PNGs under `src/public/icon/state/<state>-<size>.png`. The MV3
// service worker has no OffscreenCanvas, so `background.ts` swaps the icon per
// tab by `path:` to these. Distinct from the base icon.svg family above (the
// manifest `default_icon` + store pictograms), which stays the plain brand mark
// so the store/Safari icons never gain a transient state badge.
//
// 16/32 cover the toolbar at 1×/2×; 48 mirrors the manifest `icons` set for
// crisp high-DPI. Each state's SVG is self-contained fixed-hex (no CSS), so it
// rasterises the same as icon.svg through librsvg.
// ---------------------------------------------------------------------------
const stateIconDir = path.resolve(here, '..', 'src', 'public', 'icon', 'state');
const stateIconSizes = [16, 32, 48] as const;

await mkdir(stateIconDir, { recursive: true });
await Promise.all(
  ACTION_ICON_STATES.flatMap(({ key }) =>
    stateIconSizes.map(async (size) => {
      const buffer = await sharp(Buffer.from(actionIconSvg(key)), { density: 384 })
        .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png({ compressionLevel: 9 })
        .toBuffer();
      const out = path.resolve(stateIconDir, `${key}-${size}.png`);
      await writeFile(out, buffer);
      console.log(`wrote ${out}`);
    }),
  ),
);

// ---------------------------------------------------------------------------
// Toolbar default_icon — the manifest fallback (`action.default_icon` in
// wxt.config.ts), shown on any tab Movar hasn't painted a state onto (a
// background tab at pause time, a still-loading / non-web tab, or any tab after
// the MV3 worker was evicted). Rendered from the same action-icon family (a
// neutral resting ring, no badge) so an unresolved tab shows the tile+ring
// rather than the ring-less brand mark. Sizes mirror the `default_icon` map in
// wxt.config.ts.
// ---------------------------------------------------------------------------
const defaultIconDir = path.resolve(here, '..', 'src', 'public', 'icon');
const defaultIconSizes = [16, 32, 48] as const;

await Promise.all(
  defaultIconSizes.map(async (size) => {
    const buffer = await sharp(Buffer.from(defaultActionIconSvg()), { density: 384 })
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png({ compressionLevel: 9 })
      .toBuffer();
    const out = path.resolve(defaultIconDir, `default-${size}.png`);
    await writeFile(out, buffer);
    console.log(`wrote ${out}`);
  }),
);

// ---------------------------------------------------------------------------
// Safari native app icons (macOS Dock/Finder + iOS/App Store).
//
// Distinct from the web-extension/toolbar icon above. Apple's
// `safari-web-extension-converter` scaffolded these as a placeholder: the
// brand tile dropped onto a glossy white→silver plate (an icon-within-an-icon).
// We regenerate them from the same brand mark, platform-correct:
//
//   - iOS / App Store (the 1024 `universal` icon): full-bleed — the brand
//     `#1C1917` fills the whole square, fully OPAQUE (App Store rejects any
//     alpha channel). The system masks the corners.
//   - macOS (`mac` idiom, 16–512 @1x/@2x): the brand tile IS the icon — a dark
//     squircle on a transparent canvas with the standard ~10% margin and a
//     soft contact shadow, per Apple's macOS icon grid. No plate.
//
// Filenames + sizes stay in lockstep with AppIcon.appiconset/Contents.json.
// ---------------------------------------------------------------------------

// The mark's foreground — the "r" glyph and the green dot — lifted verbatim
// from icon.svg (everything after the background tile rect) so the app icons
// can never drift from the web-extension icon.
const foreground = svg
  .toString('utf8')
  .replace(/^[\s\S]*?<rect\b[^>]*?\/>\s*/, '')
  .replace(/<\/svg>\s*$/, '')
  .trim();

// iOS / App Store: brand fills the square edge-to-edge, opaque.
const iosIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="1024" height="1024"><rect x="0" y="0" width="128" height="128" fill="#1C1917"/>${foreground}</svg>`;

// macOS: dark squircle on the Big Sur grid (824/1024 ≈ 80.5% — a ~10% margin)
// with a soft contact shadow. The foreground is mapped from the brand tile box
// [6,122] onto the squircle box [100,924] via translate+scale (824/116 ≈
// 7.10345). The corner radius mirrors the brand tile's ratio (28/116) so the
// Dock icon's corners match the toolbar icon's.
const macIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <defs>
    <filter id="shadow" x="-25%" y="-25%" width="150%" height="150%">
      <feDropShadow dx="0" dy="12" stdDeviation="24" flood-color="#000000" flood-opacity="0.30"/>
    </filter>
  </defs>
  <rect x="100" y="100" width="824" height="824" rx="199" fill="#1C1917" filter="url(#shadow)"/>
  <g transform="translate(57.379,57.379) scale(7.10345)">${foreground}</g>
</svg>`;

// #1C1917 as RGB — the opaque backing for the App Store icon (no alpha).
const brandRgb = { r: 28, g: 25, b: 23 };

const appIconDir = path.resolve(
  here,
  '..',
  'safari',
  'Movar',
  'Shared (App)',
  'Assets.xcassets',
  'AppIcon.appiconset',
);

interface AppIconJob {
  filename: string;
  /** Output edge length in pixels. */
  size: number;
  svg: string;
  /** App Store icons must carry no alpha channel; macOS icons stay transparent. */
  opaque: boolean;
}

// The macOS asset catalog emits each base size at @1x and @2x (2× the pixels).
const macBaseSizes = [16, 32, 128, 256, 512] as const;
const appIconJobs: AppIconJob[] = [
  { filename: 'universal-icon-1024@1x.png', size: 1024, svg: iosIconSvg, opaque: true },
  ...macBaseSizes.flatMap((base): AppIconJob[] => [
    { filename: `mac-icon-${base}@1x.png`, size: base, svg: macIconSvg, opaque: false },
    { filename: `mac-icon-${base}@2x.png`, size: base * 2, svg: macIconSvg, opaque: false },
  ]),
];

await mkdir(appIconDir, { recursive: true });
await Promise.all(
  appIconJobs.map(async (job) => {
    let pipeline = sharp(Buffer.from(job.svg), { density: 384 }).resize(job.size, job.size, {
      fit: 'contain',
      background: job.opaque ? brandRgb : { r: 0, g: 0, b: 0, alpha: 0 },
    });
    // Flatten the App Store icon onto opaque brand so the PNG has no alpha
    // channel (Apple rejects icons with transparency).
    if (job.opaque) pipeline = pipeline.flatten({ background: brandRgb });
    const buffer = await pipeline.png({ compressionLevel: 9 }).toBuffer();
    const out = path.resolve(appIconDir, job.filename);
    await writeFile(out, buffer);
    console.log(`wrote ${out}`);
  }),
);
