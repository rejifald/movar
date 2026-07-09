---
'@movar/page-content': patch
---

Stop the Google AI Overview curtain from hiding an adjacent «Рекламовані товари» (sponsored products) carousel.

The extractor climbs from the AI Overview's `data-rl` label up to the whole answer unit, stopping at the first "landmark" (an organic result, People-also-ask row, text ad, or `#rso`). Google's sponsored product-listing carousel (`data-pla`, in the `#atvcap`/`#tvcap` ad rails) was none of those, so when the answer and the carousel shared an ancestor sitting outside `#rso`, the climb walked past the carousel and the answer's curtain concealed the still-valid products too. The carousel is now a climb landmark (`[data-pla]`, the same durable ad-disclosure `data-*` family as the existing `[data-text-ad]`) — a boundary only, never concealed itself, since a carousel mixes many products in possibly-mixed languages.
