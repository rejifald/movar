#!/usr/bin/env node
// Assert the PREVIOUS release actually reached the App Store before cutting the
// next one.
//
// The failure this exists for: v1.7.0 was built, uploaded to App Store Connect
// by `release-safari` on 2026-08-22 — and never submitted. `safari-submit.yml`
// is `workflow_dispatch` only, so publishing a GitHub Release does not trigger
// it, and nothing anywhere noticed. The App Store stayed on 1.6.2 while the
// browser stores moved to 1.7.0. Safari users then took 1.6.2 -> 1.8.0 in one
// step, which is how a v1.7.0 regression (#578) reached them a week after
// everyone else and read as "the latest release broke Google on Safari".
//
// `gh release list` cannot see this: it lists tags and releases, which is the
// side we got right. Only Apple knows what Apple received.
//
// WHY THE PREVIOUS VERSION, NOT THIS ONE. At cut time the App Store legitimately
// lags the version being cut — it has not been submitted yet, that is the next
// step. The answerable question is whether the version BEFORE it ever landed.
//
// Usage:
//   node scripts/check-store-parity.mjs              report only (exit 0)
//   STRICT=1 node scripts/check-store-parity.mjs     fail on a lagging store
//   node scripts/check-store-parity.mjs --self-test  verify this file's logic
//
// Env: APPLE_ASC_KEY_ID / APPLE_ASC_ISSUER_ID / APPLE_ASC_API_KEY_P8
//      VERSION (default: apps/extension/package.json), PREVIOUS_VERSION,
//      BUNDLE_ID (default fyi.movar.safari), PLATFORMS (default IOS,MAC_OS).
//
// Dependency-free ESM on purpose: the release workflows run `node scripts/*.mjs`
// with no `pnpm install` (see docs/safari-deploy.md), so this may only import
// other scripts in this repo.
import { readFileSync } from 'node:fs';
import nodePath from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { clientFromEnv, request } from './lib/asc-api.mjs';

const repoRoot = nodePath.resolve(nodePath.dirname(fileURLToPath(import.meta.url)), '..');
const env = (name, fallback = '') => (process.env[name] ?? '').trim() || fallback;

/** States that mean the version reached Apple: live, or on its way there.
 *  Deliberately a SUPERSET of "live" — a version sitting in review has been
 *  submitted, which is the thing this gate checks. Mirrors apple-submit.mjs's
 *  IN_FLIGHT_STATES plus the post-review resting state. */
export const REACHED_APPLE = new Set([
  'READY_FOR_SALE',
  'PENDING_APPLE_RELEASE',
  'PENDING_DEVELOPER_RELEASE',
  'PROCESSING_FOR_APP_STORE',
  'IN_REVIEW',
  'WAITING_FOR_REVIEW',
  'REPLACED_WITH_NEW_VERSION',
]);

/** Numeric-tuple comparison. Returns <0, 0, >0 like a sort comparator. Only
 *  ever fed `X.Y.Z` release versions, so no prerelease/build handling. */
export function compareVersions(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/**
 * The highest released version strictly below `version`.
 *
 * Sourced from git tags AND the changelog, because neither alone is reliable
 * here. `gh` is not guaranteed (this runs install-free), and `actions/checkout`
 * is shallow with no tags by default — so a tags-only implementation would
 * return nothing in CI and this gate would silently pass forever, which is a
 * worse failure than the one it guards. The changelog is committed, so it is
 * present in any checkout; changesets writes a `## X.Y.Z` heading per bump.
 *
 * Both sources OVERSTATE what shipped — a pushed tag ships nothing, and a
 * changelog entry can belong to a version that was never released (1.5.1 was
 * tagged and never published; 1.1.0 was bumped and never tagged). That is the
 * SAFE direction: it can only make this gate ask about a version that never
 * reached the store, and "it never reached the store" is exactly the answer
 * worth surfacing. PREVIOUS_VERSION overrides when a version is being skipped
 * deliberately.
 */
export function previousReleasedVersion(version, tags, changelog = '') {
  const fromTags = tags.map((t) => /^extension-v(\d+\.\d+\.\d+)$/.exec(t.trim())?.[1]);
  const fromChangelog = [...changelog.matchAll(/^##\s+(\d+\.\d+\.\d+)\s*$/gm)].map((m) => m[1]);
  return (
    [...fromTags, ...fromChangelog]
      .filter((v) => typeof v === 'string' && compareVersions(v, version) < 0)
      .toSorted(compareVersions)
      .at(-1) ?? null
  );
}

/**
 * Verdict for one platform, given every appStoreVersion record Apple returned.
 * Pure so `--self-test` can exercise it without credentials.
 */
export function verdictFor(platform, previous, records) {
  const record = records.find((r) => r.attributes?.versionString === previous);
  if (!record) {
    return {
      platform,
      previous,
      state: null,
      ok: false,
      detail: `Apple has no version record for ${previous} at all — it was never created, so it was never submitted.`,
    };
  }
  const state = record.attributes?.appStoreState ?? record.attributes?.state ?? 'UNKNOWN';
  return {
    platform,
    previous,
    state,
    ok: REACHED_APPLE.has(state),
    detail: REACHED_APPLE.has(state)
      ? `${previous} is ${state}.`
      : `${previous} is stuck in ${state} — it was created but never submitted for review.`,
  };
}

/** The extension changelog, or '' when unreadable — a missing changelog must
 *  degrade to "tags only", never crash the release. */
function changelog() {
  try {
    return readFileSync(nodePath.join(repoRoot, 'apps/extension/CHANGELOG.md'), 'utf8');
  } catch {
    return '';
  }
}

function gitTags() {
  try {
    return execFileSync('git', ['tag', '--list', 'extension-v*'], {
      cwd: repoRoot,
      encoding: 'utf8',
      // Silence git's own stderr: outside a repo it prints a fatal, and this
      // path is a documented fallback, not an error worth showing an operator.
      stdio: ['ignore', 'pipe', 'ignore'],
    }).split('\n');
  } catch {
    return [];
  }
}

async function main() {
  const strict = env('STRICT') === '1';
  const version =
    env('VERSION') ||
    JSON.parse(readFileSync(nodePath.join(repoRoot, 'apps/extension/package.json'), 'utf8'))
      .version;

  const previous =
    env('PREVIOUS_VERSION') || previousReleasedVersion(version, gitTags(), changelog());
  if (!previous) {
    console.log(`• store parity: no release before ${version} — nothing to check.`);
    return 0;
  }

  const client = clientFromEnv();
  if (client.error) {
    // Not a failure: contributors and most CI jobs have no Apple key, and this
    // gate must never be the reason an ordinary build cannot run. The release
    // workflow, which does hold the key, is where it has teeth.
    console.log(
      `• store parity: skipped (App Store Connect credentials ${client.error}).\n` +
        `  Cutting ${version}; could not confirm ${previous} reached the App Store.`,
    );
    return 0;
  }

  const bundleId = env('BUNDLE_ID', 'fyi.movar.safari');
  const platforms = env('PLATFORMS', 'IOS,MAC_OS')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);

  // `request` reports a non-2xx rather than throwing, so every read below must
  // separate "Apple says no such version" from "we could not ask Apple". They
  // look identical in the body (`data` absent) and mean opposite things: the
  // first is the defect this gate exists for, the second is an expired key or a
  // rate limit. Failing a release on the second would make this gate a worse
  // outage than the one it prevents, so an unreadable API always skips.
  const apps = await request(
    client.token,
    `/v1/apps?${new URLSearchParams({
      'filter[bundleId]': bundleId,
      limit: '10',
    })}`,
  );
  if (apps.status < 200 || apps.status >= 300) {
    console.log(
      `• store parity: could not query App Store Connect (${apps.status}${apps.detail ? ` — ${apps.detail}` : ''}) — skipped.`,
    );
    return 0;
  }
  const app = (apps.body?.data ?? []).find((a) => a.attributes?.bundleId === bundleId);
  if (!app) {
    console.log(
      `• store parity: no app with bundle ID ${bundleId} is visible to this key — skipped.`,
    );
    return 0;
  }

  const verdicts = [];
  for (const platform of platforms) {
    const res = await request(
      client.token,
      `/v1/apps/${app.id}/appStoreVersions?${new URLSearchParams({
        'filter[platform]': platform,
        'filter[versionString]': previous,
        limit: '10',
      })}`,
    );
    if (res.status < 200 || res.status >= 300) {
      console.log(
        `• store parity: ${platform} query failed (${res.status}${res.detail ? ` — ${res.detail}` : ''}) — skipped.`,
      );
      return 0;
    }
    verdicts.push(verdictFor(platform, previous, res.body?.data ?? []));
  }

  console.log(
    `store parity — cutting ${version}, checking that ${previous} reached the App Store:`,
  );
  for (const v of verdicts) console.log(`  ${v.ok ? '✔' : '✗'} ${v.platform}: ${v.detail}`);

  const lagging = verdicts.filter((v) => !v.ok);
  if (lagging.length === 0) return 0;

  const how =
    `\n  A version that was uploaded but never submitted ships to nobody, and the next\n` +
    `  release makes its users skip it entirely. Run safari-submit.yml (mode: submit)\n` +
    `  for ${previous} before cutting ${version}, or set PREVIOUS_VERSION to the last\n` +
    `  version that genuinely shipped if ${previous} is being deliberately skipped.`;
  if (strict) {
    console.error(`✗ ${lagging.length} platform(s) never received ${previous}.${how}`);
    return 1;
  }
  console.log(
    `\n⚠ ${lagging.length} platform(s) never received ${previous}. Not failing (STRICT is unset).${how}`,
  );
  return 0;
}

if (process.argv.includes('--self-test')) {
  const { strictEqual: eq, deepStrictEqual: deep } = await import('node:assert');
  eq(compareVersions('1.8.0', '1.7.0') > 0, true);
  eq(compareVersions('1.6.2', '1.10.0') < 0, true);
  eq(compareVersions('1.8.0', '1.8.0'), 0);
  eq(compareVersions('1.9.0', '1.10.0') < 0, true, 'must not compare as strings');

  const tags = [
    'extension-v1.6.2',
    'extension-v1.7.0',
    'extension-v1.8.0',
    'not-a-tag',
    'extension-v1.10.0',
  ];
  eq(previousReleasedVersion('1.8.1', tags), '1.8.0');
  eq(previousReleasedVersion('1.8.0', tags), '1.7.0');
  eq(previousReleasedVersion('1.6.2', tags), null, 'nothing below the oldest tag');
  eq(previousReleasedVersion('1.11.0', tags), '1.10.0', 'numeric, not lexicographic');

  // A shallow CI checkout has no tags — the changelog alone must still answer,
  // or this gate passes vacuously on every real run.
  const CHANGELOG =
    '# @movar/extension\n\n## 1.8.0\n\ntext\n\n## 1.7.0\n\n### Minor Changes\n\n## 1.6.2\n';
  eq(previousReleasedVersion('1.8.1', [], CHANGELOG), '1.8.0', 'changelog-only fallback');
  eq(previousReleasedVersion('1.8.0', [], CHANGELOG), '1.7.0');
  eq(previousReleasedVersion('1.8.1', [], ''), null, 'no source at all reports nothing');
  eq(previousReleasedVersion('1.8.1', tags, CHANGELOG), '1.8.0', 'both sources agree');

  // The v1.7.0 incident itself: uploaded, no version record ever created.
  deep(verdictFor('MAC_OS', '1.7.0', []).ok, false);
  // Created but parked — the other half of the same failure.
  deep(
    verdictFor('IOS', '1.7.0', [
      { attributes: { versionString: '1.7.0', appStoreState: 'PREPARE_FOR_SUBMISSION' } },
    ]).ok,
    false,
  );
  // Genuinely shipped, and genuinely in flight, both pass.
  deep(
    verdictFor('IOS', '1.6.2', [
      { attributes: { versionString: '1.6.2', appStoreState: 'READY_FOR_SALE' } },
    ]).ok,
    true,
  );
  deep(
    verdictFor('IOS', '1.6.2', [
      { attributes: { versionString: '1.6.2', appStoreState: 'IN_REVIEW' } },
    ]).ok,
    true,
  );
  // A superseded version is still a version that shipped.
  deep(
    verdictFor('MAC_OS', '1.6.1', [
      { attributes: { versionString: '1.6.1', appStoreState: 'REPLACED_WITH_NEW_VERSION' } },
    ]).ok,
    true,
  );
  console.log('✓ check-store-parity self-test passed');
  process.exit(0);
}

process.exit(await main());
