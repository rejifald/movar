/**
 * Shared DOM sweep helpers for shadow-DOM overlay hosts.
 *
 * Both `curtain.ts` and `tooltip.ts` maintain a registry of host elements
 * via a per-element handle stored under a module-private key. These helpers
 * provide the two sweep operations — detach-all and retheme-all — so the
 * two modules don't duplicate the same querySelectorAll + iteration shape.
 *
 * Why page-mode/ is the right home: both sweeps are triggered by the
 * page-mode watcher (theme change → retheme-all; "show everything" popup
 * action → detach-all). The subsystem that owns the trigger owns the tools.
 */

import type { PageMode } from './types';

/**
 * The DOM attribute written on every curtain / tooltip host element to
 * convey the current page color scheme. The CSS inside each shadow root
 * selects on this attribute to flip to the dark token bundle.
 */
export const COLOR_SCHEME_ATTR = 'data-movar-color-scheme';

/**
 * Set `COLOR_SCHEME_ATTR` on every `[hostSelector]` descendant of `root`.
 * Called by `setAllCurtainsColorScheme` and `setAllTooltipsColorScheme`
 * when the page (or OS) flips theme. One write per host flips the shadow
 * CSS — no shadow-DOM rebuild, no listener churn.
 */
export function applyColorSchemeToAll(
  root: ParentNode,
  hostSelector: string,
  colorScheme: PageMode,
): void {
  for (const host of root.querySelectorAll<HTMLElement>(hostSelector)) {
    host.setAttribute(COLOR_SCHEME_ATTR, colorScheme);
  }
}

/**
 * Detach every overlay host matching `hostSelector` under `root` by invoking
 * the handle stored at `handleKey` on each element. The per-module handle key
 * (e.g. `'__movarCurtainHandle'`) differs between curtain and tooltip so the
 * right cleanup path fires regardless of which overlay type we're sweeping.
 */
export function detachAllBySelector(
  root: ParentNode,
  hostSelector: string,
  handleKey: string,
): void {
  const hosts = [...root.querySelectorAll<HTMLElement>(hostSelector)];
  for (const host of hosts) {
    const handle = (host as HTMLElement & Record<string, unknown>)[handleKey] as
      | { detach(): void }
      | undefined;
    if (handle) handle.detach();
  }
}
