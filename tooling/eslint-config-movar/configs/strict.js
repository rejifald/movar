// @ts-check
/**
 * Strict TypeScript batch (phase 1 of the strictness rollout). Type-aware rules
 * layered on top of `base`'s `strictTypeChecked` set.
 *
 * Two exports:
 *   - `strict`         — applies to all `src/**` (apps AND packages). SPREAD
 *                        INTO `base` (see base.js), so every consumer already
 *                        gets it through its existing `...base`; nothing extra
 *                        to compose. Re-exported from index.js for visibility /
 *                        isolated testing only — don't spread it a second time.
 *   - `strictPackages` — packages/** ONLY (published libraries). Composed
 *                        explicitly by each package's eslint.config.mjs.
 *                        It can't live in `base` because lint is sharded
 *                        per-project: a config running in `apps/extension/`
 *                        sees files as `src/foo.ts`, with no `packages/` in the
 *                        path to filter on. So "packages only" is expressed by
 *                        which configs import it, not by a glob.
 *
 * Scoped to `src/**` (project-relative) for the same per-project sharding
 * reason base.js documents, and because `projectService` needs the file to be
 * in a tsconfig — every package tsconfig `include`s `src`.
 *
 * The `@typescript-eslint` plugin and the type-aware parser come from
 * `baseWithProjectService` (identical `src/**` glob); these objects therefore
 * carry only `files` + `rules` — re-declaring the plugin would throw "Cannot
 * redefine plugin".
 *
 * Two tiers, by expected backlog rather than by mechanism (both are `error` and
 * both ride the bulk-suppression ratchet):
 *   - Tier A — high signal, little/no existing backlog.
 *   - Tier B — valuable but noisy on today's surface; the existing backlog is
 *     parked in each shard's eslint-suppressions.json and only shrinks.
 *
 * NOT enabled: `@typescript-eslint/prefer-readonly-parameter-types` — it would
 * demand `readonly` on nearly every parameter across the DOM/event-heavy code
 * for negligible real-bug payoff.
 */

const SRC_TS = ['src/**/*.{ts,tsx,mts}'];

/** @type {import("eslint").Linter.Config[]} */
export const strict = [
  {
    files: SRC_TS,
    rules: {
      // --- Tier A: high-signal, enforced everywhere now ---
      // Every `switch` over a union must handle all members (or carry a
      // default); adding a union member then surfaces the unhandled branch
      // instead of silently falling through.
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      // A name used only as a type must be exported with `export type` so
      // isolatedModules / bundlers can erase it without a runtime import.
      '@typescript-eslint/consistent-type-exports': 'error',
      // Private fields never reassigned after construction must be `readonly`.
      '@typescript-eslint/prefer-readonly': 'error',
      // A function that returns a Promise must be `async`, so it cannot both
      // throw synchronously and reject — callers get one error channel.
      '@typescript-eslint/promise-function-async': 'error',
      // `.sort()` on a non-string array needs a compare fn (default sort is
      // lexicographic — `[10, 9].sort()` stays `[10, 9]`). Strings are exempt.
      '@typescript-eslint/require-array-sort-compare': ['error', { ignoreStringArrays: true }],
      // A condition whose result is statically known is dead code or a bug.
      // `noUncheckedIndexedAccess` is on (tsconfig.base.json), so index-access
      // guards (`if (arr[i])`) are correctly treated as necessary, not redundant.
      '@typescript-eslint/no-unnecessary-condition': [
        'error',
        { allowConstantLoopConditions: true },
      ],

      // --- Tier B: enforced going forward; existing backlog suppressed ---
      // No truthiness tests on nullable strings/numbers/enums or `any` — forces
      // explicit `!= null` / `!== ''` / `.length > 0`, which say what they mean
      // and don't conflate "absent" with "empty"/"zero".
      '@typescript-eslint/strict-boolean-expressions': 'error',
    },
  },
];

/** @type {import("eslint").Linter.Config[]} */
export const strictPackages = [
  {
    // packages/** are published libraries — their public surface must be
    // explicitly typed so consumers get stable, readable signatures regardless
    // of inference. Apps are leaf code, so the ceremony isn't worth it there.
    files: SRC_TS,
    rules: {
      '@typescript-eslint/explicit-module-boundary-types': 'error',
    },
  },
];
