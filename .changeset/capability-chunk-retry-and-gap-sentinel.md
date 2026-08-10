---
'@movar/extension': patch
---

Recover from a failed capability-chunk load instead of disabling concealment for the page's life, and leave a diagnosable mark when it happens.

A dynamic `import()` that failed was memoized as `null`, so one transient miss (cold service worker, a chunk fetch racing a navigation) permanently switched content filtering off in that tab — and the facade's `!contentModel` early return left no trace, producing a DOM identical to a clean, fully-scanned page. Failures are no longer cached, and each retry gets a distinct module specifier (`?retry=N`), because the realm's module map replays a stored import failure without issuing a new fetch — so evicting only our own cache would have retried straight into the cached error. A tick that still cannot provision what concealment needs now stamps `data-movar-capability-gap` on `<html>` with the missing chunk paths, cleared as soon as a later tick succeeds.
