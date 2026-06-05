// fallow-ignore-file code-duplication
import { beforeEach, describe, expect, it } from 'vitest';
import { YOUTUBE_EXTRACTOR } from './youtube';

function setBody(html: string): void {
  document.body.innerHTML = html;
}

beforeEach(() => {
  document.body.innerHTML = '';
});

// ─── Host matching ────────────────────────────────────────────────────────

describe('YOUTUBE_EXTRACTOR.matches', () => {
  it('matches www.youtube.com', () => {
    expect(YOUTUBE_EXTRACTOR.matches('www.youtube.com')).toBe(true);
  });

  it('matches m.youtube.com', () => {
    expect(YOUTUBE_EXTRACTOR.matches('m.youtube.com')).toBe(true);
  });

  it('matches bare youtube.com', () => {
    expect(YOUTUBE_EXTRACTOR.matches('youtube.com')).toBe(true);
  });

  it('does not match a non-YouTube host', () => {
    expect(YOUTUBE_EXTRACTOR.matches('example.com')).toBe(false);
    expect(YOUTUBE_EXTRACTOR.matches('google.com')).toBe(false);
  });

  it('does not collide on substring (fake-youtube.com)', () => {
    expect(YOUTUBE_EXTRACTOR.matches('fake-youtube.com')).toBe(false);
  });
});

// ─── Video shape extraction ───────────────────────────────────────────────

describe('YOUTUBE_EXTRACTOR.extract — video nodes', () => {
  it('produces a video node for ytd-video-renderer', () => {
    setBody(`
      <ytd-video-renderer>
        <a id="video-title">Всё о тестировании</a>
        <ytd-channel-name><div id="text"><a>Channel</a></div></ytd-channel-name>
      </ytd-video-renderer>
    `);
    const model = YOUTUBE_EXTRACTOR.extract(document);
    const nodes = model.nodes.filter((n) => n.el.tagName.toLowerCase() === 'ytd-video-renderer');
    expect(nodes).toHaveLength(1);
    expect(nodes[0]!.kind).toBe('video');
    expect(nodes[0]!.hideMode).toBe('blur');
    expect(nodes[0]!.text).toContain('Всё о тестировании');
  });

  it('produces video nodes for all desktop grid variants', () => {
    setBody(`
      <ytd-video-renderer></ytd-video-renderer>
      <ytd-grid-video-renderer></ytd-grid-video-renderer>
      <ytd-rich-item-renderer></ytd-rich-item-renderer>
      <ytd-compact-video-renderer></ytd-compact-video-renderer>
      <ytd-playlist-video-renderer></ytd-playlist-video-renderer>
    `);
    const model = YOUTUBE_EXTRACTOR.extract(document);
    // Each video-type element becomes one node (all via the video shape).
    const videoNodes = model.nodes.filter((n) => n.kind === 'video');
    expect(videoNodes.length).toBeGreaterThanOrEqual(5);
  });

  it('serializes channel name text from ytd-channel-name selector', () => {
    setBody(`
      <ytd-video-renderer>
        <a id="video-title">Tutorial</a>
        <ytd-channel-name><div id="text"><a>Русский Канал</a></div></ytd-channel-name>
      </ytd-video-renderer>
    `);
    const model = YOUTUBE_EXTRACTOR.extract(document);
    const node = model.nodes.find((n) => n.el.tagName.toLowerCase() === 'ytd-video-renderer');
    expect(node?.text).toContain('Русский Канал');
  });

  it('produces a video node for ytd-movie-renderer with video kind', () => {
    setBody(`
      <ytd-movie-renderer>
        <a id="video-title">Фильм</a>
        <ytd-channel-name><a>Канал</a></ytd-channel-name>
      </ytd-movie-renderer>
    `);
    const model = YOUTUBE_EXTRACTOR.extract(document);
    const node = model.nodes.find((n) => n.el.tagName.toLowerCase() === 'ytd-movie-renderer');
    expect(node).not.toBeUndefined();
    expect(node!.kind).toBe('video');
    expect(node!.hideMode).toBe('blur');
  });
});

// ─── Channel shape extraction ─────────────────────────────────────────────

describe('YOUTUBE_EXTRACTOR.extract — channel nodes', () => {
  it('produces a channel node for ytd-channel-renderer with hide mode', () => {
    setBody(`
      <ytd-channel-renderer>
        <div id="channel-title">Канал</div>
        <yt-formatted-string id="description">Описание канала</yt-formatted-string>
      </ytd-channel-renderer>
    `);
    const model = YOUTUBE_EXTRACTOR.extract(document);
    const node = model.nodes.find((n) => n.el.tagName.toLowerCase() === 'ytd-channel-renderer');
    expect(node).not.toBeUndefined();
    expect(node!.kind).toBe('channel');
    expect(node!.hideMode).toBe('hide');
    expect(node!.text).toContain('Канал');
  });

  it('produces a channel node for ytd-mini-channel-renderer', () => {
    setBody(
      `<ytd-mini-channel-renderer><div id="channel-title">MiniCh</div></ytd-mini-channel-renderer>`,
    );
    const model = YOUTUBE_EXTRACTOR.extract(document);
    const node = model.nodes.find(
      (n) => n.el.tagName.toLowerCase() === 'ytd-mini-channel-renderer',
    );
    expect(node?.kind).toBe('channel');
    expect(node?.hideMode).toBe('hide');
  });

  it('produces a channel node for ytm-channel-renderer (mobile)', () => {
    setBody(`<ytm-channel-renderer><div id="channel-title">MobileCh</div></ytm-channel-renderer>`);
    const model = YOUTUBE_EXTRACTOR.extract(document);
    const node = model.nodes.find((n) => n.el.tagName.toLowerCase() === 'ytm-channel-renderer');
    expect(node?.kind).toBe('channel');
    expect(node?.hideMode).toBe('hide');
  });
});

// ─── Playlist shape extraction ─────────────────────────────────────────────

describe('YOUTUBE_EXTRACTOR.extract — playlist nodes', () => {
  it('produces a playlist node for ytd-playlist-renderer', () => {
    setBody(`
      <ytd-playlist-renderer>
        <a id="video-title">Плейлист</a>
        <ytd-channel-name><a>Channel</a></ytd-channel-name>
      </ytd-playlist-renderer>
    `);
    const model = YOUTUBE_EXTRACTOR.extract(document);
    const node = model.nodes.find((n) => n.el.tagName.toLowerCase() === 'ytd-playlist-renderer');
    expect(node?.kind).toBe('playlist');
    expect(node?.hideMode).toBe('blur');
  });

  it('produces a playlist node for ytd-radio-renderer', () => {
    setBody(`<ytd-radio-renderer><a id="video-title">Микс</a></ytd-radio-renderer>`);
    const model = YOUTUBE_EXTRACTOR.extract(document);
    const node = model.nodes.find((n) => n.el.tagName.toLowerCase() === 'ytd-radio-renderer');
    expect(node?.kind).toBe('playlist');
  });

  it('produces a playlist node for ytd-compact-radio-renderer', () => {
    setBody(
      `<ytd-compact-radio-renderer><a id="video-title">Компакт микс</a></ytd-compact-radio-renderer>`,
    );
    const model = YOUTUBE_EXTRACTOR.extract(document);
    const node = model.nodes.find(
      (n) => n.el.tagName.toLowerCase() === 'ytd-compact-radio-renderer',
    );
    expect(node?.kind).toBe('playlist');
  });
});

// ─── Shorts shelf shape extraction ────────────────────────────────────────

describe('YOUTUBE_EXTRACTOR.extract — shorts-shelf nodes', () => {
  it('produces a shorts-shelf node for ytd-reel-shelf-renderer with hide mode', () => {
    setBody(`
      <ytd-reel-shelf-renderer>
        <ytd-reel-item-renderer><a id="video-title">Short 1</a></ytd-reel-item-renderer>
        <ytd-reel-item-renderer><a id="video-title">Short 2</a></ytd-reel-item-renderer>
      </ytd-reel-shelf-renderer>
    `);
    const model = YOUTUBE_EXTRACTOR.extract(document);
    const node = model.nodes.find((n) => n.el.tagName.toLowerCase() === 'ytd-reel-shelf-renderer');
    expect(node?.kind).toBe('shorts-shelf');
    expect(node?.hideMode).toBe('hide');
  });

  it('concatenates all child [id="video-title"] texts for shelf classification', () => {
    setBody(`
      <ytd-reel-shelf-renderer>
        <ytd-reel-item-renderer><a id="video-title">Привет</a></ytd-reel-item-renderer>
        <ytd-reel-item-renderer><a id="video-title">Хочу</a></ytd-reel-item-renderer>
      </ytd-reel-shelf-renderer>
    `);
    const model = YOUTUBE_EXTRACTOR.extract(document);
    const node = model.nodes.find((n) => n.el.tagName.toLowerCase() === 'ytd-reel-shelf-renderer');
    expect(node?.text).toContain('Привет');
    expect(node?.text).toContain('Хочу');
  });

  it('produces a shorts-shelf node for ytm-reel-shelf-renderer (mobile)', () => {
    setBody(`
      <ytm-reel-shelf-renderer>
        <a id="video-title">Short A</a>
        <a id="video-title">Short B</a>
      </ytm-reel-shelf-renderer>
    `);
    const model = YOUTUBE_EXTRACTOR.extract(document);
    const node = model.nodes.find((n) => n.el.tagName.toLowerCase() === 'ytm-reel-shelf-renderer');
    expect(node?.kind).toBe('shorts-shelf');
    expect(node?.hideMode).toBe('hide');
  });
});

// ─── Mobile video shape extraction ────────────────────────────────────────

describe('YOUTUBE_EXTRACTOR.extract — mobile (ytm-*) video nodes', () => {
  it('produces video nodes for all mobile video-renderer variants', () => {
    setBody(`
      <ytm-video-with-context-renderer><a id="video-title">Mobile 1</a></ytm-video-with-context-renderer>
      <ytm-compact-video-renderer><a id="video-title">Mobile 2</a></ytm-compact-video-renderer>
      <ytm-rich-item-renderer><a id="video-title">Mobile 3</a></ytm-rich-item-renderer>
    `);
    const model = YOUTUBE_EXTRACTOR.extract(document);
    const mobileNodes = model.nodes.filter((n) => {
      const tag = n.el.tagName.toLowerCase();
      return (
        tag === 'ytm-video-with-context-renderer' ||
        tag === 'ytm-compact-video-renderer' ||
        tag === 'ytm-rich-item-renderer'
      );
    });
    expect(mobileNodes).toHaveLength(3);
    for (const n of mobileNodes) {
      expect(n.kind).toBe('video');
      expect(n.hideMode).toBe('blur');
    }
  });
});

// ─── Model metadata ───────────────────────────────────────────────────────

describe('YOUTUBE_EXTRACTOR.extract — model metadata', () => {
  it('sets extractor id to "youtube"', () => {
    setBody('');
    const model = YOUTUBE_EXTRACTOR.extract(document);
    expect(model.extractor).toBe('youtube');
  });

  it('returns zero nodes for an empty page', () => {
    setBody('');
    const model = YOUTUBE_EXTRACTOR.extract(document);
    expect(model.nodes).toHaveLength(0);
  });

  it('uses the provided root (not document)', () => {
    setBody(`
      <div id="scope">
        <ytd-video-renderer><a id="video-title">In scope</a></ytd-video-renderer>
      </div>
    `);
    const scope = document.querySelector<HTMLElement>('#scope')!;
    const model = YOUTUBE_EXTRACTOR.extract(scope);
    expect(model.nodes.some((n) => n.el.tagName.toLowerCase() === 'ytd-video-renderer')).toBe(true);
  });
});
