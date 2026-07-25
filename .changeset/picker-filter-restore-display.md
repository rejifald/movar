---
'@movar/extension': patch
---

picker-filter: restore a hidden picker link's original inline `display` (and its priority) on reveal/teardown instead of unconditionally removing it — previously `removeProperty('display')` wiped an element's own inline display, shifting layout or leaving CSS-`display:none` elements invisible after "Show hidden options"/"Show everything". Closes #300.
