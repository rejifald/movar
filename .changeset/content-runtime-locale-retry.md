---
'@movar/extension': patch
---

content-runtime: don't memoize a failed content-locale/message load, so a retry can re-attempt loadContentMessages instead of permanently pinning hide-mode live-region strings to English after a transient first-load failure. Closes #316.
