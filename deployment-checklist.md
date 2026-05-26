# Deployment checklist

What's needed to publish Movar to the extension marketplaces.

## In-repo gaps

- [ ] **Icons.** [apps/extension/wxt.config.ts](apps/extension/wxt.config.ts) has no `icons` field and `apps/extension/src/public/` has no icon files. Chrome requires 16/32/48/128 PNGs. Keep a source SVG and have WXT emit the sizes. Also set `action.default_icon`.
- [ ] **Version.** `version: "0.0.0"` in [apps/extension/package.json](apps/extension/package.json) — stores reject this. Bump to `1.0.0` and decide whether Changesets owns the bumps.
- [ ] **Permission justifications.** `<all_urls>` + `declarativeNetRequest` + `tabs` all trigger Chrome's "purpose" review and Firefox reviewer questions. Draft 1–2 sentences per permission in advance.
- [ ] **Locale wiring.** `_locales/en/messages.json` exists but the manifest reads `name`/`description` directly from `wxt.config.ts`. Switch to `__MSG_extName__` / `__MSG_extDescription__` so the UK listing renders Ukrainian strings.
- [ ] **Privacy policy URL.** Required by Chrome Web Store the moment you use `<all_urls>` or touch user data. Must be a public URL, not a repo file.
- [ ] **Source-code map for Firefox AMO.** AMO requires reviewable sources for bundled/minified extensions. Document the exact repro (`pnpm install && pnpm --filter @movar/extension build:firefox`) in a `SOURCE.md`.

## Per-store accounts & artifacts

| Store            | Fee                    | Artifact                                              |
| ---------------- | ---------------------- | ----------------------------------------------------- |
| Chrome Web Store | $5 one-time            | `pnpm --filter @movar/extension zip` output           |
| Edge Add-ons     | free                   | same Chrome MV3 zip                                   |
| Firefox AMO      | free                   | `pnpm --filter @movar/extension build:firefox && zip` |
| Safari (Mac/iOS) | $99/yr Apple Developer | Xcode-converted project, not a zip — separate effort  |

## Store listing assets (every store wants these)

- [ ] 128×128 store icon (separate from in-extension icons)
- [ ] 4–5 screenshots at 1280×800 or 640×400: popup, options page, "correction applied" indicator on a real site
- [ ] Short description (≤132 chars) in EN **and** UK
- [ ] Long description in EN **and** UK
- [ ] Category (likely "Productivity") and language tags
- [ ] 440×280 small promo tile for Chrome Web Store (optional but recommended)

## Pre-submission verification

- [ ] `pnpm lint` clean
- [ ] `pnpm typecheck` clean
- [ ] `pnpm test` passing
- [ ] Manual smoke test in Chrome — popup, options, switching on a Russian-defaulting site
- [ ] Manual smoke test in Firefox build
- [ ] Verify zip contents do not include sourcemaps or `.env` files
