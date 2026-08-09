import { describe, expect, it } from 'vitest';
import {
  GOOGLE_REQUEST_DOMAINS,
  isGoogleHost,
  isGoogleSerpHost,
  isYouTubeContentHost,
  isYouTubeHost,
} from './index';

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

  // FQDN form (trailing dot) is valid and some browsers preserve it on
  // `location.hostname` for user-typed URLs — see issue #295.
  it.each(['google.com.', 'www.google.com.', 'google.com.ua.', 'google.co.uk.'])(
    'accepts trailing-dot FQDN %s',
    (host) => {
      expect(isGoogleHost(host)).toBe(true);
    },
  );

  it('still rejects a trailing-dot lookalike', () => {
    expect(isGoogleHost('notgoogle.com.')).toBe(false);
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

  // FQDN form (trailing dot) is valid and some browsers preserve it on
  // `location.hostname` for user-typed URLs — see issue #295.
  it.each(['youtube.com.', 'www.youtube.com.'])('accepts trailing-dot FQDN %s', (host) => {
    expect(isYouTubeHost(host)).toBe(true);
  });

  it('still rejects a trailing-dot lookalike', () => {
    expect(isYouTubeHost('fake-youtube.com.')).toBe(false);
  });
});

describe('isYouTubeContentHost', () => {
  it.each(['youtube.com', 'www.youtube.com', 'm.youtube.com'])('accepts %s', (host) => {
    expect(isYouTubeContentHost(host)).toBe(true);
  });

  // Sibling frontends the page-content model cannot parse (Music is 100%
  // ytmusic-* components — live-verified, zero nodes extracted): excluded on
  // purpose so no model chunk is provisioned there — see issue #372. The broad
  // isYouTubeHost keeps matching them for the redirect layer.
  it.each(['music.youtube.com', 'studio.youtube.com', 'kids.youtube.com', 'tv.youtube.com'])(
    'rejects unparseable sibling frontend %s (still a broad isYouTubeHost match)',
    (host) => {
      expect(isYouTubeContentHost(host)).toBe(false);
      expect(isYouTubeHost(host)).toBe(true);
    },
  );

  it.each(['example.com', 'fake-youtube.com', 'youtube.com.evil.com'])('rejects %s', (host) => {
    expect(isYouTubeContentHost(host)).toBe(false);
  });

  it.each(['youtube.com.', 'm.youtube.com.'])('accepts trailing-dot FQDN %s', (host) => {
    expect(isYouTubeContentHost(host)).toBe(true);
  });
});

describe('isGoogleSerpHost', () => {
  it.each([
    'google.com',
    'www.google.com',
    'google.com.ua',
    'www.google.com.ua',
    'google.de',
    'www.google.co.uk',
  ])('accepts %s', (host) => {
    expect(isGoogleSerpHost(host)).toBe(true);
  });

  // Non-SERP Google products: real Google hosts (broad isGoogleHost matches,
  // keeping the redirect layer engaged) with no #rso for the model to read —
  // excluded from model provisioning on purpose, see issue #372.
  it.each(['news.google.com', 'scholar.google.com', 'translate.google.com'])(
    'rejects non-SERP product %s (still a broad isGoogleHost match)',
    (host) => {
      expect(isGoogleSerpHost(host)).toBe(false);
      expect(isGoogleHost(host)).toBe(true);
    },
  );

  it.each([
    // Fake-suffix spoofs: `google.` followed by labels outside the curated set.
    'google.evil.com',
    'www.google.evil.com',
    'a.google.b',
    'google.com.evil.com',
    // Lookalikes / non-Google.
    'notgoogle.com',
    'example.com',
    'google',
  ])('rejects %s', (host) => {
    expect(isGoogleSerpHost(host)).toBe(false);
  });

  it.each(['google.com.', 'www.google.com.ua.'])('accepts trailing-dot FQDN %s', (host) => {
    expect(isGoogleSerpHost(host)).toBe(true);
  });
});
