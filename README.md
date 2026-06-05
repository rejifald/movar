# Movar

> Keep the internet in your language.

Movar is a cross-browser extension that enforces your language preferences.
It prioritizes Ukrainian (with English as a fallback) and automatically steers
search engines and multilingual sites away from Russian. Optionally, it can also
strip unwanted languages from on-site language pickers and on-page content
(Beta, off by default).

## Why

Many Ukrainian sites ship UA and RU versions but ignore your stated preference
and default to Russian. Search engines surface Russian results even with a
Ukrainian locale. Movar fixes that automatically, so you never have to choose.

## Features

- Automatic language switching driven by a priority list (default: UA → EN → browser)
- Extension settings override browser language settings
- On-page content filtering — hides unwanted-language picker options and content cards (Beta, off by default)
- Temporary pause (1h / 24h / session / 1 week)
- Per-site disable (allowlist)
- "Correction applied" indicator

## Tech stack

WXT · React · TypeScript · Tailwind CSS · Vitest · Playwright.
Targets: Chrome, Firefox, Edge, Opera, Brave, Safari (incl. iOS).

## Monorepo layout

```
apps/extension        # the WXT extension (the published product)
apps/marketing        # the Astro marketing site (movar.fyi)
apps/e2e              # Playwright end-to-end suites (offline CI + manual live)
apps/diagnostics      # local-only detection diagnostics (dev, never published)
packages/shared       # shared types + storage helpers
packages/lang-detect  # UA-vs-RU language detection
packages/rules        # site language-rules database
packages/ui           # shared design-system primitives (extension + marketing)
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

See `movar-spec.md` for the full architecture & open decisions. Editing
user-facing strings (popup, options, content curtains, marketing site, store
listings)? See [`docs/copy.md`](docs/copy.md) — voice, lexicon, mechanics,
length-and-register caps.

## License

MIT
