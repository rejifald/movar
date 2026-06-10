import { describe, expect, it } from 'vitest';
import { GOOGLE_EXTRACTOR } from '@movar/page-content/google';
import { YOUTUBE_EXTRACTOR } from '@movar/page-content/youtube';
import * as google from './google/model';
import * as youtube from './youtube/model';

describe('dynamic page-content model entrypoints', () => {
  it('delegates the Google capability to the Google extractor', () => {
    document.body.innerHTML = '<div class="g"><a href="/search?q=ua">Україна</a></div>';

    expect(google.extract()).toEqual(GOOGLE_EXTRACTOR.extract(document));
  });

  it('delegates the YouTube capability to the YouTube extractor', () => {
    document.body.innerHTML =
      '<ytd-video-renderer><a id="video-title">Українське відео</a></ytd-video-renderer>';

    expect(youtube.extract()).toEqual(YOUTUBE_EXTRACTOR.extract(document));
  });
});
