---
'@movar/extension': patch
---

loop-guard/session-choice: persist migrated legacy storage entries with a fixed timestamp on first read, so a pre-#184 legacy entry can finally cross SUPPRESSION_TTL_MS and TTL-expire. Previously each read re-derived `ts: now`, keeping migrated entries immortal — a bounced language switch could bail forever and a stale session pick could pin a host to a blocked language indefinitely. Closes #304.
