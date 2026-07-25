---
'@movar/extension': patch
---

security: validate the language-switch redirect target's scheme before navigating — Movar now only follows `http:`/`https:` alternates from a page's `hreflang`/picker links, closing a confused-deputy open-redirect where an injected `<link rel="alternate">` could force an off-site navigation. Closes #306.
