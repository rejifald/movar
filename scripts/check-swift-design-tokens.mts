#!/usr/bin/env node
/**
 * Design-token guard for the Safari host app's SwiftUI code.
 *
 * Spacing, sizes, type and colour in `apps/extension/safari/Movar/Shared (App)/`
 * come from `MovarMetrics` / `MovarPalette` (defined under `MovarKit/`, the one
 * place literals are allowed). A raw `.padding(12)`, `.font(.system(size: 13))`
 * or `Color(red: ...)` outside MovarKit is a second, unlinked copy of a token.
 *
 * Existing violations are recorded in a SHRINK-ONLY baseline
 * (`scripts/swift-design-tokens.baseline.json`):
 *  - more violations of a kind in a file than its entry (or any in a file with
 *    no entry) fails the check;
 *  - fewer fails too ("baseline is stale") so the baseline only ever shrinks;
 *    run `--update` after fixing violations.
 *
 * `//` and block comments are stripped first, so documentation does not count.
 *
 * Run: tsx scripts/check-swift-design-tokens.mts [--update]
 *      (also `pnpm check:swift-tokens`; unit test: `pnpm test:swift-tokens`)
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import nodePath from 'node:path';
import { fileURLToPath } from 'node:url';

const root = nodePath.resolve(nodePath.dirname(fileURLToPath(import.meta.url)), '..');
const SCAN_DIR = 'apps/extension/safari/Movar/Shared (App)';
const EXEMPT_DIR = `${SCAN_DIR}/MovarKit`;
const BASELINE = 'scripts/swift-design-tokens.baseline.json';
const SKIP = new Set(['DerivedData', 'build', '.build', 'Assets.xcassets']);

export type Kind = 'font-system' | 'padding' | 'frame' | 'spacing' | 'color';

/**
 * One regex per kind, run over comment-stripped source. `[^)]` spans newlines.
 * A bare `0` is not a design value (`spacing: 0`, `.padding(0)`), so it never
 * counts; `0.5` and every other literal does.
 */
const NUM = String.raw`-?(?!0(?![.\d]))\d`;
export const RULES: Record<Kind, RegExp> = {
  // .font(.system(size: ...
  'font-system': /\.font\(\s*\.system\(\s*size\s*:/g,
  // .padding(12) / .padding(.top, 5) / .padding([.top, .bottom], 5)
  padding: new RegExp(String.raw`\.padding\(\s*(?:[.\w\[\], ]*,\s*)?${NUM}`, 'g'),
  // .frame(width: 20) / minWidth / maxHeight / idealWidth ... with a numeric literal
  frame: new RegExp(
    String.raw`\.frame\([^)]*?\b(?:width|height|(?:min|ideal|max)(?:Width|Height))\s*:\s*${NUM}`,
    'g',
  ),
  // spacing: 8
  spacing: new RegExp(String.raw`\bspacing\s*:\s*${NUM}`, 'g'),
  // Color(red:/white:/hue:/.sRGB...), UIColor(red:), NSColor(red:), "#RRGGBB[AA]", 0xRRGGBB[AA]
  color:
    /\b(?:Color|UIColor|NSColor)\(\s*(?:red\s*:|white\s*:|hue\s*:|\.sRGB|\.displayP3)|#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6})\b|\b0x[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?\b/g,
};
const KINDS = Object.keys(RULES) as Kind[];

/** Blank out `//` and (nestable) block comments, keeping string literals intact. */
export function stripSwiftComments(src: string): string {
  let out = '';
  let i = 0;
  while (i < src.length) {
    const c = src.charAt(i);
    const n = src[i + 1];
    if (c === '/' && n === '/') {
      while (i < src.length && src[i] !== '\n') i++;
    } else if (c === '/' && n === '*') {
      let depth = 1;
      i += 2;
      while (i < src.length && depth > 0) {
        if (src[i] === '/' && src[i + 1] === '*') {
          depth++;
          i += 2;
        } else if (src[i] === '*' && src[i + 1] === '/') {
          depth--;
          i += 2;
        } else {
          if (src[i] === '\n') out += '\n';
          i++;
        }
      }
    } else if (c === '"') {
      const q = src.startsWith('"""', i) ? '"""' : '"';
      out += q;
      i += q.length;
      while (i < src.length && !src.startsWith(q, i)) {
        if (src[i] === '\\') {
          out += src.charAt(i);
          i++;
        }
        if (q === '"' && src[i] === '\n') break;
        if (i < src.length) out += src.charAt(i);
        i++;
      }
      if (i < src.length && src.startsWith(q, i)) {
        out += q;
        i += q.length;
      }
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

export type Counts = Partial<Record<Kind, number>>;

export function countViolations(src: string): Counts {
  const clean = stripSwiftComments(src);
  const counts: Counts = {};
  for (const kind of KINDS) {
    const n = [...clean.matchAll(RULES[kind])].length;
    if (n > 0) counts[kind] = n;
  }
  return counts;
}

export type Baseline = Record<string, Counts>;

/** Compare current counts to the baseline. `regressions` and `stale` are messages. */
export function compare(
  current: Baseline,
  baseline: Baseline,
): { regressions: string[]; stale: string[] } {
  const regressions: string[] = [];
  const stale: string[] = [];
  for (const file of new Set([...Object.keys(current), ...Object.keys(baseline)])) {
    for (const kind of KINDS) {
      const now = current[file]?.[kind] ?? 0;
      const was = baseline[file]?.[kind] ?? 0;
      if (now > was) regressions.push(`${file}: ${kind} ${was} -> ${now}`);
      else if (now < was) stale.push(`${file}: ${kind} ${was} -> ${now}`);
    }
  }
  return { regressions, stale };
}

function collect(): Baseline {
  const result: Baseline = {};
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = nodePath.join(dir, entry.name);
      const rel = nodePath.relative(root, full).split(nodePath.sep).join('/');
      if (entry.isDirectory()) {
        if (SKIP.has(entry.name) || rel === EXEMPT_DIR) continue;
        walk(full);
      } else if (entry.name.endsWith('.swift')) {
        const counts = countViolations(readFileSync(full, 'utf8'));
        if (Object.keys(counts).length > 0) result[rel] = counts;
      }
    }
  };
  walk(nodePath.resolve(root, SCAN_DIR));
  return result;
}

const HEADER =
  'Shrink-only baseline for scripts/check-swift-design-tokens.mts. Per file, per kind, the ' +
  'number of raw design literals tolerated. Counts may only go down; regenerate with ' +
  '`tsx scripts/check-swift-design-tokens.mts --update`. Do not hand-raise a count.';

function readBaseline(): Baseline {
  const file = nodePath.resolve(root, BASELINE);
  if (!existsSync(file)) return {};
  return (JSON.parse(readFileSync(file, 'utf8')) as { files?: Baseline }).files ?? {};
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const current = collect();
  if (process.argv.includes('--update')) {
    const sorted: Baseline = Object.fromEntries(
      Object.entries(current).toSorted(([a], [b]) => a.localeCompare(b)),
    );
    writeFileSync(
      nodePath.resolve(root, BASELINE),
      `${JSON.stringify({ $comment: HEADER, files: sorted }, null, 2)}\n`,
    );
    console.log(`✓ wrote ${BASELINE} (${Object.keys(sorted).length} file(s)).`);
  } else {
    const { regressions, stale } = compare(current, readBaseline());
    if (regressions.length > 0) {
      console.error(
        `✗ new raw design literal(s) in the Safari host app:\n  ${regressions.join('\n  ')}\n\n` +
          '  Use MovarMetrics / MovarPalette (MovarKit) instead of a literal.',
      );
      process.exit(1);
    }
    if (stale.length > 0) {
      console.error(
        `✗ baseline is stale (violations went down):\n  ${stale.join('\n  ')}\n\n` +
          '  Run `tsx scripts/check-swift-design-tokens.mts --update` and commit the result.',
      );
      process.exit(1);
    }
    const total = Object.values(current).reduce(
      (s, c) => s + Object.values(c).reduce((a, b) => a + b, 0),
      0,
    );
    console.log(`✓ Swift design tokens: ${total} baselined literal(s), no new ones.`);
  }
}
