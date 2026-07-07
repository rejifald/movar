---
'@movar/extension': patch
---

Collapse the content-hidden curtain to a single eye symbol at its smallest size, and keep the reveal control reachable all the way down. The cover pill's responsive collapse gains a floor tier: on a target too small for even the icon plus one action (short and ≤132px wide), it folds down to just the slashed-eye mark, so a tiny concealed element still shows a clear "hidden" marker instead of an overflowing or clipped pill. The "Show" reveal action is now the pill's primary action, so it survives the collapse (which sheds the secondary "Hide all" first) instead of vanishing with it — previously both actions were dropped at the first collapse step, stranding the blur on short or narrow cards with no in-place way to reveal.
