#!/usr/bin/env node
// scripts/amo-listing.mjs
//
// Sync the Firefox (AMO) listing from the repo: name, summary, description,
// categories, tags, support contact (listing.json + copy/*.md) and the
// screenshot previews with per-locale captions. Zero npm dependencies; Node 22
// built-ins only — the release workflows run it with bare `node`.
//
// All decisions live in scripts/lib/amo-listing.mjs (pure, tested); this file
// is the I/O: read the repo, GET the live add-on, print the plan, and — in
// MODE=apply — PATCH then replace previews.
//
// Env:
//   MODE                 plan (default) | apply
//   AMO_JWT_ISSUER / AMO_JWT_SECRET   required for apply; plan reads the public
//                        endpoint and uses them only if set
//   AMO_ADDON            slug or id (default: from listing.json, movar)
//   SCREENSHOTS_PATH     default apps/extension/store-assets/screenshots/desktop
//                        (<path>/<locale>/NN-name.png, 1280x800 PNG)
//   AMO_SCREENSHOT_LOCALE  folder whose images become the previews (default: listing.json, uk)
//   FORCE_SCREENSHOTS=1  re-upload previews even if count and captions match
//   DRY_RUN=1            with MODE=apply: print every operation, write nothing
//
// Flags:
//   --offline-fixture <file>   plan against a saved copy of the public GET
//                              (plan only; no network at all)
//
// Writes happen only after everything is validated: copy limits, tag names,
// every screenshot's PNG header and size. Old previews are deleted only after
// every new one is uploaded and captioned.

import { createHmac, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import nodePath from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildDesired,
  buildDesiredPreviews,
  buildPatch,
  diffListing,
  discoverDesktopScreenshots,
  loadCopy,
  planPreviews,
  renderPlan,
  unknownTags,
  validateDesired,
} from './lib/amo-listing.mjs';

const repoRoot = nodePath.resolve(nodePath.dirname(fileURLToPath(import.meta.url)), '..');
const STORE_ASSETS = nodePath.join(repoRoot, 'apps/extension/store-assets');
const API = 'https://addons.mozilla.org/api/v5';

const env = (name, fallback = '') => (process.env[name] ?? '').trim() || fallback;
const fail = (message) => {
  console.error(`✗ ${message}`);
  process.exit(1);
};

const b64url = (input) => Buffer.from(input).toString('base64url');
/** AMO JWT (HS256, <=5 min). Same scheme as scripts/amo-release-notes.mjs. */
function mintJwt(issuer, secret) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64url(
    JSON.stringify({ iss: issuer, jti: randomUUID(), iat: now, exp: now + 240 }),
  );
  const sig = createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${sig}`;
}

function client({ issuer, secret }) {
  /** `body` is JSON, or FormData (sent multipart by fetch). */
  return async function amo(path, { method = 'GET', body } = {}) {
    const isForm = body instanceof FormData;
    const res = await fetch(`${API}${path}`, {
      method,
      headers: {
        ...(issuer && secret ? { Authorization: `JWT ${mintJwt(issuer, secret)}` } : {}),
        ...(body && !isForm ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: isForm ? body : JSON.stringify(body) } : {}),
    });
    const text = await res.text();
    let parsed = {};
    try {
      parsed = text ? JSON.parse(text) : {};
    } catch {
      /* HTML on some errors; the status carries the meaning */
    }
    return { status: res.status, body: parsed, text };
  };
}

const ok = (res) => res.status >= 200 && res.status < 300;
function must(res, what) {
  if (!ok(res)) throw new Error(`${what} failed: ${res.status} ${res.text.slice(0, 300)}`);
  return res.body;
}

async function main() {
  const argv = process.argv.slice(2);
  const fixtureAt = argv.indexOf('--offline-fixture');
  const fixture = fixtureAt === -1 ? '' : argv[fixtureAt + 1];
  if (fixtureAt !== -1 && !fixture) fail('--offline-fixture needs a file path');

  const mode = env('MODE', 'plan');
  if (!['plan', 'apply'].includes(mode)) fail(`MODE must be plan or apply, got "${mode}"`);
  if (fixture && mode !== 'plan') fail('--offline-fixture only works with MODE=plan');
  const dryRun = env('DRY_RUN') === '1';
  const writing = mode === 'apply' && !dryRun;

  const issuer = env('AMO_JWT_ISSUER');
  const secret = env('AMO_JWT_SECRET');
  if (mode === 'apply' && (!issuer || !secret))
    fail('MODE=apply needs AMO_JWT_ISSUER / AMO_JWT_SECRET.');
  const amo = client({ issuer, secret });

  // ---- repo state (all read and validated before any network write)
  const listing = JSON.parse(readFileSync(nodePath.join(STORE_ASSETS, 'listing.json'), 'utf8'));
  const addon = env('AMO_ADDON', listing.amo.slug);
  const copy = loadCopy(STORE_ASSETS, Object.keys(listing.amo.localeMap));
  const desired = buildDesired(listing, copy);
  const problems = validateDesired(desired);

  const shotLocale = env('AMO_SCREENSHOT_LOCALE', listing.amo.screenshots?.locale ?? 'uk');
  const shotRoot = nodePath.resolve(
    repoRoot,
    env('SCREENSHOTS_PATH', 'apps/extension/store-assets/screenshots/desktop'),
  );
  const found = discoverDesktopScreenshots(shotRoot, shotLocale);
  problems.push(...found.problems);
  const warnings = [];
  if (found.missing) {
    warnings.push(
      `no screenshots at ${nodePath.relative(repoRoot, shotRoot)}/${shotLocale}/ — screenshots skipped, metadata still syncs`,
    );
  }
  const { previews: desiredPreviews, warnings: captionWarnings } = buildDesiredPreviews(
    found.shots,
    listing,
  );
  warnings.push(...captionWarnings);

  // ---- live state
  let live;
  if (fixture) {
    live = JSON.parse(readFileSync(nodePath.resolve(fixture), 'utf8'));
    warnings.push('offline fixture: tag names not checked against AMO');
  } else {
    // No `lang`: every translation comes back, which the per-locale diff needs.
    live = must(await amo(`/addons/addon/${addon}/`), `reading ${addon}`);
    const allowed = await amo('/addons/tags/');
    if (ok(allowed) && Array.isArray(allowed.body)) {
      const bad = unknownTags(desired.tags, allowed.body);
      if (bad.length > 0) problems.push(`tags not in AMO's allowed list: ${bad.join(', ')}`);
    } else {
      warnings.push('could not fetch the allowed tag list; tags not validated');
    }
  }

  const diffs = diffListing(desired, live);
  const previewPlan = planPreviews(desiredPreviews, live.previews ?? [], {
    force: env('FORCE_SCREENSHOTS') === '1',
  });
  const summary = renderPlan({
    addon,
    diffs,
    previewPlan,
    warnings,
    problems,
    mode: dryRun ? 'apply, dry run' : mode,
  });
  console.log(summary);

  if (problems.length > 0) fail(`${problems.length} problem(s); nothing was written.`);
  if (!writing) return;

  // ---- apply: metadata
  const patch = buildPatch(diffs);
  if (Object.keys(patch).length > 0) {
    const after = must(
      await amo(`/addons/addon/${addon}/`, { method: 'PATCH', body: patch }),
      'PATCH add-on',
    );
    const still = diffListing(desired, after);
    if (still.length > 0) {
      // e.g. support_url, which the PATCH docs do not list: say so, do not hide it.
      console.warn(
        `! after PATCH, ${still.length} field(s) still differ: ${still.map((d) => `${d.field}${d.locale ? `[${d.locale}]` : ''}`).join(', ')}`,
      );
    }
    console.log(`✓ metadata updated (${Object.keys(patch).join(', ')})`);
  } else {
    console.log('✓ metadata already in sync');
  }

  // ---- apply: previews
  if (previewPlan.action === 'captions') {
    for (const op of previewPlan.ops) {
      must(
        await amo(`/addons/addon/${addon}/previews/${op.id}/`, {
          method: 'PATCH',
          body: { caption: op.caption },
        }),
        `captioning preview ${op.id}`,
      );
    }
    console.log(`✓ ${previewPlan.ops.length} caption(s) updated`);
  } else if (previewPlan.action === 'replace') {
    const byName = new Map(found.shots.map((s) => [s.fileName, s]));
    let uploaded = 0;
    for (const op of previewPlan.ops.filter((o) => o.op === 'upload')) {
      const form = new FormData();
      form.set(
        'image',
        new Blob([byName.get(op.fileName).bytes], { type: 'image/png' }),
        op.fileName,
      );
      form.set('position', String(op.position));
      const created = must(
        await amo(`/addons/addon/${addon}/previews/`, { method: 'POST', body: form }),
        `uploading ${op.fileName}`,
      );
      if (Object.keys(op.caption).length > 0) {
        // caption cannot be set on create (docs, "Preview Create"): second call.
        must(
          await amo(`/addons/addon/${addon}/previews/${created.id}/`, {
            method: 'PATCH',
            body: { caption: op.caption },
          }),
          `captioning ${op.fileName}`,
        );
      }
      uploaded += 1;
      console.log(`  uploaded ${op.fileName} -> preview ${created.id}`);
    }
    // Only now — everything new is in — remove the old previews.
    for (const op of previewPlan.ops.filter((o) => o.op === 'delete')) {
      must(
        await amo(`/addons/addon/${addon}/previews/${op.id}/`, { method: 'DELETE' }),
        `deleting preview ${op.id}`,
      );
    }
    console.log(`✓ ${uploaded} preview(s) uploaded, old ones removed`);
  } else {
    console.log(`✓ screenshots: ${previewPlan.action} (${previewPlan.reason})`);
  }
}

try {
  await main();
} catch (error) {
  fail(error.message);
}
