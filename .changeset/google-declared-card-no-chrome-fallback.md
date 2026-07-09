---
'@movar/extension': patch
---

Stop a `lang`-declared Google result (product/shopping cards, whose title is a `role="heading"` div, not an `<h3>`) from surviving on leaked interface-language chrome. These cards are recovered by Google's own per-result `lang` label and folded into the organic bucket — but they were still run through the whole-card fallback that widens the classification sample when the title+snippet allow-list comes up short, and that fallback re-admits Google's Ukrainian UI chrome (the "Люди також шукають" pivots, the store-review prompt, the rich-annotation row). A confident interface-language read then overrode the reliable `lang="ru"` declaration and the card was kept.

Two live shapes triggered it, both because the allow-list under-captures the result's own text: an inline thumbnail row occupies `data-sncf="1"` (the snippet's usual slot) and shifts the Russian snippet to `data-sncf="2"` — which the fallback prunes as "chrome" — so the sample became pure chrome; and a short snippet (under the fallback's min-chars bar) let the pivots outweigh it. Both classified as Ukrainian and the `ru` card slipped through.

Declared cards now classify from their title+snippet allow-list ALONE, with no whole-card fallback — the same rule sponsored ads and AI-source cards already follow, and the behaviour the module already documented as its intent. When the allow-list is empty or short, the card falls to its `lang` declaration (which the fused gate decides on), never to leaked chrome; a card whose snippet the allow-list does capture still corrects a genuine mislabel via that text.
