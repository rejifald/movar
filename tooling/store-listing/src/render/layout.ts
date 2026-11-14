/**
 * Pure geometry: where everything goes on a canvas, and the guards that refuse
 * a layout that breaks a hard rule. Nothing here touches Satori or pixels.
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

export const MIN_SIDE_GAP = ref(84);
export const HEADLINE_FONT_SIZE = ref(98);
export const HEADLINE_LINE_HEIGHT = 1.08;
export const MAX_HEADLINE_LINES = 3;
export const DEFAULT_MAX_BOTTOM_CROP = 0.09;
/** Extra crop beyond the corner radius so the cut is clearly above the curve. */
/** Keeps pixel rounding from tipping the crop over its allowance. */
const CROP_HEADROOM = 0.004;
const CORNER_MARGIN = ref(6);
const GAP_TO_PHONE = { min: ref(40), nominal: ref(48), max: ref(56) } as const;
const TOP_PAD = ref(72);
const MAX_EXTRA_TOP_PAD = ref(160);
const MAX_EXTRA_LOGO_GAP = ref(160);
const LOGO_MARK = ref(84);
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
  capture: PixelSize;
  device: DeviceProfile;
  /** Lines the headline wraps to at `headlineWidth` (measured, not guessed). */
  headlineLines: number;
  maxBottomCropFraction?: number | undefined;
  /** Force the drawn screen width (tests of the guards; normally derived). */
  screenWidth?: number | undefined;
  cta?: CtaSpec | undefined;
}

export interface Layout {
  canvas: PixelSize;
  capture: PixelSize;
  device: DeviceProfile;
  minSideGap: number;
  maxBottomCropFraction: number;
  logo: { x: number; y: number; markSize: number; fontSize: number };
  headline: Rect & { fontSize: number; lineHeight: number; lines: number };
  shape: PhoneShape;
  /** Outer body (rim included). Runs past the canvas bottom. */
  phone: Rect;
  /** Screen picture, in canvas coordinates (extends past the canvas bottom). */
  screen: Rect;
  crop: { px: number; fraction: number };
  cta: CtaSpec | undefined;
}

/** Width the headline is wrapped to, for a canvas width. */
export function headlineWidth(canvasWidth: number): number {
  return canvasWidth - 2 * Math.round(canvasWidth * MIN_SIDE_GAP);
}

export function headlineFontSize(canvasWidth: number): number {
  return Math.round(canvasWidth * HEADLINE_FONT_SIZE);
}

export function computeLayout(input: LayoutInput): Layout {
  const { canvas, capture, device, headlineLines } = input;
  const maxCrop = input.maxBottomCropFraction ?? DEFAULT_MAX_BOTTOM_CROP;
  const W = canvas.width;
  const px = (fraction: number): number => Math.round(fraction * W);
  const gapSide = px(MIN_SIDE_GAP);

  const fontSize = headlineFontSize(W);
  const lineHeight = Math.round(fontSize * HEADLINE_LINE_HEIGHT);
  const headlineHeight = headlineLines * lineHeight;
  const markSize = px(LOGO_MARK);

  // Body edge is linear in the screen width: probe it once at 1000 px.
  const probe = phoneShape(1000, device);
  const edgePerPx = probe.edge / 1000;
  const ratio = capture.height / capture.width;

  let topPad = px(TOP_PAD);
  let gapToPhone = px(GAP_TO_PHONE.nominal);
  let logoGap = px(LOGO_TO_HEADLINE);
  const headlineTop = (): number => topPad + markSize + logoGap;
  const phoneTop = (): number => headlineTop() + headlineHeight + gapToPhone;

  // Largest screen that keeps the body off the side edges ...
  const widthLimit = (W - 2 * gapSide) / (1 + 2 * edgePerPx);
  // ... and keeps the bottom crop within the allowance. Never thins the bezel:
  // the screen shrinks and the bezel follows it.
  const heightLimit =
    (canvas.height - phoneTop()) / (ratio * (1 - maxCrop + CROP_HEADROOM) + edgePerPx);
  const screenW = Math.floor(input.screenWidth ?? Math.min(widthLimit, heightLimit));
  const shape = phoneShape(screenW, device);
  const edge = Math.round(shape.edge);
  const screenH = Math.round(screenW * ratio);

  // The canvas edge must cut through the screen, not the bezel below it. If the
  // screen is short, push the block down (gap first, then top padding).
  const cropAt = (): number => 1 - (canvas.height - phoneTop() - edge) / screenH;
  // ... and past the screen's rounded bottom corners, or bezel shows in them.
  const wanted = Math.min((shape.screenRadius + px(CORNER_MARGIN)) / screenH, maxCrop);
  if (cropAt() < wanted) {
    const slack = Math.ceil((wanted - cropAt()) * screenH);
    const intoGap = Math.min(slack, px(GAP_TO_PHONE.max) - gapToPhone);
    gapToPhone += intoGap;
    const rest = slack - intoGap;
    const intoTop = Math.min(Math.ceil(rest / 2), px(MAX_EXTRA_TOP_PAD));
    topPad += intoTop;
    logoGap += Math.min(rest - intoTop, px(MAX_EXTRA_LOGO_GAP));
  }

  const bodyW = screenW + 2 * edge;
  const bodyH = screenH + 2 * edge;
  const bodyX = Math.round((W - bodyW) / 2);
  const bodyY = phoneTop();
  const cropPx = bodyY + edge + screenH - canvas.height;

  return {
    canvas,
    capture,
    device,
    minSideGap: gapSide,
    maxBottomCropFraction: maxCrop,
    logo: { x: gapSide, y: topPad, markSize, fontSize: Math.round(markSize * 0.7) },
    headline: {
      x: gapSide,
      y: headlineTop(),
      width: headlineWidth(W),
      height: headlineHeight,
      fontSize,
      lineHeight,
      lines: headlineLines,
    },
    shape,
    phone: { x: bodyX, y: bodyY, width: bodyW, height: bodyH },
    screen: { x: bodyX + edge, y: bodyY + edge, width: screenW, height: screenH },
    crop: { px: cropPx, fraction: cropPx / screenH },
    cta: input.cta,
  };
}

function overlapArea(a: Rect, b: Rect): number {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

/** The only part of the screen a CTA may cover: its bottom toolbar strip, as visible. */
export function toolbarStrip(layout: Layout): Rect {
  const strip = layout.screen.height * layout.maxBottomCropFraction;
  const top = layout.screen.y + layout.screen.height - strip;
  const visibleBottom = Math.min(layout.canvas.height, layout.screen.y + layout.screen.height);
  return {
    x: layout.screen.x,
    y: top,
    width: layout.screen.width,
    height: Math.max(0, visibleBottom - top),
  };
}

/** Runs every geometric guard; throws `RenderGuardError` on the first breach. */
export function assertLayout(layout: Layout): void {
  const { screen, phone, capture, canvas } = layout;

  const sourceRatio = capture.width / capture.height;
  const drawnRatio = screen.width / screen.height;
  const aspectOff = Math.abs(drawnRatio / sourceRatio - 1);
  if (aspectOff > ASPECT_TOLERANCE) {
    throw new RenderGuardError(
      'picture-aspect',
      `screen drawn ${screen.width}x${screen.height} is ${(aspectOff * 100).toFixed(2)}% off its ` +
        `${capture.width}x${capture.height} source (limit ${ASPECT_TOLERANCE * 100}%)`,
    );
  }

  const bodyRatio = phone.height / phone.width;
  const bodyOff = Math.abs(bodyRatio / layout.shape.bodyRatio - 1);
  if (bodyOff > BODY_RATIO_TOLERANCE) {
    throw new RenderGuardError(
      'phone-body-ratio',
      `phone body ${phone.width}x${phone.height} (1:${bodyRatio.toFixed(3)}) is ` +
        `${(bodyOff * 100).toFixed(2)}% off ${layout.device.label} (1:${layout.shape.bodyRatio.toFixed(3)})`,
    );
  }

  const leftGap = phone.x;
  const rightGap = canvas.width - (phone.x + phone.width);
  if (Math.min(leftGap, rightGap) < layout.minSideGap - 1) {
    throw new RenderGuardError(
      'side-gap',
      `phone is ${Math.min(leftGap, rightGap)} px from a side edge; minimum is ${layout.minSideGap} px`,
    );
  }

  if (layout.headline.lines > MAX_HEADLINE_LINES) {
    throw new RenderGuardError(
      'headline-lines',
      `headline wraps to ${layout.headline.lines} lines; maximum is ${MAX_HEADLINE_LINES}`,
    );
  }

  if (layout.crop.fraction > layout.maxBottomCropFraction + 1e-9) {
    throw new RenderGuardError(
      'bottom-crop',
      `bottom crop is ${(layout.crop.fraction * 100).toFixed(1)}% of the screen; ` +
        `maximum is ${layout.maxBottomCropFraction * 100}%`,
    );
  }
  if (layout.crop.px < layout.shape.screenRadius - 0.5) {
    throw new RenderGuardError(
      'bezel-visible',
      `the canvas bottom cuts ${layout.crop.px} px off the screen but its rounded corners ` +
        `need ${Math.round(layout.shape.screenRadius)} px: bezel would show under the screen`,
    );
  }

  if (layout.cta) {
    const body = overlapArea(layout.cta, phone);
    const allowed = overlapArea(layout.cta, toolbarStrip(layout));
    if (body - allowed > OVERLAP_EPSILON) {
      throw new RenderGuardError(
        'cta-overlap',
        'the CTA covers the phone or screen content outside the bottom toolbar strip',
      );
    }
  }
}
