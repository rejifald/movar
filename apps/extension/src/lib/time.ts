/**
 * Duration constants, so time math reads in named units instead of
 * `24 * 60 * 60 * 1000`-style magic-number chains. Values are milliseconds
 * unless the name ends in `_SECONDS` (some browser APIs — cookie `max-age` —
 * count in seconds).
 */
export const HOUR_MS = 3_600_000; // 60 min × 60 s × 1000 ms
export const DAY_MS = 86_400_000; // 24 h × 60 min × 60 s × 1000 ms
export const DAY_SECONDS = 86_400; // 24 h × 60 min × 60 s

/** How long a session-scoped switch guard stays armed before it self-expires.
 *  Both the loop guard (a redirect "hiccup") and a manual picker choice back off
 *  for this window, then a later apply tick / reload / reopen retries — so Movar
 *  never sits in a permanent blocked state. Single knob for both guards. */
export const SUPPRESSION_TTL_MS = DAY_MS;
