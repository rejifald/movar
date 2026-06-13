/**
 * Content-bundle guard + measurement — run via `pnpm check:content-bundle`.
 *
 * Bundles the content-script entry the way WXT does (a single minified IIFE) and
 *   • prints the per-package composition (measure),
 *   • writes the size to `.metrics/content-bundle.json` for the README badge
 *     (read by gen-readme-metrics.mts --refresh, which `pnpm metrics` runs), then
 *   • fails (exit 1) if the franc package is in the content module graph, or if
 *     the bundle is over its size budget (test).
 *
 * franc (~170 KB of trigram tables) lives in the background worker now, reached
 * by message — see src/lib/lang-detect-bridge.ts + src/entrypoints/background.ts.
 *
 * Division of labour with wxt.config.ts (build:done):
 *   - HERE (source graph): the PRECISE franc-in-graph check (esbuild metafile,
 *     catches static + lazy `await import('franc')`) plus the per-package
 *     contributor breakdown and the README badge measurement (80 KB graph
 *     budget). Standalone script, not a vitest test, because esbuild can't run
 *     inside vitest's worker pool — so it's wired into CI (`verify` job +
 *     `pnpm validate`) and `pnpm metrics`, not auto-run on every build.
 *   - THERE (real artifact): the always-run SHIP gate. assertContentBundleSlim
 *     (40 KB on the emitted content.js) + assertContentFrancFree (scans the
 *     artifact for franc's trigram-table signature) run on every `wxt build`
 *     (the chrome/firefox/safari matrix + verify:release), a coarse string-scan
 *     belt-and-braces to this graph check.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { build } from 'esbuild';

const EXT_ROOT = path.resolve(import.meta.dirname, '..');
const REPO_ROOT = path.resolve(EXT_ROOT, '..', '..');
// Source-graph budget. This measures the esbuild import graph of content.ts
// (single minified IIFE), currently ≈28 KB — the number the README badge shows
// (labelled "source graph"). It runs LARGER than the real emitted content.js
// (~31 KB) would suggest only because WXT's runtime additions differ; the two
// are different measures, and the authoritative SHIP gate is the 40 KB
// real-artifact budget in wxt.config.ts (assertContentBundleSlim). 80 KB here is
// generous headroom over the ~28 KB graph — its job is the franc-graph + heavy-
// dep tripwire and the per-package readout, not a tight byte cap. Bump it
// deliberately when the always-on path legitimately grows.
const BUDGET_KB = 80;

// IIFE mirrors WXT's content-script build (which inlines dynamic imports), so a
// lazy `await import('franc')` would be caught too. wxt runtime is external.
const result = await build({
  entryPoints: [path.join(EXT_ROOT, 'src/entrypoints/content.ts')],
  absWorkingDir: EXT_ROOT,
  bundle: true,
  minify: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2022',
  write: false,
  metafile: true,
  external: ['wxt', 'wxt/*'],
  define: { 'process.env.NODE_ENV': '"production"' },
  logLevel: 'silent',
});

const outputs = Object.values(result.metafile.outputs);
const out = outputs.find((o) => o.entryPoint !== undefined) ?? outputs[0];
const kb = (result.outputFiles[0]?.contents.length ?? 0) / 1024;

// Emit the size for the README metrics badge. Gitignored (like fallow's output);
// gen-readme-metrics.mts --refresh snapshots it into the committed metrics block.
const metricsDir = path.join(REPO_ROOT, '.metrics');
mkdirSync(metricsDir, { recursive: true });
writeFileSync(
  path.join(metricsDir, 'content-bundle.json'),
  `${JSON.stringify({ contentKb: Math.round(kb) }, null, 2)}\n`,
);

function bucket(p: string): string {
  const pkg = /packages\/([^/]+)\//.exec(p);
  if (pkg) return `@movar/${pkg[1]}`;
  const npm = /node_modules\/(?:\.pnpm\/[^/]+\/node_modules\/)?((?:@[^/]+\/)?[^/]+)\//.exec(p);
  if (npm) return `npm:${npm[1]}`;
  return 'app';
}

const totals = new Map<string, number>();
for (const [file, info] of Object.entries(out?.inputs ?? {})) {
  const key = bucket(file);
  totals.set(key, (totals.get(key) ?? 0) + info.bytesInOutput);
}
const sorted = [...totals].toSorted((a, b) => b[1] - a[1]);

// eslint-disable-next-line no-console -- this script's job is to print the measurement
console.log(`content.js ≈ ${kb.toFixed(0)} KB (budget ${BUDGET_KB} KB). Top contributors:`);
for (const [name, bytes] of sorted.slice(0, 8)) {
  // eslint-disable-next-line no-console -- measurement readout
  console.log(`  ${(bytes / 1024).toFixed(1).padStart(7)} KB  ${name}`);
}

const francInputs = Object.keys(out?.inputs ?? {}).filter((p) =>
  /node_modules\/(?:\.pnpm\/)?franc(?:-min)?[@/]/.test(p),
);

const failures: string[] = [];
if (francInputs.length > 0) {
  failures.push(
    `franc is in the content module graph (it must be reached via the background worker — ` +
      `src/lib/lang-detect-bridge.ts — not imported into the content script):\n` +
      francInputs.map((p) => `      ${p}`).join('\n'),
  );
}
if (kb > BUDGET_KB) {
  failures.push(`content bundle is ${kb.toFixed(0)} KB, over the ${BUDGET_KB} KB budget.`);
}

if (failures.length > 0) {
  // eslint-disable-next-line no-console -- failure report
  console.error(`\n✗ content-bundle guard FAILED:\n  - ${failures.join('\n  - ')}`);
  process.exit(1);
}
// eslint-disable-next-line no-console -- success report
console.log(`\n✓ content bundle is franc-free and within budget (${kb.toFixed(0)} KB).`);
