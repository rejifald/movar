---
'@movar/lang-detect': patch
'@movar/extension': patch
---

Judge each script of a mixed-script result on its own evidence (langtell `isolateScripts`).

- A Russian clause next to a longer Latin product name is now read as Russian. «Самые дешевые в Украине | Victron Multiplus II 48V 6k5va» used to be decided by the lone Latin candidate (`en`) because 22 Latin letters outvoted 20 Cyrillic, and was kept.
- franc reads only the Cyrillic words of a mixed title, and its 24-character floor is measured on them. «Interview with Володимир Зеленський on CNN» was hidden as `ru` because the English lifted a 20-character Ukrainian name over that floor. It is now kept.

Applied once in `@movar/lang-detect` (`MOVAR_CLASSIFY_OPTIONS`), so the extension, Movar Audit, the diagnostics panel and the Safari host app all classify the same way. Measured over 629 strings, no Ukrainian or English title is concealed (one was before). See docs/mixed-script-snippets.md.
