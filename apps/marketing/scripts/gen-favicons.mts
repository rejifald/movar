/**
 * Generate raster favicon assets from the canonical icon.svg.
 *
 * Rasterises public/icon.svg with librsvg (`rsvg-convert`) into:
 *   - public/favicon.ico          (16 + 32 px, PNG-encoded ICO entries) — the
 *                                  path every browser auto-requests
 *   - public/icon-32.png          (32 px, for <link rel=icon type=image/png>)
 *   - public/apple-touch-icon.png (180 px, dark-filled square for the iOS /
 *                                  iPadOS "Add to Home Screen" tile)
 *
 * Run manually after changing icon.svg:
 *   pnpm --filter @movar/marketing gen:favicons
 *
 * The outputs are committed to git. CI has no librsvg, so — exactly like the
 * committed OG PNGs (see capture-og-images.mts) — the raster assets ship as
 * checked-in files rather than being regenerated at build time.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(here, '..', 'public');
const svg = path.join(publicDir, 'icon.svg');

/** Rasterise icon.svg to a square PNG of `size` px, optional flat background. */
function render(size: number, out: string, background?: string): void {
  const args = ['-w', String(size), '-h', String(size)];
  if (background) args.push('--background-color', background);
  args.push(svg, '-o', out);
  execFileSync('rsvg-convert', args);
}

/** Wrap one or more PNG buffers into a single .ico container. */
function buildIco(images: { size: number; data: Buffer }[]): Buffer {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // image type: 1 = icon
  header.writeUInt16LE(images.length, 4); // number of images

  const entries: Buffer[] = [];
  const payloads: Buffer[] = [];
  let offset = 6 + images.length * 16;
  for (const { size, data } of images) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0); // width (0 => 256)
    entry.writeUInt8(size >= 256 ? 0 : size, 1); // height
    entry.writeUInt8(0, 2); // palette count
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // color planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(data.length, 8); // size of PNG payload
    entry.writeUInt32LE(offset, 12); // offset of PNG payload
    entries.push(entry);
    payloads.push(data);
    offset += data.length;
  }
  return Buffer.concat([header, ...entries, ...payloads]);
}

const tmp = mkdtempSync(path.join(tmpdir(), 'movar-favicons-'));
try {
  // Standalone PNGs referenced directly from <head>.
  render(32, path.join(publicDir, 'icon-32.png'));
  render(180, path.join(publicDir, 'apple-touch-icon.png'), '#1c1917');

  // favicon.ico = ICO container wrapping 16 px + 32 px PNG entries.
  const pngs = [16, 32].map((size) => {
    const p = path.join(tmp, `${size}.png`);
    render(size, p);
    return { size, data: readFileSync(p) };
  });
  writeFileSync(path.join(publicDir, 'favicon.ico'), buildIco(pngs));

  console.log('Wrote favicon.ico, icon-32.png, apple-touch-icon.png to', publicDir);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
