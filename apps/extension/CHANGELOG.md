# @movar/extension

## 1.3.0

### Minor Changes

- 623abba: Pipe-join Google's `lr` parameter across every preferred language. A user whose priority is `[uk, en]` now ends up with `lr=lang_uk|lang_en` on `/search`, so results can come from either language. Previously only the top preference reached `lr`, which made English speakers with Ukrainian as their #1 lose every English result they'd otherwise expect.

  `hl` continues to take the top preference only — it's the UI + AI Overview language, a "pick one" knob.

  Adds an optional per-param `joinPreferences?: boolean` field to the `searchParams` strategy. The Google rule sets it on `lr`; `hl` keeps the existing single-value behaviour. Other rules (Bing `setlang`, DDG `kl`, YouTube `hl`/`gl`) are unchanged — none of them have a documented OR-join syntax.

  `applyStrategy` now accepts `LanguageCode | readonly LanguageCode[]` as its target; single-value callers (tests, the hreflang fallback) keep working unchanged.

  Policy assertion: the rewrite is driven only by the user's stored preferences (already `ru`-free via `enforceLockedLanguages`). Browser locale and inbound URL state — including a stale `hl=ru&lr=lang_ru` from a Google referrer — are overwritten, never inherited.

- b631c62: Make the Google SERP content filter actually hide Russian on the current layout, and extend it to "People also ask".

  The extractor matched only `div.g` / `div[data-snhf]`, which hit zero nodes on today's Google markup — so Russian organic results and the "Схожі запитання" (People also ask) questions leaked through unfiltered. Organic results are now found by a layout-stable anchor (each `#rso` result `<h3>` climbed to its enclosing `data-hveid` card) instead of obfuscated styling classes (`div.tF2Cxc`, …) that rotate and silently stop matching. No rotating-class fallbacks are kept — a stale fallback is just a deferred silent-miss; the fix for an uncovered layout is another reliable anchor. People-also-ask questions are filtered per row (`div.related-question-pair`), so a Russian question is hidden while a Ukrainian one in the same block stays. Nested result cards (sitelinks) collapse to the outermost container so a result is never hidden twice.

  The content filter now also runs on any `google.*` ccTLD (matched structurally on the SERP shape), not just a fixed seven-domain allowlist.

- **Onboarding.** Request all-sites host access at runtime — a one-click native prompt from the first-run onboarding page — instead of sending users on a settings hunt, with per-browser install and permission guidance (#177, #178).

- **Google results filtering.** Hide Google's AI Overview, sponsored text ads, and product/shopping results when they answer in a non-targeted language (#180, #183, #186).

- **Language-switch reliability.** Recover from a stuck language switch via a guard TTL and a popup retry, so a redirect can't strand the page mid-switch (#184).

- **Safari (iOS / iPadOS).** New host app with Dynamic Type support and App Store submission assets; the host app and all four extension surfaces now share one React shell (#171, #176, #185).

- **UI.** Fill iOS Safari's popup sheet and bump its type scale; Safari host-app hug-content layout (#179, #191).

- **Options.** Source-code link in the settings footer; removed Import/Export (#167, #170).

### Patch Changes

- **Detection engine.** Re-based on the published `langtell` package — `LanguageCode`, the classifier core, language profiles, and BCP-47 normalizers now come from langtell, guarded by a classifier-equivalence test, with no behavior change (#154–#160).

- Updated dependencies [623abba]
- Updated dependencies [623abba]
  - @movar/host-match@0.1.0
  - @movar/page-content@0.0.1
