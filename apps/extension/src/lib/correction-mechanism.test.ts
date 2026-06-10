import { describe, expect, it } from 'vitest';
import type { SiteRule } from '@movar/host-match';
import { mechanismForStrategy } from './correction-mechanism';

const rule = (strategy: SiteRule['strategy']): SiteRule => ({ match: 'example.com', strategy });

describe('mechanismForStrategy', () => {
  it('maps the storage/search leaf strategies to their dashboard label', () => {
    expect(mechanismForStrategy(rule({ type: 'cookie', name: 'lang' }))).toBe('cookie');
    expect(mechanismForStrategy(rule({ type: 'localStorage', key: 'lang' }))).toBe('localStorage');
    expect(mechanismForStrategy(rule({ type: 'searchParams', params: [{ name: 'hl' }] }))).toBe(
      'search',
    );
  });

  it('falls back to "redirect" for navigation strategies that have no mapping', () => {
    expect(mechanismForStrategy(rule({ type: 'hreflang' }))).toBe('redirect');
    expect(mechanismForStrategy(rule({ type: 'pathSegment' }))).toBe('redirect');
    expect(mechanismForStrategy(rule({ type: 'subdomain' }))).toBe('redirect');
    expect(mechanismForStrategy(rule({ type: 'query', param: 'lang' }))).toBe('redirect');
    expect(mechanismForStrategy(rule({ type: 'click', selector: 'a' }))).toBe('redirect');
  });

  it('reports a compound strategy by its dominant (first) step', () => {
    expect(
      mechanismForStrategy(
        rule({ type: 'compound', steps: [{ type: 'cookie', name: 'l' }, { type: 'hreflang' }] }),
      ),
    ).toBe('cookie');
  });

  it('reports "redirect" when the compound head step has no mapping', () => {
    expect(
      mechanismForStrategy(
        rule({ type: 'compound', steps: [{ type: 'hreflang' }, { type: 'cookie', name: 'l' }] }),
      ),
    ).toBe('redirect');
  });

  it('reports "redirect" for an empty compound (no head step)', () => {
    expect(mechanismForStrategy(rule({ type: 'compound', steps: [] }))).toBe('redirect');
  });
});
