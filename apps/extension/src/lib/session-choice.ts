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
 */
import { normalizeLanguageCode } from '@movar/lang-detect';
import type { LanguageCode } from '@movar/lang-detect';

const STORAGE_KEY = 'movar:pickerChoice';

// Flat parse-and-validate of an untrusted sessionStorage blob; the guards are
// independent preconditions, not nested logic.
// fallow-ignore-next-line complexity
function readMap(): Record<string, string> {
  let raw: string | null;
  try {
    raw = sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return {};
  }
  if (raw == null || raw === '') return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Record<string, string> = {};
    for (const [host, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === 'string') out[host] = value;
    }
    return out;
  } catch {
    return {};
  }
}

function writeMap(map: Record<string, string>): void {
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
  const value = readMap()[host];
  return value != null && value !== '' ? normalizeLanguageCode(value) : null;
}

/** Persist that the user clicked the site's own language picker on `host`
 *  to switch to `language`. Overwrites any prior choice — most recent click
 *  wins; we don't try to interpret "user clicked twice, what did they mean". */
export function recordPickerChoice(host: string, language: LanguageCode): void {
  const map = readMap();
  map[host] = language;
  writeMap(map);
}

/** Drop the recorded choice for `host`. Exposed for tests; production code
 *  has no reason to call this — the storage clears on tab close anyway. */
export function clearPickerChoice(host: string): void {
  const map = readMap();
  if (!(host in map)) return;
  const { [host]: _removed, ...rest } = map;
  writeMap(rest);
}
