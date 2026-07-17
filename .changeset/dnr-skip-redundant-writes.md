---
'@movar/extension': patch
---

Skip declarativeNetRequest writes whose outcome is already installed. The background resync — which re-runs on every service-worker wake, settings change, pause/snooze flip, and alarm expiry — previously rewrote both dynamic rules (Accept-Language, Google /search redirect) unconditionally. Each sync now reads the installed rules via `getDynamicRules`, deep-compares against the rule it would write, and skips the `updateDynamicRules` call when they already match (including "should be absent and is absent"). Every dynamic-rules write rewrites the browser's on-disk rules store, and on Safari ≤ 26.4 that store can crash the whole browser at launch (WebKit bug 305585) — so redundant writes were exposure, not just waste. Any doubt (failed read, platform-added keys, structural mismatch) falls back to the exact write behaviour shipped before.
