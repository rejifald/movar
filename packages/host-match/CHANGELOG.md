# @movar/host-match

## 0.1.0

### Minor Changes

- 623abba: Pipe-join Google's `lr` parameter across every preferred language. A user whose priority is `[uk, en]` now ends up with `lr=lang_uk|lang_en` on `/search`, so results can come from either language. Previously only the top preference reached `lr`, which made English speakers with Ukrainian as their #1 lose every English result they'd otherwise expect.

  `hl` continues to take the top preference only — it's the UI + AI Overview language, a "pick one" knob.

  Adds an optional per-param `joinPreferences?: boolean` field to the `searchParams` strategy. The Google rule sets it on `lr`; `hl` keeps the existing single-value behaviour. Other rules (Bing `setlang`, DDG `kl`, YouTube `hl`/`gl`) are unchanged — none of them have a documented OR-join syntax.

  `applyStrategy` now accepts `LanguageCode | readonly LanguageCode[]` as its target; single-value callers (tests, the hreflang fallback) keep working unchanged.

  Policy assertion: the rewrite is driven only by the user's stored preferences (already `ru`-free via `enforceLockedLanguages`). Browser locale and inbound URL state — including a stale `hl=ru&lr=lang_ru` from a Google referrer — are overwritten, never inherited.

### Patch Changes

- 623abba: Strip Google's `sei` query parameter on `/search` URL rewrites. `sei` is an opaque session-event token Google appends to SERPs after the first interaction in a session; it carries prior-session locale bias forward and can pull subsequent results back toward the earlier session's language even with `hl=uk&lr=lang_uk` set. Dropping it on every rewrite ensures each query is judged on its own `hl`/`lr` + Accept-Language signals.

  Adds an optional `stripParams: readonly string[]` field to the `searchParams` strategy type. The Google rule sets it to `['sei']`. Other strategies are unchanged.
