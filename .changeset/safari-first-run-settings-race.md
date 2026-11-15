---
'@movar/extension': patch
---

Safari: a setting changed in the Movar app before Safari's first launch (such as turning
on hiding of Russian content) is no longer lost when the extension starts for the first
time. First-run setup now adopts the app's settings before it fills in any defaults, and
the extension's syncs with the app run one at a time instead of overlapping.
