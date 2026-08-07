# @movar/page-content

## 0.0.2

### Patch Changes

- 55b2740: page-content/serialize: stop misclassifying inline `<svg>` elements as hidden. `isHiddenElement` now guards the `hidden` IDL check with `el instanceof HTMLElement` (the `hidden` property doesn't exist on `SVGElement`), so a container whose only remaining visible content is a lone `<svg>` icon is no longer judged empty and hard-hidden. Closes #291.
- Updated dependencies [c4689b0]
- Updated dependencies [3a5ca20]
- Updated dependencies [afa3888]
  - @movar/lang-detect@0.0.1
  - @movar/host-match@0.1.1

## 0.0.1

### Patch Changes

- 4a87fd1: Stop the Google AI Overview curtain from hiding an adjacent «Рекламовані товари» (sponsored products) carousel.

  The extractor climbs from the AI Overview's `data-rl` label up to the whole answer unit, stopping at the first "landmark" (an organic result, People-also-ask row, text ad, or `#rso`). Google's sponsored product-listing carousel (`data-pla`, in the `#atvcap`/`#tvcap` ad rails) was none of those, so when the answer and the carousel shared an ancestor sitting outside `#rso`, the climb walked past the carousel and the answer's curtain concealed the still-valid products too. The carousel is now a climb landmark (`[data-pla]`, the same durable ad-disclosure `data-*` family as the existing `[data-text-ad]`) — a boundary only, never concealed itself, since a carousel mixes many products in possibly-mixed languages.

- Updated dependencies [623abba]
- Updated dependencies [623abba]
  - @movar/host-match@0.1.0
