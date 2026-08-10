---
type: adr
id: no-llm-language-detection
status: accepted
date: 2026-08-10
summary: Movar will not use a general-purpose on-device LLM (Chrome's Prompt API / Gemini Nano, and by extension `Summarizer` / `Writer` / `Rewriter` / `Proofreader`) to decide what language content is in. Measured against a 422-sample independent corpus, Gemini Nano scores 69.7% against the shipped `LanguageDetector → franc` cascade's 92.7%, and collapses to 39.3% / 20.5% on pages whose subject is the other country — concealing 66% of Ukrainian pages that discuss Russia and passing 56% of Russian pages that discuss Ukraine. The failure is topic contamination: a general-purpose model conditions on meaning, and language identification must condition only on form. Prompt engineering and few-shot exemplars made it worse, not better. It also misses the 150 ms tier-7 budget by 3–8× and costs ~0.53 CPU-seconds per page against ~0.02. Complements [no-content-translation.md](./no-content-translation.md) (same built-in-AI stack, different refusal) and constrains the engine roster in [on-device-language-detection.md](./on-device-language-detection.md).
---

# No general-purpose LLM for language detection

## Context

Movar already taps the browser's built-in AI stack. [on-device-language-detection.md](./on-device-language-detection.md)
adopted Chrome's `LanguageDetector` — a **small task-specific** on-device model — as
tier-7 engine #1, opportunistically (never triggers a download), with `franc` in the
background worker as the cross-browser fallback. [no-content-translation.md](./no-content-translation.md)
rejected the `Translator` API from the same stack on ethical grounds.

Both of those ADRs deliberately note that the model they discuss is "**not Gemini Nano**".
That left the general-purpose tier undecided: Chrome also ships the **Prompt API**
(`LanguageModel`, backed by Gemini Nano), available in extensions since Chrome 138 with no
manifest permission, in the service worker / popup / side panel — **not** in content
scripts. The proposal was the natural one: use it opportunistically, exactly as the
`LanguageDetector` engine is used, on the theory that a real language model would beat a
trigram counter on the short, ambiguous text where movar is weakest.

This ADR settles that with measurements rather than argument.

## Decision

**Movar does not use a general-purpose LLM to decide what language content is in.** Not as
a tier-7 engine, not as a tie-breaker, not as a last-resort tier behind the existing
cascade, not behind a power-user flag. The engine roster stays `[chromeAiEngine,
backgroundFrancEngine]`.

The decision is scoped to **language judgement**, and stated as a principle so it survives
the next model generation:

> Language identification conditions on **form** — orthography, diacritics, morphology,
> trigram distribution. A general-purpose model conditions on **meaning**. Movar's entire
> subject domain is Ukraine and Russia, so a detector that leaks topic into its verdict is
> wrong on precisely the pages movar exists to act on.

Not decided here: using an LLM for _structural_ questions that carry no language verdict
(e.g. "is this DOM subtree a language switcher?"). That is a different task with a
different failure surface and needs its own spike. See [Out of scope](#out-of-scope).

## Evidence

Environment: Chrome 151.0.7922.108, macOS, Apple M4 Pro / 64 GB. Gemini Nano weights
resident locally (`OptGuideOnDeviceModel/2025.8.8.1141/weights.bin`, **4.0 GB**);
`LanguageModel.availability()` → `available`.

### Corpus

The repo's own 38 fixtures were **rejected as the primary corpus**: they are hand-authored
_and_ the incumbent engines were tuned against them, so they flatter the incumbents (franc
scores 94.7% there against 73.2% on the independent corpus). Instead, 422 samples:

| stratum          | n   | median chars | source                                                                          | stands in for           |
| ---------------- | --- | ------------ | ------------------------------------------------------------------------------- | ----------------------- |
| `short`          | 219 | 32           | Tatoeba sentences (uk 60, ru 60, be 25, bg 25, en 25, pl 12, de 12)             | per-card / snippet text |
| `paragraph`      | 108 | 358          | Wikipedia intros, 7 language editions                                           | tier-7 page body        |
| `confound-para`  | 56  | 882          | ru.wikipedia articles **about Ukraine**; uk.wikipedia articles **about Russia** | the modal movar page    |
| `confound-short` | 39  | 76           | first sentence of the same confound articles                                    | the hardest real case   |

Ground truth = the Tatoeba label / the Wikipedia language edition. The confound strata are
the load-bearing design element: **language and subject matter point at different
countries**, which exposes any engine that conditions on meaning.

### Accuracy

Each engine replicates the shipped code exactly — `franc` is `detectWithFranc`, `ld` is
`LanguageDetector` wrapped as [`chrome-ai.ts`](../packages/lang-detect/src/engines/chrome-ai.ts)
wraps it (0.6 floor, `KNOWN_LANGUAGE_CODES`). Nano got a JSON-schema-constrained output and
a prompt that _explicitly_ instructed it to ignore subject matter.

| engine                  | ALL       | short | paragraph | confound-para | confound-short |
| ----------------------- | --------- | ----- | --------- | ------------- | -------------- |
| `heuristic` (langtell)  | 62.3%     | 50.2% | 64.8%     | 94.6%         | 76.9%          |
| `franc`                 | 73.2%     | 58.9% | 94.4%     | 92.9%         | 66.7%          |
| `ld`                    | 91.2%     | 89.5% | 99.1%     | 96.4%         | 71.8%          |
| **`cascade` (shipped)** | **92.7%** | 90.9% | 100.0%    | 98.2%         | 74.4%          |
| **`nano`**              | **69.7%** | 79.0% | 84.3%     | **39.3%**     | **20.5%**      |
| `cascade → nano`        | 93.1%     | 91.3% | 100.0%    | 98.2%         | 76.9%          |
| `nano → cascade`        | 74.2%     | 83.1% | 87.0%     | 50.0%         | 23.1%          |

Head-to-head against the shipped cascade, Nano is **uniquely right on 15 samples and
uniquely wrong on 112**. Its confusion pairs (count ≥2) are `uk→ru` 39, `ru→uk` 33,
`be→uk` 15, `be→ru` 5, `bg→ru` 3, `bg→uk` 2 — every single one inside movar's action
domain.

### Product harm

Movar acts on the ru/uk axis, and the two errors differ in consequence:

- **missedBlock** — truly `ru`, called `uk` → Russian content stays visible.
- **falseBlock** — truly `uk`, called `ru` → **Ukrainian content concealed, or redirected
  away from.** Worse than doing nothing at all.

| engine              | missedBlock (n=134) | falseBlock (n=137) | confound only: missed / false |
| ------------------- | ------------------- | ------------------ | ----------------------------- |
| `cascade` (shipped) | 5.2%                | 2.2%               | 15.6% / **0.0%**              |
| `ld`                | 3.7%                | 2.2%               | 11.1% / 0.0%                  |
| `franc`             | 10.4%               | 4.4%               | 17.8% / 2.0%                  |
| **`nano`**          | **24.6%**           | **28.5%**          | **55.6% / 66.0%**             |

**Nano conceals two thirds of Ukrainian pages that talk about Russia.** The shipped
cascade conceals none of them.

### Prompting is not the problem

The run above already used an anti-confound system prompt (_"IGNORE what the text is
about. A text about Ukraine may be written in Russian… The subject matter is
irrelevant"_) plus explicit uk/ru orthography cues. A second run added **four few-shot
exemplars, two of them the exact confound shape** (Russian prose about Kyiv → `ru`;
Ukrainian prose about Moscow → `uk`), authored so they appear nowhere in the corpus:

| confound stratum        | zero-shot | few-shot  |
| ----------------------- | --------- | --------- |
| `confound-para` (n=56)  | 39.3%     | **32.1%** |
| `confound-short` (n=39) | 20.5%     | **12.8%** |

Few-shot made it **worse**. Few-shot harm rates: missedBlock 75.6%, falseBlock 76.0%, with
a predicted distribution of 46 `uk` / 49 `ru` on a set that is 45 `ru` / 50 `uk` —
**statistically indistinguishable from a coin flip.** Constrained decoding
(`responseConstraint` with `enum: ['uk','ru','und']`) does not help either: it constrains
the output format, not the judgement. Verdicts are deterministic across repeats (3/3), so
none of this is sampling noise.

### There is no residual to serve

The only integration shape that could plausibly ship is "call Nano when the cheap engines
abstain." Measured:

- the shipped cascade abstains on **3 / 422 samples (0.7%)**
- Nano ventures an answer on 2 of those, and gets both right
- net accuracy change: **92.7% → 93.1%** (+2 samples)

Two samples, in exchange for a 4 GB model dependency.

### Cost: latency, compute, reach

|                                       | `franc`                 | `LanguageDetector` | Gemini Nano                               |
| ------------------------------------- | ----------------------- | ------------------ | ----------------------------------------- |
| p50 per detect (corpus)               | 0.13 ms                 | 0.6 ms             | **434 ms**                                |
| p99 per detect                        | 3.2 ms                  | 27.8 ms            | 1093 ms                                   |
| per detect on a full 2000-char sample | ~1 ms                   | ~20 ms             | ~143 ms bare / ~434 ms schema-constrained |
| session create                        | n/a (warmed at SW init) | 0.7 ms             | **21.7 s cold**, 696 ms warm              |
| CPU-seconds per detection             | negligible              | ~0.02              | **~0.53**                                 |

- **422 / 422 samples (100%) exceed the 150 ms tier-7 budget** in the schema-constrained
  configuration. Under the existing `raceAbort` timeout, a Nano engine would abort on
  effectively every page — i.e. ship 4 GB of dependency for a permanent no-op.
- **Compute:** 40 detections cost **22.1 CPU-seconds** of Chrome process time — ~0.53
  CPU-seconds per page against `LanguageDetector`'s ~0.02, a ≥25× multiplier. This is a
  **lower bound**: GPU energy is not fully billed to Chrome's CPU time. Movar runs on
  laptops and phones; a per-page half-second of compute is a battery and thermal cost paid
  on every navigation, forever, for a worse answer.
- **Reach:** desktop-only (Windows 10/11, macOS 13+, Linux, ChromeOS), **22 GB free disk**
  on the profile volume, **>4 GB VRAM**, 16 GB RAM. Zero reach on Firefox, Safari, or any
  mobile platform — where `franc` is the only engine and the quality gap is already
  widest (see Incidental findings 3).

## Rationale

The mechanism is visible in the repo's own corpus, no adversarial construction needed:
`en-with-cyrillic-name` is 95% English prose that happens to say "Ukrainian musician…
Ukrainian folk music", and Nano answers `uk` at 0.98 confidence. It is not identifying a
language; it is answering "what is this text about?".

For most products that conflation is a tolerable quirk. For movar it is disqualifying,
because movar's subject domain **is** the confound: Ukrainian media writes about Russia
constantly, and Russian media writes about Ukraine constantly. The confound stratum isn't
a tail case we constructed to be unfair — it is the modal movar page.

This is a property of the model class, not of Nano's parameter count or of our prompt. A
larger built-in model would still be a next-token predictor conditioned on semantics, so
the finding should be expected to survive the next Chrome release. That is why the decision
is stated as a principle rather than as a benchmark score.

Consistent with [priority-driven-switching.md](./priority-driven-switching.md#design-principle-established):
_if the constraint defends the product's reason for existing, lock it._

## Consequences

- **Engine roster is closed to LLMs.** `LanguageDetectionEngine` implementations must be
  deterministic, form-based detectors. A future engine (ELD, a calibrated Cyrillic model)
  is welcome; a prompt-driven one is not.
- **No new permission, dependency, or download.** Nothing ships; the network-silence
  guarantee and Firefox's `data_collection: { required: ['none'] }` sentinel are untouched.
- **The public claim is stated positively, not as "we don't use AI".** Movar _does_ use an
  on-device ML detector (`LanguageDetector`) and a statistical one (`franc`) — a blanket
  "no AI" claim would be false, and store reviewers hold us to literal truth (see
  [store-policy-stance.md](./store-policy-stance.md)). The marketing page is scoped to
  _"we don't let an AI decide what to hide"_ and names what we use instead.
- **Regression fixtures.** The topic-confound class is now represented in
  [`test/fixtures.ts`](../packages/lang-detect/test/fixtures.ts) so any future engine is
  scored against it before adoption, and so the incumbents can't silently regress on it.
- **This is falsifiable.** Re-open if a built-in model demonstrates ≤5% falseBlock on the
  confound strata, inside the 150 ms budget, at a compute cost within ~2× of
  `LanguageDetector`. All three, not one.

## Considered alternatives

- **Nano as tier-7 engine #1 (ahead of `LanguageDetector`).** Rejected: 74.2% overall
  versus 92.7%, 29.2% falseBlock. Strictly worse on every stratum.
- **Nano as a last-resort tier behind the cascade.** Rejected: the cascade abstains on
  0.7% of samples, so the tier resolves 2 of 422 cases — measured, not estimated.
- **Nano as a tie-breaker when `LanguageDetector` and `franc` disagree.** Rejected on the
  same evidence: on the confound strata — where disagreement concentrates — Nano is a coin
  flip, so it would break ties by chance while adding 434 ms.
- **Better prompting / few-shot / constrained decoding.** Measured, all three. Few-shot
  made it worse; constrained decoding changed only the output format.
- **Opportunistic "use it only where already downloaded"** (the `LanguageDetector`
  pattern). The availability gate is not the objection — accuracy is. A wrong answer is
  worse when it arrives silently on a minority of installs, because it makes the bug
  unreproducible for everyone else.
- **Multimodal Nano for text inside images** (the documented "can't read inside media"
  gap). Out of scope here; it is a different capability with different costs, and it would
  inherit this ADR's constraint — an image classifier may report _that_ Cyrillic text is
  present, but any ru/uk verdict it produces is a language judgement and falls under this
  decision.

## Incidental findings

Surfaced while establishing the baselines; each acted on in the same change.

1. **`chrome-ai.ts` compared an unnormalized tag.** The engine tested
   `KNOWN_LANGUAGE_CODES.has(top.detectedLanguage)` against Chrome's **raw** result.
   Chrome returns script/region subtags — `zh-Hans` observed at 0.998 confidence — so the
   engine abstained on correct detections. Every other language-tag reader in the repo
   normalizes first (`page-language.ts`, `lang-pickers/classify.ts`,
   `page-content/google.ts`, `settings/migrate.ts`, `i18n/resolve.ts`); the class was swept
   and this was the only unnormalized site. Its unit test stubbed bare codes, so the suite
   could not see it. Fixed, with subtagged-code coverage added.
2. **`confound-short` is movar's real weak spot: cascade 74.4%.** Short, topic-loaded
   Cyrillic — card titles about Russia or Ukraine — is where the shipped stack is weakest.
   The best available engine there is `LanguageDetector` at 71.8%; scoped `franc` gets
   66.7%. A genuine improvement opportunity, and Nano (12.8–20.5%) is not it. ELD is
   already parked in [on-device-language-detection.md](./on-device-language-detection.md)'s
   Future improvements; this is the number to beat.
3. **Chrome/Edge users get materially better detection than Firefox/Safari users.** On
   short text `LanguageDetector` scores 89.5% where `franc` — the only cross-browser
   engine — scores 58.9% open-set, or 75.9% when scoped to movar's candidate set
   (`only: uk/ru/be/bg/en`, the rung-3 shape). A ~14-point cross-browser quality gap,
   invisible until now because the two engines were never scored against one corpus.

## Out of scope

- **Translation** — already refused, on different grounds, in [no-content-translation.md](./no-content-translation.md).
- **Structural DOM questions** (picker/switcher discovery, the blind spot where a
  framework switcher carries no conventional signal). Not a language verdict, not covered
  by this decision, not yet measured. Needs its own spike and ADR.
- **`Summarizer` / `Writer` / `Rewriter` / `Proofreader`.** Same Gemini Nano backend. No
  use case is proposed; a summary of blocked content would additionally run into
  `no-content-translation.md`'s laundering argument.
- **A user-facing "detection engine" setting.** Unchanged by this ADR; still unmotivated.

## Reproducing

The harness, corpus builders and analysis are not committed (they pull ~400 samples from
Tatoeba and Wikipedia at run time, and depend on a machine with Nano resident). The
method, in order:

1. Slice Tatoeba per-language exports (`downloads.tatoeba.org/exports/per_language/<iso3>/`)
   to sentences of 20–90 chars.
2. Pull Wikipedia intro extracts per edition (`action=query&prop=extracts&explaintext`),
   plus a confound set via `list=search` for the other country's name in each edition.
3. Score `franc` / `detectCyrillicLanguage` in Node against the shipped code paths.
4. Score `LanguageDetector` and `LanguageModel` from a localhost page in a Chrome with Nano
   resident, replicating `chrome-ai.ts`'s threshold and known-code gate.
5. Report accuracy per stratum, the missedBlock / falseBlock pair on the ru/uk axis, the
   residual the shipped cascade abstains on, and latency percentiles against the 150 ms
   budget.

Any re-run should reuse the confound-stratum design — a corpus without it will make an LLM
engine look far better than it is.
