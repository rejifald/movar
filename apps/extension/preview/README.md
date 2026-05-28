# `preview/` — static-serve preview shim

Source for the WebExtension API shim that lets `popup.html` / `options.html`
render in a plain browser tab (over `http://localhost`) without being loaded as
an extension. Used by the `extension-{popup,options}-preview` launch configs in
[`.claude/launch.json`](../../../.claude/launch.json) and by the
`preview:popup` / `preview:options` package scripts.

This file is **never copied into the extension zip**. It lives outside
`src/public/` precisely so wxt's `publicDir` copier ignores it. The wxt
`build:done` hook in [`wxt.config.ts`](../wxt.config.ts) reads it at build time
and inlines it into `popup.html` / `options.html` only when `MOVAR_PREVIEW=1`
is set in the build env.

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
in [`preview-shim.js`](preview-shim.js) for the table.

## When to use this vs. `dev:firefox:installed`

- **`preview:*`** — fast iteration on layout, copy, and pure rendering logic.
  No real `chrome.storage`, no content script, no DNR rules. Refresh = full
  reset of the in-memory store.
- **`dev:firefox:installed`** — anything that needs real persistence, the
  background service worker, content script messaging, or DNR behaviour.
  Boots Firefox against `.firefox-profile/` so toolbar pin + storage survive.
