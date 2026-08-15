#!/usr/bin/env node
/**
 * Regression tests for the two non-waivable metrics-gate checks: the absolute
 * coverage floor (issue #114) and snapshot freshness.
 *
 * The repo has no vitest project globbing root `scripts/`, so this is a small
 * spawn-based runner (same pattern as the other script tests). It drives
 * scripts/metrics-gate.mts with fixture snapshots via the `RECOMPUTED_SNAPSHOT`
 * and `COMMITTED_SNAPSHOT` env overrides and asserts:
 *
 *   1. coverage below the floor  -> exit 3 (the floor), even WITH the accept
 *      label set — the floor is non-waivable.
 *   2. coverage above the floor, fresh, no regression/audit -> exit 0.
 *   3. a committed LOC that disagrees with the recomputed one -> exit 2
 *      (staleness), also with the accept label set — freshness is likewise
 *      non-waivable.
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

/** The gate compares committed LOC against recomputed LOC, so the absolute
 *  value is irrelevant to every assertion below — only whether the two agree. */
const LOC = 60_917;

function snapshot(coverage: { lines: number; branches: number }, loc: number): string {
  const p = nodePath.join(tmp, `snap-${coverage.lines}-${coverage.branches}-${Math.random()}.json`);
  writeFileSync(p, JSON.stringify({ coverage, loc }));
  return p;
}

/** Run the gate with a given recomputed + committed coverage (kept equal so the
 *  freshness check passes and we isolate the floor) and optional accept label.
 *  `committedLoc` defaults to the recomputed value; override it to make the
 *  committed snapshot stale. */
function runGate(
  coverage: { lines: number; branches: number },
  opts: { acceptLabel?: boolean; committedLoc?: number } = {},
): number {
  const recomputed = snapshot(coverage, LOC);
  const committed = snapshot(coverage, opts.committedLoc ?? LOC); // equal -> fresh
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

console.log('==> metrics-gate LOC freshness');

// A committed LOC that disagrees with the recomputed one is stale (exit 2) —
// this is the check that would have caught generated `.astro` type files
// inflating the count. Like coverage freshness, the accept label must not
// rescue it: the number is simply wrong, not a trade-off.
const fresh = { lines: 92.7, branches: 85.6 };
expectExit('stale committed LOC fails with exit 2', runGate(fresh, { committedLoc: LOC + 210 }), 2);
expectExit(
  'stale committed LOC still fails (exit 2) even WITH the accept label',
  runGate(fresh, { committedLoc: LOC + 210, acceptLabel: true }),
  2,
);

rmSync(tmp, { recursive: true, force: true });

if (failed > 0) {
  console.error(`✗ metrics-gate test FAILED (${failed} case(s))`);
  process.exit(1);
}
console.log('✓ metrics-gate floor + freshness tests passed');
