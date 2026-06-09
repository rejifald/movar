import { describe, expect, it } from 'vitest';
import { GOOGLE_EXTRACTOR } from '@movar/page-content/google';
import { YOUTUBE_EXTRACTOR } from '@movar/page-content/youtube';
import * as google from './google';
import * as youtube from './youtube';

describe('dynamic page-content model entrypoints', () => {
  it('delegates the Google capability to the Google extractor', () => {
    document.body.innerHTML = '<div class="g"><a href="/search?q=ua">Україна</a></div>';

    expect(google.id).toBe('google');
    expect(google.matches('www.google.com.ua')).toBe(GOOGLE_EXTRACTOR.matches('www.google.com.ua'));
    expect(google.matches('example.com')).toBe(GOOGLE_EXTRACTOR.matches('example.com'));
    expect(google.extract()).toEqual(GOOGLE_EXTRACTOR.extract(document));
  });

  it('delegates the YouTube capability to the YouTube extractor', () => {
    document.body.innerHTML =
      '<ytd-video-renderer><a id="video-title">Українське відео</a></ytd-video-renderer>';

    expect(youtube.id).toBe('youtube');
    expect(youtube.matches('www.youtube.com')).toBe(YOUTUBE_EXTRACTOR.matches('www.youtube.com'));
    expect(youtube.matches('example.com')).toBe(YOUTUBE_EXTRACTOR.matches('example.com'));
    expect(youtube.extract()).toEqual(YOUTUBE_EXTRACTOR.extract(document));
  });
});
