---
'@movar/extension': patch
---

Fix video clicks being aborted on YouTube search results. Clicking a video on `/results` is a same-document Navigation API push to `/watch`, and the browser fires the location-change event _before_ the navigation commits — while `location.href` still reads `/results`. Movar re-applied its `hl`/`gl` search-params rewrite to that stale URL and `location.replace()`d, clobbering the click, so the page blinked and the video never opened. The re-evaluation after a client-side URL change now waits for the navigation to commit before resetting guards or re-running, so the enforce-mode rewrite can no longer abort an in-flight click.
