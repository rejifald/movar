/**
 * Per-tab page-mode context. Module-level state read by call sites that
 * attach curtains/tooltips deep inside the orchestration chain — passing
 * the detected mode through every helper signature would bloat the
 * `lang-pickers/filter.ts` pipeline without earning anything (the value
 * is per-tab, not per-call). Owned by the content-script entrypoint:
 * `content.ts` calls `setCurrentColorScheme` once at bootstrap and again
 * from the `watchPageMode` callback when the page (or OS) flips theme.
 *
 * Reading via `getCurrentColorScheme()` at attach time gives every new
 * overlay the live value. Existing overlays are re-skinned by the
 * `setAllCurtainsColorScheme` / `setAllTooltipsColorScheme` sweepers,
 * which the same callback runs alongside the setter — the context and
 * the live DOM stay in sync.
 *
 * Default is `'light'` — a sensible fallback for the brief window
 * between content-script load and the first detection.
 */

import type { PageMode } from './types';

let currentColorScheme: PageMode = 'light';

export function getCurrentColorScheme(): PageMode {
  return currentColorScheme;
}

export function setCurrentColorScheme(next: PageMode): void {
  currentColorScheme = next;
}

/**
 * Test-only — reset the context to the default. Production never calls
 * this; tests use it to scrub state between cases so a "light" baseline
 * leak from one test doesn't shape another.
 */
export function resetColorSchemeForTesting(): void {
  currentColorScheme = 'light';
}
