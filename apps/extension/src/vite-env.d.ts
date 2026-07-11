/// <reference types="vite/client" />

declare module '*.css';

/** e2e-only build flag, injected by wxt.config.ts's Vite `define` in the
 *  MOVAR_E2E build the visual-regression suite loads. Absent (hence `undefined`)
 *  in every other context — Storybook, vitest, and every shipped build — so it's
 *  read behind `typeof __MOVAR_E2E__ !== 'undefined' && __MOVAR_E2E__`, which lets
 *  the popup's crash probe tree-shake out of production. */
declare const __MOVAR_E2E__: boolean | undefined;
