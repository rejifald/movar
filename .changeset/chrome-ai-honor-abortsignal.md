---
'@movar/lang-detect': patch
---

lang-detect/chrome-ai: honor the AbortSignal / detection time budget so a hung on-device model no longer stalls detection past the intended deadline — an aborted or over-budget detection now resolves to "no detection" instead of blocking. Closes #292.
