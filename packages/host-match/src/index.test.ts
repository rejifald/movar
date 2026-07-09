import { describe, expect, it } from 'vitest';
import { GOOGLE_REQUEST_DOMAINS, isGoogleHost, isYouTubeHost } from './index';

describe('isGoogleHost', () => {
  it.each([
    'google.com',
    'google.com.ua',
    'google.co.uk',
    'google.co.jp',
    'google.com.au',
    'google.com.br',
    'www.google.de',
    'news.google.co.jp',
    'google.es',
  ])('accepts %s', (host) => {
    expect(isGoogleHost(host)).toBe(true);
  });

  it.each([
    // Spoof hosts: registrable domain is the attacker's, not Google's. The
    // `google` label is followed by labels that are NOT a Google public suffix.
    'google.evil.com',
    'google.attacker.io',
    'google.example.net',
    'sub.google.evil.com',
    'a.google.b',
    // Pre-existing lookalikes.
    'notgoogle.com',
    'google.com.evil.com',
    'youtube.com',
    'example.com',
    'mygoogle.org',
    'google',
  ])('rejects %s', (host) => {
    expect(isGoogleHost(host)).toBe(false);
  });
});

describe('GOOGLE_REQUEST_DOMAINS', () => {
  it('every enumerated domain is accepted by isGoogleHost (list ⊆ predicate)', () => {
    const rejected = GOOGLE_REQUEST_DOMAINS.filter((domain) => !isGoogleHost(domain));
    expect(rejected).toEqual([]);
  });

  it('every domain is a registrable `google.<suffix>` shape (no bare labels, no subdomains)', () => {
    for (const domain of GOOGLE_REQUEST_DOMAINS) {
      expect(domain).toMatch(/^google\.[a-z.]+$/);
    }
  });

  it('covers the representative hosts via DNR subdomain semantics', () => {
    for (const host of ['google.com', 'www.google.com', 'google.com.ua', 'news.google.co.uk']) {
      expect(coveredByList(host)).toBe(true);
    }
    for (const host of ['notgoogle.com', 'google.evil.com', 'google.com.evil.com']) {
      expect(coveredByList(host)).toBe(false);
    }
  });
});

/** DNR `requestDomains` semantics: an entry matches the domain itself and any
 *  subdomain. Mirrored here so the list provably covers what the predicate
 *  accepts for the hosts the extension is actually exercised on. */
function coveredByList(host: string): boolean {
  return GOOGLE_REQUEST_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`));
}

describe('isYouTubeHost', () => {
  it.each(['youtube.com', 'www.youtube.com', 'm.youtube.com'])('accepts %s', (host) => {
    expect(isYouTubeHost(host)).toBe(true);
  });

  it.each(['example.com', 'google.com', 'fake-youtube.com'])('rejects %s', (host) => {
    expect(isYouTubeHost(host)).toBe(false);
  });
});
