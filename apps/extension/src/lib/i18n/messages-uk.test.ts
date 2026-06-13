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
      'Згорнуто 1 перемикач, у якому залишився один пункт',
    );
  });

  it('uses few-form noun for n=2..4', () => {
    expect(messagesUk.hidden.collapsed(3)).toBe(
      'Згорнуто 3 перемикачі, у яких залишився один пункт',
    );
  });

  it('uses many-form noun for n>=5', () => {
    expect(messagesUk.hidden.collapsed(7)).toBe(
      'Згорнуто 7 перемикачів, у яких залишився один пункт',
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
    expect(messagesUk.pageStatus.hiding([])).toBe('Заблокований вміст приховано на цій сторінці');
  });
});

describe('messagesUk — priority + paused interpolation', () => {
  it('joins priority names with arrows', () => {
    expect(messagesUk.priority(['українська', 'англійська'])).toBe(
      'Пріоритет українська → англійська',
    );
  });

  it('formats the paused-until date', () => {
    expect(messagesUk.pausedUntilDate('17:00')).toBe('До 17:00');
  });
});

describe('messagesUk — report mailto builders', () => {
  it('subject: includes the host when present, drops it when null', () => {
    expect(messagesUk.report.subject('example.com')).toBe('Movar — проблема на example.com');
    expect(messagesUk.report.subject(null)).toBe('Movar — проблема');
  });

  it('bodyPrompt: page-specific vs page-less wording', () => {
    expect(messagesUk.report.bodyPrompt(true)).toContain('на цій сторінці');
    expect(messagesUk.report.bodyPrompt(false)).toContain('Опишіть проблему');
  });
});

describe('messagesUk — options action labels', () => {
  it('priority move/remove labels interpolate the language', () => {
    expect(messagesUk.options.priority.moveUp('українська')).toBe('Підняти українська вище');
    expect(messagesUk.options.priority.moveDown('англійська')).toBe('Опустити англійська нижче');
    expect(messagesUk.options.priority.remove('російська')).toBe('Видалити російська');
  });

  it('blocked unblock/locked labels interpolate the language', () => {
    expect(messagesUk.options.blocked.unblock('німецька')).toBe('Розблокувати німецька');
    expect(messagesUk.options.blocked.lockedHint('російська')).toBe('російська завжди заблокована');
  });

  it('allowlist remove interpolates the domain', () => {
    expect(messagesUk.options.allowlist.remove('example.com')).toBe('Видалити example.com');
  });
});

describe('messagesUk — conceal mode copy', () => {
  it('keeps the legend and options grammatically parallel', () => {
    expect(messagesUk.concealMode.legend).toBe('Як приховувати відфільтрований вміст');
    expect(messagesUk.concealMode.curtain).toEqual({
      label: 'Лишати за завісою',
      description: 'Завісу можна прибрати на місці',
    });
    expect(messagesUk.concealMode.hide).toEqual({
      label: 'Приховувати',
      description: 'Повернути можна на цьому екрані',
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
      header: 'Заголовок запиту',
      cookie: 'Кука',
      localStorage: 'Локальне сховище',
      redirect: 'Перенаправлення',
      dom: 'Вміст сторінки',
      search: 'Пошук',
    });
  });
});
