#!/usr/bin/env node
/**
 * Unit test for the extracted promise-verification module (#126).
 *
 * The repo has no vitest project that globs the root `scripts/` dir, so this is
 * a self-contained assertion runner (same pattern as
 * scripts/check-action-pins.test.mts). It checks the live tree's four promises
 * all hold, and that the two source scanners — the cores of the network-silence
 * and non-commercial promises — REPORT a planted violation rather than passing
 * it.
 *
 * Run: tsx scripts/lib/promises.test.mts   (also `pnpm test:promises`)
 */
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import nodePath from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  collectPromises,
  scanForCommercialHosts,
  scanForEgress,
  scanForMonetization,
} from './promises.mts';

const repoRoot = nodePath.resolve(nodePath.dirname(fileURLToPath(import.meta.url)), '..', '..');

// Load the marketing strings via tsx's loader (the live values).
const marketing = (await import(
  pathToFileURL(nodePath.resolve(repoRoot, 'apps/marketing/src/i18n.ts')).href
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

// 1. All four promises hold on the live tree.
const promises = collectPromises(repoRoot, inputs);
if (promises.length === 4) ok('collectPromises returns the four promises');
else bad(`expected 4 promises, got ${promises.length}`);
for (const p of promises) {
  if (p.kept) ok(`promise kept: ${p.claim}`);
  else bad(`promise BROKEN on the live tree: ${p.claim} — ${p.detail}`);
}

// 2. The egress scanner is clean on the real extension source.
const liveEgress = scanForEgress(repoRoot);
if (liveEgress.length === 0) ok('scanForEgress finds no egress in the live extension source');
else bad(`scanForEgress unexpectedly flagged: ${liveEgress.join(', ')}`);

// 3. A planted egress call IS reported (the broken-invariant case).
const fixture = mkdtempSync(nodePath.resolve(tmpdir(), 'movar-promises-'));
try {
  const srcDir = nodePath.resolve(fixture, 'apps', 'extension', 'src');
  mkdirSync(srcDir, { recursive: true });
  writeFileSync(
    nodePath.resolve(srcDir, 'leak.ts'),
    'export const x = await fetch("https://evil.example");\n',
  );
  const hits = scanForEgress(fixture);
  if (hits.some((h) => h.endsWith('leak.ts:1'))) {
    ok('scanForEgress REPORTS a planted fetch() egress call');
  } else {
    bad(`scanForEgress missed the planted egress call (got ${JSON.stringify(hits)})`);
  }
  // …and skips test files, so the guard never trips on its own fixtures.
  writeFileSync(nodePath.resolve(srcDir, 'leak.test.ts'), 'const y = fetch("https://x");\n');
  const afterTest = scanForEgress(fixture);
  if (afterTest.length === 1) ok('scanForEgress ignores *.test.ts files');
  else bad(`scanForEgress should ignore the test file (got ${JSON.stringify(afterTest)})`);
} finally {
  rmSync(fixture, { recursive: true, force: true });
}

// 4. The monetisation scanner is clean on the real workspace…
const liveMonetization = scanForMonetization(repoRoot);
if (liveMonetization.length === 0) {
  ok('scanForMonetization finds no paid dependency in the workspace');
} else {
  bad(`scanForMonetization unexpectedly flagged: ${liveMonetization.join(', ')}`);
}

// …REPORTS a planted one, and — the case that keeps the claim honest rather
// than merely strict — does NOT flag a donation platform. "Non-commercial"
// means Movar sells nothing, not that no one may ever chip in.
const moneyFixture = mkdtempSync(nodePath.resolve(tmpdir(), 'movar-monetization-'));
try {
  writeFileSync(
    nodePath.resolve(moneyFixture, 'package.json'),
    JSON.stringify({ name: 'movar', devDependencies: { 'ko-fi-widget': '^1.0.0' } }),
  );
  const appDir = nodePath.resolve(moneyFixture, 'apps', 'extension');
  mkdirSync(appDir, { recursive: true });
  writeFileSync(
    nodePath.resolve(appDir, 'package.json'),
    JSON.stringify({ name: '@movar/extension', dependencies: { '@stripe/stripe-js': '^4.0.0' } }),
  );
  const hits = scanForMonetization(moneyFixture);
  if (hits.some((h) => h.includes('@stripe/stripe-js'))) {
    ok('scanForMonetization REPORTS a planted payment dependency');
  } else {
    bad(`scanForMonetization missed the planted payment dep (got ${JSON.stringify(hits)})`);
  }
  if (hits.length === 1) ok('scanForMonetization ignores a donation dependency');
  else bad(`scanForMonetization should not flag the donation dep (got ${JSON.stringify(hits)})`);
} finally {
  rmSync(moneyFixture, { recursive: true, force: true });
}

// 5. The ad/checkout-host scanner: clean on the live tree, and REPORTS a
// planted ad tag on the marketing site — the surface no other promise covers.
const liveHosts = scanForCommercialHosts(repoRoot);
if (liveHosts.length === 0) ok('scanForCommercialHosts finds no ad/payment host in the live tree');
else bad(`scanForCommercialHosts unexpectedly flagged: ${liveHosts.join(', ')}`);

const hostFixture = mkdtempSync(nodePath.resolve(tmpdir(), 'movar-hosts-'));
try {
  const siteDir = nodePath.resolve(hostFixture, 'apps', 'marketing', 'src');
  mkdirSync(siteDir, { recursive: true });
  writeFileSync(
    nodePath.resolve(siteDir, 'Ads.astro'),
    '<script src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js"></script>\n',
  );
  const hits = scanForCommercialHosts(hostFixture);
  if (hits.some((h) => h.endsWith('Ads.astro:1'))) {
    ok('scanForCommercialHosts REPORTS a planted ad tag on the site');
  } else {
    bad(`scanForCommercialHosts missed the planted ad tag (got ${JSON.stringify(hits)})`);
  }
} finally {
  rmSync(hostFixture, { recursive: true, force: true });
}

// 6. Transparency-page smoke: the page chrome (around the verbatim English
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
