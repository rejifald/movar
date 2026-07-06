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
 * tab close. Each entry also carries a timestamp and self-expires after
 * `SUPPRESSION_TTL_MS`, so a long-lived or repeatedly-reloaded tab retries
 * after the window instead of staying blocked forever. Two legacy on-disk
 * formats — a bare URL string and a JSON array of URL strings — are migrated
 * inline on read (stamped as fresh) so users upgrading mid-loop recover
 * without manual storage clearing.
 */

import { SUPPRESSION_TTL_MS } from './time';

/** One recorded redirect attempt: the URL we redirected FROM and when. */
interface Attempt {
  url: string;
  ts: number;
}

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

/** Narrow an untrusted parsed array element to a timestamped attempt. */
function isAttempt(item: unknown): item is Attempt {
  return (
    typeof item === 'object' &&
    item !== null &&
    typeof (item as Attempt).url === 'string' &&
    typeof (item as Attempt).ts === 'number'
  );
}

/** Coerce one raw parsed array element into a live attempt, or null to drop it:
 *  legacy array-of-strings entries (no timestamp) are stamped fresh; new
 *  `{url,ts}` entries are kept only while unexpired. */
function toLiveEntry(item: unknown, now: number): Attempt | null {
  if (typeof item === 'string') return { url: item, ts: now };
  if (isAttempt(item) && now - item.ts < SUPPRESSION_TTL_MS) return item;
  return null;
}

/** Parse a JSON-array blob, returning [] on malformed JSON or a non-array. */
function parseArray(raw: string): unknown[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Parse the raw blob into live attempts: migrate the two legacy formats (a
 *  bare URL string, and a JSON array of URL strings) by stamping them with the
 *  current time — treated as fresh so an in-progress loop survives an upgrade —
 *  and drop any entry past the TTL. */
function readEntries(): Attempt[] {
  const raw = readStorage();
  if (raw == null || raw === '') return [];
  const now = Date.now();
  // Legacy single-URL format: bare string, not JSON. Migrate inline.
  if (!raw.startsWith('[')) return [{ url: raw, ts: now }];
  return parseArray(raw).flatMap((item) => {
    const entry = toLiveEntry(item, now);
    return entry ? [entry] : [];
  });
}

export function getAttemptedUrls(): string[] {
  return readEntries().map((e) => e.url);
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

/** Record the current URL as one we just initiated a redirect from, stamped
 *  with the current time for TTL expiry. Re-marking an already-tracked URL is a
 *  no-op (its original timestamp stands, so the backoff counts from the first
 *  attempt). Writing here also persists the migrated/pruned entries. */
export function markAttempt(href: string = location.href): void {
  const entries = readEntries();
  if (entries.some((e) => e.url === href)) return;
  const next = [...entries, { url: href, ts: Date.now() }];
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
