/**
 * Landscape framing (desktop 1280x800, mac 2560x1600): a real browser-window
 * capture split before/after, logo + headline on the left. Same Satori + resvg
 * pipeline, ground, palette, fonts and pieces as the portrait renderer.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import satori from 'satori';
import sharp from 'sharp';
import { createElement as h } from 'react';
import type { ReactElement } from 'react';
import { loadFonts } from './fonts.js';
import {
  assertLandscapeLayout,
  computeLandscapeLayout,
  landscapeHeadlineMetrics,
  landscapeHeadlineWidth,
} from './layout-landscape.js';
import type { LandscapeLayout } from './layout-landscape.js';
import type { SplitSpec } from './layout.js';
import type { GroundTone } from './palette.js';
import { dataUri, Ground, Headline, LogoRow, Seam, ShadowLayer } from './pieces.js';
import type { SplitTagLabels } from './pieces.js';
import { readPngSize } from './png.js';
import type { PixelSize } from './png.js';
import { measureHeadlineLinesAt } from './render.js';

export interface LandscapeShotSpec {
  canvas: PixelSize;
  /** The real browser-window capture with Movar on (the top half, toolbar included). */
  capture: Uint8Array | string;
  /** The same window with Movar off (the bottom half, from under its toolbar). */
  before: Uint8Array | string;
  /** The toolbar height in capture px; see `readChromeTop`. */
  chromeTop: number;
  /** The before capture's toolbar height; defaults to `chromeTop`. */
  beforeChromeTop?: number | undefined;
  split: SplitSpec;
  tags: SplitTagLabels;
  ground: GroundTone;
  background?: string | undefined;
  headline: string;
}

export interface LandscapePlan {
  layout: LandscapeLayout;
  captureBytes: Uint8Array;
  beforeBytes: Uint8Array;
}

/**
 * The toolbar height of a capture, from its `<name>.json` sidecar
 * (`{ "chromeTop": 87 }`), or undefined when there is no sidecar.
 */
export async function readChromeTop(capturePath: string): Promise<number | undefined> {
  const sidecar = path.join(
    path.dirname(capturePath),
    `${path.basename(capturePath, path.extname(capturePath))}.json`,
  );
  let raw: string;
  try {
    raw = await readFile(sidecar, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
  const value = (JSON.parse(raw) as { chromeTop?: unknown }).chromeTop;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new Error(`${sidecar}: chromeTop must be a non-negative integer, got ${String(value)}`);
  }
  return value;
}

async function load(input: Uint8Array | string): Promise<Uint8Array> {
  return typeof input === 'string' ? new Uint8Array(await readFile(input)) : input;
}

/** Everything needed to draw a landscape shot, without drawing it. Does not run the guards. */
export async function planLandscapeShot(spec: LandscapeShotSpec): Promise<LandscapePlan> {
  const captureBytes = await load(spec.capture);
  const beforeBytes = await load(spec.before);
  const headlineLines = await measureHeadlineLinesAt(
    spec.headline,
    landscapeHeadlineMetrics(spec.canvas.width),
    landscapeHeadlineWidth(spec.canvas.width),
  );
  const layout = computeLandscapeLayout({
    canvas: spec.canvas,
    capture: readPngSize(captureBytes),
    beforeCapture: readPngSize(beforeBytes),
    chromeTop: spec.chromeTop,
    beforeChromeTop: spec.beforeChromeTop,
    split: spec.split,
    headlineLines,
  });
  return { layout, captureBytes, beforeBytes };
}

async function backgroundUri(
  file: string | undefined,
  size: PixelSize,
): Promise<string | undefined> {
  if (file === undefined) return undefined;
  const fitted = await sharp(file)
    .resize(size.width, size.height, { fit: 'cover', position: 'centre' })
    .png()
    .toBuffer();
  return dataUri('image/png', fitted);
}

/** The window picture: after rows on top (toolbar included), before rows below, at capture size. */
async function splitWindow(plan: LandscapePlan): Promise<Buffer> {
  const { layout, captureBytes, beforeBytes } = plan;
  const { capture, split } = layout;
  const slice = async (bytes: Uint8Array, rows: { y: number; height: number }): Promise<Buffer> =>
    sharp(bytes)
      .extract({ left: 0, top: rows.y, width: capture.width, height: rows.height })
      .png()
      .toBuffer();
  return sharp({
    create: { width: capture.width, height: capture.height, channels: 4, background: '#ffffff' },
  })
    .composite([
      { input: await slice(captureBytes, split.afterSlice), left: 0, top: 0 },
      { input: await slice(beforeBytes, split.beforeSlice), left: 0, top: split.afterSlice.height },
    ])
    .png()
    .toBuffer();
}

/** Draws an already-planned (and checked) landscape layout. */
export async function renderLandscapeLayout(
  plan: LandscapePlan,
  spec: Pick<LandscapeShotSpec, 'ground' | 'background' | 'headline' | 'tags'>,
): Promise<Buffer> {
  const { layout } = plan;
  const { canvas } = layout;
  const { rect, radius } = layout.window;
  const tone = spec.ground;
  const root: ReactElement = h(
    'div',
    {
      style: { display: 'flex', position: 'relative', width: canvas.width, height: canvas.height },
    },
    h(Ground, {
      tone,
      width: canvas.width,
      height: canvas.height,
      imageUri: await backgroundUri(spec.background, canvas),
    }),
    h(LogoRow, { layout, tone }),
    h(Headline, { layout, text: spec.headline, tone }),
    h(ShadowLayer, {
      placement: { phone: rect, shape: { bodyRadius: radius } },
      canvasWidth: canvas.width,
      tone,
    }),
    h('img', {
      src: dataUri('image/png', await splitWindow(plan)),
      width: rect.width,
      height: rect.height,
      style: {
        position: 'absolute',
        left: rect.x,
        top: rect.y,
        width: rect.width,
        height: rect.height,
        borderRadius: radius,
      },
    }),
    h(Seam, { layout, labels: spec.tags, tone }),
  );
  const svg = await satori(root, { ...canvas, fonts: loadFonts() });
  const png = new Resvg(svg, { fitTo: { mode: 'original' }, font: { loadSystemFonts: false } })
    .render()
    .asPng();
  // Same lossless re-encode as the portrait shots.
  return sharp(png).png({ compressionLevel: 9, adaptiveFiltering: true, effort: 10 }).toBuffer();
}

/** Plans, runs every guard, and draws one landscape shot. */
export async function renderLandscapeShot(spec: LandscapeShotSpec): Promise<Buffer> {
  const plan = await planLandscapeShot(spec);
  assertLandscapeLayout(plan.layout);
  return renderLandscapeLayout(plan, spec);
}
