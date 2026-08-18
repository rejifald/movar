---
'@movar/extension': patch
---

Stop calling Belarusian text Ukrainian when Belarusian isn't on the roster.

Both detectors counted only what a candidate uniquely **owns** — evidence that can only argue _for_ someone. Against the roster a Ukrainian reader gets by default (`{uk, ru}` after script scoping), Belarusian spent its `і`s electing Ukrainian, while `ы`, `ў` and `э` — letters Ukrainian does not have at all — were owned by nobody, counted for nobody, and stopped nothing. `Мова і культура Беларусі маюць багатую гісторыю` came back `uk` at rung 1; `Гэта цікавая кніга і добры фільм` came back `uk` 5-to-1.

langtell 0.6.1 adds the missing half: a winner whose own alphabet cannot account for 2% of the text's letters loses to `unknown`, in `classifyBySnippet` and in the `detectCyrillicLanguage` fast path alike. The runner-up is not promoted — a set that cannot spell the text does not get a second guess at it. Adding Belarusian to the Detector's roster still resolves the same snippets to `be`.

It was never Cyrillic-only: German, French, Polish and Turkish prose all came back `en` against the same roster, and now abstain too.

Incidental foreignness is left alone: an article quoting its neighbour runs 0.3–0.9% and a borrowed proper noun 1.4–1.5%, both well under the line, so a Ukrainian page quoting Russian is still Ukrainian and a Russian page about Kazakhstan is still Russian.
