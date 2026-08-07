/**
 * Shared sessionStorage plumbing for the per-host guard maps — `session-choice`
 * (which language the visitor picked by hand) and `gate-latch` (whether a
 * blocking language gate was already satisfied).
 *
 * Both persist a `Record<host, …>` blob into tab-scoped storage, and both have
 * to survive the same hostile inputs: a store that throws outright (private
 * mode, a sandboxed iframe), a missing key, corrupt JSON, and a value that
 * parses fine but isn't an object. That read is the ONLY thing they share —
 * what each does with the entries afterwards (TTL, migration, normalization)
 * stays in its own module, because those rules differ.
 *
 * `loop-guard` deliberately doesn't use this: it stores an array of attempts,
 * not a host-keyed map, and carries two legacy on-disk shapes to migrate.
 */

/** Parse the JSON object stored at `key`, or `{}` when it is absent,
 *  unreadable, malformed, or not a plain object. Never throws. */
export function readSessionMap(key: string): Record<string, unknown> {
  let raw: string | null;
  try {
    raw = sessionStorage.getItem(key);
  } catch {
    return {};
  }
  if (raw == null || raw === '') return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  return parsed as Record<string, unknown>;
}

/** Serialize `map` to `key`. Silently accepts an unavailable store — callers
 *  that need to know whether the write stuck must read it back (see
 *  `gate-latch`, where a lost write has to suppress the action it guards). */
export function writeSessionMap(key: string, map: object): void {
  try {
    sessionStorage.setItem(key, JSON.stringify(map));
  } catch {
    // sessionStorage unavailable (private mode, sandboxed iframe) — accept that
    // the guard is a no-op in that environment.
  }
}
