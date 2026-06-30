# Safari (iOS · iPadOS · macOS) build & deploy

Movar's Safari support reuses the same WXT web extension as Chrome/Firefox/Edge,
wrapped in a native Xcode app (Safari Web Extensions can only ship inside an app
container). This doc covers the two things that sit on top of that web-extension
build: the **local installable build** (works today, no Apple account) and the
**release pipeline** (App Store + notarized download, dormant until the Apple
Developer account is enrolled).

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

  Deployment targets: iOS 15.0, macOS 10.14. iPadOS runs the iOS binary.

- Shared schemes `Movar (iOS)` / `Movar (macOS)` committed under
  `Movar.xcodeproj/xcshareddata/xcschemes/` so headless `xcodebuild -scheme …` is
  reproducible.

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
`workflow_dispatch` with `dry_run=false`). Like every other store job it **skips
with a warning when its secrets are absent** — so it is inert until the steps
below are done. When the secrets exist it:

1. Builds the Safari web extension and syncs resources.
2. Imports the signing certs into a throwaway keychain and places the App Store
   Connect API key.
3. Archives `Movar (iOS)` and `Movar (macOS)` with automatic signing +
   `-allowProvisioningUpdates` (the ASC key lets Xcode mint profiles).
4. **App Store:** exports with
   [exportOptions/app-store.plist](../apps/extension/safari/exportOptions/app-store.plist)
   and uploads the iOS `.ipa` + macOS `.pkg` to App Store Connect (→ TestFlight /
   review) via `xcrun altool`.
5. **Notarized direct download:** exports with
   [exportOptions/developer-id.plist](../apps/extension/safari/exportOptions/developer-id.plist),
   notarizes (`xcrun notarytool`), staples, packages a `.dmg`, and attaches it to
   the GitHub Release for hosting off movar.fyi.

Per-PR CI keeps building the Safari **web extension** on Linux (cheap); the macOS
native build runs only at release time.

## One-time setup (to make the pipeline live)

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
   the other stores.

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
`release-safari` for real. To rehearse without publishing: **Actions → Release →
Run workflow → dry_run: false** on a throwaway run (it still skips if any secret
is missing).

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
