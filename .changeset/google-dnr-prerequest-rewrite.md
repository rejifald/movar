---
'@movar/extension': minor
---

Rewrite Google search URLs BEFORE the request leaves the browser, via a `declarativeNetRequest` dynamic redirect rule (Chrome/Firefox).

The `/search` language rewrite (`hl`, pipe-joined `lr`, plus stripping Google's opaque session tokens `sei`/`gs_lcrp`/`aqs`/`rlz` and the enumerated `gs_*` family) previously ran only in the content script — after the raw entry request had already been served. That cost a visible double load on every omnibox/homepage search, and the raw request, carrying Chrome's pre-rewrite `gs_lcrp` context token, could seed the server-side "pinned candidate set" that intersects with the `lr` filter down to zero organic results. The new dynamic rule (id 2, generated from the same site-rule gates and regenerated on every settings/pause/snooze change like the Accept-Language rule) redirects the navigation network-side with `queryTransform`: one page load per search, and the poisoned request never reaches Google. The transform is idempotent (same-URL redirects are skipped, pinned by e2e), `/maps` and q-less URLs never match, and the content-script rewrite stays as the fallback for Safari (excluded: known `queryTransform` bugs), denied host permission, and prefix-scrubbing new `gs_*` tokens; the empty-SERP retry keeps covering pins seeded by vectors the rule can't see.
