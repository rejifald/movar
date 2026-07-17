---
'@movar/extension': patch
---

Stop the MV3 service worker crashing on every page load. The background process crashed with an error on each navigation — surfacing an "Errors" badge in chrome://extensions — because the language-detection library touched the page's DOM from a background context that has none. It was most noticeable on sites where Movar doesn't otherwise act, since the console error was the only sign anything was wrong. Language detection behaves exactly as before.
