#!/usr/bin/env node
/**
 * Release-governance guard — run via `pnpm check:release-governance` (wired into
 * the CI `verify` job and `pnpm validate`).
 *
 * Asserts two invariants that code-as-config could otherwise drift on silently
 * (the live GitHub state is configured by hand; this only checks the committed
 * files, see the caveats in docs/metrics-gate.md and docs/release-credentials.md):
 *
 *   1. METRICS-GATE BYPASS PARITY. `.github/rulesets/main-metrics-gate.json`
 *      `bypass_actors` must be empty AND `docs/metrics-gate.md` must document the
 *      same `bypass_actors: []` posture. If a future edit re-adds an admin
 *      bypass to the JSON without updating the doc (or vice versa), this fails —
 *      the two must agree so the documented "even the owner goes through the
 *      gate" promise can't quietly become false.
 *
 *   2. STORE-JOB ENVIRONMENT GATE. Every store-submission job in
 *      `.github/workflows/release.yml` (release-firefox / -chrome / -edge /
 *      -safari) must declare an `environment:` so a published Release pauses for
 *      manual approval before any store sees the upload. The `prepare` job must
 *      NOT be gated (it has to run unattended for dry-runs).
 *
 * String/JSON-based on purpose: the repo has no YAML parser dependency, and the
 * existing repo guards (check-readme-parity, check-suppressions) are the same
 * shape — read the file, scan it, fail with a clear message.
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const rulesetPath = resolve(repoRoot, '.github/rulesets/main-metrics-gate.json');
const metricsDocPath = resolve(repoRoot, 'docs/metrics-gate.md');
const releaseWorkflowPath = resolve(repoRoot, '.github/workflows/release.yml');

/** Store-submission jobs that must each gate on an environment. */
const STORE_JOBS = ['release-firefox', 'release-chrome', 'release-edge', 'release-safari'] as const;
/** The build/validate job that must stay OUTSIDE the environment so dry-runs run unattended. */
const UNGATED_JOB = 'prepare';

const failures: string[] = [];

// --- 1. metrics-gate bypass parity -------------------------------------------
interface Ruleset {
  bypass_actors?: unknown[];
}
let ruleset: Ruleset;
try {
  ruleset = JSON.parse(readFileSync(rulesetPath, 'utf8')) as Ruleset;
} catch (error) {
  throw new Error(`[release-governance] could not read ${rulesetPath}: ${String(error)}`);
}
const bypassActors = ruleset.bypass_actors ?? [];
const jsonSaysEmpty = Array.isArray(bypassActors) && bypassActors.length === 0;

const metricsDoc = readFileSync(metricsDocPath, 'utf8');
// The doc states the posture as the literal token `bypass_actors: []`.
const docSaysEmpty = /`?bypass_actors:\s*\[\]`?/.test(metricsDoc);

if (!jsonSaysEmpty) {
  failures.push(
    `main-metrics-gate.json declares ${bypassActors.length} bypass actor(s); the documented ` +
      `posture (docs/metrics-gate.md) is \`bypass_actors: []\` — an admin/role bypass lets a ` +
      `merge skip every required check. Empty bypass_actors, or update the doc to describe the ` +
      `bypass honestly so the JSON and the doc agree.`,
  );
}
if (jsonSaysEmpty && !docSaysEmpty) {
  failures.push(
    `main-metrics-gate.json has \`bypass_actors: []\` but docs/metrics-gate.md no longer documents ` +
      `that posture — keep the doc's bypass statement in sync with the ruleset.`,
  );
}

// --- 2. store jobs declare an environment ------------------------------------
const workflow = readFileSync(releaseWorkflowPath, 'utf8');

/** Extract the YAML block (job body) for `jobName` from the `jobs:` map: every
 *  line after `  <jobName>:` up to (but not including) the next two-space-indented
 *  `  <key>:` sibling. */
function jobBody(source: string, jobName: string): string | null {
  const lines = source.split('\n');
  const headerIndex = lines.findIndex((line) => line === `  ${jobName}:`);
  if (headerIndex === -1) return null;
  const body: string[] = [];
  for (let i = headerIndex + 1; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    // A sibling job header is a non-comment line indented exactly two spaces.
    if (/^ {2}\S/.test(line) && !line.trimStart().startsWith('#')) break;
    body.push(line);
  }
  return body.join('\n');
}

/** True if the job body declares a job-level `environment:` (four-space indent,
 *  i.e. a direct child of the job — not a deeper nested key). */
function declaresEnvironment(body: string): boolean {
  return /^ {4}environment:\s*\S/m.test(body);
}

for (const job of STORE_JOBS) {
  const body = jobBody(workflow, job);
  if (body === null) {
    failures.push(`release.yml: store job "${job}" not found — did it get renamed?`);
    continue;
  }
  if (!declaresEnvironment(body)) {
    failures.push(
      `release.yml: store job "${job}" is missing a job-level \`environment:\` — add ` +
        `\`environment: production\` so a published Release pauses for manual approval before ` +
        `submitting to the store.`,
    );
  }
}

const prepareBody = jobBody(workflow, UNGATED_JOB);
if (prepareBody !== null && declaresEnvironment(prepareBody)) {
  failures.push(
    `release.yml: the "${UNGATED_JOB}" job declares an \`environment:\` — it must stay ungated so ` +
      `dry-runs and the pre-submission suite run unattended. Only the store jobs gate on approval.`,
  );
}

// --- report ------------------------------------------------------------------
if (failures.length > 0) {
  console.error(`✗ release-governance guard FAILED:\n  - ${failures.join('\n  - ')}`);
  process.exit(1);
}
console.log(
  '✓ release governance: metrics-gate bypass is empty (JSON + doc agree); all store jobs gate on an environment.',
);
