---
'@movar/extension': patch
---

Make the "content hidden" curtain responsive so it works over inline and short targets, not just roomy block cards.

Cover mode positioned the curtain with `position:absolute; inset:0` and clipped it with `overflow:hidden`, which only works when the target is a block box. Over a bare `display:inline` target the overlay got a 0-width containing block (and `overflow` is a no-op on inline boxes), so the pill escaped its target; over short block rows (e.g. Google's «Схожі запитання» / "People also ask") the fixed-height vertical pill overflowed and several pills piled into one strip. Inline targets are now promoted to `inline-block` so the overlay has a content-sized box to fill and clip (kept inline in the flow, host still a child of the target), and the pill is a size-query container that collapses to a single-line bar — shedding the description, then the secondary action, then the title — as the target gets short or narrow.
