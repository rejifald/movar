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

/** True when `host` is Google under any (cc)TLD — google.com, google.com.ua,
 *  google.co.uk — including subdomains (www., news.). Matches a registrable
 *  `google` label followed by a 1–2 label public suffix; rejects notgoogle.com
 *  (no `google` label) and google.com.evil.com (too many trailing labels).
 *  Tighter anti-spoofing (e.g. rejecting google.evil.com) would require the
 *  Public Suffix List. */
export function isGoogleHost(host: string): boolean {
  const labels = host.split('.');
  const i = labels.indexOf('google');
  if (i === -1) return false;
  const trailing = labels.length - 1 - i;
  return trailing >= 1 && trailing <= 2;
}

/** True when `host` is youtube.com or any subdomain (www., m., …). */
export function isYouTubeHost(host: string): boolean {
  return host === 'youtube.com' || host.endsWith('.youtube.com');
}
