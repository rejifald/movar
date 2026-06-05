---
type: adr
id: no-content-translation
status: accepted
date: 2026-06-03
summary: Movar will not machine-translate blocked-language content. The on-device `Translator` API (Gemini Nano — the same stack as the opportunistic `LanguageDetector` in [on-device-language-detection.md](./on-device-language-detection.md)) was proposed as an "opportunistic translate-instead-of-hide" feature and rejected. Translating Russian into fluent Ukrainian launders the content and strips the provenance signal users trust Movar for, and it removes the demand-side pressure that nudges Ukrainian-in-Russian authors toward producing Ukrainian. Movar stays block-only: redirect to a wanted-language version, else hide. This also preserves the "sends nothing / nothing leaves your browser" guarantee, since the `Translator` API would be the extension's first network I/O (language-pack download). Closes the "different ADR" pointer left open in on-device-language-detection.md's Out of scope.
---

# No content translation

## Context

The web platform now ships an on-device `Translator` API (Gemini Nano, Chrome 138+ / Edge 148+, desktop only) that translates arbitrary text strings locally — the same Nano stack Movar already taps **opportunistically** for page-language detection via `LanguageDetector` ([on-device-language-detection.md](./on-device-language-detection.md)). The detection engine's pattern — `isAvailable()` gates on `availability() === 'available'`, never triggers a download, degrades to `franc-min` elsewhere — would transfer directly to a translation engine.

That adjacency prompted the proposal: **offer translation wherever the API is available** — an opportunistic "translate the blocked content instead of hiding it" feature, mirroring the detection engine's opt-in-where-supported shape.

Movar's model today is two-layer ([priority-driven-switching.md](./priority-driven-switching.md)):

1. **Redirect** to a higher-priority-language version of the page when one is advertised.
2. **Conceal** — when no wanted-language alternative exists and the page is in a blocked language, hide or blur it (gated behind `contentModification`).

`blocked: ['ru']` is a locked policy, not user config ([settings/src/index.ts](../packages/settings/src/index.ts)). The content script does **zero network I/O** today — all detection and filtering is local.

## Decision

**Movar does not translate content.** It stays block-only: redirect to a wanted-language version, else hide. No `Translator` API integration — not opportunistic, not opt-in, not behind a power-user flag.

## Rationale

Two arguments support this. They are not equally strong; the decision rests on the first.

**1. Integrity (load-bearing).** Translating `ru → uk` inline strips provenance. The output reads as native Ukrainian, so it re-exposes the user to the exact content they installed Movar to avoid — now laundered into a language they trust, propaganda included. The "this is Russian" signal _is_ Movar's value; translation destroys it. This holds at the scale of a single user on a single page, which is why it carries the decision.

**2. Author incentive (supporting, scale-dependent).** Blocking withholds the Ukrainian-speaking audience from Ukrainian authors who publish in Russian, nudging them toward producing Ukrainian. Seamless translation removes that pressure. But the nudge only bites at scale — one creator won't switch languages because some extension users can't see their posts — so this argument is not load-bearing and should not be the public justification. The integrity argument stands on its own.

This is consistent with the design principle established in [priority-driven-switching.md](./priority-driven-switching.md#design-principle-established): _if the constraint defends the product's reason for existing, lock it._ Refusing translation defends the mission, exactly as the unremovable `ru` block does. `blocked: ['ru']` encodes "Russian is non-negotiable," not "Russian is hard to read" — and a translate feature would quietly reinterpret it as the latter.

**Detection vs. translation.** Movar embraces on-device _detection_ (`LanguageDetector`) while rejecting on-device _translation_ (`Translator`), despite the shared Nano stack. The line is ethical, not technical: detection reads metadata _about_ the text to decide whether to act; translation rewrites the content and re-presents it. Only the second betrays the user's reason for blocking.

## Consequences

- **Accepted collateral.** Non-propaganda, Ukrainian-authored-in-Russian content is blocked along with everything else — no translate escape hatch. Under the mission this is the intended behavior (it _is_ the nudge), not a regression. Named here so it stays a choice rather than a surprise.
- **Privacy guarantee preserved.** The `Translator` API downloads language packs on first use, which would be the extension's **first-ever network request** (content scripts do none today). Staying block-only means we never have to reconcile that with the "sends nothing / nothing leaves your browser" copy or Firefox's `data_collection: { required: ['none'] }` sentinel in [wxt.config.ts](../apps/extension/wxt.config.ts).
- **Reach cost avoided (not the reason).** The API is Chromium-desktop-only. "Wherever we can" would have meant Chrome/Edge desktop only — excluding Firefox, Safari, and all Android. A feature most of the install base could never see was never the rejection's basis, but it confirms the cost/benefit.

## Considered alternatives

- **Opportunistic auto-translate** (the original proposal). Rejected: silently substitutes laundered content for hiding — the worst outcome for the principle-motivated user, applied by default.
- **Opt-in "translate instead of hide" setting.** Rejected: opt-in still relieves author pressure and reintroduces the laundering risk for the users who enable it, while complicating the model for a comprehension minority the product is not built to serve.
- **Translate-then-mark** (inline "machine-translated from Russian" badge + reveal-original, reusing the curtain's reveal affordance). Rejected: the badge mitigates provenance but not the incentive problem, and it still incurs the async-pipeline cost and first-network-I/O for marginal benefit to a non-target user.
- **Architectural note** (not a reason to reject, but a confirmation the feature isn't cheap): per-node `await translator.translate(...)` doesn't fit the synchronous per-card content filter; it would need an async refactor of `applyContentFilter`, a new idempotency marker, batching to amortize calls, and back-pressure handling for re-rendering grids (e.g. YouTube). The detection tier's 150 ms global budget and in-flight guard exist precisely because async-in-`applyOnce` is delicate.

## Out of scope / relation to other ADRs

- This ADR resolves the deferral in [on-device-language-detection.md](./on-device-language-detection.md) Out of scope: _"Translation (`Translator` API). Adjacent, same Nano stack, different ADR."_ The answer is: not built, by design.
- On-device **detection** (`LanguageDetector`, `franc-min`) is unaffected and remains opportunistic per its own ADR.
- The on-device-language-detection.md "Future improvements" note about a power-user setting to opt into the Nano **model download** for detection accuracy is likewise unaffected — that concerns detection, not translation, and does not reopen this decision.
