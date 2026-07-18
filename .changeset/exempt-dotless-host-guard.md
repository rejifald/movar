---
'@movar/extension': patch
---

Hide the popup's "Always skip this site" action on hosts that can't be stored as an exempt domain. A dotless host such as `localhost` or an intranet name is dropped by the allowlist's canonicaliser at the storage boundary, so offering the action there previously reloaded the tab without exempting anything. The popup now gates the affordance on `isStorableDomain`, matching the rule the settings boundary applies.
