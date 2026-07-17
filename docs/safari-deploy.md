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
3. Archives `Movar (iOS)` and `Movar (macOS)` with automatic signing +
   `-allowProvisioningUpdates` (the ASC key lets Xcode mint profiles).
4. **Exports both paths (no publish yet):** the App Store `.ipa`/`.pkg` with
   [exportOptions/app-store.plist](../apps/extension/safari/exportOptions/app-store.plist),
   and the Developer ID app with
   [exportOptions/developer-id.plist](../apps/extension/safari/exportOptions/developer-id.plist).
5. **Notarizes** (`xcrun notarytool`) and **staples both the app and the `.dmg`**
   (so launching from the mounted image passes Gatekeeper offline, not just a
   dragged-out copy).
6. **Irreversible publish, kept last:** uploads the iOS `.ipa` + macOS `.pkg` to
   App Store Connect (→ TestFlight / review) via `xcrun altool` (still supported,
   but on Apple's deprecation track toward Transporter), then attaches the
   notarized `.dmg` to the GitHub Release. Everything before this is
   side-effect-free, so a build/notarize failure never half-publishes a release
   (which the `github.run_number` build number couldn't cleanly retry).

Per-PR CI builds the Safari **web extension** on Linux (cheap) on every PR. The
macOS **native** wrapper is archived unsigned by `safari-wrapper.yml` only when
wrapper files change; the full signed + notarized native build runs only here at
release time. All three macOS workflows pin Xcode to an **exact** version
(`/Applications/Xcode_16.4.app` in the `Select Xcode` step) rather than trusting
the `macos-15` image default, which drifts — objectVersion 77 needs Xcode 16.
Bump that path in all three files together when you move toolchains.

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

- **Apple Distribution** — App Store builds.
- **Developer ID Application** — the notarized direct-download build.

### 3. App Store Connect API key

**App Store Connect → Users and Access → Integrations → App Store Connect API →
Team Keys → Generate**. Role **App Manager** (enough to upload + manage
provisioning). Download the `.p8` (offered **once**), and note the **Key ID** and
**Issuer ID** shown on that page.

### 4. GitHub secrets

Set at **Repo Settings → Secrets and variables → Actions**. Base64-encode the
binary/`.p8` files first:

```sh
base64 -i AppleDistribution.p12     | gh secret set APPLE_DIST_CERT_P12_BASE64
base64 -i DeveloperID.p12           | gh secret set APPLE_DEVELOPER_ID_CERT_P12_BASE64
base64 -i AuthKey_XXXXXXXXXX.p8     | gh secret set APPLE_ASC_API_KEY_P8
gh secret set APPLE_DIST_CERT_PASSWORD          # the .p12 export password
gh secret set APPLE_DEVELOPER_ID_CERT_PASSWORD
gh secret set APPLE_TEAM_ID
gh secret set APPLE_ASC_KEY_ID
gh secret set APPLE_ASC_ISSUER_ID
```

| Secret                               | Value                                         |
| ------------------------------------ | --------------------------------------------- |
| `APPLE_TEAM_ID`                      | 10-char Developer Team ID                     |
| `APPLE_ASC_KEY_ID`                   | App Store Connect API **Key ID**              |
| `APPLE_ASC_ISSUER_ID`                | App Store Connect API **Issuer ID** (UUID)    |
| `APPLE_ASC_API_KEY_P8`               | base64 of the `.p8` private key               |
| `APPLE_DIST_CERT_P12_BASE64`         | base64 of the Apple Distribution `.p12`       |
| `APPLE_DIST_CERT_PASSWORD`           | password used when exporting that `.p12`      |
| `APPLE_DEVELOPER_ID_CERT_P12_BASE64` | base64 of the Developer ID Application `.p12` |
| `APPLE_DEVELOPER_ID_CERT_PASSWORD`   | password used when exporting that `.p12`      |

Once all eight are set, the next published `extension-v*` Release runs
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
