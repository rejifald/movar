#!/usr/bin/env node
/**
 * Guard the root README — and the AMO source-submission doc `SOURCE.md` —
 * against silent drift from their sources of truth.
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
 * SOURCE.md is what an AMO reviewer reads to trust and reproduce the build, so
 * its load-bearing facts must match code. Three of them drifted in the past
 * and are now guarded (see `checkSourceParity`):
 *
 *   3. The Firefox `strict_min_version` floor must NOT be hard-coded in
 *      SOURCE.md (it once said 113 while `wxt.config.ts` pins 140/142); the doc
 *      must reference `apps/extension/wxt.config.ts` as the source of truth.
 *
 *   4. The `declarativeNetRequest` rule must NOT be described as "static" /
 *      "build-time" / "generated from host-match" — it is one dynamic
 *      `updateDynamicRules` rule built at runtime in
 *      `apps/extension/src/lib/dnr.ts`.
 *
 *   5. Every committed `*.generated.{ts,tsx}` must be acknowledged in
 *      SOURCE.md's machine-generated-files note (a second generated source,
 *      `frequent.generated.ts`, once shipped unacknowledged).
 *
 * This script asserts all of the above and exits non-zero on mismatch. It
 * deliberately does NOT police positioning/feature prose (e.g. the "Beta, off
 * by default" framing) — that stays a human-review concern; a brittle string
 * match there would give false confidence. Scope: the invariants above.
 *
 * Run via `pnpm check:readme` (also folded into `pnpm validate`, lefthook
 * pre-commit, and the CI `verify` job).
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const errors: string[] = [];

// --- Self-test (`--self-test`): exercise assertSourceClaims on fixtures ------
// Wired into `pnpm check:readme`, so the SOURCE.md guard's own logic is verified
// in `pnpm validate`, lefthook pre-commit, and CI `verify` with no extra harness.
// Short-circuits before the (slower) README/marketing checks below.
if (process.argv.includes('--self-test')) {
  runSelfTest();
  process.exit(0);
}

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

// --- SOURCE.md (AMO source-submission doc) ---------------------------------
/**
 * Pure assertion core for the SOURCE.md parity checks. Takes already-read
 * inputs (no filesystem) so it can be self-tested against fixtures via the
 * `--self-test` flag below. Returns the list of `✗`-style failure messages.
 *
 *   - `source`         — the SOURCE.md text.
 *   - `dnrSource`      — apps/extension/src/lib/dnr.ts text (`''` if absent).
 *   - `generatedFiles` — committed `*.generated.{ts,tsx}` repo-relative paths.
 */
export function assertSourceClaims(input: {
  source: string;
  dnrSource: string;
  generatedFiles: string[];
}): string[] {
  const { source, dnrSource, generatedFiles } = input;
  const out: string[] = [];

  // Firefox floor must not be hard-coded; doc must point at wxt.config.ts.
  // Forbid the drift-prone literals (the `strict_min_version` key and the
  // stale `113` floor) rather than trying to track the exact number.
  if (/strict_min_version/.test(source)) {
    out.push(
      'SOURCE.md hard-codes a `strict_min_version` literal.\n' +
        '      The Firefox floor lives in apps/extension/wxt.config.ts (gecko / gecko_android).\n' +
        '      Reference that file instead of quoting a version that drifts.',
    );
  }
  if (/\b113(\.0)?\b/.test(source)) {
    out.push(
      'SOURCE.md mentions the stale Firefox floor `113` — the real floors are in\n' +
        '      apps/extension/wxt.config.ts (currently 140.0 desktop / 142.0 Android). Drop the literal.',
    );
  }
  if (!source.includes('apps/extension/wxt.config.ts')) {
    out.push(
      'SOURCE.md must reference apps/extension/wxt.config.ts as the manifest/floor source of truth.',
    );
  }

  // The declarativeNetRequest rule must be described as dynamic, not static.
  // Scope the "static / build-time" prohibition to lines that actually discuss
  // the DNR rule (the doc legitimately says "TypeScript source at build time"
  // elsewhere). The host-match attribution is forbidden anywhere — it is only
  // ever the stale DNR claim.
  const dnrLines = source.split('\n').filter((l) => /declarativeNetRequest|\bDNR\b/i.test(l));
  const staleDnr =
    /\b(static(?:ally)?|build[ -]time)\b/i.exec(dnrLines.join('\n')) ??
    /generated from .*host-match/i.exec(source);
  if (staleDnr) {
    out.push(
      `SOURCE.md describes the declarativeNetRequest rule as "${staleDnr[0]}".\n` +
        '      It is one DYNAMIC rule built at runtime via updateDynamicRules in\n' +
        '      apps/extension/src/lib/dnr.ts. Drop the "static / build-time / host-match" framing.',
    );
  }
  if (!source.includes('apps/extension/src/lib/dnr.ts')) {
    out.push(
      'SOURCE.md must reference apps/extension/src/lib/dnr.ts as the DNR-rule source of truth.',
    );
  }
  // Keep the doc's "dynamic" framing honest against the code it points at.
  if (dnrSource && !dnrSource.includes('updateDynamicRules')) {
    out.push(
      'apps/extension/src/lib/dnr.ts no longer calls updateDynamicRules — SOURCE.md\n' +
        '      describes the rule as a runtime dynamic rule; reconcile the doc with the new mechanism.',
    );
  }

  // Every committed *.generated.{ts,tsx} must be acknowledged in SOURCE.md.
  const unacknowledged = generatedFiles.filter((f) => !source.includes(f));
  if (unacknowledged.length) {
    out.push(
      'SOURCE.md "machine-generated files" note is incomplete — these committed\n' +
        '      *.generated.{ts,tsx} files ship in the archive but are not acknowledged:\n' +
        unacknowledged.map((f) => `        - ${f}`).join('\n') +
        '\n      Add them (with their generator) to the generated-files list in SOURCE.md.',
    );
  }

  return out;
}

/** Read the live inputs from `root` and run the SOURCE.md assertions. */
export function checkSourceParity(root: string, out: string[]): void {
  const sourcePath = resolve(root, 'SOURCE.md');
  if (!existsSync(sourcePath)) {
    out.push(
      `SOURCE.md missing at ${sourcePath} — required at the archive root by scripts/pack-amo-source.sh.`,
    );
    return;
  }
  const dnrPath = resolve(root, 'apps/extension/src/lib/dnr.ts');
  // Scope to git-tracked files so untracked/build artifacts don't trip it.
  const generatedFiles = execFileSync(
    'git',
    ['ls-files', '--', '*.generated.ts', '*.generated.tsx'],
    { cwd: root, encoding: 'utf8' },
  )
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  out.push(
    ...assertSourceClaims({
      source: readFileSync(sourcePath, 'utf8'),
      dnrSource: existsSync(dnrPath) ? readFileSync(dnrPath, 'utf8') : '',
      generatedFiles,
    }),
  );
}

/** Fixture-based self-test of `assertSourceClaims` (good + bad SOURCE.md). */
function runSelfTest(): void {
  const good = {
    source:
      'See apps/extension/wxt.config.ts for the gecko floor. The DNR rule is one ' +
      'dynamic rule built at runtime in apps/extension/src/lib/dnr.ts. Generated: ' +
      'pnpm-lock.yaml and packages/lang-detect/src/frequent.generated.ts.',
    dnrSource: 'await browser.declarativeNetRequest.updateDynamicRules({ addRules: [rule] });',
    generatedFiles: ['packages/lang-detect/src/frequent.generated.ts'],
  };
  const cases: { name: string; input: typeof good; wantPass: boolean }[] = [
    { name: 'corrected SOURCE.md passes', input: good, wantPass: true },
    {
      name: 'reintroduced 113 / strict_min_version literal fails',
      input: { ...good, source: good.source + ' strict_min_version 113.0' },
      wantPass: false,
    },
    {
      name: '"static … build time" DNR claim fails',
      input: {
        ...good,
        source:
          good.source + ' The declarativeNetRequest rules are static, generated at build time.',
      },
      wantPass: false,
    },
    {
      name: 'unacknowledged committed *.generated.ts fails',
      input: {
        ...good,
        generatedFiles: [...good.generatedFiles, 'packages/foo/src/new.generated.ts'],
      },
      wantPass: false,
    },
    {
      name: 'missing wxt.config.ts / dnr.ts references fail',
      input: { ...good, source: 'A doc with no source-of-truth references.' },
      wantPass: false,
    },
    {
      name: 'dnr.ts dropping updateDynamicRules fails',
      input: { ...good, dnrSource: 'no dynamic rules here' },
      wantPass: false,
    },
  ];
  const failures: string[] = [];
  for (const c of cases) {
    const passed = assertSourceClaims(c.input).length === 0;
    if (passed !== c.wantPass) {
      failures.push(
        `  ✗ self-test "${c.name}": expected ${c.wantPass ? 'pass' : 'fail'}, got ${passed ? 'pass' : 'fail'}`,
      );
    }
  }
  if (failures.length) {
    console.error('✗ check-readme-parity self-test failed:\n' + failures.join('\n'));
    process.exit(1);
  }
  console.log(`✓ check-readme-parity self-test: ${cases.length} SOURCE.md assertion cases pass.`);
}

checkSourceParity(repoRoot, errors);

// --- Report ----------------------------------------------------------------
if (errors.length) {
  console.error('✗ README / SOURCE.md parity check failed:\n');
  for (const e of errors) console.error(`  ✗ ${e}\n`);
  console.error('Fix README.md / SOURCE.md, then re-run `pnpm check:readme`.');
  console.error('(Claude Code: invoke the `sync-readme` skill for the README fix procedure.)');
  process.exit(1);
}

console.log(
  `✓ README parity: tagline matches the marketing hero, ` +
    `and the monorepo layout lists all ${actual.size} workspace members.\n` +
    `✓ SOURCE.md parity: no hard-coded Firefox floor, DNR rule described as dynamic, ` +
    `and every committed *.generated file is acknowledged.`,
);
