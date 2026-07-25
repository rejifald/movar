---
'@movar/extension': patch
---

content-conceal: don't leave cards marked CHECKED when a scan is superseded, so a subsequent scan correctly re-evaluates them instead of permanently skipping cards that should be (re-)assessed for blocking. Closes #289.
