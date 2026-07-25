---
'@movar/lang-detect': patch
---

lang-detect/chrome-ai: reject Chrome's `und` (undetermined) result and validate the detected code against the known LanguageCode set before returning, mirroring the franc engine — so an undetermined result is treated as "no detection" instead of a positive `und` that violates the type contract and defeats the loop guard. Closes #305.
