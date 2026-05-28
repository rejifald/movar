/**
 * Detect whether the current environment is touch-first (no hover).
 *
 * Used by `tooltip.ts` to swap hover triggers for tap-toggle on phones
 * and tablets, where mouseenter fires once on first tap and never
 * leaves until the next tap elsewhere — a hover-only tooltip would
 * stick open and block touches on neighbouring controls.
 *
 * `matchMedia('(hover: none)')` is the standard signal; it accurately
 * separates touch-only devices (phones, most tablets) from
 * hover-capable ones (laptops, desktops, hybrid devices with mouse
 * connected). False on jsdom, which is correct — tests run as if on a
 * hover-capable device unless they spoof `matchMedia`.
 */
export function isTouchEnvironment(): boolean {
  if (typeof globalThis.matchMedia !== 'function') return false;
  return globalThis.matchMedia('(hover: none)').matches;
}
