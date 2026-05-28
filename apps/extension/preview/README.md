# `preview/` — static-serve preview shim

Entry for the WebExtension API shim that lets `popup.html` / `options.html`
render in a plain browser tab (over `http://localhost`) without being loaded as
an extension. Used by the `extension-{popup,options}-preview` launch configs in
[`.claude/launch.json`](../../../.claude/launch.json) and by the
`preview:popup` / `preview:options` package scripts.

The actual mock surface lives in
[`../src/test/browser-mock.ts`](../src/test/browser-mock.ts) — the same
module exercised by the Storybook decorator at
`.storybook/decorators/with-browser-mock.tsx`. This directory's
`preview-shim-entry.ts` is a thin call-site that reads `?locale=…` from the
URL and forwards it to `installBrowserMock`. There is exactly one
implementation of the WebExtension surface in the workspace; both consumers
share it.

These files are **never copied into the extension zip**. They live outside
`src/public/` precisely so wxt's `publicDir` copier ignores them. The wxt
`build:done` hook in [`wxt.config.ts`](../wxt.config.ts) bundles
`preview-shim-entry.ts` through esbuild and inlines the resulting IIFE into
`popup.html` / `options.html` only when `MOVAR_PREVIEW=1` is set in the
build env.

## Workflow

```bash
# from repo root
pnpm --filter @movar/extension preview:popup     # build + serve popup  on :4322
pnpm --filter @movar/extension preview:options   # build + serve options on :4323
# then navigate to (note: no .html — see "URL gotcha" below):
#   http://localhost:4322/popup
#   http://localhost:4322/popup?locale=uk          # exercise the UK catalogue
#   http://localhost:4323/options
#   http://localhost:4323/options?locale=uk
```

### URL gotcha

`serve` enables `cleanUrls` by default and _redirects_ `/popup.html?locale=uk`
to `/popup` — dropping the query in the process. Setting `cleanUrls: false`
in `serve.json` disables the rewrite but not the redirect, so we don't bother;
just type the canonical extension-less URL.

The shim covers `runtime`, `i18n`, `storage.{sync,local}`, `tabs`, `alarms` —
the surface the popup and options pages actually touch. See the comment header
in [`../src/test/browser-mock.ts`](../src/test/browser-mock.ts) for the table.

## When to use this vs. `dev:firefox:installed`

- **`preview:*`** — fast iteration on layout, copy, and pure rendering logic.
  No real `chrome.storage`, no content script, no DNR rules. Refresh = full
  reset of the in-memory store.
- **`dev:firefox:installed`** — anything that needs real persistence, the
  background service worker, content script messaging, or DNR behaviour.
  Boots Firefox against `.firefox-profile/` so toolbar pin + storage survive.
