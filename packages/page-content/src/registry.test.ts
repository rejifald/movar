import { beforeEach, describe, expect, it } from 'vitest';
import { buildModelForHost, lookupExtractor, registerExtractor } from './registry';
import type { PageContentModel, PageExtractor } from './types';
// Importing the extractor modules self-registers them (side effect) so the
// host-lookup tests below see the real production roster.
import './youtube';
import './google';

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('lookupExtractor', () => {
  it('resolves a host to its registered extractor', () => {
    expect(lookupExtractor('www.youtube.com')?.id).toBe('youtube');
    expect(lookupExtractor('google.de')?.id).toBe('google');
  });

  it('returns null for a host no extractor matches', () => {
    expect(lookupExtractor('example.com')).toBeNull();
  });

  it('returns the first registered extractor when several match the same host', () => {
    const host = 'first-match.test';
    const first: PageExtractor = {
      id: 'first',
      matches: (h) => h === host,
      extract: (): PageContentModel => ({ extractor: 'first', nodes: [] }),
    };
    const second: PageExtractor = {
      id: 'second',
      matches: (h) => h === host,
      extract: (): PageContentModel => ({ extractor: 'second', nodes: [] }),
    };
    registerExtractor(first);
    registerExtractor(second);
    expect(lookupExtractor(host)?.id).toBe('first');
  });
});

describe('buildModelForHost', () => {
  it('runs the matched extractor against the given root', () => {
    document.body.innerHTML = `<ytd-video-renderer><a id="video-title">Тест</a></ytd-video-renderer>`;
    const model = buildModelForHost('youtube.com', document);
    expect(model?.extractor).toBe('youtube');
    expect(model?.nodes.length).toBeGreaterThanOrEqual(1);
  });

  it('returns null when no extractor is registered for the host', () => {
    expect(buildModelForHost('unknown.example', document)).toBeNull();
  });
});
