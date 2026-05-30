import { describe, expect, it } from 'vitest';
import { hostMatchesAllowlist, hostMatchesDomain } from './host-match';

describe('hostMatchesDomain', () => {
  it('matches an exact host', () => {
    expect(hostMatchesDomain('example.com', 'example.com')).toBe(true);
  });

  it('matches a proper subdomain', () => {
    expect(hostMatchesDomain('www.example.com', 'example.com')).toBe(true);
    expect(hostMatchesDomain('a.b.example.com', 'example.com')).toBe(true);
  });

  it('rejects an unrelated host', () => {
    expect(hostMatchesDomain('example.org', 'example.com')).toBe(false);
  });

  it('rejects a same-suffix-different-prefix host (dot anchor)', () => {
    // The dot anchor is the load-bearing detail — without it `evilexample.com`
    // would slip past as a suffix of `example.com`.
    expect(hostMatchesDomain('evilexample.com', 'example.com')).toBe(false);
  });

  it("rejects an embedded-as-infix host (the audit's flagged shape)", () => {
    // The shape the production audit flagged: a host that contains the
    // allowlisted domain as text but isn't actually a subdomain of it.
    expect(hostMatchesDomain('example.com.evil.com', 'example.com')).toBe(false);
  });

  it('normalises case', () => {
    expect(hostMatchesDomain('Example.COM', 'example.com')).toBe(true);
    expect(hostMatchesDomain('example.com', 'EXAMPLE.com')).toBe(true);
  });

  it('strips trailing FQDN dot before comparing', () => {
    // Some browsers preserve the trailing dot on user-typed URLs; the
    // bare entry the user added must still match.
    expect(hostMatchesDomain('example.com.', 'example.com')).toBe(true);
    expect(hostMatchesDomain('www.example.com.', 'example.com')).toBe(true);
  });
});

describe('hostMatchesAllowlist', () => {
  it('returns false for an empty allowlist', () => {
    expect(hostMatchesAllowlist('example.com', [])).toBe(false);
  });

  it('matches when any entry matches', () => {
    expect(hostMatchesAllowlist('news.example.com', ['unrelated.com', 'example.com'])).toBe(true);
  });

  it('returns false when no entry matches', () => {
    expect(hostMatchesAllowlist('example.com', ['unrelated.com', 'other.org'])).toBe(false);
  });
});
