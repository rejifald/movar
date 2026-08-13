# Movar Marketing Site — `@movar/marketing`

> Static Astro site deployed at movar.fyi; two locales (en/uk), no server-side logic beyond an edge middleware for Accept-Language redirects.

## What it does

Presents Movar to potential users: explains the problem (Russian-language defaults), shows how the extension fixes it, and drives installs via store CTAs. The site is purely informational — no user data is collected, no backend calls are made from the page.

## Boundaries & invariants

- **No translation** — the extension hides content; the site must never suggest Movar translates anything.
- **Network-silent guarantee** — no analytics, no telemetry, no reporting backend, not even on the marketing site; "issue report" CTAs are `mailto:` links.
- **README tagline parity (critical)** — `strings.en.hero.headlineLine1 + ' ' + headlineLine2` in `src/i18n.ts` is the source of truth for the root `README.md` first blockquote. `scripts/check-readme-parity.mts` (root-level) enforces this; it runs in `pnpm check:readme`, in `pnpm validate`, in the `readme-parity` lefthook pre-commit gate, and in CI. After changing the hero headline, run the `sync-readme` skill or manually update the README blockquote and re-run `pnpm check:readme`.
- **Lucide icons only** — use `lucide-astro` in `.astro` files, `lucide-react` in Storybook stories. No hand-inlined SVG paths (logo and test fixtures excepted). **Brand marks are the one standing exception**: lucide carries no logos, so third-party marks are vendored as Simple Icons (CC0) path data — browser logos in `src/lib/browser-icons.ts`, social logos in `src/lib/social-links.ts`. Add new marks there, from the Simple Icons set, rather than pasting a path into a component.
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

**Ukrainian-only routes** (no English counterpart — see "The blog" below):

| Route              | File                                |
| ------------------ | ----------------------------------- |
| `/uk/blog`         | `src/pages/uk/blog/index.astro`     |
| `/uk/blog/<slug>`  | `src/pages/uk/blog/[...slug].astro` |
| `/uk/blog/rss.xml` | `src/pages/uk/blog/rss.xml.ts`      |

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
means an entry in `functions/_middleware.ts`'s `UK_COUNTERPART` map — without it the English
URL still works but never auto-redirects a Ukrainian visitor.

**The blog.** `/uk/blog` is the site's long-form section and the one part of movar.fyi that
ships in **Ukrainian only** — it is written for a Ukrainian-speaking audience about
Ukrainian-language hygiene, and a translated English half would say nothing to anyone. That
single decision drives four things, all documented in `src/content.config.ts`:

- Posts are Markdown in a content collection (`src/content/blog/*.md`), not strings in
  `i18n.ts` — a single-locale article has no parity to enforce, and `i18n.ts`'s whole shape is
  a parity contract. Chrome copy and routes live in `src/lib/blog.ts` for the same reason.
- Both pages MUST pass `localeAlternates={false}` to `BaseLayout`. That switches off the
  inline locale-redirect script (which would bounce an English-preferring visitor to a
  `/blog/…` that does not exist) and the `hreflang` alternates (which would advertise that
  same missing page). `apps/e2e/src/marketing/marketing.blog.spec.ts` fails if you forget.
- No `UK_COUNTERPART` entry in `functions/_middleware.ts`: that map redirects EN paths to
  their UK twin, and there is no EN path here.
- Body styling is the `.article-prose` element sheet in `styles/global.css`, because
  generated Markdown cannot carry utility classes.

Post illustrations live in `src/content/blog/assets/` — also where `scripts/capture-article-assets.mts`
writes its Storybook-rendered scenes, so there is no second copy to drift. `docs/articles/*.md`
(the record of what was submitted to third-party outlets) links at those same files.

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
  pages/
    index.astro / install.astro / privacy.astro / transparency.astro / why-this-happens.astro
    how-movar-works.astro / why-not-ai.astro / 404.astro
    uk/              # mirrors the eight English pages, plus blog/ (uk-only)
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

# Via nx from repo root:
nx run marketing:build
nx run marketing:typecheck

# pnpm dev at repo root starts all services via process-compose (marketing on :4321, storybook on :6007).
```

**Copy authority**: `docs/copy.md` (repo root) — single source for all on-page copy.
**Style reference**: `docs/styleguide.md` (repo root) — tone, voice, formatting rules.
**All strings** live in `src/i18n.ts`; edit there, not in component files.

## Gotchas

- **Hero headline = README tagline**: changing `strings.en.hero.headlineLine1` or `headlineLine2` without updating the README first blockquote will break the pre-commit hook and CI. Run `sync-readme` skill or fix manually before committing.
- **Tailwind v4 / Vite 7 cross-major type clash**: `astro.config.mjs` suppresses a `@ts-expect-error` on the `tailwindcss()` plugin import; this is intentional and tracked in a comment. Do not remove the suppression until Astro ships Vite 7 types.
- **No `@astrojs/react`**: React renders only in Storybook and OG capture — do not add React components to Astro page files.
- **`BeforeAfter` component is not on any page**: the component and story exist but are not rendered; if you wire it into a page, also add its strings to `i18n.ts` (the `beforeAfter` key is already there).
- **Edge middleware is not Astro**: `functions/_middleware.ts` is a Cloudflare Pages function; it won't run in `astro dev`. Language auto-redirect in dev is handled by a `<script>` in `BaseLayout.astro`.
- **The blog is Ukrainian-only**: a new post page must pass `localeAlternates={false}` to `BaseLayout`, or every English-preferring visitor who opens a shared link is redirected to a URL that 404s. Covered by `marketing.blog.spec.ts`.
- **No Sharp**: `astro.config.mjs` sets `image: { service: passthroughImageService() }` so `src/`-relative post images don't pull in a native build dependency. Images are served at their captured size, like every other PNG on this site. Installing Sharp is the right call only once a post needs genuinely responsive imagery.
- **All strings live in `i18n.ts` — except the blog's**: `src/lib/blog.ts` holds the Ukrainian-only chrome, and post bodies are Markdown.
- **OG images are committed artefacts**: `public/og/` contains static PNGs generated by `pnpm capture:og`; regenerate and commit them when OG copy or layout changes.
