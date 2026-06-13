#!/usr/bin/env node
/**
 * Unit test for the action-pin guard's classification (issue #112).
 *
 * The repo has no vitest project that globs the root `scripts/` dir, so this is
 * a tiny self-contained assertion runner (same pattern as
 * scripts/edge-poll-gate.test.sh). It exercises `extractUsesPins` directly —
 * the pure classifier the guard is built on — asserting it REJECTS a tag-pinned
 * `uses:` and ACCEPTS a SHA-pinned one (and the other edge cases).
 *
 * Run: tsx scripts/check-action-pins.test.mts   (also `pnpm test:action-pins`)
 */
import { extractUsesPins } from './check-action-pins.mts';

const SHA = 'df4cb1c069e1874edd31b4311f1884172cec0e10';

interface Case {
  label: string;
  yaml: string;
  expectPinned: boolean;
}

const cases: Case[] = [
  {
    label: 'tag-pinned uses: is REJECTED',
    yaml: '      - uses: actions/checkout@v6',
    expectPinned: false,
  },
  {
    label: 'SHA-pinned uses: (with # comment) is ACCEPTED',
    yaml: `      - uses: actions/checkout@${SHA} # v6.0.3`,
    expectPinned: true,
  },
  {
    label: 'SHA-pinned uses: (no comment) is ACCEPTED',
    yaml: `      - uses: actions/setup-node@${SHA}`,
    expectPinned: true,
  },
  {
    label: 'short-sha uses: is REJECTED',
    yaml: '      - uses: actions/checkout@df4cb1c',
    expectPinned: false,
  },
  {
    label: 'branch-ref uses: is REJECTED',
    yaml: '      - uses: actions/checkout@main',
    expectPinned: false,
  },
  {
    label: 'local ./ ref is ACCEPTED (exempt)',
    yaml: '      - uses: ./.github/actions/local-thing',
    expectPinned: true,
  },
  {
    label: 'step-level (deeper indent) uses: is still classified',
    yaml: `        uses: cloudflare/wrangler-action@${SHA} # v4.0.0`,
    expectPinned: true,
  },
];

let failed = 0;
console.log('==> action-pin classifier unit test (issue #112)');
for (const { label, yaml, expectPinned } of cases) {
  const pins = extractUsesPins(yaml);
  if (pins.length !== 1) {
    console.error(`  ✗ ${label} — expected exactly 1 uses: parsed, got ${pins.length}`);
    failed += 1;
    continue;
  }
  const got = pins[0]!.pinned;
  if (got !== expectPinned) {
    console.error(`  ✗ ${label} — expected pinned=${expectPinned}, got ${got}`);
    failed += 1;
  } else {
    console.log(`  ✓ ${label}`);
  }
}

// A non-uses line must not be picked up.
if (extractUsesPins('      - run: pnpm install').length !== 0) {
  console.error('  ✗ a `run:` line must not be parsed as a uses: pin');
  failed += 1;
} else {
  console.log('  ✓ non-uses lines are ignored');
}

if (failed > 0) {
  console.error(`✗ action-pin classifier test FAILED (${failed} case(s))`);
  process.exit(1);
}
console.log('✓ action-pin classifier test passed');
