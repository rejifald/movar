# Movar Marketing Site — `@movar/marketing`

> Static Astro site deployed at movar.fyi; two locales (en/uk), no server-side logic beyond an edge middleware for Accept-Language redirects.

## What it does

Presents Movar to potential users: explains the problem (Russian-language defaults), shows how the extension fixes it, and drives installs via store CTAs. The site is purely informational — no user data is collected, no backend calls are made from the page.

## Boundaries & invariants

- **No translation** — the extension hides content; the site must never suggest Movar translates anything.
- **Network-silent guarantee** — no analytics, no telemetry, no reporting backend, not even on the marketing site; "issue report" CTAs are `mailto:` links.
- **README tagline parity (critical)** — `strings.en.hero.headlineLine1 + ' ' + headlineLine2` in `src/i18n.ts` is the source of truth for the root `README.md` first blockquote. `scripts/check-readme-parity.mts` (root-level) enforces this; it runs in `pnpm check:readme`, in `pnpm validate`, in the `readme-parity` lefthook pre-commit gate, and in CI. After changing the hero headline, run the `sync-readme` skill or manually update the README blockquote and re-run `pnpm check:readme`.
- **Lucide icons only** — use `lucide-astro` in `.astro` files, `lucide-react` in Storybook stories. No hand-inlined SVG paths (logo and test fixtures excepted).
- **Static output** — `astro.config.mjs` sets `output: 'static'`. The site has no SSR; the edge middleware lives in `functions/_middleware.ts` (Cloudflare Pages Functions) and is not part of the Astro build.
- **Port 4321, strict** — `server.strictPort: true` and `vite.preview.strictPort: true`; Astro and preview both pin to `:4321` so the process-compose supervisor and the preview MCP health check agree.

## Public API / entry points

**Pages (en locale at root, uk locale under `/uk/`):**

| Route               | File                                     |
| ------------------- | ---------------------------------------- |
| `/`                 | `src/pages/index.astro`                  |
| `/privacy`          | `src/pages/privacy.astro`                |
| `/why-this-happens` | `src/pages/why-this-happens.astro`       |
| `/404`              | `src/pages/404.astro`                    |
| `/uk/*`             | `src/pages/uk/` (mirrors the four above) |

**Key sections on the home page** (in render order): `Header`, `Hero`, `Problem`, `Stakes`, `HowItWorks`, `Privacy`, `Examples`, `Limitations`, `Close`, `Footer`. `BeforeAfter` exists as a component and Storybook story but is not currently rendered in any page.

**OG card**: `src/og/OgCard.tsx` — React component rendered to a static 1200×630 PNG by `scripts/capture-og-images.mts` (Playwright). Run with `pnpm capture:og`.

## Layout

```
src/
  i18n.ts          # all copy for both locales; hero headline = README tagline source of truth
  layouts/
    BaseLayout.astro   # <html>, meta, hreflang alternates, lang-redirect head script
  components/        # one .astro per section + matching .stories.tsx for Storybook
  pages/
    index.astro / privacy.astro / why-this-happens.astro / 404.astro
    uk/              # mirrors the four English pages
  styles/
    global.css       # imports @movar/ui/tokens.css, Tailwind v4, IBM Plex Mono + Manrope fonts
  lib/
    downloads.ts     # browser detection + store URL helpers for DownloadButtons
  og/
    OgCard.tsx       # React OG card component
    OgCard.stories.tsx
    capture-og-images.mts  # Playwright screenshot script
functions/
  _middleware.ts     # Cloudflare Pages edge middleware: Accept-Language → 302 locale redirect
public/
  icon.svg  robots.txt  sitemap.xml  _redirects
  og/          # static OG PNG images (committed artefacts)
  screenshots/ # before/after comparison screenshots
```

## Dependencies

| Package                                             | Why                                                                                               |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `astro` ^5                                          | Static site framework                                                                             |
| `@tailwindcss/vite` ^4 + `tailwindcss` ^4           | Utility CSS; integrated as a Vite plugin (no `@astrojs/tailwind`)                                 |
| `lucide-astro`                                      | Icons in `.astro` components                                                                      |
| `lucide-react`                                      | Icons in Storybook (React) stories                                                                |
| `@movar/shared` (workspace)                         | `FEEDBACK_URL`, `SOURCE_URL` constants used in Header, Footer, Close, Limitations                 |
| `@movar/ui` (workspace)                             | `tokens.css` design tokens (imported in `global.css`); `BrandMark` component used in `OgCard.tsx` |
| `@fontsource/manrope` + `@fontsource/ibm-plex-mono` | Self-hosted fonts; no external font requests                                                      |
| `@storybook/react-vite` ^10                         | Component dev/review; runs on `:6007` (`MARKETING_STORYBOOK_PORT`)                                |
| `playwright`                                        | Headless screenshot for OG card capture                                                           |

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
- **OG images are committed artefacts**: `public/og/` contains static PNGs generated by `pnpm capture:og`; regenerate and commit them when OG copy or layout changes.
