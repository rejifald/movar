# ESLint Config Movar — `@movar/eslint-config`

> The single shared ESLint 9 flat-config package for the entire movar monorepo: every workspace member imports its named presets and composes only what it needs.

## What it does

Centralises all ESLint rule sets so each workspace member's `eslint.config.mjs` is a thin composition of named presets. It ships named presets covering TypeScript strictness (`base` + the type-aware `strict`/`strictPackages` batch), modern-JS hygiene, React + hooks + a11y, test relaxations, Ukrainian orthography enforcement, extension-specific storage boundaries, Node script support, and workspace-wide ignores.

## Boundaries & invariants

- `private: true` — internal tooling only, never published to npm.
- No source files of its own; every file is a config that _configures other packages_.
- ESLint 9 flat config throughout — no `.eslintrc` style, no `extends` arrays.
- `eslint` is a `peerDependency` (^9.0.0) and also a `devDependency` for the package's own lint step.
- The package is pure ESM (`"type": "module"`); all configs are `.js` files using ES module syntax.
- `boundaries.js` paths are relative to `apps/extension/` (where its consumer runs ESLint), not the repo root.

## Public API / entry points

Entry: `configs/index.js` (re-exported as `"."` in `package.json`).

| Export             | Files glob                                                                                                                                                           | What it enforces                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `workspaceIgnores` | —                                                                                                                                                                    | Global ignores: `node_modules`, `dist`, `.output`, `.wxt`, `.wrangler`, `.nx`, `coverage`, `*.tsbuildinfo`, `storybook-static`, e2e demo output, Safari extension `Resources/` dirs, Firefox profiles.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `base`             | type-aware: `src/**/*.{ts,tsx,mts}` (with `projectService: true`); non-type-aware: every other `**/*.{ts,tsx,mts,cts}`                                               | `@eslint/js` recommended + `typescript-eslint` `strictTypeChecked + stylisticTypeChecked` (type-aware) for `src/` TS, non-type-aware `strict + stylistic` for everything else. Overrides: `no-console: error`, `no-unused-vars` delegated to `@typescript-eslint/no-unused-vars` (prefix `_` allowed), `consistent-type-imports`, `ban-ts-comment`, `no-deprecated`, `return-await: in-try-catch`, `prefer-nullish-coalescing`, `restrict-template-expressions`. **Bundles the `strict` batch** (below). Topped with `eslint-config-prettier`. Scoped to `src/**` because lint is sharded per-project — see base.js + the Bulk-suppressions section.                                                                                                                                                                                                              |
| `strict`           | `src/**/*.{ts,tsx,mts}` (apps + packages) — **already bundled into `base`**                                                                                          | Phase-1 strict TypeScript batch. Tier A (`error`, low/no backlog): `switch-exhaustiveness-check`, `consistent-type-exports`, `prefer-readonly`, `promise-function-async`, `require-array-sort-compare {ignoreStringArrays}`, `no-unnecessary-condition {allowConstantLoopConditions}`. Tier B (`error`, backlog suppressed): `strict-boolean-expressions`. NOT enabled: `prefer-readonly-parameter-types`. Exported for visibility/testing only — don't re-compose.                                                                                                                                                                                                                                                                                                                                                                                               |
| `strictPackages`   | `src/**/*.{ts,tsx,mts}` — composed **only** by each `packages/*` config (NOT in `base`)                                                                              | Packages-only public-API rule: `explicit-module-boundary-types` (`error`, backlog suppressed). "Packages only" is expressed by which configs import it, because per-project sharding leaves no `packages/` in the path to filter on.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `quality`          | `**/*.{ts,tsx,mts,cts,js,mjs,cjs}` (unicorn); `apps/**/*.{ts,tsx}` + `packages/**/*.{ts,tsx}` excluding test files (import-x + sonarjs)                              | `eslint-plugin-unicorn` recommended with opinionated rules disabled (`filename-case`, `prevent-abbreviations`, `no-null`, DOM-accessor rules, etc.); `import-x/no-cycle` (depth 10), `no-self-import`, `no-useless-path-segments`; `sonarjs` recommended (`cognitive-complexity: 15`, `no-duplicate-string` 5, `no-identical-functions` 5). ⚠️ This import-x/no-cycle + sonarjs sub-block still uses legacy `apps/**`+`packages/**` globs and is therefore **dormant** under per-project lint (follow-up). Scoped to `src/**` so they DO run: `@eslint-community/eslint-comments` (`require-description`, `no-unlimited-disable`, `no-unused-disable`; core `reportUnusedDisableDirectives` delegated off) and import-x `no-extraneous-dependencies` (devDeps allowed, checks package + workspace root), `consistent-type-specifier-style`, `no-mutable-exports`. |
| `tests`            | `**/*.test.{ts,tsx}`, `**/*.spec.{ts,tsx}`, `**/__tests__/**/*.{ts,tsx}`, `**/test-helpers/**/*.{ts,tsx}`, `**/test-utils/**/*.{ts,tsx}`, `**/*.test-utils.{ts,tsx}` | @vitest/eslint-plugin recommended (`warn`s promoted to `error`) with `no-focused-tests` forced to `error` (a stray `.only` silently shrinks the CI suite). Relaxes `no-console`, `@typescript-eslint/no-non-null-assertion`, `no-empty-function`, and the four `no-unsafe-*` rules.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `ukrainian`        | `**/*.{ts,tsx,mts,cts,js,mjs,cjs,astro,mdx}`                                                                                                                         | Custom inline rule `movar/ua-apostrophe` — bans ASCII U+0027 `'` and right single quote U+2019 `'` adjacent to Cyrillic characters (ranges `Ѐ–ӿ`, `Ԁ–ԯ`); requires U+02BC `ʼ` MODIFIER LETTER APOSTROPHE instead. English possessives are not flagged.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `react`            | non-type-aware on every `.tsx` (+ `.ts` hook files); type-aware @eslint-react on `src/**/*.tsx`                                                                      | @eslint-react **`strict-type-checked`** (type-aware, src only) with **`disable-conflict-eslint-plugin-react`** folded into one config object (single plugin reg); `eslint-plugin-react` recommended + `jsx-runtime` KEPT for `no-unescaped-entities` + `self-closing-comp` (overlapping rules ceded to @eslint-react); `eslint-plugin-react-hooks` **`configs.flat['recommended-latest']`** (`rules-of-hooks` + `exhaustive-deps` `error`); `eslint-plugin-jsx-a11y` flat **strict**. All preset `warn` severities promoted to `error` (`asErrors`) — bulk suppressions only ratchet errors. `react/prop-types` off.                                                                                                                                                                                                                                              |
| `boundaries`       | No `files` filter (applies to consumer's include set); escape hatch for `src/lib/settings.ts`, `src/lib/pause.ts`, `src/lib/events.ts`                               | `no-restricted-syntax` banning direct `browser.storage.sync.*` and `browser.storage.local.*` — callers must go through the typed wrappers. Second rule (`no-restricted-imports`) on production code (test files excluded): bans imports matching `**/*.test-utils`, `**/test-utils/*`, `**/test-helpers/*`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `scripts`          | `**/*.{js,mjs,cjs}`                                                                                                                                                  | Node globals (`globals.node`; `globals.commonjs` added for `.cjs`), `no-unused-vars`, `no-undef`, `no-console: off` (scripts are CLI tools). Topped with `eslint-config-prettier`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `security`         | `src/**` in `apps/extension` + `packages/ui` only                                                                                                                    | eslint-plugin-no-unsanitized recommended — XSS sinks (`innerHTML`/`outerHTML`/`insertAdjacentHTML`/`document.write`). Relaxed in tests (hand-built DOM fixtures).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `regexp`           | `src/**` in lang-detect + page-content/language/mode only                                                                                                            | eslint-plugin-regexp `flat/recommended` (regex correctness — unused groups, useless flags, obscure ranges, catastrophic backtracking). `warn`s promoted to `error`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

## Layout

```
tooling/eslint-config-movar/
  package.json          # name: @movar/eslint-config, private, type: module
  configs/
    index.js            # barrel — re-exports all named presets
    base.js             # TypeScript + prettier (bundles strict)
    strict.js           # strict TS batch (strict + strictPackages)
    _severity.js        # internal helper: promote preset `warn` → `error`
    quality.js          # unicorn + import-x + sonarjs + eslint-comments
    tests.js            # test-file relaxations + @vitest/eslint-plugin
    ukrainian.js        # inline movar/ua-apostrophe rule
    react.js            # @eslint-react + react-hooks + jsx-a11y
    security.js         # no-unsanitized (extension + ui only)
    regexp.js           # eslint-plugin-regexp (lang-detect + page-*)
    boundaries.js       # storage-wrapper + test-helper import guards
    scripts.js          # plain Node JS/MJS/CJS
    ignores.js          # workspaceIgnores object
```

## Dependencies

Runtime (bundled into consumers via pnpm):

| Package                                           | Purpose                                                   |
| ------------------------------------------------- | --------------------------------------------------------- |
| `@eslint/js`                                      | `js.configs.recommended` used in `base`                   |
| `typescript-eslint`                               | Parser, plugin, and presets in `base`                     |
| `eslint-config-prettier`                          | Disables format-conflicting rules in `base` and `scripts` |
| `eslint-plugin-unicorn`                           | Modern JS/TS hygiene in `quality`                         |
| `eslint-plugin-import-x`                          | Cycle detection and import correctness in `quality`       |
| `eslint-plugin-sonarjs`                           | Complexity and code-smell rules in `quality`              |
| `@eslint-community/eslint-plugin-eslint-comments` | Disable-directive hygiene in `quality`                    |
| `@vitest/eslint-plugin`                           | Vitest test-API rules in `tests`                          |
| `eslint-plugin-no-unsanitized`                    | XSS-sink rules in `security`                              |
| `eslint-plugin-regexp`                            | Regex correctness in `regexp`                             |
| `@eslint-react/eslint-plugin`                     | Type-aware React rules (`strict-type-checked`) in `react` |
| `eslint-plugin-react`                             | JSX extras in `react` (kept alongside @eslint-react)      |
| `eslint-plugin-react-hooks`                       | Hook rules in `react`                                     |
| `eslint-plugin-jsx-a11y`                          | Accessibility rules in `react`                            |
| `globals`                                         | Node globals object in `scripts`                          |

Peer: `eslint ^9.0.0`.

## Working on it

**Composing configs in a member** — import what you need and spread arrays, pass objects directly:

```js
// packages/my-pkg/eslint.config.mjs  (a published library)
import { workspaceIgnores, base, strictPackages, quality, tests } from '@movar/eslint-config';
export default [workspaceIgnores, ...base, ...strictPackages, ...quality, ...tests];
```

Add `...strictPackages` for every `packages/*` library (the packages-only public-API rules; apps deliberately omit it).
Add `...ukrainian` if the package contains Cyrillic string literals.
Add `...react` if the package contains `.tsx` files.
Add `...security` only for `apps/extension` and `packages/ui` (no-unsanitized XSS-sink rules).
Add `...regexp` only for the regex-heavy packages: `lang-detect` and `page-content` / `page-language` / `page-mode`.
Add `...boundaries` only for `apps/extension` and `apps/diagnostics` (extension storage boundary rules run relative to those apps' cwds).

**Adding or changing a rule** — edit the relevant file in `configs/`. There are no tests; validation is the consumers' lint runs. After editing, run any consumer's lint to confirm there are no config errors:

```sh
# From repo root:
pnpm nx run extension:lint
# Or lint the config package itself (root tooling/ lint):
pnpm lint:root
```

**Testing a new rule in isolation** — add a temporary file in a consumer package that trips the rule, run lint, confirm the error fires, then remove the file.

## Bulk suppressions & the strict-rule ratchet

New strict rules are rolled out with ESLint's native bulk suppressions, not a giant-bang fix. When a batch is enabled, the existing backlog is snapshotted into committed `eslint-suppressions.json` files; new code is held to the rule immediately, and the backlog can only shrink.

- **Per-project, by necessity.** Lint is sharded by Nx — each app/package runs `eslint .` from its own cwd (`<project>/project.json`), and `lint:root` lints `tooling/` + the root config from the repo root. ESLint resolves the suppressions file relative to that cwd, so each shard owns its own `eslint-suppressions.json` (a single shared file is impossible — its keys are cwd-relative, so `src/index.ts` from two packages would collide). A shard with no backlog carries **no file**.
- **Regenerate / prune** with the root scripts (both fan out to every shard via `scripts/eslint-suppress.mts`, run ESLint without `--cache` for a deterministic snapshot, and delete any empty `{}` result):
  - `pnpm lint:suppress` → `--suppress-all`: re-snapshot the whole current backlog. Run after enabling a batch, then **commit** the changed `eslint-suppressions.json` files.
  - `pnpm lint:prune` → `--prune-suppressions`: drop entries that no longer match a finding. Run after fixing violations, then commit the shrink.
- **CI is the ratchet.** `pnpm lint` (which CI runs) does **not** pass `--pass-on-unpruned-suppressions`, so an outdated suppression (a violation that was fixed but not pruned) **fails** the build — forcing the backlog down. Each per-project `eslint .` auto-discovers its local `eslint-suppressions.json`; no flags needed.
- **Caching.** Every `eslint .` runs with `--cache --cache-location node_modules/.eslintcache` (under `node_modules`, so it is gitignored and invisible to Nx's input hashing — no cache thrash). Nx still caches at project granularity on top of that.

## Gotchas

- `boundaries.js` globs (`src/lib/settings.ts` etc.) are relative to the **consumer's cwd**, not the repo root. If you move the extension's storage wrappers, update `boundaries.js`.
- `base.js` uses two config objects: `baseWithProjectService` (type-aware, `src/**`) and `baseWithoutProjectService` (non-type-aware, every other TS — `.cts` and non-`src` config/story/script files). TS outside `src/` silently gets only the non-type-aware ruleset, so keep real source under `src/`.
- ⚠️ `quality.js` heavy rules (`import-x/no-cycle`, `no-self-import`, sonarjs, `no-magic-numbers`) still use repo-relative `apps/**`+`packages/**` globs which — exactly like base.js's former bug — **never match under per-project lint** (each project runs `eslint .` from its own cwd, seeing `src/foo.ts`). Those rules are therefore **dormant**. Re-scoping them to `src/**` is a known follow-up (it carries its own suppression backlog, so it was left out of the type-aware phase). The first quality block (unicorn, `**/*` globs) is unaffected and does run.
- `ukrainian.js` inspects the _cooked_ value of template literals, so `'` escaped as `\'` is still caught. Intentional exemptions (e.g. lang-detect tests probing U+2019 detection) must be suppressed with `// eslint-disable-next-line movar/ua-apostrophe` in the consumer.
- `react.js` does **not** have a `files` wrapper for hook rules on `.ts` — it unconditionally applies to `**/hooks/**/*.ts` and `**/use-*.ts`. If a non-React package has a file matching that pattern it will get hook rules.
- `no-console` is `error` in `base` but intentionally overridden to `off` in `scripts`, `tests`, and several per-member overrides. Don't re-enable it in `base` without auditing those consumers.
