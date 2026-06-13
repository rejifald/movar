import { describe, expect, it } from 'vitest';
import { messagesEn } from '../../lib/i18n/messages-en';
import { browserInfo, buildReportMailto, osInfo } from './report-mailto';
import type { ReportContext } from './report-mailto';

const t = messagesEn.report;

function ctx(overrides: Partial<ReportContext> = {}): ReportContext {
  return {
    pageUrl: 'https://www.youtube.com/watch?v=abc',
    version: '1.0.1',
    browser: 'Chrome 120',
    os: 'macOS',
    locale: 'uk',
    enabled: true,
    paused: false,
    hiding: false,
    priority: ['uk', 'en'],
    blocked: ['ru'],
    exempt: false,
    ...overrides,
  };
}

/** Decode just the `body` query param back to plain text. */
function bodyOf(href: string): string {
  return decodeURIComponent(href.split('&body=')[1] ?? '');
}

describe('buildReportMailto', () => {
  it('addresses the support inbox', () => {
    expect(
      buildReportMailto('support@movar.fyi', t, ctx()).startsWith('mailto:support@movar.fyi?'),
    ).toBe(true);
  });

  it('puts only the hostname in the subject', () => {
    const href = buildReportMailto(
      's@e.com',
      t,
      ctx({ pageUrl: 'https://news.example.co.uk/a/b?q=1#x' }),
    );
    expect(href).toContain(`subject=${encodeURIComponent(t.subject('news.example.co.uk'))}`);
  });

  it('includes the hostname (not the full URL), environment, and Movar state', () => {
    const body = bodyOf(buildReportMailto('s@e.com', t, ctx({ hiding: true, exempt: true })));
    // Hostname only — the path + query (which can carry tokens/PII) is trimmed.
    expect(body).toContain('www.youtube.com');
    expect(body).not.toContain('watch?v=abc');
    expect(body).toContain('Movar v1.0.1 · Chrome 120 · macOS · UI uk');
    expect(body).toContain('status on');
    expect(body).toContain('hiding on');
    expect(body).toContain('priority uk → en');
    expect(body).toContain('blocked ru');
    expect(body).toContain('this site exempt');
  });

  it('never leaks a query string into the body (privacy: trims to hostname)', () => {
    const href = buildReportMailto(
      's@e.com',
      t,
      ctx({ pageUrl: 'https://shop.example.com/checkout?token=SECRET&email=a@b.com#step2' }),
    );
    const body = bodyOf(href);
    expect(body).toContain('shop.example.com');
    expect(body).not.toContain('token=SECRET');
    expect(body).not.toContain('a@b.com');
    expect(body).not.toContain('/checkout');
    // Not even url-encoded in the raw href.
    expect(href).not.toContain('token');
  });

  it('reflects paused / off status and "not exempt"', () => {
    expect(bodyOf(buildReportMailto('s@e.com', t, ctx({ paused: true })))).toContain(
      'status paused',
    );
    expect(bodyOf(buildReportMailto('s@e.com', t, ctx({ enabled: false })))).toContain(
      'status off',
    );
    expect(bodyOf(buildReportMailto('s@e.com', t, ctx()))).toContain('this site not exempt');
  });

  it('uses a supplied bodyPrompt override (contextual blocked-site report)', () => {
    const body = bodyOf(
      buildReportMailto('s@e.com', t, ctx(), { bodyPrompt: t.blockedSite.prompt }),
    );
    expect(body).toContain(t.blockedSite.prompt);
    // The generic page prompt is replaced, not appended.
    expect(body).not.toContain(t.bodyPrompt(true));
    // …but the diagnostic footer is unchanged.
    expect(body).toContain('Movar v1.0.1 · Chrome 120 · macOS · UI uk');
    expect(body).toContain('www.youtube.com');
  });

  it('on a non-web tab: generic subject, no url, no "this site" line', () => {
    const href = buildReportMailto('s@e.com', t, ctx({ pageUrl: null }));
    const body = bodyOf(href);
    expect(href).toContain(`subject=${encodeURIComponent(t.subject(null))}`);
    expect(body).toContain(t.bodyPrompt(false));
    expect(body).not.toContain('http');
    expect(body).not.toContain('this site');
    expect(body).toContain('Movar v1.0.1 · Chrome 120 · macOS · UI uk');
  });

  it('url-encodes the body so separators do not break the query', () => {
    // The footer's `·` separators are non-ASCII and must be percent-encoded in
    // the raw href, but round-trip cleanly on decode.
    const href = buildReportMailto('s@e.com', t, ctx({ pageUrl: 'https://x.com/a b&c=d' }));
    expect(href).not.toContain(' · '); // raw separators must not leak into the query
    expect(bodyOf(href)).toContain('Movar v1.0.1 · Chrome 120 · macOS · UI uk');
    // And the page line is the bare hostname — path/query gone.
    expect(bodyOf(href)).toContain('x.com');
    expect(bodyOf(href)).not.toContain('a b&c=d');
  });
});

describe('browserInfo', () => {
  it('identifies major browsers with their major version', () => {
    expect(
      browserInfo(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      ),
    ).toBe('Chrome 120');
    expect(
      browserInfo('Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0'),
    ).toBe('Firefox 121');
    expect(
      browserInfo(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
      ),
    ).toBe('Safari 17');
    expect(
      browserInfo(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
      ),
    ).toBe('Edge 120');
  });

  it('falls back when nothing matches', () => {
    expect(browserInfo('some random string')).toBe('Unknown browser');
  });
});

describe('osInfo', () => {
  it('identifies the OS family (Android/iOS before the substrings they contain)', () => {
    expect(osInfo('Mozilla/5.0 (Windows NT 10.0; Win64; x64) …')).toBe('Windows');
    expect(osInfo('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) …')).toBe('macOS');
    expect(osInfo('Mozilla/5.0 (Linux; Android 13; Pixel 7) …')).toBe('Android');
    expect(osInfo('Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) …')).toBe('iOS');
    expect(osInfo('Mozilla/5.0 (X11; Linux x86_64) …')).toBe('Linux');
  });

  it('falls back when nothing matches', () => {
    expect(osInfo('weird ua')).toBe('Unknown OS');
  });
});
