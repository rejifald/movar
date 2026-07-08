---
'@movar/extension': patch
---

Strip Google's `gs_lcrp` query parameter on `/search` URL rewrites, alongside the existing `sei` strip. `gs_lcrp` is an opaque per-omnibox-session context blob Chrome attaches before this rewrite runs; left in place, it pinned Google's serving to a candidate set computed under the pre-rewrite (often Russian-leaning) language context, and intersecting that pinned set with the `lr` filter could produce zero organic results for an otherwise healthy query. Confirmed by direct testing: removing only `gs_lcrp` took one affected query ("Реле напруги") from 0 results to ~1M, with `hl`/`lr` unchanged.

Previously this looked like a language-classifier gap and was documented as an accepted trade-off; it wasn't — `lr=lang_uk` and even the joined `lr=lang_uk|lang_en` both return results once `gs_lcrp` is gone.
