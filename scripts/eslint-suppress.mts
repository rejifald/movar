#!/usr/bin/env tsx
/**
 * eslint-suppress.mts — manage the workspace's ESLint bulk-suppression snapshots.
 *
 * Lint is sharded per-project by Nx: each app/package runs `eslint .` from its
 * own cwd (see each project.json), and `lint:root` lints `tooling/` + the root
 * config from the repo root. ESLint resolves its bulk-suppressions file
 * (`eslint-suppressions.json`) relative to the cwd of each run, so the snapshot
 * is necessarily *per shard* — one file per project plus one at the repo root —
 * not a single workspace-wide file. (A shared file is impossible anyway: its
 * keys are paths relative to the cwd, so `src/index.ts` from two packages would
 * collide.)
 *
 * This script fans the operation out to every shard:
 *   - default        `--suppress-all`       snapshot every current violation as
 *                                           the ratchet floor (new code is then
 *                                           held to the rule; the backlog only
 *                                           shrinks).
 *   - `--prune`      `--prune-suppressions` drop entries that no longer match a
 *                                           finding (run after fixing some).
 *
 * ESLint runs here WITHOUT `--cache` so the snapshot is computed from a full,
 * deterministic re-lint (the per-project `lint` targets keep `--cache` for
 * speed; a snapshot must not trust a stale cache). Finally, any snapshot that
 * came back empty (`{}`) is deleted, so "a file exists" == "this shard has a
 * suppressed backlog" stays a true invariant.
 *
 * Usage:
 *   pnpm lint:suppress   # tsx scripts/eslint-suppress.mts
 *   pnpm lint:prune      # tsx scripts/eslint-suppress.mts --prune
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const eslintBin = resolve(repoRoot, 'node_modules/.bin/eslint');
const mode = process.argv.includes('--prune') ? '--prune-suppressions' : '--suppress-all';

/** Every app/package that owns an `eslint.config.mjs` is a lint shard. Sorted
 *  so console output is deterministic across machines. */
function shardDirs(): string[] {
  const dirs: string[] = [];
  for (const group of ['apps', 'packages']) {
    const groupDir = join(repoRoot, group);
    for (const name of readdirSync(groupDir).sort()) {
      const dir = join(groupDir, name);
      if (existsSync(join(dir, 'eslint.config.mjs'))) dirs.push(dir);
    }
  }
  return dirs;
}

/** Run ESLint in one shard. `--suppress-all` exits 0; `--prune-suppressions`
 *  can exit non-zero when unsuppressed violations remain — that is not a script
 *  failure (the snapshot was still rewritten), so swallow a non-zero status and
 *  let the next `pnpm lint` report whatever is left. */
function runEslint(cwd: string, paths: string[]): void {
  try {
    execFileSync(eslintBin, [...paths, mode], { cwd, stdio: 'inherit' });
  } catch {
    // non-zero exit (e.g. remaining violations on prune) — intentional; see above
  }
}

// The repo-root shard mirrors `lint:root` exactly (tooling/ + the root config).
runEslint(repoRoot, ['tooling/', 'eslint.config.mjs']);
for (const dir of shardDirs()) runEslint(dir, ['.']);

// Drop empty snapshots so the tree only carries files that represent real
// backlog.
let kept = 0;
let removed = 0;
for (const dir of [repoRoot, ...shardDirs()]) {
  const file = join(dir, 'eslint-suppressions.json');
  if (!existsSync(file)) continue;
  const raw = readFileSync(file, 'utf8');
  if (Object.keys(JSON.parse(raw) as Record<string, unknown>).length === 0) {
    rmSync(file);
    removed++;
  } else {
    // ESLint writes the snapshot without a trailing newline; add one so the
    // file is prettier-clean and re-running suppress doesn't churn the diff.
    if (!raw.endsWith('\n')) writeFileSync(file, `${raw}\n`);
    kept++;
  }
}

console.log(
  `eslint-suppress (${mode}): ${kept} snapshot${kept === 1 ? '' : 's'} kept, ${removed} empty removed.`,
);
