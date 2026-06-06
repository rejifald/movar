// @ts-check
/**
 * XSS-sink hygiene via eslint-plugin-no-unsanitized (Mozilla). Flags assigning
 * unsanitized strings to `innerHTML` / `outerHTML`, `insertAdjacentHTML`,
 * `document.write`, etc. — the classic DOM-injection sinks.
 *
 * Composed ONLY where code builds DOM from strings: `apps/extension` and the
 * shared `packages/ui`. (apps/diagnostics is a candidate too — left as a
 * follow-up to keep this phase scoped to what the brief named.)
 *
 * Scoped to `src/**` per the per-project sharding base.js documents.
 */
import noUnsanitized from 'eslint-plugin-no-unsanitized';

const recommended = noUnsanitized.configs.recommended;

/** @type {import("eslint").Linter.Config[]} */
export const security = [
  {
    files: ['src/**/*.{ts,tsx,mts}'],
    plugins: recommended.plugins,
    rules: recommended.rules,
  },
  {
    // Tests scaffold DOM fixtures by hand (`el.innerHTML = '<div>…</div>'`);
    // that is not an injection risk inside a jsdom test runner.
    files: ['src/**/*.{test,spec}.{ts,tsx}', 'src/**/__tests__/**/*.{ts,tsx}'],
    rules: {
      'no-unsanitized/method': 'off',
      'no-unsanitized/property': 'off',
    },
  },
];
