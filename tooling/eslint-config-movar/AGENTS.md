# ESLint Config Movar — `@movar/eslint-config`

> The single shared ESLint 9 flat-config package for the entire movar monorepo: every workspace member imports its named presets and composes only what it needs.

## What it does

Centralises all ESLint rule sets so each workspace member's `eslint.config.mjs` is a thin composition of named presets. It ships eight named exports covering TypeScript strictness, modern-JS hygiene, React + hooks + a11y, test relaxations, Ukrainian orthography enforcement, extension-specific storage boundaries, Node script support, and workspace-wide ignores.

## Boundaries & invariants

- `private: true` — internal tooling only, never published to npm.
- No source files of its own; every file is a config that _configures other packages_.
- ESLint 9 flat config throughout — no `.eslintrc` style, no `extends` arrays.
- `eslint` is a `peerDependency` (^9.0.0) and also a `devDependency` for the package's own lint step.
- The package is pure ESM (`"type": "module"`); all configs are `.js` files using ES module syntax.
- `boundaries.js` paths are relative to `apps/extension/` (where its consumer runs ESLint), not the repo root.

## Public API / entry points

Entry: `configs/index.js` (re-exported as `"."` in `package.json`).

| Export             | Files glob                                                                                                                                                           | What it enforces                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `workspaceIgnores` | —                                                                                                                                                                    | Global ignores: `node_modules`, `dist`, `.output`, `.wxt`, `.wrangler`, `.nx`, `coverage`, `*.tsbuildinfo`, `storybook-static`, e2e demo output, Safari extension `Resources/` dirs, Firefox profiles.                                                                                                                                                                                                                                                                                                           |
| `base`             | `apps/**/*.{ts,tsx,mts}` + `packages/**/*.{ts,tsx,mts}` (with `projectService: true`); `**/*.{ts,tsx,mts,cts}` elsewhere (no projectService)                         | `@eslint/js` recommended + `typescript-eslint` `strictTypeChecked + stylisticTypeChecked` (type-aware) for `apps/`+`packages/` TS, non-type-aware `strict + stylistic` for all other TS. Overrides: `no-console: error`, `no-unused-vars` delegated to `@typescript-eslint/no-unused-vars` (prefix `_` allowed), `consistent-type-imports`, `ban-ts-comment`, `no-deprecated`, `return-await: in-try-catch`, `prefer-nullish-coalescing`, `restrict-template-expressions`. Topped with `eslint-config-prettier`. |
| `quality`          | `**/*.{ts,tsx,mts,cts,js,mjs,cjs}` (unicorn); `apps/**/*.{ts,tsx}` + `packages/**/*.{ts,tsx}` excluding test files (import-x + sonarjs)                              | `eslint-plugin-unicorn` recommended with opinionated rules disabled (`filename-case`, `prevent-abbreviations`, `no-null`, DOM-accessor rules, etc.); `import-x/no-cycle` (depth 10), `no-self-import`, `no-useless-path-segments`; `sonarjs` recommended with `cognitive-complexity: 15`, `no-duplicate-string` threshold 5, `no-identical-functions` threshold 5. Heavy graph/complexity rules are skipped for test files.                                                                                      |
| `tests`            | `**/*.test.{ts,tsx}`, `**/*.spec.{ts,tsx}`, `**/__tests__/**/*.{ts,tsx}`, `**/test-helpers/**/*.{ts,tsx}`, `**/test-utils/**/*.{ts,tsx}`, `**/*.test-utils.{ts,tsx}` | Relaxes `no-console`, `@typescript-eslint/no-non-null-assertion`, `no-empty-function`, and the four `no-unsafe-*` rules.                                                                                                                                                                                                                                                                                                                                                                                         |
| `ukrainian`        | `**/*.{ts,tsx,mts,cts,js,mjs,cjs,astro,mdx}`                                                                                                                         | Custom inline rule `movar/ua-apostrophe` — bans ASCII U+0027 `'` and right single quote U+2019 `'` adjacent to Cyrillic characters (ranges `Ѐ–ӿ`, `Ԁ–ԯ`); requires U+02BC `ʼ` MODIFIER LETTER APOSTROPHE instead. English possessives are not flagged.                                                                                                                                                                                                                                                           |
| `react`            | `**/*.tsx` (React + hooks + a11y); `**/hooks/**/*.ts` + `**/use-*.ts` (hooks only)                                                                                   | `eslint-plugin-react` recommended + `jsx-runtime`; `eslint-plugin-react-hooks` recommended (`rules-of-hooks` + `exhaustive-deps` both `error`); `eslint-plugin-jsx-a11y` flat recommended; extras: `jsx-no-leaked-render` (ternary only), `jsx-no-useless-fragment`, `self-closing-comp`, `no-array-index-key`, `no-unescaped-entities`. `react/prop-types` disabled (TypeScript covers it). Hook rules extend to plain `.ts` hook files at no extra cost for non-React code.                                    |
| `boundaries`       | No `files` filter (applies to consumer's include set); escape hatch for `src/lib/settings.ts`, `src/lib/pause.ts`, `src/lib/events.ts`                               | `no-restricted-syntax` banning direct `browser.storage.sync.*` and `browser.storage.local.*` — callers must go through the typed wrappers. Second rule (`no-restricted-imports`) on production code (test files excluded): bans imports matching `**/*.test-utils`, `**/test-utils/*`, `**/test-helpers/*`.                                                                                                                                                                                                      |
| `scripts`          | `**/*.{js,mjs,cjs}`                                                                                                                                                  | Node globals (`globals.node`; `globals.commonjs` added for `.cjs`), `no-unused-vars`, `no-undef`, `no-console: off` (scripts are CLI tools). Topped with `eslint-config-prettier`.                                                                                                                                                                                                                                                                                                                               |

## Layout

```
tooling/eslint-config-movar/
  package.json          # name: @movar/eslint-config, private, type: module
  configs/
    index.js            # barrel — re-exports all eight named exports
    base.js             # TypeScript + prettier
    quality.js          # unicorn + import-x + sonarjs
    tests.js            # test-file relaxations
    ukrainian.js        # inline movar/ua-apostrophe rule
    react.js            # React + hooks + jsx-a11y
    boundaries.js       # storage-wrapper + test-helper import guards
    scripts.js          # plain Node JS/MJS/CJS
    ignores.js          # workspaceIgnores object
```

## Dependencies

Runtime (bundled into consumers via pnpm):

| Package                     | Purpose                                                   |
| --------------------------- | --------------------------------------------------------- |
| `@eslint/js`                | `js.configs.recommended` used in `base`                   |
| `typescript-eslint`         | Parser, plugin, and presets in `base`                     |
| `eslint-config-prettier`    | Disables format-conflicting rules in `base` and `scripts` |
| `eslint-plugin-unicorn`     | Modern JS/TS hygiene in `quality`                         |
| `eslint-plugin-import-x`    | Cycle detection and import correctness in `quality`       |
| `eslint-plugin-sonarjs`     | Complexity and code-smell rules in `quality`              |
| `eslint-plugin-react`       | JSX rules in `react`                                      |
| `eslint-plugin-react-hooks` | Hook rules in `react`                                     |
| `eslint-plugin-jsx-a11y`    | Accessibility rules in `react`                            |
| `globals`                   | Node globals object in `scripts`                          |

Peer: `eslint ^9.0.0`.

## Working on it

**Composing configs in a member** — import what you need and spread arrays, pass objects directly:

```js
// packages/my-pkg/eslint.config.mjs
import { workspaceIgnores, base, quality, tests } from '@movar/eslint-config';
export default [workspaceIgnores, ...base, ...quality, ...tests];
```

Add `...ukrainian` if the package contains Cyrillic string literals.
Add `...react` if the package contains `.tsx` files.
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
- `base.js` uses two separate config objects: `baseWithProjectService` (type-aware, only `apps/` + `packages/` TS) and `baseWithoutProjectService` (non-type-aware, everything else). If a new TS area doesn't sit under `apps/` or `packages/`, it silently gets the non-type-aware ruleset.
- `quality.js` heavy rules (`no-cycle`, sonarjs) fire on `apps/**` and `packages/**` only, and deliberately exclude test files — don't widen that glob.
- `ukrainian.js` inspects the _cooked_ value of template literals, so `'` escaped as `\'` is still caught. Intentional exemptions (e.g. lang-detect tests probing U+2019 detection) must be suppressed with `// eslint-disable-next-line movar/ua-apostrophe` in the consumer.
- `react.js` does **not** have a `files` wrapper for hook rules on `.ts` — it unconditionally applies to `**/hooks/**/*.ts` and `**/use-*.ts`. If a non-React package has a file matching that pattern it will get hook rules.
- `no-console` is `error` in `base` but intentionally overridden to `off` in `scripts`, `tests`, and several per-member overrides. Don't re-enable it in `base` without auditing those consumers.
