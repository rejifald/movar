import { describe, expect, it } from 'vitest';
import { hostOf, prettyTarget } from './target';

describe('prettyTarget', () => {
  it('drops the scheme and one trailing slash', () => {
    // `normalizeAuditUrl` produces the machine's form; this puts it back the way
    // a person would have typed it.
    expect(prettyTarget('https://example.com/')).toBe('example.com');
    expect(prettyTarget('http://example.com/')).toBe('example.com');
    expect(prettyTarget('https://shop.example.ua/uk/')).toBe('shop.example.ua/uk');
  });

  it('keeps everything that carries meaning', () => {
    // `www.` is a different host from the apex and can serve a different
    // language, which is the whole subject of this tool — never strip it. A
    // query or a port is likewise part of what was audited.
    expect(prettyTarget('https://www.example.com/')).toBe('www.example.com');
    expect(prettyTarget('https://example.com/s?lang=uk')).toBe('example.com/s?lang=uk');
    expect(prettyTarget('https://example.com:8443/uk')).toBe('example.com:8443/uk');
  });

  it('leaves something it cannot parse exactly as it is', () => {
    // Better an odd-looking row than a mangled one: the string still has to
    // identify which audit it belongs to.
    expect(prettyTarget('not a url')).toBe('not a url');
    expect(prettyTarget('')).toBe('');
  });
});

describe('hostOf', () => {
  it('reduces a target to its host', () => {
    expect(hostOf('https://shop.example.ua/uk/?a=1')).toBe('shop.example.ua');
    expect(hostOf('https://example.com:8443/')).toBe('example.com:8443');
  });

  it('falls back to the raw string rather than inventing a host', () => {
    expect(hostOf('not a url')).toBe('not a url');
  });
});
