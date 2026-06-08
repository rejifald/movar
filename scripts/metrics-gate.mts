#!/usr/bin/env node
/**
 * PR-time metrics gate: fail the check when a pull request degrades the
 * project's measured quality, unless the regression is explicitly acknowledged.
 *
 * This is the enforcement half of the README "## Metrics" story. `pnpm metrics`
 * snapshots the dynamic numbers (Vitest coverage, fallow health) into the
 * committed `scripts/readme-metrics.snapshot.json`, and `pnpm check:readme`
 * (CI `verify` job) keeps the README *rendering* in sync with that snapshot.
 * What neither does is notice when the snapshot itself silently drifts from
 * reality — `check:readme` reads the same committed file to both render and
 * verify, so a PR that quietly lowers coverage keeps a stale-but-consistent
 * badge and stays green. This gate closes that hole by recomputing the real
 * numbers in CI and comparing them three ways:
 *
 *   1. FRESHNESS (coverage): the recomputed coverage must equal what the PR
 *      committed in the snapshot. A mismatch means the committed snapshot is
 *      stale or hand-edited — the author must run `pnpm metrics` and commit.
 *      Not acknowledgeable: a wrong number isn't a "regression", it's wrong.
 *      Enforcing this on every PR is also what keeps `main`'s snapshot honest,
 *      so it can serve as the regression BASELINE below without re-running
 *      coverage on the base commit.
 *
 *   2. REGRESSION (coverage): the recomputed coverage must not drop below the
 *      base commit's snapshot (`git show <base>:…snapshot.json`).
 *
 *   3. REGRESSION (code quality): `fallow audit --base <base>` must not report
 *      new dead code, complexity, or duplication. The workflow runs that step
 *      with `continue-on-error` and passes its outcome in via `AUDIT_OUTCOME`.
 *
 * A regression (2 or 3) fails the gate UNLESS the PR carries the
 * `accept-metrics-regression` label (`HAS_ACCEPT_LABEL=true`) — the human
 * override. The label is meant to be applied only by a maintainer; a companion
 * workflow (`metrics-override-guard.yml`) strips it when a bot account applies
 * it, so automation cannot wave its own regression through. (That guard can
 * only act on *identity*; if agents run under a maintainer's own account it is
 * an audit trail rather than a hard wall — see docs/metrics-gate.md.)
 *
 * The absolute fallow health SCORE is deliberately NOT gated here: it folds in
 * git churn, so it drifts commit-to-commit independent of the diff and would
 * make this check flaky. Base-relative code-quality regressions are caught by
 * `fallow audit` (3) instead, which is built for exactly that comparison.
 *
 * Exit codes: 0 = pass (or acknowledged), 1 = unacknowledged regression,
 * 2 = stale/invalid snapshot (freshness). The workflow treats any non-zero as
 * a failed required check.
 */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const snapshotRel = 'scripts/readme-metrics.snapshot.json';
const snapshotPath = resolve(repoRoot, snapshotRel);

// Coverage numbers are stored to one decimal place, so equal runs reproduce
// exactly; the epsilon only absorbs floating-point dust, not a real 0.1pp move.
const EPS = 0.05;

interface Coverage {
  lines: number;
  branches: number;
}
interface Snapshot {
  coverage?: Coverage;
}

function readSnapshot(path: string, label: string): Snapshot {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Snapshot;
  } catch (error) {
    throw new Error(
      `[metrics-gate] could not read the ${label} snapshot at ${path}: ${String(error)}`,
    );
  }
}

/** The base commit's committed snapshot, read straight out of git so the gate
 *  never has to run coverage on the base ref. Returns null if the base predates
 *  the snapshot file (e.g. the very first PR to introduce it). */
function readBaseSnapshot(baseSha: string): Snapshot | null {
  try {
    const json = execFileSync('git', ['show', `${baseSha}:${snapshotRel}`], {
      cwd: repoRoot,
      encoding: 'utf8',
    });
    return JSON.parse(json) as Snapshot;
  } catch {
    console.warn(
      `[metrics-gate] no ${snapshotRel} at base ${baseSha.slice(0, 12)} — skipping the coverage-regression check (freshness + fallow audit still apply).`,
    );
    return null;
  }
}

const baseSha = process.env.BASE_SHA;
if (!baseSha) throw new Error('[metrics-gate] BASE_SHA is required (the PR base commit SHA).');
const committedPath = process.env.COMMITTED_SNAPSHOT;
if (!committedPath) {
  throw new Error(
    '[metrics-gate] COMMITTED_SNAPSHOT is required (path to the pre-refresh snapshot copy).',
  );
}
const auditFailed = process.env.AUDIT_OUTCOME === 'failure';
const acknowledged = process.env.HAS_ACCEPT_LABEL === 'true';

// `snapshotPath` was just rewritten by `pnpm gen:readme --refresh`, so it holds
// the freshly recomputed truth for this PR head; `committedPath` is the copy
// taken before the refresh, i.e. what the PR actually committed.
const recomputed = readSnapshot(snapshotPath, 'recomputed');
const committed = readSnapshot(committedPath, 'committed');
const base = readBaseSnapshot(baseSha);

if (!recomputed.coverage) {
  throw new Error(
    '[metrics-gate] recomputed snapshot has no coverage — did `pnpm test:coverage` and `pnpm gen:readme --refresh` run first?',
  );
}
const fresh = recomputed.coverage;

// --- 1. Freshness: committed coverage must match the recomputed truth --------
const committedCov = committed.coverage;
const coverageStale =
  !committedCov ||
  Math.abs(committedCov.lines - fresh.lines) > EPS ||
  Math.abs(committedCov.branches - fresh.branches) > EPS;
if (coverageStale) {
  const was = committedCov
    ? `${committedCov.lines}% lines / ${committedCov.branches}% branches`
    : '(absent)';
  console.error('✗ Committed coverage is stale or inaccurate.');
  console.error(`    committed: ${was}`);
  console.error(`    recomputed: ${fresh.lines}% lines / ${fresh.branches}% branches`);
  console.error(`  Run \`pnpm metrics\` and commit ${snapshotRel} (+ README.md), then push.`);
  process.exit(2);
}

// --- 2 + 3. Regressions: coverage drop vs base, or new fallow audit issues ----
const regressions: string[] = [];
if (base?.coverage) {
  if (fresh.lines < base.coverage.lines - EPS) {
    regressions.push(`line coverage ${fresh.lines}% < base ${base.coverage.lines}%`);
  }
  if (fresh.branches < base.coverage.branches - EPS) {
    regressions.push(`branch coverage ${fresh.branches}% < base ${base.coverage.branches}%`);
  }
}
if (auditFailed) {
  regressions.push(
    'fallow audit reported new dead code / complexity / duplication vs base (see the "fallow audit" step log above)',
  );
}

if (regressions.length === 0) {
  console.log(
    `✓ No metrics regression. Coverage: ${fresh.lines}% lines / ${fresh.branches}% branches.`,
  );
  process.exit(0);
}

const bullets = regressions.map((r) => `  • ${r}`).join('\n');
if (acknowledged) {
  console.warn('⚠ Metrics regression ACKNOWLEDGED via the `accept-metrics-regression` label:');
  console.warn(bullets);
  console.warn('  Merging is allowed because a maintainer accepted the regression.');
  process.exit(0);
}

console.error('✗ This PR degrades project metrics:');
console.error(bullets);
console.error('');
console.error('  Fix the regression, or — if it is intentional — have a maintainer add the');
console.error('  `accept-metrics-regression` label to record an explicit, reviewed exception.');
process.exit(1);
