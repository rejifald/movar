# Brand — `@movar/brand`

> Zero-dependency leaf of Movar's brand & contact constants, and the two
> builders that derive a URL from them.

## What it does

Exports the brand/contact constants shared between the extension, the Safari
host app, and the marketing site: `SUPPORT_EMAIL`, `FEEDBACK_URL` (derived from
`SUPPORT_EMAIL`), `SOURCE_URL` (the public MIT-licensed repo), `SITE_URL` (the
marketing site's origin), and the three social destinations (`DISCORD_URL`,
`INSTAGRAM_URL`, `FACEBOOK_URL`).

Plus `changelogPath(locale)` / `changelogUrl(locale, version)` — the changelog
deep link behind the `v<version>` stamp in the extension popup, the extension
options page, and the Safari host app's About footer, and the path behind the
marketing footer's own changelog link. Four surfaces, one definition. Nothing
else.

## Boundaries & invariants

**Stay a zero-dep leaf.** No workspace (`@movar/*`) deps and no runtime deps. It
exists as its own package precisely so the Astro marketing site can share these
URLs without pulling in the settings/language graph.

**Constants, plus the pure builders that derive a URL from them — nothing
else.** `FEEDBACK_URL` has always been derived (from `SUPPORT_EMAIL`);
`changelogPath` / `changelogUrl` are the same idea with runtime inputs. The bar
for adding a function is narrow, and all four must hold: it takes primitives,
returns a URL or path string, needs no workspace dep, and exists because
**more than one app** would otherwise write the same shape by hand. Anything
with state, I/O, DOM, or product behaviour belongs elsewhere — this package is
facts that must not drift between surfaces, not a utilities drawer.

**Site routing lives in the marketing app — the changelog is the one
exception.** `apps/marketing/src/i18n.ts` keeps a `locale*Href` helper per page
(`localeHomeHref`, `localePrivacyHref`, …), and that is still where the `/uk`
prefix belongs. The changelog moved here because three surfaces _outside_ the
Astro app deep-link to it and none of them can import that file;
`localeChangelogHref` now delegates to `changelogPath` so there is still exactly
one definition. Don't migrate its seven siblings here to "be consistent" —
they have no reader outside the site, which is the whole test.

**One source of truth.** The popup's contextual "report an issue" mailto is built
separately (it prefills the active page URL); `FEEDBACK_URL` is the plain feedback
link used by the options page and marketing footer/header.

## Public API

Single entry point `src/index.ts`:

| Export          | Notes                                                                                                                                                                                                                                                                    |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `SUPPORT_EMAIL` | `support@movar.fyi`                                                                                                                                                                                                                                                      |
| `FEEDBACK_URL`  | `mailto:` built from `SUPPORT_EMAIL`                                                                                                                                                                                                                                     |
| `SOURCE_URL`    | `https://github.com/rejifald/movar`                                                                                                                                                                                                                                      |
| `SITE_URL`      | `https://movar.fyi` — origin only; callers add paths                                                                                                                                                                                                                     |
| `DISCORD_URL`   | Community server — **must be a never-expiring invite**                                                                                                                                                                                                                   |
| `INSTAGRAM_URL` | `instagram.com/movar.fyi`                                                                                                                                                                                                                                                |
| `FACEBOOK_URL`  | Numeric profile URL — the page has no vanity handle                                                                                                                                                                                                                      |
| `changelogPath` | `(locale)` → `/changelog` or `/uk/changelog`. Site-relative; the marketing footer's link                                                                                                                                                                                 |
| `changelogUrl`  | `(locale, version)` → `${SITE_URL}${changelogPath(locale)}#v1.6.2`. Anchors **only** a released version (`major.minor.patch`, optional pre-release suffix), so each surface's fallback — the extension's `preview`, the host app's `dev` — links to the un-anchored page |
| `SiteLocale`    | `'en' \| 'uk'` — structurally `@movar/i18n`'s `ResolvedLocale` and marketing's `Locale`, re-declared to keep this package zero-dep                                                                                                                                       |

## Gotchas

**`changelogUrl`'s anchors are a cross-app contract with no guard.** The
`#v<version>` fragments only resolve because
`apps/marketing/src/components/Changelog.astro` stamps a matching `id` on each
release entry, built from the same `RELEASE-NOTES.md` version strings. Nothing
fails if that id changes — the link just silently lands at the top of the page.
Change one, change the other.

**`SITE_URL` has a second copy.** `apps/marketing/astro.config.mjs`'s `site` is
what canonical URLs and the sitemap are generated from; Astro's config can't
import a workspace TS package, so the origin is written twice. Change both
together — a mismatch means product surfaces deep-link to a different host than
the site advertises as canonical.

**`DISCORD_URL` can rot.** Discord invites expire by default (7 days), and this
one is printed on a static marketing page nobody re-checks. Any replacement must
be created with "Expire after: Never" / "Max uses: No limit"; verify with
`curl -s https://discord.com/api/v10/invites/<code>` and confirm the JSON carries
`"expires_at": null`.

## Consumers

`apps/marketing` (footer/header/close/limitations, and `localeChangelogHref` in
`src/i18n.ts`), `apps/extension` (options page, popup — including
`src/lib/version-link.tsx`), and `apps/safari-host-app` (About footer, via the
native `open-url` bridge action). Consumed as source
(`"main": "./src/index.ts"`) — no build.
