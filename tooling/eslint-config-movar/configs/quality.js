// @ts-check
/**
 * Quality plugins layered on top of the base preset:
 *
 *   - eslint-plugin-unicorn — modern JS/TS hygiene (node: protocol, prefer-set-has,
 *     no-instanceof-array, etc.). Opinionated rules that don't fit movar are
 *     turned off here rather than per-file.
 *   - eslint-plugin-import-x — import graph correctness (no-cycle, no-self-import,
 *     consistent specifier shapes).
 *   - eslint-plugin-sonarjs — code-smell catches (cognitive complexity, redundant
 *     boolean, no-duplicate-string). Complements fallow at the function level.
 *
 * Heavy rules (no-cycle, sonarjs complexity scanners) only fire on first-class
 * source, not tests — tests intentionally repeat setup and don't need cycle
 * detection.
 */
import unicornPlugin from 'eslint-plugin-unicorn';
import * as importXPlugin from 'eslint-plugin-import-x';
import sonarjsPlugin from 'eslint-plugin-sonarjs';
import comments from '@eslint-community/eslint-plugin-eslint-comments';
import { asErrors } from './_severity.js';
import { noTemplateLiteralClassName } from './_restricted-syntax.js';

const unicornRecommended = unicornPlugin.configs.recommended.rules;

/** @type {import("eslint").Linter.Config[]} */
export const quality = [
  {
    files: ['**/*.{ts,tsx,mts,cts,js,mjs,cjs}'],
    plugins: {
      unicorn: unicornPlugin,
    },
    rules: {
      ...unicornRecommended,
      // Ban a template literal used directly as a className value — compose with
      // cn() from @movar/ui instead (prettier-plugin-tailwindcss can silently
      // trim separator whitespace inside a className string, e.g. `base ${c ?
      // ' mod' : ''}` → "basemod"). Lives in `quality` — composed by EVERY
      // consumer, unlike `react` — so the guard is repo-wide (marketing,
      // options-ui, and ui compose quality but not react). For consumers that
      // also compose `boundaries` (extension, diagnostics), that preset is
      // spread later and re-sets `no-restricted-syntax`; the rule doesn't merge
      // across flat configs, so `boundaries` folds this same selector back in so
      // it survives there too. See _restricted-syntax.js.
      'no-restricted-syntax': ['error', noTemplateLiteralClassName],
      // Tailwind class strings, JSX className patterns, and React component
      // names don't fit unicorn's kebab-only filename rule.
      'unicorn/filename-case': 'off',
      // Movar's vocabulary uses short hand abbreviations (`el`, `ctx`, `prev`)
      // that this rule flags. Keep it off; readability trumps the rule.
      'unicorn/prevent-abbreviations': 'off',
      // The `null` ban is more philosophy than safety — Movar uses `null` to
      // distinguish "not yet loaded" from "explicitly empty".
      'unicorn/no-null': 'off',
      // `forEach` is fine for DOM walks where the body is a side effect.
      'unicorn/no-array-for-each': 'off',
      // `for…of` over `for` loops is fine but rewriting Array.from(set).map(...)
      // to set.values().toArray().map(...) loses readability for marginal benefit.
      'unicorn/no-array-callback-reference': 'off',
      // `&&` short-circuit is the standard React conditional render pattern;
      // the `react/jsx-no-leaked-render` rule already catches the dangerous case.
      'unicorn/no-array-reduce': 'off',
      // Movar reads/sets `document.cookie` and other browser APIs that use
      // strings the way unicorn discourages — too many false positives.
      'unicorn/prefer-string-replace-all': 'off',
      // Tune the noisy rules
      'unicorn/no-await-expression-member': 'off',
      'unicorn/numeric-separators-style': 'off',
      // Hex case + nested-ternary preferences conflict with prettier's
      // formatting (prettier writes lowercase hex digits and the chained
      // ternary indent style). Defer to prettier.
      'unicorn/number-literal-case': 'off',
      'unicorn/no-nested-ternary': 'off',
      // `getElementById` returns HTMLElement; the auto-fixed `querySelector('#x')`
      // returns Element, losing the type. Keep `getElementById`.
      'unicorn/prefer-query-selector': 'off',
      // `el.dataset.movarFoo` requires bracket access under
      // `noPropertyAccessFromIndexSignature`; the explicit
      // `getAttribute('data-movar-foo')` reads cleaner here.
      'unicorn/prefer-dom-node-dataset': 'off',
      // `appendChild` / `insertBefore` are clearer than `append` + index math
      // when order matters; this rule's auto-fix occasionally loses positioning.
      'unicorn/prefer-dom-node-append': 'off',
    },
  },
  // Heavy graph + complexity rules — production source only (tests excluded:
  // they repeat setup/strings by design and don't need cycle detection).
  // Scoped to `src/**` (project-relative) so it actually runs under per-project
  // lint — the old `apps/**`+`packages/**` globs silently never matched. import-x
  // itself is registered by the `src/**` block below (which co-applies to these
  // same non-test files), so we borrow that registration and only register
  // sonarjs here. `warn`-level sonarjs rules are promoted to `error`.
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['**/*.test.{ts,tsx}', '**/*.spec.{ts,tsx}', '**/*.test-utils.{ts,tsx}'],
    plugins: {
      sonarjs: sonarjsPlugin,
    },
    rules: {
      'import-x/no-cycle': ['error', { maxDepth: 10, ignoreExternal: true }],
      'import-x/no-self-import': 'error',
      'import-x/no-useless-path-segments': ['error', { noUselessIndex: true }],
      ...asErrors(sonarjsPlugin.configs.recommended.rules),
      // Cognitive complexity threshold — fallow already enforces 15, sonarjs
      // defaults to 15 too. Keep aligned.
      'sonarjs/cognitive-complexity': ['error', 15],
      // `no-duplicate-string` defaults to 3 occurrences which is too tight for
      // movar's small surface. Bump to 5.
      'sonarjs/no-duplicate-string': ['error', { threshold: 5 }],
      // OS / accessor naming conventions don't fit movar's vocabulary.
      'sonarjs/prefer-immediate-return': 'off',
      // Many false-positives on small files with intentional similar branches.
      'sonarjs/no-identical-functions': ['error', 5],
      // Off — duplicates of rules already enforced by base/typescript-eslint;
      // keeping both just double-reports the same finding.
      'sonarjs/no-unused-vars': 'off', // -> @typescript-eslint/no-unused-vars
      'sonarjs/deprecation': 'off', // -> @typescript-eslint/no-deprecated
      'sonarjs/prefer-regexp-exec': 'off', // -> @typescript-eslint/prefer-regexp-exec
      // TODO/FIXME markers are a legitimate planning signal in active code —
      // failing lint on them just pushes people to delete the reminder.
      'sonarjs/todo-tag': 'off',
      // No inline magic numbers — extract to a descriptively-named const. 0/1/-1/2
      // are structural (indices, halving, off-by-one) and stay inline. Type-aware
      // variant so enum members, readonly fields, and numeric-literal types pass.
      '@typescript-eslint/no-magic-numbers': [
        'error',
        {
          ignore: [-1, 0, 1, 2],
          ignoreArrayIndexes: true,
          ignoreDefaultValues: true,
          ignoreClassFieldInitialValues: true,
          ignoreEnums: true,
          ignoreReadonlyClassProperties: true,
          ignoreTypeIndexes: true,
          enforceConst: true,
        },
      ],
    },
  },
  // eslint-disable directives must be justified, scoped, and actually used.
  // (@eslint-community/eslint-comments). Applies everywhere lint runs.
  {
    files: ['**/*.{ts,tsx,mts,cts,js,mjs,cjs}'],
    plugins: { '@eslint-community/eslint-comments': comments },
    // Delegate unused-directive detection to eslint-comments/no-unused-disable:
    // one source of truth at a consistent `error` severity. The core
    // `reportUnusedDisableDirectives` (default `warn`) would double-report.
    linterOptions: { reportUnusedDisableDirectives: 'off' },
    rules: {
      // Every disable must say why: `// eslint-disable-next-line rule -- reason`.
      '@eslint-community/eslint-comments/require-description': 'error',
      // No blanket `// eslint-disable` without a rule list — name what you mute.
      '@eslint-community/eslint-comments/no-unlimited-disable': 'error',
      // A disable that mutes nothing is stale — remove it (ratchet).
      '@eslint-community/eslint-comments/no-unused-disable': 'error',
    },
  },
  // import-x dependency-hygiene rules (src/**). This block owns the import-x
  // plugin registration for the whole src tree; the production-only block above
  // borrows it for its graph rules (no-cycle / no-self-import / no-useless-path).
  {
    files: ['src/**/*.{ts,tsx,mts}'],
    plugins: { 'import-x': importXPlugin },
    rules: {
      // No importing packages declared in NEITHER dependencies nor
      // devDependencies (catches phantom/undeclared deps). devDependencies are
      // imported in legitimately bundled/dev contexts all over — `wxt` in
      // content/background entrypoints (the build framework, inlined by the
      // bundler), `vitest` / `@playwright/test` in specs, `storybook` in
      // stories — and are correctly in devDependencies, so allow them anywhere
      // rather than maintain a brittle per-context glob list.
      'import-x/no-extraneous-dependencies': [
        'error',
        {
          devDependencies: true,
          peerDependencies: true,
          // Monorepo: shared dev tooling (vitest, etc.) is hoisted to the root
          // package.json, not redeclared per package. Check both the package's
          // own manifest and the workspace root (every consumer is at depth 2).
          packageDir: ['.', '../..'],
        },
      ],
      // `import type { A, B }` over `import { type A, type B }` — one consistent
      // shape, complements base's `consistent-type-imports`.
      'import-x/consistent-type-specifier-style': ['error', 'prefer-top-level'],
      // `export let` lets importers observe a mutating binding — almost always a bug.
      'import-x/no-mutable-exports': 'error',
    },
  },
];
