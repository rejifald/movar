---
'@movar/extension': patch
---

Fix content filtering (concealment) silently not working on iOS/Safari.

The dynamic capability chunks the content script imports at runtime via `runtime.getURL` — `features/conceal.js`, `features/curtain-ui.js`, and the per-site `models/*.js` — were emitted into the Safari build output and rsynced onto disk, but `features/` and `models/` were never registered as folder references in `Movar.xcodeproj`. Xcode only bundles referenced folders, so both directories were dropped from the built `.appex`: on-device, `import(runtime.getURL('features/conceal.js'))` 404'd and `capability-loader`'s `.catch(() => null)` turned it into a silent no-op, leaving concealment dead on iOS while the Accept-Language language switch (a background DNR rule, not a content-script chunk) kept working. Register `features/` and `models/` as folder references in both extension targets, and add a post-sync guard to `sync-safari-resources.mts` that fails the build if any emitted output directory lacks a folder reference, so the drift can't recur unnoticed.
