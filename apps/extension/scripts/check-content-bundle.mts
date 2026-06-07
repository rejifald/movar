/**
 * Content-bundle guard + measurement — run via `pnpm check:content-bundle`.
 *
 * Bundles the content-script entry the way WXT does (a single minified IIFE) and
 *   • prints the per-package composition (measure), then
 *   • fails (exit 1) if the franc package is in the content module graph, or if
 *     the bundle is over its size budget (test).
 *
 * franc (~170 KB of trigram tables) lives in the background worker now, reached
 * by message — see src/lib/lang-detect-bridge.ts + src/entrypoints/background.ts.
 * This is the source-graph counterpart to the real-artifact size guard in
 * wxt.config.ts (build:done). It's a standalone script, not a vitest test,
 * because esbuild can't run inside vitest's worker pool.
 */
import path from 'node:path';
import process from 'node:process';
import { build } from 'esbuild';

const EXT_ROOT = path.resolve(import.meta.dirname, '..');
const BUDGET_KB = 175;

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
