/*
 * Shared install-target resolution for the two places that send a visitor to
 * get Movar: the hero CTA (DownloadButtons) and the header's "Download" nav
 * link. Both detect the visitor's browser client-side and point at the same
 * marketplace, so the store config and detection live here once instead of
 * drifting between components.
 */

type StoreId = 'chrome' | 'edge' | 'firefox' | 'safari';
export type BrowserId = 'chrome' | 'edge' | 'firefox' | 'opera' | 'brave' | 'safari';

export interface Store {
  href: string;
  /** ISO date the listing went live, or null while it's still pending. */
  liveAt: string | null;
}

// Universal fallback for visitors on a browser we don't recognise (Tor,
// mobile in-app browsers, niche/private builds). Also the SSR href so both
// surfaces have a working destination before the script runs.
export const FALLBACK_HREF = 'https://github.com/rejifald/movar/releases';

const stores: Record<StoreId, Store> = {
  chrome: {
    href: 'https://chromewebstore.google.com/detail/movar/bagafijhbhalglmeecicebmgaebipdgi',
    liveAt: '2026-06-03',
  },
  edge: { href: '#', liveAt: null }, // TODO: paste Edge Add-ons URL on first publish
  // AMO redirects no-locale URLs to the visitor's preferred locale, so
  // both the en and uk pages share one link.
  firefox: { href: 'https://addons.mozilla.org/firefox/addon/movar/', liveAt: '2026-06-01' },
  safari: { href: '#', liveAt: null }, // TODO: ship a Safari WebExtension + App Store listing
};

// Opera and Brave install Chromium extensions from the Chrome Web Store —
// reusing the chrome listing as the marketplace truth, while each browser
// keeps its own user-facing label.
const browserStore: Record<BrowserId, StoreId> = {
  chrome: 'chrome',
  edge: 'edge',
  firefox: 'firefox',
  opera: 'chrome',
  brave: 'chrome',
  safari: 'safari',
};

export const perBrowser: Record<BrowserId, Store> = {
  chrome: stores[browserStore.chrome],
  edge: stores[browserStore.edge],
  firefox: stores[browserStore.firefox],
  opera: stores[browserStore.opera],
  brave: stores[browserStore.brave],
  safari: stores[browserStore.safari],
};

// UA tokens that identify each browser, in match order. Edge ("edg/") and
// Opera ("opr/") UAs also contain "Chrome", and Chromium UAs also contain
// "Safari", so the distinguishing token has to come first.
const UA_TOKENS: [string, BrowserId][] = [
  ['edg/', 'edge'],
  ['firefox', 'firefox'],
  ['opr/', 'opera'],
  ['chrome', 'chrome'],
  ['safari', 'safari'],
];

/**
 * Detect the visitor's browser. Client-only — reads `navigator`, so never call
 * it during SSR. Brave hides itself in the UA but exposes `navigator.brave`, so
 * it's matched on its own before the UA tokens.
 */
export function detectBrowser(): BrowserId | null {
  if ('brave' in navigator) return 'brave';
  const ua = navigator.userAgent.toLowerCase();
  return UA_TOKENS.find(([token]) => ua.includes(token))?.[1] ?? null;
}
