import { describe, expect, it } from 'vitest';
import { contentStringsEn } from '../../../apps/extension/src/lib/i18n/content-strings-en';
import { contentStringsUk } from '../../../apps/extension/src/lib/i18n/content-strings-uk';
import { CURTAIN } from '../src/capture/shots';

/** Maestro regexes are full-match, like JS `^(?:…)$`. */
const fullMatch = (pattern: string, text: string): boolean =>
  new RegExp(`^(?:${pattern})$`).test(text);

describe('shot expectations follow the extension copy', () => {
  it.each([
    ['uk', contentStringsUk],
    ['en', contentStringsEn],
  ] as const)('the %s curtain regex matches both curtain labels', (locale, strings) => {
    expect(fullMatch(CURTAIN[locale], strings.contentHidden.ariaLabel)).toBe(true);
    expect(fullMatch(CURTAIN[locale], strings.contentHidden.ariaLabelRussian)).toBe(true);
  });
});
