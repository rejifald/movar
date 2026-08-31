#!/usr/bin/env node
/**
 * Drift guard: every `var(--token, #fallback)` fallback still equals the token
 * it stands in for.
 *
 * A CSS custom property written with a fallback carries a second, frozen copy
 * of a design token — `var(--ink-soft, #78716c)` says "#78716c" twice, once by
 * reference and once by value. Move the token in `packages/theme/src/tokens.ts`
 * and the reference follows; the literal does not. Nothing links them, no
 * build step reconciles them, and the stale half is invisible in review because
 * it is a plausible-looking hex sitting exactly where a hex belongs.
 *
 * The failure is worse than "a colour is slightly off", because a fallback is
 * not a rare path. It is what renders wherever the token is undefined, and for
 * two of the three drifted copies this guard was written for that was the
 * NORMAL path:
 *
 *  - `apps/extension/src/lib/curtain.ts` injects a shadow root into arbitrary
 *    websites, which do not define `--ink-*`. The fallback is what every reader
 *    actually saw, and it had been left behind at 4.6:1 when the token moved to
 *    7.3:1 — the exact regression the token change was fixing.
 *  - `apps/marketing/src/article-assets/chartKit.tsx` renders SVG scenes that
 *    are also opened on their own, outside the page that defines `--chart-*`.
 *    Its `--chart-ink-faint` fallback was #A8A29E — stone-400, the value of the
 *    DARK theme's `--ink-soft`, which on a light background scores 2.4:1. That
 *    one had been wrong since before the token move; a fallback nobody checks
 *    can be born stale as easily as it can drift.
 *
 * A fallback may legitimately match EITHER theme's value — a rule inside a dark
 * block should fall back to the dark value. It may not match neither.
 *
 * Not covered: `color-mix()` composites and rgba() literals derived from a
 * token. Those have no single value to compare against; the rendered-page
 * suite (`apps/e2e/src/marketing/marketing.contrast.spec.ts`) measures those as
 * they actually paint.
 *
 * Run: tsx scripts/check-token-fallbacks.mts  (also `pnpm check:token-fallbacks`)
 */
import { readFileSync, readdirSync } from 'node:fs';
import nodePath from 'node:path';
import { fileURLToPath } from 'node:url';

// By relative path with an explicit extension, not by package name: root
// scripts are not a workspace member. Same shape as `check-locale-redirects.mts`.
import { colorDark, colorLight } from '../packages/theme/src/tokens.ts';

const root = nodePath.resolve(nodePath.dirname(fileURLToPath(import.meta.url)), '..');
const ROOTS = ['apps', 'packages'];
const EXTENSIONS = new Set(['.ts', '.tsx', '.astro', '.css', '.html']);
/* Build output, caches and the theme's own GENERATED stylesheets. The generated
 * CSS is emitted from the very tokens compared against, so scanning it would
 * only ever confirm that a generator agrees with itself. */
const SKIP = new Set([
  'node_modules',
  'dist',
  '.astro',
  '.output',
  '.wxt',
  'coverage',
  'playwright-report',
  'test-results',
  'DerivedData',
  'styles',
]);

const files: string[] = [];
const walk = (dir: string): void => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP.has(entry.name)) continue;
      walk(nodePath.join(dir, entry.name));
    } else if (EXTENSIONS.has(nodePath.extname(entry.name))) {
      files.push(nodePath.join(dir, entry.name));
    }
  }
};
for (const r of ROOTS) walk(nodePath.resolve(root, r));

/** `#abc` and `#abcd` are shorthand for `#aabbcc` / `#aabbccdd`; compare the
 *  expanded, alpha-free form so a legitimate shorthand is not a failure. */
const normalise = (hex: string): string => {
  const raw = hex.slice(1).toLowerCase();
  const full = raw.length <= 4 ? [...raw].map((c) => c + c).join('') : raw;
  return `#${full.slice(0, 6)}`;
};

const FALLBACK = /var\(\s*--([a-z0-9-]+)\s*,\s*(#[0-9a-fA-F]{3,8})\s*\)/g;
const tokens: Record<string, string | undefined> = colorLight;
const darkTokens: Record<string, string | undefined> = colorDark;

let checked = 0;
let failed = 0;
for (const file of files) {
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, index) => {
    for (const [, token, hex] of line.matchAll(FALLBACK)) {
      if (!token || !hex) continue;
      // A `var(--foo, …)` naming something that is not a colour token — a
      // layout or motion variable, or a component-local one — is not this
      // guard's business.
      const lightValue = tokens[token];
      const darkValue = darkTokens[token];
      if (lightValue === undefined || darkValue === undefined) continue;
      checked++;
      const found = normalise(hex);
      if (found === normalise(lightValue) || found === normalise(darkValue)) continue;
      failed++;
      console.error(
        `✗ ${nodePath.relative(root, file)}:${index + 1}\n` +
          `    var(--${token}, ${hex}) — token is ${lightValue} (light) / ${darkValue} (dark)`,
      );
    }
  });
}

if (failed > 0) {
  console.error(
    `\n✗ ${failed} stale token fallback(s).\n` +
      '  A fallback is a frozen copy of a token, and it is what renders wherever\n' +
      '  the token is undefined — for injected shadow roots and standalone SVG,\n' +
      '  that is the normal path, not the rare one. Update the literal to the\n' +
      '  current value in packages/theme/src/tokens.ts (either theme is fine).',
  );
  process.exit(1);
}

console.log(`✓ all ${checked} token fallback(s) match packages/theme/src/tokens.ts.`);
