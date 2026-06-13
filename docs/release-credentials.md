# Release credentials

Where to get the GitHub Actions secrets that
[`.github/workflows/release.yml`](../.github/workflows/release.yml) consumes.
All secrets are configured at
**Repo Settings → Secrets and variables → Actions → New repository secret**.

The release workflow is gated per-store: each store job logs a warning and
skips if its secrets are missing, so you can wire one store at a time
without breaking the others.

## Firefox AMO — `AMO_JWT_ISSUER`, `AMO_JWT_SECRET`

1. Sign in at https://addons.mozilla.org/developers/.
2. Open https://addons.mozilla.org/developers/addon/api/key/ and click
   **Generate new credentials**.
3. Copy **JWT issuer** → `AMO_JWT_ISSUER`.
4. Copy **JWT secret** → `AMO_JWT_SECRET` (shown once — copy it now).

**Prerequisite:** the Movar listing must already exist on AMO. The first
submission (v1.0.0) has to go through the AMO web form because that's
when listing metadata (description, screenshots, support email, category)
gets attached to the add-on GUID. Subsequent versions use the API.

## Chrome Web Store — `CWS_*`

The release workflow's Chrome step talks to Google's CWS REST API
directly via [`scripts/cws-publish.mjs`](../scripts/cws-publish.mjs) —
zero npm dependencies, so our `CLIENT_SECRET` and `REFRESH_TOKEN` never
touch a third-party package, even in CI.

| Secret              | Where to get it                                                                            |
| ------------------- | ------------------------------------------------------------------------------------------ |
| `CWS_EXTENSION_ID`  | Chrome Web Store Developer Dashboard → your item → URL contains the 32-char ID             |
| `CWS_CLIENT_ID`     | Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client ID (type: Desktop) |
| `CWS_CLIENT_SECRET` | Same OAuth client → "Client secret" field                                                  |
| `CWS_REFRESH_TOKEN` | One-time OAuth dance — see below                                                           |

Refresh token procedure (one-time, ~5 min):

1. Enable the **Chrome Web Store API** at https://console.cloud.google.com/apis/library/chromewebstore.googleapis.com.
2. Create an OAuth client of type **Desktop** in the same project.
3. Run the in-house refresh-token helper at
   [`scripts/get-cws-refresh-token.mjs`](../scripts/get-cws-refresh-token.mjs).
   It's zero-dep (Node built-ins only) and talks only to Google's own
   OAuth endpoints — so your `CLIENT_SECRET` never touches a third-party
   npm package:

   ```sh
   CLIENT_ID=<CLIENT_ID> \
   CLIENT_SECRET=<CLIENT_SECRET> \
     pnpm get:cws-refresh-token
   ```

   It opens a local OAuth callback server on `http://localhost:8765`,
   launches your browser for consent, captures the code, exchanges it
   with Google for a refresh token, and prints the token to stdout.
   Save it as `CWS_REFRESH_TOKEN`. Pipe-friendly:

   ```sh
   CLIENT_ID=... CLIENT_SECRET=... pnpm get:cws-refresh-token \
     | gh secret set CWS_REFRESH_TOKEN
   ```

   (Background: `chrome-webstore-upload-cli` v3 dropped its own
   `login` subcommand — see [issue #80](https://github.com/fregante/chrome-webstore-upload-cli/issues/80) — and the upstream's
   replacement is a separate third-party package we don't want anywhere
   near our `CLIENT_SECRET`. The in-house script is ~100 lines of plain
   Node and is the only thing that ever sees your secret in plaintext.)

**Prerequisite:** the Chrome listing must exist (paid: $5 one-time
developer fee). The first upload via the dashboard creates the
extension ID you'll plug in as `CWS_EXTENSION_ID`.

## Edge Add-ons — `EDGE_*`

Edge Add-ons API v1.1 uses a static API-key flow: every request carries
`Authorization: ApiKey $EDGE_API_KEY` and `X-ClientID: $EDGE_CLIENT_ID`
headers. (v1 used a Microsoft Entra OAuth2 client-credentials flow with
a tenant ID and client secret; support for v1 ended on 2024-12-31, and
v1.1 is now the only supported version per
<https://learn.microsoft.com/en-us/microsoft-edge/extensions-chromium/publish/api/using-addons-api>.)

| Secret            | Where to get it                                                                          |
| ----------------- | ---------------------------------------------------------------------------------------- |
| `EDGE_PRODUCT_ID` | Partner Center → your extension → Overview → "Product ID" (a UUID)                       |
| `EDGE_CLIENT_ID`  | Partner Center → your extension → Publish API → "Client ID" (issued with the API key)    |
| `EDGE_API_KEY`    | Same page → **Create API credentials** → "API key" (shown once — copy it before closing) |

Steps:

1. Open https://partner.microsoft.com/dashboard/microsoftedge.
2. Pick the Movar extension (or create it via the dashboard — first
   submission must be manual, like the others).
3. Left sidebar → **Publish API**.
4. If the page still shows the legacy v1 (OAuth2 / Azure AD) UI, click
   **Enable** next to "enable the new experience" to switch to v1.1.
5. Click **Create API credentials** to mint a Client ID and API key.
   Copy both: the API key is only shown once.
6. Copy each value into the matching `EDGE_*` GitHub secret.

The API key has a finite lifetime (default 1–2 years). Renew it before
expiry; the workflow will start failing with a 401 the day after.
There is no tenant ID and no client secret in v1.1 — if you ever see a
`login.microsoftonline.com/.../oauth2/...` URL in Partner Center,
you're on the deprecated v1 UI and need to enable the new experience.

## Safari / App Store — `APPLE_*`

The [`release-safari`](../.github/workflows/release.yml) job (macOS runner)
uploads the iOS + macOS builds to App Store Connect and notarizes a Developer ID
`.dmg` for direct download. Full walkthrough — enrolment, App IDs, App Store
Connect app record, certs, and the API key — is in
[docs/safari-deploy.md](safari-deploy.md). The eight secrets it needs:

| Secret                               | Where to get it                                                                                    |
| ------------------------------------ | -------------------------------------------------------------------------------------------------- |
| `APPLE_TEAM_ID`                      | Apple Developer → Membership details → Team ID                                                     |
| `APPLE_ASC_KEY_ID`                   | App Store Connect → Users and Access → Integrations → App Store Connect API → the key's **Key ID** |
| `APPLE_ASC_ISSUER_ID`                | Same page → **Issuer ID** (UUID, top of the keys list)                                             |
| `APPLE_ASC_API_KEY_P8`               | Same page → **Generate** → download the `.p8` (once), base64-encode it                             |
| `APPLE_DIST_CERT_P12_BASE64`         | Apple **Distribution** cert exported from Keychain Access as `.p12`, base64-encoded                |
| `APPLE_DIST_CERT_PASSWORD`           | password set when exporting that `.p12`                                                            |
| `APPLE_DEVELOPER_ID_CERT_P12_BASE64` | **Developer ID Application** cert exported as `.p12`, base64-encoded                               |
| `APPLE_DEVELOPER_ID_CERT_PASSWORD`   | password set when exporting that `.p12`                                                            |

**Prerequisite:** Apple Developer Program enrolment ($99/yr) and a hand-created
App Store Connect listing for `fyi.movar.safari` (iOS + macOS), same as the other
stores' first submission. Until all eight secrets exist, the job skips with a
warning. To iterate locally without an account, use
`pnpm --filter @movar/extension build:safari:app` (ad-hoc macOS build).

## Cutting a release

Once a store's secrets are in place:

```sh
# Bump apps/extension/package.json to the new version (e.g. 1.0.1).
# Commit. Then tag:
git tag extension-v1.0.1
git push origin extension-v1.0.1
```

The `prepare` job hard-fails if `extension-v$VERSION` doesn't match the
`version` field in `apps/extension/package.json` — this prevents
publishing a build whose zip name disagrees with its manifest.

> **Update the roadmap as part of the cut.** A bare tag push does **not**
> submit to any store — only a _published_ GitHub Release on that tag does
> (`.github/workflows/release.yml` triggers on `release: [published]`). After
> the Release is published, update `docs/ROADMAP.md`'s "Last published" line and
> the "Where things stand" section to name the new version, so the roadmap never
> claims a store availability that has no published Release behind it. This is
> the step that drifted before: `package.json` was bumped to 1.1.0 without a
> matching tag/Release, while the roadmap already called v1.1.0 "published."

To test the workflow without publishing:

```
Actions → Release → Run workflow → dry_run: true
```

The `prepare` job runs (validate + build + artifact upload); the three
store jobs are skipped via the workflow's `if` guard.

## Recommended: gate releases behind an environment

For extra safety, configure a GitHub
[deployment environment](https://docs.github.com/en/actions/deployment/targeting-different-environments/using-environments-for-deployment)
named `production` with **required reviewers**, then add
`environment: production` to each `release-*` job. Tagging a release then
pauses pending your manual approval before any store sees the upload.

Not wired in by default — the tag itself is already an intentional
action, and adding required reviewers adds a step you'll forget to do
solo.
