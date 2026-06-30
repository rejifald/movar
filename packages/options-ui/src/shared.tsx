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

/** Strip protocol, path, and port from whatever the user typed. */
export function normaliseDomain(input: string): string {
  return (
    input
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      // eslint-disable-next-line sonarjs/slow-regex -- linear pattern (single greedy `.*` with no overlapping quantifier or alternation cannot backtrack catastrophically); input is the user's own typed domain in the options form, bounded and trusted
      .replace(/[/:].*$/, '')
  );
}

export const DOMAIN_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;

interface AddLanguagePickerProps {
  label: string;
  options: readonly LanguageCode[];
  onAdd: (code: LanguageCode) => void;
}

export function AddLanguagePicker({
  label,
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
        Add
      </Button>
    </div>
  );
}
