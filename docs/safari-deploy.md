# Safari (iOS · iPadOS · macOS) build & deploy

Movar's Safari support reuses the same WXT web extension as Chrome/Firefox/Edge,
wrapped in a native Xcode app (Safari Web Extensions can only ship inside an app
container). This doc covers the two things that sit on top of that web-extension
build: the **local installable build** (works today, no Apple account) and the
**release pipeline** (App Store + notarized download — live now that the Apple
Developer account is enrolled and the signing secrets are set).

For the web-extension layer itself (the `-b safari` build, resource sync, dev
loop) see [apps/extension/wxt.config.ts](../apps/extension/wxt.config.ts) and the
`*:safari` scripts in [apps/extension/package.json](../apps/extension/package.json).

## What already exists

- WXT `-b safari` target → `.output/safari-mv3/`, synced into the Xcode project's
  `Shared (Extension)/Resources/` by
  [sync-safari-resources.mts](../apps/extension/scripts/sync-safari-resources.mts).
- The Xcode wrapper at `apps/extension/safari/Movar/Movar.xcodeproj` —
  `safari-web-extension-converter` output — with four targets:

  | Target                    | Type          | Bundle ID                    |
  | ------------------------- | ------------- | ---------------------------- |
  | `Movar (iOS)`             | app           | `fyi.movar.safari`           |
  | `Movar (macOS)`           | app           | `fyi.movar.safari`           |
  | `Movar Extension (iOS)`   | app-extension | `fyi.movar.safari.extension` |
  | `Movar Extension (macOS)` | app-extension | `fyi.movar.safari.extension` |

  Deployment targets: iOS 15.4, macOS 11.0 — the floor where an MV3 Safari Web
  Extension actually loads (iOS 15.4 is the first with MV3; macOS 11 can run
  Safari ≥ 15.4). Below that the app would install but the extension couldn't
  run. iPadOS runs the iOS binary.

- Shared schemes `Movar (iOS)` / `Movar (macOS)` committed under
  `Movar.xcodeproj/xcshareddata/xcschemes/` so headless `xcodebuild -scheme …` is
  reproducible.

- Per-change CI check:
  [.github/workflows/safari-wrapper.yml](../.github/workflows/safari-wrapper.yml)
  runs an **unsigned `xcodebuild archive`** of both schemes on a macOS runner
  whenever the wrapper or its resource-sync scripts change, so a broken
  `project.pbxproj`, Swift, plist, or archive/packaging step fails at PR time
  instead of on release day. Archiving (not just `build`) exercises the
  install/packaging + product-validation phases the release job hits. Path-
  filtered (macOS minutes are ~10x), so it skips unrelated PRs — don't mark it a
  required check.

- Signing rehearsal:
  [.github/workflows/safari-signing-rehearsal.yml](../.github/workflows/safari-signing-rehearsal.yml)
  — a manual `workflow_dispatch` that archives with the real Distribution cert,
  exports the `.ipa`/`.pkg`, and runs `altool --validate-app` (validate, **never**
  upload). This is the only upload-free way to exercise the _signed_ App Store
  path; run it before a release after touching the wrapper, signing, or
  entitlements. It doesn't cover the Developer ID / notarization path (no App
  Store validator exists for that).

## Local build — `build:safari:app`

Produces a double-clickable, **ad-hoc-signed** `Movar.app` you can load into
Safari on your own Mac. No Apple Developer account required.

```sh
pnpm --filter @movar/extension build:safari:app
```

What it does ([build-safari-app.mts](../apps/extension/scripts/build-safari-app.mts)):

1. Runs `build:safari` (WXT build + resource sync) — **must** precede xcodebuild,
   or the compiled `.appex` ships with no manifest.
2. `xcodebuild build` of the `Movar (macOS)` scheme, ad-hoc signed, with the app
   version taken from `package.json` (`MARKETING_VERSION` / `CURRENT_PROJECT_VERSION`
   overrides — the targets use `GENERATE_INFOPLIST_FILE=YES`, so no project edit).
3. Copies the result to `apps/extension/.output/safari/Movar.app` (`ditto`,
   bundle-safe).

Then, to load it into Safari:

1. `open apps/extension/.output/safari/Movar.app` — run it once so Safari
   registers the extension.
2. **Safari ▸ Settings ▸ Extensions** — enable **Movar**.
3. First run only: **Safari ▸ Settings ▸ Advanced ▸ "Show features for web
   developers"**, then **Develop ▸ "Allow Unsigned Extensions"** (the toggle
   resets each Safari launch; needed because this build is ad-hoc signed).

> iOS/iPadOS can't be "installed" this way — there's no sideloading. To test on a
> device or Simulator, open the project in Xcode and run the `Movar (iOS)` scheme,
> or use TestFlight once the release pipeline is live.

## Release pipeline — `release-safari`

The [`release-safari` job](../.github/workflows/release.yml) runs on a macOS
runner as part of the normal release (published `extension-v*` Release, or a
`workflow_dispatch` with `dry_run=false`). The signing secrets are now set, so it
runs for real; like every other store job it still **self-skips with a warning if
any secret is ever removed**. When the secrets exist it:

1. Builds the Safari web extension and syncs resources.
2. Imports the signing certs into a throwaway keychain and places the App Store
   Connect API key.
3. **Fetches-or-creates the provisioning profiles**
   ([apple-provisioning.mjs](../scripts/apple-provisioning.mjs)) via the App
   Store Connect API, binding each to the certificate whose serial is in _this_
   keychain, installing them where Xcode looks, and writing the matching
   `-exportOptionsPlist` files into `$RUNNER_TEMP/exportOptions/`.
4. Archives `Movar (iOS)` and `Movar (macOS)` with **manual** signing against
   those profiles (see [Why manual signing](#why-manual-signing-and-not-xcodes-automatic-signing)).
5. **Exports all paths (no publish yet):** the App Store `.ipa`/`.pkg` and the
   Developer ID app, each with its generated plist.
6. **Notarizes** (`xcrun notarytool`) and **staples both the app and the `.dmg`**
   (so launching from the mounted image passes Gatekeeper offline, not just a
   dragged-out copy).
7. **Irreversible publish, kept last:** uploads the iOS `.ipa` + macOS `.pkg` to
   App Store Connect (→ TestFlight / review) via `xcrun altool` (still supported,
   but on Apple's deprecation track toward Transporter), then attaches the
   notarized `.dmg` to the GitHub Release. Everything before this is
   side-effect-free, so a build/notarize failure never half-publishes a release
   (which the `github.run_number` build number couldn't cleanly retry).

If `APPLE_INSTALLER_CERT_P12_BASE64` is absent the job logs a warning and
submits **iOS only**, still attaching the notarized `.dmg` — a missing installer
certificate costs the Mac App Store upload, not the whole Safari release.

### Why manual signing, and not Xcode's automatic signing

Both are load-bearing decisions that cost three releases to find, so don't
"simplify" them back:

- **`-exportArchive` cannot use `signingStyle: automatic` here.** Automatic
  export means _cloud signing_ — asking App Store Connect to manage the
  distribution certificate. It fails with `Cloud signing permission error` even
  though the API key holds **Admin** and full Certificates, Identifiers &
  Profiles access, and no `DISTRIBUTION_MANAGED` certificate has ever been
  issued to this team. Adding the omitted `teamID` to the export options does
  not help (tested). Xcode Organizer succeeds locally precisely because it does
  _not_ cloud-sign: it uses the `Apple Distribution` certificate in the login
  keychain, which is exactly what CI now does.
- **Automatic signing also minted a throwaway `Apple Development` certificate
  on every archive** (visible in the account as `DEVELOPMENT — Created via
API`), because each ephemeral runner lacks the previous run's private key.
  Apple caps per-team development certificates, so that path had a hard expiry
  date. Manual signing makes no Developer-portal round-trip during the build.

Profile names are derived from the bundle ID (`movar <bundle-id> <plan>`), so a
single `PROVISIONING_PROFILE_SPECIFIER=movar $(PRODUCT_BUNDLE_IDENTIFIER) …`
covers both the app and its extension — xcodebuild expands it per target, which
is the only way to vary signing per target from the command line.
`project.pbxproj` is untouched, so the local Organizer flow below still uses
automatic signing exactly as before.

Per-PR CI builds the Safari **web extension** on Linux (cheap) on every PR. The
macOS **native** wrapper is archived unsigned by `safari-wrapper.yml` only when
wrapper files change; the full signed + notarized native build runs only here at
release time. All three macOS workflows select Xcode by a **floor**
(`MIN_XCODE_MAJOR` in the `Select Xcode` step), not an exact pin. They used to
pin `Xcode_16.4` exactly, for reproducibility — until App Store Connect rejected
a correctly signed `.ipa` with `SDK version issue … must be built with the iOS
26 SDK or later`. Apple's minimum SDK is a moving external floor, so an exact
pin silently goes stale and fails at the last step of a release. Raise
`MIN_XCODE_MAJOR` in all three files together when Apple raises the minimum.

## Submitting for review — `safari-submit.yml`

`altool --upload-app` only _delivers a build_. Creating the version, attaching
the build, writing "What's New" per localization, answering export compliance
and submitting used to be hand-work in the App Store Connect UI. The
[Review Submissions API](https://developer.apple.com/documentation/appstoreconnectapi)
covers all of it, so
[safari-submit.yml](../.github/workflows/safari-submit.yml) +
[apple-submit.mjs](../scripts/apple-submit.mjs) finish the job — for a build
uploaded by CI _or_ by Organizer.

It is a separate workflow from `release-safari` on purpose: Apple's build
processing takes minutes to tens of minutes, and waiting for that on the macOS
runner would burn 10x-priced minutes doing nothing. This is pure HTTP, so it
runs on Linux, and it is re-runnable without rebuilding or re-uploading.

Three modes, mirroring the release job's "reversible first, irreversible last"
rule. Every run prints a read-only **plan** first, needing no approval; any
write is behind the same `production` gate as the store jobs.

| `mode`    | Does                                                                     | Reversible                          |
| --------- | ------------------------------------------------------------------------ | ----------------------------------- |
| `plan`    | reads only — resolves app, build, version, localizations, submissions    | n/a                                 |
| `prepare` | create/reuse the version, attach the build, set notes, export compliance | yes — editable, no reviewer sees it |
| `submit`  | also submits for review                                                  | **no**                              |

```sh
# See what would happen — safe, no approval needed.
gh workflow run safari-submit.yml --ref main -f mode=plan -f version=1.6.2

# Fill everything in without submitting.
gh workflow run safari-submit.yml --ref main -f mode=prepare -f version=1.6.2

# Submit. One platform at a time — see the warning below.
gh workflow run safari-submit.yml --ref main -f mode=submit -f version=1.6.2 -f platforms=MAC_OS
```

It is idempotent at every level: an editable version is reused rather than
duplicated, and a version already `WAITING_FOR_REVIEW` or `READY_FOR_SALE` is
reported and left alone. Release notes come from
[RELEASE-NOTES.md](../apps/extension/store-assets/RELEASE-NOTES.md) — only the
fenced blocks ship, not the editorial prose around them — with a
`movar.fyi/changelog` pointer appended per locale on the way out (the store
shows one version's note; the site has the whole history). A locale with no
note is a hard error naming the locale, because App Store Connect rejects a
version whose localization has no "What's New".

> **Submit one platform at a time when they differ in risk.** iOS and macOS are
> submitted independently, and a metadata problem on one no longer abandons the
> other — but they are still separate decisions. macOS has shipped before; iOS
> had never been through review until 1.6.2, so its first submission can draw
> questions a macOS update never gets.

> ⚠️ **The `production` gate approves per ENVIRONMENT, not per job.** Every
> store job in `release.yml` declares the same `production` environment, and a
> run's `pending_deployments` returns a **single** entry — so "approve only
> `release-safari`" is not expressible in the UI: one click releases Chrome,
> Firefox and Edge too. To ship one store alone, disable the others (`if: false`)
> on a throwaway branch and never merge it. This is how v1.6.2 reached Safari
> without re-submitting the version the other three had already shipped.

## Local App Store submission (Xcode Organizer)

_Fallback only. As of 2026-08-11 `release-safari` handles both platforms; keep
these steps for when CI is unavailable or you need to submit out of band._

> **Historically local, and why that has changed.** For v1.2.0, v1.3.0 and
> v1.4.3 the `release-safari` job failed at the archive step with a `401` from
> App Store Connect (`** ARCHIVE FAILED ** … No profiles for 'fyi.movar.safari'
were found`), and the cause was recorded here as "headless automatic signing
> can't mint profiles on the runner". **That diagnosis was wrong.** The
> `APPLE_ASC_ISSUER_ID` secret simply wasn't a UUID — a Key ID or Team ID had
> been pasted into it — so every App Store Connect call 401'd, including the one
> Xcode makes during archive. `xcrun notarytool` rejects the same value outright
> with `must be a valid UUID`.
>
> With that fixed (2026-08-11) plus manual signing and an Xcode floor, CI
> archives, signs, exports and passes `altool --validate-app` for **iOS**. The
> macOS App Store `.pkg` additionally needs a **Mac Installer Distribution**
> certificate, which this team does not yet have. Until that certificate exists
> and `APPLE_INSTALLER_CERT_P12_BASE64` is set, macOS is still submitted from a
> Mac using the steps below; iOS can ship from CI.
>
> Diagnose any future credential failure with
> [safari-credentials-audit.yml](../.github/workflows/safari-credentials-audit.yml)
> before theorising — it checks each secret independently and is read-only.

Xcode's Organizer signs and uploads through your **logged-in Apple ID session**,
which is exactly what the CI runner can't do — so the archive that fails on CI
succeeds locally.

### Prerequisites (one-time)

- Xcode signed into the Apple Developer account, Team `RQSR4UU3VB`
  (**Xcode ▸ Settings ▸ Accounts**), with "Download Manual Profiles" run once.
- Both signing identities present in the login keychain:

  ```sh
  security find-identity -v -p codesigning | grep -E 'Apple Distribution|Developer ID Application'
  ```

- The App Store Connect record exists — `fyi.movar.safari` (app id `6779282071`),
  with **both** the iOS and macOS platforms added. First-submission metadata
  (screenshots, privacy, review notes) comes from
  [`apps/extension/store-assets/apple/`](../apps/extension/store-assets/apple/).

### Per-release steps

1. **Cut the extension release first.** Safari ships the _same_ version as
   `apps/extension/package.json`; publish `extension-v<version>` (see
   [Cutting a release](release-credentials.md#cutting-a-release)) so the version
   is final. **Leave the parked `release-safari` CI job _unapproved_** — approving
   it only burns a failing macOS run and risks a duplicate submit for the same
   version.

2. **Update `main` and bump the Xcode marketing + build version.** Safari's
   version lives in `Movar.xcodeproj` (not `package.json`), and the build number
   must **exceed the last macOS upload** — the Mac App Store rejects a
   `CFBundleVersion` that isn't higher than the previous one _even across marketing
   versions_. Use a **Unix timestamp** (`date +%s`), which is monotonic by
   construction. History: macOS `1.2.0`→build `1`, `1.3.0`→build `1783635325`,
   `1.4.3`→build `1784330980`. `release-safari` uses the same `date +%s` scheme
   for exactly this reason — it previously passed `github.run_number`, and App
   Store Connect rejected build `9` against a previously accepted
   `1785959230`. Once timestamps are in an app's history the two schemes
   cannot be mixed.

   ```sh
   git checkout main && git pull
   v="$(node -p "require('./apps/extension/package.json').version")"   # e.g. 1.4.3
   b="$(date +%s)"                                                     # monotonic build number
   sed -i '' \
     -e "s/MARKETING_VERSION = [^;]*;/MARKETING_VERSION = $v;/g" \
     -e "s/CURRENT_PROJECT_VERSION = [^;]*;/CURRENT_PROJECT_VERSION = $b;/g" \
     "apps/extension/safari/Movar/Movar.xcodeproj/project.pbxproj"
   git commit -am "chore(safari): bump Xcode app to v$v (build $b) for App Store submission"
   ```

   (iOS's `CFBundleVersion` only needs to be unique _per_ version, so the shared
   timestamp is fine there too. Commit the bump so the shipped build number is
   recorded.)

3. **Freshly build the web extension + host-app resources — required before
   archiving.** A fresh checkout has empty `Resources/`, so the `.appex` would
   ship with no manifest and the app with a stale host screen:

   ```sh
   pnpm --filter @movar/extension build:safari        # web-ext + Extension Resources
   pnpm --filter @movar/safari-host-app build          # host-app.js/.css + *.lproj/Main.html
   ```

4. **Archive both apps in Xcode** (`open apps/extension/safari/Movar/Movar.xcodeproj`).
   `Product ▸ Archive` is only enabled with a **generic device** destination:
   - Scheme **Movar (macOS)**, destination **Any Mac** → **Product ▸ Archive**.
   - Scheme **Movar (iOS)**, destination **Any iOS Device (arm64)** → **Product ▸ Archive**.

   Keep **"Automatically manage signing"** on — Xcode mints/downloads the App
   Store provisioning profiles through your account session.

5. **Upload to App Store Connect.** In **Window ▸ Organizer**, for _each_ archive:
   **Distribute App ▸ App Store Connect ▸ Upload** → keep automatic signing →
   **Upload**. (This replaces the CI job's `xcrun altool --upload-app`.)

6. **Notarized `.dmg` for direct download** (optional — mirrors what the CI job
   would have attached to the Release). From the **macOS** archive:
   **Distribute App ▸ Direct Distribution** → Xcode notarizes → **Export** the
   notarized `.app`, then:

   ```sh
   # one-time: store an ASC-key or Apple-ID credential for notarytool
   # xcrun notarytool store-credentials movar-notary --key … --key-id … --issuer …
   hdiutil create -volname Movar -srcfolder /path/to/Movar.app -ov -format UDZO "Movar-$v.dmg"
   xcrun notarytool submit "Movar-$v.dmg" --keychain-profile movar-notary --wait
   xcrun stapler staple "Movar-$v.dmg"
   gh release upload "extension-v$v" "Movar-$v.dmg" --clobber
   ```

7. **Prepare the "What's New" release notes** — App Store Connect **requires**
   "What's New in This Version" text for **every localization** on every version
   after the first (Chrome / Firefox / Edge treat release notes as optional; the
   App Store does not). Update
   [`apps/extension/store-assets/RELEASE-NOTES.md`](../apps/extension/store-assets/RELEASE-NOTES.md)
   with this version's user-facing highlights in **Ukrainian and English**,
   distilled from [`apps/extension/CHANGELOG.md`](../apps/extension/CHANGELOG.md).
   You'll paste each locale in the next step. Pasting by hand skips the
   `movar.fyi/changelog` footer the automated path appends, so add it yourself:
   `Повний журнал змін: https://movar.fyi/uk/changelog` for uk,
   `Full changelog: https://movar.fyi/changelog` for en.

8. **Submit for review.** Prefer the automated path — see
   [Submitting for review](#submitting-for-review-safari-submityml) below; it
   works whether the build was uploaded by CI or by Organizer. By hand instead:
   for the new version on **each** platform, attach the just-uploaded build (it
   appears after processing), paste the **What's New** notes from step 7 into
   each localization, answer export-compliance, and **Submit for Review**.

9. **After approval** — the marketing download links already point at the app-id
   URL shared by iOS + macOS
   ([apps/marketing/src/lib/downloads.ts](../apps/marketing/src/lib/downloads.ts)),
   so nothing changes there once iOS clears review.

### Verify before uploading

```sh
# version + a build number ABOVE the last macOS upload, for both schemes
for s in "Movar (iOS)" "Movar (macOS)"; do
  xcodebuild -project apps/extension/safari/Movar/Movar.xcodeproj -scheme "$s" \
    -showBuildSettings 2>/dev/null | grep -E 'MARKETING_VERSION|CURRENT_PROJECT_VERSION'
done
```

- **Archive hangs / "endlessly building"** → the `clang-stat-cache` deadlock, not a
  project bug. See [Troubleshooting](#build-hangs-forever-endlessly-building).
- **"No profiles for 'fyi.movar.safari'"** locally → make sure Xcode is signed in
  and "Automatically manage signing" is on so it can create the App Store profile
  (this is the same failure CI hits, but locally your session can fix it).

## One-time setup (done — kept for reference & credential rotation)

### 1. Enrol & register identifiers

1. Join the [Apple Developer Program](https://developer.apple.com/programs/)
   ($99/yr). Note your **Team ID** (Membership details) → `APPLE_TEAM_ID`.
2. **Certificates, Identifiers & Profiles → Identifiers → App IDs**, register
   both bundle IDs as explicit App IDs:
   - `fyi.movar.safari` (the app — used by both the iOS and macOS targets)
   - `fyi.movar.safari.extension` (the Safari web extension appex)

   Then enable the **App Groups** capability on **both** App IDs and add the
   group `group.fyi.movar.safari` (Identifiers → App Groups — register the group
   first if it doesn't exist). The host app's settings panel and the extension
   share `MovarSettings` through this group, so both App IDs must carry it or
   settings written in the app never reach the extension. Automatic signing with
   `REGISTER_APP_GROUPS = YES` (already set on every target in `project.pbxproj`)
   registers the group on the first signed build, but verify it landed on both
   App IDs.

3. **App Store Connect → Apps → +** → create the Movar app for `fyi.movar.safari`,
   then add **both** the iOS and macOS platforms to it. Fill the listing metadata
   (name, description, screenshots, privacy URL `https://movar.fyi/privacy`,
   category) — the first submission's metadata must be entered by hand, same as
   the other stores. Paste the **App Review notes** and the **App Privacy /
   export-compliance** answers from
   [`apps/extension/store-assets/apple/`](../apps/extension/store-assets/apple/)
   (`REVIEW-NOTES.md` + `APP-PRIVACY.md`). Screenshots: macOS reuses the landscape
   1280×800 set (`store-assets/screenshots/{en,uk}/`); iOS/iPadOS use the portrait
   `store-assets/screenshots/{ios,ipad}/` sets. Regenerate all three with
   `pnpm --filter @movar/extension capture:storybook-assets` (see
   [store-assets/REQUIREMENTS.md](../apps/extension/store-assets/REQUIREMENTS.md) §5).

### 2. Certificates (export as `.p12`)

Create both in the Developer portal (or via Xcode ▸ Settings ▸ Accounts ▸ Manage
Certificates), then export each from Keychain Access as a password-protected
`.p12`:

- **Apple Distribution** — App Store builds (signs the `.app`).
- **Developer ID Application** — the notarized direct-download build.
- **Mac Installer Distribution** — signs the macOS App Store **`.pkg`**. This is
  a separate certificate from Apple Distribution: that one signs the app, this
  one signs the installer wrapping it. Without it the macOS export fails at the
  very last step with `No signing certificate "Mac Installer Distribution"
found`, long after the iOS `.ipa` has built successfully. Create it via
  **Xcode ▸ Settings ▸ Accounts ▸ Manage Certificates ▸ + ▸ Mac Installer
  Distribution**, then export it from Keychain Access like the others.

### 3. App Store Connect API key

**App Store Connect → Users and Access → Integrations → App Store Connect API →
Team Keys → Generate**. Must be a **Team Key**, not an Individual key — Xcode
tooling cannot use individual keys. The current key holds **Admin**, which is
known to work; **App Manager** is untested here despite what this doc used to
claim. Download the `.p8` (offered **once**), and note the **Key ID** and the
**Issuer ID** shown on that page.

> The **Issuer ID is a UUID**, printed above the key list. Pasting the Key ID or
> the Team ID into `APPLE_ASC_ISSUER_ID` instead 401s every App Store Connect
> call and cost this project three releases' worth of misdiagnosis. The
> credentials audit checks exactly this.

### 4. GitHub secrets

Set at **Repo Settings → Secrets and variables → Actions**. Base64-encode the
binary/`.p8` files first:

```sh
base64 -i AppleDistribution.p12     | gh secret set APPLE_DIST_CERT_P12_BASE64
base64 -i DeveloperID.p12           | gh secret set APPLE_DEVELOPER_ID_CERT_P12_BASE64
base64 -i MacInstaller.p12          | gh secret set APPLE_INSTALLER_CERT_P12_BASE64
base64 -i AuthKey_XXXXXXXXXX.p8     | gh secret set APPLE_ASC_API_KEY_P8
gh secret set APPLE_DIST_CERT_PASSWORD          # the .p12 export password
gh secret set APPLE_DEVELOPER_ID_CERT_PASSWORD
gh secret set APPLE_INSTALLER_CERT_PASSWORD
gh secret set APPLE_TEAM_ID
gh secret set APPLE_ASC_KEY_ID
gh secret set APPLE_ASC_ISSUER_ID
```

| Secret                               | Value                                                                              |
| ------------------------------------ | ---------------------------------------------------------------------------------- |
| `APPLE_TEAM_ID`                      | 10-char Developer Team ID                                                          |
| `APPLE_ASC_KEY_ID`                   | App Store Connect API **Key ID**                                                   |
| `APPLE_ASC_ISSUER_ID`                | App Store Connect API **Issuer ID** (UUID)                                         |
| `APPLE_ASC_API_KEY_P8`               | base64 of the `.p8` private key                                                    |
| `APPLE_DIST_CERT_P12_BASE64`         | base64 of the Apple Distribution `.p12`                                            |
| `APPLE_DIST_CERT_PASSWORD`           | password used when exporting that `.p12`                                           |
| `APPLE_DEVELOPER_ID_CERT_P12_BASE64` | base64 of the Developer ID Application `.p12`                                      |
| `APPLE_DEVELOPER_ID_CERT_PASSWORD`   | password used when exporting that `.p12`                                           |
| `APPLE_INSTALLER_CERT_P12_BASE64`    | base64 of the Mac Installer Distribution `.p12` — signs the macOS App Store `.pkg` |
| `APPLE_INSTALLER_CERT_PASSWORD`      | password used when exporting that `.p12`                                           |

Once these are set, the next published `extension-v*` Release runs
`release-safari` for real — it archives, uploads the iOS + macOS builds to App
Store Connect, and attaches the notarized `.dmg` to the Release.

> ⚠️ There is no upload-free "rehearsal" in this job once the secrets exist. A
> `workflow_dispatch` with the default **dry_run: true** validates via the
> `prepare` job (build + `verify:release`) but never reaches the store jobs;
> **dry_run: false** — exactly like a published Release — submits to App Store
> Connect for real. Same semantics as the Chrome / Firefox / Edge jobs. (Before
> the secrets were set, `dry_run: false` looked harmless only because the job
> self-skipped on missing credentials — that's no longer true.) For upload-free
> pre-flight, use the dedicated workflows instead:
> [safari-wrapper.yml](../.github/workflows/safari-wrapper.yml) (unsigned archive
> — does it build?) and
> [safari-signing-rehearsal.yml](../.github/workflows/safari-signing-rehearsal.yml)
> (real signing + `altool --validate-app` — would App Store Connect accept it?).

## Caveats to resolve at first submission

- **macOS App Store requires App Sandbox.** The macOS targets enable it via the
  `ENABLE_APP_SANDBOX` / `ENABLE_HARDENED_RUNTIME` / `ENABLE_OUTGOING_NETWORK_CONNECTIONS`
  build settings (Xcode synthesises the entitlement at sign time) — confirm it
  still lands in the signed `.app` before the first Mac App Store upload. (The
  notarized Developer ID build does not require sandboxing.)
- **App Group capability.** The host-app settings panel shares settings with the
  extension via the `group.fyi.movar.safari` App Group (see step 1 above). The
  four `*.entitlements` files under `apps/extension/safari/Movar/` carry **only**
  `com.apple.security.application-groups`; sandbox/hardened-runtime stay owned by
  the `ENABLE_*` build settings and merge in at sign time (declaring app-sandbox
  in the file too would be a duplicate-source build error). On a non-sandboxed
  macOS build the `group.` prefix can resolve to a team-prefixed container —
  irrelevant for iOS (the rejected target) and the sandboxed macOS App Store
  build, but worth knowing if macOS settings sync ever misbehaves.
- **Version source of truth** is `apps/extension/package.json`; the build number
  is the CI run number. Bump the package version as part of the normal
  [release ritual](release-credentials.md#cutting-a-release).
- **After the listing is live**, flip `safari` in
  [apps/marketing/src/lib/downloads.ts](../apps/marketing/src/lib/downloads.ts)
  from `'#'` to the App Store URL (and add the `.dmg` link if hosting the direct
  download). _Done for macOS (2026-06-30): `https://apps.apple.com/app/id6779282071`,
  the locale-neutral app-id URL so en/uk share one link. The listing is **Mac-only**
  until the iOS build clears review — both targets share `fyi.movar.safari`, so iOS
  lands on the same listing/URL once published (no separate App Store link)._

## Troubleshooting

### A release step went green but nothing shipped ("silent success")

**Read this first when a release "succeeded" and the artifact never appeared.**
Two independent mechanisms in this pipeline report success while failing, and
both were found the hard way — each one hid a real, already-rejected Apple
submission behind a green check.

#### 1. `altool` exits 0 even when it fails

`xcrun altool --validate-app` / `--upload-app` return **exit status 0** on a
rejected package. On 2026-08-11 a run reported SUCCESS while its own output
said:

```
VERIFY FAILED with 1 error
ERROR: Validation failed (409) This bundle is invalid. The value for key
CFBundleVersion [9] … must contain a higher version than that of the
previously uploaded version [1785959230].
```

Every altool call was decorative until this was fixed. **Never gate on
altool's exit code.** `release.yml` and `safari-signing-rehearsal.yml` run it
through an `altool_checked` helper that parses `--output-format json` and fails
on a non-empty `product-errors` — treating unparseable output as failure too,
because the absence of an error report is not evidence of success.

> Keep altool's **stderr out of that JSON file**. It writes its progress and
> its `VERIFY SUCCEEDED` banner to stderr, so `2>&1` corrupts the report and
> the gate then fails a package that actually passed. Use `2>"$err"`, and print
> both.

#### 2. A pipe swallows a failing command

GitHub Actions' **default** shell is `bash -e` with **no `pipefail`**, so in

```yaml
run: node scripts/apple-submit.mjs | tee -a "$GITHUB_STEP_SUMMARY"
```

the step's exit status is `tee`'s. A crashed script reads as a green run — this
is exactly how a half-finished App Store submission (version created, build
attached, then a 409) reported success.

Naming the shell fixes it, because `shell: bash` runs
`bash --noprofile --norc -eo pipefail`:

```yaml
shell: bash
run: node scripts/apple-submit.mjs | tee -a "$GITHUB_STEP_SUMMARY"
```

Demonstrate the difference before trusting any change here:

```sh
bash --noprofile --norc -eo pipefail -c 'node -e "process.exit(3)" | tee /dev/null'; echo $?   # 3
bash -e                              -c 'node -e "process.exit(3)" | tee /dev/null'; echo $?   # 0
```

**The general rule for this pipeline: an exit code is not evidence.** Anything
that talks to Apple must be judged on what it reported, not on whether the
process ended cleanly — and any `run:` step containing a pipe must declare
`shell: bash`.

### Build hangs forever ("endlessly building")

**Symptom.** Xcode sits on _Build_ / _Preparing_ indefinitely — no progress bar
movement, no errors, nothing ever compiles. Cancelling (`⌘.`) and rebuilding
lands in the same stuck state.

**It's almost never the project.** The Xcode wrapper has **no Run Script build
phases** — it only compiles Swift + storyboards and copies the synced
`Shared (Extension)/Resources/`. So an endless build is a **toolchain hang in the
pre-compile SDK-stat-cache step**, not a movar bug. Before the first compile,
Xcode runs `clang-stat-cache` to snapshot the target SDK; if that helper
deadlocks, nothing downstream can start.

**Confirm it** — look for a `clang-stat-cache` process burning **zero CPU**:

```sh
ps -eo pid,etime,time,%cpu,command | grep '[c]lang-stat-cache'
```

A process that's been up for minutes with `TIME 0:00.00` is wedged (it's a child
of `SWBBuildService`, grandchild of the Xcode GUI — not doing work, just blocked).
`lsof -p <pid>` shows it holding a
`~/Library/Developer/Xcode/DerivedData/SDKStatCaches.noindex/<platform>.sdkstatcache`
open **read-write** with no `.tmp` beside it — stuck on a stale/locked cache file.
The wedged platform's cache mtime usually lags the others (e.g. `iphoneos*` days
old while `iphonesimulator*` / `macosx*` are current), because the build service
decided that one was stale and the regeneration hung.

**Fix — surgical** (stat caches are pure caches; Xcode regenerates them
automatically):

```sh
# 1. kill the deadlocked helper (SIGTERM is enough — it's in interruptible sleep)
pkill -x clang-stat-cache

# 2. delete the stale cache for the wedged platform (leave the healthy ones)
rm -f ~/Library/Developer/Xcode/DerivedData/SDKStatCaches.noindex/iphoneos*.sdkstatcache

# 3. rebuild in Xcode (⌘B / ▶). If the progress bar is still stuck, ⌘. first.
```

**Verify** the deadlock is actually gone by running the exact step Xcode was
stuck on — it should exit `0` in well under a second (Xcode regenerates the real
hash-named cache on the next build):

```sh
XC=/Applications/Xcode.app/Contents/Developer
"$XC/Toolchains/XcodeDefault.xctoolchain/usr/bin/clang-stat-cache" \
  "$XC/Platforms/iPhoneOS.platform/Developer/SDKs/iPhoneOS.sdk" \
  -o /tmp/statcache-probe.sdkstatcache && echo "OK — no hang" && rm -f /tmp/statcache-probe.sdkstatcache
```

**If it recurs** — common right after an Xcode / SDK point-update — quit Xcode,
nuke the whole cache dir, reopen, and rebuild:

```sh
rm -rf ~/Library/Developer/Xcode/DerivedData/SDKStatCaches.noindex
```

_First seen 2026-07-17 on Xcode 26.2 / iPhoneOS 26.2 SDK: the `Movar (iOS)` build
wedged for minutes on the iOS-device stat cache while the simulator/macOS caches
were fresh._
