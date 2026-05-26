import type { LanguageCode } from '@movar/shared';

/**
 * Build an `Accept-Language` header value from an ordered priority list.
 * The first language gets implicit q=1; each subsequent one steps down by 0.1
 * (floored at 0.1). e.g. ['uk', 'en'] -> "uk,en;q=0.9".
 */
export function buildAcceptLanguage(priority: LanguageCode[]): string {
  return priority
    .map((lang, i) => {
      if (i === 0) return lang;
      const q = Math.max(0.1, 1 - i * 0.1).toFixed(1);
      return `${lang};q=${q}`;
    })
    .join(',');
}
