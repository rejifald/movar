/**
 * English display name for a language code — the standalone replacement for the
 * product's i18n `makeLanguageDisplay` (this dev extension is English-only).
 * Covers the codes Movar reasons about explicitly; falls back to
 * `Intl.DisplayNames` and finally to the raw code.
 */
const NAMES: Record<string, string> = {
  uk: 'Ukrainian',
  ru: 'Russian',
  be: 'Belarusian',
  bg: 'Bulgarian',
  en: 'English',
  pl: 'Polish',
  de: 'German',
  fr: 'French',
  es: 'Spanish',
  it: 'Italian',
};

let display: Intl.DisplayNames | null = null;
function intlName(code: string): string {
  try {
    display ??= new Intl.DisplayNames(['en'], { type: 'language' });
    return display.of(code) ?? code;
  } catch {
    return code;
  }
}

export function languageName(code: string): string {
  if (code === 'unknown') return 'Unknown';
  return NAMES[code.toLowerCase()] ?? intlName(code);
}
