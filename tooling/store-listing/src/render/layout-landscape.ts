/**
 * Pure geometry for the LANDSCAPE canvases (Firefox AMO / Chrome Web Store
 * 1280x800, Mac App Store 2560x1600). Owner layout: logo + headline in a left
 * column, the browser window on the right, split before/after at exactly half,
 * the two captions rotated on the ground beside the window's left edge, each next
 * to its own half. Mirrors the movar.fyi hero.
 *
 * The capture is a real screenshot of a whole browser window, so NO device or
 * fake chrome is drawn: the window gets a small rounded corner and the shadow.
 * The after capture gives the top half INCLUDING its toolbar; the before capture
 * gives the bottom half from just under ITS toolbar (`chromeTop` capture rows),
 * each part from its own page top. Nothing here touches Satori or pixels.
 */
import { RenderGuardError } from './errors.js';
import { MAX_HEADLINE_LINES, MIN_PART_SHARE } from './layout.js';
import type { Rect, Slice, SplitSpec } from './layout.js';
import type { PixelSize } from './png.js';

/* eslint-disable @typescript-eslint/no-magic-numbers -- the proportions below
 * are design numbers, written once as fractions of the canvas width
 * (reference: the 1280 px canvas) so every landscape canvas scales alike. */

const REFERENCE_WIDTH = 1280;
const ref = (px: number): number => px / REFERENCE_WIDTH;

const MIN_SIDE_GAP = ref(48);
const TOP_PAD = ref(48);
const LOGO_MARK = ref(48);
const LOGO_TO_HEADLINE = ref(40);
const COLUMN_WIDTH = ref(372);
const HEADLINE_FONT_SIZE = ref(40);
const HEADLINE_LINE_HEIGHT = 1.08;
/** The window's preferred width; height-limited when its capture is tall. */
const WINDOW_WIDTH = ref(744);
const WINDOW_RADIUS = ref(10);
const SEAM_LINE = ref(4);
const CAPTION_SIZE = ref(22);
const CAPTION_LEADING = 1.5;
/** The caption column's centre, this far left of the window edge. */
const CAPTION_OFFSET = ref(26);
/** A caption's part must be at least this many caption sizes tall to hold its text. */
const CAPTION_MIN_LENGTH = 8;
/** Clear ground wanted between the headline column and the caption column. */
const COLUMN_TO_CAPTION = ref(12);
const ASPECT_TOLERANCE = 0.005;
const OVERLAP_EPSILON = 0.5;

export interface LandscapeLayoutInput {
  canvas: PixelSize;
  /** The after capture (Movar on): a whole browser window. */
  capture: PixelSize;
  /** The before capture (Movar off). Defaults to the after's size. */
  beforeCapture?: PixelSize | undefined;
  /** Rows the after capture's toolbar occupies, in capture px. */
  chromeTop: number;
  /** The before capture's toolbar rows. Defaults to `chromeTop`. */
  beforeChromeTop?: number | undefined;
  split: SplitSpec;
  /** Lines the headline wraps to at the column width (measured, not guessed). */
  headlineLines: number;
}

export interface LandscapeSplit extends SplitSpec {
  afterSlice: Slice;
  beforeSlice: Slice;
  seam: Rect;
  captions: { after: Rect; before: Rect; fontSize: number };
}

export interface LandscapeLayout {
  canvas: PixelSize;
  capture: PixelSize;
  beforeCapture: PixelSize;
  chromeTop: number;
  beforeChromeTop: number;
  minSideGap: number;
  minLogoGap: number;
  logo: { x: number; y: number; markSize: number; fontSize: number };
  headline: Rect & { fontSize: number; lineHeight: number; lines: number };
  /** The browser window: its picture rect and corner radius. */
  window: { rect: Rect; radius: number };
  split: LandscapeSplit;
}

/** Width the headline is wrapped to. */
export function landscapeHeadlineWidth(canvasWidth: number): number {
  return Math.round(canvasWidth * COLUMN_WIDTH);
}

export function landscapeHeadlineMetrics(canvasWidth: number): {
  fontSize: number;
  lineHeight: number;
} {
  const fontSize = Math.round(canvasWidth * HEADLINE_FONT_SIZE);
  return { fontSize, lineHeight: Math.round(fontSize * HEADLINE_LINE_HEIGHT) };
}

function placeWindow(input: LandscapeLayoutInput, px: (f: number) => number): Rect {
  const { canvas, capture } = input;
  const ratio = capture.height / capture.width;
  const gap = px(MIN_SIDE_GAP);
  const heightLimit = (canvas.height - 2 * gap) / ratio;
  const width = Math.floor(Math.min(px(WINDOW_WIDTH), heightLimit, canvas.width - 2 * gap));
  const height = Math.round(width * ratio);
  return {
    x: canvas.width - gap - width,
    y: Math.round((canvas.height - height) / 2),
    width,
    height,
  };
}

function placeSplit(
  input: LandscapeLayoutInput,
  win: Rect,
  beforeChromeTop: number,
  px: (f: number) => number,
): LandscapeSplit {
  const { capture, split } = input;
  const cutPx = Math.round(capture.height * split.cut);
  const lineH = px(SEAM_LINE);
  const seamY = win.y + Math.round((win.height * cutPx) / capture.height);
  const lineTop = seamY - Math.round(lineH / 2);
  // The before part starts under its toolbar; the line's lower half falls on
  // toolbar rows, so it covers none of the before page.
  const halfLineRows = Math.round(((seamY - lineTop) * capture.height) / win.height);
  const fontSize = px(CAPTION_SIZE);
  const column = Math.round(fontSize * CAPTION_LEADING);
  const columnX = win.x - px(CAPTION_OFFSET) - Math.round(column / 2);
  const bottom = win.y + win.height;
  return {
    ...split,
    afterSlice: { y: 0, height: cutPx },
    beforeSlice: {
      y: Math.max(0, beforeChromeTop - halfLineRows),
      height: capture.height - cutPx,
    },
    seam: { x: win.x, y: lineTop, width: win.width, height: lineH },
    captions: {
      after: { x: columnX, y: win.y, width: column, height: lineTop - win.y },
      before: {
        x: columnX,
        y: lineTop + lineH,
        width: column,
        height: bottom - lineTop - lineH,
      },
      fontSize,
    },
  };
}

export function computeLandscapeLayout(input: LandscapeLayoutInput): LandscapeLayout {
  const { canvas, capture, headlineLines } = input;
  const W = canvas.width;
  const px = (fraction: number): number => Math.round(fraction * W);
  const gapSide = px(MIN_SIDE_GAP);
  const metrics = landscapeHeadlineMetrics(W);
  const markSize = px(LOGO_MARK);
  const win = placeWindow(input, px);
  const beforeChromeTop = input.beforeChromeTop ?? input.chromeTop;
  // Every headline starts at the same y: centred on the window as if it had the
  // maximum lines, so a short one hangs from the same line as a long one.
  const reserved = MAX_HEADLINE_LINES * metrics.lineHeight;
  const minTop = px(TOP_PAD) + markSize + px(LOGO_TO_HEADLINE);
  const headlineY = Math.max(minTop, Math.round(win.y + win.height / 2 - reserved / 2));
  return {
    canvas,
    capture,
    beforeCapture: input.beforeCapture ?? capture,
    chromeTop: input.chromeTop,
    beforeChromeTop,
    minSideGap: gapSide,
    minLogoGap: px(LOGO_TO_HEADLINE),
    logo: { x: gapSide, y: px(TOP_PAD), markSize, fontSize: Math.round(markSize * 0.7) },
    headline: {
      x: gapSide,
      y: headlineY,
      width: landscapeHeadlineWidth(W),
      height: headlineLines * metrics.lineHeight,
      ...metrics,
      lines: headlineLines,
    },
    window: { rect: win, radius: px(WINDOW_RADIUS) },
    split: placeSplit(input, win, beforeChromeTop, px),
  };
}

function overlapArea(a: Rect, b: Rect): number {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

function fail(code: ConstructorParameters<typeof RenderGuardError>[0], message: string): never {
  throw new RenderGuardError(code, message);
}

function assertCaptures(layout: LandscapeLayout): void {
  const { capture: a, beforeCapture: b } = layout;
  if (a.width !== b.width || a.height !== b.height) {
    fail(
      'capture-mismatch',
      `before capture is ${b.width}x${b.height} but after is ${a.width}x${a.height}`,
    );
  }
}

function assertWindow(layout: LandscapeLayout): void {
  const { capture, canvas, minSideGap } = layout;
  const { rect } = layout.window;
  const aspectOff = Math.abs(rect.width / rect.height / (capture.width / capture.height) - 1);
  if (aspectOff > ASPECT_TOLERANCE) {
    fail(
      'picture-aspect',
      `window drawn ${rect.width}x${rect.height} is ${(aspectOff * 100).toFixed(2)}% off its ` +
        `${capture.width}x${capture.height} source (limit ${ASPECT_TOLERANCE * 100}%)`,
    );
  }
  const right = canvas.width - (rect.x + rect.width);
  const bottom = canvas.height - (rect.y + rect.height);
  if (rect.x < 0 || rect.y < 0 || right < 0 || bottom < 0) {
    fail(
      'window-clipped',
      `the window must stand whole inside the canvas (${JSON.stringify(rect)})`,
    );
  }
  const side = Math.min(right, rect.y, bottom);
  if (side < minSideGap - 1) {
    fail('side-gap', `the window is ${side} px from a canvas edge; minimum is ${minSideGap} px`);
  }
}

/** Both parts keep a readable share, the toolbar fits in the after part, the before slice lies inside its capture. */
function assertSplit(layout: LandscapeLayout): void {
  const { split, capture, beforeCapture, chromeTop, beforeChromeTop } = layout;
  if (split.cut < MIN_PART_SHARE || split.cut > 1 - MIN_PART_SHARE + 1e-9) {
    fail(
      'split-cut',
      `the seam sits at ${(split.cut * 100).toFixed(1)}% of the window; each part needs ` +
        `at least ${MIN_PART_SHARE * 100}%`,
    );
  }
  if (chromeTop < 0 || beforeChromeTop < 0 || chromeTop >= split.afterSlice.height) {
    fail(
      'chrome-top',
      `chromeTop ${chromeTop} must be 0..${split.afterSlice.height - 1} (the toolbar sits in the top part)`,
    );
  }
  const end = split.beforeSlice.y + split.beforeSlice.height;
  if (split.afterSlice.height > capture.height || end > beforeCapture.height) {
    fail(
      'split-cut',
      `the before part reads rows ${split.beforeSlice.y}..${end} of a ${beforeCapture.height} px capture ` +
        `(its toolbar is ${beforeChromeTop} rows)`,
    );
  }
}

function assertHeadline(layout: LandscapeLayout): void {
  const { headline, logo } = layout;
  if (headline.lines > MAX_HEADLINE_LINES) {
    fail(
      'headline-lines',
      `headline wraps to ${headline.lines} lines; maximum is ${MAX_HEADLINE_LINES}`,
    );
  }
  const room = headline.y - (logo.y + logo.markSize);
  if (room < layout.minLogoGap - 1) {
    fail(
      'headline-overlap',
      `headline starts ${room} px under the logo; minimum is ${layout.minLogoGap} px`,
    );
  }
  const bottom = headline.y + headline.height;
  if (bottom > layout.canvas.height - layout.minSideGap + 1) {
    fail('headline-overlap', `headline ends at y ${bottom}, past the bottom gap`);
  }
  if (headline.x + headline.width > layout.window.rect.x) {
    fail(
      'window-overlap',
      `the headline column ends at x ${headline.x + headline.width}, inside the window column (from x ${layout.window.rect.x})`,
    );
  }
}

/** Captions stand on the ground: inside the canvas, clear of the window and headline, long enough for their text. */
function assertCaptions(layout: LandscapeLayout): void {
  const { captions } = layout.split;
  const gap = Math.round(layout.canvas.width * COLUMN_TO_CAPTION);
  const need = Math.round(captions.fontSize * CAPTION_MIN_LENGTH);
  for (const rect of [captions.after, captions.before]) {
    const clash =
      rect.x < 0 ||
      rect.height < need ||
      overlapArea(rect, layout.window.rect) > OVERLAP_EPSILON ||
      overlapArea(rect, layout.headline) > OVERLAP_EPSILON ||
      rect.x < layout.headline.x + layout.headline.width + gap;
    if (clash) {
      fail(
        'caption-room',
        `a seam caption at x ${rect.x}..${rect.x + rect.width}, ${rect.height} px tall has no room ` +
          `on the ground left of the window (from x ${layout.window.rect.x}; needs ${need} px)`,
      );
    }
  }
}

/** Runs every landscape guard; throws `RenderGuardError` on the first breach. */
export function assertLandscapeLayout(layout: LandscapeLayout): void {
  assertCaptures(layout);
  assertWindow(layout);
  assertSplit(layout);
  assertHeadline(layout);
  assertCaptions(layout);
}
