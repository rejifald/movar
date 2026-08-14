import { describe, expect, it } from 'vitest';
import { locatorOf, parseLocator, resolveTargetPage, resolvesToCollectedPage } from './locator';
import type { PageEvidence } from './evidence';
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
});

describe('resolveTargetPage', () => {
  it('matches an absolutely-declared target against a relatively-collected page', () => {
    const from = pageAt('/ru/', 'ru');
    const target = pageAt('/uk/', 'uk');
    expect(resolveTargetPage([from, target], from, 'https://example.com/uk/index.html')).toBe(
      target,
    );
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
});
