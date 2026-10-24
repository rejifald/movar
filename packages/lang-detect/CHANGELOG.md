# @movar/lang-detect

## 0.0.2

### Patch Changes

- 9922003: Judge each script of a mixed-script result on its own evidence (langtell `isolateScripts`).
  - A Russian clause next to a longer Latin product name is now read as Russian. «Самые дешевые в Украине | Victron Multiplus II 48V 6k5va» used to be decided by the lone Latin candidate (`en`) because 22 Latin letters outvoted 20 Cyrillic, and was kept.
  - franc reads only the Cyrillic words of a mixed title, and its 24-character floor is measured on them. «Interview with Володимир Зеленський on CNN» was hidden as `ru` because the English lifted a 20-character Ukrainian name over that floor. It is now kept.

  Applied once in `@movar/lang-detect` (`MOVAR_CLASSIFY_OPTIONS`), so the extension, Movar Audit, the diagnostics panel and the Safari host app all classify the same way. Measured over 629 strings, no Ukrainian or English title is concealed (one was before). See docs/mixed-script-snippets.md.

## 0.0.1

### Patch Changes

- c4689b0: lang-detect/chrome-ai: honor the AbortSignal / detection time budget so a hung on-device model no longer stalls detection past the intended deadline — an aborted or over-budget detection now resolves to "no detection" instead of blocking. Closes #292.
- 3a5ca20: lang-detect/chrome-ai: reject Chrome's `und` (undetermined) result and validate the detected code against the known LanguageCode set before returning, mirroring the franc engine — so an undetermined result is treated as "no detection" instead of a positive `und` that violates the type contract and defeats the loop guard. Closes #305.
