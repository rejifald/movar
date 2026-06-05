import type { LanguageCode } from '@movar/lang-detect';

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

/** Default ISO 3166-1 alpha-2 region for each language we ship a rule for.
 *  Picked to align with the primary user base (UA for Ukrainian, US for
 *  English — `en` users abroad can swap to en-GB via a manual priority
 *  entry like `en-GB`). */
const DEFAULT_REGIONS: Record<string, string> = {
  uk: 'UA',
  en: 'US',
  de: 'DE',
  fr: 'FR',
  es: 'ES',
  it: 'IT',
  pl: 'PL',
};

/**
 * Enrich a bare-ISO priority list with regional variants. Each bare code
 * becomes `<code>-<REGION>` followed by the bare code itself, so servers
 * that do strict region matching get the richer hint while servers that
 * only accept bare codes still match the fallback.
 *
 * Codes that already carry a region pass through untouched. Codes without
 * a known default region also pass through untouched — we don't guess.
 */
export function enrichWithRegions(priority: LanguageCode[]): LanguageCode[] {
  const out: LanguageCode[] = [];
  for (const code of priority) {
    if (code.includes('-')) {
      out.push(code);
      continue;
    }
    const region = DEFAULT_REGIONS[code.toLowerCase()];
    if (region) {
      out.push(`${code}-${region}`, code);
    } else {
      out.push(code);
    }
  }
  return out;
}
