/**
 * URL-scoped loop guard for the language-switch flow. Each navigation we
 * initiate is recorded against the page we redirected FROM. If we wake up on
 * a URL already in that history, the previous attempt led us back — bail
 * before kicking off another bounce. Used together with the navigation
 * pre-check (`hasAttemptedNavTo`) so we can also refuse to start a redirect
 * to a URL we've already tried.
 *
 * Why a set, not a single URL: sites with a misconfigured `<html lang>`
 * (every locale path serves `lang="ru"`, with hreflang pointing at sibling
 * URLs) can oscillate between two or more URLs that all read as the same
 * blocked language. A single-URL guard misses that — it remembers the
 * previous URL, but we're never on it when we check.
 *
 * State lives in `sessionStorage` so it scopes to the tab and clears on
 * tab close. The legacy single-URL format (`movar:redirectedFrom` = bare
 * string) is migrated inline on read so users upgrading mid-loop recover
 * without manual storage clearing.
 */

const ATTEMPT_KEY = 'movar:redirectedFrom';
/** Older builds wrote a binary flag at this key — sweep it on clear. */
const LEGACY_BINARY_KEY = 'movar:redirected';
/** Cap on remembered URLs. Eight covers the deepest oscillation we've seen
 *  in the wild (3-way locale bounce with x-default fallback) with headroom,
 *  while keeping storage cheap. */
const MAX_TRACKED_URLS = 8;

function readStorage(): string | null {
  try {
    return sessionStorage.getItem(ATTEMPT_KEY);
  } catch {
    return null;
  }
}

function writeStorage(value: string): void {
  try {
    sessionStorage.setItem(ATTEMPT_KEY, value);
  } catch {
    // sessionStorage unavailable (private mode, sandboxed iframe) — accept
    // that the guard is a no-op in that environment.
  }
}

export function getAttemptedUrls(): string[] {
  const raw = readStorage();
  if (!raw) return [];
  // Legacy single-URL format: bare string, not JSON. Migrate inline.
  if (!raw.startsWith('[')) return [raw];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === 'string');
  } catch {
    return [];
  }
}

/** True if the current URL is one we previously redirected FROM. The
 *  redirect bounced us back — every redirect path should bail. */
export function recentlyAttemptedHere(href: string = location.href): boolean {
  return getAttemptedUrls().includes(href);
}

/** True if `href` is a URL we previously redirected FROM. Used pre-nav to
 *  skip candidate targets that would re-enter the loop. */
export function hasAttemptedNavTo(href: string): boolean {
  return getAttemptedUrls().includes(href);
}

/** Record the current URL as one we just initiated a redirect from. */
export function markAttempt(href: string = location.href): void {
  const urls = getAttemptedUrls();
  if (urls.includes(href)) return;
  const next = [...urls, href];
  while (next.length > MAX_TRACKED_URLS) next.shift();
  writeStorage(JSON.stringify(next));
}

/** Drop the whole history. Called when we land on a non-blocked page and
 *  the previous redirect chain (if any) succeeded. */
export function clearAttempt(): void {
  try {
    sessionStorage.removeItem(ATTEMPT_KEY);
    sessionStorage.removeItem(LEGACY_BINARY_KEY);
  } catch {
    // ignored
  }
}
