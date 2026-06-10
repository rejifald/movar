---
'@movar/host-match': patch
---

Strip Google's `sei` query parameter on `/search` URL rewrites. `sei` is an opaque session-event token Google appends to SERPs after the first interaction in a session; it carries prior-session locale bias forward and can pull subsequent results back toward the earlier session's language even with `hl=uk&lr=lang_uk` set. Dropping it on every rewrite ensures each query is judged on its own `hl`/`lr` + Accept-Language signals.

Adds an optional `stripParams: readonly string[]` field to the `searchParams` strategy type. The Google rule sets it to `['sei']`. Other strategies are unchanged.
