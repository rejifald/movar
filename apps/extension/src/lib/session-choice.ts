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
 * pin a long-open tab to a blocked language forever.
 */
import { normalizeLanguageCode } from '@movar/lang-detect';
import type { LanguageCode } from '@movar/lang-detect';
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

// Flat parse-and-validate of an untrusted sessionStorage blob; the guards are
// independent preconditions, not nested logic. Legacy bare-string values (no
// timestamp) are stamped fresh; timestamped entries past the TTL are dropped.
// fallow-ignore-next-line complexity
function readMap(): Record<string, Choice> {
  let raw: string | null;
  try {
    raw = sessionStorage.getItem(STORAGE_KEY);
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
  const now = Date.now();
  const out: Record<string, Choice> = {};
  for (const [host, value] of Object.entries(parsed as Record<string, unknown>)) {
    // Legacy: bare language string (no timestamp) → stamp fresh.
    if (typeof value === 'string') out[host] = { lang: value, ts: now };
    else if (isChoice(value) && now - value.ts < SUPPRESSION_TTL_MS) out[host] = value;
  }
  return out;
}

function writeMap(map: Record<string, Choice>): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // sessionStorage unavailable (private mode, sandboxed iframe) — accept
    // that the choice is a no-op in that environment.
  }
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
