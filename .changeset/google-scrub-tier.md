---
'@movar/extension': patch
---

Add a second, non-navigating "scrub" tier to the `searchParams` strategy and use it on the Google rule: `scrubPrefixes: ['gs_']` and `scrubParams: ['aqs', 'rlz']` are dropped whenever a rewrite navigation is already happening, but — unlike `stripParams` — never trigger a navigation by themselves. Entry URLs (omnibox, homepage form) never carry `lr`, so they always rewrite and always get scrubbed; SERP-box refinements that carry `gs_lp` with `hl`/`lr` already correct stay put, costing zero extra page loads. This future-proofs against the bug class behind the `sei` and `gs_lcrp` fixes (opaque pre-rewrite session tokens pinning results against the `lr` filter) without an allowlist's silent-breakage risk. Audit, live-test evidence, and the vetting method are documented in docs/google-search-url-params.md.
