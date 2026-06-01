#!/usr/bin/env node
// scripts/get-cws-refresh-token.mjs
//
// In-house OAuth dance to mint a Chrome Web Store refresh token.
// Talks only to Google's own OAuth endpoints — zero npm dependencies.
//
// Why this exists: the CWS API authenticates with OAuth 2.0 tied to a
// user account (Google does not permit service accounts to own
// extensions), so CI needs a long-lived refresh token to publish
// non-interactively. `chrome-webstore-upload-cli@3` removed its built-in
// `login` helper, and the upstream's replacement is a third-party npm
// package we'd rather keep away from our CLIENT_SECRET. This script is
// auditable, dependency-free, and runs once every ~6 months (or
// whenever the token is rotated).
//
// Prerequisites:
//   1. OAuth client of type "Desktop" created at
//      https://console.cloud.google.com/apis/credentials
//   2. Chrome Web Store API enabled at
//      https://console.cloud.google.com/apis/library/chromewebstore.googleapis.com
//
// Usage:
//   CLIENT_ID=... CLIENT_SECRET=... pnpm get:cws-refresh-token
//
// The refresh token is printed to stdout so it pipes cleanly:
//   pnpm get:cws-refresh-token | gh secret set CWS_REFRESH_TOKEN
// or paste it into Repo Settings → Secrets and variables → Actions.

import http from 'node:http';
import { URL } from 'node:url';
import { exec } from 'node:child_process';

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const PORT = Number(process.env.PORT ?? 8765);
const TIMEOUT_MS = 5 * 60_000;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('error: set CLIENT_ID and CLIENT_SECRET env vars first');
  console.error('       (from the OAuth Desktop client in Google Cloud Console)');
  process.exit(2);
}

const REDIRECT_URI = `http://localhost:${PORT}`;
const SCOPE = 'https://www.googleapis.com/auth/chromewebstore';

const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
authUrl.searchParams.set('client_id', CLIENT_ID);
authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
authUrl.searchParams.set('response_type', 'code');
authUrl.searchParams.set('scope', SCOPE);
// access_type=offline + prompt=consent forces Google to return a
// refresh_token even if this user has previously approved the same
// client. Without these, repeated runs return only an access_token.
authUrl.searchParams.set('access_type', 'offline');
authUrl.searchParams.set('prompt', 'consent');

const code = await new Promise((resolve, reject) => {
  const timer = setTimeout(() => {
    server.close();
    reject(new Error(`timed out waiting for OAuth callback (${TIMEOUT_MS / 1000}s)`));
  }, TIMEOUT_MS);

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, REDIRECT_URI);
    const oauthCode = url.searchParams.get('code');
    const oauthError = url.searchParams.get('error');

    if (oauthError) {
      res.writeHead(400, { 'Content-Type': 'text/html' });
      res.end(`<h1>OAuth error</h1><pre>${oauthError}</pre>`);
      clearTimeout(timer);
      server.close();
      reject(new Error(`OAuth error from Google: ${oauthError}`));
      return;
    }

    if (oauthCode) {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<h1>Done</h1><p>Refresh token captured. You can close this tab.</p>');
      clearTimeout(timer);
      server.close();
      resolve(oauthCode);
      return;
    }

    res.writeHead(404).end();
  });

  server.listen(PORT, '127.0.0.1', () => {
    console.error(`==> Listening on ${REDIRECT_URI}`);
    console.error('==> Opening browser for consent — approve, then come back.');
    console.error('    If it does not open, visit:');
    console.error(`    ${authUrl}\n`);
    const opener =
      process.platform === 'darwin'
        ? 'open'
        : process.platform === 'win32'
          ? 'start ""'
          : 'xdg-open';
    exec(`${opener} '${authUrl}'`);
  });

  server.on('error', (err) => {
    clearTimeout(timer);
    if (err.code === 'EADDRINUSE') {
      reject(new Error(`port ${PORT} in use — rerun with PORT=8766 (or any free port)`));
    } else {
      reject(err);
    }
  });
});

console.error('==> Exchanging code for refresh token…');

const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    code,
    grant_type: 'authorization_code',
    redirect_uri: REDIRECT_URI,
  }),
});

if (!tokenRes.ok) {
  console.error(`error: Google token endpoint returned HTTP ${tokenRes.status}`);
  console.error(await tokenRes.text());
  process.exit(1);
}

const body = await tokenRes.json();
const { refresh_token, access_token } = body;

if (!refresh_token) {
  console.error('error: Google did not return a refresh_token.');
  console.error('       (access_type=offline + prompt=consent should force this — ');
  console.error('       most likely cause is that consent was not completed.)');
  console.error('       Raw response:');
  console.error(JSON.stringify(body, null, 2));
  process.exit(1);
}

if (access_token) {
  console.error('==> Verified: Google also minted a fresh access_token.');
}
console.error('==> Save the value below as CWS_REFRESH_TOKEN in GitHub secrets.\n');

process.stdout.write(refresh_token + '\n');
