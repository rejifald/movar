#!/usr/bin/env node
// scripts/apple-provisioning.mjs
//
// Fetch-or-create the App Store / Developer ID provisioning profiles the
// Safari wrapper needs, install them where Xcode looks, and write the matching
// `-exportOptionsPlist` files. Zero npm dependencies; Node 22 built-ins only.
//
// WHY THIS EXISTS
//
// `xcodebuild -exportArchive` with `signingStyle: automatic` uses Apple's
// *cloud signing*: it asks App Store Connect to manage the distribution
// certificate on its behalf. That is unavailable to this team — export fails
// with `Cloud signing permission error` even though the API key holds Admin
// and full Certificates, Identifiers & Profiles access, and no
// `DISTRIBUTION_MANAGED` certificate has ever existed here. Locally, Xcode
// Organizer succeeds precisely because it does NOT cloud-sign: it uses the
// `Apple Distribution` certificate in the login keychain.
//
// So CI does the same thing Organizer does — sign with the real certificate
// against real provisioning profiles — and this script supplies the profiles.
//
// It also removes a second problem. Archiving with automatic signing made
// Xcode mint a fresh `Apple Development` certificate on every run (visible in
// the account as `DEVELOPMENT — Created via API`), because each ephemeral
// runner lacks the previous run's private key. Apple caps how many development
// certificates a team may hold, so that path had a hard expiry date. With
// manual signing there is no Developer-portal round-trip during the build at
// all.
//
// PROFILE NAMING is deterministic and derived from the bundle ID, so a single
// command-line build setting works for every target in a scheme:
//
//     PROVISIONING_PROFILE_SPECIFIER='movar $(PRODUCT_BUNDLE_IDENTIFIER) ios-appstore'
//
// xcodebuild expands `$(PRODUCT_BUNDLE_IDENTIFIER)` per target, so the app and
// its extension each resolve to their own profile without per-target flags
// (which xcodebuild cannot express on the command line). Nothing in
// `project.pbxproj` changes, so the local Xcode Organizer flow keeps working
// with automatic signing exactly as documented in docs/safari-deploy.md.
//
// Required env:
//   APPLE_ASC_KEY_ID / APPLE_ASC_ISSUER_ID / APPLE_ASC_API_KEY_P8   the key
//   APPLE_TEAM_ID                                                   team
//   APPLE_DIST_CERT_SERIAL       serial of the Apple Distribution cert in the
//                                keychain — profiles MUST be bound to the very
//                                certificate we sign with, not merely to some
//                                distribution certificate the team owns
//   APPLE_DEVID_CERT_SERIAL      likewise for Developer ID Application
//
// Optional env:
//   APPLE_INSTALLER_IDENTITY   full common name of the Mac Installer
//                              Distribution identity as it appears in the
//                              keychain, e.g. "3rd Party Mac Developer
//                              Installer: Name (TEAM)". Apple's friendly names
//                              for this certificate have changed over the years
//                              — Xcode's own error calls it "Mac Installer
//                              Distribution" while the certificate's CN says
//                              "3rd Party Mac Developer Installer" — so the
//                              caller resolves it from the keychain and passes
//                              it verbatim rather than anyone hardcoding a
//                              guess.
//   OUTPUT_DIR   where to write the generated exportOptions plists (default:
//                the current directory)
//   DRY_RUN=1    report what would be created, create nothing

import { mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import nodePath from 'node:path';
import { clientFromEnv, request, requireOk } from './lib/asc-api.mjs';

/** Recreate a profile this close to expiry rather than shipping a near-dead one. */
const RENEW_WITHIN_DAYS = 30;

const APP = 'fyi.movar.safari';
const EXTENSION = 'fyi.movar.safari.extension';

/**
 * The three distribution paths the release job takes. `certificate` selects
 * which of the two keychain certificates the profile is bound to.
 */
const PLANS = [
  {
    id: 'ios-appstore',
    profileType: 'IOS_APP_STORE',
    certificate: 'DISTRIBUTION',
    extension: 'mobileprovision',
    exportOptions: { file: 'app-store-ios.plist', method: 'app-store-connect' },
  },
  {
    id: 'mac-appstore',
    profileType: 'MAC_APP_STORE',
    certificate: 'DISTRIBUTION',
    extension: 'provisionprofile',
    exportOptions: { file: 'app-store-mac.plist', method: 'app-store-connect' },
  },
  {
    id: 'mac-direct',
    profileType: 'MAC_APP_DIRECT',
    certificate: 'DEVELOPER_ID_APPLICATION',
    extension: 'provisionprofile',
    exportOptions: { file: 'developer-id-mac.plist', method: 'developer-id' },
  },
];

const profileName = (bundleId, planId) => `movar ${bundleId} ${planId}`;

const env = (name) => (process.env[name] ?? '').trim();
const normaliseSerial = (s) => s.replace(/^0+/, '').toUpperCase();

/** Xcode 16 reads from UserData; older tooling reads MobileDevice. Write both. */
const PROFILE_DIRS = [
  nodePath.join(homedir(), 'Library/Developer/Xcode/UserData/Provisioning Profiles'),
  nodePath.join(homedir(), 'Library/MobileDevice/Provisioning Profiles'),
];

function installProfile(uuid, extension, base64Content) {
  const bytes = Buffer.from(base64Content, 'base64');
  for (const dir of PROFILE_DIRS) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(nodePath.join(dir, `${uuid}.${extension}`), bytes);
  }
}

const plistEscape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Generate a complete exportOptions plist. `signingStyle: manual` plus an
 * explicit certificate and per-bundle-ID profile map is what keeps
 * `-exportArchive` off the cloud-signing path entirely.
 */
function exportOptionsPlist({ method, teamId, certificate, installerCertificate, profiles }) {
  const entries = Object.entries(profiles)
    .map(
      ([bundleId, name]) =>
        `\t\t<key>${plistEscape(bundleId)}</key>\n\t\t<string>${plistEscape(name)}</string>`,
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<!--
  GENERATED by scripts/apple-provisioning.mjs — do not edit by hand.

  Manual signing, deliberately: this team cannot cloud-sign (see the script's
  header), so the export is pinned to the certificate that is actually in the
  runner's keychain and to profiles created ahead of it in the same run.
-->
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
\t<key>method</key>
\t<string>${method}</string>
\t<key>destination</key>
\t<string>export</string>
\t<key>signingStyle</key>
\t<string>manual</string>
\t<key>teamID</key>
\t<string>${plistEscape(teamId)}</string>
\t<key>signingCertificate</key>
\t<string>${plistEscape(certificate)}</string>${
    installerCertificate
      ? `\n\t<key>installerSigningCertificate</key>\n\t<string>${plistEscape(installerCertificate)}</string>`
      : ''
  }
\t<key>manageAppVersionAndBuildNumber</key>
\t<false/>
\t<key>provisioningProfiles</key>
\t<dict>
${entries}
\t</dict>
</dict>
</plist>
`;
}

/** Days until `iso`, or -Infinity when absent (treat unknown as expired). */
function daysUntil(iso) {
  if (!iso) return -Infinity;
  return (new Date(iso).getTime() - Date.now()) / 86_400_000;
}

async function main() {
  const client = clientFromEnv();
  if (client.error) {
    console.error(`✗ App Store Connect credentials: ${client.error}`);
    process.exit(1);
  }
  const { token } = client;
  const teamId = env('APPLE_TEAM_ID');
  if (!teamId) {
    console.error('✗ APPLE_TEAM_ID is not set.');
    process.exit(1);
  }
  const dryRun = env('DRY_RUN') === '1';
  const outputDir = env('OUTPUT_DIR') || process.cwd();

  // --- resolve the certificates we will actually sign with ----------------
  // Binding by serial (not just by type) matters: the team holds more than one
  // certificate per type, and a profile bound to the wrong one produces a
  // signing failure that reads like a profile problem.
  const wantedSerials = {
    DISTRIBUTION: env('APPLE_DIST_CERT_SERIAL'),
    DEVELOPER_ID_APPLICATION: env('APPLE_DEVID_CERT_SERIAL'),
  };
  const certs = await requireOk(token, '/v1/certificates?limit=200');
  const certByType = {};
  for (const [type, serial] of Object.entries(wantedSerials)) {
    // A caller that doesn't supply a serial isn't exercising that path — the
    // signing rehearsal covers only the App Store route and never imports the
    // Developer ID certificate. Skip rather than invent a certificate for it.
    if (!serial) {
      console.log(`• ${type}: no serial supplied — skipping the plans that need it.`);
      continue;
    }
    const match = (certs.data ?? []).find(
      (c) =>
        c.attributes?.certificateType === type &&
        normaliseSerial(c.attributes?.serialNumber ?? '') === normaliseSerial(serial),
    );
    if (!match) {
      console.error(
        `✗ No ${type} certificate with serial ${serial} in the account — the .p12 in the secrets is not one Apple still lists. Export a fresh .p12.`,
      );
      process.exit(1);
    }
    certByType[type] = match;
    console.log(
      `• ${type}: ${match.attributes.displayName} (serial ${match.attributes.serialNumber}, expires ${match.attributes.expirationDate})`,
    );
  }

  const plans = PLANS.filter((p) => certByType[p.certificate]);
  if (plans.length === 0) {
    console.error('✗ No signing certificate serials supplied — nothing to provision.');
    process.exit(1);
  }

  // --- resolve bundle-ID resource ids -------------------------------------
  const bundles = await requireOk(token, '/v1/bundleIds?limit=200');
  const bundleIdResource = {};
  for (const identifier of [APP, EXTENSION]) {
    const hit = (bundles.data ?? []).find((b) => b.attributes?.identifier === identifier);
    if (!hit) {
      console.error(`✗ Bundle ID ${identifier} is not registered — register it before signing.`);
      process.exit(1);
    }
    bundleIdResource[identifier] = hit.id;
  }

  // --- fetch-or-create each profile ---------------------------------------
  const existing = await requireOk(token, '/v1/profiles?limit=200');
  const byName = new Map((existing.data ?? []).map((p) => [p.attributes?.name, p]));

  for (const plan of plans) {
    const profiles = {};
    for (const bundleId of [APP, EXTENSION]) {
      const name = profileName(bundleId, plan.id);
      const found = byName.get(name);

      // Reuse only a profile that is ACTIVE, comfortably un-expired, AND bound
      // to the certificate we are about to sign with. The last check is the one
      // that would otherwise rot silently: a profile outlives the certificate
      // it references, and signing then fails at the worst possible moment.
      let reusable = false;
      if (found) {
        const days = daysUntil(found.attributes?.expirationDate);
        const active = found.attributes?.profileState === 'ACTIVE';
        let boundToOurCert = false;
        if (active && days > RENEW_WITHIN_DAYS) {
          const linked = await request(token, `/v1/profiles/${found.id}/certificates?limit=200`);
          boundToOurCert =
            linked.status === 200 &&
            (linked.body?.data ?? []).some((c) => c.id === certByType[plan.certificate].id);
        }
        reusable = active && days > RENEW_WITHIN_DAYS && boundToOurCert;
        if (!reusable) {
          const why = active
            ? days <= RENEW_WITHIN_DAYS
              ? `expires in ${Math.round(days)}d`
              : 'not bound to our signing certificate'
            : `state ${found.attributes?.profileState}`;
          console.log(`• ${name}: replacing (${why})`);
          if (!dryRun) await requireOk(token, `/v1/profiles/${found.id}`, { method: 'DELETE' });
        }
      }

      let profile = reusable ? found : null;
      if (profile) {
        console.log(`• ${name}: reusing (expires ${profile.attributes.expirationDate})`);
      } else {
        if (dryRun) {
          console.log(`• ${name}: would create (${plan.profileType})`);
          profiles[bundleId] = name;
          continue;
        }
        const created = await requireOk(token, '/v1/profiles', {
          method: 'POST',
          body: {
            data: {
              type: 'profiles',
              attributes: { name, profileType: plan.profileType },
              relationships: {
                bundleId: { data: { type: 'bundleIds', id: bundleIdResource[bundleId] } },
                certificates: {
                  data: [{ type: 'certificates', id: certByType[plan.certificate].id }],
                },
              },
            },
          },
        });
        profile = created.data;
        console.log(`• ${name}: created (expires ${profile.attributes.expirationDate})`);
      }

      // `profileContent` only comes back on create; re-read when reusing.
      let content = profile.attributes?.profileContent;
      if (!content) {
        const full = await requireOk(token, `/v1/profiles/${profile.id}`);
        content = full.data?.attributes?.profileContent;
      }
      if (!content) {
        console.error(`✗ ${name}: App Store Connect returned no profileContent.`);
        process.exit(1);
      }
      installProfile(profile.attributes.uuid, plan.extension, content);
      profiles[bundleId] = name;
    }

    // Written even on a dry run — it is a local file, and seeing the exact
    // plist the export would use is most of the point of a dry run.
    const path = nodePath.join(outputDir, plan.exportOptions.file);
    mkdirSync(outputDir, { recursive: true });
    writeFileSync(
      path,
      exportOptionsPlist({
        method: plan.exportOptions.method,
        teamId,
        certificate:
          plan.certificate === 'DISTRIBUTION' ? 'Apple Distribution' : 'Developer ID Application',
        // Only the Mac App Store path produces a .pkg, and a .pkg is signed
        // with its own certificate — `Apple Distribution` signs the .app
        // inside it, not the installer wrapping it.
        installerCertificate:
          plan.id === 'mac-appstore'
            ? env('APPLE_INSTALLER_IDENTITY') || '3rd Party Mac Developer Installer'
            : undefined,
        profiles,
      }),
    );
    console.log(`• wrote ${path}`);
  }

  console.log('\nProvisioning ready. Archive with, for example:');
  console.log("  PROVISIONING_PROFILE_SPECIFIER='movar $(PRODUCT_BUNDLE_IDENTIFIER) ios-appstore'");
}

await main();
