---
'@movar/extension': patch
---

background/dnr: on service-worker wake, respect an active empty-SERP-retry suspension instead of unconditionally re-installing the Google redirect rule — so a SW restart mid-retry no longer re-rewrites the retry request and defeats the empty-SERP recovery. Closes #301.
