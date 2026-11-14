/**
 * Pixel re-measurement of a rendered shot (independent of the layout maths).
 * Finds the near-black bezel, then the rim outside it. The rim's outer edge is
 * the first sharp luminance step walking outward sideways (the drop shadow is a
 * smooth gradient); top and bottom reuse that measured rim width, because the
 * shadow is darkest under the phone and hides the step there.
 */
import sharp from 'sharp';

/* eslint-disable @typescript-eslint/no-magic-numbers -- pixel-scan thresholds. */

const BEZEL_MAX_LUMA = 9;
const EDGE_STEP = 7;
const PROBE_ROWS = [0.55, 0.62, 0.7, 0.78, 0.85] as const;
const [LUMA_R, LUMA_G, LUMA_B] = [0.2126, 0.7152, 0.0722] as const;
const RIM_START_OFFSET = 2;

export interface PhoneMeasurement {
  /** Outer phone bounds (rim included), px. `bottom` only when the body ends inside the canvas. */
  outer: { left: number; right: number; top: number; bottom: number | undefined };
  outerWidth: number;
  outerHeight: number | undefined;
  /** Outer height / width; undefined when the phone runs off the canvas. */
  outerRatio: number | undefined;
  gaps: { left: number; right: number; top: number };
  rimPx: number;
  bezelPx: number;
  screen: { left: number; right: number; top: number; width: number };
  /** (outer width - screen width) / 2 / screen width. */
  edgeFraction: number;
}

interface Raster {
  width: number;
  height: number;
  luma: Float32Array;
}

async function decode(png: Uint8Array): Promise<Raster> {
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const luma = new Float32Array(info.width * info.height);
  for (let i = 0; i < luma.length; i++) {
    const o = i * info.channels;
    luma[i] = LUMA_R * (data[o] ?? 0) + LUMA_G * (data[o + 1] ?? 0) + LUMA_B * (data[o + 2] ?? 0);
  }
  return { width: info.width, height: info.height, luma };
}

const at = (r: Raster, x: number, y: number): number => r.luma[y * r.width + x] ?? 0;
const dark = (r: Raster, x: number, y: number): boolean => at(r, x, y) <= BEZEL_MAX_LUMA;

function median(values: number[]): number {
  return values.toSorted((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0;
}

/** Walks along a row from `from` by `step` until `stop` says to halt; returns the last x visited. */
function scanRow(r: Raster, from: number, step: 1 | -1, stop: (x: number) => boolean): number {
  let x = from;
  while (x >= 0 && x < r.width && !stop(x)) x += step;
  return x;
}

/** Walks sideways from inside the rim until the first sharp luma step. */
function walkRimX(r: Raster, y: number, from: number, step: 1 | -1): number {
  let x = from;
  for (;;) {
    const next = x + step;
    if (next < 0 || next >= r.width) return x;
    if (Math.abs(at(r, next, y) - at(r, x, y)) >= EDGE_STEP) return x;
    x = next;
  }
}

interface RowSample {
  bezelLeft: number;
  bezelRight: number;
  outerLeft: number;
  outerRight: number;
  screenLeft: number;
  screenRight: number;
}

function sampleRow(r: Raster, y: number): RowSample {
  const isDark = (x: number): boolean => dark(r, x, y);
  const isLight = (x: number): boolean => !dark(r, x, y);
  const bezelLeft = scanRow(r, 0, 1, isDark);
  const bezelRight = scanRow(r, r.width - 1, -1, isDark);
  if (bezelLeft >= r.width || bezelRight < 0) throw new Error(`No phone bezel found on row ${y}`);
  return {
    bezelLeft,
    bezelRight,
    outerLeft: walkRimX(r, y, bezelLeft - RIM_START_OFFSET, -1),
    outerRight: walkRimX(r, y, bezelRight + RIM_START_OFFSET, 1),
    screenLeft: scanRow(r, bezelLeft, 1, isLight),
    screenRight: scanRow(r, bezelRight, -1, isLight),
  };
}

/** First dark pixel scanning down a column from `from`, or -1. */
function firstDarkDown(r: Raster, x: number, from: number): number {
  for (let y = from; y < r.height; y++) if (dark(r, x, y)) return y;
  return -1;
}

/** Last dark pixel in a column, scanning up from the bottom, or -1. */
function lastDarkUp(r: Raster, x: number): number {
  for (let y = r.height - 1; y >= 0; y--) if (dark(r, x, y)) return y;
  return -1;
}

/** Row where the dark bezel run starting at `from` ends (first non-dark below it). */
function bezelRunEnd(r: Raster, x: number, from: number): number {
  let y = from;
  while (y < r.height && dark(r, x, y)) y++;
  return y;
}

export async function measurePhone(png: Uint8Array): Promise<PhoneMeasurement> {
  const r = await decode(png);
  const samples = PROBE_ROWS.map((f) => sampleRow(r, Math.floor(r.height * f)));
  const pick = (key: keyof RowSample): number => median(samples.map((s) => s[key]));
  const [bezelLeft, bezelRight] = [pick('bezelLeft'), pick('bezelRight')];
  const [left, right] = [pick('outerLeft'), pick('outerRight')];
  const [screenLeft, screenRight] = [pick('screenLeft'), pick('screenRight')];
  const rimPx = bezelLeft - left;
  const cx = Math.round((bezelLeft + bezelRight) / 2);

  const bezelTop = firstDarkDown(r, cx, 0);
  if (bezelTop < 0) throw new Error('No phone bezel found in the centre column');
  const top = bezelTop - rimPx;
  const screenTop = bezelRunEnd(r, cx, bezelTop);

  // The body only has a bottom edge when it ends inside the canvas (diagnostic render).
  const lastDark = lastDarkUp(r, cx);
  const endsInside = lastDark > screenTop && lastDark < r.height - 1;
  const bottom = endsInside ? lastDark + rimPx : undefined;

  const outerWidth = right - left + 1;
  const outerHeight = bottom === undefined ? undefined : bottom - top + 1;
  const screenWidth = screenRight - screenLeft + 1;
  return {
    outer: { left, right, top, bottom },
    outerWidth,
    outerHeight,
    outerRatio: outerHeight === undefined ? undefined : outerHeight / outerWidth,
    gaps: { left, right: r.width - 1 - right, top },
    rimPx,
    bezelPx: screenLeft - bezelLeft,
    screen: { left: screenLeft, right: screenRight, top: screenTop, width: screenWidth },
    edgeFraction: (outerWidth - screenWidth) / 2 / screenWidth,
  };
}
