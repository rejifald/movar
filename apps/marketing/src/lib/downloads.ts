/*
 * Shared install-target resolution for the two places that send a visitor to
 * get Movar: the hero CTA (DownloadButtons) and the header's "Download" nav
 * link. Both detect the visitor's browser client-side and point at the same
 * marketplace, so the store config and detection live here once instead of
 * drifting between components.
 */

type StoreId = 'chrome' | 'firefox' | 'safari' | 'safari-ios';
export type BrowserId = 'chrome' | 'edge' | 'firefox' | 'opera' | 'brave' | 'safari' | 'safari-ios';

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
  // AMO redirects no-locale URLs to the visitor's preferred locale, so
  // both the en and uk pages share one link.
  firefox: { href: 'https://addons.mozilla.org/firefox/addon/movar/', liveAt: '2026-06-01' },
  // Locale-neutral App Store link: the bare app-id URL lets Apple geolocate the
  // storefront/language, so the en and uk pages share one link (no /ua/ or ?l=uk).
  // macOS shipped first; the iOS/iPadOS build sits on the SAME listing (shared
  // bundle id fyi.movar.safari), so 'safari-ios' below reuses this URL — there is
  // no separate iOS App Store link.
  safari: { href: 'https://apps.apple.com/app/id6779282071', liveAt: '2026-06-30' },
  // iOS/iPadOS: cleared Apple review and went live on the shared listing with the
  // v1.3.0 submission, so it now points at the same id6779282071 URL as macOS.
  'safari-ios': { href: 'https://apps.apple.com/app/id6779282071', liveAt: '2026-07-12' },
};

// Edge, Opera and Brave install Chromium extensions from the Chrome Web Store,
// so they reuse the chrome listing as the marketplace truth while each keeps
// its own user-facing label. Edge is an INTERIM bridge: its native Edge Add-ons
// listing is still pending (the release pipeline already submits there), so
// until that goes live we route Edge users to the CWS listing — Edge installs
// it behind a one-time "Allow extensions from other stores" prompt, which the
// /install guide's Edge note explains. When the native listing is live, add an
// `edge` entry back to `stores` (liveAt: null until it clears review, which
// re-lights the "Soon" chip) and point this back at 'edge'.
const browserStore: Record<BrowserId, StoreId> = {
  chrome: 'chrome',
  edge: 'chrome',
  firefox: 'firefox',
  opera: 'chrome',
  brave: 'chrome',
  safari: 'safari',
  'safari-ios': 'safari-ios',
};

export const perBrowser: Record<BrowserId, Store> = {
  chrome: stores[browserStore.chrome],
  edge: stores[browserStore.edge],
  firefox: stores[browserStore.firefox],
  opera: stores[browserStore.opera],
  brave: stores[browserStore.brave],
  safari: stores[browserStore.safari],
  'safari-ios': stores[browserStore['safari-ios']],
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
 * iOS/iPadOS device check (lowercased UA). iPhone/iPod name themselves in the
 * UA; iPadOS Safari masquerades as desktop macOS, so a touch-capable
 * "Macintosh" is the iPad tell — no Mac ships a touchscreen.
 */
function isAppleMobile(ua: string): boolean {
  if (/iphone|ipod|ipad/.test(ua)) return true;
  return ua.includes('macintosh') && navigator.maxTouchPoints > 1;
}

/** First UA token (in priority order) that the lowercased UA contains. */
function tokenBrowser(ua: string): BrowserId | null {
  return UA_TOKENS.find(([token]) => ua.includes(token))?.[1] ?? null;
}

/**
 * Detect the visitor's browser. Client-only — reads `navigator`, so never call
 * it during SSR. Brave hides itself in the UA but exposes `navigator.brave`, so
 * it's matched on its own before the UA tokens. iOS/iPadOS is matched before the
 * tokens too: there the install target is the App Store app, not a Chromium
 * marketplace, and every browser is a WebKit shell whose UA still says "safari".
 */
export function detectBrowser(): BrowserId | null {
  if ('brave' in navigator) return 'brave';
  const ua = navigator.userAgent.toLowerCase();
  if (isAppleMobile(ua)) return 'safari-ios';
  return tokenBrowser(ua);
}
