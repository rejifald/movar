# Movar — source build instructions (Firefox AMO)

This README is the canonical document for Firefox Add-ons (AMO) reviewers
under the [source-code submission policy][policy]. It describes how to
reproduce the submitted `firefox-mv3` `.zip` from the source archive this
file ships in.

[policy]: https://extensionworkshop.com/documentation/publish/source-code-submission/

## What this archive contains

A snapshot of the Movar monorepo at the commit that produced the AMO
artifact. Specifically:

- `apps/extension/` — the WXT-based browser extension (TypeScript + React).
- `packages/shared/`, `packages/lang-detect/`, `packages/rules/` —
  internal workspace packages the extension depends on.
- `tooling/eslint-config-movar/` — shared lint config.
- `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `nx.json`,
  `tsconfig.base.json` — repo-root build configuration.
- `scripts/pack-amo-source.sh` — the script that produced this archive.

Every `.ts`, `.tsx`, `.mjs`, `.mts`, `.json`, `.css`, `.html`, `.md`, and
`.svg` file under `apps/`, `packages/`, `tooling/`, and `scripts/` is the
unmodified, hand-written source. **Nothing has been transformed, merged,
or minified.** The only machine-generated file in the archive is
`pnpm-lock.yaml`, the package-manager lockfile, included so the build is
deterministic.

What is **not** in the archive: `node_modules/` (open-source dependencies,
fetched by `pnpm install` from the public npm registry), build outputs
(`apps/extension/.output/`), the local Firefox dev profile, editor state,
`.git/`. None of those affect the build.

## Build environment

| Requirement   | Version                                     | Verified on                                   |
| ------------- | ------------------------------------------- | --------------------------------------------- |
| Operating sys | macOS 14+, Linux x86_64, Windows 11 via WSL | macOS 14.6 (arm64), Ubuntu 24.04 (x86_64)     |
| Node.js       | ≥ 22.0.0                                    | 22.x LTS                                      |
| pnpm          | ≥ 11.0.0                                    | 11.3.0 (the `packageManager` field pins this) |
| Disk          | ~1 GB free                                  | for `node_modules/` after install             |
| Network       | required for `pnpm install` only            | no network is used at compile time            |

The Node and pnpm floors are enforced by the `engines` field in
[`package.json`](package.json); `pnpm install` will warn and `pnpm` itself
will refuse to run with an older pnpm.

## Install the build tools

### 1. Install Node.js

Pick **one** of these — any will work:

- **Direct download (simplest):** install Node.js **22 LTS** from
  <https://nodejs.org/en/download>. The installer puts `node` and `npm`
  on `PATH`.
- **macOS via Homebrew:** `brew install node@22`
- **Linux via NodeSource:**
  ```bash
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
  ```
- **Cross-platform via [nvm](https://github.com/nvm-sh/nvm):**
  ```bash
  nvm install 22 && nvm use 22
  ```
  (The repo ships `.nvmrc` pinning `22`, so `nvm use` in the extracted
  source directory picks the right version automatically.)

Verify:

```bash
node --version   # → v22.x.x or newer
```

### 2. Enable pnpm via Corepack

Corepack ships with Node ≥ 22 and is the officially supported way to use
pnpm. The `packageManager` field in [`package.json`](package.json) pins
pnpm to `11.3.0`; Corepack will fetch and use exactly that version
on first run, regardless of any other `pnpm` on `PATH`.

```bash
corepack enable                  # one-time, may need sudo on Linux
corepack prepare pnpm@11.3.0 --activate
pnpm --version                   # → 11.3.0
```

If you prefer not to use Corepack, install pnpm directly per
<https://pnpm.io/installation> (any version ≥ 11 will satisfy the
`engines` constraint, but 11.3.0 is what produced the submitted zip).

## Reproduce the AMO artifact

From the **root of the extracted archive** (the directory containing
this `SOURCE.md`):

```bash
pnpm install                                          # ~30s on a warm cache
pnpm --filter @movar/extension build:firefox          # ~10s
pnpm --filter @movar/extension zip:firefox            # ~2s
```

Outputs:

- **Unpacked extension** — `apps/extension/.output/firefox-mv3/`
- **AMO upload artifact** — `apps/extension/.output/movarextension-1.0.0-firefox.zip`

Compare the produced `*-firefox.zip` to the one submitted to AMO; the
manifest, JavaScript bundles, locale catalogs, and icons should match
byte-for-byte given the same Node + pnpm versions.

### Full pre-submission verification (optional)

The same script we run before every store submission is included:

```bash
pnpm verify:release
```

This runs typecheck + lint + tests, builds both Chrome and Firefox zips,
inspects the zip contents for leaked sourcemaps / `.env` / `.DS_Store` /
`node_modules`, and lints the Firefox zip with Mozilla's `addons-linter`
(the same engine the AMO review pipeline uses). All five steps must be
green before the artifact is uploaded.

## Notes for reviewers

- **No remote code.** The extension fetches no JavaScript at runtime.
  All code that runs in the browser is bundled from the source files in
  this archive (and the open-source dependencies fetched by
  `pnpm install`).
- **No telemetry.** No analytics, no `fetch()` to any Movar-owned
  endpoint, no Movar-operated servers of any kind. Storage is split
  between two WebExtension areas: user preferences (target language,
  allowlist, hidden languages, UI language) live in
  `chrome.storage.sync` so the browser's own sync infrastructure
  (Chrome Sync, Firefox Sync) can roam them across the user's signed-in
  profile — that traffic is browser-encrypted before it leaves the
  device and Movar never sees it. Per-device operational state — the
  pause flag and the rolling corrections log of the last 1,000 events
  (timestamp, domain, mechanism, from/to language; never URLs or page
  contents) — lives in `chrome.storage.local` and stays on this
  device. See <https://movar.fyi/privacy> for the user-facing version.
- **`declarativeNetRequest` rules are static.** They are generated from
  [`packages/rules/src/index.ts`](packages/rules/src/index.ts) at build
  time; the extension never inspects or modifies request bodies.
- **Manifest source of truth.** The Firefox manifest is generated by WXT
  from [`apps/extension/wxt.config.ts`](apps/extension/wxt.config.ts).
  The `browser_specific_settings.gecko` block (id, `strict_min_version
113.0`, `data_collection_permissions: { required: ['none'] }`) is set
  there.
- **Per-permission justifications** are in
  [`deployment-checklist.md`](deployment-checklist.md) under
  _Permission justifications_.

If anything in this archive is unclear, please reach out to
<rejifald@gmail.com> — we will respond within one business day.
