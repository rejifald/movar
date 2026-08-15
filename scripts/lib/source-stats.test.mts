#!/usr/bin/env node
/**
 * Unit test for the README's source scan (`scripts/lib/source-stats.mts`).
 *
 * The repo has no vitest project that globs the root `scripts/` dir, so this is
 * a self-contained assertion runner (same pattern as
 * scripts/lib/promises.test.mts).
 *
 * Why it exists: `loc` and `suppressions` are DYNAMIC metrics. `--refresh`
 * writes them and `--check` reads them straight back out of the committed
 * snapshot, so no guard ever recomputes them — a wrong number is self-
 * ratifying. `BUILD_DIRS` is the only thing keeping the walk honest, and it
 * fails open: a generated directory nobody listed is counted as source. That
 * is exactly how `apps/marketing/.astro` (~210 lines, written by `astro check`
 * on every commit) inflated the count for months without failing anything.
 *
 * The load-bearing assertion is #1: the walk must never visit a git-IGNORED
 * path. Stated that way rather than "must equal the tracked files", it still
 * catches every generated directory while staying quiet for a developer
 * holding a new, not-yet-committed source file.
 *
 * That assertion has teeth on CI because of where `test:scripts` sits in the
 * verify job: `pnpm typecheck` runs earlier and shells out to `astro check`,
 * which — with no nx cache restored on a fresh runner — runs cold and writes
 * the `.astro` dir. So the runner has real generated output to catch, not a
 * pristine checkout. The planted fixture below covers the case either way.
 *
 * Run: tsx scripts/lib/source-stats.test.mts   (also `pnpm test:source-stats`)
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import nodePath from 'node:path';
import { fileURLToPath } from 'node:url';
import { SOURCE_GROUPS, scanSourceStats, sourceFiles } from './source-stats.mts';

const repoRoot = nodePath.resolve(nodePath.dirname(fileURLToPath(import.meta.url)), '..', '..');

let failed = 0;
function ok(label: string): void {
  console.log(`  ✓ ${label}`);
}
function bad(label: string): void {
  console.error(`  ✗ ${label}`);
  failed += 1;
}

console.log('==> README source-scan unit test');

// --- 1. The live tree: the walk visits no git-ignored file -------------------
// `--cached --others --exclude-standard` = tracked + untracked-but-not-ignored,
// i.e. every path git considers part of the working source. Anything the walk
// sees that is absent from that list is, by definition, ignored build output.
const gitKnown = new Set(
  execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', ...SOURCE_GROUPS],
    {
      cwd: repoRoot,
      encoding: 'utf8',
      maxBuffer: 1 << 28,
    },
  )
    .split('\n')
    .filter((p) => /\.tsx?$/.test(p)),
);

const walked = sourceFiles(repoRoot);
const walkedSet = new Set(walked);
const ignoredHits = walked.filter((p) => !gitKnown.has(p));
if (ignoredHits.length === 0) {
  ok(`walk visits ${walked.length} files, none of them git-ignored`);
} else {
  bad(
    `the walk counted ${ignoredHits.length} git-ignored file(s) as source — add the ` +
      `generated directory to BUILD_DIRS in scripts/lib/source-stats.mts:\n` +
      ignoredHits.map((p) => `      ${p}`).join('\n'),
  );
}

// The converse: an over-broad BUILD_DIRS entry would silently drop real source.
// Compare only against files that exist on disk, so an unstaged deletion in a
// developer's tree isn't reported as a scanning bug.
const dropped = [...gitKnown].filter(
  (p) => !walkedSet.has(p) && existsSync(nodePath.resolve(repoRoot, p)),
);
if (dropped.length === 0) {
  ok('walk drops no real source file');
} else {
  bad(
    `the walk skipped ${dropped.length} real source file(s) — a BUILD_DIRS entry is too ` +
      `broad:\n` +
      dropped.map((p) => `      ${p}`).join('\n'),
  );
}

// --- 2. A planted fixture: what is counted, and what is skipped --------------
// `scanSourceStats` matches these markers by substring, so writing them
// literally here would enrol this file in the repo's own suppression budget
// (scripts/check-suppressions.mts scans every file, and would reject an
// unjustified one). Assemble them instead: identical fixture bytes, inert source.
const ESLINT_MARK = ['eslint', 'disable'].join('-');
const FALLOW_MARK = ['fallow', 'ignore'].join('-');

const fixture = mkdtempSync(nodePath.resolve(tmpdir(), 'movar-source-stats-'));
try {
  const write = (rel: string, body: string): void => {
    const full = nodePath.resolve(fixture, rel);
    mkdirSync(nodePath.dirname(full), { recursive: true });
    writeFileSync(full, body);
  };

  write('apps/web/src/keep.ts', 'export const a = 1;\n'); // 2 lines
  write('packages/core/src/core.ts', `// ${FALLOW_MARK}-next-line\nexport const b = 2;\n`); // 3
  write('apps/web/src/keep.test.ts', `// ${ESLINT_MARK}-next-line\nimport './keep.ts';\n`);
  // Skipped: the regression this test exists for, plus a vendored dir.
  write('apps/web/.astro/content.d.ts', 'declare const junk: 1;\n'.repeat(99));
  write('apps/web/node_modules/dep/index.ts', 'export const dep = 1;\n'.repeat(20));

  const files = sourceFiles(fixture);
  const expected = [
    'apps/web/src/keep.test.ts',
    'apps/web/src/keep.ts',
    'packages/core/src/core.ts',
  ];
  if (JSON.stringify(files) === JSON.stringify(expected)) {
    ok('.astro and node_modules are skipped; real source (incl. tests) is visited');
  } else {
    bad(`unexpected file set: ${JSON.stringify(files)}`);
  }

  // loc counts the two non-test files (2 + 3); suppressions count every file,
  // so the test file's marker is tallied even though its lines are not.
  const stats = scanSourceStats(fixture);
  if (stats.loc === 5) ok('loc counts non-test source only (2 + 3 lines)');
  else bad(`loc should be 5, got ${stats.loc}`);
  if (stats.eslint === 1 && stats.fallow === 1) {
    ok('suppressions are counted in test files too (1 eslint, 1 fallow)');
  } else {
    bad(`suppressions should be 1/1, got ${stats.eslint}/${stats.fallow}`);
  }

  // The fail-open boundary, asserted rather than assumed: a generated directory
  // that nobody added to BUILD_DIRS IS counted. Nothing in the script catches
  // that — assertion #1 against the live tree is the only thing that does.
  write('apps/web/.newtool/generated.ts', 'export const gen = 1;\n'.repeat(10));
  const afterNewTool = scanSourceStats(fixture);
  if (afterNewTool.loc === 5 + 11) {
    ok('an unlisted generated dir IS counted (fail-open — assertion #1 is the backstop)');
  } else {
    bad(`unlisted generated dir should add 11 lines, got loc ${afterNewTool.loc}`);
  }
} finally {
  rmSync(fixture, { recursive: true, force: true });
}

console.log(failed === 0 ? '\n✓ all source-scan checks passed' : `\n✗ ${failed} check(s) failed`);
process.exit(failed > 0 ? 1 : 0);
