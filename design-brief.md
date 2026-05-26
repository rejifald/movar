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

## Color palette guidance

- Should work on both light and dark browser chrome.
- Needs a clear **"correction applied"** accent — a single confident hue that signals "Movar just did something for you." Likely _not_ the obvious blue/yellow Ukrainian flag pairing — too on-the-nose and reads as political rather than functional. A more sophisticated take is welcome (deep teal, warm amber, muted indigo — designer's call).
- Tailwind-friendly tokens preferred (the codebase uses Tailwind v4 + Tremor for charts).

## Typography

- A modern sans with strong Cyrillic + Latin coverage is mandatory (the product is bilingual UA/EN by default, and i18n is a first-class concern).
- Candidates worth considering: Inter, Geist, IBM Plex Sans, Manrope, e-Ukraine.

## Technical constraints

- Tech stack: **WXT · React · TypeScript · Tailwind CSS · Tremor**.
- Targets: Chrome, Firefox, Edge, Safari (incl. iOS) — icon must render correctly across all four browser UIs.
- License: MIT, open source — brand should be welcoming to contributors, not over-corporate.

## What to deliver

1. Logo + wordmark (SVG, with mono/light/dark variants).
2. Icon set at 16/32/48/128.
3. Color palette as Tailwind tokens (primary, accent, neutrals, semantic).
4. Type system (display, body, mono).
5. 1–2 sample screens (popup + options header) showing the system applied.
