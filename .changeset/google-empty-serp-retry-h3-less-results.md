---
'@movar/extension': patch
---

fix(google): count `data-hveid` result cards, not `<h3>` titles, for the empty-SERP retry — a shopping/product-only SERP (title rendered as a `role="heading"` div, no `<h3>` anywhere on the page) was misread as zero results, firing a spurious retry that suspended the Google redirect rule, stripped the `lr` language filter, and forced an unwanted navigation on an already-healthy page.
