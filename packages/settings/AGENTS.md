# Settings — `@movar/settings`

> The canonical Movar settings schema, defaults, and the locked-language invariant.

## What it does

Owns the user-settings contract that the extension persists and that the e2e and
diagnostics apps must agree with: `MovarSettings`, `defaultSettings`, the UI-locale
enum (`UiLanguage`, `UI_LANGUAGES`), the permanently-blocked-language policy
(`LOCKED_BLOCKED_LANGUAGES`, `isLockedBlocked`, `enforceLockedLanguages`), and the
schema-versioning + read-time validation contract (`CURRENT_SCHEMA_VERSION`,
`migrateSettings`, `coerceSettings`, `coerceLanguageList`, `coerceDomainList`).

## Boundaries & invariants

**Russian is permanently blocked.** `LOCKED_BLOCKED_LANGUAGES = ['ru']`.
`enforceLockedLanguages` re-asserts the invariant at the storage boundary so a
stale sync, a hand-edited value, or a UI bug cannot quietly remove the policy. The
UI must never offer to toggle `'ru'` out of `blocked` or into `priority`.

**`contentModification: false` ships as the default** — the safe baseline does
only header/URL-level switching; DOM mutation is opt-in.

**Settings carry an internal `schemaVersion`.** `storage.sync` roams across
devices and extension versions, so every read runs `migrateSettings` (version
ladder + per-element coercion: unknown language codes dropped, lists de-duped,
scalars type-checked). It is forward/backward tolerant — a value from a _newer_
build does not throw; its version is clamped to `CURRENT_SCHEMA_VERSION`.
`enforceLockedLanguages` must run _after_ coercion so the Russian lock always
holds. The version field is managed, never user-editable. Minimal `allowlist`
element validation only — full domain normalization is owned by #90.

**Settings only.** This package is the persisted user-preference shape plus its
invariant. The correction log lives in `@movar/events`; the `LanguageCode`
primitive lives in `@movar/lang-detect`; pause state is extension-internal.

## Public API

Single entry point `src/index.ts` (migration logic lives in `src/migrate.ts`,
re-exported from the barrel):

| Export                                   | Kind              | Notes                                       |
| ---------------------------------------- | ----------------- | ------------------------------------------- |
| `MovarSettings`, `defaultSettings`       | interface + const | Full settings shape (incl. `schemaVersion`) |
| `UiLanguage`, `UI_LANGUAGES`             | type + const      | `'auto' \| 'en' \| 'uk'`                    |
| `ConcealMode`, `CONCEAL_MODES`           | type + const      | `'curtain' \| 'hide'`                       |
| `CURRENT_SCHEMA_VERSION`                 | const             | Version this build stamps/understands       |
| `LOCKED_BLOCKED_LANGUAGES`               | const             | `['ru']`                                    |
| `isLockedBlocked`                        | function          | Pure predicate                              |
| `enforceLockedLanguages`                 | function          | Pure, idempotent coercion (run LAST)        |
| `migrateSettings`                        | function          | Pure: version ladder + coercion, no throw   |
| `coerceSettings`                         | function          | Pure: per-field validate/coerce one record  |
| `coerceLanguageList`, `coerceDomainList` | function          | Pure: per-element list validation           |

## Dependencies

`@movar/lang-detect` (for `LanguageCode` and `normalizeLanguageCode`, used by
`priority`/`blocked` coercion). No other workspace deps. Consumed as source
(`"main": "./src/index.ts"`).

## Consumers

`apps/extension` (settings storage, options, popup), `apps/e2e` (asserting on the
persisted shape), `apps/diagnostics` (seeding `defaultSettings`).
