import { describe, expect, it } from 'vitest';
import { messagesUk } from './messages-uk';

/**
 * Sanity-check that Ukrainian one/few/many plurals come out right at the
 * boundary values that catch the naive `n === 1 ? singular : plural` rule.
 * If these regress, every count-bearing string in the popup is wrong.
 */
describe('messagesUk plurals — hidden.feedHidden', () => {
  // Count-bearing popup string for blurred/hidden feed cards. Plural noun must
  // agree with `n` across the one/few/many boundaries.
  const cases: [number, string][] = [
    [1, 'Приховано 1 картку'], // one
    [2, 'Приховано 2 картки'], // few
    [4, 'Приховано 4 картки'], // few
    [5, 'Приховано 5 карток'], // many
    [11, 'Приховано 11 карток'], // many — 11 is the trap for naive mod10
    [12, 'Приховано 12 карток'], // many
    [14, 'Приховано 14 карток'], // many — 12-14 are many, not few
    [21, 'Приховано 21 картку'], // one
    [22, 'Приховано 22 картки'], // few
    [25, 'Приховано 25 карток'], // many
    [111, 'Приховано 111 карток'], // many
  ];

  it.each(cases)('n=%i agrees with "%s"', (n, expected) => {
    expect(messagesUk.hidden.feedHidden(n)).toBe(expected);
  });
});

describe('messagesUk plurals — hidden.feedCurtained', () => {
  // Nominative-subject agreement ("N cards behind a curtain"): картка / картки /
  // карток — distinct from feedHidden's accusative-object "Приховано N …".
  const cases: [number, string][] = [
    [1, '1 картка за завісою'], // one
    [2, '2 картки за завісою'], // few
    [5, '5 карток за завісою'], // many
    [11, '11 карток за завісою'], // many — the mod10 trap
    [21, '21 картка за завісою'], // one
  ];

  it.each(cases)('n=%i agrees with "%s"', (n, expected) => {
    expect(messagesUk.hidden.feedCurtained(n)).toBe(expected);
  });
});

describe('messagesUk plurals — hidden.collapsed', () => {
  it('uses singular noun and "у якому" for n=1', () => {
    expect(messagesUk.hidden.collapsed(1)).toBe(
      'Приховано 1 перемикач мов, у якому лишився один пункт',
    );
  });

  it('uses few-form noun for n=2..4', () => {
    expect(messagesUk.hidden.collapsed(3)).toBe(
      'Приховано 3 перемикачі мов, у яких лишився один пункт',
    );
  });

  it('uses many-form noun for n>=5', () => {
    expect(messagesUk.hidden.collapsed(7)).toBe(
      'Приховано 7 перемикачів мов, у яких лишився один пункт',
    );
  });
});

// The non-plural string-builder functions carry the catalogue's remaining
// branches (name interpolation, the empty/non-empty `hiding` list, the
// host-present/absent report subject). Drive each directly so a regression
// in the Ukrainian copy surfaces here, not at a store reviewer.

describe('messagesUk — pageStatus interpolation', () => {
  it('interpolates the language name into the served/blocked lines', () => {
    expect(messagesUk.pageStatus.servedIn('українська')).toBe('Мова сторінки — українська');
    expect(messagesUk.pageStatus.blockedTitle('російська')).toBe('Мова сторінки — російська');
  });

  it('lists hidden picker languages, with a generic fallback for the empty case', () => {
    expect(messagesUk.pageStatus.hiding(['російська', 'білоруська'])).toBe(
      'Приховано на цій сторінці: російська, білоруська',
    );
    expect(messagesUk.pageStatus.hiding([])).toBe('Дещо на цій сторінці приховано');
  });
});

describe('messagesUk — paused interpolation', () => {
  it('formats the paused-until date', () => {
    expect(messagesUk.pausedUntilDate('17:00')).toBe('До 17:00');
  });
});

describe('messagesUk — report mailto builders', () => {
  it('subject: includes the host when present, drops it when null', () => {
    expect(messagesUk.report.subject('example.com')).toBe('Мовар — проблема на example.com');
    expect(messagesUk.report.subject(null)).toBe('Мовар — проблема');
  });

  it('bodyPrompt: page-specific vs page-less wording', () => {
    expect(messagesUk.report.bodyPrompt(true)).toContain('на цій сторінці');
    expect(messagesUk.report.bodyPrompt(false)).toContain('Опишіть проблему');
  });
});

describe('messagesUk — options action labels', () => {
  it('priority move/remove labels inflect the language to the accusative', () => {
    // Direct-object verbs need the accusative endonym («українську»), not the
    // nominative «українська» the picker hands in.
    expect(messagesUk.options.priority.moveUp('українська')).toBe('Підняти українську вище');
    expect(messagesUk.options.priority.moveDown('англійська')).toBe('Опустити англійську нижче');
    expect(messagesUk.options.priority.remove('російська')).toBe('Видалити російську');
  });

  it('passes an unknown name through unchanged (no entry in the declension table)', () => {
    expect(messagesUk.options.priority.remove('example')).toBe('Видалити example');
  });

  it('allowlist remove interpolates the domain', () => {
    expect(messagesUk.options.allowlist.remove('example.com')).toBe('Видалити example.com');
  });
});

describe('messagesUk — conceal mode copy', () => {
  it('keeps the legend and options grammatically parallel', () => {
    expect(messagesUk.concealMode.legend).toBe('Що робити з прихованим вмістом');
    expect(messagesUk.concealMode.curtain).toEqual({
      label: 'Лишати за завісою',
      description: 'Розмивається, але лишається на місці — натисніть, щоб зазирнути',
    });
    expect(messagesUk.concealMode.hide).toEqual({
      label: 'Приховувати',
      description: 'Зникає, а сусідні картки змикаються',
    });
  });
});

describe('messagesUk — insights counts', () => {
  // one/few/many agreement for «виправлення» across the mod10/mod100 boundaries.
  const thisWeekCases: [number, string][] = [
    [1, '1 виправлення цього тижня'], // one
    [2, '2 виправлення цього тижня'], // few
    [5, '5 виправлень цього тижня'], // many
    [11, '11 виправлень цього тижня'], // many — the mod10 trap
    [21, '21 виправлення цього тижня'], // one
    [22, '22 виправлення цього тижня'], // few
  ];

  it.each(thisWeekCases)('thisWeek n=%i agrees with "%s"', (n, expected) => {
    expect(messagesUk.options.insights.thisWeek(n)).toBe(expected);
  });

  it('formats the retention-window total', () => {
    expect(messagesUk.options.insights.total(42)).toBe('42 за останні 30 днів');
  });

  it('agrees the per-site correction count across plural forms', () => {
    expect(messagesUk.options.insights.siteCount(1)).toBe('1 виправлення');
    expect(messagesUk.options.insights.siteCount(3)).toBe('3 виправлення');
    expect(messagesUk.options.insights.siteCount(5)).toBe('5 виправлень');
  });

  it('carries a label for every correction mechanism', () => {
    expect(messagesUk.options.insights.mechanism).toEqual({
      header: 'Попросив у сайту',
      cookie: 'Зберіг вибір на сайті',
      localStorage: 'Зберіг вибір у браузері',
      redirect: 'Відкрив потрібну адресу',
      dom: 'Змінив на сторінці',
      search: 'Додав підказку в пошук',
      'search-retry': 'Пошукав ще раз',
    });
  });

  it('names both language sources without naming a detector', () => {
    expect(messagesUk.options.insights.source).toEqual({
      declared: 'Сторінка сама сказала',
      read: 'Прочитав текст сторінки',
    });
  });

  it('keeps detector vocabulary out of the insights copy', () => {
    // Mirrors the en guard: docs/copy.md bans «рушій» / _sync tier_ here, and
    // the section must never render a raw detector id in either locale.
    const copy = [
      messagesUk.options.insights.title,
      messagesUk.options.insights.empty,
      messagesUk.options.insights.topSitesLabel,
      messagesUk.options.insights.byMechanismLabel,
      messagesUk.options.insights.bySourceLabel,
      ...Object.values(messagesUk.options.insights.mechanism),
      ...Object.values(messagesUk.options.insights.source),
    ].join(' | ');

    for (const banned of ['рушій', 'руші', 'sync tier', 'franc', 'cld', 'chrome-ai']) {
      expect(copy.toLowerCase()).not.toContain(banned);
    }
  });
});

describe('messagesUk onboarding — interpolated strings', () => {
  it('numbers each step', () => {
    expect(messagesUk.onboarding.stepLabel(2, 4)).toBe('Крок 2 з 4');
  });

  it('names the browser in the pin + access step bodies', () => {
    expect(messagesUk.onboarding.steps.pin.body('Chrome')).toContain('Chrome');
    expect(messagesUk.onboarding.access.chromium.body('Edge')).toContain('Edge');
  });
});
