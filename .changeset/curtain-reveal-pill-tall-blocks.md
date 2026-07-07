---
'@movar/extension': patch
---

Keep the conceal curtain's reveal control visible on tall blocks (e.g. Google's AI Overview).

The cover curtain centered its reveal pill in the target's box. Sites collapse tall blocks to a short preview — Google's AI Overview shows about one screenful with a "show more" while the concealed element stays 700–1300px tall in the DOM — so the centered pill landed in the collapsed-away region and was clipped out of view. The result was blurred content with no reachable "Show" control at any scroll position. The pill is now anchored to the top of the block, keeping it in the visible band regardless of the block's full height. (Complements the short/inline-target responsiveness added alongside it.)
