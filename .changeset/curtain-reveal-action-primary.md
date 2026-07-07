---
'@movar/extension': patch
---

Keep the content curtain's "Show" reveal action reachable as the pill collapses on short or narrow cards. "Show" is now the pill's primary action, so it survives the responsive collapse (which sheds the secondary "Hide all" first) instead of being dropped alongside it at the very first step — previously a short or narrow concealed card could end up blurred with no in-place way to reveal it.
