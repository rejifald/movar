/**
 * Per-host record that Movar already satisfied a blocking language gate on this
 * site this session.
 *
 * Why this has to outlive the page load rather than being a module-level flag:
 * satisfying a gate normally *reloads* the page — the site re-renders once its
 * own handler has persisted a cookie — so a per-load latch is already gone by
 * the time the question is asked again. If the site's persistence then fails
 * (cookies blocked for the host, a partitioned context, a gate that ignores its
 * own handler), the gate comes back on the reloaded page, and an unlatched Movar
 * would satisfy it again, and again. One shot per host per session turns that
 * infinite reload loop into a single wasted reload, after which the visitor
 * clicks the gate themselves — annoying once, which is strictly better than a
 * page that never stops reloading.
 *
 * Deliberately NOT the loop guard (`loop-guard.ts`): that guard is URL-keyed and
 * `applyOnceInner` clears it on every page whose language isn't blocked — which
 * is precisely the situation a gate shows up in — so it cannot hold this state.
 * Deliberately NOT `session-choice.ts` either: a Movar-driven click is not the
 * visitor expressing a preference, and recording it there would suppress every
 * other Movar behaviour on the host.
 *
 * Storage and lifecycle mirror `session-choice` / `loop-guard`: sessionStorage,
 * tab-scoped, cleared on tab close, with a per-entry `SUPPRESSION_TTL_MS` expiry
 * so a long-lived tab isn't latched forever.
 */
import { readSessionMap, writeSessionMap } from './session-map';
import { SUPPRESSION_TTL_MS } from './time';

const STORAGE_KEY = 'movar:gateSatisfied';

/** host → epoch ms at which the gate was satisfied. */
type LatchMap = Record<string, number>;

/** Live entries only: a non-numeric timestamp is corrupt and an expired one is
 *  spent, and both mean "not latched" — which is the answer that lets Movar act
 *  again, so neither may survive the read. */
function readMap(): LatchMap {
  const now = Date.now();
  const out: LatchMap = {};
  for (const [host, ts] of Object.entries(readSessionMap(STORAGE_KEY))) {
    if (typeof ts === 'number' && now - ts < SUPPRESSION_TTL_MS) out[host] = ts;
  }
  return out;
}

/** True when a gate on `host` was already satisfied this session. */
export function isGateSatisfied(host: string): boolean {
  return host in readMap();
}

/**
 * Record that a gate on `host` has been satisfied, and report whether the record
 * actually stuck. A `false` return means sessionStorage is unavailable, so the
 * latch cannot hold — the caller must NOT go on to click, because nothing would
 * stop it from clicking again on the reload.
 */
export function markGateSatisfied(host: string): boolean {
  const map = readMap();
  map[host] = Date.now();
  writeSessionMap(STORAGE_KEY, map);
  return isGateSatisfied(host);
}
