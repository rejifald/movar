# Design profile

Where each surface keeps its vocabulary, and what a design round may move.

## Surfaces

| Surface               | Tokens                       | Components                              | Viewports              |
| --------------------- | ---------------------------- | --------------------------------------- | ---------------------- |
| Marketing (movar.fyi) | `@movar/theme`               | `apps/marketing/src/components/*.astro` | 1280 / 390             |
| Extension UI          | `@movar/theme` + `@movar/ui` | `packages/ui/src/*`                     | popup 360, options 720 |
| Safari host app       | native SwiftUI               | `apps/safari-host-app/src/*`            | macOS 1024, iOS 402    |

## Marketing — frozen vs free

**Frozen.** Colour tokens, type scale, font families, the 4px spacing grid, and
the icon set (lucide only). Copy tone is frozen by `docs/copy.md` and must be
drafted in both locales.

**Free.** Layout, hierarchy, density, section order, and which existing
components a page composes.

## Tokens (light; dark flips via `@media`/`[data-theme]`)

Source of truth is `packages/theme/src/tokens.ts` — never hand-edit generated CSS.

| Role        | Token              | Light     |
| ----------- | ------------------ | --------- |
| Page        | `--bg`             | `#fafaf9` |
| Card        | `--surface`        | `#ffffff` |
| Band        | `--surface-2`      | `#f5f5f4` |
| Sunken      | `--surface-3`      | `#edeae6` |
| Hairline    | `--border`         | `#e7e5e4` |
| Heading     | `--ink-strong`     | `#1c1917` |
| Body        | `--ink-soft`       | `#57534e` |
| Accent fill | `--accent`         | `#15803d` |
| Accent text | `--accent-text`    | `#166534` |
| Accent tint | `--accent-surface` | `#f0fdf4` |

`--accent` is a **fill** paired with `--accent-on`; accent-coloured _text_ uses
`--accent-text`. Do not use the fill hex for text — it fails AA on dark.

## Type

`--font-display` Fixel Display (headings), `--font-sans` Fixel Text (body and
labels), `--font-mono` IBM Plex Mono (eyebrows, technical strings).

Marketing pages use raw Tailwind type classes. The `type-*` utilities from
`@movar/theme` are **product-UI only** — `type-display` carries no font-size and
renders a 16px h1 on a marketing page.

## Section shell

The repeated marketing idiom, from `Close.astro` / `Privacy.astro`:

```
<section class="border-t border-border bg-surface px-6 py-20">
  <div class="mx-auto max-w-5xl">…</div>
</section>
```

Eyebrow is `font-mono text-xs font-semibold uppercase tracking-label
text-accent-text`. Headings are `font-display … font-extrabold tracking-display
text-ink-strong`.

## Capture vehicle

`pnpm dev` (process-compose, `:4321`) or Storybook `:6006`. In a worktree,
`preview_start` must go through the worktree-aware launcher — see the root
`CLAUDE.md`.
