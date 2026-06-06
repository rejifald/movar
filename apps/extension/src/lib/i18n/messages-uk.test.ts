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
    [1, 'Приховано 1 картку у стрічці'], // one
    [2, 'Приховано 2 картки у стрічці'], // few
    [4, 'Приховано 4 картки у стрічці'], // few
    [5, 'Приховано 5 карток у стрічці'], // many
    [11, 'Приховано 11 карток у стрічці'], // many — 11 is the trap for naive mod10
    [12, 'Приховано 12 карток у стрічці'], // many
    [14, 'Приховано 14 карток у стрічці'], // many — 12-14 are many, not few
    [21, 'Приховано 21 картку у стрічці'], // one
    [22, 'Приховано 22 картки у стрічці'], // few
    [25, 'Приховано 25 карток у стрічці'], // many
    [111, 'Приховано 111 карток у стрічці'], // many
  ];

  it.each(cases)('n=%i agrees with "%s"', (n, expected) => {
    expect(messagesUk.hidden.feedHidden(n)).toBe(expected);
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
