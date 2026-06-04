/**
 * Shared deterministic state-seeding for the four marketplace screenshot
 * stories.
 *
 * Why a separate file: the same `MovarSettings` + correction-event seeds
 * are useful across scenes (popup-on-news shows the counter; correction-
 * applied shows it too on the after half), and the marketing screenshots
 * read more honestly when "today's corrections" sits at the same plausible
 * number across the set. Centralising the seeds also makes drift between
 * what the popup expects and what we hand it grep-able from one file.
 */
import type { CorrectionEvent, MovarSettings } from '@movar/shared';

const EVENTS_KEY = 'movar:events';

/** Storage key the popup reads for its in-popup counter. Re-exported as a
 *  constant so stories don't carry a magic string. */
export const EVENTS_STORAGE_KEY = EVENTS_KEY;

/**
 * Generate `n` synthetic correction events with timestamps spread across
 * the past few hours of "today" (local time, computed at story render).
 * The popup's `correctionsToday` filter is `timestamp >= startOfDay`, so
 * any value within today's window counts — spreading them keeps the
 * implied timeline plausible if a future scene ever surfaces the
 * timestamps themselves.
 *
 * Domains and mechanisms cycle through a small fixed list — the popup
 * doesn't render them, so accuracy isn't critical, but the data should
 * still be self-consistent if a future "history view" scene ever inspects
 * it.
 */
export function buildTodayEvents(n: number): CorrectionEvent[] {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const startMs = startOfDay.getTime();
  const nowMs = Date.now();
  const spanMs = Math.max(1, nowMs - startMs - 60_000);

  const domains = [
    'tochka24.example',
    'kolesnyk.example',
    'vector.example',
    'svitanok.example',
    'lvivlawyers.example',
  ];
  const mechanisms: CorrectionEvent['mechanism'][] = [
    'header',
    'redirect',
    'cookie',
    'search',
    'dom',
  ];

  return Array.from({ length: n }, (_, i) => ({
    timestamp: startMs + Math.floor((spanMs * (i + 1)) / (n + 1)),
    // Non-null assertion is safe — `domains.length` and `mechanisms.length`
    // are non-zero constants, so the modulo always lands on a real index.
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    domain: domains[i % domains.length]!,
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    mechanism: mechanisms[i % mechanisms.length]!,
    fromLang: 'ru',
    toLang: 'uk',
  }));
}

/**
 * Settings the Ukrainian-locale stories seed into `storage.sync`. Mirrors
 * the defaults from `@movar/shared` with `uiLanguage: 'uk'` so the popup
 * renders in Ukrainian without going through the `'auto'` resolution path
 * (which would otherwise call `browser.i18n.getUILanguage()` — handled by
 * the mock too, but pinning explicitly here makes the story self-
 * documenting).
 */
export const ukSettings: MovarSettings = {
  enabled: true,
  priority: ['uk', 'en'],
  blocked: ['ru'],
  allowlist: [],
  contentModification: true,
  diagnostics: false,
  uiLanguage: 'uk',
};
