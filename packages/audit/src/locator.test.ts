import { describe, expect, it } from 'vitest';
import {
  declaredLocator,
  locatorOf,
  parseLocator,
  resolveTargetPage,
  resolvesToCollectedPage,
} from './locator';
import type { AlternateLink, PageEvidence } from './evidence';
import { makeBuildPage, makeDocument, makePage } from '../test/fixtures';

/**
 * These are the shapes that made `ua/state-language-version-lesser` under-report
 * before resolution was centralised: three families each resolved declared
 * targets, and one compared the raw strings. A site is not wrong for writing an
 * hreflang absolutely and being collected relatively.
 */
const EQUIVALENT = [
  ['https://example.com/uk/', 'https://example.com/uk'],
  ['https://example.com/uk/', 'https://example.com/uk/index.html'],
  ['/uk/', '/uk'],
  ['/uk/index.html', '/uk'],
] as const;

function pageAt(locator: string, id = 'p1'): PageEvidence {
  return locator.startsWith('http')
    ? makePage({ id, url: locator, document: makeDocument({}) })
    : makeBuildPage({ id, path: locator, document: makeDocument({}) });
}

function link(hreflang: string, href: string): AlternateLink {
  return { hreflang, href, source: 'link' };
}

/**
 * A build page with a declared language and an alternates block. Reciprocal
 * hreflang means every page in a translation set carries the **same** block, so
 * the tests below hand the identical array to both pages — the shape that made
 * a foreign host claim itself when the claim was read by path alone.
 */
function buildPage(
  path: string,
  htmlLang: string,
  alternates: readonly AlternateLink[],
  id = 'p1',
): PageEvidence {
  return makeBuildPage({ id, path, document: makeDocument({ htmlLang, alternates }) });
}

describe('parseLocator', () => {
  it.each(EQUIVALENT)('treats %s and %s as the same place', (one, other) => {
    expect(parseLocator(one)).toEqual(parseLocator(other));
  });

  it('declares no target for a bare fragment or an empty href', () => {
    expect(parseLocator('#uk')).toBeNull();
    expect(parseLocator('   ')).toBeNull();
  });

  it('resolves a relative href against the page it was declared on', () => {
    expect(parseLocator('../uk/', 'https://example.com/ru/page')).toEqual(
      parseLocator('https://example.com/uk'),
    );
  });

  it('keeps a host-less locator host-less, so a build path matches any origin', () => {
    expect(parseLocator('/uk/')?.host).toBeNull();
    expect(parseLocator('https://example.com/uk/')?.host).toBe('example.com');
  });
});

describe('locatorOf', () => {
  it('reads a network page from its url and a filesystem page from its path', () => {
    expect(locatorOf(pageAt('https://example.com/uk/'))?.path).toBe('/uk');
    expect(locatorOf(pageAt('/uk/index.html'))?.path).toBe('/uk');
  });

  it('reads a build path recorded without a leading slash', () => {
    expect(locatorOf(pageAt('uk/index.html'))?.path).toBe('/uk');
  });

  it('spells a non-ASCII build path the way a declared href spells it', () => {
    // Both sides go through one `URL` parse, so the page's own path and every
    // href compared against it are percent-encoded identically. Read raw, the
    // page said `/пошук` while every href said `/%D0%BF…` and no alternate
    // naming it could resolve.
    expect(locatorOf(pageAt('/пошук/index.html'))?.path).toBe(
      parseLocator('https://example.com/пошук/')?.path,
    );
  });
});

/**
 * The base half of the same rule: a declared href is read relative to the page
 * that declared it, on disk exactly as over the network. Threading `page.url`
 * handed a build page `undefined` and dropped it back to the site-root reading
 * — the defect #430 fixed for network evidence and left here.
 */
describe('declaredLocator', () => {
  it('resolves a relative href against the build path it was declared on', () => {
    expect(declaredLocator(pageAt('/docs/en/guide.html'), '../uk/guide.html')).toEqual({
      host: null,
      path: '/docs/uk/guide.html',
    });
  });

  it('resolves against a build path recorded without a leading slash', () => {
    expect(declaredLocator(pageAt('docs/en/guide.html'), '../uk/guide.html')?.path).toBe(
      '/docs/uk/guide.html',
    );
  });

  it('reads a bare "./" as the declaring page itself, off disk as over the network', () => {
    const build = pageAt('/uk/index.html');
    expect(declaredLocator(build, './')).toEqual(locatorOf(build));
  });

  it('invents no host for a page that has none — the lifted base carries no authority', () => {
    // Catches a scheme that grew an authority, but only at this seam, and it
    // is no regression test: before the base existed there was nothing to
    // resolve against and these read `null` for the opposite reason. What a
    // host-less scheme *buys* is pinned in `resolveTargetPage` below, on an
    // absolute href reaching a build page.
    expect(declaredLocator(pageAt('/docs/en/guide.html'), '../uk/guide.html')?.host).toBeNull();
    expect(declaredLocator(pageAt('/docs/en/guide.html'), '/uk/')?.host).toBeNull();
  });

  it('keeps the host an absolute href names', () => {
    expect(declaredLocator(pageAt('/docs/en/guide.html'), 'https://other-brand.de/uk/')).toEqual({
      host: 'other-brand.de',
      path: '/uk',
    });
  });

  it('still resolves a network page against the URL it was collected from', () => {
    expect(declaredLocator(pageAt('https://example.com/ru/page'), '../uk/')).toEqual(
      parseLocator('https://example.com/uk'),
    );
  });

  it('declares no target for an empty href or a bare fragment', () => {
    expect(declaredLocator(pageAt('/docs/en/guide.html'), '#uk')).toBeNull();
    expect(declaredLocator(pageAt('/docs/en/guide.html'), '')).toBeNull();
  });
});

describe('resolveTargetPage', () => {
  it('matches an absolutely-declared target against a relatively-collected page', () => {
    const from = pageAt('/ru/', 'ru');
    const target = pageAt('/uk/', 'uk');
    expect(resolveTargetPage([from, target], from, 'https://example.com/uk/index.html')).toBe(
      target,
    );
  });

  it('resolves an absolute href on a build that claims no origin — unknown is not foreign', () => {
    // Neither page points at itself, so neither says where it is deployed.
    // `core/hreflang-self-missing` grades that `warn`; it must not detonate
    // into unresolvable targets that are plainly sitting in the build.
    const en = buildPage('/en/index.html', 'en', [link('uk', 'https://example.com/uk/')], 'en');
    const uk = buildPage('/uk/index.html', 'uk', [link('en', 'https://example.com/en/')], 'uk');
    expect(resolveTargetPage([en, uk], en, 'https://example.com/uk/')).toBe(uk);
  });

  it('does not let a shared alternates block make a foreign host claim itself', () => {
    // The reciprocal block both pages carry. The `/uk` page's own path is
    // `/uk`, and the alternate naming other-brand.de sits at `/uk` too — so a
    // claim read by path alone lets that host unlock itself.
    const shared = [
      link('en', 'https://our-brand.com/en/'),
      link('uk', 'https://other-brand.de/uk/'),
    ];
    const en = buildPage('/en/index.html', 'en', shared, 'en');
    const uk = buildPage('/uk/index.html', 'ru', shared, 'uk');
    expect(resolveTargetPage([en, uk], en, 'https://other-brand.de/uk/')).toBeNull();
  });

  it('reads the self-reference by language, so a same-path alternate cannot fake one', () => {
    // A cross-domain locale site: both locales are served from `/`, on
    // different hosts, so path equality cannot tell the two apart at all.
    const shared = [link('en', 'https://our-brand.com/'), link('uk', 'https://other-brand.de/')];
    const en = buildPage('/index.html', 'en', shared, 'en');
    expect(resolveTargetPage([en], en, 'https://other-brand.de/')).toBeNull();
    expect(resolveTargetPage([en], en, 'https://our-brand.com/')).toBe(en);
  });

  it('never answers for a host that only some other page named as its target', () => {
    const uk = buildPage('/uk/index.html', 'uk', [link('uk', 'https://other-brand.de/uk/')], 'uk');
    const docs = buildPage('/docs/index.html', 'en', [], 'docs');
    const en = buildPage('/en/index.html', 'en', [link('en', 'https://our-brand.com/en/')], 'en');
    expect(resolveTargetPage([uk, docs, en], en, 'https://other-brand.de/docs/')).toBeNull();
  });

  it('takes a collected URL as the declaring page’s own origin', () => {
    const from = pageAt('https://example.com/ru/', 'ru');
    const target = makeBuildPage({ id: 'uk', path: '/uk/' }); // declares nothing at all
    expect(resolveTargetPage([from, target], from, 'https://example.com/uk/')).toBe(target);
    expect(resolveTargetPage([from, target], from, 'https://other-brand.de/uk/')).toBeNull();
  });

  it('resolves every spelling of the same place on a build that claims its origin', () => {
    const from = buildPage('/ru/', 'ru', [link('ru', 'https://example.com/ru/')], 'ru');
    const target = buildPage('/uk/index.html', 'uk', [link('uk', 'https://example.com/uk/')], 'uk');
    for (const href of [
      'https://example.com/uk/',
      'https://example.com/uk',
      'https://example.com/uk/index.html',
    ]) {
      expect(resolveTargetPage([from, target], from, href)).toBe(target);
    }
  });

  it('claims nothing from a page that declares no language of its own', () => {
    // With no `<html lang>` there is nothing for a self-reference to agree
    // with, so the page cannot say which of its alternates points at itself.
    const from = buildPage('/ru/', '', [link('ru', 'https://example.com/ru/')], 'ru');
    const target = pageAt('/uk/', 'uk');
    expect(resolveTargetPage([from, target], from, 'https://other-brand.de/uk/')).toBe(target);
  });

  it('reads a page’s claim past an alternate that declares no target', () => {
    const from = buildPage(
      '/ru/',
      'ru',
      [link('ru', ''), link('ru', 'https://example.com/ru/')],
      'ru',
    );
    const target = pageAt('/uk/', 'uk');
    expect(resolveTargetPage([from, target], from, 'https://example.com/uk/')).toBe(target);
    expect(resolveTargetPage([from, target], from, 'https://other-brand.de/uk/')).toBeNull();
  });

  it('matches a site-relative href even when the declaring page claims an origin', () => {
    const from = buildPage('/ru/', 'ru', [link('ru', 'https://example.com/ru/')], 'ru');
    const target = pageAt('/uk/', 'uk');
    expect(resolveTargetPage([from, target], from, '/uk/index.html')).toBe(target);
  });

  it('does not match a different path on the same host', () => {
    const from = pageAt('https://example.com/ru/', 'ru');
    const target = pageAt('https://example.com/uk/', 'uk');
    expect(resolveTargetPage([from, target], from, 'https://example.com/de/')).toBeNull();
  });

  it('does not match the same path on a different host', () => {
    const from = pageAt('https://example.com/ru/', 'ru');
    const target = pageAt('https://example.com/uk/', 'uk');
    expect(resolveTargetPage([from, target], from, 'https://other.example/uk/')).toBeNull();
  });

  it('returns null rather than fetching when the target was never collected', () => {
    const from = pageAt('https://example.com/ru/', 'ru');
    expect(resolvesToCollectedPage([from], from, 'https://example.com/uk/')).toBe(false);
  });

  it('resolves a relative target against the declaring build page, not the site root', () => {
    const en = pageAt('/docs/en/guide.html', 'en');
    const uk = pageAt('/docs/uk/guide.html', 'uk');
    expect(resolveTargetPage([en, uk], en, '../uk/guide.html')).toBe(uk);
  });

  it('does not let a relative target reach the same file name at the site root', () => {
    // The root-relative reading turned `../uk/guide.html` into the literal
    // `/../uk/guide.html`, which matched nothing — but a href that *does* fold
    // to the root must not reach a page the browser would never land on.
    const en = pageAt('/docs/en/guide.html', 'en');
    const stray = pageAt('/uk/guide.html', 'stray');
    expect(resolveTargetPage([en, stray], en, '../uk/guide.html')).toBeNull();
  });

  it('resolves a build’s targets, absolute as well as relative, when it claims an origin', () => {
    // The guard on the lift's scheme staying host-less — and the absolute half
    // is the half that guards it. `locatorOf` reads a page's own location
    // through the same lift, so a scheme carrying an authority stamps a
    // synthetic host on every page in the build, and `sameLocation` weighs it
    // against the real host this href names and agrees with neither. That is
    // the dogfood gate's own shape: `apps/marketing` emits every hreflang
    // absolutely, onto pages that are build paths. The relative half cannot
    // stand in for it — `answersFor` short-circuits on a page that carries a
    // host, so a relative target resolves under either scheme.
    const en = buildPage(
      '/docs/en/guide.html',
      'en',
      [link('en', 'https://example.com/docs/en/guide.html'), link('uk', '../uk/guide.html')],
      'en',
    );
    const uk = pageAt('/docs/uk/guide.html', 'uk');
    expect(resolveTargetPage([en, uk], en, '../uk/guide.html')).toBe(uk);
    expect(resolveTargetPage([en, uk], en, 'https://example.com/docs/uk/guide.html')).toBe(uk);
  });

  it('matches a non-ASCII build path however the declared href spells it', () => {
    const en = pageAt('/en/index.html', 'en');
    const search = pageAt('/пошук/index.html', 'search');
    const encoded = 'https://example.com/%D0%BF%D0%BE%D1%88%D1%83%D0%BA/';
    expect(resolveTargetPage([en, search], en, '/пошук/')).toBe(search);
    expect(resolveTargetPage([en, search], en, encoded)).toBe(search);
  });
});
