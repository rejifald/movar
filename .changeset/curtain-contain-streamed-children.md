---
'@movar/extension': patch
---

Keep the conceal curtain over content a site streams in after it attaches (e.g. Google's AI Overview).

A cover-mode curtain only blurred and made `inert` the children that existed at the moment it attached. Google's AI Overview declares its block early — so Movar can conceal it before the answer's language is even visible — then streams in its header, "show more" and the ⋮ overflow menu afterward. Those late nodes escaped the curtain: they stayed crisp and focusable on top of the overlay and occluded the curtain's own "Show" button. The curtain now watches its target with a `MutationObserver` and applies the same aria-hidden + inert + blur to any child added after attach (leaving its own host reachable, and disconnecting the observer on detach).
