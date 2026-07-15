// ci-asc-probe.mjs — TEMPORARY diagnostic (paired with .github/workflows/asc-key-probe.yml).
//
// Why release-safari 401s: the archive fails on Apple's provisioning endpoint
// (xcbuild/listTeams) during automatic signing, before anything is signed or
// uploaded. That single 401 can't tell us whether the .p8 / Key ID / Issuer are
// WRONG, or VALID-but-under-privileged. This probe settles it by hitting the
// plain App Store Connect REST API with the same key — read-only, four GETs.
//
//   • 401 on basic auth            → the key TRIPLE is wrong (value/encoding/issuer/revoked)
//   • auth 200, provisioning 401/403 → key VALID but ROLE lacks Certs/IDs/Profiles access
//   • all 200                      → key fully capable → xcbuild 401 is a key-type /
//                                     automatic-signing-in-CI problem (move to manual signing)
//
// Usage: node ci-asc-probe.mjs <path-to-decoded-AuthKey.p8>
//   APPLE_ASC_KEY_ID and APPLE_ASC_ISSUER_ID come from the environment.

import crypto from 'node:crypto';
import fs from 'node:fs';

const keyId = process.env.APPLE_ASC_KEY_ID;
const issuerId = process.env.APPLE_ASC_ISSUER_ID;
const p8Path = process.argv[2];

if (!keyId || !issuerId || !p8Path) {
  console.error('::error::usage: node ci-asc-probe.mjs <AuthKey.p8>  (APPLE_ASC_KEY_ID / APPLE_ASC_ISSUER_ID from env)');
  process.exit(1);
}

const pem = fs.readFileSync(p8Path, 'utf8');
if (!pem.includes('BEGIN PRIVATE KEY')) {
  console.error('::error::Decoded APPLE_ASC_API_KEY_P8 is not a PEM private key — the base64 secret is mangled (wrapping / newline / truncation). Re-encode with `base64 -i AuthKey_XXXX.p8`.');
  process.exit(1);
}

// Short-lived ES256 JWT — the auth App Store Connect expects for every v1 call.
const now = Math.floor(Date.now() / 1000);
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const header = { alg: 'ES256', kid: keyId, typ: 'JWT' };
const payload = { iss: issuerId, iat: now, exp: now + 600, aud: 'appstoreconnect-v1' };
const input = `${b64(header)}.${b64(payload)}`;

let jwt;
try {
  // ieee-p1363 = the raw R||S signature JOSE/ES256 wants (not Node's default DER).
  const sig = crypto.sign('SHA256', Buffer.from(input), { key: pem, dsaEncoding: 'ieee-p1363' });
  jwt = `${input}.${sig.toString('base64url')}`;
} catch (e) {
  console.error(`::error::JWT signing failed — the .p8 is not a valid EC P-256 key: ${e.message}`);
  process.exit(1);
}

const endpoints = [
  ['basic-auth', '/v1/apps?limit=1'],
  ['identifiers', '/v1/bundleIds?limit=1'],
  ['certificates', '/v1/certificates?limit=1'],
  ['profiles', '/v1/profiles?limit=1'],
];

const status = {};
for (const [label, path] of endpoints) {
  const r = await fetch('https://api.appstoreconnect.apple.com' + path, {
    headers: { Authorization: `Bearer ${jwt}` },
  });
  status[label] = r.status;
  let note = '';
  if (r.status !== 200) {
    const t = await r.text();
    try {
      const j = JSON.parse(t);
      note = ' — ' + (j.errors?.[0]?.detail || j.errors?.[0]?.title || t.slice(0, 140));
    } catch {
      note = ' — ' + t.slice(0, 140);
    }
  }
  console.log(`${label.padEnd(13)} GET ${path.padEnd(26)} → HTTP ${r.status}${note}`);
}

const basic = status['basic-auth'];
const prov = ['identifiers', 'certificates', 'profiles'].map((k) => status[k]);
console.log('\n──────────────── VERDICT ────────────────');
if (basic === 401) {
  console.log('❌ WRONG KEY VALUE. 401 on basic auth → the .p8 / Key ID / Issuer triple itself is rejected.');
  console.log('   Causes: Issuer/key-type mismatch (Team vs Individual), a revoked/rotated key, or a mangled .p8.');
  console.log('   Fix: regenerate the key in App Store Connect; re-set APPLE_ASC_KEY_ID / APPLE_ASC_ISSUER_ID / APPLE_ASC_API_KEY_P8.');
} else if (basic === 200 && prov.every((s) => s === 200)) {
  console.log('✅ KEY IS FULLY CAPABLE. Authenticates AND reads identifiers/certificates/profiles.');
  console.log('   → The release-safari 401 is NOT the key value or its ASC-API role. It is specific to Xcode’s');
  console.log('     cloud-signing (xcbuild) audience or automatic-signing-in-CI flakiness.');
  console.log('   Fix: switch the archive to MANUAL signing with a pre-provisioned profile so it never calls listTeams.');
} else if (basic === 200) {
  console.log('⚠️ KEY VALUE IS FINE, ROLE IS TOO LOW. Authenticates (200) but cannot read provisioning resources:');
  console.log(`     identifiers=${status['identifiers']}  certificates=${status['certificates']}  profiles=${status['profiles']}`);
  console.log('   → This is the smoking gun for the listTeams 401: -allowProvisioningUpdates needs Certificates,');
  console.log('     Identifiers & Profiles access the key lacks.');
  console.log('   Fix: regenerate the key with the ADMIN role (App Manager is not enough); re-set the 3 ASC secrets.');
  console.log('     No cert or team changes needed.');
} else {
  console.log(`Unexpected: basic-auth=${basic}, provisioning=${prov.join('/')}. Read the rows above.`);
}
console.log('(This probe made only read-only GETs — nothing was submitted or changed in App Store Connect.)');
