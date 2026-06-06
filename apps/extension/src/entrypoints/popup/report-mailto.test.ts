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

  it('includes url, environment, and Movar state in the body', () => {
    const body = bodyOf(buildReportMailto('s@e.com', t, ctx({ hiding: true, exempt: true })));
    expect(body).toContain('https://www.youtube.com/watch?v=abc');
    expect(body).toContain('Movar v1.0.1 · Chrome 120 · macOS · UI uk');
    expect(body).toContain('status on');
    expect(body).toContain('hiding on');
    expect(body).toContain('priority uk → en');
    expect(body).toContain('blocked ru');
    expect(body).toContain('this site exempt');
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

  it('on a non-web tab: generic subject, no url, no "this site" line', () => {
    const href = buildReportMailto('s@e.com', t, ctx({ pageUrl: null }));
    const body = bodyOf(href);
    expect(href).toContain(`subject=${encodeURIComponent(t.subject(null))}`);
    expect(body).toContain(t.bodyPrompt(false));
    expect(body).not.toContain('http');
    expect(body).not.toContain('this site');
    expect(body).toContain('Movar v1.0.1 · Chrome 120 · macOS · UI uk');
  });

  it('url-encodes characters that would otherwise break the query', () => {
    const href = buildReportMailto('s@e.com', t, ctx({ pageUrl: 'https://x.com/a b&c=d' }));
    expect(href).not.toContain('a b&c=d'); // raw form must not leak into the query
    expect(bodyOf(href)).toContain('https://x.com/a b&c=d'); // …but it round-trips on decode
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
