#!/usr/bin/env node
// scripts/cws-publish.mjs
//
// In-house Chrome Web Store upload + publish. Zero npm dependencies;
// uses only Node 22 built-ins and Google's documented REST endpoints.
//
// Replaces chrome-webstore-upload-cli@3 in the release workflow so that
// neither our CLIENT_SECRET nor our REFRESH_TOKEN ever touches a
// third-party package, even on an ephemeral CI runner.
//
// Flow:
//   1. POST to https://oauth2.googleapis.com/token with the refresh
//      token → access_token (1 h lifetime).
//   2. PUT the zip to
//      https://www.googleapis.com/upload/chromewebstore/v1.1/items/{id}
//      → uploadState.
//   3. POST to
//      https://www.googleapis.com/chromewebstore/v1.1/items/{id}/publish
//      → review queue.
//
// Required env vars:
//   CLIENT_ID, CLIENT_SECRET, REFRESH_TOKEN  OAuth credentials
//   EXTENSION_ID                             32-char CWS item ID
//   SOURCE_ZIP                               path to the .zip to upload
//
// Optional env vars:
//   SKIP_PUBLISH=1       upload only, do not publish (smoke test)
//   PUBLISH_TARGET=...   "default" (default) or "trustedTesters"
//
// Reference: https://developer.chrome.com/docs/webstore/api

import { readFile } from 'node:fs/promises';

const required = ['CLIENT_ID', 'CLIENT_SECRET', 'REFRESH_TOKEN', 'EXTENSION_ID', 'SOURCE_ZIP'];
const missing = required.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`error: missing required env var(s): ${missing.join(', ')}`);
  process.exit(2);
}

const {
  CLIENT_ID,
  CLIENT_SECRET,
  REFRESH_TOKEN,
  EXTENSION_ID,
  SOURCE_ZIP,
  SKIP_PUBLISH,
  PUBLISH_TARGET = 'default',
} = process.env;

// ---------------------------------------------------------------------
// 1. Mint a short-lived access token from our long-lived refresh token.
// ---------------------------------------------------------------------

console.error('==> Minting access token');
const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    refresh_token: REFRESH_TOKEN,
    grant_type: 'refresh_token',
  }),
});

if (!tokenRes.ok) {
  console.error(`error: token endpoint returned HTTP ${tokenRes.status}`);
  console.error(await tokenRes.text());
  process.exit(1);
}

const { access_token } = await tokenRes.json();
if (!access_token) {
  console.error('error: token endpoint did not return access_token');
  process.exit(1);
}

const authHeader = `Bearer ${access_token}`;
const apiVersion = '2';

// ---------------------------------------------------------------------
// 2. Upload the package. The PUT response carries uploadState — usually
//    SUCCESS or FAILURE synchronously. IN_PROGRESS is rare but possible;
//    if we see it, fail loud rather than poll silently so the workflow
//    operator sees the state instead of a hanging job.
// ---------------------------------------------------------------------

console.error(`==> Uploading ${SOURCE_ZIP} to item ${EXTENSION_ID}`);
const zipBytes = await readFile(SOURCE_ZIP);
const uploadRes = await fetch(
  `https://www.googleapis.com/upload/chromewebstore/v1.1/items/${EXTENSION_ID}`,
  {
    method: 'PUT',
    headers: {
      Authorization: authHeader,
      'x-goog-api-version': apiVersion,
    },
    body: zipBytes,
  },
);

if (!uploadRes.ok) {
  console.error(`error: upload returned HTTP ${uploadRes.status}`);
  console.error(await uploadRes.text());
  process.exit(1);
}

const uploadJson = await uploadRes.json();
console.error(`    uploadState: ${uploadJson.uploadState}`);

if (uploadJson.uploadState !== 'SUCCESS') {
  console.error(`error: uploadState=${uploadJson.uploadState}`);
  if (Array.isArray(uploadJson.itemError)) {
    for (const e of uploadJson.itemError) {
      console.error(`  - ${e.error_code}: ${e.error_detail}`);
    }
  }
  console.error('    full response:');
  console.error(JSON.stringify(uploadJson, null, 2));
  process.exit(1);
}

if (SKIP_PUBLISH) {
  console.error('==> SKIP_PUBLISH set — upload finished, not publishing.');
  process.exit(0);
}

// ---------------------------------------------------------------------
// 3. Publish the uploaded draft to the review queue.
// ---------------------------------------------------------------------

console.error(`==> Publishing (publishTarget=${PUBLISH_TARGET})`);
const publishRes = await fetch(
  `https://www.googleapis.com/chromewebstore/v1.1/items/${EXTENSION_ID}/publish?publishTarget=${PUBLISH_TARGET}`,
  {
    method: 'POST',
    headers: {
      Authorization: authHeader,
      'x-goog-api-version': apiVersion,
      'Content-Length': '0',
    },
  },
);

const publishJson = await publishRes.json().catch(() => ({}));

if (!publishRes.ok) {
  console.error(`error: publish returned HTTP ${publishRes.status}`);
  console.error(JSON.stringify(publishJson, null, 2));
  process.exit(1);
}

console.error(`    status: ${JSON.stringify(publishJson.status)}`);
if (publishJson.statusDetail) {
  console.error(`    statusDetail: ${JSON.stringify(publishJson.statusDetail)}`);
}

// Status values per https://developer.chrome.com/docs/webstore/webstore_api/items:
//   OK, ITEM_PENDING_REVIEW          — happy paths
//   NOT_AUTHORIZED, INVALID_DEVELOPER, DEVELOPER_NO_OWNERSHIP,
//   DEVELOPER_SUSPENDED, ITEM_NOT_PENDING_REVIEW, ITEM_TAKEN_DOWN,
//   PUBLISHER_SUSPENDED               — failure modes
const happyStatuses = new Set(['OK', 'ITEM_PENDING_REVIEW']);
const statuses = Array.isArray(publishJson.status)
  ? publishJson.status
  : publishJson.status
    ? [publishJson.status]
    : [];

if (statuses.length === 0 || !statuses.every((s) => happyStatuses.has(s))) {
  console.error('error: publish reported a non-OK status');
  process.exit(1);
}

console.error('==> Done. Submitted to Chrome Web Store review queue.');
