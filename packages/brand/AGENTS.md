# Brand — `@movar/brand`

> Zero-dependency leaf of Movar's brand & contact constants.

## What it does

Exports the three brand/contact constants shared between the extension and the
marketing site: `SUPPORT_EMAIL`, `FEEDBACK_URL` (derived from `SUPPORT_EMAIL`),
and `SOURCE_URL` (the public MIT-licensed repo). Nothing else.

## Boundaries & invariants

**Stay a zero-dep leaf.** No workspace (`@movar/*`) deps and no runtime deps. It
exists as its own package precisely so the Astro marketing site can share these
URLs without pulling in the settings/language graph.

**Constants only — no logic.** If you reach for a helper here, it belongs
elsewhere. This package is brand facts that must not drift between surfaces.

**One source of truth.** The popup's contextual "report an issue" mailto is built
separately (it prefills the active page URL); `FEEDBACK_URL` is the plain feedback
link used by the options page and marketing footer/header.

## Public API

Single entry point `src/index.ts`:

| Export          | Notes                                |
| --------------- | ------------------------------------ |
| `SUPPORT_EMAIL` | `support@movar.fyi`                  |
| `FEEDBACK_URL`  | `mailto:` built from `SUPPORT_EMAIL` |
| `SOURCE_URL`    | `https://github.com/rejifald/movar`  |

## Consumers

`apps/marketing` (footer/header/close/limitations) and `apps/extension`
(options page, popup). Consumed as source (`"main": "./src/index.ts"`) — no build.
