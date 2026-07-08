/**
 * Host predicates shared by the redirect layer and the page-content extractors.
 *
 * "Is this host site X" has to agree across three places: the extension's
 * redirect rules (`apps/extension/src/sites/`), the capability resolver, and the
 * page-content extractors' `matches()`. Keeping the predicates here — a tiny,
 * dependency-free package — lets the pure model packages (consumed by
 * `apps/diagnostics` too) share them without importing extension code. The
 * redirect rules themselves are co-located with each site adapter.
 */

/**
 * Public suffixes Google operates a search frontend on, as exact dot-joined
 * trailing-label strings. Anchoring `isGoogleHost` to this curated set (rather
 * than a "1–2 trailing labels" length check) is what rejects spoof hosts such
 * as `google.evil.com` / `a.google.b`: the registrable `google` label must be
 * immediately followed by a *recognised* public suffix, and `evil.com` / `b`
 * are not in it.
 *
 * The set lists both the single-label TLDs (gTLD `com`; ccTLDs `de`, `es`, …)
 * and the multi-label public suffixes (`co.uk`, `com.ua`, …) Google uses. A
 * single-label trailing label is NOT accepted generically — that is exactly the
 * hole that let `a.google.b` through — so a real ccTLD apex must appear here.
 *
 * Dependency-free tradeoff (vs. pulling in the Public Suffix List / `tldts`):
 * the package's zero-dep invariant is preserved, but a brand-new Google ccTLD
 * shape needs an entry added here. The list is derived from Google's published
 * domain set; it is intentionally broad so a genuine ccTLD is never dropped.
 *
 * Space-separated packed strings, not an array literal, on purpose: this module
 * rides in the size-budgeted content script injected into every page, and the
 * array form spends 3 extra bytes per entry (quotes + comma) — ~370 bytes across
 * the 182 entries. Entries stay greppable (`com.ua` matches verbatim). The
 * `@__PURE__` annotations (on the constructor AND the `.split` argument — both
 * must be provably droppable) keep the initializer tree-shakeable in bundles
 * that never call `isGoogleHost`.
 */
const GOOGLE_PUBLIC_SUFFIXES = /* @__PURE__ */ new Set(
  /* @__PURE__ */ // Single-label gTLD / ccTLDs.
  (
    'com ac ad ae af ag al am as at az ba be bf bg bi bj bs bt by ca cat cd cf cg ch ci cl cm cn cv cz de dj dk dm dz ee es fi fm fr ga ge gg gl gm gp gr gy hn hr ht hu ie im iq is it je jo kg ki kz la li lk lt lu lv md me mg mk ml mn ms mu mv mw ne nl no nr nu pl pn ps pt ro rs ru rw sc se sh si sk sm sn so sr st td tg tk tl tm tn to tt us vg vu ws ' +
    // Multi-label public suffixes (co.*, com.*).
    'co.uk co.jp co.kr co.in co.id co.il co.za co.nz co.th co.ve co.ke co.cr co.ao co.bw co.ls co.ma co.mz co.tz co.ug co.uz co.vi co.zm co.zw com.ua com.au com.br com.mx com.ar com.co com.tr com.tw com.hk com.sg com.sa com.eg com.pk com.ph com.vn com.pe com.ec com.gt com.cu com.do com.bd com.bo com.bz com.gh com.gi com.kw com.lb com.ly com.mt com.my com.na com.nf com.ng com.ni com.np com.om com.pa com.pg com.py com.qa com.sb com.sl com.sv com.uy'
  ).split(' '),
);

/**
 * True when `host` is Google under any (cc)TLD — `google.com`, `google.com.ua`,
 * `google.co.uk` — including subdomains (`www.`, `news.`).
 *
 * Contract: the registrable domain must be exactly `google.<public-suffix>`.
 * `host` is accepted only when, after any subdomain chain, the `google` label is
 * immediately followed by one of the recognised public suffixes in
 * {@link GOOGLE_PUBLIC_SUFFIXES}. This rejects `notgoogle.com` (no `google`
 * label), `google.com.evil.com` (registrable label is `evil`, not `google`),
 * and spoof hosts like `google.evil.com` / `a.google.b` where the trailing
 * labels are not a Google public suffix.
 */
export function isGoogleHost(host: string): boolean {
  const labels = host.split('.');
  const i = labels.indexOf('google');
  if (i === -1) return false;
  return GOOGLE_PUBLIC_SUFFIXES.has(labels.slice(i + 1).join('.'));
}

/** True when `host` is youtube.com or any subdomain (www., m., …). */
export function isYouTubeHost(host: string): boolean {
  return host === 'youtube.com' || host.endsWith('.youtube.com');
}
