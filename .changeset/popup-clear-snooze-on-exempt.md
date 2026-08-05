---
'@movar/extension': patch
---

popup: clear a host's active snooze when escalating to "Always skip this site" or "Turn on for this site", so later un-exempting the host resumes Movar immediately instead of leaving it inert until the stale snooze window expires. Closes #298.
