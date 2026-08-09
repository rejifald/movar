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

  it('falls back to the h3 title when a mobile tile has no [id="video-title"] (2026 markup)', () => {
    // m.youtube.com tiles no longer carry [id="video-title"]; the title's only
    // durable anchor is its <h3> (live capture 2026-08-08).
    setBody(`
      <ytm-video-with-context-renderer>
        <ytm-media-item>
          <h3><span>ЧЕРВОНИЙ БОРЩ | СЕКРЕТ ПРИГОТУВАННЯ</span></h3>
          <ytm-badge-and-byline-renderer>Готуємо разом•346 тис. переглядів•5 років тому</ytm-badge-and-byline-renderer>
        </ytm-media-item>
      </ytm-video-with-context-renderer>
    `);
    const model = YOUTUBE_EXTRACTOR.extract(document);
    const node = model.nodes.find(
      (n) => n.el.tagName.toLowerCase() === 'ytm-video-with-context-renderer',
    );
    expect(node?.text).toContain('ЧЕРВОНИЙ БОРЩ');
    // The byline mixes channel name with UI-language view-count chrome — it
    // must never enter the sample (docs/pitfalls.md §1).
    expect(node?.text).not.toContain('переглядів');
  });

  it('keeps the classic sample when [id="video-title"] is present (h3 stays fallback-only)', () => {
    // A classic tile's <h3> can carry badge chrome next to the title link; the
    // fallback must not widen the sample when the classic anchors matched.
    setBody(`
      <ytd-video-renderer>
        <h3>
          <span class="badge">Нове</span>
          <a id="video-title">Только российские новости</a>
        </h3>
        <ytd-channel-name><a>Канал</a></ytd-channel-name>
      </ytd-video-renderer>
    `);
    const model = YOUTUBE_EXTRACTOR.extract(document);
    const node = model.nodes.find((n) => n.el.tagName.toLowerCase() === 'ytd-video-renderer');
    expect(node?.text).toContain('Только российские новости');
    expect(node?.text).not.toContain('Нове');
  });
});

// ─── Lockup (view-model) shape extraction ─────────────────────────────────

const lockup = (inner: string): string => `
    <yt-lockup-view-model>
      <div>
        ${inner}
        <div>
          <yt-lockup-metadata-view-model>
            <h3 title="Итоги дня" aria-label="Итоги дня"><a><span>Итоги дня</span></a></h3>
            <yt-content-metadata-view-model>
              <div>Ходорковский LIVE</div>
              <div>139 тис. переглядів 3 год тому</div>
              <div>Нове</div>
            </yt-content-metadata-view-model>
          </yt-lockup-metadata-view-model>
        </div>
      </div>
    </yt-lockup-view-model>
  `;

describe('YOUTUBE_EXTRACTOR.extract — yt-lockup-view-model nodes', () => {
  it('produces a blurred video node for a plain-thumbnail lockup (watch sidebar)', () => {
    setBody(
      lockup('<a aria-hidden="true"><yt-thumbnail-view-model></yt-thumbnail-view-model></a>'),
    );
    const model = YOUTUBE_EXTRACTOR.extract(document);
    const node = model.nodes.find((n) => n.el.tagName.toLowerCase() === 'yt-lockup-view-model');
    expect(node?.kind).toBe('video');
    expect(node?.hideMode).toBe('blur');
    expect(node?.text).toContain('Итоги дня');
  });

  it('samples the h3 title ONLY — the metadata byline never enters', () => {
    setBody(
      lockup('<a aria-hidden="true"><yt-thumbnail-view-model></yt-thumbnail-view-model></a>'),
    );
    const model = YOUTUBE_EXTRACTOR.extract(document);
    const node = model.nodes.find((n) => n.el.tagName.toLowerCase() === 'yt-lockup-view-model');
    expect(node?.text).toBe('Итоги дня');
  });

  it('labels a collection-thumbnail lockup (Mix/playlist card) as playlist', () => {
    setBody(
      lockup(
        '<a aria-hidden="true"><yt-collection-thumbnail-view-model><yt-collections-stack></yt-collections-stack></yt-collection-thumbnail-view-model></a>',
      ),
    );
    const model = YOUTUBE_EXTRACTOR.extract(document);
    const node = model.nodes.find((n) => n.el.tagName.toLowerCase() === 'yt-lockup-view-model');
    expect(node?.kind).toBe('playlist');
  });

  it('collapses a lockup inside a rich-grid cell onto the cell (one node, h3 text)', () => {
    setBody(`
      <ytd-rich-item-renderer>
        ${lockup('<a aria-hidden="true"><yt-thumbnail-view-model></yt-thumbnail-view-model></a>')}
      </ytd-rich-item-renderer>
    `);
    const model = YOUTUBE_EXTRACTOR.extract(document);
    expect(model.nodes).toHaveLength(1);
    expect(model.nodes[0]!.el.tagName.toLowerCase()).toBe('ytd-rich-item-renderer');
    expect(model.nodes[0]!.kind).toBe('video');
    expect(model.nodes[0]!.text).toBe('Итоги дня');
  });

  it('labels a rich-grid cell wrapping a Mix lockup as playlist', () => {
    setBody(`
      <ytd-rich-item-renderer>
        ${lockup(
          '<a aria-hidden="true"><yt-collection-thumbnail-view-model></yt-collection-thumbnail-view-model></a>',
        )}
      </ytd-rich-item-renderer>
    `);
    const model = YOUTUBE_EXTRACTOR.extract(document);
    expect(model.nodes).toHaveLength(1);
    expect(model.nodes[0]!.kind).toBe('playlist');
  });
});

// ─── Migrated shorts shelf (grid-shelf-view-model) ────────────────────────

const shortsTile = (title: string): string => `
    <ytm-shorts-lockup-view-model-v2>
      <ytm-shorts-lockup-view-model>
        <a aria-hidden="true"></a>
        <div><h3><a title="${title}"><span>${title}</span></a></h3></div>
      </ytm-shorts-lockup-view-model>
    </ytm-shorts-lockup-view-model-v2>
  `;

describe('YOUTUBE_EXTRACTOR.extract — grid-shelf-view-model nodes', () => {
  it('produces one hidden shorts-shelf node aggregating the tile h3 titles', () => {
    setBody(`
      <grid-shelf-view-model>
        <yt-section-header-view-model><h2>YouTube Shorts</h2></yt-section-header-view-model>
        <div>${shortsTile('Привет из Москвы')}${shortsTile('Хочу домой')}</div>
      </grid-shelf-view-model>
    `);
    const model = YOUTUBE_EXTRACTOR.extract(document);
    const node = model.nodes.find((n) => n.el.tagName.toLowerCase() === 'grid-shelf-view-model');
    expect(node?.kind).toBe('shorts-shelf');
    expect(node?.hideMode).toBe('hide');
    expect(node?.text).toContain('Привет из Москвы');
    expect(node?.text).toContain('Хочу домой');
    // The shelf's own header is an h2 — brand chrome, never sampled.
    expect(node?.text).not.toContain('YouTube Shorts');
  });

  it('labels a grid shelf without shorts tiles as a generic shelf', () => {
    setBody(`
      <grid-shelf-view-model>
        <div><h3>Просто заголовок</h3></div>
      </grid-shelf-view-model>
    `);
    const model = YOUTUBE_EXTRACTOR.extract(document);
    const node = model.nodes.find((n) => n.el.tagName.toLowerCase() === 'grid-shelf-view-model');
    expect(node?.kind).toBe('shelf');
    expect(node?.hideMode).toBe('hide');
  });

  it('collapses rich items inside a rich-shelf[is-shorts] onto the shelf unit', () => {
    setBody(`
      <ytd-rich-shelf-renderer is-shorts>
        <ytd-rich-item-renderer><a id="video-title">Short A</a></ytd-rich-item-renderer>
        <ytd-rich-item-renderer><a id="video-title">Short B</a></ytd-rich-item-renderer>
      </ytd-rich-shelf-renderer>
    `);
    const model = YOUTUBE_EXTRACTOR.extract(document);
    expect(model.nodes).toHaveLength(1);
    expect(model.nodes[0]!.el.tagName.toLowerCase()).toBe('ytd-rich-shelf-renderer');
    expect(model.nodes[0]!.kind).toBe('shorts-shelf');
    expect(model.nodes[0]!.text).toContain('Short A');
    expect(model.nodes[0]!.text).toContain('Short B');
  });

  it('leaves a rich-shelf WITHOUT is-shorts to its per-item video nodes', () => {
    setBody(`
      <ytd-rich-shelf-renderer>
        <ytd-rich-item-renderer><a id="video-title">Звичайне відео</a></ytd-rich-item-renderer>
      </ytd-rich-shelf-renderer>
    `);
    const model = YOUTUBE_EXTRACTOR.extract(document);
    expect(model.nodes).toHaveLength(1);
    expect(model.nodes[0]!.el.tagName.toLowerCase()).toBe('ytd-rich-item-renderer');
    expect(model.nodes[0]!.kind).toBe('video');
  });
});

// ─── Community post (backstage) shape extraction ──────────────────────────

/** Real channel-Posts structure (live @tsn/posts 2026-08-08): thread wrapper →
 *  post → #body → #author-thumbnail + #main; #main → #header (author + time
 *  chrome) + #contentTextExpander → #content-text; attachments follow. */
const backstagePost = (contentText: string, attachments = ''): string => `
    <ytd-backstage-post-thread-renderer>
      <ytd-backstage-post-renderer data-fixture-id="the-post">
        <div id="body">
          <div id="author-thumbnail"></div>
          <div id="main">
            <div id="header">
              <div id="header-author">
                <a id="author-text"><span>Ходорковский LIVE</span></a>
                <yt-formatted-string id="published-time-text"><a>15 hours ago</a></yt-formatted-string>
              </div>
            </div>
            <div id="contentTextExpander">
              ${contentText}
            </div>
            ${attachments}
          </div>
        </div>
      </ytd-backstage-post-renderer>
    </ytd-backstage-post-thread-renderer>
  `;

describe('YOUTUBE_EXTRACTOR.extract — community post nodes', () => {
  it('produces a blurred post node sampling #content-text', () => {
    setBody(
      backstagePost(
        `<yt-formatted-string id="content-text"><span>Кремль против «Яблока»: допустят ли партию до выборов?</span></yt-formatted-string>`,
      ),
    );
    const model = YOUTUBE_EXTRACTOR.extract(document);
    const node = model.nodes.find(
      (n) => n.el.tagName.toLowerCase() === 'ytd-backstage-post-renderer',
    );
    expect(node).not.toBeUndefined();
    expect(node!.kind).toBe('post');
    expect(node!.hideMode).toBe('blur');
    expect(node!.text).toContain('Кремль против «Яблока»');
  });

  it('excludes the header author/time chrome from the sample', () => {
    // The #header bakes the author with the LOCALIZED relative time («1 день
    // тому» / "15 hours ago") — the same pitfalls §1 contamination class as
    // the lockup byline; neither may enter the sample.
    setBody(
      backstagePost(
        `<yt-formatted-string id="content-text"><span>Взрыв в московском ресторане</span></yt-formatted-string>`,
      ),
    );
    const model = YOUTUBE_EXTRACTOR.extract(document);
    const node = model.nodes.find(
      (n) => n.el.tagName.toLowerCase() === 'ytd-backstage-post-renderer',
    );
    expect(node?.text).not.toContain('Ходорковский LIVE');
    expect(node?.text).not.toContain('hours ago');
    expect(node?.text).not.toContain('тому');
  });

  it('keeps poll-attachment options out of the sample', () => {
    setBody(
      backstagePost(
        `<yt-formatted-string id="content-text"><span>Стоит ли за нее голосовать?</span></yt-formatted-string>`,
        `<ytd-backstage-poll-renderer>
           <div id="poll-votes">1,2 тыс. votes</div>
           <div class="choice"><span>Да, обязательно</span></div>
           <div class="choice"><span>Нет, бойкот</span></div>
         </ytd-backstage-poll-renderer>`,
      ),
    );
    const model = YOUTUBE_EXTRACTOR.extract(document);
    const node = model.nodes.find(
      (n) => n.el.tagName.toLowerCase() === 'ytd-backstage-post-renderer',
    );
    expect(node?.text).toContain('Стоит ли за нее голосовать?');
    expect(node?.text).not.toContain('Да, обязательно');
    expect(node?.text).not.toContain('Нет, бойкот');
  });

  it('serializes an image/poll-only post to empty text (fail open, no fallback)', () => {
    setBody(
      backstagePost(
        '',
        `<ytd-backstage-image-renderer><img alt=""></ytd-backstage-image-renderer>`,
      ),
    );
    const model = YOUTUBE_EXTRACTOR.extract(document);
    const node = model.nodes.find(
      (n) => n.el.tagName.toLowerCase() === 'ytd-backstage-post-renderer',
    );
    expect(node).not.toBeUndefined();
    expect(node!.text).toBe('');
  });

  it('collapses a quoted repost onto the outer post (single node)', () => {
    setBody(
      backstagePost(
        `<yt-formatted-string id="content-text"><span>Наш коментар</span></yt-formatted-string>`,
        `<ytd-backstage-post-renderer data-fixture-id="quoted">
           <div id="main">
             <yt-formatted-string id="content-text"><span>Цитований допис</span></yt-formatted-string>
           </div>
         </ytd-backstage-post-renderer>`,
      ),
    );
    const model = YOUTUBE_EXTRACTOR.extract(document);
    const postNodes = model.nodes.filter(
      (n) => n.el.tagName.toLowerCase() === 'ytd-backstage-post-renderer',
    );
    expect(postNodes).toHaveLength(1);
    expect(postNodes[0]!.el.getAttribute('data-fixture-id')).toBe('the-post');
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
