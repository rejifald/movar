import { describe, expect, it } from 'vitest';
import { DOMAIN_PATTERN, normaliseDomain, normalizeAllowlist } from './index';

describe('normaliseDomain', () => {
  it('reduces a pasted URL / www / mixed case to the bare domain', () => {
    expect(normaliseDomain('  HTTPS://www.Example.com/path?q=1  ')).toBe('example.com');
    expect(normaliseDomain('http://example.com:8080')).toBe('example.com');
    expect(normaliseDomain('www.news.example.co.uk')).toBe('news.example.co.uk');
  });
});

describe('DOMAIN_PATTERN', () => {
  it('accepts dotted registrable domains, rejects bare labels and wildcards', () => {
    expect(DOMAIN_PATTERN.test('example.com')).toBe(true);
    expect(DOMAIN_PATTERN.test('sub.example.co.uk')).toBe(true);
    expect(DOMAIN_PATTERN.test('localhost')).toBe(false);
    expect(DOMAIN_PATTERN.test('*.example.com')).toBe(false);
    expect(DOMAIN_PATTERN.test('')).toBe(false);
  });
});

describe('normalizeAllowlist', () => {
  it('normalises every entry to the canonical stored form', () => {
    expect(normalizeAllowlist(['HTTPS://www.Example.com/', 'http://Foo.NET:443/x'])).toEqual([
      'example.com',
      'foo.net',
    ]);
  });

  it('drops entries that are not syntactically valid domains', () => {
    // bare label (no dot), a wildcard pattern, and an empty/whitespace entry.
    expect(normalizeAllowlist(['localhost', '*.example.com', '   ', 'ok.example.com'])).toEqual([
      'ok.example.com',
    ]);
  });

  it('de-dupes across forms that collapse to the same domain, first-seen order', () => {
    expect(
      normalizeAllowlist(['example.com', 'www.example.com', 'HTTPS://example.com/a', 'b.org']),
    ).toEqual(['example.com', 'b.org']);
  });

  it('is idempotent', () => {
    const once = normalizeAllowlist(['www.example.com', 'localhost', 'b.org']);
    expect(normalizeAllowlist(once)).toEqual(once);
  });

  it('returns an empty list for an all-invalid input', () => {
    expect(normalizeAllowlist(['localhost', '', 'no_dot'])).toEqual([]);
  });
});
