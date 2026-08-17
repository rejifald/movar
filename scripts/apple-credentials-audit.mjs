#!/usr/bin/env node
/**
 * Read-only audit of the Apple release credentials.
 *
 * `release-safari` and `safari-signing-rehearsal` both die at the archive step
 * with a 401 from `appstoreconnect.apple.com/xcbuild/.../listTeams.action`.
 * That call is made by Xcode's automatic signing and involves ONLY the App
 * Store Connect API key triple (key id + issuer id + .p8) — the .p12 certs are
 * imported successfully before it and aren't consulted. So the question this
 * script answers is: *which* part of that triple is wrong, and what does the
 * key actually have access to?
 *
 * It answers that by minting App Store Connect JWTs itself and probing a
 * handful of GET endpoints. Every probe is a read; nothing here creates,
 * revokes, uploads, or submits anything.
 *
 * The interesting distinctions it can draw:
 *
 *   - `/v1/apps` 401 → the triple itself is bad (wrong issuer, key id that
 *     doesn't match the .p8, mangled .p8, or a revoked key). Regenerate.
 *   - `/v1/apps` 200 but `/v1/certificates` 403 → the key is valid but has no
 *     "Certificates, Identifiers & Profiles" access. This is what an
 *     App Manager key looks like, and it is exactly what Xcode's automatic
 *     signing needs. Regenerate as Admin (or Developer + that access).
 *   - team-style JWT 401 but individual-style JWT 200 → the secret holds an
 *     *Individual* key, not a *Team* key. Xcode automatic signing does not
 *     support individual keys at all. Regenerate under Team Keys.
 *   - everything 200 → the key is fine and the 401 is not a credential
 *     problem.
 *
 * Reads from the environment (all optional — missing ones are reported, not
 * fatal): APPLE_ASC_KEY_ID, APPLE_ASC_ISSUER_ID, APPLE_ASC_API_KEY_P8 (base64),
 * APPLE_TEAM_ID, and — supplied by the workflow after inspecting the .p12s —
 * APPLE_DIST_CERT_SERIAL, APPLE_DEVID_CERT_SERIAL.
 *
 * Prints a Markdown report to stdout and, on CI, appends it to
 * $GITHUB_STEP_SUMMARY. Exits 1 when something needs action, so the run is
 * visibly red when a credential must be rotated.
 */

import { appendFileSync } from 'node:fs';
import { mintJwt, readPrivateKey, request as probe } from './lib/asc-api.mjs';

/** Bundle IDs the Safari wrapper signs. Both must exist for signing to work. */
const BUNDLE_IDS = ['fyi.movar.safari', 'fyi.movar.safari.extension'];

const env = (name) => {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : '';
};

/**
 * Describe a value's shape without printing it. The Issuer ID is an account
 * identifier rather than a real secret, but it lives in a secret so GitHub
 * masks it in logs anyway — which would otherwise leave "not a UUID" with no
 * way to tell *what* got pasted in. The three plausible mistakes all have
 * distinct shapes.
 */
function describeShape(value) {
  const shape = `${value.length} chars`;
  if (/^[A-Z0-9]{10}$/.test(value)) {
    return `${shape}, uppercase alphanumeric — that is the shape of a Key ID or a Team ID`;
  }
  if (value.includes('-----BEGIN')) return `${shape} — that looks like the .p8 key itself`;
  if (/^[0-9a-f-]+$/i.test(value))
    return `${shape}, hex-and-dashes — a malformed or truncated UUID`;
  return shape;
}

const ICON = { ok: '✅', warn: '⚠️', bad: '❌', skip: '·' };

async function main() {
  const keyId = env('APPLE_ASC_KEY_ID');
  const issuerId = env('APPLE_ASC_ISSUER_ID');
  const p8 = env('APPLE_ASC_API_KEY_P8');
  const teamId = env('APPLE_TEAM_ID');

  /** @type {{secret: string, verdict: 'ok'|'warn'|'bad'|'skip', note: string}[]} */
  const rows = [];
  /** @type {string[]} */
  const notes = [];
  let needsAction = false;

  const add = (secret, verdict, note) => {
    rows.push({ secret, verdict, note });
    if (verdict === 'bad') needsAction = true;
  };

  // --- presence ---------------------------------------------------------
  const missing = [
    ['APPLE_ASC_KEY_ID', keyId],
    ['APPLE_ASC_ISSUER_ID', issuerId],
    ['APPLE_ASC_API_KEY_P8', p8],
    ['APPLE_TEAM_ID', teamId],
  ].filter(([, v]) => !v);
  for (const [name] of missing) add(name, 'bad', 'Not set.');

  // --- shape of the values we can check offline -------------------------
  if (teamId && !/^[A-Z0-9]{10}$/.test(teamId)) {
    add('APPLE_TEAM_ID', 'warn', `Not a 10-character Team ID (got ${teamId.length} chars).`);
  } else if (teamId) {
    add('APPLE_TEAM_ID', 'ok', 'Well-formed 10-character Team ID.');
  }
  if (
    issuerId &&
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(issuerId)
  ) {
    add(
      'APPLE_ASC_ISSUER_ID',
      'bad',
      `Not a UUID (${describeShape(issuerId)}). The Issuer ID is the UUID printed above the key list on the App Store Connect API page — not the Key ID and not the Team ID.`,
    );
  }

  if (!keyId || !issuerId || !p8) {
    render(rows, notes);
    process.exit(1);
  }

  const parsed = readPrivateKey(p8);
  if (parsed.error) {
    // The shared reader reports the fault unprefixed so both callers can name
    // whichever secret they read it from.
    add('APPLE_ASC_API_KEY_P8', 'bad', `APPLE_ASC_API_KEY_P8 ${parsed.error}`);
    render(rows, notes);
    process.exit(1);
  }
  add('APPLE_ASC_API_KEY_P8', 'ok', `Decodes to a valid EC ${parsed.curve} private key.`);

  // --- live probes ------------------------------------------------------
  const teamToken = mintJwt({ key: parsed.key, keyId, issuerId, style: 'team' });
  const apps = await probe(teamToken, '/v1/apps?limit=1');

  if (apps.status === 401) {
    // Distinguish "bad triple" from "this is an Individual key". Xcode's
    // automatic signing only speaks team keys, so an individual key produces
    // exactly the listTeams 401 we're chasing.
    const individualToken = mintJwt({ key: parsed.key, keyId, issuerId, style: 'individual' });
    const asIndividual = await probe(individualToken, '/v1/apps?limit=1');
    if (asIndividual.status === 200) {
      add(
        'APPLE_ASC_KEY_ID / ISSUER_ID',
        'bad',
        'This is an **Individual** API key, not a **Team** key. It authenticates fine on its own, but Xcode automatic signing cannot use individual keys — which is precisely the `listTeams.action` 401. Regenerate under Users and Access → Integrations → **Team Keys**.',
      );
    } else {
      add(
        'APPLE_ASC_KEY_ID / ISSUER_ID / P8',
        'bad',
        `App Store Connect rejects the triple (401${apps.detail ? ` — ${apps.detail}` : ''}). The .p8 parses, so either the Key ID does not belong to this .p8, the Issuer ID is from a different account, or the key has been revoked. Regenerate the key and re-set all three secrets together.`,
      );
    }
    render(rows, notes);
    process.exit(1);
  }

  if (apps.status !== 200) {
    add(
      'APPLE_ASC_API_KEY_P8',
      'bad',
      `Unexpected ${apps.status} from /v1/apps${apps.detail ? ` — ${apps.detail}` : ''}.`,
    );
    render(rows, notes);
    process.exit(1);
  }

  add(
    'APPLE_ASC_KEY_ID / ISSUER_ID',
    'ok',
    'Team-key JWT authenticates; App Store Connect app access confirmed.',
  );
  const appCount = apps.body?.data?.length ?? 0;
  notes.push(`App Store Connect returned ${appCount} app record(s) for this key.`);

  // Archive-time automatic signing needs Certificates, Identifiers & Profiles
  // access. Note this is a *lower* bar than the export-time check below —
  // reading and creating development profiles is not the same permission as
  // managing a distribution certificate.
  const certs = await probe(teamToken, '/v1/certificates?limit=200');
  if (certs.status === 403 || certs.status === 401) {
    add(
      'APPLE_ASC_KEY_ID (role)',
      'bad',
      `The key authenticates but has **no access to Certificates, Identifiers & Profiles** (${certs.status}${certs.detail ? ` — ${certs.detail}` : ''}). That is the access Xcode's automatic signing needs, and its absence is the \`listTeams.action\` 401. Regenerate the key with the **Admin** role (or Developer with "Access to Certificates, Identifiers & Profiles" ticked).`,
    );
  } else if (certs.status === 200) {
    add('APPLE_ASC_KEY_ID (role)', 'ok', 'Key has Certificates, Identifiers & Profiles access.');
    reportCertificates(certs.body?.data ?? [], notes);
  } else {
    add('APPLE_ASC_KEY_ID (role)', 'warn', `Unexpected ${certs.status} from /v1/certificates.`);
  }

  // Export-time signing is a separate, stricter gate than the archive. With
  // `signingStyle: automatic`, `xcodebuild -exportArchive` uses *cloud
  // signing*: it asks App Store Connect to manage the distribution
  // certificate on its behalf. Apple restricts managing a distribution
  // certificate to the **Admin** role, so a key that happily reads
  // /v1/certificates (App Manager is enough for that) still fails export with
  // `Cloud signing permission error` — which is exactly where the rehearsal
  // now stops, after both archives succeed.
  //
  // No endpoint reports a key's own role, but /v1/users is Admin-only, so it
  // is a faithful proxy for "is this key Admin?".
  const users = await probe(teamToken, '/v1/users?limit=1');
  if (users.status === 200) {
    add(
      'APPLE_ASC_KEY_ID (Admin?)',
      'ok',
      "Key reads the Admin-only /v1/users endpoint, so it holds the **Admin** role. A `Cloud signing permission error` on export is therefore NOT about the key's role — look at the export options instead.",
    );
  } else if (users.status === 403 || users.status === 401) {
    add(
      'APPLE_ASC_KEY_ID (Admin?)',
      'bad',
      `Key cannot read the Admin-only /v1/users endpoint (${users.status}${users.detail ? ` — ${users.detail}` : ''}), so it is **below Admin** — App Manager or Developer. That is enough to archive but NOT to let \`-exportArchive\` cloud-sign, which is why export fails with \`Cloud signing permission error\` even though the archive succeeds. A key's role cannot be changed after creation: generate a new **Team Key** with the **Admin** role and re-set APPLE_ASC_KEY_ID + APPLE_ASC_API_KEY_P8 (the Issuer ID stays the same).`,
    );
  } else {
    add('APPLE_ASC_KEY_ID (Admin?)', 'warn', `Unexpected ${users.status} from /v1/users.`);
  }

  if (certs.status === 200) {
    const kinds = new Set((certs.body?.data ?? []).map((c) => c.attributes?.certificateType));

    // Cloud signing wants a DISTRIBUTION_MANAGED certificate — one whose
    // private key Apple holds.
    notes.push(
      kinds.has('DISTRIBUTION_MANAGED')
        ? 'A cloud-managed distribution certificate (`DISTRIBUTION_MANAGED`) exists, so cloud signing has worked for this team before.'
        : 'No cloud-managed distribution certificate (`DISTRIBUTION_MANAGED`) exists — cloud signing has never succeeded for this team, which is why the release path signs manually.',
    );

    // A Mac App Store submission is a .pkg, and a .pkg is signed with a
    // SEPARATE certificate from the .app inside it. `Apple Distribution`
    // covers the app; the installer needs `Mac Installer Distribution`. Miss
    // it and everything passes until the very last macOS export step, which
    // fails with `No signing certificate "Mac Installer Distribution" found`
    // — long after the iOS .ipa has been produced successfully.
    if (!kinds.has('MAC_INSTALLER_DISTRIBUTION')) {
      add(
        'APPLE_INSTALLER_CERT_P12_BASE64',
        'bad',
        'No **Mac Installer Distribution** certificate exists in this team. The macOS App Store `.pkg` cannot be signed without one — `Apple Distribution` signs the `.app`, not the installer. Create it (Xcode ▸ Settings ▸ Accounts ▸ Manage Certificates ▸ + ▸ *Mac Installer Distribution*), export it as a `.p12`, and set it as `APPLE_INSTALLER_CERT_P12_BASE64` + `APPLE_INSTALLER_CERT_PASSWORD`. iOS is unaffected.',
      );
    } else if (!env('APPLE_INSTALLER_CERT_P12_BASE64')) {
      add(
        'APPLE_INSTALLER_CERT_P12_BASE64',
        'bad',
        'A **Mac Installer Distribution** certificate exists in the team but is not in the secrets, so the runner cannot sign the macOS `.pkg`. Export it as a `.p12` and set `APPLE_INSTALLER_CERT_P12_BASE64` + `APPLE_INSTALLER_CERT_PASSWORD`.',
      );
    }
  }

  // Bundle IDs must exist before a profile can be minted for them.
  const bundles = await probe(teamToken, '/v1/bundleIds?limit=200');
  if (bundles.status === 200) {
    const known = new Set((bundles.body?.data ?? []).map((b) => b.attributes?.identifier));
    for (const id of BUNDLE_IDS) {
      if (known.has(id)) {
        notes.push(`Bundle ID \`${id}\` is registered.`);
      } else {
        add(
          `Bundle ID ${id}`,
          'bad',
          'Not registered in the developer account. Signing cannot mint a profile for a bundle ID that does not exist.',
        );
      }
    }
  } else if (bundles.status !== 403) {
    notes.push(`Could not list bundle IDs (${bundles.status}).`);
  }

  const profiles = await probe(teamToken, '/v1/profiles?limit=200');
  if (profiles.status === 200) {
    const rowsOut = (profiles.body?.data ?? []).map((p) => {
      const a = p.attributes ?? {};
      return `- ${a.name} — ${a.profileType} — ${a.profileState} — expires ${a.expirationDate}`;
    });
    notes.push(
      rowsOut.length > 0
        ? `Provisioning profiles in the account:\n${rowsOut.join('\n')}`
        : 'No provisioning profiles exist in the account yet, so automatic signing has to create them on the fly.',
    );
  }

  // --- match the .p12 certs against what the portal still considers valid --
  matchCert('APPLE_DIST_CERT_P12_BASE64', env('APPLE_DIST_CERT_SERIAL'), certs, add, notes);
  matchCert(
    'APPLE_DEVELOPER_ID_CERT_P12_BASE64',
    env('APPLE_DEVID_CERT_SERIAL'),
    certs,
    add,
    notes,
  );
  matchCert(
    'APPLE_INSTALLER_CERT_P12_BASE64',
    env('APPLE_INSTALLER_CERT_SERIAL'),
    certs,
    add,
    notes,
  );

  render(rows, notes);
  process.exit(needsAction ? 1 : 0);
}

/** Summarise every certificate the account holds, with expiry. */
function reportCertificates(data, notes) {
  const now = Date.now();
  const lines = data.map((c) => {
    const a = c.attributes ?? {};
    const expires = a.expirationDate ? new Date(a.expirationDate) : null;
    const state = expires && expires.getTime() < now ? ' **EXPIRED**' : '';
    return `- ${a.certificateType} — ${a.displayName} — serial \`${a.serialNumber}\` — expires ${a.expirationDate}${state}`;
  });
  notes.push(
    lines.length > 0
      ? `Certificates in the account:\n${lines.join('\n')}`
      : 'The account holds no certificates.',
  );
}

/**
 * A .p12 can import cleanly on the runner and still be useless if Apple has
 * revoked or expired the underlying certificate — the runner only checks the
 * password and the key pair. Cross-check the serial against the portal.
 */
function matchCert(secretName, serial, certs, add, notes) {
  if (!serial) {
    notes.push(
      `${secretName}: no serial supplied by the workflow — skipped the portal cross-check.`,
    );
    return;
  }
  if (certs.status !== 200) {
    notes.push(`${secretName}: could not cross-check (certificate listing unavailable).`);
    return;
  }
  const wanted = serial.replace(/^0+/, '').toUpperCase();
  const hit = (certs.body?.data ?? []).find(
    (c) => (c.attributes?.serialNumber ?? '').replace(/^0+/, '').toUpperCase() === wanted,
  );
  if (!hit) {
    add(
      secretName,
      'bad',
      `The certificate in this .p12 (serial \`${serial}\`) is not among the certificates Apple currently lists for this team — it has been revoked or belongs to another account. Export a fresh .p12.`,
    );
    return;
  }
  const a = hit.attributes ?? {};
  const expired = a.expirationDate && new Date(a.expirationDate).getTime() < Date.now();
  add(
    secretName,
    expired ? 'bad' : 'ok',
    expired
      ? `Certificate expired ${a.expirationDate}. Create a new ${a.certificateType} certificate and re-export the .p12.`
      : `Valid ${a.certificateType}, expires ${a.expirationDate}.`,
  );
}

function render(rows, notes) {
  const lines = [
    '## Apple credential audit',
    '',
    '| Secret | | Finding |',
    '| --- | --- | --- |',
    ...rows.map((r) => `| \`${r.secret}\` | ${ICON[r.verdict]} | ${r.note} |`),
  ];
  if (notes.length > 0) lines.push('', '### Detail', '', ...notes.map((n) => `${n}\n`));
  const report = lines.join('\n');
  console.log(report);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${report}\n`);
  }
}

await main();
