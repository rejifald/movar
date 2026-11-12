---
'@movar/extension': patch
---

Fix Google searches failing with "too many redirects" when something else already filters out Russian results.

If another extension (or a proxy) puts `lr=(-lang_ru)` on Google search URLs, that rule and Movar's network-layer redirect kept rewriting `lr` back and forth until Chrome gave up with ERR_TOO_MANY_REDIRECTS. Google search only worked again once Movar was snoozed on the site. Movar now leaves a Google `lr` that already excludes Russian alone, in both the network-layer redirect and the in-page rewrite. A positive Russian filter (`lr=lang_ru`) is still replaced.
