/**
 * Pure geometry: where everything goes on a canvas, and the guards that refuse
 * a layout that breaks a hard rule. Nothing here touches Satori or pixels.
 *
 * The halves composition (owner, 2026-11-15): ONE whole phone, centred, standing
 * on the bottom gap. Its screen is split across by a seam: the top part is the
 * AFTER capture (Movar on), the bottom part the BEFORE capture (Movar off), both
 * undimmed. Each shot picks how the before part is sourced (`SplitSpec.mode`):
 *
 * - `tops`: each part shows its own page from the top, so the reader compares
 *   the same opening lines in two languages (the before part starts under the
 *   status bar, which the after part already shows).
 * - `region`: both parts show the same screen region, cut at one line, for a
 *   page whose top is identical in both states (YouTube's feed): the cut runs
 *   through the card Movar conceals.
 *
 * The seam is a dark band across the screen carrying both tags at its left edge,
 * "with Movar ↑" then "without ↓", so no tag covers page content. The
 * logo sits at one fixed y on every shot; the headline sits tight above the
 * phone, and any spare height goes between the logo and the headline.
 */
import { RenderGuardError } from './errors.js';
import { phoneShape } from './devices.js';
import type { DeviceProfile, PhoneShape } from './devices.js';
import type { PixelSize } from './png.js';

/* eslint-disable @typescript-eslint/no-magic-numbers -- the proportions below
 * are the owner's design numbers, written once as fractions of the canvas width
 * (reference: the 1320 px App Store canvas) so every canvas scales alike. */

const REFERENCE_WIDTH = 1320;
/** Fraction-of-width helper: `ref(84)` is 84 px on a 1320 px canvas. */
const ref = (px: number): number => px / REFERENCE_WIDTH;

const MIN_SIDE_GAP = ref(84);
/** The phone's screen width (owner's halves draft: 940 px at 1320). */
const SCREEN_WIDTH = ref(940);
const HEADLINE_FONT_SIZE = ref(98);
export const HEADLINE_LINE_HEIGHT = 1.08;
export const MAX_HEADLINE_LINES = 3;
const GAP_TO_PHONE = ref(48);
const TOP_PAD = ref(72);
const LOGO_MARK = ref(84);
/** Minimum logo-to-headline gap; the spare height of a short headline lands here. */
const LOGO_TO_HEADLINE = ref(60);
const TAG_HEIGHT = ref(48);
/** Band padding around the tags, and their inset from the screen's left edge. */
const BAND_PAD = ref(12);
const TAG_INSET = ref(24);
/**
 * The iOS status bar (with the Dynamic Island) as a share of the capture height:
 * 186 px of a 2868 px iPhone 6.9" capture. A `tops` before part starts below it.
 */
export const STATUS_BAR_SHARE = 186 / 2868;
/** Each part must keep at least this share of the screen, or it stops reading as a page. */
export const MIN_PART_SHARE = 0.25;
const ASPECT_TOLERANCE = 0.005;
const BODY_RATIO_TOLERANCE = 0.005;
const OVERLAP_EPSILON = 0.5;

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CtaSpec extends Rect {
  label: string;
}

export type SplitMode = 'tops' | 'region';

/** How a shot's screen is split; `cut` is where the after part ends, as a share of the screen height. */
export interface SplitSpec {
  mode: SplitMode;
  cut: number;
}

export interface LayoutInput {
  canvas: PixelSize;
  /** The after capture (Movar on). */
  capture: PixelSize;
  /** The before capture (Movar off). Defaults to the after's size. */
  beforeCapture?: PixelSize | undefined;
  device: DeviceProfile;
  split: SplitSpec;
  /** Lines the headline wraps to at `headlineWidth` (measured, not guessed). */
  headlineLines: number;
  /** Force the screen width (tests of the guards; normally derived). */
  screenWidth?: number | undefined;
  cta?: CtaSpec | undefined;
}

/** One drawn phone: its shape, outer body (rim included) and screen picture. */
export interface PhonePlacement {
  shape: PhoneShape;
  phone: Rect;
  screen: Rect;
}

/** A horizontal slice of a capture, in capture pixels. */
export interface Slice {
  y: number;
  height: number;
}

export interface SplitPlacement extends SplitSpec {
  /** Rows of the after capture drawn in the top part. */
  afterSlice: Slice;
  /** Rows of the before capture drawn in the bottom part. */
  beforeSlice: Slice;
  /** The seam band, on the canvas, centred on the cut. */
  seam: Rect;
  /** The tag row inside the band: left inset from the band edge, and pill height. */
  tags: { inset: number; height: number };
}

export interface Layout {
  canvas: PixelSize;
  capture: PixelSize;
  beforeCapture: PixelSize;
  device: DeviceProfile;
  minSideGap: number;
  minLogoGap: number;
  logo: { x: number; y: number; markSize: number; fontSize: number };
  headline: Rect & { fontSize: number; lineHeight: number; lines: number };
  /** The one phone: whole, centred, inside the canvas. */
  phone: PhonePlacement;
  split: SplitPlacement;
  cta: CtaSpec | undefined;
}

/** Width the headline is wrapped to, for a canvas width. */
export function headlineWidth(canvasWidth: number): number {
  return canvasWidth - 2 * Math.round(canvasWidth * MIN_SIDE_GAP);
}

export function headlineFontSize(canvasWidth: number): number {
  return Math.round(canvasWidth * HEADLINE_FONT_SIZE);
}

/**
 * The screen width: the owner's, shrunk (never the bezel) when even a 3-line
 * headline would not fit above the phone. Every headline gets the same phone,
 * so a set of shots lines up.
 */
function screenWidthFor(input: LayoutInput, px: (f: number) => number, lineHeight: number): number {
  const { canvas, capture } = input;
  const edgePerPx = phoneShape(1000, input.device).edge / 1000;
  const headroom =
    px(TOP_PAD) +
    px(LOGO_MARK) +
    px(LOGO_TO_HEADLINE) +
    MAX_HEADLINE_LINES * lineHeight +
    px(GAP_TO_PHONE);
  const ratio = capture.height / capture.width;
  const heightLimit = (canvas.height - px(MIN_SIDE_GAP) - headroom) / (ratio + 2 * edgePerPx);
  const widthLimit = (canvas.width - 2 * px(MIN_SIDE_GAP)) / (1 + 2 * edgePerPx);
  return Math.floor(
    input.screenWidth ?? Math.min(canvas.width * SCREEN_WIDTH, heightLimit, widthLimit),
  );
}

function placePhone(
  input: LayoutInput,
  screenW: number,
  px: (f: number) => number,
): PhonePlacement {
  const { canvas, capture, device } = input;
  const shape = phoneShape(screenW, device);
  const edge = Math.round(shape.edge);
  const screenH = Math.round((screenW * capture.height) / capture.width);
  const bodyW = screenW + 2 * edge;
  const bodyH = screenH + 2 * edge;
  const x = Math.round((canvas.width - bodyW) / 2);
  const y = canvas.height - px(MIN_SIDE_GAP) - bodyH;
  return {
    shape,
    phone: { x, y, width: bodyW, height: bodyH },
    screen: { x: x + edge, y: y + edge, width: shape.screenWidth, height: screenH },
  };
}

function placeSplit(
  split: SplitSpec,
  capture: PixelSize,
  screen: Rect,
  px: (f: number) => number,
): SplitPlacement {
  const cutPx = Math.round(capture.height * split.cut);
  const tagH = px(TAG_HEIGHT);
  const bandH = tagH + 2 * px(BAND_PAD);
  const seamY = screen.y + Math.round((screen.height * cutPx) / capture.height);
  const bandTop = seamY - Math.round(bandH / 2);
  // A `tops` before part starts under its status bar; the band's lower half then
  // falls on status-bar rows, so it covers none of the before page.
  const halfBandRows = Math.round(((seamY - bandTop) * capture.height) / screen.height);
  const statusBar = Math.round(capture.height * STATUS_BAR_SHARE);
  const beforeTop = split.mode === 'tops' ? Math.max(0, statusBar - halfBandRows) : cutPx;
  return {
    ...split,
    afterSlice: { y: 0, height: cutPx },
    beforeSlice: { y: beforeTop, height: capture.height - cutPx },
    seam: { x: screen.x, y: bandTop, width: screen.width, height: bandH },
    tags: { inset: px(TAG_INSET), height: tagH },
  };
}

export function computeLayout(input: LayoutInput): Layout {
  const { canvas, capture, device, headlineLines } = input;
  const beforeCapture = input.beforeCapture ?? capture;
  const W = canvas.width;
  const px = (fraction: number): number => Math.round(fraction * W);
  const gapSide = px(MIN_SIDE_GAP);

  const fontSize = headlineFontSize(W);
  const lineHeight = Math.round(fontSize * HEADLINE_LINE_HEIGHT);
  const headlineHeight = headlineLines * lineHeight;
  const markSize = px(LOGO_MARK);

  const phone = placePhone(input, screenWidthFor(input, px, lineHeight), px);

  return {
    canvas,
    capture,
    beforeCapture,
    device,
    minSideGap: gapSide,
    minLogoGap: px(LOGO_TO_HEADLINE),
    logo: { x: gapSide, y: px(TOP_PAD), markSize, fontSize: Math.round(markSize * 0.7) },
    headline: {
      x: gapSide,
      y: phone.phone.y - px(GAP_TO_PHONE) - headlineHeight,
      width: headlineWidth(W),
      height: headlineHeight,
      fontSize,
      lineHeight,
      lines: headlineLines,
    },
    phone,
    split: placeSplit(input.split, capture, phone.screen, px),
    cta: input.cta,
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

function assertCaptures(layout: Layout): void {
  const { capture: a, beforeCapture: b } = layout;
  if (a.width !== b.width || a.height !== b.height) {
    fail(
      'capture-mismatch',
      `before capture is ${b.width}x${b.height} but after is ${a.width}x${a.height}`,
    );
  }
}

function assertPhone(layout: Layout): void {
  const { capture } = layout;
  const { screen, phone, shape } = layout.phone;
  const aspectOff = Math.abs(screen.width / screen.height / (capture.width / capture.height) - 1);
  if (aspectOff > ASPECT_TOLERANCE) {
    fail(
      'picture-aspect',
      `screen drawn ${screen.width}x${screen.height} is ${(aspectOff * 100).toFixed(2)}% ` +
        `off its ${capture.width}x${capture.height} source (limit ${ASPECT_TOLERANCE * 100}%)`,
    );
  }
  const bodyRatio = phone.height / phone.width;
  const bodyOff = Math.abs(bodyRatio / shape.bodyRatio - 1);
  if (bodyOff > BODY_RATIO_TOLERANCE) {
    fail(
      'phone-body-ratio',
      `phone body ${phone.width}x${phone.height} (1:${bodyRatio.toFixed(3)}) is ` +
        `${(bodyOff * 100).toFixed(2)}% off ${layout.device.label} (1:${shape.bodyRatio.toFixed(3)})`,
    );
  }
}

function assertGaps(layout: Layout): void {
  const { phone, canvas, minSideGap } = layout;
  const side = Math.min(phone.phone.x, canvas.width - (phone.phone.x + phone.phone.width));
  if (side < minSideGap - 1) {
    fail('side-gap', `the phone is ${side} px from a side edge; minimum is ${minSideGap} px`);
  }
  const bottom = canvas.height - (phone.phone.y + phone.phone.height);
  if (bottom < minSideGap - 1 || phone.phone.y < 0) {
    fail(
      'phone-clipped',
      `the phone must stand whole inside the canvas, ${minSideGap} px off the bottom ` +
        `(top ${phone.phone.y}, bottom gap ${bottom})`,
    );
  }
}

/** Both parts keep a readable share of the screen, and the before slice lies inside its capture. */
function assertSplit(layout: Layout): void {
  const { split, capture, beforeCapture } = layout;
  if (split.cut < MIN_PART_SHARE || split.cut > 1 - MIN_PART_SHARE + 1e-9) {
    fail(
      'split-cut',
      `the seam sits at ${(split.cut * 100).toFixed(1)}% of the screen; each part needs ` +
        `at least ${MIN_PART_SHARE * 100}%`,
    );
  }
  const end = split.beforeSlice.y + split.beforeSlice.height;
  if (split.afterSlice.height > capture.height || end > beforeCapture.height) {
    fail(
      'split-cut',
      `the before part reads rows ${split.beforeSlice.y}..${end} of a ${beforeCapture.height} px capture`,
    );
  }
}

function assertHeadline(layout: Layout): void {
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
}

/** An ad CTA may sit on the ground only: both halves of the screen are content. */
function assertCta(layout: Layout): void {
  const { cta, phone } = layout;
  if (!cta) return;
  if (overlapArea(cta, phone.phone) > OVERLAP_EPSILON) {
    fail('cta-overlap', 'the CTA covers the phone; it may sit on the ground only');
  }
}

/** Runs every geometric guard; throws `RenderGuardError` on the first breach. */
export function assertLayout(layout: Layout): void {
  assertCaptures(layout);
  assertPhone(layout);
  assertGaps(layout);
  assertSplit(layout);
  assertHeadline(layout);
  assertCta(layout);
}

/** Set-level guard: the logo sits at the same place on every shot of a set. */
export function assertSameLogo(layouts: readonly Layout[]): void {
  const first = layouts[0];
  if (!first) return;
  const drifted = layouts.find(
    (layout) => layout.logo.x !== first.logo.x || layout.logo.y !== first.logo.y,
  );
  if (drifted) {
    fail(
      'logo-drift',
      `logo at (${drifted.logo.x}, ${drifted.logo.y}) but the set's first shot has it at ` +
        `(${first.logo.x}, ${first.logo.y})`,
    );
  }
}
