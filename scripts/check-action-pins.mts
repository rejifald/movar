#!/usr/bin/env node
/**
 * GitHub Actions SHA-pin guard — run via `pnpm check:action-pins` (wired into
 * the CI `verify` job and `pnpm validate`).
 *
 * Every `uses:` across `.github/workflows/*.yml` must reference a third-party
 * action by a full 40-character commit SHA, not a mutable tag. A major-version
 * tag like `actions/checkout@v6` is a moving Git ref: whoever controls the
 * action's repo can retarget it to arbitrary code, and our release / regen /
 * override-guard jobs run with store-publishing and repo-write credentials in
 * scope. Pinning to a SHA makes each run execute exactly the reviewed bytes;
 * updates then arrive only as Renovate digest-bump PRs (renovate.json extends
 * `helpers:pinGitHubActionDigests`), each a reviewable diff.
 *
 * Allowed: a 40-hex SHA, optionally followed by a `# vX.Y.Z` comment, and
 * local-action / reusable-workflow refs that start with `./` (there are none
 * today, but the carve-out keeps the guard from blocking a future one).
 *
 * `extractUsesPins` is exported so the guard's own test can exercise the
 * accept/reject classification without spawning a process.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const workflowsDir = resolve(repoRoot, '.github/workflows');

/** A 40-char lowercase hex SHA, then optionally whitespace + a `# …` comment,
 *  to end of line. This is the ONLY shape an external `uses:` may take. */
const PINNED = /@[0-9a-f]{40}(?:\s+#.*)?$/;

export interface UsesPin {
  /** The full `uses:` value (everything after `uses:`), trimmed. */
  value: string;
  /** 1-based line number within the source. */
  line: number;
  /** True when the value is acceptably pinned (SHA, or a local `./` ref). */
  pinned: boolean;
}

/** Pull every `uses:` value out of one workflow's YAML source and classify each
 *  as pinned or not. Pure string work — no YAML parser dependency. */
export function extractUsesPins(source: string): UsesPin[] {
  const pins: UsesPin[] = [];
  const lines = source.split('\n');
  lines.forEach((rawLine, index) => {
    const match = /^\s*(?:-\s+)?uses:\s+(.+?)\s*$/.exec(rawLine);
    if (match === null) return;
    const value = (match[1] ?? '').trim();
    // Local actions and reusable workflows referenced by path are exempt — they
    // live in this repo and aren't a mutable upstream tag.
    const isLocal = value.startsWith('./') || value.startsWith('.\\');
    const pinned = isLocal || PINNED.test(value);
    pins.push({ value, line: index + 1, pinned });
  });
  return pins;
}

// When imported (by the test), don't scan the tree or exit.
const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const failures: string[] = [];
  let total = 0;
  for (const file of readdirSync(workflowsDir).filter(
    (f) => f.endsWith('.yml') || f.endsWith('.yaml'),
  )) {
    const source = readFileSync(join(workflowsDir, file), 'utf8');
    for (const pin of extractUsesPins(source)) {
      total += 1;
      if (!pin.pinned) {
        failures.push(
          `${file}:${pin.line}: "${pin.value}" is not pinned to a 40-char commit SHA — ` +
            `resolve the SHA the tag points to (\`gh api repos/<owner>/<repo>/git/ref/tags/<tag>\`) ` +
            `and pin as \`owner/repo@<sha> # <tag>\`.`,
        );
      }
    }
  }

  if (failures.length > 0) {
    console.error(`✗ action-pin guard FAILED:\n  - ${failures.join('\n  - ')}`);
    process.exit(1);
  }
  console.log(`✓ all ${total} \`uses:\` references across .github/workflows are SHA-pinned.`);
}
