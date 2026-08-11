#!/usr/bin/env node
// scripts/apple-submit.mjs
//
// Drive an App Store version from "build uploaded" to "submitted for review"
// through the App Store Connect API, for both iOS and macOS. Zero npm
// dependencies; Node 22 built-ins only.
//
// WHAT THIS REPLACES
//
// `altool --upload-app` only delivers a build. Everything after it — creating
// the version, attaching the build once it finishes processing, filling in
// "What's New" for every localization, answering export compliance, and
// actually submitting — used to be hand-work in the App Store Connect UI, and
// docs/safari-deploy.md described it as such. The Review Submissions API
// covers all of it, so the pipeline no longer stops half way.
//
// SAFETY MODEL — three levels, because this is the most irreversible thing in
// the repo. It follows the same ordering rule as release.yml: every reversible
// step runs first, the irreversible one is last and separately opted into.
//
//   DRY_RUN=1   Reads only. Resolves the app, build, version, localizations
//               and existing submissions, and prints exactly what it would do.
//               Touches nothing.
//   (default)   Performs the REVERSIBLE writes: create/reuse the version,
//               attach the build, set the release notes, set export
//               compliance. All of it is editable in App Store Connect
//               afterwards, and none of it reaches a reviewer.
//   SUBMIT=1    Additionally submits for review. This is the point of no
//               return: a submitted version can be cancelled, but it has been
//               seen, and repeated submit/cancel cycles are visible to Apple.
//
// It is idempotent at every level: an existing editable version is reused
// rather than duplicated, and a version already in review is reported and
// skipped rather than resubmitted.
//
// Required env:
//   APPLE_ASC_KEY_ID / APPLE_ASC_ISSUER_ID / APPLE_ASC_API_KEY_P8
//   VERSION            marketing version to submit, e.g. 1.6.2
//
// Optional env:
//   BUNDLE_ID          default fyi.movar.safari
//   BUILD_NUMBER       CFBundleVersion to attach; default = newest processed
//                      build for VERSION on that platform
//   PLATFORMS          comma-separated; default IOS,MAC_OS
//   RELEASE_NOTES_PATH     default apps/extension/store-assets/RELEASE-NOTES.md
//   BUILD_TIMEOUT_MIN  how long to wait for Apple to finish processing the
//                      upload; default 45

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { clientFromEnv, request, requireOk } from './lib/asc-api.mjs';
import { parseReleaseNotes, noteForLocale } from './lib/release-notes.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const env = (name, fallback = '') => (process.env[name] ?? '').trim() || fallback;

const DRY_RUN = env('DRY_RUN') === '1';
const SUBMIT = env('SUBMIT') === '1';

/**
 * App Store version states that still accept edits. Anything else means the
 * version is with Apple (or already live) and must not be touched — trying to
 * would either error or, worse, silently pull a live listing back into review.
 */
const EDITABLE_STATES = new Set([
  'PREPARE_FOR_SUBMISSION',
  'DEVELOPER_REJECTED',
  'REJECTED',
  'METADATA_REJECTED',
  'INVALID_BINARY',
  'WAITING_FOR_EXPORT_COMPLIANCE',
]);

/** States meaning "already with Apple" — submitting again is wrong, not idempotent. */
const IN_FLIGHT_STATES = new Set([
  'WAITING_FOR_REVIEW',
  'IN_REVIEW',
  'PENDING_DEVELOPER_RELEASE',
  'PENDING_APPLE_RELEASE',
  'PROCESSING_FOR_APP_STORE',
  'READY_FOR_SALE',
]);

const log = (msg) => console.log(msg);
const step = (msg) => console.log(`\n▸ ${msg}`);

/** A write that respects DRY_RUN. Returns null when skipped. */
async function write(token, description, path, options) {
  if (DRY_RUN) {
    log(`  [dry-run] would ${description}`);
    return null;
  }
  const body = await requireOk(token, path, options);
  log(`  ${description}`);
  return body;
}

/** Wait for Apple to finish processing an uploaded build. */
async function waitForBuild(token, appId, platform, version, buildNumber, timeoutMin) {
  const deadline = Date.now() + timeoutMin * 60_000;
  let reported = null;
  for (;;) {
    const query = new URLSearchParams({
      'filter[app]': appId,
      'filter[preReleaseVersion.platform]': platform,
      'filter[preReleaseVersion.version]': version,
      sort: '-uploadedDate',
      limit: '20',
      include: 'preReleaseVersion',
    });
    if (buildNumber) query.set('filter[version]', buildNumber);

    const res = await request(token, `/v1/builds?${query}`);
    if (res.status !== 200) {
      throw new Error(`listing builds failed: ${res.status} ${res.detail}`);
    }
    const builds = res.body?.data ?? [];
    const valid = builds.find((b) => b.attributes?.processingState === 'VALID');
    if (valid) return valid;

    const states = builds.map((b) => `${b.attributes?.version}:${b.attributes?.processingState}`);
    const summary = states.length ? states.join(', ') : 'no builds yet';
    if (summary !== reported) {
      log(`  waiting for processing — ${summary}`);
      reported = summary;
    }

    const failed = builds.find((b) => b.attributes?.processingState === 'FAILED');
    if (failed) {
      throw new Error(
        `build ${failed.attributes.version} FAILED processing at Apple — it cannot be submitted; check App Store Connect for the reason`,
      );
    }
    if (Date.now() > deadline) {
      throw new Error(
        `build did not finish processing within ${timeoutMin} min (last seen: ${summary}). Processing sometimes takes longer; re-run this step, the upload is already done.`,
      );
    }
    if (DRY_RUN) {
      log('  [dry-run] not waiting for processing');
      return null;
    }
    await new Promise((r) => setTimeout(r, 60_000));
  }
}

/**
 * Answer export compliance once, tolerating the fact that Apple refuses to let
 * it be answered twice.
 */
async function declareExportCompliance(token, build) {
  const current = build.attributes?.usesNonExemptEncryption;
  if (current === false || current === true) {
    log(`  export compliance already answered (usesNonExemptEncryption=${current})`);
    return;
  }
  if (DRY_RUN) {
    log('  [dry-run] would declare no non-exempt encryption');
    return;
  }
  const res = await request(token, `/v1/builds/${build.id}`, {
    method: 'PATCH',
    body: {
      data: { type: 'builds', id: build.id, attributes: { usesNonExemptEncryption: false } },
    },
  });
  if (res.status >= 200 && res.status < 300) {
    log('  declare no non-exempt encryption');
    return;
  }
  if (res.status === 409 && /already set/i.test(res.detail)) {
    log('  export compliance was already answered on this build');
    return;
  }
  throw new Error(`declaring export compliance failed: ${res.status} ${res.detail}`);
}

async function submitPlatform(token, { appId, platform, version, notes, buildNumber, timeoutMin }) {
  step(`${platform} — ${version}`);

  // --- the build -----------------------------------------------------------
  const build = await waitForBuild(token, appId, platform, version, buildNumber, timeoutMin);
  if (build) log(`  build ${build.attributes.version} is processed (VALID)`);
  else if (!DRY_RUN) throw new Error('no processed build');

  // --- the version ---------------------------------------------------------
  const existing = await requireOk(
    token,
    `/v1/apps/${appId}/appStoreVersions?${new URLSearchParams({
      'filter[platform]': platform,
      'filter[versionString]': version,
      limit: '10',
    })}`,
  );
  let versionRecord = (existing.data ?? [])[0];

  if (versionRecord) {
    const state = versionRecord.attributes?.appStoreState ?? versionRecord.attributes?.state;
    if (IN_FLIGHT_STATES.has(state)) {
      log(`  version ${version} is already ${state} — nothing to do, leaving it alone.`);
      return { platform, skipped: state };
    }
    if (!EDITABLE_STATES.has(state)) {
      throw new Error(`version ${version} is in state ${state}, which this script will not edit`);
    }
    log(`  reusing existing version record (${state})`);
  } else {
    const created = await write(token, `create version ${version}`, '/v1/appStoreVersions', {
      method: 'POST',
      body: {
        data: {
          type: 'appStoreVersions',
          attributes: { platform, versionString: version },
          relationships: { app: { data: { type: 'apps', id: appId } } },
        },
      },
    });
    versionRecord = created?.data;
    if (!versionRecord) return { platform, skipped: 'dry-run' };
  }

  // --- attach the build ----------------------------------------------------
  if (build) {
    await write(
      token,
      `attach build ${build.attributes.version}`,
      `/v1/appStoreVersions/${versionRecord.id}/relationships/build`,
      { method: 'PATCH', body: { data: { type: 'builds', id: build.id } } },
    );

    // Export compliance. Answering it is what stops the version sitting in
    // WAITING_FOR_EXPORT_COMPLIANCE forever. Movar ships no encryption of its
    // own beyond standard HTTPS, which is exempt.
    //
    // Apple treats this as write-once: re-sending it returns
    // `409 ENTITY_ERROR.ATTRIBUTE.INVALID: You cannot update when the value is
    // already set`. The value is often already there — the build carries
    // ITSAppUsesNonExemptEncryption from its Info.plist — so a rerun of this
    // otherwise-idempotent script would die on a build that is already fine.
    // Skip when it is set, and still tolerate the 409 in case the list
    // response omitted the attribute.
    await declareExportCompliance(token, build);
  }

  // --- release notes, per localization -------------------------------------
  const localizations = await requireOk(
    token,
    `/v1/appStoreVersions/${versionRecord.id}/appStoreVersionLocalizations?limit=50`,
  );
  const found = localizations.data ?? [];
  if (!found.length) log('  ⚠ version has no localizations yet');
  for (const localization of found) {
    const locale = localization.attributes?.locale;
    const note = noteForLocale(notes, locale);
    if (!note) {
      // Loud, because App Store Connect rejects a version whose localization
      // has no "What's New" — better to name the missing locale now than to
      // read it off a metadata rejection later.
      throw new Error(
        `no "What's New" written for locale ${locale}. Add a "### … (${locale.split('-')[0]})" block under "## ${version}" in RELEASE-NOTES.md.`,
      );
    }
    await write(
      token,
      `set What's New for ${locale} (${note.split('\n')[0].slice(0, 40)}…)`,
      `/v1/appStoreVersionLocalizations/${localization.id}`,
      {
        method: 'PATCH',
        body: {
          data: {
            type: 'appStoreVersionLocalizations',
            id: localization.id,
            attributes: { whatsNew: note },
          },
        },
      },
    );
  }

  // ===== IRREVERSIBLE — kept last, and separately opted into ================
  if (!SUBMIT) {
    log('  ✔ prepared. Not submitted (set SUBMIT=1 to submit for review).');
    return { platform, prepared: true };
  }

  const open = await request(
    token,
    `/v1/reviewSubmissions?${new URLSearchParams({
      'filter[app]': appId,
      'filter[platform]': platform,
      'filter[state]': 'READY_FOR_REVIEW,WAITING_FOR_REVIEW,IN_REVIEW,UNRESOLVED_ISSUES',
      limit: '10',
    })}`,
  );
  if (open.status === 200 && (open.body?.data ?? []).length) {
    const states = open.body.data.map((s) => s.attributes?.state).join(', ');
    log(`  a review submission already exists for ${platform} (${states}) — not creating another.`);
    return { platform, skipped: 'existing submission' };
  }

  const submission = await write(token, `create review submission`, '/v1/reviewSubmissions', {
    method: 'POST',
    body: {
      data: {
        type: 'reviewSubmissions',
        attributes: { platform },
        relationships: { app: { data: { type: 'apps', id: appId } } },
      },
    },
  });
  const submissionId = submission?.data?.id;
  if (!submissionId) return { platform, skipped: 'dry-run' };

  await write(token, 'add the version to the submission', '/v1/reviewSubmissionItems', {
    method: 'POST',
    body: {
      data: {
        type: 'reviewSubmissionItems',
        relationships: {
          reviewSubmission: { data: { type: 'reviewSubmissions', id: submissionId } },
          appStoreVersion: { data: { type: 'appStoreVersions', id: versionRecord.id } },
        },
      },
    },
  });

  await write(token, '🚀 SUBMIT FOR REVIEW', `/v1/reviewSubmissions/${submissionId}`, {
    method: 'PATCH',
    body: {
      data: { type: 'reviewSubmissions', id: submissionId, attributes: { submitted: true } },
    },
  });

  return { platform, submitted: true };
}

async function main() {
  const client = clientFromEnv();
  if (client.error) {
    console.error(`✗ App Store Connect credentials: ${client.error}`);
    process.exit(1);
  }
  const { token } = client;

  const version = env('VERSION');
  if (!version) {
    console.error('✗ VERSION is not set (the marketing version to submit, e.g. 1.6.2).');
    process.exit(1);
  }
  const bundleId = env('BUNDLE_ID', 'fyi.movar.safari');
  const platforms = env('PLATFORMS', 'IOS,MAC_OS')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  const buildNumber = env('BUILD_NUMBER');
  const timeoutMin = Number(env('BUILD_TIMEOUT_MIN', '45'));
  const whatsNewPath = env('RELEASE_NOTES_PATH', 'apps/extension/store-assets/RELEASE-NOTES.md');

  log(
    `App Store submission — ${bundleId} ${version} [${platforms.join(', ')}]\n` +
      `mode: ${DRY_RUN ? 'DRY RUN (reads only)' : SUBMIT ? 'PREPARE + SUBMIT FOR REVIEW' : 'PREPARE ONLY (no submission)'}`,
  );

  const allNotes = parseReleaseNotes(readFileSync(resolve(repoRoot, whatsNewPath), 'utf8'));
  const notes = allNotes.get(version);
  if (!notes || !notes.size) {
    console.error(
      `✗ No "## ${version}" block in ${whatsNewPath}. App Store Connect requires "What's New" for every localization on every version after the first.`,
    );
    process.exit(1);
  }
  log(`release notes: ${[...notes.keys()].join(', ')}`);

  const apps = await requireOk(
    token,
    `/v1/apps?${new URLSearchParams({ 'filter[bundleId]': bundleId, limit: '10' })}`,
  );
  const app = (apps.data ?? []).find((a) => a.attributes?.bundleId === bundleId);
  if (!app) {
    console.error(`✗ No app with bundle ID ${bundleId} is visible to this key.`);
    process.exit(1);
  }
  log(`app: ${app.attributes.name} (${app.id})`);

  // Platforms are isolated from one another. They fail for genuinely different
  // reasons — iOS's first-ever submission can lack listing metadata macOS has
  // had for releases — and letting the first failure abandon the rest would
  // mean an iOS metadata gap silently withholding a macOS release that was
  // ready. Collect every outcome, report them all, then fail if any did.
  const results = [];
  for (const platform of platforms) {
    try {
      results.push(
        await submitPlatform(token, {
          appId: app.id,
          platform,
          version,
          notes,
          buildNumber,
          timeoutMin,
        }),
      );
    } catch (cause) {
      console.error(`  ✗ ${platform}: ${cause.message}`);
      results.push({ platform, error: cause.message });
    }
  }

  step('Summary');
  for (const r of results) {
    const what = r.error
      ? `FAILED — ${r.error}`
      : r.submitted
        ? 'SUBMITTED FOR REVIEW'
        : r.prepared
          ? 'prepared, not submitted'
          : `skipped (${r.skipped})`;
    log(`  ${r.platform}: ${what}`);
  }

  const failures = results.filter((r) => r.error);
  if (failures.length) {
    console.error(
      `\n${failures.length} of ${results.length} platform(s) failed: ${failures.map((f) => f.platform).join(', ')}`,
    );
    process.exit(1);
  }
}

await main();
