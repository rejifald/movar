# Events — `@movar/events`

> The correction-log contract: what Movar did, recorded locally for the dashboard.

## What it does

Exports the shapes of the on-device correction log: `CorrectionMechanism` (how a
correction was applied — header/cookie/localStorage/redirect/dom/search) and
`CorrectionEvent` (one logged correction). Local-only and privacy-preserving:
`domain` is the host, never the full URL.

## Boundaries & invariants

**Types only — no logging logic.** The extension owns _writing_ the log
(`apps/extension/src/lib/events.ts`); this package owns only the _shape_ that the
writer and the e2e suite must agree on.

**Privacy: domain, never full URL.** `CorrectionEvent.domain` is intentionally the
host only — mirror this rule anywhere a `CorrectionEvent` is constructed.

**Nothing leaves the browser.** The correction log is read by the popup dashboard
and the e2e tests; it is never networked.

## Public API

Single entry point `src/index.ts`:

| Export                | Kind       | Notes                                                                                |
| --------------------- | ---------- | ------------------------------------------------------------------------------------ |
| `CorrectionMechanism` | union type | `'header' \| 'cookie' \| 'localStorage' \| 'redirect' \| 'dom' \| 'search'`          |
| `CorrectionEvent`     | interface  | `timestamp`, `domain`, `mechanism`, `fromLang`, `toLang`, optional `detectionEngine` |

## Dependencies

`@movar/lang-detect` (for `LanguageCode`, used by `fromLang`/`toLang`). No other
workspace deps. Consumed as source (`"main": "./src/index.ts"`).

## Consumers

`apps/extension` (`lib/events.ts`, popup dashboard) and `apps/e2e` (asserting on
the corrections the extension logged).
