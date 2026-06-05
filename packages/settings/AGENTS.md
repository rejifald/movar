# Settings — `@movar/settings`

> The canonical Movar settings schema, defaults, and the locked-language invariant.

## What it does

Owns the user-settings contract that the extension persists and that the e2e and
diagnostics apps must agree with: `MovarSettings`, `defaultSettings`, the UI-locale
enum (`UiLanguage`, `UI_LANGUAGES`), and the permanently-blocked-language policy
(`LOCKED_BLOCKED_LANGUAGES`, `isLockedBlocked`, `enforceLockedLanguages`).

## Boundaries & invariants

**Russian is permanently blocked.** `LOCKED_BLOCKED_LANGUAGES = ['ru']`.
`enforceLockedLanguages` re-asserts the invariant at the storage boundary so a
stale sync, a hand-edited value, or a UI bug cannot quietly remove the policy. The
UI must never offer to toggle `'ru'` out of `blocked` or into `priority`.

**`contentModification: false` ships as the default** — the safe baseline does
only header/URL-level switching; DOM mutation is opt-in.

**Settings only.** This package is the persisted user-preference shape plus its
invariant. The correction log lives in `@movar/events`; the `LanguageCode`
primitive lives in `@movar/lang-detect`; pause state is extension-internal.

## Public API

Single entry point `src/index.ts`:

| Export                             | Kind              | Notes                     |
| ---------------------------------- | ----------------- | ------------------------- |
| `MovarSettings`, `defaultSettings` | interface + const | Full settings shape       |
| `UiLanguage`, `UI_LANGUAGES`       | type + const      | `'auto' \| 'en' \| 'uk'`  |
| `LOCKED_BLOCKED_LANGUAGES`         | const             | `['ru']`                  |
| `isLockedBlocked`                  | function          | Pure predicate            |
| `enforceLockedLanguages`           | function          | Pure, idempotent coercion |

## Dependencies

`@movar/lang-detect` (for `LanguageCode`, used by `priority`/`blocked`). No other
workspace deps. Consumed as source (`"main": "./src/index.ts"`).

## Consumers

`apps/extension` (settings storage, options, popup), `apps/e2e` (asserting on the
persisted shape), `apps/diagnostics` (seeding `defaultSettings`).
