# Theme — `@movar/theme`

> Zero-dependency leaf: the single source of truth for Movar's design tokens.

## What it does

Holds the tokens every Movar surface is **allowed to use** — colors (light +
dark), spacing, font families, radii, breakpoints, sizes, the UI type scale, and
shadows — as typed TypeScript in [`src/tokens.ts`](src/tokens.ts). Everything
else is _derived_ from that one file:

- **CSS** — `pnpm gen:theme` runs `scripts/gen-theme-css.mts`, which renders the
  tokens surfaces actually paint with — **colors, the UI type scale, shadows**
  (and, in the wiring, the type faces + Forest scale) — into three committed
  stylesheets under `styles/`:
  - `tokens.css` — raw `:root` custom properties (light) + a
    `prefers-color-scheme: dark` block.
  - `tokens.host.css` — the same variables scoped to `:host`, for shadow-DOM
    consumers (the diagnostics panel).
  - `theme.css` — the Tailwind v4 `@theme` wiring that turns the variables into
    utilities (`bg-surface`, `text-ink-strong`, `font-mono`, `shadow-lg`, …).
- **TS** — the constants are exported directly for consumers that can't read CSS
  variables (the OG card, `<meta name="theme-color">`, canvas/satori renders),
  **and** for the layout families that stay TS-only (see below).

The token _values_ mirror [`docs/styleguide.md`](../../docs/styleguide.md), the
locked Claude Design handoff. This package is that doc's machine-readable form.

## Boundaries & invariants

**Stay a zero-dep leaf.** No workspace (`@movar/*`) deps, no runtime deps. It
exists as its own package precisely so the Astro site, the WXT extension, and the
React Safari host apps can share one token set without pulling in the UI-kit,
settings, or language graph.

**Tokens only — no components, no logic, no side effects.** If you reach for a
React component or a helper, it belongs in `@movar/ui` or an app.

**Generated CSS is never hand-edited.** `styles/*.css` carry an `@generated`
banner. Change a value in `src/tokens.ts`, run `pnpm gen:theme`, commit both.
`pnpm check:theme` (wired into `pnpm validate` + CI) fails if they drift.

**Don't introduce colors outside the system** (styleguide §9). If a use case
looks like it needs a new one, find the semantic token that already covers it.

**Atomic by construction — nothing is force-bundled.** The generated CSS emits
ONLY the families surfaces render through (colors, UI type scale, shadows, fonts,
Forest scale). The layout families — **spacing, radii, breakpoints, sizes** — are
NOT emitted as `:root` vars: they map 1:1 onto Tailwind's built-in scales (`p-4`,
`rounded-lg`, `md:`), and CSS custom properties can't be tree-shaken, so a
monolithic sheet would bill every importer for tokens it never reads. Those
families live as typed constants (the enforceable allowlist), read atomically by
JS or wired into a single app's own CSS when it genuinely needs a raw var (e.g.
the Safari host's `--content-max`, which mirrors `size.contentMax`). Don't add a
family to the generated CSS unless a surface actually renders through the var.
The `colorLight` / `colorDark` palettes are separate top-level exports (+ `color`
for both) with `sideEffects: false`, so a light-only consumer tree-shakes dark.

## Public API

Typed constants from `src/index.ts` (`colorLight`, `colorDark`, `color`,
`forest`, `fontFamily`, `fontSizeUi`, `space`, `radius`, `breakpoints`, `size`,
`shadow`; type `ColorToken`), plus three CSS sub-path exports:

| Import                         | Use                                                     |
| ------------------------------ | ------------------------------------------------------- |
| `@movar/theme`                 | typed token constants (JS/TS, non-CSS surfaces)         |
| `@movar/theme/tokens.css`      | raw `:root` variables — import **before** `theme.css`   |
| `@movar/theme/theme.css`       | Tailwind `@theme` wiring (semantic utilities, fonts, …) |
| `@movar/theme/tokens.host.css` | `:host`-scoped variables for shadow-DOM (diagnostics)   |

## Layout

```
src/tokens.ts   — the typed source of truth (all token families)
src/render.ts   — pure fns: tokens → CSS strings (no fs, no Node)
src/index.ts    — public TS API (re-exports tokens)
src/tokens.test.ts — value + render invariants (hex validity, no dead dark
                     overrides, key parity, renderer completeness)
styles/*.css    — GENERATED, committed (tokens / tokens.host / theme)
```

The generator itself lives at the repo root
([`scripts/gen-theme-css.mts`](../../scripts/gen-theme-css.mts)) so this package
stays free of any Node dependency.

## Dependencies

None (dev-only: `@movar/eslint-config`, `eslint`). Consumed as source
(`"main": "./src/index.ts"`) — no build.

## Consumers

Every UI surface: `apps/extension` (popup/options), `apps/marketing`,
`apps/safari-host-app` (the iOS/macOS host screens), `apps/diagnostics` (via the
`:host` variant), and `packages/ui`'s Storybook. Apps import the two stylesheets
into their global CSS; `OgCard.tsx` and `BaseLayout.astro` import the typed
constants.

## Working on it

Change a value in `src/tokens.ts` → `pnpm gen:theme` → the three stylesheets
update. Run `pnpm check:theme` to confirm sync, `pnpm --filter @movar/theme test`
for the invariants. Adding a whole token family? Extend `src/tokens.ts`, teach
`src/render.ts` to emit it, and regenerate. Keep `docs/styleguide.md` in step —
it's the prose spec this file implements.
