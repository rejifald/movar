---
type: adr
id: on-device-language-detection
status: proposed
date: 2026-06-02
summary: Add an engine-based body-text language detection tier to fill the gap where `page-language.ts`'s cheap signals (post-refactor) return null. Two engines — Chrome's opportunistic `LanguageDetector` API (Gemini Nano) and `franc-min` (trigram, cross-browser) — live as static-imported modules in the content script, dispatched through a tiny ordered-array orchestrator behind `@movar/lang-detect`. `detectCyrillicLanguage` stays sync for per-node snippet detection inside `page-content/`. Sequenced after PR 4 of [page-content-and-lang-pickers-refactor.md](./page-content-and-lang-pickers-refactor.md).
---

# On-device page-language detection

## Sequencing

This ADR targets the post-refactor file layout from [page-content-and-lang-pickers-refactor.md](./page-content-and-lang-pickers-refactor.md). Specifically, it depends on **PR 4** of that refactor having landed: `page-language.ts` as the new home for `detectPageLanguage`, `PickerModel` as its input, and `lang-pickers/detect-page-language.ts:detectPickerActiveLanguage` as the active-picker tier.

If this ADR's implementation starts before PR 4 lands, the file paths and `detectPageLanguage` signature below need translation to the pre-refactor structure (everything inside [picker.ts](../apps/extension/src/lib/picker.ts)). The decisions are unchanged either way.

## Context

After [PR 4 of the refactor](./page-content-and-lang-pickers-refactor.md), `detectPageLanguage` lives in `apps/extension/src/lib/page-language.ts` and consumes a `PickerModel` built once per `applyOnce` tick. It composes **six** signals, in order:

1. **`detectPickerActiveLanguage(model)`** — the active picker entry; same client code that renders the page also marks one picker entry as active. Multi-picker votes must agree (per [`languageFromActivePicker`](../apps/extension/src/lib/picker.ts:1189)).
2. **`<html lang>`** — author-declared BCP-47.
3. **Subdomain** — `ru.example.com`, `ua.example.com` (3+ labels only).
4. **Path segments** — strict-matching language aliases.
5. **Self-targeted hreflang** — `<link rel="alternate" hreflang="X" href="THIS URL">`.
6. **Body text via `detectCyrillicLanguage`** — the letter-signal heuristic in [@movar/lang-detect](../packages/lang-detect/src/index.ts), used as a Cyrillic-only fallback. This is the tier this ADR replaces.

When all six return null, the switching pipeline in [content.ts:447](../apps/extension/src/entrypoints/content.ts) bails — see the guard at [content.ts:371](../apps/extension/src/entrypoints/content.ts).

The gap we still don't cover:

- **Non-Cyrillic body text with no markup signals.** Tier 6 only detects Cyrillic. A `de` / `fr` / `pl` / `tr` page with no `<html lang>`, no path segment, no subdomain, no active picker, no self-targeted hreflang gets `null` page-language. Movar's switching pipeline silently skips it across the whole catalogue of non-Cyrillic sites.

The priority-rank model from [priority-driven-switching.md](./priority-driven-switching.md) makes this gap bite harder: under that model, every page where `currentRank > 0` needs a confident `pageLang` to decide whether a rank-better alternative exists.

## Decision

Replace tier 6 (`languageFromBodyText` inside `page-language.ts`) with an engine-based body-text detection tier that handles all body-text languages, not just Cyrillic. The tier lives outside `detectPageLanguage` — `detectPageLanguage` shrinks to its five sync signals and stays sync. `applyOnce` in the content script orchestrates the sync → async chain. Per the refactor's wiring win, `applyOnce` already builds a `PickerModel` once per tick and passes it to `detectPageLanguage`:

```ts
// apps/extension/src/entrypoints/content.ts (post-refactor + this ADR)
const pickerModel = buildPickerModel(pickers, location.href);
let pageLang = detectPageLanguage(pickerModel, document, location); // sync, tiers 1-5
if (!pageLang) {
  const sample = sampleVisibleText(document);
  const detected = await detectLanguageFromText(sample, { signal: AbortSignal.timeout(150) });
  pageLang = detected?.language ?? null;
}
```

`page-language.ts` itself loses its `languageFromBodyText` helper — that tier is gone, replaced by the orchestrator call at the `applyOnce` level. The other five tiers stay inside `page-language.ts` unchanged.

The engine roster:

- **`chrome-ai`** — wraps the browser's [`LanguageDetector` API](https://developer.chrome.com/docs/ai/language-detection) (Gemini Nano, on-device). Chrome 138+ / Edge. **Opportunistic**: `isAvailable()` returns true only when `LanguageDetector.availability() === 'available'`. Never triggers the model download — users without the model get only the franc-min path.
- **`franc-min`** — wraps [`franc-min`](https://github.com/wooorm/franc) (trigram, 82 languages, MIT, ~17 KB gz). Cross-browser, always available.

Both engines live as static imports in the content script. Engines are an ordered constant array; the orchestrator iterates and returns the first non-null result. No registry API, no IPC, no background worker.

`detectCyrillicLanguage` stays sync, used only for per-node snippet detection inside `page-content/` (the post-refactor home for the per-card content filter — `applyContentFilter` iterates over `PageContentModel.nodes` and calls `detectCyrillicLanguage(node.text)` per node). It is genuinely the right tool for short / mixed-script text where trigram detectors fail — this is a positive choice for accuracy AND per-applyOnce performance, not a punt.

## Engine contract

```ts
// packages/lang-detect/src/engine.ts

export type LanguageCode = string; // BCP-47, e.g. 'uk', 'ru', 'en', 'pt-BR'

export interface DetectedLanguage {
  language: LanguageCode;
  /** 0..1. Engines decide internally whether to return null vs result based on
   *  their own scoring. confidence is informational / telemetry only — the
   *  orchestrator does not filter by it. */
  confidence: number;
  /** Engine that produced this result. Surfaced via CorrectionEvent.detectionEngine. */
  engine: string;
}

export interface DetectContext {
  /** Cap text length sent to the engine. Default 2000 chars. */
  maxChars?: number;
  /** AbortSignal — orchestrator wires its 150 ms timeout here. */
  signal?: AbortSignal;
}

export interface LanguageDetectionEngine {
  /** Stable id used in telemetry and DetectedLanguage.engine. */
  readonly id: string;
  /** Whether this engine can run right now. Engines cache the result for the
   *  content-script lifetime themselves; the orchestrator does not. */
  isAvailable(): boolean | Promise<boolean>;
  /** Returns null if the engine isn't confident enough in its own result.
   *  Throwing is also fine and behaves identically — orchestrator falls
   *  through to the next engine. */
  detect(text: string, ctx: DetectContext): Promise<DetectedLanguage | null>;
}
```

Engines are responsible for their own internal state (chrome-ai's `LanguageDetector` session is a module-scoped singleton, lazily initialized on first detect; franc-min's trigram tables are in-module data). Engines are responsible for their own confidence threshold — there is no orchestrator-level floor because engine scoring scales aren't comparable.

## Orchestrator

```ts
// packages/lang-detect/src/index.ts

import { chromeAiEngine } from './engines/chrome-ai';
import { francMinEngine } from './engines/franc-min';

const ENGINES: readonly LanguageDetectionEngine[] = [chromeAiEngine, francMinEngine];

export async function detectLanguageFromText(
  text: string,
  ctx: DetectContext = {},
): Promise<DetectedLanguage | null> {
  for (const engine of ENGINES) {
    if (!(await engine.isAvailable())) continue;
    try {
      const result = await engine.detect(text, ctx);
      if (result) return result;
    } catch {
      // fall through to the next engine
    }
  }
  return null;
}
```

That is the entire orchestrator API. No `registerEngine`, no `unregisterEngine`, no `prefer` parameter. Adding a new engine is: write a module that implements `LanguageDetectionEngine`, append it to the `ENGINES` array, ship.

## Sampler

```ts
// apps/extension/src/lib/page-text.ts
export function sampleVisibleText(doc: Document = document): string {
  const root = doc.querySelector('main, article, [role="main"]') ?? doc.body;
  return (root.innerText ?? '').trim().slice(0, 2000);
}
```

Landmark-aware: picks `<main>` / `<article>` / `role="main"` when present, falls back to body. `innerText` skips `display: none` / `visibility: hidden` (browser-native), so it's automatically cleaner than `textContent`. Cost: one `querySelector` + one synchronous reflow per call.

## Concurrency model

`detectPageLanguage` stays sync. `detectLanguageFromText` is async but bounded by a 150 ms timeout wired through the AbortSignal:

```ts
await detectLanguageFromText(sample, { signal: AbortSignal.timeout(150) });
```

Adding `await` to `applyOnce` introduces a concurrency hazard — the existing MutationObserver at [content.ts:576-583](../apps/extension/src/entrypoints/content.ts) debounces 150 ms then calls `applyOnce`, and without an in-flight guard a slow tier-7 call would let a second `applyOnce` race the first. Fix: add an in-flight guard at the call site.

```ts
let applying = false;
async function applyOnceGuarded(settings: MovarSettings): Promise<boolean> {
  if (applying) return false;
  applying = true;
  try {
    return await applyOnce(settings);
  } finally {
    applying = false;
  }
}
```

Dropped MutationObserver ticks aren't lost — the next mutation triggers a fresh apply with the latest DOM. A burst of fast mutations collapses into one apply, which is the desired property.

**In-flight engine init continues past timeout.** The 150 ms timeout aborts the orchestrator's await, not the in-flight engine work. chrome-ai's first `LanguageDetector.create()` call may take ~100 ms - 2 s; if it doesn't finish in time the orchestrator returns null, but the session continues warming inside its module-scoped singleton. The next `applyOnce` tick (~150-300 ms later on most pages, triggered by ambient mutations) reuses the warm session.

On a **fully-static page** (no mutations after DOMContentLoaded), the second tick may not fire — the first cold detection might be the only tier-7 attempt and could return null. Accepted v1 limitation for a niche case; modern pages reliably trigger ambient mutations within seconds.

## Bundle & cost

| Cost site                                                | Magnitude                                 | When                                                                             |
| -------------------------------------------------------- | ----------------------------------------- | -------------------------------------------------------------------------------- |
| `franc-min` parse on content-script eval                 | ~5-15 ms cold, ~2-3 ms warm V8 code cache | Every tab navigation; V8 caches bytecode across tabs in the same browser session |
| `chrome-ai` wrapper parse                                | ~0 ms                                     | Static-imported but trivial; just a `globalThis.LanguageDetector` check          |
| `chrome-ai` session warmup (`LanguageDetector.create()`) | ~100 ms - 2 s on first call               | Per content-script lifetime, only when tier-7 fires                              |
| `chrome-ai` detect (warm)                                | ~10-50 ms                                 | Per tier-7 call when chrome-ai is the responding engine                          |
| `franc-min` detect                                       | ~1-3 ms                                   | Per tier-7 call when franc-min is the responding engine                          |
| `sampleVisibleText` (innerText forces reflow)            | ~1-5 ms                                   | Per tier-7 call                                                                  |

Per-tab content-script overhead: ~17 KB gz added to the existing bundle. Comparable to lightweight analytics tags (jQuery: ~30 KB / 20 ms parse; GTM: 100 ms+).

### Cyrillic-body-text-without-markup regression

Today's tier 6 (`detectCyrillicLanguage` on body text) runs in <1 ms. After this change, Cyrillic body-text pages without markup signals will flow through chrome-ai (~10-50 ms warm) or franc-min (~1-3 ms detect). Slower than today, still well under the 150 ms budget, accepted in exchange for one unified body-text detection path and accuracy on non-Cyrillic content.

## Telemetry

Extend [`CorrectionEvent`](../packages/shared/src/index.ts) with one optional field:

```ts
export interface CorrectionEvent {
  timestamp: number;
  domain: string;
  mechanism: CorrectionMechanism;
  fromLang: LanguageCode;
  toLang: LanguageCode;
  /** Engine that produced the page-language signal that drove this correction.
   *  Absent when the correction was driven by a sync-tier signal (tier 1-5). */
  detectionEngine?: string;
}
```

No new storage shape, no orchestrator hook. When `applyOnce` records a correction whose `pageLang` came from `detectLanguageFromText`, `DetectedLanguage.engine` flows through. The existing dashboard can group corrections by engine for free.

Tier-7 _failures_ (engine returned null, timeout) are not recorded in v1 — see [Future improvements](#future-improvements) for the case for richer telemetry.

## Test strategy

Engines tested at the import boundary (`vi.mock` on the engine modules) since there's no runtime registry to inject fakes through.

### Test corpus

[`packages/lang-detect/test/fixtures.ts`](../packages/lang-detect/test/fixtures.ts) defines a typed corpus of language-detection cases that ALL detectors (the existing `detectCyrillicLanguage` heuristic and future tier-7 engines) consume from a single source of truth. Each fixture carries two expected outcomes — `expectedEngineLanguage` (BCP-47, the human-perceived language; consumed by chrome-ai / franc-min tests) and `expectedCyrillicHeuristic` (what the existing heuristic returns; consumed by [`fixtures.test.ts`](../packages/lang-detect/test/fixtures.test.ts) today). The two scores diverge by design — see decision 13 on the snippet/page split.

v1 corpus categories:

- **Cyrillic singletons** — pure `uk` / `ru` / `be` / `bg` paragraphs
- **Cyrillic boundary cases** — UA with distinctives only, RU with no `ы`/`ё`/`ъ` (fallback path), too-short-for-fallback
- **Latin singletons** — `en` / `de` / `fr` / `es` / `pt` / `pl` / `tr` / `it` with appropriate diacritics
- **Other-script singletons** — `el` / `ar` / `he` / `zh` / `ja` / `ko`
- **Mixed-language with majority** — including the user-specified `uk-with-ru-citation` (Ukrainian article with a Russian quoted citation — overall still Ukrainian) and the symmetric `ru-with-uk-citation`, plus `en-with-de-citation`, `de-with-en-tech-terms`
- **Mixed-script** — `en-with-cyrillic-name`, `uk-with-latin-brand-names` (minority script tokens shouldn't tip the verdict)
- **Edge cases** — empty, whitespace, single character, numbers, punctuation, emoji-in-English, text longer than the 2000-char sampler cap

New engines added to the orchestrator import the corpus and run their own pass (`fixtures.chrome-ai.test.ts`, `fixtures.franc-min.test.ts` — naming convention). Regression cases — any real-world miss reported by users or telemetry — land here.

**Unit tests** (`@movar/lang-detect`):

- Orchestrator: assert iteration order, fall-through on `isAvailable() === false`, fall-through on engine `throw`, fall-through on engine null, AbortSignal propagation.
- `chrome-ai` engine: stub `globalThis.LanguageDetector` with a fake; assert correct translation of `availability()` states to `isAvailable()` results, session reuse across calls, error path. Plus the corpus run against the stub.
- `franc-min` engine: corpus run; deterministic per-fixture assertions.
- Sampler: landmark precedence (`main` > `article` > `[role=main]` > `body`), 2000-char cap, `innerText` behavior with hidden elements.
- `detectCyrillicLanguage`: existing test suite (`src/index.test.ts`) plus the corpus pass in `test/fixtures.test.ts`.

**Integration tests** (`apps/extension`):

- `applyOnceGuarded` with `vi.mock('@movar/lang-detect')` returning a controlled result: assert tier-7 fires only when sync `detectPageLanguage` returns null, in-flight guard drops overlapping ticks, AbortSignal timeout propagates.
- Existing detection tests (today: `picker.detect.test.ts` and `spizhenko-regression.test.ts`; post-refactor: their PR-3-moved counterparts under `lang-pickers/` and `page-language.test.ts`): update the body-text-fallback `describe` block (today at [`picker.detect.test.ts:69`](../apps/extension/src/lib/picker.detect.test.ts:69)) to move to the lang-detect orchestrator suite. Tier 6 no longer lives in `detectPageLanguage`.

**Playwright** (Chrome only): on a synthetic page with `<html lang>` removed, drive Movar through a tier-7 hit. Gate the spec on `'LanguageDetector' in self` so other targets skip without failing.

**Cross-browser smoke tests** (manual, pre-release): visit a curated set of pages with no `<html lang>` on each target. Verify tier-7 fires, applyOnce uses the result, no console errors. Targets:

- Chrome (latest stable)
- Edge (latest stable)
- Firefox (140+ — the floor pinned in [wxt.config.ts](../apps/extension/wxt.config.ts))
- Safari macOS (current)
- Safari iOS (current — see [deployment-checklist.md](../deployment-checklist.md) for the static-import-specific check)

## Risks

- **chrome-ai session cold-start latency** (~100 ms - 2 s on first `LanguageDetector.create()`). Mitigated by the in-flight-init-continues-past-timeout pattern. First detection may return null; next tick succeeds. Acceptable for a tier that fires only on null-markup pages.
- **iOS Safari MV3 static-import** is unvalidated. See [deployment-checklist.md](../deployment-checklist.md) for the gating smoke test before any v1 release.
- **Mixed-language pages.** A Russian comment thread under an English article. `sampleVisibleText` takes the longest landmark, then trigram weighting favors the article body. Per-card filtering inside the page still runs through `detectCyrillicLanguage` (unchanged).
- **V8 code-cache busting** (browser update, extension update) reverts the `franc-min` parse cost to ~15 ms once per session until the cache warms again.
- **Fully-static pages with cold chrome-ai session** may miss the switch on first visit (no MutationObserver re-tick to retry after timeout). Niche; accepted.
- **Privacy framing.** `LanguageDetector` runs on-device; no text leaves the browser. Verify the store-listing privacy copy mirrors this language so reviewers don't flag "uses AI" as remote inference.

## Considered alternatives

- **Background-worker engine hosting.** Would amortize franc-min parse across all tabs in a session. Rejected: MV3 service worker tear-down on Chromium (~30 s idle) re-introduces a cold-worker cost; static pages with cold workers risked silent first-detection failures (no MutationObserver re-tick to retry); IPC layer adds protocol complexity. V8 code caching already amortizes parse across tabs in active sessions.
- **`chrome.offscreen` API.** Chromium-only persistent document; would survive worker tear-down. Adds per-target placement logic for marginal v1 benefit.
- **Dynamic `import()` of franc-min.** Would defer parse cost until first tier-7 hit. Punted: MV3 content-script dynamic-import support + `web_accessible_resources` declarations not validated across Chrome / Firefox / Safari macOS / Safari iOS / Edge. Worth re-evaluating in a future ADR once a smoke-test budget exists.
- **Build-time engine stripping per target.** chrome-ai wrapper is 0 KB regardless; franc-min is needed everywhere; no v1 engine has differential cost worth stripping for.
- **Multi-engine consensus / voting.** Would catch cases where chrome-ai and franc-min disagree. Doubles per-detect cost. No data today that single-engine errors matter.
- **Registry API with `registerEngine` / `unregisterEngine`.** Useful when engines need runtime swappability (user-facing setting, A/B testing). v1 has two engines known at compile time; a constant array is sufficient.
- **franc / franc-all (full).** 187 languages vs. franc-min's 82. Extra languages are obscure (small-language scripts Movar doesn't currently target). Higher bundle cost; same parse-cost shape. Re-evaluate if Movar adds support languages beyond franc-min's coverage.

## Future improvements

Not committed; surfaced for future-us.

- **ELD ([nito-ELD](https://github.com/nitotm/efficient-language-detector-js))** — claims ~99% accuracy on tweets / sentences vs. franc-min's ~89%, 60 languages, Apache-2.0, ~264 KB gz. Out of scope for now; revisit if telemetry shows franc-min returning null or wrong language on a meaningful share of pages where the user expected a switch.
- **`@mozilla/readability`** — Firefox Reader View extraction algorithm, ~11.2 KB gz. Could improve sampler quality on legacy / forum / SPA pages with bad semantic markup. Out of scope for now; revisit if detection mis-attribution is traceable to chrome-text contamination.
- **chrome-ai-in-worker** — would share the `LanguageDetector` session across tabs (today's session is per content-script lifetime). Needs validation that Chrome AI APIs work inside MV3 service workers.
- **Wrong-`<html lang>` detection** — re-detect even when sync tiers respond, override when the engine confidently disagrees. v1 only fires tier-7 on null. Revisit on user reports of mis-detected pages with wrong markup that have no active picker.
- **User-facing engine setting** — "Detection engine: Auto / Browser AI / franc." Trivial to wire (orchestrator gains a `prefer` parameter), valuable only when there's signal that users want it.
- **Richer telemetry** — per-engine attempt counts, latency, failure modes. v1 records `detectionEngine` only on successful corrections.
- **Snippet / page unification** — currently `detectCyrillicLanguage` (per-card snippets) and engines (page body-text) are separate paths. Genuine architectural split today; long-term, batching N snippet texts into one engine call could close the gap if needed.
- **chrome-ai model download triggering** — today chrome-ai is opportunistic (never triggers download). Future setting could let power users opt into the download for the accuracy gain.
- **Dynamic `import()` of franc-min** — see Considered alternatives; defers per-tab parse cost to first tier-7 hit once MV3 dynamic-import is validated across targets.

## Open questions

- **chrome-ai availability `'downloadable'` semantics.** Today we treat it as unavailable. If Chrome ever begins downloading the model in the background on its own initiative (e.g., because another feature requested it), our engine becomes available silently. Acceptable, but worth a comment in the engine module.

## Out of scope

- Translation (`Translator` API). Adjacent, same Nano stack, different ADR.
- Per-snippet (per-card text) detection — stays on `detectCyrillicLanguage` for short / mixed-script accuracy AND per-applyOnce performance.
- A "Detected as X — switch?" UI prompt. Tier-7 is silent and load-bearing inside the rank pipeline.
