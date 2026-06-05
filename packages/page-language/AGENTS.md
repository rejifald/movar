# Page Language — `@movar/page-language`

> Answers "what language is this site currently serving?" for the redirect layer by walking a prioritised signal chain: active picker → `<html lang>` → subdomain → path segment → self-referential hreflang.

## What it does

Exports a five-tier sync detection chain that the redirect layer uses to decide whether to attempt a language switch:

1. **Active picker** — reads `model.activeLanguage` (pre-computed by `buildPickerModel`); wins over `<html lang>` because picker state and rendered content are written together and cannot drift.
2. **`<html lang>`** — normalised via `normalizeBCP47`; authoritative when no picker is present.
3. **Subdomain** — e.g. `ru.example.com`; skipped for apex (`example.com`) and two-label hostnames.
4. **Path segment** — strict alias match via `normalizeLanguageCode`; `/ru-return-warranty` does not fire (Bosch regression).
5. **Self-targeted hreflang** — `<link rel="alternate" hreflang="X" href="THIS URL">` matched against the current `location.href`.

Body-text detection (former tier 6) is **not** in this chain. It is async and lives in `applyOnce` inside `apps/extension/src/entrypoints/content.ts`.

`detectPageLanguage` builds a fresh `PickerModel` per call (public API, used by tests and the spizhenko regression suite). `detectPageLanguageFromModel` accepts a pre-built model (used by `content.ts` and `apps/diagnostics` to avoid calling `findLanguagePickers` twice per tick).

## Boundaries & invariants

- **Pure model only.** Imports `@movar/lang-pickers/extract`, `/build-model`, `/detect-page-language`, and `/types`. It does NOT import the picker filter, overlays, curtains, i18n, or the page-mode singleton. See `../lang-pickers/AGENTS.md` for the full picker surface.
- **No content-tier signals enter this chain.** Body-text / per-node language detection (`@movar/lang-detect` `detectLanguageFromText`) lives at the `applyOnce` level. Feeding content-tier results here would collapse the two-layer architecture — redirect and content-filter must remain independent (see `../lang-detect/AGENTS.md`).
- **Sync only.** `detectPageLanguage` and `detectPageLanguageFromModel` are synchronous. The async engine boundary is in `content.ts`.

## Public API / entry points

All exports come from `src/index.ts` (barrel re-exporting `src/page-language.ts`):

| Export                        | Signature summary                                                             |
| ----------------------------- | ----------------------------------------------------------------------------- |
| `detectPageLanguage`          | `(doc?, loc?) → LanguageCode \| null` — full chain, builds model internally   |
| `detectPageLanguageFromModel` | `(model, doc?, loc?) → LanguageCode \| null` — full chain, model pre-supplied |
| `languageFromHtmlLang`        | `(doc) → LanguageCode \| null`                                                |
| `languageFromSubdomain`       | `(hostname) → LanguageCode \| null`                                           |
| `languageFromPathSegments`    | `(pathname) → LanguageCode \| null`                                           |
| `languageFromSelfHreflang`    | `(doc, href) → LanguageCode \| null`                                          |

## Layout

```
packages/page-language/
  src/
    page-language.ts      # all logic — tiers 1–5, both detect functions
    index.ts              # barrel re-export
    picker.detect.test.ts # full test suite (jsdom)
    test-setup.ts         # beforeEach: reset body/head/<html lang>
  package.json
  tsconfig.json           # extends ../../tsconfig.base.json
  vitest.config.ts        # environment: jsdom, setupFiles: test-setup.ts
  project.json            # nx targets: typecheck / lint / test
```

## Dependencies

| Package               | Why                                                                                                                                                          |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `@movar/lang-pickers` | Provides `findLanguagePickers`, `buildPickerModel`, `detectPickerActiveLanguage`, and `PickerModel` — the picker tier of the detection chain                 |
| `@movar/lang-detect`  | `normalizeBCP47` (html lang / hreflang) and `normalizeLanguageCode` (subdomain / path) — canonical language-code normalisation; also the `LanguageCode` type |
| `jsdom` (dev)         | Test environment for DOM-dependent detection functions                                                                                                       |

## Working on it

```sh
# from packages/page-language
pnpm typecheck
pnpm lint
pnpm test

# or via nx from repo root
nx run page-language:test
```

Tests live in `src/picker.detect.test.ts`. `test-setup.ts` resets `document.body`, `document.head`, and `<html lang>` before every test — DOM state must not leak between cases.

## Gotchas

- **`detectPageLanguageFromModel` vs `detectPageLanguage`:** pass a pre-built model from `content.ts` / diagnostics; never call `detectPageLanguage` in a hot path that already has a `PickerModel`.
- **`<html lang>` is tier 2, not tier 1.** Sites like `spizhenko.clinic` set `lang="ru"` on every locale. The picker's active marker is the reliable ground truth; `<html lang>` is only consulted when no picker is found.
- **Subdomain skips apex and two-label hosts.** `example.com` and `m.example.com` are ignored; only `ru.example.com` (≥3 labels) qualifies.
- **Path matching is strict.** `normalizeLanguageCode` does alias expansion (`ua` → `uk`) but requires an exact segment match — `/ru-return-warranty` returns `null` by design.
- **Body-text detection belongs in `applyOnce`, not here.** Do not add async detection or `detectLanguageFromText` calls to this package; that would violate the two-layer principle.
