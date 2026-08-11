---
'@movar/page-content': patch
---

Read Google's own source-language verdict off a result's "Translate this page" link, and carry it as the card's declared language.

Google injects that link only for a result whose language differs from the interface language, and its href spells the verdict out: `translate.google.com/translate?u=…&sl=ru&tl=uk`. Verified against a live SERP — every Russian card carried `sl=ru`, every Ukrainian card had no link at all — which makes `sl` a declared-language signal of the same class as `data-rl` and the `lang` attribute the model already reads. Until now the link was recognised only as chrome to prune.

It matters for shop cards whose own content is product noise — «Реле напряжения ColorWay DS1, white (CW-VR16-01D)» — with no Russian-distinctive letter for rungs 1–2 and too little prose for franc, which ranked such cards `ru` at a margin of 0.02–0.08 against a 0.22 hide bar and kept them. Measured on a live page-3 capture: exactly one card changes, the spec-noise Russian one, while the Ukrainian result stays kept.

Unlike a `lang`/`data-rl` declaration, `sl` deliberately does NOT narrow the classification sample — the whole-card fallback still applies. Narrowing would leave a card whose `sl` is wrong and whose snippet anchor rotated with a title too thin to correct it, concealing a mislabeled Ukrainian result on Google's say-so; the fusion's "confident text overrides the declaration" rule keeps mixed-language and mislabeled cards visible, per the block-only asymmetry in docs/per-snippet-language-detection.md.
