// @ts-check
/**
 * Re-exports of every workspace ESLint preset. Consumers compose what they
 * need:
 *
 *   import { base, react, scripts, tests, workspaceIgnores }
 *     from '@movar/eslint-config';
 *
 * Pick `base` for Node/TS packages, `react` (which depends on `base` being
 * spread first) for client packages, `scripts` for `.mjs` / `.cjs` files,
 * and `tests` to layer test-only relaxations on top. `ukrainian` adds the
 * UA orthographic-apostrophe rule and is opted into wherever Cyrillic copy
 * lives (extension, marketing, shared UI/rules packages).
 */
export { workspaceIgnores } from './ignores.js';
export { base } from './base.js';
// `strict` is already bundled into `base` (exported for visibility / isolated
// testing only — don't compose it a second time). `strictPackages` is NOT in
// `base`: it carries the packages-only public-API rules and must be composed
// explicitly by each package's eslint.config.mjs.
export { strict, strictPackages } from './strict.js';
export { react } from './react.js';
export { scripts } from './scripts.js';
export { tests } from './tests.js';
export { quality } from './quality.js';
// Security (no-unsanitized) — compose in apps/extension + packages/ui only.
export { security } from './security.js';
// Regex correctness — compose in lang-detect + the page-* model packages.
export { regexp } from './regexp.js';
export { boundaries } from './boundaries.js';
export { ukrainian } from './ukrainian.js';
