# Language Detection — `@movar/lang-detect`

> Two detection stacks in one package: a cheap Cyrillic letter-signal heuristic (uk/ru/be/bg) plus a four-rung snippet classifier backed by BCP-47 code normalization — everything the rest of the monorepo needs to identify and act on a language signal.

## What it does

- **Cheap heuristic** (`detectCyrillicLanguage`, `isRussian`): single-pass regex count over distinctive Cyrillic letters (і/ї/є/ґ → uk; ы/ё → ru; ў → be; dense ъ → bg). Returns a `DetectionResult` with `language` and `ukScore`/`ruScore`. Used where performance matters most (content-script hot path).
- **Snippet classifier** (`classifyBySnippet`): four-rung ladder — (1) candidate-set-relative distinctive alphabet chars, (2a) function words, (2b) corpus-frequent words, (3) franc trigram backstop. Returns a `SnippetVerdict` with `language`, `margin`, and the deciding `rung`. Distinctiveness is always computed at runtime against the passed candidate set; nothing is pre-differenced.
- **Tier-7 engine orchestrator** (`detectLanguageFromText`, `ENGINES`): walks `[chromeAiEngine, francMinEngine]` in order, returns the first non-null result. chrome-ai (Gemini Nano, Chrome 138+) is opportunistic — never triggers a download; falls through to franc-min (always available, ~17 KB gz, 82 languages).
- **Shadow oracle** (`classifyDivergence`, `francOracle`): off-path comparison between the snippet classifier's verdict and a franc oracle, producing a `DivergenceKind` trichotomy (`confirm`/`contradict`/`abstain`). Used by the diagnostics dev-extension only — never ships in the published extension.
- **BCP-47 normalization** (`normalizeLanguageCode`, `normalizeBCP47`): ALIASES table maps URL slugs, hreflang values, localized picker text, and UA exonyms (e.g. `ua`→`uk`, `по-русски`→`ru`, `російська мова`→`ru`) to canonical ISO 639-1 codes. Two entry points: `normalizeLanguageCode` is strict exact-match (never splits on hyphens — safe for URL paths); `normalizeBCP47` additionally strips region/script suffixes (only for documented BCP-47 inputs like `<html lang>` or `hreflang`).
- **Profile registry** (`PROFILES`, `getProfiles`): declarative `LanguageProfile` records for uk/ru/be/en with alphabets, hand-curated function words, and generated frequent-word lists.

## Boundaries & invariants

- **Pure model** — no DOM imports, no i18n, no overlay logic.
- `detectCyrillicLanguage` never translates, never hides: it identifies only.
- `classifyBySnippet` returns `'unknown'` on ties or insufficient evidence; callers must treat `'unknown'` as "do not conceal".
- The shadow oracle (`classifyDivergence`) is diagnostic-only. It MUST NOT ship in the published extension even disabled — see `../../../apps/extension/` and the observability-separate-dev-extension memory note.
- `normalizeLanguageCode` MUST NOT be used on URL path segments that might contain language-prefixed slugs like `/ru-return-warranty`; use `normalizeBCP47` only on documented BCP-47 attributes.
- Consumers: `../lang-pickers/AGENTS.md`, `../page-content/AGENTS.md`, `../page-language/AGENTS.md`, and the diagnostics dev-extension.
- **Pitfall** — `classifyBySnippet` is count-based and provenance-blind: feeding it text that isn't the content's own language (host UI chrome, platform-translated titles) lets a few keep-language tokens outvote a short blocked-language body. Callers must hand it the content's own text only. See [`../../docs/pitfalls.md`](../../docs/pitfalls.md) §1.

## Public API / entry points

All exports are from `src/index.ts`:

- `CyrillicLanguage` — `'uk' | 'ru' | 'be' | 'bg' | 'unknown'`
- `DetectionResult` — `{ language: CyrillicLanguage; ukScore: number; ruScore: number }`
- `detectCyrillicLanguage(text): DetectionResult` — cheap letter-signal heuristic
- `isRussian(text): boolean` — convenience wrapper around `detectCyrillicLanguage`
- `DetectContext` — `{ maxChars?: number; signal?: AbortSignal }`
- `DetectedLanguage` — `{ language: LanguageCode; confidence: number; engine: string }`
- `LanguageDetectionEngine` — interface: `id`, `isAvailable()`, `detect()`
- `chromeAiEngine` / `createChromeAiEngine()` — Chrome LanguageDetector adapter singleton and factory
- `ENGINES` — live ordered roster `[chromeAiEngine, francMinEngine]`
- `detectLanguageFromText(text, ctx?): Promise<DetectedLanguage | null>` — orchestrator entry point
- `classifyBySnippet(text, candidates): SnippetVerdict` — multi-rung snippet classifier
- `francOracle(text, candidates): { language, margin } | null` — off-path franc call for shadow comparison
- `LanguageProfile` — `{ code, alphabet, words: { function, frequent }, iso6393? }`
- `SnippetVerdict` — `{ language, margin, rung: 1 | '2a' | '2b' | 3 | null }`
- `PROFILES` — registry of shipped profiles keyed by BCP-47 code (uk/ru/be/en)
- `getProfiles(codes): LanguageProfile[]` — resolves codes, skips unknowns
- `classifyDivergence(classifier, oracle, opts?): DivergenceKind` — shadow oracle comparison
- `DivergenceKind` — `'confirm' | 'contradict' | 'abstain'`
- `OracleVerdict` — `{ language: LanguageCode; margin: number }`
- `normalizeBCP47(input): LanguageCode | null` — BCP-47-aware (strips region suffix)
- `normalizeLanguageCode(input): LanguageCode | null` — strict exact-match only

## Layout

```
src/
  index.ts               — all exports; heuristic defined inline here
  engine.ts              — LanguageDetectionEngine / DetectContext / DetectedLanguage interfaces
  orchestrator.ts        — ENGINES roster + detectLanguageFromText / detectLanguageFromTextWith
  classify.ts            — classifyBySnippet, francOracle, distinctiveChars, SnippetVerdict
  profiles.ts            — PROFILES, getProfiles, LanguageProfile records (uk/ru/be/en)
  shadow.ts              — classifyDivergence, DivergenceKind, OracleVerdict
  lang-codes.ts          — ALIASES table, normalizeLanguageCode, normalizeBCP47
  frequent.generated.ts  — generated frequent-word lists (committed; do not edit by hand)
  engines/
    franc-min.ts         — franc-min adapter (always available; ISO 639-3 → BCP-47 map)
    chrome-ai.ts         — chrome-ai adapter (opportunistic; caches availability per session)
  *.test.ts              — co-located unit tests for each module
test/
  fixtures.ts            — shared LanguageFixture corpus (Cyrillic/Latin/other-script/mixed/edge)
  fixtures.test.ts       — corpus test for detectCyrillicLanguage (expectedCyrillicHeuristic)
  format-fixture-failure.ts — failure message formatter used by engine corpus tests
scripts/
  gen-word-profiles.mts  — fetches OpenSubtitles top-400 words → src/frequent.generated.ts
```

## Dependencies

- `franc-min` — trigram language detection (82 languages, ~17 KB gz); used in the franc-min engine adapter and as the rung-3/oracle backstop in `classify.ts`. No server calls — all on-device.

No `@movar/*` runtime dependencies: `@movar/lang-detect` now **defines** `LanguageCode` (in `lang-codes.ts`, re-exported from the index) and is a self-contained leaf.

Dev: `vitest ^4.1.7`, `@vitest/coverage-v8`, `eslint ^9`, `@movar/eslint-config`, `tsx` (for running the `.mts` codegen script).

## Working on it

```sh
# From the package directory or repo root:
pnpm --filter @movar/lang-detect typecheck
pnpm --filter @movar/lang-detect lint
pnpm --filter @movar/lang-detect test

# Or via nx:
nx run lang-detect:typecheck
nx run lang-detect:lint
nx run lang-detect:test

# Coverage (v8 provider, outputs text + lcov + json-summary):
pnpm --filter @movar/lang-detect exec vitest run --coverage

# Regenerate frequent.generated.ts (fetches from hermitdave/FrequencyWords, needs network):
pnpm --filter @movar/lang-detect gen:profiles
```

Test environment: `node` (no DOM). Tests use `globals: false` — import `describe/expect/it` explicitly. The `FIXTURES` corpus in `test/fixtures.ts` is shared across three test files: `test/fixtures.test.ts` (heuristic), `src/engines/franc-min.test.ts`, and `src/engines/chrome-ai.test.ts`.

## Gotchas

- **`normalizeLanguageCode` vs `normalizeBCP47`**: use the strict variant for URL path segments and free-text labels; use the BCP-47 variant only for `hreflang`/`<html lang>`/`data-locale` attributes. Using the wrong one on a URL slug like `/ru-return-warranty` will produce `'ru'` when it should produce `null`.
- **Frequent-word invariant**: `words.frequent` must contain no words carrying a globally unique character (rung 1 always fires first; such words are dead weight and waste the budget). The constraint is enforced by a test in `classify.test.ts` (`frequent lists carry no globally-unique characters`). The codegen script drops them automatically; hand-edited additions must respect this.
- **Belarusian has no OpenSubtitles coverage**: `BE_FREQUENT` in `profiles.ts` is hand-curated. The codegen script only generates lists for uk/ru/en.
- **chrome-ai cache lifetime**: `chromeAiEngine` caches availability/session state for the content-script lifetime. Tests that need cold state should instantiate a fresh engine with `createChromeAiEngine()`.
- **`franc` rung 3 requires ≥2 candidates with `iso6393`**: synthetic test profiles that omit `iso6393` silently skip rung 3. This is load-bearing for the test in `classify.test.ts` that verifies the skip.
- **`detectLanguageFromTextWith` is the testable dispatcher**: it accepts an arbitrary engine array, avoiding `vi.mock`. The public `detectLanguageFromText` is a thin wrapper over it.
