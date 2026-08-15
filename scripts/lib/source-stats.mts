/**
 * The README's source scan: total TypeScript lines under `apps/` + `packages/`
 * (tests excluded) and the inline-suppression counts (every file). Feeds the
 * `loc` and `suppressions` entries of `scripts/readme-metrics.snapshot.json`
 * via `gen-readme-metrics.mts --refresh`.
 *
 * Extracted from that script so it can be unit-tested: importing the script
 * itself executes its top level, which rewrites README.md. See
 * `scripts/lib/source-stats.test.mts` — in particular the live-tree assertion
 * that {@link sourceFiles} visits exactly the repo's tracked TypeScript, which
 * is what makes {@link BUILD_DIRS} verifiable rather than fail-open.
 *
 * Side-effect-free and path-explicit: every reader takes `repoRoot`. Nothing is
 * written here.
 */
import { readFileSync, readdirSync } from 'node:fs';
import nodePath from 'node:path';

/** The workspace groups the scan covers — the two the README's LOC figure
 *  claims ("TypeScript under `apps/` + `packages/`"). Absent groups throw
 *  rather than silently under-count. */
export const SOURCE_GROUPS = ['apps', 'packages'] as const;

/** Directories the scan never descends into. Every entry is gitignored tool
 *  output, so counting one would make `loc` depend on which tools happen to
 *  have run in the tree rather than on what the repo contains. `.astro` is
 *  Astro's generated content/type stubs: `astro check` writes them, and
 *  `nx run marketing:typecheck` runs it on every commit, so most working trees
 *  carry ~210 lines of them that CI's fresh checkout does not.
 *
 *  This list still fails open in the sense that matters — a generated directory
 *  that isn't named here is walked into, and its files are counted as source.
 *  Two things catch that now, and they catch different halves: the live-tree
 *  assertion in `source-stats.test.mts` fails the moment such a directory holds
 *  a `.ts` file in *someone's* tree, and the freshness check in
 *  `metrics-gate.mts` fails when the committed `loc` drifts from a live scan by
 *  more than its tolerance. Neither notices a generated directory that is
 *  simply never present on CI, which is why entries are added here on the
 *  evidence of `.gitignore` rather than on the evidence of a failure. */
export const BUILD_DIRS = new Set([
  'node_modules',
  '.output',
  'dist',
  '.nx',
  '.wxt',
  '.astro',
  'coverage',
  '.turbo',
  'test-results',
  'playwright-report',
  'storybook-static',
  'demo-results',
  '.wrangler',
]);

/**
 * Generated directories whose name carries a run-specific suffix, matched by
 * prefix rather than by name.
 *
 * `.gitignore` spells this `playwright-report*`, and the naive translation of
 * that glob — `name.startsWith('playwright-report')` — also swallows a
 * hand-written `playwright-reporter/`, hiding real source from the count
 * permanently and silently. The trailing `-` is the whole difference: it covers
 * the suffixed report dirs (`-live`, `-compare`) and nothing a package would
 * plausibly be called.
 */
export const BUILD_DIR_PREFIXES = ['playwright-report-'];

/** Whether the walk should refuse to descend into a directory of this name. */
export function isBuildDir(name: string): boolean {
  return BUILD_DIRS.has(name) || BUILD_DIR_PREFIXES.some((prefix) => name.startsWith(prefix));
}

/** Test/spec/helper files, excluded from the source-line count. */
export const isTest = (name: string): boolean => /\.(test|spec|test-utils)\.tsx?$/.test(name);

/** Every `.ts`/`.tsx` file the scan visits, as repo-relative POSIX paths.
 *  Tests are included — they carry suppressions even though they carry no
 *  `loc` — so this is the full visited set, not the counted one. */
export function sourceFiles(repoRoot: string): string[] {
  const found: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = nodePath.resolve(dir, entry.name);
      if (entry.isDirectory()) {
        if (!isBuildDir(entry.name)) walk(full);
      } else if (/\.tsx?$/.test(entry.name)) {
        found.push(nodePath.relative(repoRoot, full).split(nodePath.sep).join('/'));
      }
    }
  };
  for (const group of SOURCE_GROUPS) walk(nodePath.resolve(repoRoot, group));
  return found.toSorted();
}

/** Single pass over {@link sourceFiles}: total source lines (tests excluded)
 *  and inline-suppression counts (every file). Volatile, so the values are
 *  snapshotted by `--refresh` rather than recomputed by the guard. */
export function scanSourceStats(repoRoot: string): {
  loc: number;
  eslint: number;
  fallow: number;
} {
  let loc = 0;
  let eslint = 0;
  let fallow = 0;
  for (const rel of sourceFiles(repoRoot)) {
    const text = readFileSync(nodePath.resolve(repoRoot, rel), 'utf8');
    eslint += (text.match(/eslint-disable/g) ?? []).length;
    fallow += (text.match(/fallow-ignore/g) ?? []).length;
    if (!isTest(nodePath.basename(rel))) loc += text.split('\n').length;
  }
  return { loc, eslint, fallow };
}
