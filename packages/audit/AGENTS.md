# Movar Audit kernel — `@movar/audit`

> The adjudication half of Movar Audit: `evaluate(evidence, ruleset) → Report`, pure, zero I/O, zero DOM. Collectors live in each runtime and share nothing but the serializable `Evidence` they emit — which is what makes the same judgement run in CI and on a phone, and makes a published finding replayable and falsifiable by the site it names.

## What it does

- **`evaluate(evidence, ruleset) → Report`** (`src/evaluate.ts`) — the kernel. Derives the capability set from the evidence's shape, gates every rule on it, iterates pages for page-scoped rules, grades every finding, and stamps the ruleset and the evidence onto the report.
- **The evidence model** (`src/evidence.ts`) — a serializable _structural digest_: declared `lang`, hreflang alternates, the picker model, link targets, body text-node samples with node paths, the head's declared and text surface, and per-probe status / headers / redirect chain. Never raw HTML. `source` is a discriminated union (`network` | `filesystem`) and probes live on the network branch only. `head` is optional — it arrived in `schemaVersion` 2, so a stored v1 bundle still replays and the rules that read it report `not-applicable` naming the schema.
- **Capability derivation** (`src/capability.ts`) — `static` / `http` / `matrix` / `traversal` / `multi-vantage` / `browser` / `site`, computed from the evidence alone. Absent capability → `not-collected`, automatically.
- **The grading law** (`src/grading.ts`) — grounding decides failing power. `declared` and `observed` may `fail`; `classified` never can, and the kernel downgrades it. `classified` findings must carry a `denominator`; jurisdiction-pack findings must carry a `citation`.
- **The rule contract** (`src/rule.ts`) — `Rule`, `RuleContext<S>`, `RuleOutcome`, and the `pass()` / `notApplicable()` / `findings()` outcome helpers. A family is one file exporting one `RuleFamily`.
- **Suppressions** (`src/suppress.ts`) — the only sanctioned way to opt out of a rule, since the ruleset floats and cannot be pinned. Follows the house doctrine of [`check-suppressions.mts`](../../scripts/check-suppressions.mts): an allowlist (derived from the grading law — never a pack rule, never a `classified` rule), no blanket ignores, a mandatory justification, a budget that only ratchets down, and stale-entry detection. **A suppression never rewrites the `Report`** — `evaluate()` is the instrument, and what blocks a build is the caller's policy.
- **The classifier seam** (`src/classifier.ts`) — `Classifier` over `@movar/lang-detect`'s snippet ladder, franc-free by default. It runs _inside_ `evaluate()`, so stored evidence re-adjudicates against an improved classifier.
- **The shared models rule families read** — `src/inventory.ts` (the declared [language inventory](../../docs/glossary.md#language-inventory), kept un-flattened so disagreement _between_ sources is expressible), `src/locator.ts` (resolving a declared target against the collected page set, normalized — never by fetching), `src/text-samples.ts` (what text may be classified at all, and the denominator). Each exists because three or more families need the same answer and must not drift into different ones.
- **All 46 rules**, in six families:
  | File | Family | Rules |
  | --- | --- | --- |
  | `src/rules/page-declaration.ts` | A — page declaration (WCAG 3.1.1 / 3.1.2, plus the head declaration surface) | 9 |
  | `src/rules/inventory.ts` (barrel over `inventory-sources.ts` + `inventory-hreflang.ts`) | B — inventory | 15 |
  | `src/rules/serving.ts` | C — serving (the response matrix) | 7 |
  | `src/rules/switch.ts` | D — switch integrity | 4 |
  | `src/rules/content-language.ts` | E — content language (classifier-only, never fails) | 5 |
  | `src/rules/ua.ts` | F — `ua` jurisdiction pack (Law 2704-VIII Art. 27 §6) | 6 |

## Boundaries & invariants

- **Pure kernel** — no `fetch`, no filesystem, no `jsdom`, no DOM globals, no clock, no randomness. The same bundle must always produce the same report; that is the whole falsifiability claim.
- **`Evidence` and rule IDs are the public API**, not this module graph. IDs are never renamed once published — a suppression pointing at a renamed rule silently stops suppressing.
- **`not-collected` is never `pass`.** Silently passing what it did not check is the default failure mode of every audit tool.
- **No rule hand-checks for missing data.** The kernel answers `not-collected` before `run` is called, so inside `run` the context is already known to satisfy the contract.
- **`classified` can never `fail`.** Enforced by the type on a pure-classified draft, and by the kernel's downgrade on a hybrid `via: 'classified'` finding. A mis-written rule cannot manufacture a build-breaking accusation.
- **Attachments are citable, never readable.** `Attachment` carries a hash, a size, and a media type, and deliberately no content field — so `evaluate()` replays identically whether or not payload capture was on.
- **No inference.** Language inventory comes only from what the site declares. Probing `/uk/` to guess at an undeclared translation is forbidden — a false accusation is the one failure mode that ends the product.
- **No per-site adapters.** A checker with an allowlist is not a standard, and it would contradict the standing claim that Movar works via common mechanisms.
- The extension shares the model packages and **never the judge** — wiring this engine into a content script would put audit rules on the page-load hot path.

## Public API / entry points

One entry point plus a `./*` wildcard subpath (`@movar/audit/rules/page-declaration`, …). The barrel is `src/index.ts`.

### The kernel

- `evaluate(evidence: Evidence, ruleset: Ruleset): Report`

### Evidence

- `Evidence` — `{ schemaVersion, source, collectedAt, collector, pages, attachments? }`
- `EVIDENCE_SCHEMA_VERSION` — the wire-format version a bundle is written with
- `EvidenceSource` = `NetworkSource | FilesystemSource`; `NetworkSource` = `{ kind: 'network'; vantage; probes; robots }`, `FilesystemSource` = `{ kind: 'filesystem'; root }`
- `Vantage` — `{ id; kind: 'local' | 'proxy' | 'relay'; country?: VantageCountry }`
- `VantageCountry` — `{ claimed: string; verified?: boolean }` — a **claim**, never a measurement
- `PageEvidence` / `DocumentEvidence` / `ProbeEvidence` / `PickerEvidence` / `TextNodeSample` / `LangAttribute` / `AlternateLink` / `LinkTarget` / `RedirectHop` / `Attachment` / `ScreenshotViewport` / `Rect` / `NodePath`

### Capabilities

- `Capability` — `'static' | 'http' | 'matrix' | 'traversal' | 'multi-vantage' | 'browser' | 'site'`
- `deriveCapabilities(evidence): ReadonlySet<Capability>`
- `adjudicableProbes(evidence): readonly ProbeEvidence[]` — drops `blocked` / `error` probes
- `missingCapabilities(required, available): readonly Capability[]`

### Findings and grading

- `Finding` — the graded shape in a report; `FindingDraft` = `ClassifiedFindingDraft | GroundedFindingDraft` — what a rule emits
- `Verdict` — `'pass' | 'fail' | 'warn' | 'not-applicable' | 'not-collected'` (rule level)
- `FindingVerdict` — `'fail' | 'warn' | 'observation' | 'info'` (finding level)
- `Grounding` — `'declared' | 'observed' | 'classified'`; `Via` — `'declared' | 'classified'`
- `Citation` / `Denominator` / `EvidenceRef` / `FindingSubject` / `FindingScreenshot` / `RuleScope`
- `effectiveGrounding(grounding, via): Grounding`
- `gradeFinding(rule, draft): Finding`; `RuleContractError`

### The rule contract

- `CoreRule<S>` — `{ id: \`core/${string}\`; title; capabilities; grounding; hybrid?; scope: S; run(ctx: RuleContext<S>): RuleOutcome }`
- `PackRule<S>` — the same plus a mandatory `citation`, for any ID outside `core/`
- `Rule` = `CoreRule<'page'> | CoreRule<'site'> | PackRule<'page'> | PackRule<'site'>`
- `RuleContext<S>` — `{ evidence; capabilities; pages; probes; page: S extends 'page' ? PageEvidence : null; classify }`
- `RuleOutcome` + `pass()` / `notApplicable(reason)` / `findings(...drafts)`
- `RuleFamily` — `{ id; title; rules }`; `ruleCitation(rule): Citation | null`

### Suppressions

- `applySuppressions(report, policy): SuppressionOutcome` — `{ suppressed, remaining, stale, violations }`; the report is returned untouched
- `parseSuppressionPolicy(value): SuppressionPolicy | Error` — validates parsed JSON without doing I/O
- `Suppression` / `SuppressionPolicy` / `SuppressedFinding` / `SuppressionViolation` / `SuppressionOutcome` / `MIN_REASON_LENGTH`

### Rulesets, classifier, report

- `createRuleset({ id, version, families, classifier? }): Ruleset`; `RULESET_VERSION`; `DuplicateRuleIdError`
- `CORE_RULESET` — families A–E, 40 neutral rules, **no jurisdiction pack**
- `UA_PACK_FAMILIES` + `withPack(base, ...families): Ruleset` — statute rules apply only where a caller composes them in
- `Classifier` / `ClassifiedText` / `createSnippetClassifier(rung3?)`
- `Report` / `RuleResult` / `RulesetStamp` / `EvidenceStamp` / `CoverageSummary` / `REPORT_SCHEMA_VERSION`
- `isWellFormedBCP47(tag)` / `primarySubtag(tag)` / `declaredLanguageOf(tag)` / `urlLanguageMarker(locator)` / `UrlLanguageMarker`
- `siteInventory(pages)` / `pageInventory(page)` / `alternateLanguage` / `pickerOptionLanguage` / `inventoryCandidates` / `LanguageInventory` / `InventorySource` / `INVENTORY_SOURCES` / `X_DEFAULT`
- `parseLocator(href, base?)` / `locatorOf(page)` / `resolveTargetPage(pages, from, href)` / `resolvesToCollectedPage` / `Locator`
- `classifySamples` / `classifiableSnippet` / `classifiablePageLanguage` / `textNodeDenominator` / `CLASSIFIER_CANDIDATES` / `MIN_CLASSIFIABLE_CHARS` / `MAX_CITED_PASSAGES` / `ClassifiedSample`
- `pageDeclarationFamily` / `inventoryFamily` / `servingFamily` / `switchFamily` / `contentLanguageFamily` / `uaPackFamily`

## Layout

```
src/
  index.ts                    — the barrel; the package's public surface
  evaluate.ts                 — evaluate(): capability gating, page iteration, grading, stamps
  evidence.ts                 — the Evidence model: source union, vantage, pages, probes, attachments
  capability.ts               — deriveCapabilities, adjudicableProbes, missingCapabilities
  finding.ts                  — Finding / FindingDraft union, verdicts, grounding, citation, denominator
  grading.ts                  — the grading law: the classified downgrade + contract enforcement
  rule.ts                     — Rule / RuleContext / RuleOutcome + pass / notApplicable / findings
  ruleset.ts                  — createRuleset, CORE_RULESET, RULESET_VERSION (floats with package.json)
  report.ts                   — Report / RuleResult / CoverageSummary / stamps
  suppress.ts                 — the suppression doctrine: allowlist, budget, justification, stale detection
  classifier.ts               — the classifier seam over @movar/lang-detect (franc-free by default)
  bcp47.ts                    — isWellFormedBCP47 (grammar, not registration), declaredLanguageOf
  head-declaration.ts         — the head's declared surface: og:locale, Content-Language
  url-language.ts             — the URL's own language marker; strict alias matching only
  inventory.ts                — the declared language inventory, with per-source attribution
  locator.ts                  — normalized resolution of a declared target against the page set
  text-samples.ts             — classifiable-text gates, the candidate set, the denominator
  rules/
    page-declaration.ts       — family A (9)
    inventory.ts              — family B barrel: catalogue order + completeness check
    inventory-sources.ts      — family B: core/inventory-* + core/picker-* (7)
    inventory-hreflang.ts     — family B: core/hreflang-* (8)
    serving.ts                — family C (7)
    switch.ts                 — family D (4)
    content-language.ts       — family E (5)
    ua.ts                     — family F, the ua jurisdiction pack (6)
  *.test.ts                   — co-located unit tests for each module
test/
  fixtures.ts                 — synthetic Evidence builders (no network, no DOM)
```

Family B is split across two implementation files purely for size; `rules/inventory.ts` reassembles the single family the catalogue documents, in catalogue order, and throws if a listed rule ID has no implementation. No family touches another — the shared models above are the only common ground.

## Dependencies

- `@movar/lang-detect` (`workspace:*`) — `normalizeLanguageCode` / `normalizeBCP47` for the declaration comparisons, and `classifyBySnippet` / `getProfiles` behind the classifier seam. Imported from the **franc-free** main barrel; the `/franc` subpath is never imported here, so the kernel pulls no trigram tables.

No other runtime dependencies. No `jsdom` — ever.

Dev: `vitest ^4.1.7`, `@vitest/coverage-v8`, `eslint ^9`, `@movar/eslint-config`.

## Working on it

```sh
# From the package directory or repo root:
pnpm --filter @movar/audit typecheck
pnpm --filter @movar/audit lint
pnpm --filter @movar/audit test

# Or via nx:
nx run audit:typecheck
nx run audit:lint
nx run audit:test

# Coverage (v8 provider, outputs text + lcov + json-summary):
pnpm --filter @movar/audit exec vitest run --coverage
```

Test environment: `node` (no DOM). Tests use `globals: false` — import `describe/expect/it` explicitly. Shared `Evidence` builders live in `test/fixtures.ts`; production modules carry no test scaffolding.

### The dogfood gate

`nx run marketing:audit` (the `audit-site` CI job, and part of `pnpm validate`) runs this
package's CLI over `apps/marketing/dist` with
`apps/marketing/audit-suppressions.json` as its policy — we judge movar.fyi by the same 41
rules we judge everyone else with. Two consequences worth knowing before you touch a rule:

- **A new rule can turn this repo's own CI red**, by design. The ruleset floats; that is the
  bar rising. Fix the site, or add a justified suppression — never pin.
- **A rule that stops firing turns it red too**, via stale-suppression detection. That is the
  same mechanism working: the entry has outlived its finding and should be deleted.

The `ua` pack is deliberately not composed in there. movar.fyi declares no Ukrainian-market
signal, so Law 2704-VIII does not apply to it and must not even be evaluated.

### Adding a rule family

1. Write `src/rules/<family>.ts` exporting one `RuleFamily`. Annotate each rule as `CoreRule<'page'>` / `CoreRule<'site'>` (or `PackRule<…>` for a jurisdiction pack) so the contextual types apply.
2. Declare `capabilities` honestly. The kernel answers `not-collected` on your behalf — never write a guard for missing data.
3. Emit drafts with `findings(...)`; the kernel stamps `rule`, `scope`, and (for a pack rule) `citation`.
4. Register the family in `ruleset.ts` — one import, one array entry.
5. Co-locate `src/rules/<family>.test.ts` and drive it through `evaluate`, not through `run` directly, so capability gating and grading are covered too.

## Gotchas

- **`normalizeBCP47` is not a well-formedness oracle.** It returns `null` for any tag outside Movar's alias set (`de-DE` → `null`), which is right for "should Movar act on this?" and wrong for "is this malformed?". Use `isWellFormedBCP47` for the grammar and `declaredLanguageOf` for the comparison — but **never `declaredLanguageOf` raw on an `hreflang` value**: `declaredLanguageOf('x-default')` is `'x'`, because `normalizeBCP47` returns `null` and it falls through to `primarySubtag`. `x-default` is a routing declaration, not a language, so an hreflang goes through `alternateLanguage(alternate)`, which returns `null` for it (and for a blank). Carrying the phantom `'x'` forward once had `ua/state-language-version-lesser` reporting a Ukrainian page deficient against "its x counterpart", statute cited.
- **`normalizeLanguageCode` vs `normalizeBCP47`** — strict, never-hyphen-splitting for URL path segments and picker label text; the BCP-47 variant only for `hreflang` / `<html lang>`. Using the wrong one on `/ru-return-warranty` yields `'ru'` when it must yield `null` (the Bosch regression, guarded by a test in `url-language.test.ts`).
- **Page scope implies `static`.** The kernel adds it to a page-scoped rule's required capabilities, so an empty bundle is `not-collected` rather than vacuously passing.
- **A rule that only emits `observation` / `info` findings verdicts as `pass`.** Observations are cited, never scored — the headline is `brokenPromises`, the count of `fail` findings.
- **`RULESET_VERSION` reads `package.json`.** It floats deliberately; a pinned ruleset is one nobody bumps. Don't hard-code it.
- **A new workspace member needs its own `vitest.config.ts` declaring the `json-summary` reporter**, or it vanishes from the repo coverage denominator and trips [`metrics-gate`](../../docs/metrics-gate.md) — a 100 %-covered new package can still fail the gate.
- **Resolve declared targets through `src/locator.ts`, never by comparing strings.** The same page is legally written `https://example.com/uk/`, `/uk`, and `/uk/index.html`, and hreflang is absolute while filesystem evidence is a build path. A raw `===` silently reports a correct site as unresolvable — it did exactly that to `ua/state-language-version-lesser`, whose page pairs never matched off disk. `src/locator.test.ts` guards the equivalence class.
- **`core/lang-part-unmarked` cannot actually `fail`,** though the catalogue grades it so. Its "is this passage foreign?" question has no declarative answer — an element that declares its language passes by definition — so `via` is always `'classified'` and the kernel downgrades it. That is the safe behaviour; the catalogue row is what is out of step.
- **The CLI's exit codes are three-valued.** `0` clean, `1` red (uncovered broken promises, a policy that breaks the doctrine, or a stale entry), `2` the run never happened (no source flag, an argument `parseArgs` refuses, an unreadable or unparseable policy file). A CI step that treats every non-zero as "the site is broken" will report a typo in a path as a language defect.
- **`parseArgs` answers `Args | Error`, and validates rather than coerces.** A `--budget` must be digits that survive `Number.isSafeInteger`, and no flag may take the next flag as its value. Both were `2`-worthy typos that used to run: `Number('lots')` is `NaN`, which loses every comparison the request ceiling in `probe.ts` is made of (`spent >= NaN` is false forever, `remaining()` is `NaN` and never `=== 0`), so a mistyped budget silently uncapped an audit against a live third-party site; and `--url --follow` parsed as a url of `--follow` and went and fetched it.
- **A broken suppression silences nothing.** An entry that fails validation is reported and then ignored, so a malformed suppression is never more powerful than a well-formed one. The budget is likewise checked against the _declared_ entries, not the surviving ones.
- **The npm publish train is a later milestone.** The package is `private: true` and exports raw TypeScript like every other member; the tsup `noExternal` bundle, provenance, and its own release train land with the CLI.
