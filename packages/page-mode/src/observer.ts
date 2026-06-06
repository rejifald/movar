/**
 * Live page-mode watcher. Two sources can flip mid-session:
 *
 *   1. The site's own theme switcher mutates <html>/<body> attributes
 *      (or the bare `dark` attr, or the `color-scheme` inline style). A
 *      MutationObserver on documentElement + body catches these.
 *   2. The OS-level `prefers-color-scheme` flips. matchMedia('change')
 *      catches that one.
 *
 * Tier 3 of the generic chain (computed body background) isn't watched —
 * a CSS-driven theme change would require a heavy observer (style sheet
 * mutations or computed-style polling). Sites that lean only on
 * background colour for their dark mode don't ship live switchers, so the
 * miss is acceptable in practice.
 *
 * `watchPageMode(detect, onChange)` is the public entry. The caller
 * supplies `detect` as a closure (typically `() =>
 * detectModeForHost(location.hostname)`) so host-specific detectors stay
 * in effect for live updates too. `onChange` fires only when the
 * detected value actually flips — repeated writes of the same attribute
 * value don't spam the callback.
 *
 * Returns a stop function. Idempotent: calling it twice is a no-op.
 */

import type { PageMode } from './types';

const WATCHED_ATTRS = [
  'class',
  'style',
  'data-theme',
  'data-bs-theme',
  'data-color-mode',
  'data-mode',
  'data-color-scheme',
  'color-scheme',
  'dark',
];

export function watchPageMode(
  detect: () => PageMode,
  onChange: (next: PageMode) => void,
  doc: Document = document,
  // eslint-disable-next-line unicorn/prefer-global-this -- defaulting to `window` keeps the param typed as Window.
  win: Window = window,
): () => void {
  let current = detect();
  let stopped = false;

  const emit = (): void => {
    if (stopped) return;
    const next = detect();
    if (next === current) return;
    current = next;
    onChange(next);
  };

  // Same emit hooked into both signal sources. MutationObserver coalesces
  // sync attribute writes into one callback tick already, so a site that
  // sets three attrs in a row only triggers one detect() call.
  const attrObs = new MutationObserver(emit);
  // `documentElement` is always present; `Document.body` is nullable at runtime
  // (we attach at `document_start`, before the body parses) despite lib.dom's
  // non-null type — observe whichever roots exist.
  const roots: readonly (HTMLElement | null)[] = [doc.documentElement, doc.body];
  for (const root of roots) {
    if (!root) continue;
    attrObs.observe(root, { attributes: true, attributeFilter: WATCHED_ATTRS });
  }

  // matchMedia is missing in some test/headless environments — gracefully
  // skip the OS listener rather than throw.
  const mql =
    typeof win.matchMedia === 'function' ? win.matchMedia('(prefers-color-scheme: dark)') : null;
  // addEventListener is the modern signature; jsdom and every shipping
  // browser support it. addListener (deprecated) isn't worth carrying.
  mql?.addEventListener('change', emit);

  return (): void => {
    if (stopped) return;
    stopped = true;
    attrObs.disconnect();
    mql?.removeEventListener('change', emit);
  };
}
