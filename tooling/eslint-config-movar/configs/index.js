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
 * and `tests` to layer test-only relaxations on top.
 */
export { workspaceIgnores } from './ignores.js';
export { base } from './base.js';
export { react } from './react.js';
export { scripts } from './scripts.js';
export { tests } from './tests.js';
export { quality } from './quality.js';
export { boundaries } from './boundaries.js';
