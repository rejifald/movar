# Movar Marketing Site — `@movar/marketing`

> Static Astro site deployed at movar.fyi; two locales (en/uk), no server-side logic beyond an edge middleware for Accept-Language redirects.

## What it does

Presents Movar to potential users: explains the problem (Russian-language defaults), shows how the extension fixes it, and drives installs via store CTAs. The site is purely informational — no user data is collected, no backend calls are made from the page.

## Boundaries & invariants

- **No translation** — the extension hides content; the site must never suggest Movar translates anything.
- **Network-silent guarantee** — no analytics, no telemetry, no reporting backend, not even on the marketing site; "issue report" CTAs are `mailto:` links.
- **README tagline parity (critical)** — `strings.en.hero.headlineLine1 + ' ' + headlineLine2` in `src/i18n.ts` is the source of truth for the root `README.md` first blockquote. `scripts/check-readme-parity.mts` (root-level) enforces this; it runs in `pnpm check:readme`, in `pnpm validate`, in the `readme-parity` lefthook pre-commit gate, and in CI. After changing the hero headline, run the `sync-readme` skill or manually update the README blockquote and re-run `pnpm check:readme`.
- **Lucide icons only** — use `lucide-astro` in `.astro` files, `lucide-react` in Storybook stories. No hand-inlined SVG paths (logo and test fixtures excepted). **Brand marks are the one standing exception**: lucide carries no logos, so third-party marks are vendored as Simple Icons (CC0) path data — browser logos in `src/lib/browser-icons.ts`, social logos in `src/lib/social-links.ts`. Add new marks there, from the Simple Icons set, rather than pasting a path into a component.
- **The site is audited by our own instrument** — `nx run marketing:audit` (a `build` dependant, wired into `pnpm validate` and the `audit-site` CI job) runs [Movar Audit](../../docs/movar-audit.md) over the built `dist/` and fails the build on a broken promise. A language-conformance checker whose vendor's own site quietly fails its rules is a marketing page, not an instrument. Opting out of a finding is an entry in `audit-suppressions.json` — budgeted, justified, and failing the job when it goes stale — never a pinned ruleset.
- **Static output** — `astro.config.mjs` sets `output: 'static'`. The site has no SSR; the edge middleware lives in `functions/_middleware.ts` (Cloudflare Pages Functions) and is not part of the Astro build.
- **Port 4321, strict** — `server.strictPort: true` and `vite.preview.strictPort: true`; Astro and preview both pin to `:4321` so the process-compose supervisor and the preview MCP health check agree.

## Public API / entry points

**Pages (en locale at root, uk locale under `/uk/`):**

| Route               | File                                     |
| ------------------- | ---------------------------------------- |
| `/`                 | `src/pages/index.astro`                  |
| `/install`          | `src/pages/install.astro`                |
| `/privacy`          | `src/pages/privacy.astro`                |
| `/transparency`     | `src/pages/transparency.astro`           |
| `/why-this-happens` | `src/pages/why-this-happens.astro`       |
| `/how-movar-works`  | `src/pages/how-movar-works.astro`        |
| `/why-not-ai`       | `src/pages/why-not-ai.astro`             |
| `/changelog`        | `src/pages/changelog.astro`              |
| `/404`              | `src/pages/404.astro`                    |
| `/uk/*`             | `src/pages/uk/` (mirrors the nine above) |

**Ukrainian-only routes** (no English counterpart — see "The blog and the guide" below):

| Route              | File                                 |
| ------------------ | ------------------------------------ |
| `/uk/blog`         | `src/pages/uk/blog/index.astro`      |
| `/uk/blog/<slug>`  | `src/pages/uk/blog/[...slug].astro`  |
| `/uk/blog/rss.xml` | `src/pages/uk/blog/rss.xml.ts`       |
| `/uk/guide`        | `src/pages/uk/guide/index.astro`     |
| `/uk/guide/<slug>` | `src/pages/uk/guide/[...slug].astro` |

`/changelog` renders `apps/extension/store-assets/RELEASE-NOTES.md` at build
time through `scripts/lib/release-notes.mjs` — the same parser the App Store and
AMO submissions use, so the site and the store listings cannot describe a
version differently. Nothing is fetched at runtime.

`/transparency` carries two halves: the machine-verified promise cards (built
from `scripts/lib/promises.mts`) and, at `#cant-spy`, the structural safeguards
answering "could a _future_ version spy?" — copy in `i18n.ts`, citations in
`src/lib/safeguards.ts`. Both `privacy.astro` pages and the home page's
`Privacy` callout link into that anchor.

**Deep-dive pages.** `/why-this-happens` (why the internet keeps handing you the wrong
language) and `/how-movar-works` (how Movar decides what a page is written in, and the rules
it holds itself to) are two halves of the same long-form article —
`docs/articles/dou-tykha-kapitulyatsiya.md`, which is canonical for their vocabulary and
framing. Both render through `components/DeepDive.astro`, so a spacing or heading-level change
lands on both or neither, and both are typed as `DeepDivePageStrings`. Adding a page here also
means an entry in `functions/_middleware.ts`'s `MIRRORED_PAGES` allowlist — without it the English
URL still works but never auto-redirects a Ukrainian visitor. `pnpm check:locale-redirects`
(`scripts/check-locale-redirects.mts`) enumerates `src/pages/`, and fails when a page with a
`uk/` twin is missing from the map or points at a target that does not exist.

**The blog and the guide.** `/uk/blog` and `/uk/guide` are the site's long-form sections and
the two parts of movar.fyi that ship in **Ukrainian only** — they are written for a
Ukrainian-speaking audience about Ukrainian-language hygiene, and a translated English half
would say nothing to anyone. That single decision drives four things, all documented in
`src/content.config.ts` (read `blog` for `guide` throughout; the rules are identical):

- Posts are Markdown in a content collection (`src/content/blog/*.md`), not strings in
  `i18n.ts` — a single-locale article has no parity to enforce, and `i18n.ts`'s whole shape is
  a parity contract. Chrome copy and routes live in `src/lib/blog.ts` for the same reason.
- Both pages MUST pass `localeAlternates={false}` to `BaseLayout`. That switches off the
  inline locale-redirect script (which would bounce an English-preferring visitor to a
  `/blog/…` that does not exist) and the `hreflang` alternates (which would advertise that
  same missing page). `apps/e2e/src/marketing/marketing.blog.spec.ts` fails if you forget.
- No `MIRRORED_PAGES` entry in `functions/_middleware.ts`: that allowlist marks EN paths
  that redirect to a UK twin, and there is no EN path here. `check:locale-redirects` agrees
  by construction — it walks EN pages, and there is no `src/pages/blog/` to walk.
- Body styling is the `.article-prose` element sheet in `styles/global.css`, because
  generated Markdown cannot carry utility classes.

**Numbers live in `styles/global.css`, not in class attributes.** `@movar/theme` owns
everything shared with the extension — colour, the `text-ui-*` ladder, radii, spacing, the
icon ladder — and anything that maps onto a step of those uses the utility. What is left is
declared once at the top of `global.css`: the four type sizes with no step on the shared
ladder, the five prose measures, the nested corner radii, the illustration geometry, and the
two permanently-dark band fills. Two traps when adding one:

- **Hint ambiguous prefixes with `length:`.** `text-[var(--x)]` and `border-t-[var(--x)]` are
  read as _colours_; `border-t-[var(--rule-w)]` silently compiled to `border-top-color` until
  the emitted CSS was checked. `max-w-`, `size-`, `rounded-`, `aspect-` and `duration-` are
  unambiguous and need no hint.
- **Verify against `dist`, not against the edit.** `grep` the built CSS for the declaration
  you expect (`font-size:var(--fs-band)`) and for the variable's value. A renamed variable
  whose call sites still use the old name resolves to nothing and paints transparent, which
  no typecheck and no light-theme screenshot will catch.

**Focus is a token, not a per-component decision.** `--focus-ring` defaults to `--accent-text`
and is overridden to `--color-forest-300` on the surfaces that stay dark in both themes
(`#how-it-works`, anything marked `data-dark-surface`), because a light-theme accent on
near-black is unreadable. The rule is wrapped in `:where()` so a component can override it
with a plain class. The skip link is `position: fixed` and keys off `:focus`, not
`:focus-visible` — tabbing is the only way to reach it, and `:focus-visible` is a heuristic
that does not fire for programmatic focus. Every page needs `<main id="main" tabindex="-1">`
as its destination; `marketing.a11y-focus.spec.ts` fails if one is missing, and it drives
real key presses because neither focus selector matches while the document is unfocused.

Post illustrations live in `src/content/blog/assets/` — also where `pnpm gen:charts`
(`scripts/gen-article-charts.mts`) writes the SVG scenes it renders from `src/lib/article-figures.ts`,
so there is no second copy to drift, and `pnpm check:charts` re-renders and byte-compares them on
every PR so a figure cannot move without its charts moving with it. `docs/articles/*.md`
is the registry of every article: its plan, its research, and its status. An article that went
to a third-party outlet keeps its submitted text there verbatim
(`dou-tykha-kapitulyatsiya.md`); one that only ever shipped here keeps a pointer instead
(`ukrainska-za-zamovchuvannyam.md`), because a second full copy would only drift from the live
one.

**What the guide adds on top of the blog's rules.** `/uk/guide` is twenty small instruction
pages plus a hub, and it differs from the blog in five ways worth knowing before editing it:

- A guide page carries `updated`, not `pubDate`, and the hub sorts by `group` + `order` rather
  than by date — a post is finished when published, an instruction is only as good as its last
  check against the vendor's live UI. Keep `order` sparse (10, 20, 30…).
- A page's `match` tokens must come from `GUIDE_MATCH_TOKENS` in `src/lib/guide.ts`, the same
  list `detectTokens` emits. The collection schema is built from it, so an invented token fails
  the build. It was a free `z.string()` once, and a dead `match: ['google']` shipped.
- The hub's two islands (`GuideChecker`, `GuideChecklist`) must keep working with JavaScript
  off — the checklist is real `<input type="checkbox">` elements, and both widgets render
  `hidden` and are revealed by their script. `marketing.guide.spec.ts` asserts this with JS
  disabled.
- Both islands compute in the page and store nothing off-device (the checklist's ticks go to
  `localStorage`). The site is network-silent; a widget that phoned home to report your
  language settings would contradict the product it is selling.
- The two islands talk through one event, not a shared module: `GuideChecker` dispatches
  `movar:guide-diagnosis` on `document` with `{ faults, known }`, and the checklist's single
  machine-settled row listens for it. They are bundled separately, and "the diagnosis said so"
  is the whole contract — do not reach across it any other way.

**The diagnosis model** lives in `src/lib/guide-diagnosis.ts`, split out of `guide.ts` because
it is a domain rather than a strings file: a fault model, a language vocabulary, a platform
table, and the copy for all three. Three things there are load-bearing:

- **Faults are independent, not a ladder.** `guideFaults` returns every fault that holds. The
  checker it replaced resolved to one verdict through a first-match table, so `['ru']` — the
  single list this guide exists for — reported only that Ukrainian was missing and never that
  Russian was being asked for.
- **`resolveFixTarget` names the surface that OWNS the language list, not the browser.** Safari
  has none of its own, and on iOS no browser does; both route to the system. Getting this wrong
  sends a reader to a menu that does not exist, and only `marketing.guide.spec.ts` would notice.
- **Language names come from `Intl.DisplayNames(['uk'])`**, never a hand-kept table — CLDR
  already has the lowercase nominative name for every code a browser can emit. That is also why
  the widget's field label is a noun phrase: the instrumental case would need the table this
  avoids. Tags are deduplicated to their primary subtag, so `uk-UA, uk` is one row.

The fix steps in that file summarise the guide pages they link to; when a vendor moves a menu,
both change together or the widget starts lying. Nothing guards that pair — the pages' own
«Оновлено» stamps, which the widget reads for its own date stamp, are the signal.

Guide copy lives in `src/lib/guide.ts` (chrome, the three rules, the checklist),
`src/lib/guide-diagnosis.ts` (the diagnosis and its fixes) and in the Markdown (steps). Closing CTA for both sections is `components/ReaderCta.astro`, which takes
the pitch as a prop — the blog's argues the diagnosis, the guide's starts from what settings
cannot reach.

**Key sections on the home page** (in render order): `Header`, `Hero`, `Problem`, `Stakes`, `HowItWorks`, `Privacy`, `Examples`, `Limitations`, `Close`, `Footer`. `BeforeAfter` exists as a component and Storybook story but is not currently rendered in any page.

**OG card**: `src/og/OgCard.tsx` — React component rendered to a static 1200×630 PNG by `scripts/capture-og-images.mts` (Playwright). Run with `pnpm capture:og`.

## Layout

```
src/
  i18n.ts          # all copy for both locales; hero headline = README tagline source of truth
  layouts/
    BaseLayout.astro   # <html>, meta, hreflang alternates, lang-redirect head script
  components/        # one .astro per section + matching .stories.tsx for Storybook
                     # DeepDive.astro is the shared long-form article body
  content.config.ts  # `blog` collection schema (Ukrainian-only; see "The blog")
  content/
    blog/            # one Markdown file per post + assets/ (article illustrations)
    guide/           # one Markdown file per settings-guide page (uk-only)
  pages/
    index.astro / install.astro / privacy.astro / transparency.astro / why-this-happens.astro
    how-movar-works.astro / why-not-ai.astro / changelog.astro / 404.astro
    uk/              # mirrors the nine English pages, plus blog/ and guide/ (uk-only)
  styles/
    global.css       # imports @movar/theme tokens + @theme wiring, Tailwind v4, IBM Plex Mono + Manrope fonts
  lib/
    downloads.ts     # browser detection + store URL helpers for DownloadButtons
    browser-icons.ts # vendored Simple Icons browser logos (CC0) for the install CTA
    social-links.ts  # Discord/Instagram/Facebook links + vendored Simple Icons marks
    blog.ts          # blog routes + its Ukrainian-only chrome copy (deliberately not in i18n.ts)
    safeguards.ts    # /transparency#cant-spy: safeguard ids + their primary-source citations
                     # (evidence lives here, copy in i18n.ts, so uk/en can't cite different docs)
  og/
    OgCard.tsx       # React OG card component
    OgCard.stories.tsx
    capture-og-images.mts  # Playwright screenshot script
functions/
  _middleware.ts     # Cloudflare Pages edge middleware: Accept-Language → 302 locale redirect
audit-suppressions.json  # Movar Audit policy for `nx run marketing:audit` (budgeted, justified, stale-checked)
public/
  icon.svg  robots.txt  _redirects   # sitemap-index.xml is generated at build by @astrojs/sitemap
  og/          # static OG PNG images (committed artefacts)
  screenshots/ # before/after comparison screenshots
```

## Dependencies

| Package                                             | Why                                                                                                                   |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `astro` ^5                                          | Static site framework                                                                                                 |
| `@tailwindcss/vite` ^4 + `tailwindcss` ^4           | Utility CSS; integrated as a Vite plugin (no `@astrojs/tailwind`)                                                     |
| `@astrojs/sitemap`                                  | Generates `sitemap-index.xml` at build with per-locale hreflang alternates                                            |
| `lucide-astro`                                      | Icons in `.astro` components                                                                                          |
| `lucide-react`                                      | Icons in Storybook (React) stories                                                                                    |
| `@movar/brand` (workspace)                          | `FEEDBACK_URL`, `SOURCE_URL`, `DISCORD_URL`/`INSTAGRAM_URL`/`FACEBOOK_URL` used in Header, Footer, Close, Limitations |
| `@movar/ui` (workspace)                             | `tokens.css` design tokens (imported in `global.css`); `BrandMark` component used in `OgCard.tsx`                     |
| `@fontsource/manrope` + `@fontsource/ibm-plex-mono` | Self-hosted fonts; no external font requests                                                                          |
| `@storybook/react-vite` ^10                         | Component dev/review; runs on `:6007` (`MARKETING_STORYBOOK_PORT`)                                                    |
| `playwright`                                        | Headless screenshot for OG card capture                                                                               |

No `@astrojs/react` integration — React is only used in Storybook and the OG card capture script.

## Working on it

```bash
# From apps/marketing (or via nx from repo root):
pnpm dev            # astro dev — serves on :4321 (strict)
pnpm build          # astro build → dist/
pnpm preview        # astro preview — serves dist/ on :4321 (strict)
pnpm typecheck      # astro check
pnpm lint           # eslint .
pnpm storybook      # storybook dev on :6007
pnpm capture:og     # regenerate OG PNG images via Playwright

# Via nx from repo root — builds dist/ first, then adjudicates it:
nx run marketing:audit   # or `pnpm audit:site`

# Via nx from repo root:
nx run marketing:build
nx run marketing:typecheck

# pnpm dev at repo root starts all services via process-compose (marketing on :4321, storybook on :6007).
```

**Copy authority**: `docs/copy.md` (repo root) — single source for all on-page copy.
**Tests.** Two layers, and the split is deliberate. `apps/e2e`'s marketing suites are the
main one — they run against a real build in a real browser, which is the only thing that can
prove an `.astro` page renders. `vitest run` (this project's `test` script) covers `src/lib`
only: the diagnosis model, the user-agent table, the plural rule. Those are branchy,
order-dependent and driven entirely by their inputs, and exercising a user-agent table through
a browser costs a page load per row.

`vitest.config.ts` deliberately emits `lcov` but **not** `json-summary`: the repo-wide coverage
number in README is a sum of every project's `coverage-summary.json`, and this project is not a
participant in it. Most of `src/lib` is e2e-covered rather than unit-covered, so counting it as
uncovered would understate the repo. The header comment there says when to change that.

**Style reference**: `docs/styleguide.md` (repo root) — tone, voice, formatting rules.
**All strings** live in `src/i18n.ts`; edit there, not in component files.

## Gotchas

- **Hero headline = README tagline**: changing `strings.en.hero.headlineLine1` or `headlineLine2` without updating the README first blockquote will break the pre-commit hook and CI. Run `sync-readme` skill or fix manually before committing.
- **Tailwind v4 / Vite 7 cross-major type clash**: `astro.config.mjs` suppresses a `@ts-expect-error` on the `tailwindcss()` plugin import; this is intentional and tracked in a comment. Do not remove the suppression until Astro ships Vite 7 types.
- **No `@astrojs/react`**: React renders only in Storybook and OG capture — do not add React components to Astro page files.
- **`BeforeAfter` component is not on any page**: the component and story exist but are not rendered; if you wire it into a page, also add its strings to `i18n.ts` (the `beforeAfter` key is already there).
- **Edge middleware is not Astro**: `functions/_middleware.ts` is a Cloudflare Pages function; it won't run in `astro dev`. Language auto-redirect in dev is handled by a `<script>` in `BaseLayout.astro`.
- **`lint` runs `astro sync` first, and must keep doing so**: `getCollection('blog')` is typed by `.astro/types.d.ts`, which Astro generates and `.gitignore`s. `astro check` syncs on its own, but bare `eslint` does not — so on a fresh checkout (i.e. CI) every content-collection call degrades to `any` and the type-aware rules fail the build with ~20 `no-unsafe-*` errors, while passing locally where a previous build left the types behind. Reproduce with `rm -rf apps/marketing/.astro && eslint .`.
- **The blog is Ukrainian-only**: a new post page must pass `localeAlternates={false}` to `BaseLayout`, or every English-preferring visitor who opens a shared link is redirected to a URL that 404s. Covered by `marketing.blog.spec.ts`.
- **`localeAlternates` and `hreflangAlternates` are two switches, not one**: the first turns off the inline locale-redirect script _and_ (by default) the `hreflang` block; the second turns off only the `hreflang` block. The error pages want the second — they keep the redirect but must not advertise a translation set, because Astro writes the English 404 to `dist/404.html`, so the `https://movar.fyi/404/` the alternates would name is not a URL this build serves. `nx run marketing:audit` catches a regression here as `core/hreflang-target-unresolvable` plus `core/hreflang-not-reciprocal`.
- **A new single-locale page moves the audit's suppression count**: `core/inventory-varies-across-pages` fires once for the whole group of pages declaring no alternates, so adding one does not add a suppression — but do update the reason text in `audit-suppressions.json` if the group's membership changes, since the entry names what is in it.
- **No Sharp**: `astro.config.mjs` sets `image: { service: passthroughImageService() }` so `src/`-relative post images don't pull in a native build dependency. Images are served at their captured size, like every other PNG on this site. Installing Sharp is the right call only once a post needs genuinely responsive imagery.
- **All strings live in `i18n.ts` — except the blog's**: `src/lib/blog.ts` holds the Ukrainian-only chrome, and post bodies are Markdown.
- **OG images are committed artefacts**: `public/og/` contains static PNGs generated by `pnpm capture:og`; regenerate and commit them when OG copy or layout changes.
