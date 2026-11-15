/**
 * Pure geometry: where everything goes on a canvas, and the guards that refuse
 * a layout that breaks a hard rule. Nothing here touches Satori or pixels.
 *
 * The B1 composition (owner, 2026-11-15): two real captures of the same screen.
 * The AFTER phone (Movar on) stands whole, in front, right-aligned and lifted off
 * the bottom by the side gap. The BEFORE phone (Movar off) stands behind it,
 * smaller and muted, left-aligned, dropped so it runs off the canvas bottom.
 * The logo sits at one fixed y on every shot; the headline sits tight above the
 * after phone, and any spare height goes between the logo and the headline.
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
/** The after phone's screen width (owner's B1 draft: 820 px at 1320). */
const AFTER_SCREEN = ref(820);
/** The before screen is this share of the after screen. */
const BEFORE_SCALE = 0.9;
/** The before phone's top sits this far below the after phone's top. */
const BEFORE_DROP = ref(420);
/**
 * Share of the before body that must stay visible left of the after phone. Below
 * a quarter the before phone reads as a grey sliver, not as the same page with
 * Movar off: the leading (left) column of the page, where the reader compares the
 * two, is gone. At 1320 the layout leaves ~35 %.
 */
const MIN_BEFORE_STRIP = 0.25;
const HEADLINE_FONT_SIZE = ref(98);
export const HEADLINE_LINE_HEIGHT = 1.08;
export const MAX_HEADLINE_LINES = 3;
const DEFAULT_MAX_BOTTOM_CROP = 0.09;
const CORNER_MARGIN = ref(6);
const GAP_TO_PHONE = ref(48);
const TOP_PAD = ref(72);
const LOGO_MARK = ref(84);
/** Minimum logo-to-headline gap; the spare height of a short headline lands here. */
const LOGO_TO_HEADLINE = ref(60);
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

export interface LayoutInput {
  canvas: PixelSize;
  /** The after capture (Movar on). */
  capture: PixelSize;
  /** The before capture (Movar off). Defaults to the after's size. */
  beforeCapture?: PixelSize | undefined;
  device: DeviceProfile;
  /** Lines the headline wraps to at `headlineWidth` (measured, not guessed). */
  headlineLines: number;
  /** Largest share of the BEFORE screen the canvas bottom may cut off. Default 0.09. */
  maxBottomCropFraction?: number | undefined;
  /** Force the after screen width (tests of the guards; normally derived). */
  screenWidth?: number | undefined;
  cta?: CtaSpec | undefined;
}

/** One drawn phone: its shape, outer body (rim included) and screen picture. */
export interface PhonePlacement {
  shape: PhoneShape;
  phone: Rect;
  screen: Rect;
}

export interface BeforePlacement extends PhonePlacement {
  /** How much of the screen the canvas bottom cuts off. */
  crop: { px: number; fraction: number };
}

export interface Layout {
  canvas: PixelSize;
  capture: PixelSize;
  beforeCapture: PixelSize;
  device: DeviceProfile;
  minSideGap: number;
  minLogoGap: number;
  maxBottomCropFraction: number;
  logo: { x: number; y: number; markSize: number; fontSize: number };
  headline: Rect & { fontSize: number; lineHeight: number; lines: number };
  /** Movar on: whole, in front, inside the canvas. */
  after: PhonePlacement;
  /** Movar off: behind, smaller, runs off the canvas bottom. */
  before: BeforePlacement;
  cta: CtaSpec | undefined;
}

/** Width the headline is wrapped to, for a canvas width. */
export function headlineWidth(canvasWidth: number): number {
  return canvasWidth - 2 * Math.round(canvasWidth * MIN_SIDE_GAP);
}

export function headlineFontSize(canvasWidth: number): number {
  return Math.round(canvasWidth * HEADLINE_FONT_SIZE);
}

interface Frame {
  shape: PhoneShape;
  edge: number;
  screenH: number;
  bodyW: number;
  bodyH: number;
}

/** A phone around a screen of `screenW`, drawn at the capture's own ratio. */
function frameFor(screenW: number, capture: PixelSize, device: DeviceProfile): Frame {
  const shape = phoneShape(screenW, device);
  const edge = Math.round(shape.edge);
  const screenH = Math.round((screenW * capture.height) / capture.width);
  return { shape, edge, screenH, bodyW: screenW + 2 * edge, bodyH: screenH + 2 * edge };
}

function placeAt(frame: Frame, x: number, y: number): PhonePlacement {
  return {
    shape: frame.shape,
    phone: { x, y, width: frame.bodyW, height: frame.bodyH },
    screen: {
      x: x + frame.edge,
      y: y + frame.edge,
      width: frame.shape.screenWidth,
      height: frame.screenH,
    },
  };
}

/**
 * The after screen: the owner's width, shrunk (never the bezel) when even a
 * 3-line headline would not fit above the phone. Every headline gets the same
 * phone, so a set of shots lines up.
 */
function afterScreenWidth(
  input: LayoutInput,
  px: (f: number) => number,
  lineHeight: number,
): number {
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
  return Math.floor(input.screenWidth ?? Math.min(canvas.width * AFTER_SCREEN, heightLimit));
}

/**
 * How far below the after phone's top the before phone starts: the owner's drop,
 * nudged only as far as needed to cut the before screen past its rounded corners
 * (or bezel shows under it) and within the crop allowance.
 */
function beforeDrop(
  nominal: number,
  cropAtNominal: number,
  wantedCrop: { min: number; max: number },
): number {
  const lo = nominal + wantedCrop.min - cropAtNominal;
  const hi = nominal + wantedCrop.max - cropAtNominal;
  return Math.min(Math.max(nominal, lo), hi);
}

export function computeLayout(input: LayoutInput): Layout {
  const { canvas, capture, device, headlineLines } = input;
  const beforeCapture = input.beforeCapture ?? capture;
  const maxCrop = input.maxBottomCropFraction ?? DEFAULT_MAX_BOTTOM_CROP;
  const W = canvas.width;
  const px = (fraction: number): number => Math.round(fraction * W);
  const gapSide = px(MIN_SIDE_GAP);

  const fontSize = headlineFontSize(W);
  const lineHeight = Math.round(fontSize * HEADLINE_LINE_HEIGHT);
  const headlineHeight = headlineLines * lineHeight;
  const markSize = px(LOGO_MARK);

  const afterFrame = frameFor(afterScreenWidth(input, px, lineHeight), capture, device);
  const after = placeAt(
    afterFrame,
    W - gapSide - afterFrame.bodyW,
    canvas.height - gapSide - afterFrame.bodyH,
  );

  const beforeFrame = frameFor(
    Math.round(after.screen.width * BEFORE_SCALE),
    beforeCapture,
    device,
  );
  const nominalDrop = px(BEFORE_DROP);
  const drop = beforeDrop(
    nominalDrop,
    after.phone.y + nominalDrop + beforeFrame.edge + beforeFrame.screenH - canvas.height,
    {
      min: Math.ceil(beforeFrame.shape.screenRadius + px(CORNER_MARGIN)),
      max: Math.floor(maxCrop * beforeFrame.screenH),
    },
  );
  const beforeAt = placeAt(beforeFrame, gapSide, after.phone.y + drop);
  const cropPx = beforeAt.screen.y + beforeAt.screen.height - canvas.height;

  return {
    canvas,
    capture,
    beforeCapture,
    device,
    minSideGap: gapSide,
    minLogoGap: px(LOGO_TO_HEADLINE),
    maxBottomCropFraction: maxCrop,
    logo: { x: gapSide, y: px(TOP_PAD), markSize, fontSize: Math.round(markSize * 0.7) },
    headline: {
      x: gapSide,
      y: after.phone.y - px(GAP_TO_PHONE) - headlineHeight,
      width: headlineWidth(W),
      height: headlineHeight,
      fontSize,
      lineHeight,
      lines: headlineLines,
    },
    after,
    before: { ...beforeAt, crop: { px: cropPx, fraction: cropPx / beforeAt.screen.height } },
    cta: input.cta,
  };
}

function overlapArea(a: Rect, b: Rect): number {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

function intersection(a: Rect, b: Rect): Rect {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(0, Math.min(a.x + a.width, b.x + b.width) - x),
    height: Math.max(0, Math.min(a.y + a.height, b.y + b.height) - y),
  };
}

/** The only part of a phone a CTA may cover: the after screen's bottom toolbar strip. */
export function toolbarStrip(layout: Layout): Rect {
  const { screen } = layout.after;
  const strip = screen.height * layout.maxBottomCropFraction;
  return { x: screen.x, y: screen.y + screen.height - strip, width: screen.width, height: strip };
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

function assertPhone(layout: Layout, which: 'after' | 'before', capture: PixelSize): void {
  const { screen, phone, shape } = layout[which];
  const aspectOff = Math.abs(screen.width / screen.height / (capture.width / capture.height) - 1);
  if (aspectOff > ASPECT_TOLERANCE) {
    fail(
      'picture-aspect',
      `${which} screen drawn ${screen.width}x${screen.height} is ${(aspectOff * 100).toFixed(2)}% ` +
        `off its ${capture.width}x${capture.height} source (limit ${ASPECT_TOLERANCE * 100}%)`,
    );
  }
  const bodyRatio = phone.height / phone.width;
  const bodyOff = Math.abs(bodyRatio / shape.bodyRatio - 1);
  if (bodyOff > BODY_RATIO_TOLERANCE) {
    fail(
      'phone-body-ratio',
      `${which} phone body ${phone.width}x${phone.height} (1:${bodyRatio.toFixed(3)}) is ` +
        `${(bodyOff * 100).toFixed(2)}% off ${layout.device.label} (1:${shape.bodyRatio.toFixed(3)})`,
    );
  }
}

function assertGaps(layout: Layout): void {
  const { after, before, canvas, minSideGap } = layout;
  const side = Math.min(
    before.phone.x,
    after.phone.x,
    canvas.width - (after.phone.x + after.phone.width),
  );
  if (side < minSideGap - 1) {
    fail('side-gap', `a phone is ${side} px from a side edge; minimum is ${minSideGap} px`);
  }
  const bottom = canvas.height - (after.phone.y + after.phone.height);
  if (bottom < minSideGap - 1 || after.phone.y < 0) {
    fail(
      'phone-clipped',
      `the after phone must stand whole inside the canvas, ${minSideGap} px off the bottom ` +
        `(top ${after.phone.y}, bottom gap ${bottom})`,
    );
  }
  const strip = (after.phone.x - before.phone.x) / before.phone.width;
  if (strip < MIN_BEFORE_STRIP) {
    fail(
      'before-hidden',
      `only ${(strip * 100).toFixed(1)}% of the before phone shows left of the after phone; ` +
        `minimum is ${MIN_BEFORE_STRIP * 100}%`,
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

function assertBeforeCrop(layout: Layout): void {
  const { crop, shape } = layout.before;
  if (crop.fraction > layout.maxBottomCropFraction + 1e-9) {
    fail(
      'bottom-crop',
      `the canvas cuts ${(crop.fraction * 100).toFixed(1)}% off the before screen; ` +
        `maximum is ${layout.maxBottomCropFraction * 100}%`,
    );
  }
  if (crop.px < shape.screenRadius - 0.5) {
    fail(
      'bezel-visible',
      `the canvas bottom cuts ${crop.px} px off the before screen but its rounded corners ` +
        `need ${Math.round(shape.screenRadius)} px: bezel would show under the screen`,
    );
  }
}

/** A CTA may sit on the ground, on the after toolbar strip, or over the part of the before phone the after one hides. */
function assertCta(layout: Layout): void {
  const { cta, after, before } = layout;
  if (!cta) return;
  const hidden = intersection(before.phone, after.phone);
  const covered =
    overlapArea(cta, after.phone) -
    overlapArea(cta, toolbarStrip(layout)) +
    overlapArea(cta, before.phone) -
    overlapArea(cta, hidden);
  if (covered > OVERLAP_EPSILON) {
    fail('cta-overlap', 'the CTA covers a phone outside the after screen’s bottom toolbar strip');
  }
}

/** Runs every geometric guard; throws `RenderGuardError` on the first breach. */
export function assertLayout(layout: Layout): void {
  assertCaptures(layout);
  assertPhone(layout, 'after', layout.capture);
  assertPhone(layout, 'before', layout.beforeCapture);
  assertGaps(layout);
  assertHeadline(layout);
  assertBeforeCrop(layout);
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
