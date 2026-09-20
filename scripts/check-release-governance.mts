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
 *   3. EVERY JOB IS CLASSIFIED, AND THE ONE EXCEPTION STAYS NARROW. The list in
 *      (2) was hardcoded, so a newly added job that reaches a store simply was
 *      not looked at — the guard went blind exactly when it mattered. Now every
 *      job in release.yml must be classified here, and an unknown one fails.
 *
 *      `submit-safari` is the single deliberate exception: it submits the Safari
 *      build for review and carries NO environment, because re-gating it would
 *      let an approved release stall before finishing (the failure that stranded
 *      v1.7.0 and v1.9.0 at Apple). That is only safe because the job cannot run
 *      on its own — it is downstream of the approved `release-safari` upload and
 *      gated on that upload having happened. So the exception is checked, not
 *      merely allowed: lose the `needs:` or the `uploaded` condition and this
 *      fails.
 *
 * String/JSON-based on purpose: the repo has no YAML parser dependency, and the
 * existing repo guards (check-readme-parity, check-suppressions) are the same
 * shape — read the file, scan it, fail with a clear message.
 */
import { readFileSync } from 'node:fs';
import nodePath from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = nodePath.resolve(nodePath.dirname(fileURLToPath(import.meta.url)), '..');

const rulesetPath = nodePath.resolve(repoRoot, '.github/rulesets/main-metrics-gate.json');
const metricsDocPath = nodePath.resolve(repoRoot, 'docs/metrics-gate.md');
const releaseWorkflowPath = nodePath.resolve(repoRoot, '.github/workflows/release.yml');

/** Store-submission jobs that must each gate on an environment. */
const STORE_JOBS = ['release-firefox', 'release-chrome', 'release-edge', 'release-safari'] as const;
/** The build/validate job that must stay OUTSIDE the environment so dry-runs run unattended. */
const UNGATED_JOB = 'prepare';
/** Build/validate jobs that legitimately carry no environment — neither reaches a store. */
const BUILD_JOBS = [UNGATED_JOB, 'e2e'] as const;
/**
 * The one job that reaches a store WITHOUT its own approval gate, and what has
 * to stay true for that to be safe. See invariant 3 in the header.
 */
const DOWNSTREAM_JOB = {
  name: 'submit-safari',
  /** The approved job whose output it must be chained to. */
  needs: 'release-safari',
  /** The condition proving that approved job actually uploaded something. */
  guard: "needs.release-safari.outputs.uploaded == 'true'",
} as const;

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
  const headerIndex = lines.indexOf(`  ${jobName}:`);
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

// --- 3. every job classified; the ungated store job stays chained -----------
/** Every job name in release.yml, in file order. `jobs:` is the last top-level
 *  key, so two-space-indented keys after it are job headers. */
function jobNames(source: string): string[] {
  const lines = source.split('\n');
  const start = lines.indexOf('jobs:');
  if (start === -1) return [];
  const names: string[] = [];
  for (const line of lines.slice(start + 1)) {
    const name = /^ {2}([A-Za-z0-9_-]+):\s*$/.exec(line)?.[1];
    if (name) names.push(name);
  }
  return names;
}

const classified = new Set<string>([...STORE_JOBS, ...BUILD_JOBS, DOWNSTREAM_JOB.name]);
for (const job of jobNames(workflow)) {
  if (classified.has(job)) continue;
  failures.push(
    `release.yml: job "${job}" is not classified in check-release-governance.mts. Add it to ` +
      `STORE_JOBS if it submits to a store (it then needs \`environment: production\`), or to ` +
      `BUILD_JOBS if it only builds/validates. An unclassified job is one this guard cannot ` +
      `see, which is how an ungated upload would ship.`,
  );
}

const downstreamBody = jobBody(workflow, DOWNSTREAM_JOB.name);
if (downstreamBody === null) {
  failures.push(
    `release.yml: "${DOWNSTREAM_JOB.name}" not found — if Safari submission moved or was renamed, ` +
      `update DOWNSTREAM_JOB here so its exception keeps being checked.`,
  );
} else {
  // It must NOT be gated: a second approval is what would leave an approved
  // release uploaded-but-unsubmitted, which is the whole reason this job exists.
  if (declaresEnvironment(downstreamBody)) {
    failures.push(
      `release.yml: "${DOWNSTREAM_JOB.name}" declares an \`environment:\`. It must not — the ` +
        `approval on "${DOWNSTREAM_JOB.needs}" already authorised shipping Safari, and a second ` +
        `gate here would park an unattended release after the build is already at Apple. That is ` +
        `precisely how v1.7.0 and v1.9.0 were stranded.`,
    );
  }
  // …and it must stay chained to the approved upload, which is what makes the
  // missing gate safe.
  if (!downstreamBody.includes(DOWNSTREAM_JOB.needs)) {
    failures.push(
      `release.yml: "${DOWNSTREAM_JOB.name}" no longer declares \`needs: ${DOWNSTREAM_JOB.needs}\`. ` +
        `Without it the job is an ungated store submission that can run on its own.`,
    );
  }
  if (!downstreamBody.includes(DOWNSTREAM_JOB.guard)) {
    failures.push(
      `release.yml: "${DOWNSTREAM_JOB.name}" no longer gates on ` +
        `\`${DOWNSTREAM_JOB.guard}\` — it could then submit when the approved upload was skipped ` +
        `(absent Apple secrets) or failed.`,
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
  '✓ release governance: metrics-gate bypass is empty (JSON + doc agree); all store jobs gate on ' +
    `an environment; every release.yml job is classified; "${DOWNSTREAM_JOB.name}" stays chained ` +
    `to the approved "${DOWNSTREAM_JOB.needs}" upload.`,
);
