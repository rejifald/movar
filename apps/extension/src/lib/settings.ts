import { browser } from 'wxt/browser';
import { defaultSettings, enforceLockedLanguages, normalizeAllowlist } from '@movar/settings';
import { migrateSettings } from '@movar/settings/migrate';
import type { MovarSettings } from '@movar/settings';

const SETTINGS_KEY = 'settings';

/**
 * Policy invariants applied at every read and before every write, so stored and
 * in-memory settings can never disagree:
 *   - `enforceLockedLanguages` — the locked invariant (Russian blocked, never in
 *     priority) always wins, even if coercion reintroduced or stripped something.
 *   - `normalizeAllowlist` — exempt domains reduced to their canonical form (bare
 *     lowercase domain, `www.`/scheme/path stripped, invalid entries dropped) so
 *     the runtime host matcher and the DNR `excludedRequestDomains` can't drift
 *     from what the UI stored (#90).
 */
function enforceInvariants(settings: MovarSettings): MovarSettings {
  const locked = enforceLockedLanguages(settings);
  return { ...locked, allowlist: normalizeAllowlist(locked.allowlist) };
}

/**
 * Single choke point for turning a raw stored value (any version, possibly
 * malformed — `storage.sync` roams across devices/builds) into a valid,
 * policy-compliant {@link MovarSettings}. Order matters:
 *   1. `migrateSettings` — version ladder + per-element coercion (drops unknown
 *      language codes, dedupes, type-checks scalars), tolerant of future
 *      versions. Also backfills any missing key from `defaultSettings`.
 *   2. `enforceInvariants` — runs LAST so the locked-language and canonical
 *      exempt-domain invariants always win over whatever coercion produced.
 */
function normalizeSettings(raw: unknown): MovarSettings {
  return enforceInvariants(migrateSettings(raw));
}

export async function getSettings(): Promise<MovarSettings> {
  const stored = await browser.storage.sync.get(SETTINGS_KEY);
  // Migrate + coerce in memory on every read — cheap and side-effect-free. We
  // deliberately do NOT write the normalized value back here: a read must not
  // mutate storage (it would fire storage.onChanged and surprise the popup /
  // content listeners, and churn sync on every read). The migration ladder keeps
  // every read valid regardless of which version roamed in via storage.sync; the
  // cleaned value persists naturally on the next setSettings().
  return normalizeSettings(stored[SETTINGS_KEY]);
}

export async function setSettings(next: MovarSettings): Promise<void> {
  await browser.storage.sync.set({ [SETTINGS_KEY]: enforceInvariants(next) });
}

/** Ensure settings are initialised on first install. */
export async function ensureSettingsInitialised(): Promise<void> {
  const stored = await browser.storage.sync.get(SETTINGS_KEY);
  if (stored[SETTINGS_KEY] == null) await setSettings(defaultSettings);
}

/** Subscribe to settings changes. Returns an unsubscribe function. */
export function onSettingsChange(handler: (next: MovarSettings) => void): () => void {
  const listener: Parameters<typeof browser.storage.onChanged.addListener>[0] = (changes, area) => {
    if (area !== 'sync' || !(SETTINGS_KEY in changes)) return;
    const change = changes[SETTINGS_KEY];
    if (change.newValue != null) {
      handler(normalizeSettings(change.newValue));
    }
  };
  browser.storage.onChanged.addListener(listener);
  return () => {
    browser.storage.onChanged.removeListener(listener);
  };
}
