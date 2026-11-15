import { readFile } from 'node:fs/promises';
import { Resvg } from '@resvg/resvg-js';
import satori from 'satori';
import sharp from 'sharp';
import { createElement as h } from 'react';
import type { ReactElement } from 'react';
import { resolveDevice } from './devices.js';
import type { DeviceProfile } from './devices.js';
import { loadFonts } from './fonts.js';
import {
  assertLayout,
  computeLayout,
  headlineFontSize,
  headlineWidth,
  HEADLINE_LINE_HEIGHT,
  MAX_HEADLINE_LINES,
} from './layout.js';
import type { CtaSpec, Layout, SplitSpec } from './layout.js';
import type { GroundTone } from './palette.js';
import {
  Cta,
  dataUri,
  Ground,
  Headline,
  headlineStyle,
  LogoRow,
  Phone,
  Seam,
  ShadowLayer,
} from './pieces.js';
import type { SplitTagLabels } from './pieces.js';
import { readPngSize } from './png.js';
import type { PixelSize } from './png.js';

export interface ShotSpec {
  canvas: PixelSize;
  /** The real app capture with Movar on (the top part): PNG bytes or a path to one. */
  capture: Uint8Array | string;
  /** The same screen with Movar off (the bottom part). Same size as `capture`. */
  before: Uint8Array | string;
  /** Where the seam goes, as a share of the screen height. */
  split: SplitSpec;
  /** The seam captions, in the shot's locale. */
  tags: SplitTagLabels;
  ground: GroundTone;
  /** Background image path (PNG/JPG), drawn cover-fit. Flat token colour when absent. */
  background?: string | undefined;
  headline: string;
  /** Ad CTA pill; must not cover screen content. */
  cta?: CtaSpec | undefined;
  /** Force a device profile instead of matching the capture's ratio. */
  device?: DeviceProfile | undefined;
}

export interface ShotPlan {
  layout: Layout;
  captureBytes: Uint8Array;
  beforeBytes: Uint8Array;
}

const BASELINE_TOLERANCE = 0.5;
const MEASURE_SPARE_LINES = 4;

async function loadCapture(capture: Uint8Array | string): Promise<Uint8Array> {
  return typeof capture === 'string' ? new Uint8Array(await readFile(capture)) : capture;
}

function parseBaselines(svg: string): number {
  const ys = [...svg.matchAll(/<text\b[^>]*?\sy="([-\d.]+)"/g)].map((match) => Number(match[1]));
  const distinct: number[] = [];
  for (const y of ys.toSorted((a, b) => a - b)) {
    const last = distinct.at(-1);
    if (last === undefined || y - last > BASELINE_TOLERANCE) distinct.push(y);
  }
  return distinct.length;
}

/**
 * Counts the lines a headline wraps to by rendering it with Satori (glyphs left
 * as `<text>`) and counting distinct text baselines in the SVG it emits.
 */
async function measureHeadlineLines(text: string, canvasWidth: number): Promise<number> {
  const metrics = {
    fontSize: headlineFontSize(canvasWidth),
    lineHeight: Math.round(headlineFontSize(canvasWidth) * HEADLINE_LINE_HEIGHT),
  };
  const width = headlineWidth(canvasWidth);
  const svg = await satori(h('div', { style: { ...headlineStyle(metrics), width } }, text), {
    width,
    height: metrics.lineHeight * (MAX_HEADLINE_LINES + MEASURE_SPARE_LINES),
    fonts: loadFonts(),
    embedFont: false,
  });
  const lines = parseBaselines(svg);
  if (lines === 0) throw new Error('Headline produced no text; is the font loaded?');
  return lines;
}

/** Everything needed to draw a shot, without drawing it. Does not run the guards. */
export async function planShot(spec: ShotSpec): Promise<ShotPlan> {
  const captureBytes = await loadCapture(spec.capture);
  const beforeBytes = await loadCapture(spec.before);
  const capture = readPngSize(captureBytes);
  const device = spec.device ?? resolveDevice(capture.width, capture.height);
  const headlineLines = await measureHeadlineLines(spec.headline, spec.canvas.width);
  const layout = computeLayout({
    canvas: spec.canvas,
    capture,
    beforeCapture: readPngSize(beforeBytes),
    device,
    split: spec.split,
    headlineLines,
    cta: spec.cta,
  });
  return { layout, captureBytes, beforeBytes };
}

async function backgroundUri(
  path: string | undefined,
  size: PixelSize,
): Promise<string | undefined> {
  if (path === undefined) return undefined;
  const fitted = await sharp(path)
    .resize(size.width, size.height, { fit: 'cover', position: 'centre' })
    .png()
    .toBuffer();
  return dataUri('image/png', fitted);
}

/** The split screen picture: the after rows on top, the before rows below, at capture size. */
async function splitScreen(layout: Layout, after: Uint8Array, before: Uint8Array): Promise<Buffer> {
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
      { input: await slice(after, split.afterSlice), left: 0, top: 0 },
      { input: await slice(before, split.beforeSlice), left: 0, top: split.afterSlice.height },
    ])
    .png()
    .toBuffer();
}

/** Draws an already-planned (and checked) layout. */
export async function renderLayout(
  plan: ShotPlan,
  spec: Pick<ShotSpec, 'ground' | 'background' | 'headline' | 'tags'>,
): Promise<Buffer> {
  const { layout, captureBytes, beforeBytes } = plan;
  const { canvas } = layout;
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
    h(ShadowLayer, { placement: layout.phone, canvasWidth: canvas.width, tone }),
    h(Phone, {
      placement: layout.phone,
      canvas,
      captureUri: dataUri('image/png', await splitScreen(layout, captureBytes, beforeBytes)),
    }),
    h(Seam, { layout, labels: spec.tags, tone }),
    layout.cta ? h(Cta, { cta: layout.cta, tone }) : null,
  );
  const svg = await satori(root, { ...canvas, fonts: loadFonts() });
  const png = new Resvg(svg, {
    fitTo: { mode: 'original' },
    font: { loadSystemFonts: false },
  })
    .render()
    .asPng();
  return Buffer.from(png);
}

/** Plans, runs every guard, and draws one shot. Throws `RenderGuardError` on a breach. */
export async function renderShot(spec: ShotSpec): Promise<Buffer> {
  const plan = await planShot(spec);
  assertLayout(plan.layout);
  return renderLayout(plan, spec);
}
