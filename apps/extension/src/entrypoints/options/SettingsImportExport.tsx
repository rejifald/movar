import { useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import type { MovarSettings } from '@movar/settings';
import { getSettings } from '../../lib/settings';
import { useI18n } from '../../lib/i18n';
import { parseImportedSettings, serializeSettings, SETTINGS_FILENAME } from './settings-io';

interface Props {
  /** Apply imported settings — the options page's `update` (sets local state +
   *  persists through `setSettings` → `enforceLockedLanguages`). */
  onImport: (next: MovarSettings) => void;
}

/** Download the current stored settings as `movar-settings.json`. Module-scoped
 *  (no component state) — it reads storage, builds a Blob, and clicks a
 *  transient anchor. */
async function exportSettings(): Promise<void> {
  const blob = new Blob([serializeSettings(await getSettings())], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = SETTINGS_FILENAME;
  anchor.click();
  URL.revokeObjectURL(url);
}

/**
 * Export / Import controls for the options footer. Export downloads the current
 * stored settings as `movar-settings.json`; Import reads a chosen file, parses +
 * sanitizes it (see {@link parseImportedSettings}), and applies it. Malformed
 * JSON surfaces a localized error and leaves stored settings untouched.
 *
 * Dumb-simple by design: no schema versioning here — the migration ladder in
 * `parseImportedSettings` backfills new keys and re-asserts the locked-language
 * invariant, so an older export imports forward cleanly.
 */
export function SettingsImportExport({ onImport }: Readonly<Props>) {
  const { t } = useI18n();
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = (event: ChangeEvent<HTMLInputElement>): void => {
    setError(null);
    const file = event.target.files?.[0];
    // Reset so re-choosing the same file fires `change` again.
    event.target.value = '';
    if (file == null) return;
    void file
      .text()
      .then((text) => {
        onImport(parseImportedSettings(text));
      })
      .catch(() => {
        setError(t.options.io.importError);
      });
  };

  return (
    <div className="flex flex-col items-start gap-1">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => void exportSettings()}
          className="hover:text-ink-strong transition-colors"
        >
          {t.options.io.export}
        </button>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="hover:text-ink-strong transition-colors"
        >
          {t.options.io.import}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={handleFile}
        />
      </div>
      {error == null ? null : (
        <span role="alert" className="text-danger text-[11px]">
          {error}
        </span>
      )}
    </div>
  );
}
