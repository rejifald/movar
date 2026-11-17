import sharp from 'sharp';
import type { PixelSize } from './png.js';

export interface Rows {
  y: number;
  height: number;
}

/**
 * The before part's treatment (owner, 2026-11-17): fully desaturated, never
 * dimmed, washed or blurred, so it reads as "the other state" while its text
 * stays as crisp as the capture. Applied by the frame, never to the capture.
 */
export const BEFORE_SATURATION = 0;

async function rowsOf(bytes: Uint8Array, width: number, rows: Rows): Promise<Buffer> {
  return sharp(bytes)
    .extract({ left: 0, top: rows.y, width, height: rows.height })
    .png()
    .toBuffer();
}

/**
 * The split picture at capture size: the after rows on top, the before rows
 * (greyed) directly below them. Shared by the phone and the window layouts.
 */
export async function splitPicture(
  size: PixelSize,
  after: { bytes: Uint8Array; rows: Rows },
  before: { bytes: Uint8Array; rows: Rows },
): Promise<Buffer> {
  const beforeRows = await sharp(await rowsOf(before.bytes, size.width, before.rows))
    .modulate({ saturation: BEFORE_SATURATION })
    .png()
    .toBuffer();
  return sharp({
    create: { width: size.width, height: size.height, channels: 4, background: '#ffffff' },
  })
    .composite([
      { input: await rowsOf(after.bytes, size.width, after.rows), left: 0, top: 0 },
      { input: beforeRows, left: 0, top: after.rows.height },
    ])
    .png()
    .toBuffer();
}
