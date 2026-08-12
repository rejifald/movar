/*
 * Client-side wiring for the plain-text install links — the header nav (desktop
 * row + mobile menu) and the footer's "Get Movar" column. The hero's button CTA
 * has its own script (DownloadButtons.astro) because it also swaps its label;
 * these links keep their label and only change destination, so they share this
 * one implementation instead of each re-deriving the same three states:
 *
 * - detected browser, store live     → link points at that marketplace, with
 *                                      the store's logo prepended and, on the
 *                                      browsers that need it, the /install
 *                                      handoff wired (see ./install-handoff).
 * - detected browser, store pending  → href dropped so the click is a no-op,
 *                                      plus a "Soon" chip.
 * - unrecognised browser             → the SSR GitHub-releases href stands, and
 *                                      gets the GitHub mark.
 *
 * Every surface renders `data-download-cta` links and calls `wireDownloadCta()`
 * from its own module script. The calls are document-wide and idempotent, so it
 * does not matter which surface's script runs first, nor whether a page renders
 * one of them or both.
 */
import { detectBrowser, perBrowser } from './downloads';
import type { BrowserId } from './downloads';
import { browserIconPaths, githubIconPath } from './browser-icons';
import { wireInstallGuideHandoff } from './install-handoff';

/**
 * Mark the link's label with a logo, mirroring the hero CTA. Built client-side
 * so the no-JS state stays text-only — the link's `gap-2` only spaces real
 * elements, so there's no stray leading gap before the text until this runs.
 * Prepended (not appended) so it reads "[Chrome] Install".
 */
function prependIcon(link: HTMLAnchorElement, path: string): void {
  if (!path) return;
  const icon = document.createElement('span');
  icon.setAttribute('aria-hidden', 'true');
  icon.className = 'inline-flex shrink-0';
  icon.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor" class="h-4 w-4"><path d="${path}"/></svg>`;
  link.prepend(icon);
}

/** Point the link at a live listing, and hand off to the guide where the store
 *  page alone leaves the visitor stuck. */
function pointAtStore(link: HTMLAnchorElement, id: BrowserId, href: string): void {
  link.href = href;
  wireInstallGuideHandoff(
    link,
    id,
    link.dataset['guideHref'] ?? '',
    link.dataset['newTabLabel'] ?? '',
  );
}

/** Listing isn't live yet — drop the href so the click is a no-op and flag it
 *  "Soon", exactly like the hero CTA. */
function markPending(link: HTMLAnchorElement): void {
  link.removeAttribute('href');
  const soonLabel = link.dataset['soonLabel'] ?? '';
  if (soonLabel === '') return;
  const chip = document.createElement('span');
  chip.className =
    'rounded bg-accent-surface px-2 py-1 text-ui-micro font-semibold uppercase tracking-label text-accent';
  chip.textContent = soonLabel;
  link.append(chip);
}

/** Resolve one link against the detected browser, or `null` for a browser we
 *  don't recognise — which keeps the SSR GitHub fallback href and takes the
 *  GitHub mark, matching the hero CTA's fallback. */
function resolveLink(link: HTMLAnchorElement, id: BrowserId | null): void {
  if (id === null) {
    prependIcon(link, githubIconPath);
    return;
  }
  prependIcon(link, browserIconPaths[id]);
  const store = perBrowser[id];
  if (store.liveAt === null) markPending(link);
  else pointAtStore(link, id, store.href);
}

/** Flag a wired link, so a second surface's call can't prepend a second logo. */
const WIRED = 'downloadCtaWired';

/**
 * Resolve every `data-download-cta` link on the page to the visitor's store.
 * Safe to call more than once: links already wired are skipped.
 */
export function wireDownloadCta(): void {
  const id = detectBrowser();
  for (const link of document.querySelectorAll<HTMLAnchorElement>('[data-download-cta]')) {
    if (link.dataset[WIRED] !== undefined) continue;
    link.dataset[WIRED] = '';
    resolveLink(link, id);
  }
}
