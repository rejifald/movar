#!/usr/bin/env node
/**
 * Regression test for the metrics-gate absolute coverage floor (issue #114).
 *
 * The repo has no vitest project globbing root `scripts/`, so this is a small
 * spawn-based runner (same pattern as the other script tests). It drives
 * scripts/metrics-gate.mts with fixture snapshots via the `RECOMPUTED_SNAPSHOT`
 * and `COMMITTED_SNAPSHOT` env overrides and asserts:
 *
 *   1. coverage below the floor  -> exit 3 (the floor), even WITH the accept
 *      label set — the floor is non-waivable.
 *   2. coverage above the floor, fresh, no regression/audit -> exit 0.
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

/** The source half of a snapshot. Defaults are shared by both sides of a run,
 *  so check 5 passes and the coverage cases stay isolated from it. */
interface Source {
  loc: number;
  suppressions: { eslint: number; fallow: number };
}
const SOURCE: Source = { loc: 61783, suppressions: { eslint: 46, fallow: 23 } };

function snapshot(coverage: { lines: number; branches: number }, source: Source = SOURCE): string {
  const p = nodePath.join(tmp, `snap-${coverage.lines}-${coverage.branches}-${Math.random()}.json`);
  writeFileSync(p, JSON.stringify({ coverage, ...source }));
  return p;
}

/** Run the gate with a given recomputed + committed coverage (kept equal so the
 *  freshness check passes and we isolate the floor) and optional accept label. */
function runGate(
  coverage: { lines: number; branches: number },
  opts: { acceptLabel?: boolean; committedSource?: Source } = {},
): number {
  const recomputed = snapshot(coverage);
  // Equal coverage -> fresh. `committedSource` skews only the source half, so a
  // check-5 case cannot accidentally trip the coverage checks.
  const committed = snapshot(coverage, opts.committedSource ?? SOURCE);
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

console.log('==> metrics-gate source freshness (check 5)');

const GREEN = { lines: 92.7, branches: 85.6 };

// LOC_TOLERANCE is 500. Drift inside the band is what the band is for: a PR that
// moves a few hundred lines must not be made to re-run anything.
expectExit(
  'loc drift inside the tolerance passes',
  runGate(GREEN, { committedSource: { ...SOURCE, loc: SOURCE.loc - 499 } }),
  0,
);
expectExit(
  'loc drift past the tolerance fails with exit 4',
  runGate(GREEN, { committedSource: { ...SOURCE, loc: SOURCE.loc - 501 } }),
  4,
);
// Non-waivable, exactly like the floor: the label must not rescue it.
expectExit(
  'loc drift past the tolerance still fails WITH the accept label',
  runGate(GREEN, {
    acceptLabel: true,
    committedSource: { ...SOURCE, loc: SOURCE.loc - 501 },
  }),
  4,
);
// Suppressions are gated exactly, so one silently-added disable is caught where
// the same delta in `loc` would sit well inside the band.
expectExit(
  'a single extra eslint suppression fails with exit 4',
  runGate(GREEN, {
    committedSource: { ...SOURCE, suppressions: { eslint: 45, fallow: 23 } },
  }),
  4,
);
expectExit(
  'a single extra fallow suppression fails with exit 4',
  runGate(GREEN, {
    committedSource: { ...SOURCE, suppressions: { eslint: 46, fallow: 22 } },
  }),
  4,
);

rmSync(tmp, { recursive: true, force: true });

if (failed > 0) {
  console.error(`✗ metrics-gate floor test FAILED (${failed} case(s))`);
  process.exit(1);
}
console.log('✓ metrics-gate floor test passed');
