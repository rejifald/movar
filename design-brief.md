# Movar — Brand Design Brief

## What it is

**Movar** is a cross-browser extension that enforces the user's language preferences on the web. It defaults sites to Ukrainian (English fallback) and automatically switches multilingual sites away from Russian. It can also strip unwanted languages from on-site pickers and search results.

**Tagline:** _Keep the web in your language._

## Why it exists

Many Ukrainian sites ship both UA and RU versions but default to Russian regardless of the user's stated preference. Search engines surface Russian results even under a Ukrainian locale. Movar fixes this automatically — the user never has to choose.

## Audience

- Ukrainian web users, primarily UA-speaking, EN-comfortable.
- Privacy-aware, browser-extension-savvy.
- Emotionally invested in language sovereignty — this is a values product, not just a utility.

## Brand personality

- **Quiet conviction.** Not loud or aggressive — confident, calm, principled. The product _acts_ on the user's behalf; the brand should feel like a trusted helper, not a flag-waver.
- **Effortless.** Automation is the value proposition. The brand should feel light, almost invisible, "click once and forget."
- **Modern, clean, European.** Aligned with current Ukrainian design sensibility (think Monobank, Privatbank's rebrand, Diia) — flat, geometric, typographic, not folkloric.
- Avoid: military imagery, embroidery (vyshyvanka) patterns, trident overload, heavy nationalism cues. The product is about _language_, not symbols of state.

## Core associations

- Language, switching, redirecting, filtering.
- Movement / pivoting (the name "Movar" leans on _мова_ = language).
- A protective layer between user and web.

## Surfaces the design needs to cover

1. **Extension icon** at 16×16, 32×32, 48×48, 128×128 — must read clearly even at 16 px in the browser toolbar.
2. **Popup UI** (small floating panel, ~360×500 px): pause controls, per-site toggle, "correction applied" indicator.
3. **Options page** (full tab): language priority list, allowlist, usefulness dashboard (Tremor charts).
4. **Store listing assets**: Chrome Web Store / Firefox AMO / Edge / Safari — tile + screenshots + promo banner.
5. **Wordmark** for README, store listings, in-product header.

## Color, typography & system

Locked. See **[docs/styleguide.md](docs/styleguide.md)** — the styleguide is the source of truth and is mirrored 1:1 in `apps/extension/src/styles/tokens.css` + the `@theme` block in `globals.css`. Headline decisions:

- **Forest** accent (`#15803D`) on **stone-warm** neutrals — sidesteps flag pairings.
- **Manrope** (display + body) + **IBM Plex Mono** (locale codes / tokens / mono). Full Cyrillic + Latin.
- Light + dark themes via `prefers-color-scheme`. Accent stays consistent across both.

## Technical constraints

- Tech stack: **WXT · React · TypeScript · Tailwind CSS · Tremor**.
- Targets: Chrome, Firefox, Edge, Safari (incl. iOS) — icon must render correctly across all four browser UIs.
- License: MIT, open source — brand should be welcoming to contributors, not over-corporate.

## What's delivered

1. ✅ Brand mark (`r.` squircle, SVG) — [BrandMark.tsx](apps/extension/src/components/BrandMark.tsx) + [icon.svg](apps/extension/src/public/icon.svg).
2. ✅ Icon set at 16/32/48/128 PNG, generated from the master SVG via `pnpm --filter @movar/extension icons`.
3. ✅ Color palette as Tailwind v4 tokens — `apps/extension/src/styles/tokens.css` + `@theme` in `globals.css`.
4. ✅ Type system — Manrope (display/body) + IBM Plex Mono (mono), bundled via `@fontsource`.
5. ✅ Sample screens applied — popup (StatusHeader, HiddenPanel, PauseControls) + options page (language priority list, Tremor placeholder).

## Out of scope / follow-ups

- Tremor dashboard wiring (charts).
- Per-site allowlist UI in options page.
- Popup tabs / sites / dashboard / about sections.
- Chrome Web Store listing assets (tile, screenshots, promo banner).
- `theme_icons` for dark browser chrome.
