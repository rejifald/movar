/**
 * CLDR-correct plural selection backed by `Intl.PluralRules` — the platform's
 * own ICU/CLDR data — so each locale's one/few/many/other boundaries come from
 * the runtime instead of a hand-maintained rule. Replaces the bespoke Ukrainian
 * mod10/mod100 rule the catalogues used to carry, and generalises for free to
 * any future locale (Belarusian, Polish, …) without a new rule to get right.
 *
 * Every browser that runs Movar already ships `Intl.PluralRules` (Chrome 63+,
 * Firefox 58+, Safari 13+) — strictly wider/older support than the
 * `Intl.DisplayNames` the popup already depends on, so this adds no platform
 * risk.
 */

/**
 * Forms the caller supplies, keyed by CLDR category. `other` is mandatory: it is
 * English's plural form, every locale's fraction form, and the fallback for any
 * category a locale produces that the caller didn't spell out.
 */
export type PluralForms<T> = Partial<Record<Intl.LDMLPluralRule, T>> & { other: T };

// One Intl.PluralRules per locale: construction isn't free and each catalogue
// only ever asks about its own locale, so memoising keeps it to a single build.
const rulesByLocale = new Map<string, Intl.PluralRules>();

function pluralRulesFor(locale: string): Intl.PluralRules {
  const cached = rulesByLocale.get(locale);
  if (cached) return cached;
  const rules = new Intl.PluralRules(locale);
  rulesByLocale.set(locale, rules);
  return rules;
}

/**
 * Pick the plural form for `n` in `locale`. Cardinal (counting) rules — the
 * default — so the result agrees with a counted noun. Falls back to
 * `forms.other` for any category the locale produces but the caller omitted.
 *
 *   plural('uk', 2, { one: 'картка', few: 'картки', many: 'карток', other: 'картки' })  // → 'картки'
 *   plural('en', 3, { one: 'card', other: 'cards' })                                     // → 'cards'
 */
export function plural<T>(locale: string, n: number, forms: PluralForms<T>): T {
  return forms[pluralRulesFor(locale).select(n)] ?? forms.other;
}
