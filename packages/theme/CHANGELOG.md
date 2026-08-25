# @movar/theme

## 0.0.1

### Patch Changes

- 065f597: Stop the conceal curtain rendering two different collapse tiers on cards a reader sees as the same size, and fix the overflow the old fold could not express.

  Reported on YouTube's watch-page right rail: two visually identical cards, one showing the full vertical card and its neighbour the compact bar. The rail is the reason. It does not hold one card size — measured at a 980px window it holds both 320×120 and 320×113, a 7px difference between siblings — and its height tracks the window, running a content box of 93px at 980 through 125 at 1100 to 130 at 1280 and up. The fold sat at 104px, inside that range, so at the width where the rail's two variants straddled it they rendered as different tiers side by side.

  Widening the gap around the old value cannot fix this, because there is no gap: measured across surfaces and window widths, YouTube's cards are a continuum — rail 93–130, search results 149–217, home grid 235–291. Every `@container movar-cover` threshold now snaps to `containerBand`, a new power-of-two ladder in `@movar/theme` (16 → 1024), and the fold moves up to the `lg` rung (256) so it clears that whole distribution instead of sitting inside it. The rail is now the same tier at every window width, and the width rungs (`xl`/`lg`/`md` = 512/256/128) sit well clear of real card widths.

  The move also closes a shipped overflow bug. The vertical card is not a fixed height — 87px normally, 113px once the description wraps to two lines, 129px once the actions wrap too — so a `max-height` fold was approximating a fit constraint that depends on width, and a 132×135 target rendered a 129px card into a 113px box. Sweeping 399 target sizes against the real stylesheet: the shipped rungs clip 4 of them, the new rungs clip none. Folding at 256 puts the card tier's floor an order above the card's own tallest form, so nothing that reaches that tier can be too short to seat it, whatever its width.

  Trade-off worth knowing: with the fold at 256, YouTube cards render the compact bar rather than the vertical card, so the "Російською мовою" reason line now appears only on targets taller than ~278px. A size container is queried on its content box, so every rung fires at the rung plus the curtain's 20px padding — the numbers in the CSS are not the target sizes. A unit test pins each threshold to a ladder rung so none can drift back to a hand-measured value, and the `curtain-tiers` visual baselines were regenerated (the fixture's full-card tile grew to 320×320, since a 220px card is a bar by design now).
