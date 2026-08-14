#!/usr/bin/env node
// scripts/amo-release-notes.mjs
//
// Set the Firefox listing's per-version release notes on addons.mozilla.org,
// in Ukrainian and English, from RELEASE-NOTES.md. Zero npm dependencies;
// Node 22 built-ins only.
//
// WHY THIS EXISTS
//
// `web-ext sign` uploads and submits the version but sends no release notes,
// and it has no flag for them — so every Movar version on AMO has shipped with
// an empty "Release notes" section, while the same text was being written for
// the App Store each release. AMO's API supports `release_notes` as a
// *translated* field on a version, so both locales can be set properly rather
// than defaulting a Ukrainian audience to English.
//
// Runs AFTER `web-ext sign`, because the version has to exist before it can be
// annotated. That ordering also makes this safe to fail: the extension is
// already submitted, so a failure here costs release notes, not the release.
// The workflow treats it accordingly.
//
// Auth is AMO's JWT scheme — HMAC-SHA256, `Authorization: JWT <token>`, and a
// lifetime Mozilla caps at five minutes past `iat`.
//
// Required env:
//   AMO_JWT_ISSUER / AMO_JWT_SECRET   the same credentials web-ext signs with
//   VERSION                            version string to annotate, e.g. 1.6.2
//
// Optional env:
//   AMO_ADDON     addon slug or id (default: movar)
//   DRY_RUN=1     resolve and print, change nothing
//   POLL_MINUTES  how long to wait for the version to appear (default 10)

import { createHmac, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import nodePath from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseReleaseNotes, noteForLocale, withChangelogLink } from './lib/release-notes.mjs';

const repoRoot = nodePath.resolve(nodePath.dirname(fileURLToPath(import.meta.url)), '..');
const NOTES = 'apps/extension/store-assets/RELEASE-NOTES.md';
const API = 'https://addons.mozilla.org/api/v5';

/** AMO locale → the locale code used in RELEASE-NOTES.md headings. */
const LOCALES = { uk: 'uk', 'en-US': 'en' };

const env = (name, fallback = '') => (process.env[name] ?? '').trim() || fallback;
const DRY_RUN = env('DRY_RUN') === '1';

const b64url = (input) => Buffer.from(input).toString('base64url');

/**
 * Mint an AMO JWT. Deliberately short-lived: Mozilla rejects anything more
 * than five minutes past `iat`, and this script's whole run is seconds.
 */
function mintJwt(issuer, secret) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64url(
    JSON.stringify({ iss: issuer, jti: randomUUID(), iat: now, exp: now + 240 }),
  );
  const signature = createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${signature}`;
}

async function amo(path, { issuer, secret, method = 'GET', body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      // A fresh token per request — they expire fast and cost nothing.
      Authorization: `JWT ${mintJwt(issuer, secret)}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let parsed = {};
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    /* AMO returns HTML on some errors; the status carries the meaning */
  }
  return { status: res.status, body: parsed, text };
}

/**
 * Find the version AMO knows by this version string. `web-ext sign` has
 * already returned by the time we run, but AMO can take a moment to expose the
 * new version, so this waits rather than failing on a race.
 */
async function findVersion(addon, version, auth, pollMinutes) {
  const deadline = Date.now() + pollMinutes * 60_000;
  for (;;) {
    const res = await amo(`/addons/addon/${addon}/versions/?filter=all&page_size=50`, auth);
    if (res.status === 401 || res.status === 403) {
      throw new Error(
        `AMO rejected the credentials (${res.status}). AMO_JWT_ISSUER / AMO_JWT_SECRET are the same pair web-ext signs with.`,
      );
    }
    if (res.status !== 200) {
      throw new Error(`listing versions failed: ${res.status} ${res.text.slice(0, 200)}`);
    }
    const hit = (res.body?.results ?? []).find((v) => v.version === version);
    if (hit) return hit;

    if (Date.now() > deadline) {
      const seen = (res.body?.results ?? [])
        .slice(0, 5)
        .map((v) => v.version)
        .join(', ');
      throw new Error(
        `version ${version} not visible on AMO within ${pollMinutes} min (most recent: ${seen || 'none'}). The upload may still be processing — re-run this step; it changes nothing else.`,
      );
    }
    console.log(`  version ${version} not listed yet — waiting`);
    await new Promise((r) => setTimeout(r, 30_000));
  }
}

async function main() {
  const issuer = env('AMO_JWT_ISSUER');
  const secret = env('AMO_JWT_SECRET');
  const version = env('VERSION');
  const addon = env('AMO_ADDON', 'movar');
  const pollMinutes = Number(env('POLL_MINUTES', '10'));

  if (!issuer || !secret) {
    console.error('✗ AMO_JWT_ISSUER / AMO_JWT_SECRET are not set.');
    process.exit(1);
  }
  if (!version) {
    console.error('✗ VERSION is not set.');
    process.exit(1);
  }

  const all = parseReleaseNotes(readFileSync(nodePath.resolve(repoRoot, NOTES), 'utf8'));
  const forVersion = all.get(version);
  if (!forVersion) {
    console.error(`✗ No "## ${version}" block in ${NOTES}.`);
    process.exit(1);
  }

  /** @type {Record<string, string>} */
  const releaseNotes = {};
  for (const [amoLocale, fileLocale] of Object.entries(LOCALES)) {
    const note = noteForLocale(forVersion, fileLocale);
    if (!note) {
      // Hard error, not a partial write: shipping one locale would leave the
      // other showing nothing while looking like the step succeeded.
      console.error(`✗ No ${fileLocale} note for ${version} — cannot set AMO's ${amoLocale}.`);
      process.exit(1);
    }
    // AMO renders release notes as sanitized HTML (`sanitizeUserHTML`, which
    // allows `a` and converts newlines with `nl2br` first), so the footer is a
    // real anchor rather than a bare URL. AMO rewrites the href through its
    // outgoing-link bouncer on display.
    releaseNotes[amoLocale] = withChangelogLink(note, fileLocale, { format: 'html' });
  }

  console.log(`AMO release notes — ${addon} ${version} [${Object.keys(releaseNotes).join(', ')}]`);

  const auth = { issuer, secret };
  const found = await findVersion(addon, version, auth, pollMinutes);
  console.log(`  version ${version} is id ${found.id}`);

  if (DRY_RUN) {
    for (const [locale, note] of Object.entries(releaseNotes)) {
      console.log(`  [dry-run] would set ${locale}: ${note.split('\n')[0].slice(0, 60)}…`);
    }
    return;
  }

  const patch = await amo(`/addons/addon/${addon}/versions/${found.id}/`, {
    ...auth,
    method: 'PATCH',
    body: { release_notes: releaseNotes },
  });
  if (patch.status < 200 || patch.status >= 300) {
    throw new Error(`setting release notes failed: ${patch.status} ${patch.text.slice(0, 300)}`);
  }

  const applied = Object.keys(patch.body?.release_notes ?? releaseNotes);
  console.log(`✓ release notes set on AMO for ${version} (${applied.join(', ')})`);
}

await main();
