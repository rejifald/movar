#!/usr/bin/env node
/**
 * Guard the root README against silent drift from its sources of truth.
 *
 * The README is hand-maintained prose, so most of it can only be kept honest
 * by human review. But two facts in it are machine-checkable, and both have
 * drifted in the past:
 *
 *   1. The tagline blockquote must match the marketing hero headline — the
 *      actual shipped tagline lives in `apps/marketing/src/i18n.ts`
 *      (`strings.en.hero`). The README once said "Keep the web…" while every
 *      marketing surface said "Keep the internet…".
 *
 *   2. The "Monorepo layout" block must list every workspace member under
 *      `apps/*` and `packages/*` — no more, no less. The README once omitted
 *      `apps/marketing` (the very app it should mirror), `apps/e2e`,
 *      `apps/diagnostics`, and `packages/ui`.
 *
 * This script asserts both and exits non-zero on mismatch. It deliberately
 * does NOT police positioning/feature prose (e.g. the "Beta, off by default"
 * framing) — that stays a human-review concern; a brittle string match there
 * would give false confidence. Scope: the two invariants above.
 *
 * Run via `pnpm check:readme` (also folded into `pnpm validate`, lefthook
 * pre-commit, and the CI `verify` job).
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const errors: string[] = [];

// --- Source of truth: the marketing hero headline ---------------------------
// i18n.ts has no runtime imports, so it's safe to import standalone under tsx.
const i18nPath = resolve(repoRoot, 'apps/marketing/src/i18n.ts');
const { strings } = (await import(pathToFileURL(i18nPath).href)) as {
  strings: { en: { hero: { headlineLine1: string; headlineLine2: string } } };
};
const canonicalTagline = `${strings.en.hero.headlineLine1} ${strings.en.hero.headlineLine2}`;

// --- README ----------------------------------------------------------------
const readme = readFileSync(resolve(repoRoot, 'README.md'), 'utf8');

// 1. Tagline — the first markdown blockquote line.
const taglineMatch = /^>\s*(.+?)\s*$/m.exec(readme);
const readmeTagline = taglineMatch?.[1] ?? null;
if (readmeTagline !== canonicalTagline) {
  errors.push(
    'Tagline drift:\n' +
      `      README:    ${JSON.stringify(readmeTagline)}\n` +
      `      canonical: ${JSON.stringify(canonicalTagline)}  (apps/marketing/src/i18n.ts → hero)`,
  );
}

// 2. Monorepo layout — first fenced block after the "## Monorepo layout" heading.
const afterHeading = readme.split(/^##\s+Monorepo layout\s*$/m)[1] ?? '';
const fence = /```[a-z]*\n([\s\S]*?)\n```/.exec(afterHeading);
const listed = new Set(
  [...(fence?.[1] ?? '').matchAll(/^(apps|packages)\/[a-z0-9-]+/gm)].map((m) => m[0]),
);

// Actual members: immediate subdirs of apps/ and packages/ that are packages.
const actual = new Set<string>();
for (const group of ['apps', 'packages'] as const) {
  const groupDir = resolve(repoRoot, group);
  for (const entry of readdirSync(groupDir, { withFileTypes: true })) {
    if (entry.isDirectory() && existsSync(resolve(groupDir, entry.name, 'package.json'))) {
      actual.add(`${group}/${entry.name}`);
    }
  }
}

const missing = [...actual].filter((m) => !listed.has(m)).sort();
const stale = [...listed].filter((m) => !actual.has(m)).sort();
if (missing.length || stale.length) {
  errors.push(
    'Monorepo layout out of date:\n' +
      `      in repo but missing from README: ${missing.length ? missing.join(', ') : '(none)'}\n` +
      `      listed in README but gone:       ${stale.length ? stale.join(', ') : '(none)'}`,
  );
}

// --- Report ----------------------------------------------------------------
if (errors.length) {
  console.error('✗ README parity check failed:\n');
  for (const e of errors) console.error(`  ✗ ${e}\n`);
  console.error('Fix README.md, then re-run `pnpm check:readme`.');
  console.error('(Claude Code: invoke the `sync-readme` skill for the fix procedure.)');
  process.exit(1);
}

console.log(
  `✓ README parity: tagline matches the marketing hero, ` +
    `and the monorepo layout lists all ${actual.size} workspace members.`,
);
