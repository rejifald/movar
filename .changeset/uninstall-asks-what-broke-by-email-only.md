---
'@movar/brand': patch
'@movar/extension': minor
---

Ask what broke when Movar is removed. `setUninstallURL` was unset, so the one moment a departing user is still reachable passed in silence. Movar's in-product feedback link lives in the popup footer, which is precisely what uninstalling takes away — at the moment someone leaves, the channel they would use to say why has gone with it.

The genre this resembles — the cancellation survey — is unavailable on purpose. Every one of them posts radio buttons to a backend, and Movar has no backend to post to: `verifyNetworkSilent` is the promise that forbids one. So the ask is a ladder of `mailto:` rows, each opening the reader's own mail client with the subject already scoped, and the page reassures BEFORE it asks — the privacy band sits above the ladder because it answers the objection the ask raises rather than trailing it.

**The URL carries the running version and nothing else.** That is a build identifier, identical for everyone on the release, and the page it opens has no form, no analytics and no account. `uninstallUrl(locale, version)` in `@movar/brand` is the only place the route is spelled — the background worker lives outside the Astro app and cannot import its `i18n.ts`, the same bind that moved `changelogPath` there. An unreleased or unknown version (`preview` under static-serve, `dev` in the host app) emits no parameter at all rather than a bare `?v=` or a fabricated value.

**`scanForEgress` cannot see this, which is why it needed its own rule.** Nothing is sent, no socket is opened, and the navigation is the browser's own — so the egress pattern is structurally blind to it. But it is the one channel that could quietly become a reporting one, at the exact moment nobody can inspect, revoke, or even observe it. `scanForUninstallHook` in `scripts/lib/promises.mts` enforces two halves: at most ONE call site in shipped extension source, and its argument must be `uninstallUrl()`. A string literal, a template, a hand-composed URL, or a second call site each fail the promise and the README badge with it. Zero call sites also passes — the promise is that nothing leaks, not that the feature exists.

**`syncUninstallUrl()` is its own statement in the background entry, not a step in the wake chain.** It shares no state with the pause / DNR / icon work, so sequencing it behind those would only let one of their failures silently leave the uninstall hook unset. It re-runs on every worker wake AND on every settings change, because the UI locale is a setting: a URL frozen at install time would open the wrong language for anyone who switched afterwards. A refused hook is swallowed rather than propagated — the page stays reachable at `movar.fyi/uninstall`, it just would not open by itself, and that must not break the wake path.

Safari is excluded by construction: the extension ships inside an App Store app, so removing it is removing the app and no uninstall hook exists. That is a capability probe (`typeof browser.runtime.setUninstallURL !== 'function'`) rather than a `BROWSER` check — the API is simply absent there and in the test browser mock, and absent is the correct no-op.

Two constraints worth recording:

- The Ukrainian rows are in the reader's own voice, where a first-person past tense forces a gender («я хотів» / «я хотіла») with no neutral form. The copy avoids the construction — present tense in row 1, the site as subject in row 2 — and `docs/copy.md` §4.15 now states the rule, since the corpus had no first-person singular past at all before this page.
- The page is static, so `?v=` is only readable client-side. The lead therefore DEFAULTS to the no-version wording, which is true either way, and upgrades once a version is confirmed. Defaulting the other way would print a claim about the link that a directly-opened page contradicts.

Alongside the extension and `@movar/brand` changes, the marketing app gains `/uninstall` and `/uk/uninstall` (`Uninstall.astro`, the mailto builder, and the `MIRRORED_PAGES` entry `check:locale-redirects` requires), and the page joins the shared e2e `PAGES` matrix — contrast, a11y-focus and visual — with four new baselines.
