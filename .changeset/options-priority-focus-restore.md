---
'@movar/options-ui': patch
'@movar/ui': patch
---

options: restore keyboard focus after reordering or removing a priority language, so keyboard/screen-reader users no longer get dropped to <body> when a move lands on a boundary or a row is removed (WCAG 2.4.3). Closes #313.
