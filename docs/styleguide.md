# Movar — Styleguide

Source of truth for Movar's visual language. Carried over verbatim from the Claude Design handoff bundle (`OHrMRUX4raYD8pu67DNiUA`, May 2026). The brand was iterated through chat; what's here is the locked decision, not the explorations.

**Personality.** Quiet conviction. Confident, calm, principled. Never loud or performative.
**Posture.** Effortless. Click once, then forget — the product disappears, only its effect remains.
**Heritage.** Modern European. Flat, geometric, typographic. In the family of Monobank, Diia, the Privatbank rebrand.

The brand has **one accent** (forest) on **one neutral** (stone-warm). The accent is reserved for moments Movar acted on the user's behalf.

---

## 1. Color

### 1.1 Forest — accent

The single confident hue. Use only on elements that represent Movar acting on the user's behalf.

| Step | Hex     | Role / use                                         |
| ---- | ------- | -------------------------------------------------- |
| 50   | #F0FDF4 | `--accent-surface` — section wash, applied zone    |
| 100  | #DCFCE7 | `--accent-soft` — subtle badge, row highlight      |
| 200  | #BBF7D0 |                                                    |
| 300  | #86EFAC |                                                    |
| 500  | #22C55E |                                                    |
| 600  | #16A34A |                                                    |
| 700  | #15803D | **★ `--accent`** — correction applied, primary CTA |
| 800  | #166534 |                                                    |
| 900  | #14532D | `--accent-deep` — hover, text on accent-surface    |

Forest sidesteps the obvious flag pairing — yellow + blue reads political; forest reads _principled_. Pair with stone for warmth.

### 1.2 Stone — neutrals

Slightly warm slate. Reads modern but not sterile. Works against both light and dark browser chrome.

| Step | Hex     | Role / use                                  |
| ---- | ------- | ------------------------------------------- |
| 50   | #FAFAF9 | `--bg` (light)                              |
| 100  | #F5F5F4 | `--surface-2` (light)                       |
| 200  | #E7E5E4 | `--border` (light)                          |
| 300  | #D6D3D1 | `--border-strong` (light)                   |
| 400  | #A8A29E | `--ink-faint` (light) / `--ink-soft` (dark) |
| 500  | #78716C | `--ink-soft` (light)                        |
| 700  | #44403C | `--ink` (light) / `--border-strong` (dark)  |
| 800  | #292524 | `--surface-2` (dark)                        |
| 900  | #1C1917 | `--ink-strong` (light) / `--surface` (dark) |
| 950  | #0C0A09 | `--bg` (dark)                               |

### 1.3 Semantic tokens

The product references semantic names, not raw stone steps. Light values from `:root`, dark from `[data-theme="dark"]` (or `prefers-color-scheme: dark`).

| Token              | Light   | Dark    | Use                                         |
| ------------------ | ------- | ------- | ------------------------------------------- |
| `--bg`             | #FAFAF9 | #0C0A09 | Page background                             |
| `--surface`        | #FFFFFF | #1C1917 | Popup body, options card                    |
| `--surface-2`      | #F5F5F4 | #292524 | Inset surface, secondary chip               |
| `--surface-3`      | #EDEAE6 | #322E2B | Tertiary surface, disabled glyph background |
| `--border`         | #E7E5E4 | #2E2A27 | Hairlines, dividers                         |
| `--border-strong`  | #D6D3D1 | #44403C | Stronger border, toggle track               |
| `--ink-faint`      | #A8A29E | #57534E | Captions, mono meta, faint hairline labels  |
| `--ink-soft`       | #78716C | #A8A29E | Secondary copy, sub-labels                  |
| `--ink`            | #44403C | #D6D3D1 | Body copy                                   |
| `--ink-strong`     | #1C1917 | #FAFAF9 | Display type, wordmark, headings            |
| `--accent`         | #15803D | #15803D | Correction applied, primary CTA             |
| `--accent-deep`    | #14532D | #14532D | Hover, text on accent-surface               |
| `--accent-soft`    | #DCFCE7 | #DCFCE7 | Subtle badge, row highlight                 |
| `--accent-surface` | #F0FDF4 | #F0FDF4 | "Applied" zone wash                         |
| `--accent-on`      | #FFFFFF | #FFFFFF | Foreground over solid accent                |

The accent scale does not shift between themes — the forest reads correctly on both light and dark backgrounds.

### 1.4 Applied moment

The accent is allowed to speak. The pattern is a pulsing dot on `--accent-surface` with `--accent-deep` text:

> ● **Correction applied.** _This is the only moment Movar speaks — and it speaks in this one color, this one tone._

---

## 2. Typography

| Family            | Weights                 | Used for                                                                                          |
| ----------------- | ----------------------- | ------------------------------------------------------------------------------------------------- |
| **Manrope**       | 400, 500, 600, 700, 800 | Display, body, UI. Full Cyrillic + Latin coverage. Geometric DNA, reads at small UI sizes.        |
| **IBM Plex Mono** | 400, 500, 600           | Locale codes, tokens, header meta, code. Carries the technical register without going industrial. |

### 2.1 Roles

| Role     | Family        | Size         | Weight          | Tracking       | Notes                                                  |
| -------- | ------------- | ------------ | --------------- | -------------- | ------------------------------------------------------ |
| Display  | Manrope       | 28 – 56 px   | 700 / 800       | −2 % to −4.5 % | Headings, wordmark, hero                               |
| Body     | Manrope       | 17 – 18 px   | 400 / 500       | −0.5 %         | Marketing, long-form, options copy                     |
| UI       | Manrope       | 12 – 15 px   | 400 / 500 / 600 | −0.5 %         | Popup labels, button copy                              |
| Mono     | IBM Plex Mono | 10.5 – 14 px | 400 / 500 / 600 | 0              | Locale codes, headers, meta                            |
| Wordmark | Manrope 800   | 120 – 240 px | 800             | −4.5 %         | `line-height: 0.86` · accent dot ø = 0.18 em as period |

### 2.2 Font features

- Body: `font-feature-settings: "ss01", "ss02", "cv11";`
- Mono: `font-feature-settings: "ss02";`
- Numerals: `font-variant-numeric: tabular-nums;` on counters and metadata.

### 2.3 Bilingual samples

The brand is bilingual UA/EN by default. Manrope's Cyrillic carries the same geometric character as the Latin — verify both renders before locking type at any new size.

```
Тримай інтернет
у своїй мові.
```

```
Many Ukrainian sites ship both UA and RU versions but default to Russian
regardless of the user's stated preference. Movar fixes this automatically.
```

```
accept-language: uk-UA, uk;q=0.9, en;q=0.7
user-locale.preferred: ["uk", "en"]
block.languages:       ["ru", "be"]
rule.search.engine:    strip-cyrillic-ru
```

---

## 3. Shadows

| Token         | Light                                                               | Dark                                                        |
| ------------- | ------------------------------------------------------------------- | ----------------------------------------------------------- |
| `--shadow-sm` | `0 1px 2px rgba(20,15,5,.04), 0 1px 1px rgba(20,15,5,.03)`          | _(unchanged)_                                               |
| `--shadow-md` | `0 6px 24px -10px rgba(20,15,5,.12), 0 2px 6px rgba(20,15,5,.04)`   | `0 6px 24px -10px rgba(0,0,0,.6), 0 2px 6px rgba(0,0,0,.4)` |
| `--shadow-lg` | `0 24px 60px -20px rgba(20,15,5,.18), 0 6px 18px rgba(20,15,5,.06)` | `0 24px 60px -20px rgba(0,0,0,.7)`                          |

`shadow-md` is the options card. `shadow-lg` is the popup. `shadow-sm` is for inline mocks (Chrome Web Store tile etc.).

---

## 4. Brand mark

The mark is `r.` — the wordmark's tail extracted as a logogram. The period inherits the brand-accent role directly.

### 4.1 Geometry

```
ViewBox: 0 0 128 128
Tile:    rect x=6 y=6 w=116 h=116 rx=28  fill="currentColor"
Letter:  text "r" at x=56 y=100  Manrope 800  96 px  letter-spacing: -0.02em
         fill = var(--brand-letter, white)
Accent:  circle cx=89.60 cy=90.40 r=9.60  fill="var(--accent)"
```

- **`currentColor`** drives the tile. The parent's `text-*` utility chooses light / dark / accent tile.
- **`--brand-letter`** drives the `r` color. Set per context so the letter reads against the tile (white on dark tile, dark on light tile, accent-green on white tile in "accent variant").
- **Center alignment** (y = 100). Locked decision after exploring optical variants.

### 4.2 Variants

| Context             | Tile        | Letter (`--brand-letter`)                                                         | Accent dot    |
| ------------------- | ----------- | --------------------------------------------------------------------------------- | ------------- |
| Light · primary     | `--surface` | `--surface` (white)                                                               | `--accent`    |
| Dark · inverse      | `#0C0A09`   | `#0C0A09` (dark — reads inverse on light tile in dark chrome)                     | `--accent`    |
| Accent · in-product | `--accent`  | `--accent` (so the dot floats against the tile, the r stays the green tile color) | `--accent-on` |

For the **`m-brand-mono`** outline variant: tile is `rect x=9 y=9 w=110 h=110 rx=22 stroke="currentColor" stroke-width=6 fill="none"`, letter + dot both `currentColor`. Used for the idle state.

### 4.3 Sizes

`16 / 32 / 48 / 128 px` — the four required PNG manifest sizes for cross-browser extension targets. Must read clearly at 16 px in toolbars on both light and dark chrome.

---

## 5. Iconography — two states

One glyph, two states. Outline at rest. Filled with accent the moment Movar acts. No badges, exclamation marks, or tooltips by default — the accent fill _is_ the signal.

| State           | Glyph                                    | Background                                            | Notes                                   |
| --------------- | ---------------------------------------- | ----------------------------------------------------- | --------------------------------------- |
| **Idle**        | `m-brand-mono` (outline, `--ink-strong`) | `--surface-2`                                         | Movar is on but had nothing to do here. |
| **Active**      | `m-brand` (filled, `--ink-strong` tile)  | `--accent-soft` (tinted) with `--accent` letter color | Movar made a correction on this page.   |
| **Paused**      | `m-brand-mono` 0.5 opacity               | `--surface-3`                                         | Extension globally off.                 |
| **Allowlisted** | `m-brand-mono` (outline, `--ink-strong`) | `--surface-2`                                         | Site told to stay as-is.                |

In the toolbar slot, Active also gets a small accent badge dot at top-right (`width: 8; height: 8; border-radius: 50%; background: var(--accent)`) with a 2 px `--surface-2` halo.

---

## 6. Surfaces

### 6.1 Popup (360 px)

Container:

```
width: 360px
background: var(--surface)
border: 1px solid var(--border)
border-radius: 14px
box-shadow: var(--shadow-lg)
overflow: hidden
font-family: Manrope (body)
color: var(--ink-strong)
```

Regions, top to bottom:

| Region           | Padding      | Border          | Notes                                                                                                                                                                                                                                                                                   |
| ---------------- | ------------ | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `popup-hd`       | 16 / 18 / 14 | bottom hairline | Brand (mark 18 px + "Movar" display 700 16 px) ↔ status pill (mono 10.5 px, accent, leading dot)                                                                                                                                                                                        |
| `popup-current`  | 18 / 18 / 16 | bottom hairline | `linear-gradient(180deg, var(--accent-surface), transparent)` background. URL (mono 11.5 px ink-soft) above an "applied" row: accent check circle 22 px + 15 px ink-strong 500 label. Detail line below at 12.5 px with strikethrough/accent for the language transition (`ru` → `uk`). |
| `popup-controls` | 14 / 18      | —               | Stack of ctrl-rows, 10 px vertical padding each. Two-column: left col is label (13.5 px ink-strong) + sub (12 px ink-soft), right col is toggle.                                                                                                                                        |
| `popup-list`     | 14 / 18      | top hairline    | Header (mono 10.5 px uppercase, 0.1 em tracking, ink-faint) with right-aligned `<span>` ink-soft. Each item: 8 px vertical, three columns (site mono 11.5 px ink-strong / tag mono 10.5 px on accent-soft / when mono 10.5 px ink-faint).                                               |
| `popup-ft`       | 12 / 18      | top hairline    | Mono 11 px ink-soft. Right link: ink-strong with `border-bottom: 1px solid var(--border-strong)`, accent on hover.                                                                                                                                                                      |

Toggle (36 × 20 pill): `--border-strong` track off, `--accent` track on; 16 × 16 white thumb with `0 1px 2px rgba(0,0,0,.2)`.

### 6.2 Options page

Container:

```
background: var(--surface)
border: 1px solid var(--border)
border-radius: 14px
box-shadow: var(--shadow-md)
overflow: hidden
```

| Region     | Padding | Border          | Notes                                                                                                                                   |
| ---------- | ------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `opt-hd`   | 18 / 28 | bottom hairline | Brand (mark 22 px + "Movar" display 700 18 px + mono 10.5 px version) ↔ horizontal nav (13 px ink-soft, active gets `--surface-2` chip) |
| `opt-body` | 36 / 28 | —               | Grid: main (1fr) + aside (240 px) · 56 px gap                                                                                           |

Main:

- Heading 22 px display 700 ink-strong.
- Sub 14 px ink-soft.
- `lang-list` — flex column, 8 px gap, max 480 px.
- Each `lang-row`: 12 / 14 padding · `--surface-2` background · 1 px `--border` · 8 px radius. Children: drag handle (3 stacked bars, ink-faint) · ord (mono 11 px, 18 px wide, ink-faint) · flag (22 × 22 circle, `--surface-3` bg, ink-strong display 700 10.5 px letter) · name (14 px ink-strong 500) optional em (13 px ink-soft 400) · code (mono 11 px, ink-soft, in 1 px `--border` chip on `--surface`).
- `lang-row.primary`: `--accent-surface` background, `color-mix(in oklab, var(--accent) 30%, transparent)` border, flag becomes `--accent` bg with `--accent-on` letter.
- `lang-row.blocked`: 0.55 opacity, name gets strikethrough in `--ink-faint`, replace code chip with `badge-blocked` (mono 10 px, uppercase, 0.08 em tracking, `--surface-3` bg, `--ink-soft` color).

Aside:

- 12.5 px ink-soft, line-height 1.6, padded-left 16, left hairline.
- Optional heading: 13 px display 600 ink-strong.

### 6.3 Topbar (marketing / brand guide)

Not a product surface, but referenced from the design HTML:

- Sticky, z 50, 14 / 48 padding.
- Backdrop: `color-mix(in oklab, var(--bg) 88%, transparent)` + 20 px blur with 140 % saturation.
- Bottom hairline.
- Brand left (mark 22 px + "Movar" 16 px display 700). Meta right (mono 11 px ink-soft, 6 px-gap items separated by 24 px).

---

## 7. Motion

Movar is mostly static. The only blessed motion is the **applied pulse**:

```
@keyframes pulse {
  0%   { transform: scale(1);   opacity: .35; }
  70%  { transform: scale(2.4); opacity: 0;   }
  100% { opacity: 0; }
}
.pulse {
  width: 12px; height: 12px; border-radius: 50%;
  background: var(--accent);
}
.pulse::after {
  content: ""; position: absolute; inset: -6px;
  border-radius: 50%; background: var(--accent); opacity: 0.35;
  animation: pulse 2.2s ease-out infinite;
}
```

Toggles transition `background .2s` and the thumb transitions `left .2s`. Everything else snaps.

---

## 8. Voice & posture

| Personality | Quiet conviction. Confident, calm, principled. Never loud, never aggressive, never performative. |
| Posture | Effortless. Click once, then forget. The product disappears; only its effect remains visible. |
| Heritage | Modern European. Flat, geometric, typographic. In the family of Monobank, Diia, the Privatbank rebrand. |
| Voice | The applied moment is the only time Movar speaks. It speaks in one color, one tone — "Correction applied." Then it's gone. |

**Avoid.** Tridents. Embroidery. Military cues. Loud nationalism. Flag-color pairings.

The summary above is the visual side. For the full copy spec — voice imperatives, naming the antagonist, UA and EN mechanics, length-and-register table, lexicon, nevers, and worked examples — see [`docs/copy.md`](copy.md). Edit user-facing strings (`apps/extension/src/lib/i18n/messages-{uk,en}.ts`, `apps/marketing/src/i18n.ts`, store listings) against that doc, not against this stanza.

---

## 9. Tailwind v4 mapping

In Tailwind v4, the `@theme` directive turns CSS custom properties into utility classes. Both the values and the mapping now live in the [`@movar/theme`](../packages/theme/AGENTS.md) package — the typed source of truth is `packages/theme/src/tokens.ts`, from which `pnpm gen:theme` generates **one self-contained stylesheet per token set** (`color.css`, `typography.css`, `shadow.css`, `motion.css`, `glow.css`, plus the opt-in `space`/`radius`/`size`/`breakpoint`). Each carries both its raw `:root, :host` variables **and** its `@theme` wiring, so an app `@import`s exactly the sets it uses (see `apps/extension/src/styles/globals.css`). Utilities once `@theme` has resolved:

- `bg-surface` `bg-surface-2` `bg-surface-3` `bg-bg`
- `bg-accent` `bg-accent-soft` `bg-accent-surface`
- `text-ink` `text-ink-strong` `text-ink-soft` `text-ink-faint` `text-accent` `text-accent-deep`
- `border-border` `border-border-strong` `border-accent`
- `font-display` `font-sans` `font-mono`
- `text-ui-{micro,xs,sm,base,md,lg,xl}` — the curated UI scale (`lg` = 15 px label, `xl` = 22 px section heading); the whole popup/options UI renders through it, with near-duplicate one-off sizes consolidated onto the nearest step
- `tracking-{display,wordmark,label}` · `leading-{wordmark,aside}` — the brand-divergent type roles (generic tracking/leading keep Tailwind's defaults)
- `shadow-sm` `shadow-md` `shadow-lg`
- `animate-pulse-dot` — the §7 "applied" pulse; `--duration-{fast,base,slow}` raw vars for transitions
- Full scales `bg-forest-{50…900}` and `bg-stone-{50…950}` are also exposed for Tremor charts and edge-case shading.

Do not introduce new colors outside the system. If a use case looks like it needs one, the answer is to find the semantic token that already covers it. (The one sanctioned exception is the marketing hero's decorative `--glow-{primary,secondary}` aurora — emerald/teal, tokenised in `glow.css`, used only for the ambient hero wash, never on product chrome.)
