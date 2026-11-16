import { describe, expect, it } from 'vitest';
import { contentStringsEn } from '../../../apps/extension/src/lib/i18n/content-strings-en';
import { contentStringsUk } from '../../../apps/extension/src/lib/i18n/content-strings-uk';
import { resolveRoute, SCENES } from '../src/mock/routes';
import { beforePlan, CURTAIN, listingPlan, SHOTS, smokePlan } from '../src/capture/shots';

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

const html = (url: string): string => {
  const u = new URL(url);
  return resolveRoute(u.hostname, `${u.pathname}${u.search}`)?.body ?? '';
};

describe('shot plans', () => {
  it('the listing plan carries each shot with its locale assertions', () => {
    const plan = listingPlan('en');
    expect(plan.map((shot) => shot.id)).toEqual(SHOTS.map((shot) => shot.id));
    expect(plan[0]?.env).toEqual({ V: CURTAIN.en, A: SHOTS[0]?.expect.en.absent });
  });
  it('every after shot has exactly one before, in the same run', () => {
    const after = listingPlan('uk');
    const before = beforePlan('uk');
    expect(before.map((shot) => shot.id)).toEqual(after.map((shot) => `${shot.id}-before`));
    // Same flow, except where the after taps Movar's own UI (YouTube's "Hide all").
    expect(before.map((shot) => shot.flow)).toEqual(
      after.map((shot) => (shot.flow === 'shot-youtube-hide-all' ? 'shot-youtube' : shot.flow)),
    );
    expect(after.at(-1)?.flow).toBe('shot-youtube-hide-all');
    expect(new Set([...before, ...after].map((shot) => shot.id)).size).toBe(after.length * 2);
  });
  it('the before pass opens the Movar-off states with page-content assertions', () => {
    const before = beforePlan('en');
    expect(before.map((shot) => shot.url)).toEqual([
      SCENES.google.startUrl,
      SCENES.tochka24.startUrl,
      SCENES.tochka24.finalUrl,
      SCENES.youtube.startUrl,
    ]);
    expect(before[0]?.env).toEqual({ V: '.*Борщ классический.*', A: CURTAIN.en });
    expect(before[1]?.env['V']).toBe('.*(Выберите язык|Русский).*');
    expect(before[2]?.env['V']).toBe('.*Русский.*');
    expect(before[3]?.env).toEqual({ V: '.*Как приготовить идеальный борщ.*', A: CURTAIN.en });
    expect(beforePlan('uk')[0]?.env['A']).toBe(CURTAIN.uk);
  });
  it("the site-no-modal gate check flags the gate, not Movar's note about what it hid", () => {
    const absent = listingPlan('uk').find((shot) => shot.id === 'site-no-modal')?.env['A'] ?? '';
    const matches = (text: string): boolean => new RegExp(`^(?:${absent})$`, 'u').test(text);
    expect(matches('Оберіть мову / Выберите язык')).toBe(true);
    expect(matches('Русский')).toBe(true);
    expect(matches('Мовар приховав: Русский.')).toBe(false);
  });

  it('the Russian assertions are on the pages the mock serves for those urls', () => {
    const [search, gate, menu, youtube] = beforePlan('uk');
    expect(html(search?.url ?? '')).toContain('Борщ классический');
    expect(html(gate?.url ?? '')).toContain('Выберите язык');
    expect(html(menu?.url ?? '')).toContain('Русский');
    expect(html(youtube?.url ?? '')).toContain('Как приготовить идеальный борщ');
  });
  it('the youtube feed leads with the Russian tile, a Ukrainian one right after it', () => {
    const body = html(SCENES.youtube.startUrl);
    const ru = body.indexOf('Как приготовить идеальный борщ');
    const uk = body.indexOf('Карпатські полонини');
    expect(ru).toBeGreaterThan(-1);
    expect(uk).toBeGreaterThan(ru);
    // Only the Ukrainian tile's own title opens between the two: no tile in between.
    expect(body.slice(ru, uk).match(/<h3>/g)).toHaveLength(1);
  });
  it('the smoke plan is one assertion-free shot of the given url', () => {
    expect(smokePlan('http://localhost:1/')).toEqual([
      { id: 'smoke', url: 'http://localhost:1/', flow: 'shot-smoke', env: {} },
    ]);
  });
});
