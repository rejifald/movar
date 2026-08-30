/**
 * Subset Fixel to Latin + Cyrillic and emit the woff2 files `@movar/fonts` ships.
 *
 * Fixel is distributed as one woff2 per weight carrying the *whole* typeface —
 * 11,000+ glyphs across 40+ languages, ~80 KB per cut. Six cuts unsubsetted is
 * 483 KB on every surface that loads the brand font, against 107 KB for the
 * Manrope subsets it replaces. The extension popup pays that on every open, for
 * glyph coverage this product will never render.
 *
 * So the shipped files are subsets, and this is the script that cuts them. The
 * OUTPUT is committed (`packages/fonts/files/`) because it cannot be rebuilt at
 * install time — the upstream archive is a manual download, not a dependency.
 * Re-run this only when Fixel itself is updated:
 *
 *   1. download https://fonts.macpaw.com/fonts/FixelAll.zip
 *   2. unzip it somewhere
 *   3. pnpm tsx scripts/subset-fixel.mts --src <that directory>
 *
 * Deliberately NOT wired into `prepare` or a build target: it would fail on
 * every fresh clone, where the archive isn't there and shouldn't need to be.
 */

import { mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import subsetFont from 'subset-font';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'packages/fonts/files');

/**
 * The coverage we keep, as Google Fonts defines its `latin` and `cyrillic`
 * subsets. Matching those ranges rather than inventing our own keeps the
 * decision auditable against the Manrope subsets this replaces.
 *
 * Latin and Cyrillic land in ONE file per weight rather than two: every reader
 * of this product needs Cyrillic, so splitting them would only add a request.
 */
const RANGES: readonly (readonly [number, number])[] = [
  [0x0000, 0x00ff],
  [0x0131, 0x0131],
  [0x0152, 0x0153],
  [0x02bb, 0x02bc],
  [0x02c6, 0x02c6],
  [0x02da, 0x02da],
  [0x02dc, 0x02dc],
  [0x0300, 0x0304],
  [0x0308, 0x0308],
  [0x0329, 0x0329],
  /* Cyrillic proper, plus the Ukrainian ґ/Ґ (0490–0491) — the letter a
   * Russian-centric subset drops, and the one this product cannot ship without. */
  [0x0400, 0x045f],
  [0x0490, 0x0491],
  [0x04b0, 0x04b1],
  [0x2000, 0x206f],
  [0x2074, 0x2074],
  [0x20ac, 0x20ac],
  [0x2116, 0x2116],
  [0x2122, 0x2122],
  [0x2191, 0x2191],
  [0x2193, 0x2193],
  [0x2212, 0x2212],
  [0x2215, 0x2215],
  [0xfffd, 0xfffd],
];

/** `subset-font` keeps the glyphs for the characters in a string, so spell the ranges out. */
function coverageText(): string {
  const chars: string[] = [];
  for (const [from, to] of RANGES) {
    for (let cp = from; cp <= to; cp += 1) chars.push(String.fromCodePoint(cp));
  }
  return chars.join('');
}

/** family + weight → the upstream file that carries it, and the name we ship it under. */
const CUTS = [
  { src: 'FixelText-Regular.woff2', out: 'fixel-text-400.woff2' },
  { src: 'FixelText-Medium.woff2', out: 'fixel-text-500.woff2' },
  { src: 'FixelText-SemiBold.woff2', out: 'fixel-text-600.woff2' },
  { src: 'FixelText-Bold.woff2', out: 'fixel-text-700.woff2' },
  { src: 'FixelDisplay-Bold.woff2', out: 'fixel-display-700.woff2' },
  { src: 'FixelDisplay-ExtraBold.woff2', out: 'fixel-display-800.woff2' },
] as const;

function findSource(dir: string, name: string): string {
  const stack = [dir];
  while (stack.length > 0) {
    const here = stack.pop();
    if (here === undefined) break;
    for (const entry of readdirSync(here, { withFileTypes: true })) {
      // macOS AppleDouble forks sit beside the real files and are not fonts.
      if (entry.name.startsWith('._')) continue;
      const full = path.join(here, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.name === name) return full;
    }
  }
  throw new Error(`${name} not found under ${dir} — is this an unpacked FixelAll.zip?`);
}

const srcFlag = process.argv.indexOf('--src');
const src = srcFlag === -1 ? undefined : process.argv[srcFlag + 1];
if (src === undefined || !existsSync(src)) {
  throw new Error(
    'usage: pnpm tsx scripts/subset-fixel.mts --src <unpacked FixelAll.zip>\n\n' +
      'Download the archive from https://fonts.macpaw.com/fonts/FixelAll.zip and unzip it first.',
  );
}

mkdirSync(OUT_DIR, { recursive: true });
const text = coverageText();
let before = 0;
let after = 0;

for (const cut of CUTS) {
  const from = findSource(src, cut.src);
  const original = readFileSync(from);
  const subset = await subsetFont(original, text, { targetFormat: 'woff2' });
  writeFileSync(path.join(OUT_DIR, cut.out), subset);
  before += original.length;
  after += subset.length;
  const pct = Math.round((1 - subset.length / original.length) * 100);
  console.log(
    `  ${cut.out.padEnd(24)} ${String(Math.round(subset.length / 1024)).padStart(4)} KB ` +
      `(was ${Math.round(original.length / 1024)} KB, −${pct}%)`,
  );
}

console.log(
  `\n${CUTS.length} cuts → ${Math.round(after / 1024)} KB total (was ${Math.round(before / 1024)} KB).`,
);
console.log(`written to ${path.relative(ROOT, OUT_DIR)}`);

/* A silent zero-byte or barely-shrunk output means the subsetter matched nothing;
 * fail loudly rather than shipping a font with no glyphs in it. */
for (const cut of CUTS) {
  const size = statSync(path.join(OUT_DIR, cut.out)).size;
  if (size < 4096)
    throw new Error(`${cut.out} came out at ${size} bytes — subsetting produced an empty font`);
}
