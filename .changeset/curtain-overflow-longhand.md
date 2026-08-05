---
'@movar/extension': patch
---

curtain: snapshot and restore a site's inline `overflow-x`/`overflow-y` longhands individually when covering/revealing content, so revealing a cover-curtain no longer permanently strips an element's own single inline overflow longhand (e.g. `overflow-y: auto`). Closes #302.
