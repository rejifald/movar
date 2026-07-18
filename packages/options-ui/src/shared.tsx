import { useState } from 'react';
import type { JSX } from 'react';
import type { LanguageCode } from '@movar/lang-detect';
import { Button, Select } from '@movar/ui';
import type { SelectOption } from '@movar/ui';

/**
 * Catalog of languages users can pick from in either list. Mirrors the
 * "Preferred-language options" list in apps/extension/STORE-LISTING.md —
 * keep them in sync when adding support for a new language.
 */
export const SUPPORTED_LANGUAGES: readonly LanguageCode[] = [
  'uk',
  'en',
  'de',
  'fr',
  'es',
  'it',
  'pl',
  'ru',
];

// Small Intl.DisplayNames wrapper; the try/catch + optional-locale ternary reads
// flatter inline than any split would.
// fallow-ignore-next-line complexity
export function displayLanguage(code: LanguageCode, locale?: string): string {
  try {
    const names = new Intl.DisplayNames(locale != null && locale !== '' ? [locale] : undefined, {
      type: 'language',
    });
    return names.of(code) ?? code;
  } catch {
    return code;
  }
}

// The exempt-site domain contract (normaliser + validity pattern) lives in the
// pure @movar/settings package — the same canonical form the app's settings
// boundary stores and the runtime matcher expects — so the options form can't
// drift from what actually gets stored/matched. Re-exported here to keep the
// @movar/options-ui surface (and AllowlistSection's `./shared` import) stable.
export { DOMAIN_PATTERN, normaliseDomain } from '@movar/settings';

interface AddLanguagePickerProps {
  /** Descriptive label — the select's placeholder and the accessible name of
   *  both the select and the confirm button (e.g. "Add language"). */
  label: string;
  /** Compact visible text on the confirm button (e.g. "Add" / "Додати"). Pulled
   *  from the catalogue by the caller so it's localised — the button previously
   *  hard-coded the English "Add", which leaked through in the Ukrainian UI. */
  buttonLabel: string;
  options: readonly LanguageCode[];
  onAdd: (code: LanguageCode) => void;
}

export function AddLanguagePicker({
  label,
  buttonLabel,
  options,
  onAdd,
}: Readonly<AddLanguagePickerProps>): JSX.Element {
  const [draft, setDraft] = useState<LanguageCode>('');

  const handleAdd = (): void => {
    if (!draft) return;
    onAdd(draft);
    setDraft('');
  };

  const selectOptions: readonly SelectOption[] = options.map((code) => ({
    value: code,
    label: `${displayLanguage(code, 'en')} (${code})`,
  }));

  return (
    <div className="mt-4 flex max-w-md items-center gap-2">
      <Select
        value={draft}
        onChange={setDraft}
        options={selectOptions}
        placeholder={`${label}…`}
        aria-label={label}
        variant="form"
        className="flex-1"
      />
      <Button onClick={handleAdd} disabled={!draft} aria-label={label}>
        {buttonLabel}
      </Button>
    </div>
  );
}
