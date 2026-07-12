# UI Design System — `@movar/ui`

> Token-driven React primitives shared by the extension popup/options (apps/extension) and the marketing site (apps/marketing).

## What it does

Provides eight React components — `BrandMark`, `Button`, `Checkbox`, `IconButton`, `Pill`, `Select`, `Switch`, `Tooltip` — plus a pure positioning helper (`tooltip-position.ts`). The design tokens themselves live in [`@movar/theme`](../theme/AGENTS.md); these components just use the Tailwind utilities those tokens generate. Dark mode is `prefers-color-scheme` only (no `.dark` class strategy). Every interactive primitive shares the same focus-ring vocabulary (`focus-visible:outline-accent`), `disabled:opacity-50`, and `motion-reduce:transition-none`.

## Boundaries & invariants

- **Source-mode only** — no build step. Consumers (Vite/WXT for the extension, Astro/Vite for marketing) compile TSX directly; the package ships no JS bundle.
- **No translations or blocking logic** — purely visual primitives.
- `react` and `react-dom` are **peerDependencies**, not deps. The package ships no copy of React; each app supplies its own.
- Consumers must import `@movar/theme`'s `tokens.css` + `theme.css` (see `apps/extension/src/styles/globals.css` for the canonical pattern) before any token-driven utilities (`bg-accent`, `text-ink-strong`, etc.) will resolve. This package no longer ships the tokens itself.
- `src/internal/` modules (`cn.ts`, `is-touch.ts`, `toggle-field.tsx`) are **not** re-exported from `src/index.ts`; treat them as package-private.

## Public API / entry points

```
"exports": {
  "."                 → src/index.ts      (all React components + types)
  "./tooltip-position"→ src/tooltip-position.ts  (pure positioning math, no React)
}
```

`src/index.ts` re-exports:

| Symbol                                                                        | Type notes                                                                                                       |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `BrandMark`, `BrandMarkProps`                                                 | Solid/outline brand-mark SVG                                                                                     |
| `Button`, `ButtonProps`, `ButtonSize`, `ButtonVariant`                        | `primary`/`secondary`, `sm`/`md`, optional `fullWidth`                                                           |
| `Checkbox`, `CheckboxProps`                                                   | Extends `ToggleFieldProps`; supports `indeterminate`                                                             |
| `IconButton`, `IconButtonProps`                                               | 28×28 icon-only button; `label` required                                                                         |
| `Pill`, `PillProps`, `PillSize`, `PillTone`                                   | `accent`/`neutral`/`muted`; `sm`/`md`; optional `onClick` promotes to button                                     |
| `Select`, `SelectOption`, `SelectProps`, `SelectVariant`                      | `form`/`inline` variants over native `<select>`                                                                  |
| `Switch`, `SwitchProps`                                                       | Binary toggle (`role="switch"`) sharing `ToggleFieldProps` with Checkbox                                         |
| `Tooltip`, `TooltipAction`, `TooltipPlacement`, `TooltipProps`, `TooltipTone` | Portal-based hover/focus/touch tooltip; `TooltipPlacement` is re-exported from the `./tooltip-position` sub-path |

## Layout

```
packages/ui/
  src/
    index.ts               — public barrel
    button.tsx             — Button + button.stories.tsx
    brand-mark.tsx         — BrandMark + brand-mark.stories.tsx
    checkbox.tsx           — Checkbox + checkbox.stories.tsx
    icon-button.tsx        — IconButton + icon-button.stories.tsx
    pill.tsx               — Pill + pill.stories.tsx
    select.tsx             — Select + select.stories.tsx
    switch.tsx             — Switch + switch.stories.tsx
    tooltip.tsx            — Tooltip + tooltip.stories.tsx
    tooltip-position.ts    — pure positioning math (separate sub-path export)
    internal/
      cn.ts                — clsx-style class joiner
      is-touch.ts          — matchMedia hover:none detection
      toggle-field.tsx     — shared scaffolding for Checkbox + Switch
  .storybook/              — Storybook config (React-Vite, port 6006)
  package.json
  project.json             — Nx targets: typecheck, lint, test, storybook, build-storybook
  tsconfig.json            — extends ../../tsconfig.base.json, noEmit:true
```

## Dependencies

**`dependencies`** (bundled with every consumer):

- `lucide-react ^1.17.0` — icon glyphs used in `Select` (ChevronDown), `Checkbox` (Check, Minus); all icons in this repo come from lucide.

**`peerDependencies`** (must be provided by the consuming app):

- `react ^19.0.0` and `react-dom ^19.0.0` — kept as peers so the extension and marketing site share a single React instance; bundling a second copy would break hooks.

Storybook, Tailwind, Vite, and font packages are `devDependencies` only; they are never part of a consumer's bundle.

## Working on it

Run from `packages/ui/`:

```bash
pnpm typecheck        # tsc --noEmit
pnpm lint             # eslint .
pnpm test             # vitest run --passWithNoTests (no test files yet)
pnpm storybook        # Storybook dev server on :6006 (STORYBOOK_PORT overrides)
pnpm build-storybook  # static build → storybook-static/
```

Or via Nx from the repo root:

```bash
nx run ui:storybook
nx run ui:build-storybook
```

`pnpm dev` at the repo root starts process-compose, which runs Storybook on `:6006` alongside the extension dev server `:4321`.

Stories live next to their component files (`button.stories.tsx` beside `button.tsx`). Storybook uses `@storybook/react-vite`.

## Gotchas

- **`./tooltip-position` firewall** — `tooltip-position.ts` is a zero-import pure module exposed as its own sub-path _specifically_ so `apps/extension`'s vanilla content-script bundle can import `computeTooltipPosition` without pulling React or react-dom (which are peers and would be undefined in a non-React context). Never add a React or DOM import to `tooltip-position.ts`, and never re-export it from the main `"."` entry if you want the firewall to hold.
- **Tokens must be wired by the consumer** — these primitives render unstyled unless the app's global CSS imports `@movar/theme/tokens.css` (raw variables) and `@movar/theme/theme.css` (the Tailwind `@theme` mapping). Missing either means token-named utilities silently produce no styles.
- **`vitest.config.ts` is absent** — `pnpm test` passes `--passWithNoTests` because there are currently no unit tests; add a `vitest.config.ts` if/when tests are introduced.
- **`tooltip.tsx` re-exports `TooltipPlacement`** from `./tooltip-position` so consumers don't need to know about the sub-path module; the type is importable as `import type { TooltipPlacement } from '@movar/ui'`.
- **`Select` dev warning** — a `console.warn` fires in non-production builds when a `<Select>` renders without an accessible name (`aria-label`, `aria-labelledby`, or `id`). This is intentional; silence it by wiring the label, not by suppressing the warning.
