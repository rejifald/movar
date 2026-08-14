import { auditRuleTitlesUk } from './audit-rule-titles';
import { messagesEn } from './messages-en';
import type { HostMessages } from './messages-en';
import { messagesUk } from './messages-uk';

export type { HostMessages, RungKey } from './messages-en';

/** The two locales the wrapper app ships, mirroring the native `en` + `uk`
 *  `.lproj` catalogues this screen replaced. */
export type HostLocale = 'en' | 'uk';

const CATALOGUES: Record<HostLocale, HostMessages> = {
  en: messagesEn,
  uk: messagesUk,
};

/**
 * Look up the host-shell string catalogue (tab labels + the About enablement
 * copy) for a resolved locale.
 *
 * Locale resolution is NOT duplicated here — `main.tsx` resolves `HostLocale`
 * from `navigator.language` through the shared `@movar/i18n` `resolveLocale`,
 * the same resolver the Settings tab's provider uses, so the shell chrome and
 * the product copy stay in lock-step. `HostLocale` is structurally the shared
 * `ResolvedLocale` (`'en' | 'uk'`), so the resolved value maps straight in.
 */
export function messagesFor(locale: HostLocale): HostMessages {
  return CATALOGUES[locale];
}

/**
 * A rule's title in the reader's language.
 *
 * `@movar/audit` is not translated — its English titles and finding summaries
 * are what an exported report carries and what the CLI reproduces, and a report
 * whose wording depends on who ran it would not be replayable. So the kernel
 * keeps one canonical wording and this maps it for DISPLAY only, keyed by the
 * rule ID (the package's permanent public API).
 *
 * Falls back to the kernel's own title, which is the right failure mode: a rule
 * this catalogue has not caught up with renders in English rather than
 * rendering blank. `audit-rule-titles.test.ts` fails the build when that
 * happens, so the fallback is a safety net and never the plan.
 */
export function ruleTitleFor(locale: HostLocale, ruleId: string, fallback: string): string {
  if (locale !== 'uk') return fallback;
  return auditRuleTitlesUk[ruleId] ?? fallback;
}
