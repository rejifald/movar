import { describe, expect, it } from 'vitest';
import { contentStringsEn } from '../../../apps/extension/src/lib/i18n/content-strings-en';
import { contentStringsUk } from '../../../apps/extension/src/lib/i18n/content-strings-uk';
import { CURTAIN, listingPlan, SHOTS, smokePlan } from '../src/capture/shots';

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

describe('shot plans', () => {
  it('the listing plan carries each shot with its locale assertions', () => {
    const plan = listingPlan('en');
    expect(plan.map((shot) => shot.id)).toEqual(SHOTS.map((shot) => shot.id));
    expect(plan[0]?.env).toEqual({ V: CURTAIN.en, A: SHOTS[0]?.expect.en.absent });
  });
  it('the smoke plan is one assertion-free shot of the given url', () => {
    expect(smokePlan('http://localhost:1/')).toEqual([
      { id: 'smoke', url: 'http://localhost:1/', flow: 'shot-smoke', env: {} },
    ]);
  });
});
