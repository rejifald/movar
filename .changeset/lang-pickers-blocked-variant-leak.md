---
'@movar/extension': patch
---

lang-pickers: treat regional variants of a blocked language as blocked (e.g. `pt-BR` when `pt` is blocked), so a blocked language no longer leaks through a picker's regional-variant links. Closes #293.
