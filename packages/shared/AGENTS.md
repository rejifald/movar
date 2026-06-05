# Shared — `@movar/shared`

> Dependency-free leaf of types, constants, and defaults shared by every other workspace member.

## What it does

Exports the canonical types (`MovarSettings`, `LanguageCode`, `PauseDuration`, `UiLanguage`,
`CorrectionMechanism`, `CorrectionEvent`, `HiddenSummary`, `DetectionDivergence`,
`DiagnosticsSummary`, `MovarMessage`), runtime constants (`SUPPORT_EMAIL`, `FEEDBACK_URL`,
`SOURCE_URL`, `PAUSE_DURATIONS`, `UI_LANGUAGES`, `LOCKED_BLOCKED_LANGUAGES`,
`defaultSettings`), and the two locked-language helpers (`isLockedBlocked`,
`enforceLockedLanguages`). Nothing else.

## Boundaries & invariants

**Stay a leaf.** This package has zero workspace dependencies. It must never gain a
`@movar/*` dep — that would create a cycle risk and break the dependency order.

**No logic beyond the lock invariant.** The only non-trivial code is `enforceLockedLanguages`,
which exists here because `defaultSettings` and `LOCKED_BLOCKED_LANGUAGES` both live here and
the function is pure and tiny. All other logic belongs elsewhere: code-normalisation and
detection live in `@movar/lang-detect` (see `../lang-detect/AGENTS.md`); site strategy lives
in `@movar/rules`; picker hiding lives in `@movar/lang-pickers`.

**Russian is permanently blocked.** `LOCKED_BLOCKED_LANGUAGES = ['ru']`. `isLockedBlocked`
and `enforceLockedLanguages` enforce this at the storage boundary so that stale syncs, hand-edited
values, or UI bugs cannot quietly remove the policy. The UI must never offer to toggle 'ru' out
of `blocked` or into `priority`.

**`contentModification` is off by default** in `defaultSettings` — the safe baseline ships only
header/URL-level switching; DOM mutation is opt-in.

## Public API / entry points

Single entry point: `src/index.ts` (re-exported via `package.json` `"exports": { ".": "./src/index.ts" }`).
There are no sub-paths.

Key exports at a glance:

| Export                                        | Kind                | Notes                           |
| --------------------------------------------- | ------------------- | ------------------------------- |
| `SUPPORT_EMAIL`, `FEEDBACK_URL`, `SOURCE_URL` | `const`             | Contact / repo URLs             |
| `LanguageCode`                                | `type`              | `string` alias (ISO 639-1)      |
| `PauseDuration`, `PAUSE_DURATIONS`            | type + const        | `'1h' \| 'indefinite'`          |
| `UiLanguage`, `UI_LANGUAGES`                  | type + const        | `'auto' \| 'en' \| 'uk'`        |
| `MovarSettings`, `defaultSettings`            | interface + const   | Full settings shape             |
| `LOCKED_BLOCKED_LANGUAGES`                    | `const`             | `['ru']`                        |
| `isLockedBlocked`                             | function            | Pure predicate                  |
| `enforceLockedLanguages`                      | function            | Pure coercion, idempotent       |
| `CorrectionMechanism`, `CorrectionEvent`      | types               | Correction-log shapes           |
| `HiddenSummary`                               | interface           | Per-tab hidden-content state    |
| `DetectionDivergence`, `DiagnosticsSummary`   | interfaces          | Dev-diagnostics types           |
| `MovarMessage`                                | discriminated union | popup ↔ content-script protocol |

## Layout

```
packages/shared/
  src/
    index.ts          # entire public surface — one file, ~165 lines
  package.json
  tsconfig.json       # extends ../../tsconfig.base.json, noEmit only
  eslint.config.mjs   # workspaceIgnores + base + quality + tests + ukrainian
  project.json        # nx targets: typecheck, lint, test (all cached)
```

No `vitest.config.ts`; no test files. The `test` script runs
`vitest run --passWithNoTests` and passes vacuously — there is nothing to test in a
pure types/constants file.

## Dependencies

| Dep                    | Type          | Why         |
| ---------------------- | ------------- | ----------- |
| `@movar/eslint-config` | devDependency | Lint rules  |
| `eslint`               | devDependency | Lint runner |

No runtime dependencies. No workspace (`@movar/*`) runtime deps — intentional; this is the
bottom of the graph.

## Working on it

```bash
# from repo root
pnpm typecheck --filter @movar/shared   # or: nx run shared:typecheck
pnpm lint     --filter @movar/shared    # or: nx run shared:lint
pnpm test     --filter @movar/shared    # passes with no tests

# from packages/shared
pnpm typecheck
pnpm lint
pnpm test
```

Consumers get the source directly (`"main": "./src/index.ts"`) — no build step needed.

## Gotchas

- **Do not add logic here.** If you need a new helper, ask: which package owns the
  concern? Detection utilities → `@movar/lang-detect`. Picker behaviour → `@movar/lang-pickers`.
  Site rules → `@movar/rules`. Only truly cross-cutting types and zero-dep constants belong here.
- **Do not add a workspace dep.** Any `@movar/*` import in `package.json` would make this
  package non-leaf and force every downstream to update their build order.
- **`LanguageCode` is a plain `string` alias**, not a branded type. Narrower typing would
  require a non-trivial runtime guard; keep it simple until there is a concrete need.
- **`contentModification: false`** ships as the default on purpose — header/URL switching is
  safer and sufficient for most sites; DOM modification is opt-in.
- The coverage artefacts in `coverage/` are gitignored output from a prior test run — they
  are not source and can be deleted freely.
