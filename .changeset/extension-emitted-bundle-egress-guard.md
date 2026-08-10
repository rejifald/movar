---
'@movar/extension': patch
---

extension: fail the build on any network-egress primitive in the EMITTED bundle, not just in our own source. `assertNoNetworkEgress` (wxt.config.ts `build:done`) scans every emitted `.js`/`.html` for `fetch` / `XMLHttpRequest` / `WebSocket` / `sendBeacon` / `EventSource`, closing the gap its source-side companion (`scanForEgress` in scripts/lib/promises.mts) can't reach: a dependency could bundle a request into the shipped package without a line of our code changing. It asserts absence with no allowlist, which is why `vite.build.modulePreload.polyfill` is now `false` — that polyfill's cache-warming `fetch()` was the single (benign) egress call in the artifact, and every browser Movar targets has native modulepreload well below its MV3 floor, so dropping it costs a preload hint at worst.
