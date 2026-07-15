# Theme — `@movar/theme`

> Zero-dependency leaf: the single source of truth for Movar's design tokens.

## What it does

Holds the tokens every Movar surface is **allowed to use** — colors (light +
dark), spacing, font families, radii, breakpoints, sizes, the UI type scale,
tracking/leading, shadows, motion (transition durations), and the
decorative marketing glow — as typed TypeScript in
[`src/tokens.ts`](src/tokens.ts). Everything else is _derived_ from that one file:

- **CSS** — `pnpm gen:theme` runs `scripts/gen-theme-css.mts`, which renders
  **one stylesheet per token set** into `styles/` (git-ignored — a build
  artifact, generated on `prepare` + `build`, never committed):
  `color.css`, `typography.css`, `shadow.css`, `motion.css`, `glow.css`,
  `space.css`, `radius.css`, `size.css`, `breakpoint.css`. Each file is
  self-contained — its raw
  `:root, :host` custom properties **and** the Tailwind v4 `@theme` wiring for
  that set — so a consumer `@import`s exactly the sets it uses and bundles
  nothing else. (`:root, :host` in one rule serves both normal documents and
  shadow-DOM consumers like the diagnostics panel, so there's no separate
  `.host.css`.)
- **TS** — the constants are exported for consumers that can't read CSS
  variables (the OG card, `<meta name="theme-color">`, canvas/satori renders).

The token _values_ mirror [`docs/styleguide.md`](../../docs/styleguide.md), the
locked Claude Design handoff. This package is that doc's machine-readable form.

## Boundaries & invariants

**Stay a zero-dep leaf.** No workspace (`@movar/*`) deps, no runtime deps. It
exists as its own package precisely so the Astro site, the WXT extension, and the
React Safari host apps can share one token set without pulling in the UI-kit,
settings, or language graph.

**Tokens only — no components, no logic, no side effects.** If you reach for a
React component or a helper, it belongs in `@movar/ui` or an app.

**Generated CSS is git-ignored, never hand-edited.** `styles/*.css` carry an
`@generated` banner and are produced from `src/tokens.ts` — on `pnpm install`
(root `prepare`) and at the start of `pnpm build`. Change a value in
`src/tokens.ts`, run `pnpm gen:theme`. There's no committed copy to drift.

**Tree-shakeable — never spread at module scope.** `sideEffects: ["**/*.css"]`
(the CSS sheets are the only side effect; the JS is pure). Exported objects must
be plain literals or identifier-refs — **no object spread and no `x.y`
member-access in an exported declaration.** Bundlers treat both as impure and
retain them even when unused, so `colorDark = { ...colorLight, ...overrides }`
would drag the whole dark palette into a consumer that imports only `colorLight`.
`colorDark` and `shadowDark` are therefore spelled out as full literals (the
sparse `colorDarkOverrides` / `shadowDarkOverrides` remain, for the generator);
parity tests guard them against drift. Verified: importing `colorLight` alone
bundles ~480 B (only the light palette), not the whole token set.

**Don't introduce colors outside the system** (styleguide §9); don't add a set to
the generated CSS unless a surface renders through the var — spacing/radii/
breakpoints map onto Tailwind's built-in scales (`p-4`, `rounded-lg`, `md:`), so
the layout sets exist but are opt-in imports.

## Public API

Typed constants from `src/index.ts` (`colorLight`, `colorDark`, `color`,
`forest`, `fontFamily`, `fontSizeUi`, `letterSpacing`, `lineHeight`, `space`,
`radius`, `breakpoints`, `size`, `shadow`, `duration`, `easing`, `glow`,
`zIndex`; type `ColorToken`), plus a wildcard CSS sub-path export
`"./*.css" → "./styles/*.css"`:

| Import                                            | Use                                                        |
| ------------------------------------------------- | ---------------------------------------------------------- |
| `@movar/theme`                                    | typed token constants (JS/TS, non-CSS surfaces)            |
| `@movar/theme/color.css`                          | semantic colors (`:root, :host` + `@theme`) + Forest scale |
| `@movar/theme/typography.css`                     | UI type scale + font faces + tracking/leading              |
| `@movar/theme/shadow.css`                         | elevation shadows                                          |
| `@movar/theme/motion.css`                         | transition durations                                       |
| `@movar/theme/glow.css`                           | decorative marketing aurora glows                          |
| `@movar/theme/{space,radius,size,breakpoint}.css` | opt-in layout sets                                         |

## Layout

```
src/tokens.ts   — the typed source of truth (all token families)
src/render.ts   — pure fns: tokens → per-set CSS strings (no fs, no Node)
src/index.ts    — public TS API (re-exports tokens)
src/tokens.test.ts — value + render invariants (hex validity, no dead dark
                     overrides, literal↔derived parity, per-set renderers)
styles/*.css    — GENERATED + git-ignored (one file per token set)
```

The generator itself lives at the repo root
([`scripts/gen-theme-css.mts`](../../scripts/gen-theme-css.mts)) so this package
stays free of any Node dependency.

## Dependencies

None (dev-only: `@movar/eslint-config`, `eslint`). Consumed as source
(`"main": "./src/index.ts"`) — no build.

## Consumers

Every UI surface: `apps/extension` (popup/options), `apps/marketing`,
`apps/safari-host-app` (the iOS/macOS host screens), `apps/diagnostics` (whose
shadow-DOM panel relies on the `:host` scope), and `packages/ui`'s Storybook —
each `@import`s the sets it uses (`color` + `typography` + `shadow` for all;
extension + marketing also `motion`; marketing also `glow`; Safari also `size`).
`OgCard.tsx` and `BaseLayout.astro` import the typed constants (`colorLight`,
`fontFamily`); the extension content scripts (curtain / tooltip) inline
`duration` / `easing` into the CSS they inject into host pages.

## Working on it

Change a value in `src/tokens.ts` → `pnpm gen:theme` regenerates the stylesheets;
`pnpm --filter @movar/theme test` checks the invariants. Adding a whole token
set? Extend `src/tokens.ts`, add a `render<Set>Css` in `src/render.ts`, list it
in the generator, and (if a surface needs it) `@import` it there. Keep exported
objects spread-free (see the tree-shaking invariant) and `docs/styleguide.md` in
step — it's the prose spec this file implements.
