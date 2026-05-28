# Movar

> Keep the web in your language.

Movar is a cross-browser extension that enforces your language preferences.
It prioritizes Ukrainian (with English as a fallback), automatically switches
multilingual sites away from Russian, and can clean unwanted languages out of
on-site language pickers and search results.

## Why

Many Ukrainian sites ship UA and RU versions but ignore your stated preference
and default to Russian. Search engines surface Russian results even with a
Ukrainian locale. Movar fixes that automatically, so you never have to choose.

## Features

- Automatic language switching driven by a priority list (default: UA → EN → browser)
- Extension settings override browser language settings
- Optional removal of unwanted language choices from on-site switchers
- Temporary pause (1h / 24h / session / 1 week)
- Per-site disable (allowlist)
- "Correction applied" indicator + a usefulness dashboard

## Tech stack

WXT · React · TypeScript · Tailwind CSS · Tremor · Vitest · Playwright.
Targets: Chrome, Firefox, Edge, Safari (incl. iOS).

## Monorepo layout

```
apps/extension      # the WXT extension
packages/shared     # shared types + storage helpers
packages/lang-detect# UA-vs-RU language detection
packages/rules      # site language-rules database
```

## Development

```bash
pnpm install
pnpm dev            # WXT dev server (Chrome by default)
pnpm build          # build all packages/apps
pnpm lint
pnpm typecheck
pnpm test
```

For fast popup/options iteration without loading the extension into a browser,
the extension ships a static-serve preview that inlines a WebExtension API
shim — see [`apps/extension/preview/README.md`](apps/extension/preview/README.md).
For anything that touches real `chrome.storage`, the background worker, or
content scripts, use `pnpm --filter @movar/extension dev:firefox:installed`
instead.

See `movar-spec.md` for the full architecture & open decisions.

## License

MIT
