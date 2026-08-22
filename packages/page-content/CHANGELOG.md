# @movar/page-content

## 0.1.1

### Patch Changes

- 38f5c06: Read Google's own source-language verdict off a result's "Translate this page" link, and carry it as the card's declared language.

  Google injects that link only for a result whose language differs from the interface language, and its href spells the verdict out: `translate.google.com/translate?u=…&sl=ru&tl=uk`. Verified against a live SERP — every Russian card carried `sl=ru`, every Ukrainian card had no link at all — which makes `sl` a declared-language signal of the same class as `data-rl` and the `lang` attribute the model already reads. Until now the link was recognised only as chrome to prune.

  It matters for shop cards whose own content is product noise — «Реле напряжения ColorWay DS1, white (CW-VR16-01D)» — with no Russian-distinctive letter for rungs 1–2 and too little prose for franc, which ranked such cards `ru` at a margin of 0.02–0.08 against a 0.22 hide bar and kept them. Measured on a live page-3 capture: exactly one card changes, the spec-noise Russian one, while the Ukrainian result stays kept.

  Unlike a `lang`/`data-rl` declaration, `sl` deliberately does NOT narrow the classification sample — the whole-card fallback still applies. Narrowing would leave a card whose `sl` is wrong and whose snippet anchor rotated with a title too thin to correct it, concealing a mislabeled Ukrainian result on Google's say-so; the fusion's "confident text overrides the declaration" rule keeps mixed-language and mislabeled cards visible, per the block-only asymmetry in docs/per-snippet-language-detection.md.

## 0.1.0

### Minor Changes

- 48d65c1: page-content: cover YouTube's polymer→wiz "view-model" migration and the channel Posts surface.

  Three main surfaces had silently stopped extracting: watch-sidebar recommendations and the /results Mix card are `yt-lockup-view-model` now, the Shorts shelf is `grid-shelf-view-model` with `ytm-shorts-lockup-view-model` tiles (desktop AND mobile), and m.youtube.com tiles lost their `[id="video-title"]` anchor. Both markup generations are covered: classic shapes gain an `h3` fallback consulted only when the classic anchors yield nothing, view-model cards classify on their single `<h3>` title alone (the byline bakes channel names together with UI-language view-count/date chrome), kind resolves per element (collection thumbnail → playlist, shorts-less grid shelf → shelf), and a Google-style outermost-wins dedup collapses nested cards onto the unit the user sees. The channel Posts surface (`ytd-backstage-post-renderer`) is modelled with the reserved `post` kind, sampling `#content-text` alone. Real-capture corpus fixtures pin every new surface with classifier-verified verdicts.

### Patch Changes

- Updated dependencies [48d65c1]
  - @movar/host-match@0.2.0

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
