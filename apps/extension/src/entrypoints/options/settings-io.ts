import { enforceLockedLanguages } from '@movar/settings';
import { migrateSettings } from '@movar/settings/migrate';
import type { MovarSettings } from '@movar/settings';

/** Download filename for an exported settings blob. */
export const SETTINGS_FILENAME = 'movar-settings.json';

/** Pretty-print the current settings for a `movar-settings.json` download. */
export function serializeSettings(settings: MovarSettings): string {
  return JSON.stringify(settings, null, 2);
}

/**
 * Parse + sanitize an imported settings blob into a valid, policy-compliant
 * {@link MovarSettings}.
 *
 * Runs the same ladder a storage read does ({@link migrateSettings} then
 * {@link enforceLockedLanguages}): a partial/stale/forward-version object is
 * coerced (missing keys backfilled, unknown language codes dropped), and the
 * locked-language invariant (`ru` stays blocked, never in priority) is
 * re-asserted last — so an exported-from-an-old-build or hand-edited file
 * imports forward cleanly and can't unlock Russian. There is no separate import
 * sanitizer to keep in sync.
 *
 * Throws on malformed JSON (the caller surfaces a localized error and leaves
 * stored settings untouched).
 */
export function parseImportedSettings(text: string): MovarSettings {
  return enforceLockedLanguages(migrateSettings(JSON.parse(text)));
}
