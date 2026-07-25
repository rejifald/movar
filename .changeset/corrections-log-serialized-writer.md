---
'@movar/extension': patch
---

events: funnel correction-log appends through a single serialized writer in the background service worker, fixing a cross-tab lost-update race where two tabs recording corrections concurrently could drop one tab's append (undercounting the on-device insights dashboard). The previous per-tab `applyingInFlight` guard only serialized within a single tab. Closes #310.
