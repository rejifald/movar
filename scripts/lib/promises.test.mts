#!/usr/bin/env node
/**
 * Unit test for the extracted promise-verification module (#126).
 *
 * The repo has no vitest project that globs the root `scripts/` dir, so this is
 * a self-contained assertion runner (same pattern as
 * scripts/check-action-pins.test.mts). It checks the live tree's three promises
 * all hold, and that the egress scanner — the core of the network-silence
 * promise — REPORTS a planted violation rather than passing it.
 *
 * Run: tsx scripts/lib/promises.test.mts   (also `pnpm test:promises`)
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { collectPromises, scanForEgress } from './promises.mts';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

// Load the marketing strings via tsx's loader (the live values).
const marketing = (await import(
  pathToFileURL(resolve(repoRoot, 'apps/marketing/src/i18n.ts')).href
)) as {
  strings?: Record<string, { transparency?: { heading?: string; caveat?: string } }>;
};
const inputs = { marketingEn: (marketing.strings?.['en'] ?? {}) as Record<string, unknown> };
let failed = 0;
const ok = (label: string): void => {
  console.log(`  ✓ ${label}`);
};
const bad = (label: string): void => {
  console.error(`  ✗ ${label}`);
  failed += 1;
};

console.log('==> promise-verification module unit test (#126)');

// 1. All three promises hold on the live tree.
const promises = collectPromises(repoRoot, inputs);
if (promises.length === 3) ok('collectPromises returns the three promises');
else bad(`expected 3 promises, got ${promises.length}`);
for (const p of promises) {
  if (p.kept) ok(`promise kept: ${p.claim}`);
  else bad(`promise BROKEN on the live tree: ${p.claim} — ${p.detail}`);
}

// 2. The egress scanner is clean on the real extension source.
const liveEgress = scanForEgress(repoRoot);
if (liveEgress.length === 0) ok('scanForEgress finds no egress in the live extension source');
else bad(`scanForEgress unexpectedly flagged: ${liveEgress.join(', ')}`);

// 3. A planted egress call IS reported (the broken-invariant case).
const fixture = mkdtempSync(resolve(tmpdir(), 'movar-promises-'));
try {
  const srcDir = resolve(fixture, 'apps', 'extension', 'src');
  mkdirSync(srcDir, { recursive: true });
  writeFileSync(
    resolve(srcDir, 'leak.ts'),
    'export const x = await fetch("https://evil.example");\n',
  );
  const hits = scanForEgress(fixture);
  if (hits.some((h) => h.endsWith('leak.ts:1'))) {
    ok('scanForEgress REPORTS a planted fetch() egress call');
  } else {
    bad(`scanForEgress missed the planted egress call (got ${JSON.stringify(hits)})`);
  }
  // …and skips test files, so the guard never trips on its own fixtures.
  writeFileSync(resolve(srcDir, 'leak.test.ts'), 'const y = fetch("https://x");\n');
  const afterTest = scanForEgress(fixture);
  if (afterTest.length === 1) ok('scanForEgress ignores *.test.ts files');
  else bad(`scanForEgress should ignore the test file (got ${JSON.stringify(afterTest)})`);
} finally {
  rmSync(fixture, { recursive: true, force: true });
}

// 4. Transparency-page smoke: the page chrome (around the verbatim English
// proofs) exists in BOTH locales, so /transparency and /uk/transparency render.
for (const lc of ['en', 'uk'] as const) {
  const block = marketing.strings?.[lc]?.transparency;
  if (block?.heading && block.caveat) ok(`transparency page chrome present for locale: ${lc}`);
  else bad(`transparency strings missing/incomplete for locale: ${lc}`);
}

console.log(
  failed === 0 ? '\n✓ all promise-module checks passed' : `\n✗ ${failed} check(s) failed`,
);
process.exit(failed > 0 ? 1 : 0);
