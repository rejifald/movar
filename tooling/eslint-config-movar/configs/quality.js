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
  // Heavy graph rules — production source only.
  {
    files: ['apps/**/*.{ts,tsx}', 'packages/**/*.{ts,tsx}'],
    ignores: ['**/*.test.{ts,tsx}', '**/*.spec.{ts,tsx}', '**/*.test-utils.{ts,tsx}'],
    plugins: {
      'import-x': importXPlugin,
      sonarjs: sonarjsPlugin,
    },
    rules: {
      'import-x/no-cycle': ['error', { maxDepth: 10, ignoreExternal: true }],
      'import-x/no-self-import': 'error',
      'import-x/no-useless-path-segments': ['error', { noUselessIndex: true }],
      ...sonarjsPlugin.configs.recommended.rules,
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
    },
  },
];
