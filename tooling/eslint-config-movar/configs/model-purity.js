// @ts-check
/**
 * Model-purity boundary — machine-enforces the documented invariant (root
 * `AGENTS.md` "Pure model packages" and each model package's `AGENTS.md`) that
 * the four pure-model packages — `page-content`, `lang-pickers`,
 * `page-language`, `page-mode` — read the DOM and build models but **never**
 * import i18n, the curtain/tooltip overlays, the `content-presenter-factory`,
 * or the impure page-mode color-scheme singleton surfaces.
 *
 * This is the package-source analogue of `apps/extension`'s
 * `capability-boundary.test.ts`, which walks the *extension chunks'* value graph
 * for the same forbidden patterns. That test guards the chunks; this preset
 * guards the package sources those chunks consume, so a model package gaining
 * an overlay/i18n/singleton import fails `pnpm lint` before any build.
 *
 * Implemented with `no-restricted-imports` (mirroring `boundaries.js`) rather
 * than a bespoke plugin — the predicates are plain specifier globs. Caveat: the
 * paired contract test (`*.purity.test.ts`, walking the value graph) also covers
 * **dynamic** `import()` and type-only edges this rule does not catch cleanly;
 * the two guards share the forbidden-pattern list as the single source of truth.
 *
 * Path conventions: each model package runs ESLint with cwd at its own root, so
 * the `files` globs here are relative to that cwd (`src/**`).
 */

const PURITY_MESSAGE =
  'Pure model packages must not import rendering/i18n/singleton code. ' +
  'Forbidden: curtain/tooltip overlays, content-presenter-factory, any i18n catalog, ' +
  'apps/extension/** source, and impure @movar/page-mode surfaces ' +
  '(observer/apply/context/registry — only @movar/page-mode/detect + types are pure). ' +
  'Keep the model package DOM-only; see root AGENTS.md "pure model packages".';

/**
 * Specifier globs banned from model-package sources. Mirrors the substring list
 * in `apps/extension/src/lib/capability-boundary.test.ts` FORBIDDEN_PATTERNS so
 * the lint guard and the value-graph contract test stay aligned:
 *   /curtain, /tooltip, content-presenter-factory, page-mode/observer,
 *   page-mode/apply, page-mode/detect (allowed here — it is the pure leaf),
 *   i18n/content.
 * `no-restricted-imports` matches against the *written specifier*, so each
 * substring is expressed as a `**`-fenced glob. Reaching into `apps/extension/**`
 * (relative `../../apps/extension/...` or otherwise) is banned outright.
 */
const FORBIDDEN_IMPORT_PATTERNS = [
  '**/curtain',
  '**/curtain/**',
  '**/tooltip',
  '**/tooltip/**',
  '**/content-presenter*',
  '**/i18n',
  '**/i18n/**',
  '**/apps/extension/**',
  // Impure page-mode color-scheme surfaces. `/detect` (pure detectors) and the
  // root barrel's types are the only allowed page-mode entries for models.
  '@movar/page-mode/observer',
  '@movar/page-mode/apply',
  '@movar/page-mode/context',
  '@movar/page-mode/registry',
];

/** @type {import("eslint").Linter.Config[]} */
export const modelPurity = [
  {
    files: ['src/**/*.{ts,tsx}'],
    // Tests may exercise overlays/i18n indirectly; this guard is about the
    // shipped model surface, not the test harness.
    ignores: ['src/**/*.test.{ts,tsx}', 'src/**/*.test-utils.{ts,tsx}', 'src/**/test-setup.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: FORBIDDEN_IMPORT_PATTERNS,
              message: PURITY_MESSAGE,
            },
          ],
        },
      ],
    },
  },
];
