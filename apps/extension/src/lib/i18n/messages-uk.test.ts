import { describe, expect, it } from 'vitest';
import { messagesUk } from './messages-uk';

/**
 * Sanity-check that Ukrainian one/few/many plurals come out right at the
 * boundary values that catch the naive `n === 1 ? singular : plural` rule.
 * If these regress, every count-bearing string in the popup is wrong.
 */
describe('messagesUk plurals — correctionsTodayLabel', () => {
  // The popup renders the bare numeral separately, so the label only carries
  // the noun + qualifier. Plural form still depends on `n` to agree with it.
  const cases: [number, string][] = [
    [0, 'виправлень сьогодні'], // many
    [1, 'виправлення сьогодні'], // one
    [2, 'виправлення сьогодні'], // few
    [4, 'виправлення сьогодні'], // few
    [5, 'виправлень сьогодні'], // many
    [11, 'виправлень сьогодні'], // many — 11 is the trap for naive mod10
    [12, 'виправлень сьогодні'], // many
    [14, 'виправлень сьогодні'], // many — 12-14 are many, not few
    [21, 'виправлення сьогодні'], // one
    [22, 'виправлення сьогодні'], // few
    [25, 'виправлень сьогодні'], // many
    [101, 'виправлення сьогодні'], // one
    [111, 'виправлень сьогодні'], // many
  ];

  it.each(cases)('n=%i agrees with "%s"', (n, expected) => {
    expect(messagesUk.correctionsTodayLabel(n)).toBe(expected);
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
