---
type: adr
id: mixed-script-snippets
status: accepted
date: 2026-10-22
summary: A Russian card whose title carries a long Latin product name («Самые дешевые в Украине | Victron Multiplus II 48V 6k5va») is classified `en` and kept. The bug is not in detection: the Cyrillic half alone reads `ru` at rung 1. It is in **script scoping**: langtell picks one dominant script by letter count, and a Latin-only candidate set (`{en}` in the shipped roster) always "wins" its script with a verdict that discriminates nothing. The same non-discriminating read also beats Google's own `sl=ru` declaration in the fused path. Proposed principle: **a read that discriminates nothing is not evidence**. Concretely, (1) when the dominant script is non-discriminating and a minority script has discriminating candidates and enough letters, classify the minority span; (2) the fused path stops treating a non-discriminating text read as one that overrides a declaration (**deferred** 2026-10-22, see the implementation status). The same class causes a production over-hide in the other direction: «Interview with Володимир Зеленський on CNN» is hidden as `ru`, because franc's rung-3 backstop reads the whole mixed string, so Latin letters carry a 19-letter Ukrainian name over franc's length floor. So, (3) franc reads only the script it is judging, with the length floor unchanged and measured on that span. All three land upstream in langtell behind an opt-in, ship in movar as a patch, and go out only after an offline corpus gate and a shadow period in the diagnostics extension. Measured together: zero Ukrainian or English over-hides on 629 strings, the Zelensky over-hide gone, three Russian titles newly hidden.
---

# Mixed-script snippets: judge each script on its own evidence

## Implementation status (2026-10-22)

- **Decisions 1 and 3** ship as langtell's opt-in `isolateScripts`
  ([rejifald/langtell#39](https://github.com/rejifald/langtell/pull/39)). movar
  turns it on once, in `@movar/lang-detect` (`MOVAR_CLASSIFY_OPTIONS` in
  `packages/lang-detect/src/classify.ts`), so every consumer classifies the same
  way. That covers the extension worker, Movar Audit, the diagnostics panel, the
  Safari host app and the test suites. The declared-path detector
  (`buildDeclaredClassifier`) and the off-path franc callers (`francOracle`,
  `francResidualVerdict`) use the same option and the same span (`textInScope`).
- The minority span leaves out quotations, so an English title quoting a
  Russian slogan stays English, consistent with the quote-scrubbing invariant.
  This was found while implementing and is tested in langtell.
- **Decision 4** is `apps/extension/src/lib/mixed-script-conceal.test.ts`: the
  labelled corpus runs through the real `applyContentFilter` gate. It fails on
  exactly the five fixed cases with the option off.
- **Decision 2 is deferred.** Decision 1 alone fixes the reported card on the
  declared path too (`ru`, fused confidence 0.89), because the text read is now a
  discriminating `ru`. What decision 2 would add is only the all-Latin title
  Google labels `sl=ru` («Victron Multiplus II 48V 6k5va»). Hiding it means
  exempting per-card declarations from langtell's cross-script cut (langtell
  #9: "context in a different script never names a Latin title"). langtell
  applies that cut to the inheritable `lang` attribute too, so the exemption
  would be a new over-hide path. The corpus test pins today's behaviour (kept),
  so turning it on later is a deliberate change.

## Context

Reported 2026-10-22: a Google result titled
«Самые дешевые в Украине | Victron Multiplus II 48V 6k5va» was not hidden.

### What actually happens

Measured on `langtell@0.6.1`, shipped candidate set `{uk, en, ru}` (a default
user: `priority ∪ blocked`, see [per-snippet-language-detection.md](./per-snippet-language-detection.md)):

| Input                                                           | Verdict                                                |
| --------------------------------------------------------------- | ------------------------------------------------------ |
| full title                                                      | `en`, rung 1, margin 22, `discriminating: false`       |
| «Самые дешевые в Украине» alone                                 | `ru`, rung 1, margin 2 (two `ы`) — clears the hide bar |
| full title, fused path with `declared: 'ru'` (Google's `sl=ru`) | `en`, confidence 0.61                                  |
| «Victron Multiplus II 48V 6k5va» alone, `declared: 'ru'`        | `en`, confidence 0.61                                  |

The Cyrillic half is detected correctly. It never gets a vote:

1. `scopeCandidates` → `dominantScript` counts letters: 20 Cyrillic vs 22 Latin.
   Latin wins by two, so the roster is narrowed to `[en]`.
2. With one candidate in scope, rung 1 always elects it. The verdict is
   flagged `discriminating: false` but nothing downstream reads the flag.
3. The 2 % contradiction veto measures only letters **in the winner's own
   script**, so the Cyrillic half cannot veto `en` either.
4. In the fused path, the same `en` read counts as "clear script" and overrides
   the declaration (langtell's context-never-overrides-clear-script guard), so
   Google's own `sl=ru` label (Movar reads it, see `TRANSLATE_LINK_SELECTOR` in
   `packages/page-content/src/google.ts`) is thrown away.

The original scoping rationale (per-snippet ADR, "Added: dominant-script
scoping") was "a minority-script token (a Latin brand like "YouTube") can't tip
the verdict". That assumes brands are the minority. On shopping results they
often aren't: model numbers, SKUs and product names regularly outweigh the
Cyrillic text around them.

### The class

**Letters of one script decide a question about another script.** It shows up
two ways, in opposite directions.

**(a) Under-hide: a scope with a single candidate counts as evidence.** A lone
candidate can't lose, so its win tells us only which script had more letters. Any Russian title whose Latin product name outweighs it is
exposed. Shop listings, hardware/tech reviews and YouTube titles are the usual
shapes. In the shipped roster Latin always has exactly one candidate (`en`),
so for a default user every Latin-majority mixed title is decided this way.

**(b) Over-hide: franc judges Cyrillic candidates on text padded with Latin.**
«Interview with Володимир Зеленський on CNN» is **hidden today**: `ru`, rung
3, franc margin 0.31 against a 0.22 hide bar. Cyrillic wins the letter count
19 to 18, so the scope is `{uk, ru}`. The name has no `і/ї/є/ґ`, so rungs 1–2
abstain. franc then runs on the whole string: `RUNG3_MIN_LENGTH = 24` is
measured on all 42 characters, Latin included. On its own the name
(«Володимир Зеленський», 20 characters) is under the floor and would never
reach franc. The Latin letters can't vote for `uk` or `ru`, but they lift a
single Ukrainian name over the floor, and franc reads it as Russian.

## Measurements

A harness re-implementing `classifyBySnippet` with a pluggable scoping policy
was checked against the real classifier first: **604/604 identical verdicts**
(language, rung, margin) on the test-string and mixed-script corpora. The corpora:

- **Test-string corpus (555):** every Cyrillic-bearing string literal of
  8 characters or more in movar's and langtell's test and fixture files (117 of
  them also carry Latin).
- **Mixed-script corpus (49), labeled:** 15 Russian and 25 Ukrainian
  shop/tech/review titles with Latin product names (the Ukrainian titles are the
  Russian ones translated, plus extra brand-heavy Ukrainian titles), 7 English
  titles carrying Cyrillic (names, quoted words), 1 Belarusian and 1 Bulgarian.
- **Names corpus (25), labeled:** see [class (b)](#the-rung-3-over-hide-class-b).

**Decisions 1–3 together:** 0 Ukrainian or English over-hides across all three
corpora (today: 1, Zelensky). Newly hidden Russian titles: the reported one,
the iPhone one, and «Аккумулятор LiFePO4 …». Lost: ColorWay on the undeclared
text path only. Plus the bg/be exposure listed below.

Results for class (a) ("+hide" = cards hidden that the current code keeps; the conceal gate is
`minHideMargin` from `content-conceal.ts`):

| Policy                                                                                                                                                          | Mixed: +hide | Ukrainian over-hides | Test corpus: +hide |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------- | -----------: | -------------------: | -----------------: |
| current (`cyr >= lat`)                                                                                                                                          |            — |                    0 |                  — |
| share ≥ 25 % Cyrillic → Cyrillic                                                                                                                                |            3 |                    0 |                  2 |
| share ≥ ⅓                                                                                                                                                       |            2 |                    0 |                  1 |
| share ≥ 40 %                                                                                                                                                    |            2 |                    0 |                  0 |
| ignore digit-bearing Latin tokens (`48V`, `6k5va`) in the count                                                                                                 |            2 |                    0 |                  0 |
| **partitioned**: classify the Cyrillic span alone when the dominant read is non-discriminating, the span has ≥ 8 letters, and the span verdict is not `unknown` |            3 |                    0 |                  2 |

In every policy the extra hides are the same small set:

- the reported title and «Купить Apple iPhone 15 Pro Max 256GB … — цена, отзывы»
  (true Russian; the share policies miss the iPhone one because its Cyrillic
  share is under ⅓);
- the Bulgarian title «Най-евтините в България | Victron …» → `ru`. This is the
  accepted #103 tradeoff (Bulgarian conceals as `ru` in the shipped roster,
  pinned in `classify-shipped-candidates.test.ts`), now reaching mixed titles
  too;
- in the test corpus, two English test _descriptions_ that quote Belarusian
  without `і`/`ў` («Гэта родная мова») and Bulgarian. These are artifacts of
  harvesting test names, but they show the same known be/bg exposure.

**No policy hid any Ukrainian title.** That follows from structure, not luck:
`ы э ъ ё` never occur in Ukrainian, so the only paths to a `ru` verdict on
Ukrainian text are rung 2 word lists and rung 3 franc. The partitioned policy
below excludes rung 3 from the minority span on purpose.

### What scoping does _not_ fix

Six of the 15 Russian mixed titles stay kept under every policy, because their
Cyrillic text has no Russian-distinctive letter or word («Ноутбук Lenovo … —
лучшая цена», «Видеокарта MSI …», «Смартфон Xiaomi …»). This is the known
recall floor of a letter/word ladder on short text. For Google cards the
declared-language path (`sl=ru`) is the intended answer. It only works once
decision 2 lands, because today the non-discriminating `en` read overrides it.

### The rung-3 over-hide (class b)

A third, labeled corpus of 25 targets this case: 14 English titles carrying
Ukrainian names and places, mostly without `і/ї/є/ґ` (Зеленська, Усик,
Сирський, Буданов, Шмигаль, Одеса, Шахтар, Джамала, …), 3 Ukrainian and 8
Russian titles mixing in Latin. Today only the Zelensky title is over-hidden.
The others are either Latin-majority or carry a distinctive letter, but any
name without `і` that tips the letter count toward Cyrillic would hit the same path.

| Rung-3 policy (with today's scoping)                                     | Zelensky | Ukrainian/English over-hides | True hides lost                                        | True hides gained       |
| ------------------------------------------------------------------------ | -------- | ---------------------------: | ------------------------------------------------------ | ----------------------- |
| current: floor 24 on the whole string, franc reads the whole string      | hidden   |                            1 | —                                                      | —                       |
| floor on in-scope letters ≥ 20, franc reads the whole string             | kept     |                            0 | ColorWay (and one more test string if the floor is 24) | —                       |
| **franc reads only the in-scope span (mixed text only), floor 24 on it** | kept     |                            0 | ColorWay                                               | «Аккумулятор LiFePO4 …» |

The span policy is the better one, and not only for Zelensky: model numbers
and SKUs are trigram noise to franc, and stripping them raised the margin on
«Аккумулятор LiFePO4 48V 100Ah для солнечной станции купить» from 0.22 (just
under the bar) to 0.42. Text with no letters from another script is passed
through untouched. A first version that also rewrote pure-Cyrillic text
(dropping punctuation) lost a long pure-Russian title, so the rewrite is
restricted to mixed text.

The one cost, «Реле напряжения ColorWay DS1, белое» (Cyrillic span 21
characters, now under the floor), is smaller than it looks. On Google that
card carries `sl=ru`, and the declared path decides it. That path is
franc-free (`packages/lang-detect/src/declared.ts`), so this change doesn't
touch it, and the extension test that pins the card concealed
(`content-conceal.test.ts`, "still conceals a card declared ru") is a
declared-path test. What's left is an undeclared shop card whose only
Cyrillic is under 24 characters, which is the same recall floor as plain
short Cyrillic text today.

The floor stays 24. A floor of 20 on the span would keep ColorWay (21), but
«Володимир Зеленський» is exactly 20 characters. Two data points that close
are not a calibration.

## Decision (proposed)

### 1. Partitioned scoping: a discriminating minority beats a non-discriminating majority

In langtell's `classifyBySnippet`, after the dominant-script scope:

- if the dominant scope has **one** candidate (non-discriminating), **and**
- another script present in the text has **≥ 2** candidates, **and**
- that script's span has **≥ `MINORITY_MIN_LETTERS`** letters (start at 8;
  «Самые дешевые» clears it, a quoted word like «привет» doesn't),

then classify the minority span alone, with rungs 1–2 only. A rung-1/2 verdict
there wins. `unknown` or a rung-3-only result falls back to today's verdict
unchanged.

Why this shape and not a share threshold:

- It names the actual defect (a lone candidate's win is not evidence) instead
  of moving a cut-off. The share policies miss the iPhone title and would need
  re-tuning for every new pattern.
- It is a **no-op wherever the dominant script discriminates**: a roster with
  `en` + `de`, or any Cyrillic-majority text, behaves exactly as today. That
  limits the blast radius for langtell's other consumers and for Movar Audit
  (`packages/audit-engine/src/detect.ts` also calls `scopeCandidates`).
- Rung 3 is excluded from the minority span: a minority span is short by
  definition, and short spans are where franc misreads Ukrainian names
  (class b).
- It can only turn a `en`/non-discriminating keep into a rung-1/2 verdict that
  must still clear `minHideMargin`. It never removes a hide.

Ship it in langtell as an **opt-in option** (e.g. `classifyBySnippet(text,
candidates, rung3, { minorityScript: true })`), default off, so langtell's
semver contract holds and movar turns it on deliberately. Promote it to the
default in a later langtell minor once movar has run it.

### 2. Fused path: a non-discriminating text read does not override a declaration (deferred)

In langtell's fuser, a text verdict with `discriminating: false` is treated as
weak (it neither confirms nor contradicts a declaration in another script).
Then `sl=ru` plus a Latin-majority title decides by the declaration, which is
how the fused path already handles thin text.

Guard against over-hiding Ukrainian: a Ukrainian card mislabeled `sl=ru` still
carries `і/ї/є/ґ` in its Cyrillic span, which partitioned scoping (decision 1)
reads as a discriminating `uk` and which overrides the declaration as today. A
Latin-only card mislabeled `sl=ru` would now be hidden. That needs Google to
label a non-Russian result `ru`, which the `google.ts` capture never showed,
but it is the one new over-hide path and is measured in the shadow period (Rollout, step 2).

### 3. franc reads only the script it is judging

When rung 3 runs over a scope and the text also carries letters of another
script, franc receives the in-scope span: the in-scope words, joined by
spaces. `RUNG3_MIN_LENGTH` (24) is applied to that span. Text with no
out-of-scope letters is passed through unchanged. That's the common case, and
its verdicts are byte-identical to today's.

The same span feeds `francOracle` and `francResidualVerdict`
(`classify-franc.ts`), so the diagnostics shadow oracle and the worker's
residual path judge exactly what the classifier judged. These scope via
movar's own wrapper, so movar changes them in the same PR.

Same opt-in as decision 1 (one langtell option covers both), since both are
"evidence from one script must not decide another".

### 4. Fixtures before code

Both labeled corpora (74 titles) become committed fixtures
(`apps/extension/src/lib/mixed-script-conceal.test.ts`, through the real conceal
gate), with **every Ukrainian and English title asserted kept**, Zelensky
included. That is the over-hide guard, and it must
pass before and after. The reported title, the iPhone title and «Аккумулятор
LiFePO4 …» are asserted hidden. Recall-floor titles and ColorWay-undeclared
are recorded as known misses, not asserted either way.

## Rollout (≈ 500 users)

Any classifier change can over-hide Ukrainian content, which would be
the worst outcome for current users. So the change goes through gates in order:

1. **Offline gate.** langtell PR with the option, unit tests, and the corpus
   above. Movar PR bumps langtell, enables the option, adds the fixture set.
   Both suites green, including `classify-shipped-candidates.test.ts`,
   `corpus-content.test.ts` (real page captures) and the e2e offline suite.
   Pass condition: **zero** changed verdicts on any `uk`/`en` fixture.
2. **Shadow period.** The diagnostics dev extension (never published) runs the
   old and new policy side by side on real browsing and logs every card where
   they disagree, for about a week of the maintainer's normal Google/YouTube use.
   Pass condition: every disagreement is a Russian card (or the accepted bg
   case) becoming hidden, or a non-Russian card becoming kept. Any card that
   becomes hidden and isn't Russian stops the rollout.
3. **Patch release** with a changeset and bilingual release notes ("hides
   Russian results whose titles are mostly product names; no longer hides
   English results that mention a Ukrainian name").
4. **Rollback path.** Turning the option off is a one-line revert and a patch
   release. Nothing persists on users' devices that depends on it.

## Considered alternatives

- **Share threshold (Cyrillic ≥ ⅓ → Cyrillic).** Simple and safe on the corpus,
  but a cut-off rather than a principle: it misses titles whose Cyrillic share
  is under the threshold and changes behavior for every consumer, including
  rosters where Latin discriminates.
- **Discount code-like Latin tokens** (digits: `48V`, `6k5va`, `S24`). Fixes
  the reported title by luck: «Самые дешевые | Victron MultiPlus Inverter
  Charger» would leak again.
- **Fix it in the extractor** (feed more of the card, e.g. the snippet, so
  Cyrillic outweighs the product name). Helps on Google only, depends on
  snippet anchors that rotate, and wider samples pull in UI-language chrome:
  the reason sponsored ads classify on their headline alone (`google.ts`).
- **Rung-3 floor on in-scope letters, franc still reads the whole string.**
  Fixes Zelensky at the same cost (ColorWay) but gains nothing, because franc
  keeps reading model numbers as trigram noise.
- **Hide if any script segment reads `ru`.** Highest recall, but it hides an
  English card that quotes a Russian phrase, which goes against the
  quote-scrubbing invariant in `packages/lang-detect/AGENTS.md` ("a page
  quoting Russian is not a Russian page").

## Open questions

- Is ColorWay-undeclared (a short Cyrillic shop title with no `sl` link)
  common enough to matter? The shadow period's disagreement log answers it.
- `MINORITY_MIN_LETTERS`: 8 is the smallest value that catches the reported title.
  Raise it if the shadow period shows noise.
- Should `be` join the shipped roster for users who'd want it? Out of scope
  here, since #103 settled the default, but partitioned scoping extends that
  tradeoff to mixed titles.
- Once the option is the langtell default, movar can drop the explicit flag.
