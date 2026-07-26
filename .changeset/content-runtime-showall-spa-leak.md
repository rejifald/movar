---
'@movar/extension': patch
---

content-runtime: reset the per-page "Show everything on this page" override on SPA navigations instead of letting it leak across a same-pathname route change, so Movar isn't silently disabled on the new page. Closes #314.
