/* eslint-disable @typescript-eslint/no-magic-numbers -- design proportions and percent conversions, written inline as in layout.ts */
/**
 * Geometry and guards the portrait (phone) and landscape (browser window)
 * layouts have in common: the split seam and its rotated captions, the logo
 * placement, and the guards on captures, seam position and headline room.
 * Pure; nothing here touches Satori or pixels.
 */
import { RenderGuardError } from './errors.js';
import type { Rect, SplitPlacement, SplitSpec } from './layout.js';
import type { PixelSize } from './png.js';

export const MAX_HEADLINE_LINES = 3;
/** Each part must keep at least this share of the screen, or it stops reading as a page. */
export const MIN_PART_SHARE = 0.25;
export const OVERLAP_EPSILON = 0.5;

export type Px = (fraction: number) => number;

export function overlapArea(a: Rect, b: Rect): number {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

export function fail(
  code: ConstructorParameters<typeof RenderGuardError>[0],
  message: string,
): never {
  throw new RenderGuardError(code, message);
}

/** Before and after captures must be the same size. */
export function assertCaptures(layout: { capture: PixelSize; beforeCapture: PixelSize }): void {
  const { capture: a, beforeCapture: b } = layout;
  if (a.width !== b.width || a.height !== b.height) {
    fail(
      'capture-mismatch',
      `before capture is ${b.width}x${b.height} but after is ${a.width}x${a.height}`,
    );
  }
}

/** The seam must leave each part a readable share; `noun` names what is split ("screen", "window"). */
export function assertSeamShare(cut: number, noun: string): void {
  if (cut < MIN_PART_SHARE || cut > 1 - MIN_PART_SHARE + 1e-9) {
    fail(
      'split-cut',
      `the seam sits at ${(cut * 100).toFixed(1)}% of the ${noun}; each part needs ` +
        `at least ${MIN_PART_SHARE * 100}%`,
    );
  }
}

/** The headline wraps to few enough lines and starts clear of the logo. */
export function assertHeadlineRoom(layout: {
  headline: { lines: number; y: number };
  logo: { y: number; markSize: number };
  minLogoGap: number;
}): void {
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

/** The logo mark in the top-left corner. */
export function placeLogo(
  px: Px,
  gapSide: number,
  topPad: number,
  logoMark: number,
): { x: number; y: number; markSize: number; fontSize: number } {
  const markSize = px(logoMark);
  return { x: gapSide, y: px(topPad), markSize, fontSize: Math.round(markSize * 0.7) };
}

export interface SeamStyle {
  readonly seamLine: number;
  readonly captionSize: number;
  readonly captionLeading: number;
  readonly captionOffset: number;
}

/**
 * The split of a capture drawn on `area`: the after slice, the before slice
 * (starting under `beforeSkipRows` of its own toolbar/status bar), the seam
 * line, and the rotated captions' columns left of `captionEdgeX` (the window's or phone body's left edge).
 */
export function placeSeam(
  split: SplitSpec,
  capture: PixelSize,
  area: Rect,
  beforeSkipRows: number,
  captionEdgeX: number,
  px: Px,
  style: SeamStyle,
): SplitPlacement {
  const cutPx = Math.round(capture.height * split.cut);
  const lineH = px(style.seamLine);
  const seamY = area.y + Math.round((area.height * cutPx) / capture.height);
  const lineTop = seamY - Math.round(lineH / 2);
  // The before part starts under its own toolbar; the line's lower half falls on
  // those rows, so it covers none of the before page.
  const halfLineRows = Math.round(((seamY - lineTop) * capture.height) / area.height);
  const fontSize = px(style.captionSize);
  const column = Math.round(fontSize * style.captionLeading);
  const columnX = captionEdgeX - px(style.captionOffset) - Math.round(column / 2);
  const bottom = area.y + area.height;
  return {
    ...split,
    afterSlice: { y: 0, height: cutPx },
    beforeSlice: {
      y: Math.max(0, beforeSkipRows - halfLineRows),
      height: capture.height - cutPx,
    },
    seam: { x: area.x, y: lineTop, width: area.width, height: lineH },
    captions: {
      after: { x: columnX, y: area.y, width: column, height: lineTop - area.y },
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
