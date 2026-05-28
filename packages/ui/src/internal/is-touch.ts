/**
 * Detect whether the current environment is touch-first (no hover).
 *
 * Used by `Tooltip` to swap hover triggers for tap-toggle on phones and
 * tablets, where `mouseenter` fires once on first tap and never leaves
 * until the next tap elsewhere — a hover-only tooltip would stick open
 * and block taps on neighbouring controls.
 *
 * `matchMedia('(hover: none)')` is the standard signal; it cleanly
 * separates touch-only devices (phones, most tablets) from
 * hover-capable ones (laptops, desktops, hybrid devices with mouse
 * connected). Returns `false` on jsdom and SSR, which is correct —
 * tests + server render as if on a hover-capable device unless the
 * caller spoofs `matchMedia`.
 *
 * Package-private (no re-export from `src/index.ts`). The extension lib
 * has a parallel `apps/extension/src/lib/is-touch.ts` for its vanilla
 * tooltip primitive — sharing this would require another sub-path
 * export for a 3-line function. Easier to duplicate.
 */
export function isTouchEnvironment(): boolean {
  if (typeof globalThis.matchMedia !== 'function') return false;
  return globalThis.matchMedia('(hover: none)').matches;
}
