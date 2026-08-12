# Brand — `@movar/brand`

> Zero-dependency leaf of Movar's brand & contact constants.

## What it does

Exports the brand/contact constants shared between the extension and the
marketing site: `SUPPORT_EMAIL`, `FEEDBACK_URL` (derived from `SUPPORT_EMAIL`),
`SOURCE_URL` (the public MIT-licensed repo), `SITE_URL` (the marketing site's
origin), and the three social destinations (`DISCORD_URL`, `INSTAGRAM_URL`,
`FACEBOOK_URL`). Nothing else.

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

| Export          | Notes                                                  |
| --------------- | ------------------------------------------------------ |
| `SUPPORT_EMAIL` | `support@movar.fyi`                                    |
| `FEEDBACK_URL`  | `mailto:` built from `SUPPORT_EMAIL`                   |
| `SOURCE_URL`    | `https://github.com/rejifald/movar`                    |
| `SITE_URL`      | `https://movar.fyi` — origin only; callers add paths   |
| `DISCORD_URL`   | Community server — **must be a never-expiring invite** |
| `INSTAGRAM_URL` | `instagram.com/movar.fyi`                              |
| `FACEBOOK_URL`  | Numeric profile URL — the page has no vanity handle    |

## Gotchas

**`DISCORD_URL` can rot.** Discord invites expire by default (7 days), and this
one is printed on a static marketing page nobody re-checks. Any replacement must
be created with "Expire after: Never" / "Max uses: No limit"; verify with
`curl -s https://discord.com/api/v10/invites/<code>` and confirm the JSON carries
`"expires_at": null`.

## Consumers

`apps/marketing` (footer/header/close/limitations) and `apps/extension`
(options page, popup). Consumed as source (`"main": "./src/index.ts"`) — no build.
