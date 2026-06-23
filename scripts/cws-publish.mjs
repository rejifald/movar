#!/usr/bin/env node
// scripts/cws-publish.mjs
//
// In-house Chrome Web Store upload + publish — API V2, service-account auth.
// Zero npm dependencies; only Node 22 built-ins (`crypto`, `fs`).
//
// Why a service account: the Chrome Web Store API V2 lets a Google Cloud
// service account authenticate server-to-server. Unlike the old user-OAuth
// refresh-token flow it replaced, there is no browser consent and no token
// that expires out from under CI — a "Testing" consent screen revoked the
// refresh token every 7 days, which broke releases with `invalid_grant`.
// The legacy `/chromewebstore/v1.1/` API is deprecated and sunsets
// 2026-10-15; V2 lives on chromewebstore.googleapis.com.
//
// Flow:
//   1. Sign a JWT with the service-account private key (RS256) and exchange
//      it at https://oauth2.googleapis.com/token for a 1 h access token.
//   2. POST the zip to
//      .../upload/v2/publishers/{PUBLISHER_ID}/items/{ITEM_ID}:upload
//      → uploadState.
//   3. POST to
//      .../v2/publishers/{PUBLISHER_ID}/items/{ITEM_ID}:publish
//      → review queue.
//
// Required env vars:
//   SERVICE_ACCOUNT_KEY   the service-account JSON key (full file contents)
//   PUBLISHER_ID          publisher ID (Developer Dashboard → Account)
//   EXTENSION_ID          32-char CWS item ID
//   SOURCE_ZIP            path to the .zip to upload
//
// Optional env vars:
//   SKIP_PUBLISH=1        upload only, do not publish (smoke test)
//   PUBLISH_TYPE=...      "DEFAULT_PUBLISH" (default) or "STAGED_PUBLISH"
//   DEPLOY_PERCENTAGE=N   gradual-rollout percentage (1-100)
//
// Item visibility (public vs trusted testers) is set in the Developer
// Dashboard in V2 — it is NOT a request field like v1.1's publishTarget.
//
// Reference: https://developer.chrome.com/docs/webstore/api
//            https://developer.chrome.com/docs/webstore/service-accounts

import { readFile } from 'node:fs/promises';
import { createSign } from 'node:crypto';

const required = ['SERVICE_ACCOUNT_KEY', 'PUBLISHER_ID', 'EXTENSION_ID', 'SOURCE_ZIP'];
const missing = required.filter((k) => !process.env[k]);
if (missing.length > 0) {
  console.error(`error: missing required env var(s): ${missing.join(', ')}`);
  process.exit(2);
}

const {
  SERVICE_ACCOUNT_KEY,
  PUBLISHER_ID,
  EXTENSION_ID,
  SOURCE_ZIP,
  SKIP_PUBLISH,
  PUBLISH_TYPE = 'DEFAULT_PUBLISH',
  DEPLOY_PERCENTAGE,
} = process.env;

const API = 'https://chromewebstore.googleapis.com';
const SCOPE = 'https://www.googleapis.com/auth/chromewebstore';

// base64url-encode a string or Buffer (JWT segments + signature).
const base64url = (input) =>
  Buffer.from(input)
    .toString('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');

const parseJson = (res) => res.json().catch(() => ({}));

// Collapse either error envelope to one human line: Google's API shape
// `{ error: { code, status, message } }` or the OAuth token-endpoint shape
// `{ error: "invalid_grant", error_description: "…" }`.
function describeError(body) {
  if (!body || typeof body !== 'object') return String(body ?? '(empty body)');
  if (typeof body.error === 'string') {
    return body.error_description ? `${body.error}: ${body.error_description}` : body.error;
  }
  if (body.error && typeof body.error === 'object') {
    const { code, status, message } = body.error;
    return `${status ?? code ?? 'error'}: ${message ?? JSON.stringify(body.error)}`;
  }
  return JSON.stringify(body);
}

// ---------------------------------------------------------------------
// 1. Mint an access token from the service-account key (signed JWT).
// ---------------------------------------------------------------------

console.error('==> Minting access token (service account)');

let key;
try {
  key = JSON.parse(SERVICE_ACCOUNT_KEY);
} catch {
  console.error(
    'error: SERVICE_ACCOUNT_KEY is not valid JSON — it must be the full key file contents',
  );
  process.exit(2);
}
if (!key.client_email || !key.private_key) {
  console.error('error: SERVICE_ACCOUNT_KEY is missing client_email or private_key');
  process.exit(2);
}

const nowSec = Math.floor(Date.now() / 1000);
const jwtHeader = { alg: 'RS256', typ: 'JWT', kid: key.private_key_id };
const jwtClaims = {
  iss: key.client_email,
  scope: SCOPE,
  aud: 'https://oauth2.googleapis.com/token',
  iat: nowSec,
  exp: nowSec + 3600,
};
const signingInput = `${base64url(JSON.stringify(jwtHeader))}.${base64url(JSON.stringify(jwtClaims))}`;
const signature = createSign('RSA-SHA256').update(signingInput).sign(key.private_key);
const assertion = `${signingInput}.${base64url(signature)}`;

const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion,
  }),
});

if (!tokenRes.ok) {
  console.error(
    `error: token endpoint returned HTTP ${tokenRes.status}: ${describeError(await parseJson(tokenRes))}`,
  );
  console.error('  Checklist:');
  console.error('  - SERVICE_ACCOUNT_KEY is the full JSON key for the intended service account');
  console.error('  - that service account is added in the CWS Developer Dashboard → Account');
  console.error("  - the Chrome Web Store API is enabled in the key's Google Cloud project");
  console.error('  - the runner clock is correct (JWT iat/exp must be within ~1 h of Google)');
  process.exit(1);
}

const { access_token: accessToken } = await tokenRes.json();
if (!accessToken) {
  console.error('error: token endpoint did not return access_token');
  process.exit(1);
}
const authHeader = `Bearer ${accessToken}`;

// Poll fetchStatus until an async (IN_PROGRESS) upload settles. V2 usually
// returns SUCCEEDED synchronously, but the upload can go async; we surface
// the resolved state rather than letting the job hang or pass blindly.
async function waitForUpload() {
  for (let i = 1; i <= 20; i++) {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    const res = await fetch(
      `${API}/v2/publishers/${PUBLISHER_ID}/items/${EXTENSION_ID}:fetchStatus`,
      {
        headers: { Authorization: authHeader },
      },
    );
    const json = await parseJson(res);
    if (!res.ok) {
      console.error(`    [${i}/20] fetchStatus HTTP ${res.status}: ${describeError(json)}`);
      continue;
    }
    const state = json.lastAsyncUploadState;
    console.error(`    [${i}/20] lastAsyncUploadState: ${state}`);
    if (state === 'SUCCEEDED' || state === 'FAILED') return state;
  }
  return 'IN_PROGRESS';
}

// ---------------------------------------------------------------------
// 2. Upload the package (raw zip bytes).
// ---------------------------------------------------------------------

console.error(`==> Uploading ${SOURCE_ZIP} to item ${EXTENSION_ID}`);
const zipBytes = await readFile(SOURCE_ZIP);
const uploadRes = await fetch(
  `${API}/upload/v2/publishers/${PUBLISHER_ID}/items/${EXTENSION_ID}:upload`,
  {
    method: 'POST',
    headers: { Authorization: authHeader, 'Content-Type': 'application/zip' },
    body: zipBytes,
  },
);

const uploadJson = await parseJson(uploadRes);
if (!uploadRes.ok) {
  console.error(`error: upload returned HTTP ${uploadRes.status}: ${describeError(uploadJson)}`);
  process.exit(1);
}

let uploadState = uploadJson.uploadState;
console.error(`    uploadState: ${uploadState}`);
if (uploadState === 'IN_PROGRESS') {
  uploadState = await waitForUpload();
  console.error(`    uploadState (after poll): ${uploadState}`);
}

if (uploadState !== 'SUCCEEDED') {
  console.error('error: upload did not succeed');
  console.error(JSON.stringify(uploadJson, null, 2));
  process.exit(1);
}

// ---------------------------------------------------------------------
// 3. Publish the uploaded draft to the review queue. Visibility (public
//    vs trusted testers) comes from the dashboard in V2, not the request.
// ---------------------------------------------------------------------

if (SKIP_PUBLISH) {
  console.error('==> SKIP_PUBLISH set — upload finished, not publishing.');
  process.exit(0);
}

const publishBody = { publishType: PUBLISH_TYPE };
if (DEPLOY_PERCENTAGE) {
  publishBody.deployInfos = [{ deployPercentage: Number(DEPLOY_PERCENTAGE) }];
}

console.error(
  `==> Publishing (publishType=${PUBLISH_TYPE}${DEPLOY_PERCENTAGE ? `, deployPercentage=${DEPLOY_PERCENTAGE}` : ''})`,
);
const publishRes = await fetch(
  `${API}/v2/publishers/${PUBLISHER_ID}/items/${EXTENSION_ID}:publish`,
  {
    method: 'POST',
    headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
    body: JSON.stringify(publishBody),
  },
);

const publishJson = await parseJson(publishRes);
if (!publishRes.ok) {
  console.error(`error: publish returned HTTP ${publishRes.status}: ${describeError(publishJson)}`);
  process.exit(1);
}

const { state } = publishJson;
console.error(`    state: ${state}`);
for (const w of publishJson.warningInfo?.warnings ?? []) {
  console.error(`    warning: ${`${w.reason ?? ''} ${w.description ?? ''}`.trim()}`);
}

// Happy post-publish states. PENDING_REVIEW is the normal outcome; the
// others can appear depending on visibility / staging. A REJECTED/CANCELLED
// state — or no state at all — is a failure.
const happy = new Set(['PENDING_REVIEW', 'PUBLISHED', 'PUBLISHED_TO_TESTERS', 'STAGED']);
if (!state || !happy.has(state)) {
  console.error(`error: publish reported a non-success state: ${state ?? '(none)'}`);
  console.error(JSON.stringify(publishJson, null, 2));
  process.exit(1);
}

console.error('==> Done. Submitted to Chrome Web Store review queue.');
