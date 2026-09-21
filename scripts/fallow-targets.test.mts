#!/usr/bin/env node
/**
 * Regression test for #599 — `pnpm metrics` must not leave docs/REFACTORING-QUEUE.md
 * unformatted.
 *
 * The metrics-gate failure message tells you to run `pnpm metrics` and commit
 * the result, so anything the generator writes that prettier would reformat
 * turns into a red `format:check` on a file the author never touched. The
 * summary table did exactly that: built by hand with single-space padding,
 * prettier realigned every column.
 *
 * Drives scripts/fallow-targets.mts over fixtures via its `FALLOW_MD` /
 * `QUEUE_OUT` overrides and asserts prettier has nothing left to say, on both
 * write paths — targets present (the summary table) and no targets at all (the
 * empty-queue template) — plus determinism, since a second run that churns the
 * file is the same unrelated-diff problem wearing a different hat.
 *
 * The scratch dir sits inside the repo (under gitignored `.metrics/`) on
 * purpose: prettier resolves config by walking up from the file, so only a path
 * under the repo root reaches the real `.prettierrc.json` — the same lookup the
 * generator does for docs/REFACTORING-QUEUE.md.
 *
 * Run: tsx scripts/fallow-targets.test.mts   (also `pnpm test:fallow-targets`)
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import nodePath from 'node:path';
import { fileURLToPath } from 'node:url';
import { check as isFormatted, resolveConfig } from 'prettier';

const here = nodePath.dirname(fileURLToPath(import.meta.url));
const repoRoot = nodePath.resolve(here, '..');
const generator = nodePath.join(here, 'fallow-targets.mts');
const queuePath = nodePath.join(repoRoot, 'docs/REFACTORING-QUEUE.md');

mkdirSync(nodePath.join(repoRoot, '.metrics'), { recursive: true });
const tmp = mkdtempSync(nodePath.join(repoRoot, '.metrics', 'fallow-targets-test-'));

/** A fallow report carrying targets. The two categories differ in width and
 *  both pick up an emoji prefix in the summary table — that width mismatch is
 *  precisely what prettier realigns. */
const REPORT_WITH_TARGETS = `# Fallow report

## Health Score: 68 (C)

### Refactoring Targets (2)

| Efficiency | Category | Effort / Confidence | File | Recommendation |
|:-----------|:---------|:--------------------|:-----|:---------------|
| 13.1 | dead code | medium / high | \`packages/theme/src/render.ts\` | Remove 10 unused exports to reduce surface area (100% dead) |
| 10.8 | high impact | medium / medium | \`packages/lang-pickers/src/classify.ts\` | Split high-impact file (268 LOC) — 8 dependents amplify every change |

---
`;

/** fallow found nothing worth refactoring: no Refactoring Targets header. */
const REPORT_CLEAN = `# Fallow report

## Health Score: 100 (A)
`;

/** Run the generator over `report` and return what it wrote. */
function generate(report: string, label: string): string {
  const input = nodePath.join(tmp, `${label}.fallow.md`);
  const output = nodePath.join(tmp, `${label}.queue.md`);
  writeFileSync(input, report);
  const result = spawnSync('npx', ['--no-install', 'tsx', generator], {
    env: { ...process.env, FALLOW_MD: input, QUEUE_OUT: output },
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(`generator exited ${String(result.status)}\n${result.stderr}`);
  }
  return readFileSync(output, 'utf8');
}

let failed = 0;
function expect(label: string, ok: boolean, detail = ''): void {
  if (ok) {
    console.log(`  ✓ ${label}`);
  } else {
    console.error(`  ✗ ${label}${detail ? `\n    ${detail}` : ''}`);
    failed += 1;
  }
}

// Judge the output the way `prettier --check docs/REFACTORING-QUEUE.md` would:
// repo config, markdown parser, real filename.
const config = await resolveConfig(queuePath);
const prettierClean = async (text: string): Promise<boolean> =>
  isFormatted(text, { ...config, filepath: queuePath });

console.log('==> fallow-targets output is prettier-clean (#599)');

const withTargets = generate(REPORT_WITH_TARGETS, 'targets');
expect(
  'a queue with targets is written prettier-clean',
  await prettierClean(withTargets),
  'prettier would reformat the generated queue — `pnpm metrics` then reddens format:check',
);
// Formatting must not cost us the content it was formatting.
expect(
  'the summary table still carries every category',
  withTargets.includes('dead code') && withTargets.includes('high impact'),
);
expect(
  'both targets still become tasks',
  withTargets.includes('REFACTOR-001') && withTargets.includes('REFACTOR-002'),
);

const empty = generate(REPORT_CLEAN, 'empty');
expect(
  'the empty queue is written prettier-clean',
  await prettierClean(empty),
  'the no-targets template is a separate write path and regresses on its own',
);
expect('the empty queue says so', empty.includes('status: empty'));

console.log('==> fallow-targets output is stable across runs');

// Re-running metrics on an unchanged tree must not produce a diff; a wall-clock
// timestamp in the body is what used to guarantee one.
expect(
  'a second run over the same report is byte-identical',
  generate(REPORT_WITH_TARGETS, 'targets') === withTargets,
);

rmSync(tmp, { recursive: true, force: true });

if (failed > 0) {
  console.error(`✗ fallow-targets test FAILED (${String(failed)} case(s))`);
  process.exit(1);
}
console.log('✓ fallow-targets test passed');
