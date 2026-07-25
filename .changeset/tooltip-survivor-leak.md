---
'@movar/extension': patch
---

tooltip: detach a surviving link's tooltip (host + registry entry) when the link later becomes hidden or is SPA-replaced, instead of skipping it — fixing a bounded per-session detached-DOM / registry leak that accumulated on dynamic picker sites until the feature was turned off. Closes #303.
