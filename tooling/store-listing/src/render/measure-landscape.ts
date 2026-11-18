/**
 * Pixel re-measurement of a rendered landscape shot (independent of the layout
 * maths): finds the seam line the window is split by, so a drifted cut, a seam
 * that missed the window, or a missing window shows in measurements.json.
 */
import sharp from 'sharp';
import type { LandscapeLayout } from './layout-landscape.js';

/* eslint-disable @typescript-eslint/no-magic-numbers -- pixel-scan thresholds. */

const SEAM_RGB = [0x1c, 0x19, 0x17] as const;
const COLOUR_TOLERANCE = 6;
const ROW_SHARE = 0.97;
const SEARCH_RADIUS = 24;

export interface WindowMeasurement {
  /** First row and thickness of the measured seam line (undefined when not found). */
  seamY: number | undefined;
  seamHeight: number;
  /** Seam centre as a share of the window height. */
  cutMeasured: number | undefined;
}

export async function measureWindow(
  png: Uint8Array,
  layout: LandscapeLayout,
): Promise<WindowMeasurement> {
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { rect } = layout.window;
  const { seam } = layout.split;
  const isSeamRow = (y: number): boolean => {
    let hits = 0;
    for (let x = rect.x; x < rect.x + rect.width; x++) {
      const o = (y * info.width + x) * info.channels;
      if (SEAM_RGB.every((v, i) => Math.abs((data[o + i] ?? 0) - v) <= COLOUR_TOLERANCE)) hits++;
    }
    return hits >= rect.width * ROW_SHARE;
  };
  const rows: number[] = [];
  for (let y = seam.y - SEARCH_RADIUS; y < seam.y + seam.height + SEARCH_RADIUS; y++) {
    if (y >= 0 && y < info.height && isSeamRow(y)) rows.push(y);
  }
  const first = rows[0];
  if (first === undefined) return { seamY: undefined, seamHeight: 0, cutMeasured: undefined };
  const last = rows.at(-1) ?? first;
  return {
    seamY: first,
    seamHeight: last - first + 1,
    cutMeasured: (first + (last - first + 1) / 2 - rect.y) / rect.height,
  };
}
