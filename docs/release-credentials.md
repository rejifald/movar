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

The release workflow's Chrome step talks to Google's Chrome Web Store API
**V2** directly via [`scripts/cws-publish.mjs`](../scripts/cws-publish.mjs)
— zero npm dependencies, so the service-account key never touches a
third-party package, even in CI. Auth is a **service account** (no user
OAuth, no browser consent, no expiring refresh token): the script signs a
JWT with the key and exchanges it for a 1-hour access token.

| Secret                    | Where to get it                                                    |
| ------------------------- | ------------------------------------------------------------------ |
| `CWS_EXTENSION_ID`        | Developer Dashboard → your item → URL contains the 32-char item ID |
| `CWS_PUBLISHER_ID`        | Developer Dashboard → Account → publisher ID                       |
| `CWS_SERVICE_ACCOUNT_KEY` | A service-account JSON key — full file contents (see below)        |

Service-account setup (one-time, ~5 min):

1. Enable the **Chrome Web Store API** at https://console.cloud.google.com/apis/library/chromewebstore.googleapis.com.
2. Create a **service account** in the same project (Google Cloud Console →
   IAM & Admin → Service Accounts). It needs **no project roles** — access
   is granted by the dashboard step below, not by Cloud IAM.
3. Give it a **JSON key** (Keys → Add key → Create new key → JSON) and
   download the file. Store the whole file as `CWS_SERVICE_ACCOUNT_KEY`:

   ```sh
   gh secret set CWS_SERVICE_ACCOUNT_KEY < service-account-key.json
   ```

4. In the **Chrome Web Store Developer Dashboard → Account**, add the
   service account's email address. Note: **only one service account per
   publisher** is allowed.

Item visibility (public vs trusted testers) and gradual rollout are set in
the dashboard — V2 has no `publishTarget` request field. To stage a release
instead of publishing immediately, set `PUBLISH_TYPE=STAGED_PUBLISH` (and
optionally `DEPLOY_PERCENTAGE`) in the workflow env for the Chrome step.

**Why V2 / service account:** the previous user-OAuth refresh token expired
every 7 days under a "Testing" consent screen (releases failed with
`invalid_grant`), and the v1.1 API is deprecated — Google sunsets it on
**15 October 2026**. A service account has no token to expire and runs
fully unattended.

**Prerequisite:** the Chrome listing must exist (paid: $5 one-time
developer fee). The first upload via the dashboard creates the item ID
you'll plug in as `CWS_EXTENSION_ID`.

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

## Changesets version PR — `CHANGESETS_TOKEN` (optional)

The **Version** workflow
([`.github/workflows/changesets.yml`](../.github/workflows/changesets.yml)) opens
a `chore: version packages` PR whenever pending changesets land on `main` (see
[Cutting a release](#cutting-a-release) below). It runs on the built-in
`GITHUB_TOKEN` out of the box, with one caveat:

> A PR opened by `GITHUB_TOKEN` does **not** trigger `on: pull_request` workflows
> (GitHub's anti-recursion rule). So CI and the **metrics-gate** never run on the
> version PR, and the branch ruleset's required checks stay pending — leaving it
> unmergeable.

To let the version PR run its checks, add a token that isn't the built-in one:

1. Create a **fine-grained PAT** (Settings → Developer settings → Fine-grained
   tokens) scoped to this repo with **Contents: Read and write** and **Pull
   requests: Read and write**. A GitHub App installation token works too.
2. Store it as the repo secret **`CHANGESETS_TOKEN`**:

   ```sh
   gh secret set CHANGESETS_TOKEN
   ```

The workflow prefers `CHANGESETS_TOKEN` and falls back to `GITHUB_TOKEN`. Without
it you can still merge the version PR by re-triggering its checks by hand (close
→ reopen the PR).

## Cutting a release

Versions and changelogs are managed by **Changesets**. Each behavior-changing PR
carries a changeset (`pnpm changeset`); when it merges to `main`, the **Version**
workflow opens/updates a `chore: version packages` PR that bumps
`apps/extension/package.json` and writes the `CHANGELOG.md` files. Merge that PR
to land the version bump, then tag and publish the Release:

```sh
# After merging the "chore: version packages" PR (or bumping
# apps/extension/package.json by hand), tag the matching version:
git tag extension-v1.3.0        # must equal apps/extension/package.json `version`
git push origin extension-v1.3.0
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

The `prepare` job runs (validate + build + artifact upload); the four
store jobs are skipped via the workflow's `if` guard.

### Safari is submitted locally, not from CI

Publishing the Release runs `release-chrome`, `release-firefox`, and
`release-edge` from CI (approve the `production` gate below to let them submit).
**Safari is the exception** — its `release-safari` job fails at the archive step
on headless provisioning (`401` / no profiles), so the iOS + macOS App Store
submission is done from a Mac via Xcode Organizer. Full step-by-step (version +
timestamp build-number bump, fresh build, archive, upload, notarized `.dmg`) is
in [docs/safari-deploy.md § Local App Store submission](safari-deploy.md#local-app-store-submission-xcode-organizer).
**Leave the parked `release-safari` CI job unapproved** so it doesn't double-submit
the same version.

## Required-approval gate: the `production` environment

Each of `release-firefox`, `release-chrome`, `release-edge`, and
`release-safari` declares `environment: production` in
[`.github/workflows/release.yml`](../.github/workflows/release.yml). This is
the active publish checkpoint: when a Release is published (or a dispatch runs
with `dry_run=false`), every store job parks as **Waiting** until a maintainer
approves the deployment. The `prepare` job is deliberately **not** in the
environment, so the build + validate + audit suite (and every dry-run) still
runs unattended — only the four submitting jobs pause.

The protection only takes effect once the Environment exists with reviewers —
the `environment:` key in the workflow is config-as-code, but the reviewer list
lives in repo settings and is **not** created by this repo. One-time setup:

1. **Repo Settings → Environments → New environment**, name it `production`.
2. Tick **Required reviewers** and add the maintainer(s) who must approve a
   store submission.
3. (Optional) Restrict the environment to the release branches/tags under
   **Deployment branches and tags**.

Tradeoff: every real release now needs a manual approval click per store. That
pause is intentional — it is the only point at which a human confirms "yes,
ship this" before AMO / CWS / Edge / the App Store see the upload. A solo
maintainer should expect it and not be surprised by the jobs sitting in
**Waiting**.
