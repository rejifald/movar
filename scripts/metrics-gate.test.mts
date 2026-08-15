#!/usr/bin/env node
/**
 * Regression tests for the non-waivable halves of the metrics gate: the absolute
 * coverage floor (issue #114) and the source-scan freshness check that keeps the
 * README's LOC / suppression numbers from drifting silently.
 *
 * The repo has no vitest project globbing root `scripts/`, so this is a small
 * spawn-based runner (same pattern as the other script tests). It drives
 * scripts/metrics-gate.mts with fixture snapshots via the `RECOMPUTED_SNAPSHOT`
 * and `COMMITTED_SNAPSHOT` env overrides and asserts:
 *
 *   1. coverage below the floor  -> exit 3 (the floor), even WITH the accept
 *      label set — the floor is non-waivable.
 *   2. coverage above the floor, fresh, no regression/audit -> exit 0.
 *   3. LOC drift inside  LOC_TOLERANCE -> exit 0 (the band is the point: LOC
 *      moves on every PR, so a small post-refresh delta must not go red).
 *   4. LOC drift outside LOC_TOLERANCE -> exit 4, and still 4 WITH the accept
 *      label — freshness is not a trade-off to acknowledge.
 *   5. suppression counts off by one -> exit 4 (exact match, no band).
 *   6. stale coverage AND stale source -> exit 2, so the author is sent to the
 *      full `pnpm metrics` that fixes both rather than the cheap refresh.
 *
 * BASE_SHA is a bogus sha on purpose: the gate handles a missing base snapshot
 * gracefully (skips the base-relative regression check), isolating the floor.
 *
 * Run: tsx scripts/metrics-gate.test.mts   (also `pnpm test:metrics-gate`)
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import nodePath from 'node:path';
import { fileURLToPath } from 'node:url';

const here = nodePath.dirname(fileURLToPath(import.meta.url));
const gateScript = nodePath.join(here, 'metrics-gate.mts');
const tmp = mkdtempSync(nodePath.join(tmpdir(), 'movar-metrics-gate-'));

/** The scanned half of a snapshot: absent by default, so the floor cases below
 *  exercise the coverage path exactly as they did before check 5 existed. */
interface SourceStats {
  loc?: number;
  suppressions?: { eslint: number; fallow: number };
}

function snapshot(coverage: { lines: number; branches: number }, stats: SourceStats = {}): string {
  const p = nodePath.join(tmp, `snap-${coverage.lines}-${coverage.branches}-${Math.random()}.json`);
  writeFileSync(p, JSON.stringify({ coverage, ...stats }));
  return p;
}

/** Run the gate with a given recomputed + committed coverage (kept equal so the
 *  freshness check passes and we isolate the floor) and optional accept label. */
function runGate(
  coverage: { lines: number; branches: number },
  opts: {
    acceptLabel?: boolean;
    /** Source stats for each side; equal (or both absent) -> fresh. */
    recomputedStats?: SourceStats;
    committedStats?: SourceStats;
    committedCoverage?: { lines: number; branches: number };
  } = {},
): number {
  const recomputed = snapshot(coverage, opts.recomputedStats ?? {});
  // equal -> fresh, unless a case deliberately skews one side
  const committed = snapshot(opts.committedCoverage ?? coverage, opts.committedStats ?? {});
  const result = spawnSync('npx', ['--no-install', 'tsx', gateScript], {
    env: {
      ...process.env,
      RECOMPUTED_SNAPSHOT: recomputed,
      COMMITTED_SNAPSHOT: committed,
      BASE_SHA: '0000000000000000000000000000000000000000',
      AUDIT_OUTCOME: 'success',
      HAS_ACCEPT_LABEL: opts.acceptLabel ? 'true' : 'false',
    },
    encoding: 'utf8',
  });
  return result.status ?? -1;
}

let failed = 0;
function expectExit(label: string, actual: number, expected: number): void {
  if (actual === expected) {
    console.log(`  ✓ ${label} (exit ${actual})`);
  } else {
    console.error(`  ✗ ${label} — expected exit ${expected}, got ${actual}`);
    failed += 1;
  }
}

console.log('==> metrics-gate coverage-floor regression (issue #114)');

// Floor is { lines: 91.7, branches: 84.6 }. A snapshot a couple points under it
// must fail with code 3, and the accept label must NOT rescue it.
expectExit('below floor fails with exit 3', runGate({ lines: 89, branches: 82 }), 3);
expectExit(
  'below floor still fails (exit 3) even WITH the accept label',
  runGate({ lines: 89, branches: 82 }, { acceptLabel: true }),
  3,
);
// A snapshot at the current real numbers clears the floor, is fresh, and has no
// regression (bogus base + AUDIT_OUTCOME=success) -> pass.
expectExit('above floor, fresh, no regression passes', runGate({ lines: 92.7, branches: 85.6 }), 0);

console.log('==> metrics-gate source-scan freshness (LOC + suppressions)');

const OK = { lines: 92.7, branches: 85.6 };
const SUPS = { eslint: 46, fallow: 23 };
// LOC_TOLERANCE is 500. Same suppression counts on both sides throughout, so
// each case isolates one variable.
const withLoc = (loc: number): SourceStats => ({ loc, suppressions: SUPS });

expectExit(
  'LOC drift inside the tolerance band passes',
  runGate(OK, { recomputedStats: withLoc(60917), committedStats: withLoc(60500) }),
  0,
);
expectExit(
  'LOC drift exactly at the tolerance band passes',
  runGate(OK, { recomputedStats: withLoc(60917), committedStats: withLoc(60417) }),
  0,
);
expectExit(
  'LOC drift past the tolerance band fails with exit 4',
  runGate(OK, { recomputedStats: withLoc(60917), committedStats: withLoc(60416) }),
  4,
);
// The real #463 case, scaled up: main understated LOC by 184 lines and nothing
// noticed. 184 is inside the band by design; what must never pass is unbounded
// drift, so assert the far end fails even when a maintainer waves the label.
expectExit(
  'LOC drift past the band is NOT waivable by the accept label',
  runGate(OK, {
    recomputedStats: withLoc(60917),
    committedStats: withLoc(56717),
    acceptLabel: true,
  }),
  4,
);
expectExit(
  'suppression count off by one fails with exit 4 (no band)',
  runGate(OK, {
    recomputedStats: withLoc(60917),
    committedStats: { loc: 60917, suppressions: { eslint: 45, fallow: 23 } },
  }),
  4,
);
expectExit(
  'committed source stats absent entirely fails with exit 4',
  runGate(OK, { recomputedStats: withLoc(60917), committedStats: {} }),
  4,
);
expectExit(
  'matching source stats pass',
  runGate(OK, { recomputedStats: withLoc(60917), committedStats: withLoc(60917) }),
  0,
);
// Coverage staleness outranks source staleness: `pnpm metrics` fixes both, so
// the author must be sent there (exit 2), not to the cheap source-only refresh.
expectExit(
  'stale coverage AND stale source reports exit 2, not 4',
  runGate(OK, {
    committedCoverage: { lines: 90.1, branches: 83.2 },
    recomputedStats: withLoc(60917),
    committedStats: withLoc(50000),
  }),
  2,
);

rmSync(tmp, { recursive: true, force: true });

if (failed > 0) {
  console.error(`✗ metrics-gate test FAILED (${failed} case(s))`);
  process.exit(1);
}
console.log('✓ metrics-gate tests passed');
