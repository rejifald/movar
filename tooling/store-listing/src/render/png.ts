/**
 * Minimal PNG header reader. The renderer draws every capture at its own pixel
 * ratio, so the size has to come from the file itself — never from an
 * assumption about which device produced it.
 */

/* eslint-disable @typescript-eslint/no-magic-numbers -- the PNG file signature bytes. */
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;
const IHDR_TYPE = 'IHDR';
const IHDR_TYPE_OFFSET = 12;
const WIDTH_OFFSET = 16;
const HEIGHT_OFFSET = 20;
const IHDR_END = 24;

export interface PixelSize {
  width: number;
  height: number;
}

/** Reads width/height from the IHDR chunk. Throws on anything that is not a PNG. */
export function readPngSize(bytes: Uint8Array): PixelSize {
  if (bytes.length < IHDR_END || PNG_SIGNATURE.some((byte, index) => bytes[index] !== byte)) {
    throw new Error('Not a PNG file (bad signature)');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const type = String.fromCodePoint(...bytes.subarray(IHDR_TYPE_OFFSET, WIDTH_OFFSET));
  if (type !== IHDR_TYPE) throw new Error('Not a PNG file (IHDR is not the first chunk)');
  const width = view.getUint32(WIDTH_OFFSET);
  const height = view.getUint32(HEIGHT_OFFSET);
  if (width === 0 || height === 0) throw new Error('PNG header declares a zero-sized image');
  return { width, height };
}
