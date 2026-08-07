/**
 * Per-host record of the language the user explicitly picked on a site this
 * session — by clicking the site's own language picker. When such a record
 * exists for the current host and the page is already serving that language,
 * the redirect/filter pipeline (`applyOnce` in `content.ts`) treats the page
 * as "this is what the user asked for" and stops re-asserting the global
 * preference. Without this, a user who clicks "Switch to Russian" on a
 * shop whose Russian is blocked would land on the Russian page and get
 * immediately bounced back to Ukrainian — undoing their click.
 *
 * Scope: hostname only. Different hostnames under the same eTLD+1 keep
 * independent choices (shop.example.com ≠ help.example.com); the picker click
 * was on a specific site, not the whole org.
 *
 * Storage: sessionStorage — same lifecycle as `loop-guard`. Tab-scoped, clears
 * on tab close. Choices survive in-tab navigation but don't leak to other
 * tabs or future browser sessions, matching the "for current session" wording.
 * Each choice also self-expires after `SUPPRESSION_TTL_MS` so a stale pick can't
 * pin a long-open tab to a blocked language forever. A legacy bare-string value
 * (no timestamp, from pre-#184 builds) is migrated to `{lang,ts}` and written
 * back once on first read, so the fixed timestamp stops being re-derived as
 * `now` on every read and can actually cross `SUPPRESSION_TTL_MS`.
 */
import { normalizeLanguageCode } from '@movar/lang-detect';
import type { LanguageCode } from '@movar/lang-detect';
import { readSessionMap, writeSessionMap } from './session-map';
import { SUPPRESSION_TTL_MS } from './time';

const STORAGE_KEY = 'movar:pickerChoice';

/** One recorded picker choice: the language the user switched to, and when. */
interface Choice {
  lang: string;
  ts: number;
}

/** Narrow an untrusted parsed value to a timestamped choice. */
function isChoice(value: unknown): value is Choice {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Choice).lang === 'string' &&
    typeof (value as Choice).ts === 'number'
  );
}

/** Apply one raw stored value onto `out[host]`, returning whether it needed
 *  migrating: a legacy bare-string value (no timestamp) is stamped fresh and
 *  reported as migrated; a timestamped choice is kept only while unexpired
 *  and never reported as migrated (its stored shape didn't change). */
function applyChoice(
  out: Record<string, Choice>,
  host: string,
  value: unknown,
  now: number,
): boolean {
  if (typeof value === 'string') {
    out[host] = { lang: value, ts: now };
    return true;
  }
  if (isChoice(value) && now - value.ts < SUPPRESSION_TTL_MS) out[host] = value;
  return false;
}

// Legacy bare-string values (no timestamp) are migrated to `{lang,ts}` via
// applyChoice and, when any entry needed migrating, written back once
// (persistIfMigrated) so the fixed timestamp survives instead of being
// re-derived as `now` on every read; timestamped entries past the TTL are
// dropped without triggering a write. Parsing the untrusted blob itself lives
// in `session-map`, shared with `gate-latch`.
function readMap(): Record<string, Choice> {
  const now = Date.now();
  const out: Record<string, Choice> = {};
  let migrated = false;
  for (const [host, value] of Object.entries(readSessionMap(STORAGE_KEY))) {
    if (applyChoice(out, host, value, now)) migrated = true;
  }
  persistIfMigrated(out, migrated);
  return out;
}

function writeMap(map: Record<string, Choice>): void {
  writeSessionMap(STORAGE_KEY, map);
}

/** Persist `map` once when this read actually migrated a legacy bare-string
 *  choice, so the fixed timestamp sticks instead of being re-derived as `now`
 *  on every subsequent read. A no-op otherwise, so a read of already-normalized
 *  choices never re-writes storage. */
function persistIfMigrated(map: Record<string, Choice>, migrated: boolean): void {
  if (migrated) writeMap(map);
}

/** Read the language the user picked for `host` this session, or null if
 *  none. Stored values are validated through `normalizeLanguageCode` so a
 *  corrupt or unknown code falls back to "no choice" rather than feeding a
 *  bogus language through the rest of the pipeline. */
export function getPickerChoice(host: string): LanguageCode | null {
  const choice = readMap()[host];
  return choice != null && choice.lang !== '' ? normalizeLanguageCode(choice.lang) : null;
}

/** Persist that the user clicked the site's own language picker on `host`
 *  to switch to `language`. Overwrites any prior choice — most recent click
 *  wins; we don't try to interpret "user clicked twice, what did they mean". */
export function recordPickerChoice(host: string, language: LanguageCode): void {
  const map = readMap();
  map[host] = { lang: language, ts: Date.now() };
  writeMap(map);
}

/** Drop the recorded choice for `host` while preserving choices for other hosts. */
export function clearPickerChoice(host: string): void {
  const map = readMap();
  if (!(host in map)) return;
  const { [host]: _removed, ...rest } = map;
  writeMap(rest);
}
