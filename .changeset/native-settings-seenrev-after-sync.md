---
'@movar/extension': patch
---

native-settings (Safari): advance `seenRev` only after the `storage.sync` write succeeds during host-app settings adoption, so a rejected sync write (quota, rate-limit, transient iCloud unavailability) no longer silently drops the host app's change — the reconcile now catches the failure, leaves `seenRev` behind, and re-adopts on the next wake. Closes #315.
