# movar — agent guide (root)

> Movar is a cross-browser MV3 extension that keeps the internet in your language: it
> asks sites to serve your preferred language (Ukrainian-first, English fallback) and
> hides Russian content cards + Russian entries in on-site language pickers.

This file orients agents at the repo root. **Every workspace member has its own
`AGENTS.md`** with the detail you need to work in it without scanning — start there
once you know which member you're touching (links below).

## The mental model: two sequential layers

Movar's language handling is two layers that run in order on each page:

1. **Redirect layer** — ask the site to serve another language (URL params, picker
   click, hreflang, cookie/localStorage). Input: the picker's active marker, then
   markup/URL tiers (`<html lang>`, subdomain, path, self-hreflang). If it
   navigates, layer 2 is skipped.
2. **Content-filter layer** — atomically conceal individual cards whose detected
   language is blocked, behind a "curtain" overlay. Runs when layer 1 didn't navigate.

**Invariant:** the content layer never produces an aggregate verdict that feeds the
redirect layer (that would cause redirect/bounce "hiccups"). And Movar **blocks, never
translates** — translating Russian would launder it into trusted Ukrainian.

## Architecture: pure model packages vs. app orchestration

The content-script engine is split so the reusable logic is package-clean:

- **Pure model packages** — [`@movar/page-mode`](packages/page-mode/AGENTS.md),
  [`@movar/page-content`](packages/page-content/AGENTS.md),
  [`@movar/lang-pickers`](packages/lang-pickers/AGENTS.md),
  [`@movar/page-language`](packages/page-language/AGENTS.md). They **read** the DOM and
  build models but **never** import i18n, the curtain/tooltip overlays, or the
  page-mode color-scheme singleton. Consumed by both the extension and the diagnostics
  shadow-oracle.
- **App orchestration** — the DOM-mutating concealment (`content-conceal.ts` →
  `applyContentFilter`, `picker-filter.ts` → `filterPickers`), the overlays
  (`curtain.ts`/`tooltip.ts`), and the i18n catalog all live in
  [`apps/extension`](apps/extension/AGENTS.md). Don't move these into the model packages.

## Monorepo map

pnpm + nx workspace: `apps/*`, `packages/*`, `tooling/*`.

### Packages (libraries)

| Member                                                       | What it is                                                                                                    |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| [`packages/page-mode`](packages/page-mode/AGENTS.md)         | Page color-scheme (light/dark) detect / observe / apply (self-contained leaf)                                 |
| [`packages/page-content`](packages/page-content/AGENTS.md)   | Per-site content extractor **model** (DOM → `ContentNode` model); self-registering google/youtube extractors  |
| [`packages/lang-pickers`](packages/lang-pickers/AGENTS.md)   | On-site language-picker discovery / classify / active-lang / redirect-target **model**                        |
| [`packages/page-language`](packages/page-language/AGENTS.md) | Redirect-layer verdict: "what language is the site serving?" (consumes the picker model only)                 |
| [`packages/lang-detect`](packages/lang-detect/AGENTS.md)     | UA-vs-RU (+be/bg) text detection **and** BCP-47 code normalization (`normalizeBCP47`/`normalizeLanguageCode`) |
| [`packages/rules`](packages/rules/AGENTS.md)                 | Per-site language-switch **strategy database** (header/cookie/localStorage/redirect/search)                   |
| [`packages/shared`](packages/shared/AGENTS.md)               | Tiny shared types/defaults/constants leaf (`MovarSettings`, `defaultSettings`, `LanguageCode`, …)             |
| [`packages/ui`](packages/ui/AGENTS.md)                       | React design-system primitives (+ pure `./tooltip-position`, `./tokens.css`) for extension + marketing        |

### Apps

| Member                                           | What it is                                                                                                                           |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| [`apps/extension`](apps/extension/AGENTS.md)     | **The published product** — WXT MV3 extension (Chrome/Firefox/Safari): orchestration + concealment + overlays + i18n + popup/options |
| [`apps/marketing`](apps/marketing/AGENTS.md)     | Astro marketing site (movar.fyi). Its hero headline in `src/i18n.ts` is the source of truth for the README tagline                   |
| [`apps/diagnostics`](apps/diagnostics/AGENTS.md) | **Private, never-published** maintainer dev extension — the shadow-oracle (classifier-vs-franc divergences in an in-page panel)      |
| [`apps/e2e`](apps/e2e/AGENTS.md)                 | Playwright end-to-end suites (offline CI + manual live) asserting visible-vs-curtained behavior                                      |

### Tooling

| Member                                                                 | What it is                                                                                                                    |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| [`tooling/eslint-config-movar`](tooling/eslint-config-movar/AGENTS.md) | Shared ESLint 9 flat-config presets (`base`, `quality`, `tests`, `ukrainian`, `react`, `boundaries`, …) every member composes |

## Toolchain & commands

Node ≥22, pnpm, TypeScript (strict, ESM, `verbatimModuleSyntax`), Vitest 4, ESLint 9
(flat config), Prettier, nx (cached targets).

```sh
# whole workspace
pnpm validate        # typecheck + lint + test + publint + check:readme
pnpm typecheck       # nx run-many -t typecheck
pnpm lint            # lint:root + nx run-many -t lint
pnpm test            # nx run-many -t test  (excludes e2e)
pnpm check:readme    # README tagline + monorepo-layout parity guard
pnpm dev             # process-compose: marketing :4321, storybook :6006/:6007
pnpm build           # nx run-many -t build

# a single member (from its dir, or via nx)
pnpm --filter @movar/<name> test
nx run <project>:typecheck   # <project> = page-mode, extension, …

# e2e (excluded from `pnpm test`)
pnpm test:e2e:fast           # offline CI
pnpm test:e2e:live[:headed]  # manual, real sites
```

Each member: `package.json` (private, `type: module`, libs map `main`/`types`/`exports`
→ `src/index.ts` with a `"./*"` wildcard subpath), `tsconfig.json` (extends
`tsconfig.base.json`), `eslint.config.mjs`, `project.json` (nx targets), and libs a
`vitest.config.ts`. `@movar/*` path aliases (bare + `/*`) live in `tsconfig.base.json`.

## Conventions & invariants (repo-wide)

- **`@movar/shared` is a leaf** — never a utility dump. New logic goes in a specific
  package or a thematic existing one (code normalization lives in `@movar/lang-detect`).
- **Icons are lucide** everywhere: `lucide-astro` in `.astro`, `lucide-react` in React,
  `lucide` core in vanilla content scripts. Never hand-inline SVG paths.
- **Observability ships separately** ([`apps/diagnostics`](apps/diagnostics/AGENTS.md))
  and must never land in the published extension, even off-by-default.
- **Issue reporting is a `mailto`**, never a backend — the extension sends nothing
  off-device (network-silent guarantee).
- **`contentModification` is off by default** (see `defaultSettings`); Russian is a
  permanently locked-blocked language.
- **Don't commit or push unless asked.** Release ritual: hand-bump `@movar/extension`,
  tag `extension-vX.Y.Z` (must match version) — publishing the GitHub Release
  auto-submits to AMO + Chrome Web Store + Edge. Don't run `changeset version`.

## Key docs

- [`README.md`](README.md) — public overview + monorepo layout (parity-guarded).
- [`docs/copy.md`](docs/copy.md) — copy authority (voice, lexicon, mechanics); [`docs/styleguide.md`](docs/styleguide.md) — style.
- [`docs/ROADMAP.md`](docs/ROADMAP.md) — what's next.
- [`docs/page-content-and-lang-pickers-refactor.md`](docs/page-content-and-lang-pickers-refactor.md) — the model-layer split rationale.
