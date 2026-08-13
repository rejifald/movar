---
type: design-spec
id: movar-audit-rules
status: proposed
date: 2026-08-13
summary: The rule catalogue for **Movar Audit** — 41 checks across six families, each with a stable ID, the evidence it needs, and the grounding that decides whether it can fail a build. The catalogue's governing law is that **grounding determines failing power**: rules grounded in the site's own declarations (`declared`) or in observed HTTP facts (`observed`) may fail; rules grounded in the text classifier (`classified`) are always cited observations that never block and never aggregate into a page verdict. Rules whose language determination could come from either source record `via` on the finding and lose failing power when it is `classified`. Every rule declares the collector capability it needs (`static` / `http` / `matrix` / `traversal` / `multi-vantage` / `browser` / `site`), which is what makes `not-collected` automatic rather than something each rule remembers to check. Families: page declaration (WCAG 3.1.1 / 3.1.2), inventory consistency, serving behaviour (the `Accept-Language` response matrix, including the `Vary` and geo-override checks), switch integrity (the hreflang-bounce class), content language (classifier observations only), and the `ua` jurisdiction pack (Law 2704-VIII Art. 27 §6 — absence, default-loading, and version parity). Implements the rule half of [movar-audit.md](./movar-audit.md).
---

# Movar Audit — rule catalogue

Rules are the audit's public API alongside `Evidence`: suppressions cite them, stored
evidence is adjudicated against them, and published reports quote them. IDs are therefore
stable, and this document is the registry.

This is the rule half of [movar-audit.md](./movar-audit.md); read the ADR first for the
architecture the grading law falls out of.

---

## How to read this

### ID scheme

```
<pack>/<subject>-<assertion>
```

`core/` is the neutral, jurisdiction-free set. Everything else is a
[jurisdiction pack](./glossary.md#jurisdiction-pack) applying only where the site declares
that market. IDs are lower-kebab, never renamed once published — a suppression pointing at
a renamed rule silently stops suppressing.

### Grading law

**Grounding decides failing power.** This is the whole safety model, and it is why a
classifier that is wrong sometimes cannot produce a build-breaking accusation.

| Grounding    | Source of truth                                                           | May fail? |
| ------------ | ------------------------------------------------------------------------- | --------- |
| `declared`   | The site's own markup, headers, sitemap — the site is the witness         | yes       |
| `observed`   | HTTP facts: byte identity, status codes, redirect chains, header presence | yes       |
| `classified` | `@movar/lang-detect` on page text                                         | **never** |

**The hybrid case matters.** Many serving and switch rules must answer "what language was
this response in?" If the response declares it (`<html lang>`), the finding is `declared`
and may fail. If it does not, the classifier answers, and the finding is `classified` and
drops to an observation. One rule ID, one suppression, two grades — the finding records
`via: 'declared' | 'classified'` so a reader can see which. Rules where this applies are
marked **hybrid**.

### Verdicts

`pass` · `fail` · `warn` · `not-applicable` · `not-collected`

`not-collected` is **never** `pass`. A rule whose required capability was absent says so on
the face of the report.

### Capabilities

Each rule declares what a collector must have produced. Absent capability →
`not-collected`, automatically, with no per-rule bookkeeping.

| Capability      | Means                                                                             |
| --------------- | --------------------------------------------------------------------------------- |
| `static`        | HTML alone — works on `filesystem` evidence                                       |
| `http`          | A real response: status, headers, redirect chain                                  |
| `matrix`        | ≥2 probes differing only in `Accept-Language`                                     |
| `traversal`     | Permission to follow declared targets — fetched over HTTP, or read from the build |
| `multi-vantage` | ≥2 [vantages](./glossary.md#vantage)                                              |
| `browser`       | Rendered tier — a live DOM                                                        |
| `site`          | A page set (filesystem build, or capped sitemap expansion)                        |

### Finding shape

```ts
interface Finding {
  rule: string; // 'core/switch-bounces'
  verdict: 'fail' | 'warn' | 'observation' | 'info';
  grounding: 'declared' | 'observed' | 'classified';
  via?: 'declared' | 'classified'; // hybrid rules only
  scope: 'page' | 'site';
  subject: { url?: string; path?: string; node?: NodePath };
  evidence: EvidenceRef[]; // probe ids, redirect chains, node paths
  screenshot?: { assetId: string; region: Rect };
  citation?: { source: string; article: string; url: string };
  denominator?: { examined: number; matched: number }; // classified rules must set this
}
```

`citation` is mandatory on jurisdiction-pack rules. `denominator` is mandatory on
`classified` rules — _"3 of 340 text nodes"_ is a finding, _"3 nodes"_ is a smear.

---

## Family index

| Family                                     | Rules | Grounding           | Can fail |
| ------------------------------------------ | ----- | ------------------- | -------- |
| [A. Page declaration](#a-page-declaration) | 6     | declared (1 hybrid) | yes      |
| [B. Inventory](#b-inventory)               | 15    | declared            | yes      |
| [C. Serving](#c-serving)                   | 7     | observed (3 hybrid) | yes      |
| [D. Switch](#d-switch)                     | 4     | declared / observed | yes      |
| [E. Content language](#e-content-language) | 3     | classified          | **no**   |
| [F. `ua` pack](#f-ua-jurisdiction-pack)    | 6     | declared / observed | yes      |

**41 rules.** A built `dist/` exercises **29** of them offline — all of A, all of B, all of
E, three of F, and every switch rule except the redirect bounce. The remaining 12 need the
network: the whole of C, `core/switch-bounces`, `core/switch-requires-script`, and the three
`ua/` rules that turn on what the server actually serves.

---

## A. Page declaration

WCAG 2.1 **SC 3.1.1 Language of Page** (Level A) and **SC 3.1.2 Language of Parts**
(Level AA). This family is why a team with no interest in Ukrainian runs the tool.

| ID                             | Asserts                                                             | Grade | Needs    |
| ------------------------------ | ------------------------------------------------------------------- | ----- | -------- |
| `core/lang-missing`            | `<html>` carries no `lang`                                          | fail  | `static` |
| `core/lang-malformed`          | `<html lang>` is not a well-formed BCP-47 tag                       | fail  | `static` |
| `core/lang-contradicts-url`    | `<html lang>` disagrees with the URL's own language marker          | fail  | `static` |
| `core/lang-contradicts-picker` | `<html lang>` disagrees with the picker's active entry              | fail  | `static` |
| `core/lang-part-unmarked`      | A passage is in another language and carries no `lang` (**hybrid**) | fail  | `static` |
| `core/lang-part-malformed`     | An element's `lang` is not a well-formed BCP-47 tag                 | fail  | `static` |

**`core/lang-contradicts-url`** fires on `<html lang="ru">` served at `/uk/…` or
`uk.example.com`. Path matching is strict alias matching via `normalizeLanguageCode` —
`/ru-return-warranty` must not fire (the Bosch regression).

**`core/lang-part-unmarked`** is the only hybrid in this family, and its framing is the
point: **the failure is the missing attribute, not the presence of another language.**
Mixing languages is legal HTML; mixing them _undeclared_ is a WCAG failure. The classifier
only points at where to look, so:

- `ru` inside `uk` grades `fail` at rung 1–2 with franc concurrence, `warn` below.
- `en` inside `uk` grades `warn` at most. English fragments are common and often deliberate.
- Strings under a minimum length, strings matching known proper nouns/brands, and nodes
  inside `<code>` / `<samp>` / `<kbd>` are excluded.
- Elements that _do_ declare the other language pass. That is the correct markup.

---

## B. Inventory

The [language inventory](./glossary.md#language-inventory) is the union of what the site
declares: hreflang alternates, picker options, `<link rel="alternate">`, sitemap
alternates. Never inferred by probing. **Disagreement between the sources is itself the
finding** — this family is where most real-world defects live, and all of it works on a
static build.

The report leads with the discovered inventory so a reader can see immediately whether the
tool understood their site.

| ID                                    | Asserts                                                                   | Grade | Needs                   |
| ------------------------------------- | ------------------------------------------------------------------------- | ----- | ----------------------- |
| `core/inventory-sources-disagree`     | hreflang, picker and sitemap declare different language sets              | fail  | `static`                |
| `core/inventory-varies-across-pages`  | Pages of the same site declare different inventories                      | fail  | `site`                  |
| `core/inventory-undetermined`         | Multilingual signals present, no inventory derivable                      | info  | `static`                |
| `core/hreflang-self-missing`          | No self-referential hreflang on a page that has alternates                | warn  | `static`                |
| `core/hreflang-not-reciprocal`        | A declares B; B does not declare A                                        | fail  | `site`                  |
| `core/hreflang-duplicate`             | Same code declared twice with different targets                           | fail  | `static`                |
| `core/hreflang-malformed`             | hreflang value is not a well-formed BCP-47 tag or `x-default`             | fail  | `static`                |
| `core/hreflang-target-relative`       | Target is not an absolute URL                                             | warn  | `static`                |
| `core/hreflang-x-default-missing`     | Multi-language site declares no `x-default`                               | warn  | `static`                |
| `core/hreflang-target-unresolvable`   | Declared target 404s, or is absent from the build                         | fail  | `static` \| `traversal` |
| `core/hreflang-target-wrong-language` | Target resolves but serves a language other than declared (**hybrid**)    | fail  | `static` \| `traversal` |
| `core/picker-option-undeclared`       | Picker offers a language nothing else declares                            | fail  | `static`                |
| `core/picker-omits-declared-language` | A declared language is absent from the picker                             | warn  | `static`                |
| `core/picker-no-navigable-target`     | Picker entry exposes no URL — no `href`, no hreflang, no navigable target | fail  | `static`                |
| `core/picker-target-unresolvable`     | Picker target 404s, or is absent from the build                           | fail  | `static` \| `traversal` |

**`core/hreflang-not-reciprocal`** and **`core/inventory-varies-across-pages`** are the
strongest arguments for auditing a built `dist/` rather than a live URL: the whole page set
is available at once, offline, deterministically, before anything ships. A site declaring
`uk` on the homepage and not on product pages is common and invisible from a single page.

**`core/picker-no-navigable-target`** turns a known limitation into a rule. Movar has hit
switchers carrying no conventional signal — hashed classes, a `<span>` as the active entry,
the language only in `value="UA"`. In the extension that is a blind spot; here it is a
defect with consequences a developer already cares about: _search engines cannot discover
your other languages, and nothing but a mouse can reach them._ Report it as SEO and
accessibility, not as a Movar inconvenience.

---

## C. Serving

The [response matrix](./glossary.md#response-matrix) — the same URL fetched N times varying
only `Accept-Language`, everything else identical. This family cannot run on static
evidence at all, and that is stated rather than silently passed.

| ID                                     | Asserts                                                                  | Grade | Needs           |
| -------------------------------------- | ------------------------------------------------------------------------ | ----- | --------------- |
| `core/serving-default-language`        | What language loads with no stated preference                            | info  | `http`          |
| `core/serving-header-ignored`          | Responses are byte-identical across every header value, with >1 declared | fail  | `matrix`        |
| `core/serving-header-partial`          | Some declared languages honoured, others silently ignored (**hybrid**)   | fail  | `matrix`        |
| `core/serving-declared-never-served`   | A declared language is never served under any header (**hybrid**)        | fail  | `matrix`        |
| `core/serving-vary-missing`            | Response varies by `Accept-Language` without `Vary: Accept-Language`     | fail  | `matrix`        |
| `core/serving-decided-by-ip`           | Identical headers, different languages per vantage                       | fail  | `multi-vantage` |
| `core/serving-cookie-overrides-header` | A warm language cookie overrides an explicit header preference           | warn  | `matrix`        |

**`core/serving-header-ignored` is the only rule in the audit that needs no language
determination at all.** Byte identity across four different `Accept-Language` values is a
pure fact — no `<html lang>`, no classifier, nothing to dispute. When it fires alongside a
declared inventory of two or more languages, it is the single most defensible finding the
tool produces: _"you served byte-identical bytes for `uk`, `ru`, `en` and `de`."_

**`core/serving-vary-missing`** is the sleeper. A site that correctly honours
`Accept-Language` but omits `Vary` will have a CDN cache one visitor's language and serve
it to everyone behind that edge — so the _correct_ implementation produces the _wrong_
outcome for real users. Purely `observed`, trivially fixable, and it will find bugs on
sites that pass everything else.

**`core/serving-decided-by-ip`** is the geo-override check, and the reason `vantage` is
first-class. It requires ≥2 vantages, so on the free `local`-only path it reports
`not-collected` — never `pass`. Its finding must never present a
[declared vantage country](./glossary.md#vantage) as an observed fact.

**Cold by default.** Every matrix probe runs with no cookies unless the operator opts into
a warm run, which is stamped in the evidence. `core/serving-cookie-overrides-header`
deliberately requires a warm leg and is `not-collected` otherwise.

---

## D. Switch

Does the language switcher switch? Verified by fetching the **declared** target rather than
clicking — a 301 chain is a fact that replays, with no timing, consent banners, or
anti-bot in the loop. The browser tier exists only where no navigable target exists.

| ID                            | Asserts                                                             | Grade | Needs                   |
| ----------------------------- | ------------------------------------------------------------------- | ----- | ----------------------- |
| `core/switch-no-effect`       | Following the declared target serves the same language (**hybrid**) | fail  | `static` \| `traversal` |
| `core/switch-bounces`         | The target redirects back to the original language version          | fail  | `http` + `traversal`    |
| `core/switch-loses-path`      | Switching lands on the homepage instead of the translated page      | fail  | `static` \| `traversal` |
| `core/switch-requires-script` | A switcher with no navigable target does work when clicked          | info  | `browser`               |

`core/switch-bounces` is the one rule in this family a static build cannot exercise: a
filesystem has no redirects. The other three follow the declared target by reading the next
file, so they run offline against `dist/` before anything ships.

**`core/switch-bounces`** is the rule this whole product was worth building for. UA shops
on some CMS platforms publish a `uk-ua` hreflang that 301s straight back to the Russian
URL — the site declares a Ukrainian version, search engines index the declaration, and no
user can ever reach it. The evidence is the complete redirect chain: undeniable, replayable,
and unambiguous about the fix.

**`core/switch-loses-path`** is the everyday version: switching language from a product
page dumps you on the homepage. It is a conversion bug as much as a language bug, which is
what gets it prioritised.

**`core/switch-requires-script`** is deliberately `info`, not `pass`. It confirms a
JavaScript-only switcher functions for a human — which does not repair
`core/picker-no-navigable-target`, since crawlers and assistive tech still cannot reach the
other languages. It is the one place CLI and app collectors are allowed to differ in
fidelity.

---

## E. Content language

Classifier-grounded. **Nothing here can fail a build, ever**, and nothing here aggregates
into "this page is Russian" — the same invariant the extension's content-filter layer
already holds, where breaking it costs a curtained card rather than a published accusation.

Every finding sets `denominator`.

| ID                                     | Asserts                                                              | Grade       | Needs    |
| -------------------------------------- | -------------------------------------------------------------------- | ----------- | -------- |
| `core/content-language-mixed`          | Text nodes classify as a language other than the page's declared one | observation | `static` |
| `core/content-contradicts-declaration` | The dominant classified language differs from `<html lang>`          | observation | `static` |
| `core/content-chrome-untranslated`     | Navigation/footer classify differently from the body                 | observation | `static` |

These are the rules that make a report _readable_ — an auditor scanning them sees where to
look — and the rules most likely to be wrong. They cite the node path and text, carry the
classifier rung and franc concurrence, and are worded as measurements: _"47 of 812 text
nodes classified `ru`"_, never _"this page is in Russian."_

`core/content-contradicts-declaration` is the closest the catalogue comes to a page-level
verdict, which is exactly why it is `observation`. It is a signal that
`core/lang-contradicts-*` should be looked at, not a substitute for them.

---

## F. `ua` jurisdiction pack

Grounded in Ukraine's Law 2704-VIII, _On ensuring the functioning of Ukrainian as the state
language_, Art. 27 §6. Applies only where the site **declares** it sells into Ukraine.
Every rule carries `citation`. The pack reports **found / not-found violation evidence**;
it never renders a legal verdict.

> **Requires legal review before shipping.** Article number, effective date, enforcement
> scope, and the exact wording used in a report that may reach a regulator are open
> questions in [movar-audit.md](./movar-audit.md).

| ID                                     | Asserts                                                                  | Grade | Needs           |
| -------------------------------------- | ------------------------------------------------------------------------ | ----- | --------------- |
| `ua/market-determination`              | How the Ukrainian market was determined, or that it was not              | info  | `static`        |
| `ua/state-language-absent`             | No Ukrainian version declared anywhere, and none served                  | fail  | `http`          |
| `ua/state-language-not-default`        | A Ukrainian version exists but is not what loads by default (**hybrid**) | fail  | `http`          |
| `ua/state-language-not-default-by-ip`  | Ukrainian loads by default from some vantages but not others             | fail  | `multi-vantage` |
| `ua/state-language-version-lesser`     | The Ukrainian version is smaller in volume or content than another       | fail  | `site`          |
| `ua/state-language-interface-elements` | Interface chrome is not in Ukrainian on a Ukrainian-serving page         | warn  | `static`        |

**Market determination** uses declarations only: `.ua` TLD, UAH pricing, an ЄДРПОУ code, a
Ukrainian legal-entity block, `uk-UA` hreflang, a Ukrainian postal address. Undeterminable
→ the whole pack is `not-applicable`, never `fail`. `ua/market-determination` always
reports which signals fired, so the applicability decision is auditable.

**`ua/state-language-absent` is the rule the neutral core structurally cannot produce.**
Section B's declared-only discipline exists to stop the tool inferring that a hidden
translation exists. This rule runs the opposite direction — it records that none is
declared _and_ none is served — and it is safe precisely because the statute requires
default _loading_: an undeclared, unreachable Ukrainian version fails the obligation too.
No inference, no false-accusation exposure.

**`ua/state-language-version-lesser` is the pack's strongest rule** and has nothing to do
with the classifier. The statute requires the state-language version to be no lesser in
volume and content. Compare declared page counts per language in the sitemap, and per-page
content volume across hreflang pairs: _`uk` 40 pages, `ru` 120_ is objective, statutory,
and impossible to argue with. It needs `site` scope, so it is `not-collected` on a
single-page audit.

---

## Non-rule report states

Not findings — states the report carries about the run itself.

- **`blocked`** — a WAF or captcha interstitial was detected. Returns **HTTP 200** with its
  own `<html lang>` and body text, so adjudicating it would manufacture a false accusation
  about a named company. Nothing downstream of a `blocked` probe is adjudicated. _"This site
  cannot be audited unattended"_ is information the operator can use.
- **`error`** — transport failure, TLS failure, timeout.
- **`not-collected`** — the capability a rule needs was absent. Rendered per rule, never
  rolled up into a pass.
- **Coverage summary** — how many rules ran, how many were `not-applicable`, how many
  `not-collected`, and for site scope how many declared pages were actually sampled against
  the cap.

---

## Deliberately excluded

Recorded so they are not re-proposed. Rationale in [movar-audit.md](./movar-audit.md).

| Not a rule                                                | Why                                                                                         |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| "This site should offer Ukrainian"                        | Advocacy, not conformance. The core asserts broken promises; the `ua` pack asserts statute. |
| Probing `/uk/`, `uk.`, `?lang=uk` for undeclared versions | Inference manufactures false accusations. A 200 on an SPA catch-all is not evidence.        |
| Any aggregate "this page is Russian" verdict              | Breaks the invariant the content-filter layer already holds, with published consequences.   |
| Translation quality or fluency judgement                  | Not measurable from the outside, and not a conformance question.                            |
| A 0–100 score                                             | Weights are unwinnable arguments, and averaging facts with classifications destroys both.   |
| Per-site rules (Google, YouTube, a CMS allowlist)         | A checker with an allowlist is not a standard.                                              |
| Anything requiring a spoofed browser `User-Agent`         | That makes the tool bot-protection evasion.                                                 |
| Crawling beyond declared targets and a capped sitemap     | Turns a user-initiated audit into a scan.                                                   |

---

## Open

- **Thresholds.** Minimum string length and rung/franc gates for `core/lang-part-unmarked`;
  the volume-delta threshold at which `ua/state-language-version-lesser` fires.
- **Legal review** of every `ua/` citation.
- **The next pack.** Quebec's Charter of the French Language is the obvious second, and the
  first real test of whether the pack abstraction holds.
- **Sitemap cap** default, and how the report states what was sampled.
- **Severity presentation.** Whether `warn` and `observation` read as distinct enough to a
  non-technical auditor, or whether the report needs different words for them.

---

## Related

- [movar-audit.md](./movar-audit.md) — the architecture these rules run inside
- [glossary.md](./glossary.md) — `vantage`, `response matrix`, `language inventory`,
  `jurisdiction pack`
- [`@movar/lang-pickers`](../packages/lang-pickers/AGENTS.md) — the picker model families B
  and D read
- [`@movar/lang-detect`](../packages/lang-detect/AGENTS.md) — the classifier family E is
  bounded by
- [no-llm-language-detection.md](./no-llm-language-detection.md) — why classifier accuracy
  is bounded, and why family E can never fail a build
