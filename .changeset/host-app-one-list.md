---
'@movar/extension': minor
'@movar/safari-host-app': minor
'@movar/audit-engine': minor
---

The Safari app becomes one list instead of three tabs. On iPhone it opens on «Мовар»:
the Safari setup card until you confirm it, then Movar Audit with this session's audits,
then your language settings, each opening its own screen. On Mac the same list is the
window's sidebar, and its status row shows whether the extension is on, with a button
that opens Safari's settings. The language Detector is removed from the app, and the
engine drops its `detect.*` messages.
