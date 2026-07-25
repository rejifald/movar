---
'@movar/page-content': patch
---

page-content/serialize: stop misclassifying inline `<svg>` elements as hidden. `isHiddenElement` now guards the `hidden` IDL check with `el instanceof HTMLElement` (the `hidden` property doesn't exist on `SVGElement`), so a container whose only remaining visible content is a lone `<svg>` icon is no longer judged empty and hard-hidden. Closes #291.
