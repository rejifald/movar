// scripts/lib/asc-api.mjs
//
// Minimal App Store Connect API client — zero npm dependencies, Node 22
// built-ins only (`crypto`), same house style as scripts/cws-publish.mjs.
//
// Shared by scripts/apple-credentials-audit.mjs (read-only diagnosis) and
// scripts/apple-provisioning.mjs (fetch-or-create provisioning profiles), so
// the JWT shape and error handling are defined once. Both talk to the same
// key, and a bug in the token would otherwise present as two unrelated
// mysteries.
//
// Auth is an ES256 JWT signed with the team's .p8 private key. Two payload
// shapes exist: TEAM keys carry `iss` (the issuer UUID), INDIVIDUAL keys carry
// `sub: "user"` and no issuer. Xcode's automatic signing only understands team
// keys, so `team` is the default and `individual` exists to identify a
// mistakenly-generated individual key.

import { createPrivateKey, sign } from 'node:crypto';

const ASC = 'https://api.appstoreconnect.apple.com';

const b64url = (buf) => Buffer.from(buf).toString('base64url');

/**
 * Parse a base64-encoded .p8 into a key object, with the failure modes spelled
 * out — a mangled key and a revoked key both surface as a 401 from Apple, so
 * ruling out the local ones first saves a lot of guessing.
 *
 * @returns {{key: import('node:crypto').KeyObject, curve: string} | {error: string}}
 */
export function readPrivateKey(b64) {
  let pem;
  try {
    pem = Buffer.from(b64, 'base64').toString('utf8');
  } catch {
    return { error: 'not valid base64.' };
  }
  if (!pem.includes('BEGIN PRIVATE KEY')) {
    const looksLikeRawPem = b64.includes('BEGIN PRIVATE KEY');
    return {
      error: looksLikeRawPem
        ? 'holds the raw .p8 text, not its base64 encoding. Re-set it with `base64 -i AuthKey_XXXX.p8 | gh secret set <NAME>`.'
        : 'decodes to something that is not a PKCS#8 PEM (no "BEGIN PRIVATE KEY" header).',
    };
  }
  try {
    const key = createPrivateKey(pem);
    const { namedCurve } = key.asymmetricKeyDetails ?? {};
    if (key.asymmetricKeyType !== 'ec' || namedCurve !== 'prime256v1') {
      return {
        error: `parses but is ${key.asymmetricKeyType}/${namedCurve ?? 'unknown curve'}; App Store Connect keys are EC prime256v1 (P-256).`,
      };
    }
    return { key, curve: namedCurve };
  } catch (error) {
    return { error: `does not parse as a private key: ${error.message}` };
  }
}

/** Mint a short-lived ES256 bearer token. */
export function mintJwt({ key, keyId, issuerId, style = 'team' }) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'ES256', kid: keyId, typ: 'JWT' };
  const payload =
    style === 'individual'
      ? { sub: 'user', aud: 'appstoreconnect-v1', iat: now, exp: now + 600 }
      : { iss: issuerId, aud: 'appstoreconnect-v1', iat: now, exp: now + 600 };
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  // JOSE wants the raw r||s pair, not the DER sequence `sign` emits by default.
  const signature = sign('sha256', Buffer.from(signingInput), { key, dsaEncoding: 'ieee-p1363' });
  return `${signingInput}.${b64url(signature)}`;
}

/**
 * One request. Never throws on an HTTP error — callers decide which statuses
 * are findings and which are fatal, which matters for the audit, where a 403 is
 * the answer rather than a crash.
 *
 * @returns {Promise<{status: number, detail: string, body: any}>}
 */
export async function request(token, path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(`${ASC}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch (error) {
    return { status: 0, detail: `network error: ${error.message}`, body: {} };
  }
  const text = await res.text();
  let parsed;
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    parsed = {};
  }
  const detail = (parsed.errors ?? [])
    .map((e) => [e.code, e.detail || e.title].filter(Boolean).join(': '))
    .join(' | ');
  return { status: res.status, detail, body: parsed };
}

/** Same as `request`, but a non-2xx is a hard error. For write paths. */
export async function requireOk(token, path, options) {
  const res = await request(token, path, options);
  if (res.status < 200 || res.status >= 300) {
    throw new Error(
      `${options?.method ?? 'GET'} ${path} → ${res.status}${res.detail ? ` — ${res.detail}` : ''}`,
    );
  }
  return res.body;
}

/**
 * Build an authenticated client from the standard env vars, or explain what is
 * missing. Both callers read the same four secrets.
 */
export function clientFromEnv(env = process.env) {
  const read = (name) => (env[name] ?? '').trim();
  const keyId = read('APPLE_ASC_KEY_ID');
  const issuerId = read('APPLE_ASC_ISSUER_ID');
  const p8 = read('APPLE_ASC_API_KEY_P8');
  const missing = [
    ['APPLE_ASC_KEY_ID', keyId],
    ['APPLE_ASC_ISSUER_ID', issuerId],
    ['APPLE_ASC_API_KEY_P8', p8],
  ]
    .filter(([, v]) => !v)
    .map(([n]) => n);
  if (missing.length > 0) return { error: `not set: ${missing.join(', ')}` };

  const parsed = readPrivateKey(p8);
  if (parsed.error) return { error: `APPLE_ASC_API_KEY_P8 ${parsed.error}` };

  return { token: mintJwt({ key: parsed.key, keyId, issuerId }), keyId, issuerId };
}
