// @ts-check
/**
 * React + hooks + jsx-a11y rules. Layers on top of `base`. Hook rules are
 * also applied to plain `.ts` files matching common custom-hook patterns,
 * because React hooks aren't only used inside `.tsx`.
 */
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import jsxA11yPlugin from 'eslint-plugin-jsx-a11y';

/** @type {import("eslint").Linter.Config[]} */
export const react = [
  {
    files: ['**/*.tsx'],
    plugins: {
      react: reactPlugin,
      'react-hooks': reactHooksPlugin,
      'jsx-a11y': jsxA11yPlugin,
    },
    settings: {
      react: { version: 'detect' },
    },
    rules: {
      ...reactPlugin.configs.recommended.rules,
      ...reactPlugin.configs['jsx-runtime'].rules,
      ...reactHooksPlugin.configs.recommended.rules,
      ...jsxA11yPlugin.flatConfigs.recommended.rules,
      // TypeScript covers prop typing — react/prop-types is noise here.
      'react/prop-types': 'off',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
      'jsx-a11y/no-autofocus': 'error',
      'jsx-a11y/click-events-have-key-events': 'error',
      'jsx-a11y/label-has-associated-control': 'error',
      'jsx-a11y/anchor-is-valid': 'error',
      'react/no-unescaped-entities': 'error',
      'react/jsx-no-leaked-render': ['error', { validStrategies: ['ternary'] }],
      'react/jsx-no-useless-fragment': ['error', { allowExpressions: true }],
      'react/self-closing-comp': 'error',
      'react/no-array-index-key': 'error',
    },
  },
  // Custom hooks frequently live in `.ts` files. Hook rules only fire on
  // actual hook calls, so widening the pattern costs nothing for non-React
  // code that happens to match.
  {
    files: ['**/hooks/**/*.ts', '**/use-*.ts'],
    plugins: {
      'react-hooks': reactHooksPlugin,
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
    },
  },
];
