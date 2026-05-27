import { useState, type ReactNode } from 'react';
import type { LanguageCode } from '@movar/shared';

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

export function displayLanguage(code: LanguageCode, locale?: string): string {
  try {
    const names = new Intl.DisplayNames(locale ? [locale] : undefined, { type: 'language' });
    return names.of(code) ?? code;
  } catch {
    return code;
  }
}

export function flagLetter(code: LanguageCode): string {
  return displayLanguage(code, code).charAt(0).toUpperCase();
}

/** Strip protocol, path, and port from whatever the user typed. */
export function normaliseDomain(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/[/:].*$/, '');
}

export const DOMAIN_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;

interface IconButtonProps {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}

export function IconButton({ label, onClick, disabled = false, children }: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="text-ink-soft hover:text-ink-strong hover:bg-surface-3 disabled:text-ink-faint flex size-7 items-center justify-center rounded-md font-mono text-[14px] transition-colors disabled:cursor-not-allowed disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}

interface AddLanguagePickerProps {
  label: string;
  options: readonly LanguageCode[];
  onAdd: (code: LanguageCode) => void;
}

export function AddLanguagePicker({ label, options, onAdd }: AddLanguagePickerProps) {
  const [draft, setDraft] = useState('');

  const handleAdd = (): void => {
    if (!draft) return;
    onAdd(draft);
    setDraft('');
  };

  return (
    <div className="mt-4 flex max-w-md items-center gap-2">
      <select
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
        }}
        aria-label={label}
        className="border-border bg-surface text-ink-strong focus:border-accent flex-1 rounded-lg border px-3 py-2 text-[13px] outline-none"
      >
        <option value="">{label}…</option>
        {options.map((code) => (
          <option key={code} value={code}>
            {displayLanguage(code, 'en')} ({code})
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={handleAdd}
        disabled={!draft}
        className="bg-ink-strong text-bg hover:bg-ink disabled:bg-surface-3 disabled:text-ink-faint rounded-lg px-4 py-2 text-[13px] font-medium transition-colors disabled:cursor-not-allowed"
      >
        Add
      </button>
    </div>
  );
}
