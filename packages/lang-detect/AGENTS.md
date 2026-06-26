# Language Detection — `@movar/lang-detect`

> Two detection stacks in one package: a cheap Cyrillic letter-signal heuristic (uk/ru/be/bg) plus a four-rung snippet classifier backed by BCP-47 code normalization — everything the rest of the monorepo needs to identify and act on a language signal.

## What it does

- **Cheap heuristic** (`detectCyrillicLanguage`, `isRussian`): single-pass regex count over distinctive Cyrillic letters (і/ї/є/ґ → uk; ы/ё → ru; ў → be; dense ъ → bg). Returns a `DetectionResult` with `language` and `ukScore`/`ruScore`. Used where performance matters most (content-script hot path).
- **Snippet classifier** (`classifyBySnippet`): four-rung ladder — (1) candidate-set-relative distinctive alphabet chars, (2a) function words, (2b) corpus-frequent words, (3) franc trigram backstop. Returns a `SnippetVerdict` with `language`, `margin`, and the deciding `rung`. Distinctiveness is always computed at runtime against the passed candidate set; nothing is pre-differenced.
- **Tier-7 engine orchestrator** (`detectLanguageFromText`, `ENGINES`): walks `[chromeAiEngine, francEngine]` in order, returns the first non-null result. chrome-ai (Gemini Nano, Chrome 138+) is opportunistic — never triggers a download; falls through to franc (always available, ~170 KB, 187 languages).
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

Two entry points, per the `exports` map in `package.json`. The main barrel
`@movar/lang-detect` (`src/index.ts`) is deliberately **franc-free** — importing
it never pulls franc's ~170 KB trigram tables. The franc-pulling exports live
behind the opt-in `@movar/lang-detect/franc` subpath (`src/franc.ts`).

### Main barrel — `@movar/lang-detect` (`src/index.ts`)

- `CyrillicLanguage` — `'uk' | 'ru' | 'be' | 'bg' | 'unknown'`
- `DetectionResult` — `{ language: CyrillicLanguage; ukScore: number; ruScore: number }`
- `detectCyrillicLanguage(text): DetectionResult` — cheap letter-signal heuristic
- `isRussian(text): boolean` — convenience wrapper around `detectCyrillicLanguage`
- `DetectContext` — `{ maxChars?: number; signal?: AbortSignal }`
- `DetectedLanguage` — `{ language: LanguageCode; confidence: number; engine: string }`
- `LanguageDetectionEngine` — interface: `id`, `isAvailable()`, `detect()`
- `detectLanguageFromTextWith(engines, text, ctx?): Promise<DetectedLanguage | null>` — engine-agnostic dispatcher; caller supplies the roster (franc-free)
- `chromeAiEngine` / `createChromeAiEngine()` — opportunistic chrome-ai engine singleton + factory (never triggers a model download)
- `classifyBySnippet(text, candidates, rung3?): SnippetVerdict` — multi-rung snippet classifier (franc-free core; rung 3 fires only when a `Rung3Resolver` is injected)
- `LanguageProfile` — `{ code, alphabet, words: { function, frequent }, iso6393? }`
- `Rung3Resolver` — `(text, scoped) => SnippetVerdict | null` — injectable rung-3 backstop seam (the franc implementation lives on the `/franc` subpath)
- `SnippetVerdict` — `{ language, margin, rung: 1 | '2a' | '2b' | 3 | null }`
- `PROFILES` — registry of shipped profiles keyed by BCP-47 code (uk/ru/be/en)
- `getProfiles(codes): LanguageProfile[]` — resolves codes, skips unknowns
- `classifyDivergence(classifier, oracle, opts?): DivergenceKind` — shadow oracle comparison
- `DivergenceKind` — `'confirm' | 'contradict' | 'abstain'`
- `OracleVerdict` — `{ language: LanguageCode; margin: number }`
- `normalizeBCP47(input): LanguageCode | null` — BCP-47-aware (strips region suffix)
- `normalizeLanguageCode(input): LanguageCode | null` — strict exact-match only
- `LanguageCode` — canonical ISO 639-1 code union (defined in `lang-codes.ts`, re-exported here)

### `/franc` subpath — `@movar/lang-detect/franc` (`src/franc.ts`)

Importing anything here statically pulls `franc`. For the consumers that genuinely
need franc in-process — the default roster, the extension's background worker,
diagnostics, tests.

- `ENGINES` — live ordered roster `[chromeAiEngine, francEngine]`
- `detectLanguageFromText(text, ctx?): Promise<DetectedLanguage | null>` — batteries-included entry point (`detectLanguageFromTextWith` bound to `ENGINES`)
- `francEngine` — franc `LanguageDetectionEngine` (lazy-loads franc-core on first `detect()`)
- `warmFranc(): Promise<void>` — force the franc core to load now (cold-start mitigation)
- `detectWithFranc(text, ctx): DetectedLanguage | null` — synchronous franc detect body (ISO 639-3 → BCP-47)
- `FRANC_ENGINE_ID` — `'franc'` engine-id constant
- `francOracle(text, candidates): { language, margin } | null` — off-path franc call for shadow comparison
- `francRung3Resolver: Rung3Resolver` — the franc rung-3 backstop injected into `classifyBySnippet`
- `francResidualVerdict(text, candidates): SnippetVerdict | null` — full rung-3 verdict over unscoped candidates (scopes to the dominant script, then applies the franc backstop)

## Layout

```
src/
  index.ts               — main (franc-free) barrel; Cyrillic heuristic defined inline here
  franc.ts               — opt-in @movar/lang-detect/franc barrel — re-exports the franc-pulling surface (engine, oracle, rung-3 resolver, default roster)
  engine.ts              — LanguageDetectionEngine / DetectContext / DetectedLanguage interfaces
  orchestrator.ts        — detectLanguageFromTextWith — engine-agnostic dispatcher (imports no engines; franc-free)
  default-roster.ts      — ENGINES roster + detectLanguageFromText (imports francEngine from ./engines/franc)
  classify.ts            — classifyBySnippet, distinctiveChars, SnippetVerdict (franc-free core)
  classify-franc.ts      — francRung3Resolver, francOracle, francResidualVerdict (franc-backed)
  profiles.ts            — PROFILES, getProfiles, LanguageProfile records (uk/ru/be/en)
  shadow.ts              — classifyDivergence, DivergenceKind, OracleVerdict
  lang-codes.ts          — ALIASES table, normalizeLanguageCode, normalizeBCP47
  engines/
    franc.ts             — franc engine wrapper (always available; lazy-loads franc-core)
    franc-core.ts        — franc detect body + ISO 639-3 → BCP-47 map
    chrome-ai.ts         — chrome-ai adapter (opportunistic; caches availability per session)
  *.test.ts              — co-located unit tests for each module
test/
  fixtures.ts            — shared LanguageFixture corpus (Cyrillic/Latin/other-script/mixed/edge)
  fixtures.test.ts       — corpus test for detectCyrillicLanguage (expectedCyrillicHeuristic)
  format-fixture-failure.ts — failure message formatter used by engine corpus tests
```

## Dependencies

- `franc` — trigram language detection (187 languages, ~170 KB); used in the franc engine adapter and as the rung-3/oracle backstop in `classify-franc.ts`. No server calls — all on-device.

- `langtell` — the shared OSS language-detection core. `@movar/lang-detect` re-exports the classifier (`classifyBySnippet` + rungs), the detection profiles, and `LanguageCode` from it; what stays movar-only is the layer langtell deliberately lacks — the Cyrillic letter-heuristic (`index.ts`), the franc *engine*/orchestrator, the shadow oracle, and (for now) BCP-47 normalization.

No `@movar/*` runtime dependencies.

Dev: `vitest ^4.1.7`, `@vitest/coverage-v8`, `eslint ^9`, `@movar/eslint-config`.

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
```

Test environment: `node` (no DOM). Tests use `globals: false` — import `describe/expect/it` explicitly. The `FIXTURES` corpus in `test/fixtures.ts` is shared across three test files: `test/fixtures.test.ts` (heuristic), `src/engines/franc.test.ts`, and `src/engines/chrome-ai.test.ts`.

## Gotchas

- **`normalizeLanguageCode` vs `normalizeBCP47`**: use the strict variant for URL path segments and free-text labels; use the BCP-47 variant only for `hreflang`/`<html lang>`/`data-locale` attributes. Using the wrong one on a URL slug like `/ru-return-warranty` will produce `'ru'` when it should produce `null`.
- **Frequent-word invariant**: `words.frequent` must contain no words carrying a globally unique character (rung 1 always fires first; such words are dead weight and waste the budget). The constraint is enforced by a test in `classify.test.ts` (`frequent lists carry no globally-unique characters`). The codegen script drops them automatically; hand-edited additions must respect this.
- **Belarusian has no OpenSubtitles coverage**: `BE_FREQUENT` in `profiles.ts` is hand-curated. The codegen script only generates lists for uk/ru/en.
- **chrome-ai cache lifetime**: `chromeAiEngine` caches availability/session state for the content-script lifetime. Tests that need cold state should instantiate a fresh engine with `createChromeAiEngine()`.
- **`franc` rung 3 requires ≥2 candidates with `iso6393`**: synthetic test profiles that omit `iso6393` silently skip rung 3. This is load-bearing for the test in `classify.test.ts` that verifies the skip.
- **`detectLanguageFromTextWith` is the testable dispatcher**: it accepts an arbitrary engine array, avoiding `vi.mock`. The public `detectLanguageFromText` is a thin wrapper over it.
