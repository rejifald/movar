# @movar/lang-detect

## 0.0.1

### Patch Changes

- c4689b0: lang-detect/chrome-ai: honor the AbortSignal / detection time budget so a hung on-device model no longer stalls detection past the intended deadline — an aborted or over-budget detection now resolves to "no detection" instead of blocking. Closes #292.
- 3a5ca20: lang-detect/chrome-ai: reject Chrome's `und` (undetermined) result and validate the detected code against the known LanguageCode set before returning, mirroring the franc engine — so an undetermined result is treated as "no detection" instead of a positive `und` that violates the type contract and defeats the loop guard. Closes #305.
