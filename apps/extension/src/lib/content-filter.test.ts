import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  applyContentFilter,
  clearAllContentMarks,
  filterContentByLanguage,
  getFilterForHost,
  revealAllBlurred,
  GOOGLE_SERP_SELECTORS,
  YT_GRID_SELECTORS,
  type SiteContentFilter,
} from './content-filter';
import { setContentLocale } from './i18n/content';

function setBody(html: string): void {
  document.body.innerHTML = html;
}

let YT: SiteContentFilter;

beforeAll(() => {
  // Resolve at suite start so a regression in getFilterForHost surfaces as
  // a clear "expected non-null" failure tied to a real test, not an opaque
  // module-load NPE. (Pre-fix this was `const YT = getFilterForHost(...)!;`
  // at module scope — top-level non-null asserts mask the failure site.)
  const filter = getFilterForHost('www.youtube.com');
  if (!filter) throw new Error('expected a content filter for www.youtube.com');
  YT = filter;
});

function ytCard(title: string, channel = ''): string {
  return `
    <ytd-video-renderer>
      <a id="video-title">${title}</a>
      <ytd-channel-name><div id="text"><a>${channel}</a></div></ytd-channel-name>
    </ytd-video-renderer>
  `;
}

function findRevealButton(card: HTMLElement): HTMLButtonElement | null {
  const host = card.querySelector<HTMLElement>('[data-movar-curtain]');
  if (!host?.shadowRoot) return null;
  return host.shadowRoot.querySelector<HTMLButtonElement>('button');
}

beforeEach(() => {
  document.body.innerHTML = '';
  document.head.innerHTML = '';
});

describe('filterContentByLanguage — Google SERP cards', () => {
  it('hides a result card whose title and snippet are Russian', () => {
    setBody(`
      <div id="search">
        <div class="g" id="ru-card">
          <h3>Купить картину в Москве</h3>
          <span>Большой выбор картин разных стилей и эпох.</span>
        </div>
        <div class="g" id="uk-card">
          <h3>Купити картину в Києві</h3>
          <span>Великий вибір картин різних стилів та епох.</span>
        </div>
      </div>
    `);
    const result = filterContentByLanguage(GOOGLE_SERP_SELECTORS, ['ru']);
    expect(result.hiddenNodes).toHaveLength(1);
    expect(document.querySelector<HTMLElement>('#ru-card')!.style.display).toBe('none');
    expect(document.querySelector<HTMLElement>('#uk-card')!.style.display).toBe('');
  });

  it('leaves English / Latin-script cards alone', () => {
    setBody(`
      <div id="search">
        <div class="g" id="en-card">
          <h3>Buy artwork online</h3>
          <span>A wide selection of paintings from many eras.</span>
        </div>
      </div>
    `);
    const result = filterContentByLanguage(GOOGLE_SERP_SELECTORS, ['ru']);
    expect(result.hiddenNodes).toHaveLength(0);
    expect(document.querySelector<HTMLElement>('#en-card')!.style.display).toBe('');
  });

  it('is idempotent across repeated calls', () => {
    setBody(`
      <div id="search">
        <div class="g" id="ru-card">
          <h3>Что-то по-русски</h3>
          <span>Какой-то очень русский текст здесь.</span>
        </div>
      </div>
    `);
    const first = filterContentByLanguage(GOOGLE_SERP_SELECTORS, ['ru']);
    const second = filterContentByLanguage(GOOGLE_SERP_SELECTORS, ['ru']);
    expect(first.hiddenNodes).toHaveLength(1);
    expect(second.hiddenNodes).toHaveLength(0);
  });

  it('does nothing when blocked is empty', () => {
    setBody(`
      <div id="search">
        <div class="g">Какой-то русский текст</div>
      </div>
    `);
    const result = filterContentByLanguage(GOOGLE_SERP_SELECTORS, []);
    expect(result.hiddenNodes).toHaveLength(0);
  });
});

describe('filterContentByLanguage — YouTube grid items', () => {
  it('hides a video tile whose title is Russian', () => {
    setBody(`
      <div id="contents">
        <ytd-video-renderer id="v-ru">
          <a id="video-title">Что приготовить на ужин — 10 быстрых рецептов</a>
        </ytd-video-renderer>
        <ytd-video-renderer id="v-uk">
          <a id="video-title">Що приготувати на вечерю — 10 швидких рецептів</a>
        </ytd-video-renderer>
      </div>
    `);
    const result = filterContentByLanguage(YT_GRID_SELECTORS, ['ru']);
    expect(result.hiddenNodes).toHaveLength(1);
    expect(document.querySelector<HTMLElement>('#v-ru')!.style.display).toBe('none');
    expect(document.querySelector<HTMLElement>('#v-uk')!.style.display).toBe('');
  });

  it('matches multiple grid-renderer variants (video, grid-video, rich-item)', () => {
    setBody(`
      <div id="contents">
        <ytd-video-renderer id="a">
          <a>Что-то очень русское про политику</a>
        </ytd-video-renderer>
        <ytd-grid-video-renderer id="b">
          <a>Ещё одно русскоязычное видео про объекты</a>
        </ytd-grid-video-renderer>
        <ytd-rich-item-renderer id="c">
          <a>Совершенно русскоязычный контент про объём</a>
        </ytd-rich-item-renderer>
      </div>
    `);
    const result = filterContentByLanguage(YT_GRID_SELECTORS, ['ru']);
    expect(result.hiddenNodes).toHaveLength(3);
  });
});

describe('filterContentByLanguage — restore', () => {
  it('does not double-hide already-hidden nodes (uses data attribute marker)', () => {
    setBody(`
      <div id="search">
        <div class="g" id="ru-card">
          <h3>Совершенно русский контент сейчас</h3>
        </div>
      </div>
    `);
    filterContentByLanguage(GOOGLE_SERP_SELECTORS, ['ru']);
    const card = document.querySelector<HTMLElement>('#ru-card')!;
    expect(card.dataset['movarHidden']).toBeTruthy();

    // Second call: card is already marked, should be skipped.
    const second = filterContentByLanguage(GOOGLE_SERP_SELECTORS, ['ru']);
    expect(second.hiddenNodes).toHaveLength(0);
  });
});

describe('filterContentByLanguage — short-text guard', () => {
  it('does not hide a node whose Cyrillic sample is too short to classify', () => {
    // A single Cyrillic word can be many languages; don't act on weak evidence.
    setBody(`
      <div id="search">
        <div class="g" id="card">
          <h3>Привет</h3>
        </div>
      </div>
    `);
    const result = filterContentByLanguage(GOOGLE_SERP_SELECTORS, ['ru']);
    expect(result.hiddenNodes).toHaveLength(0);
  });
});

describe('getFilterForHost', () => {
  it('returns the YouTube filter on www.youtube.com', () => {
    expect(getFilterForHost('www.youtube.com')).not.toBeNull();
  });

  it('matches mobile YouTube subdomain', () => {
    expect(getFilterForHost('m.youtube.com')).not.toBeNull();
  });

  it('matches the bare youtube.com', () => {
    expect(getFilterForHost('youtube.com')).not.toBeNull();
  });

  it('returns null for unknown hosts', () => {
    expect(getFilterForHost('example.com')).toBeNull();
    expect(getFilterForHost('google.com')).toBeNull();
  });

  it('does NOT collide on substring (youtube.com.suffix)', () => {
    expect(getFilterForHost('fake-youtube.com')).toBeNull();
  });
});

describe('applyContentFilter — YouTube blur behavior', () => {
  it('blurs a card with a Russian title', () => {
    // "ы" and "э" — distinctive Russian letters.
    setBody(ytCard('Всё, что нужно знать о тестировании'));
    const blurred = applyContentFilter(YT, ['ru']);
    expect(blurred).toHaveLength(1);
    const card = document.querySelector<HTMLElement>('ytd-video-renderer')!;
    expect(card.dataset['movarContentBlurred']).toBe('ru');
    expect(card.querySelector('[data-movar-curtain]')).not.toBeNull();
    // Default locale in tests is English; the localised path is exercised in
    // a dedicated describe below.
    expect(findRevealButton(card)?.textContent).toBe('Show');
  });

  it('shows the language reason in the curtain description', () => {
    setBody(ytCard('Всё, что нужно знать о тестировании'));
    applyContentFilter(YT, ['ru']);
    const card = document.querySelector<HTMLElement>('ytd-video-renderer')!;
    const host = card.querySelector<HTMLElement>('[data-movar-curtain]')!;
    const desc = host.shadowRoot!.querySelector('.pill__description');
    expect(desc?.textContent).toContain('Russian');
  });

  // Locale plumbing: when the content-script bootstrap sets uk, new curtains
  // render in Ukrainian. Reset to en after EACH test — `afterAll` would let
  // the `uk` state leak between siblings if this block grew to 2+ cases.
  describe('with Ukrainian locale', () => {
    afterEach(() => {
      setContentLocale('en');
    });

    it('renders the reveal button and description in Ukrainian', () => {
      setContentLocale('uk');
      setBody(ytCard('Всё, что нужно знать о тестировании'));
      applyContentFilter(YT, ['ru']);
      const card = document.querySelector<HTMLElement>('ytd-video-renderer')!;
      const host = card.querySelector<HTMLElement>('[data-movar-curtain]')!;
      expect(findRevealButton(card)?.textContent).toBe('Показати');
      expect(host.shadowRoot!.querySelector('.pill__description')?.textContent).toContain(
        'Російською',
      );
    });
  });

  it('does NOT blur a card with a Ukrainian-distinctive title', () => {
    // "і", "ї", "є" — distinctive Ukrainian letters.
    setBody(ytCard('Як зробити тест українською мовою'));
    expect(applyContentFilter(YT, ['ru'])).toHaveLength(0);
    expect(document.querySelector('[data-movar-content-blurred]')).toBeNull();
  });

  it('does NOT blur an English-only card', () => {
    setBody(ytCard('How to write a unit test in JavaScript', 'SomeChannel'));
    expect(applyContentFilter(YT, ['ru'])).toHaveLength(0);
  });

  it('does NOT blur a card with no distinctive letters either way ("тест")', () => {
    // "тест" has zero UA or RU distinctive letters, so detection returns
    // 'unknown' and we don't blur. Acknowledged false-negative — we'd
    // rather miss it than blur UA.
    setBody(ytCard('тест', 'канал'));
    expect(applyContentFilter(YT, ['ru'])).toHaveLength(0);
  });

  it('considers the channel text in addition to the title', () => {
    setBody(ytCard('Tutorial', 'Всё о программировании'));
    expect(applyContentFilter(YT, ['ru'])).toHaveLength(1);
  });

  it('skips cards the user already revealed', () => {
    setBody(`
      <ytd-video-renderer data-movar-revealed="true">
        <a id="video-title">Полностью на русском языке</a>
      </ytd-video-renderer>
    `);
    expect(applyContentFilter(YT, ['ru'])).toHaveLength(0);
    expect(document.querySelector('[data-movar-curtain]')).toBeNull();
  });

  it('skips lazy-loading cards with no text yet (no checked mark)', () => {
    setBody(`
      <ytd-video-renderer>
        <a id="video-title"></a>
      </ytd-video-renderer>
    `);
    expect(applyContentFilter(YT, ['ru'])).toHaveLength(0);
    const card = document.querySelector<HTMLElement>('ytd-video-renderer')!;
    expect(Object.hasOwn(card.dataset, 'movarContentChecked')).toBe(false);
  });

  it('is idempotent — second call returns no new cards, no duplicate curtains', () => {
    setBody(ytCard('Всё о программировании'));
    expect(applyContentFilter(YT, ['ru'])).toHaveLength(1);
    expect(applyContentFilter(YT, ['ru'])).toHaveLength(0);
    expect(document.querySelectorAll('[data-movar-curtain]')).toHaveLength(1);
  });

  it('does nothing when ru is not in blocked', () => {
    setBody(ytCard('Всё о программировании'));
    expect(applyContentFilter(YT, [])).toHaveLength(0);
    expect(applyContentFilter(YT, ['uk'])).toHaveLength(0);
    expect(document.querySelector('[data-movar-curtain]')).toBeNull();
  });

  it('handles multiple cards independently', () => {
    setBody(`
      ${ytCard('Всё о тестах', 'РусскийКанал')}
      ${ytCard('Як писати тести українською мовою', 'УкрКанал')}
      ${ytCard('How to write tests', 'EnChannel')}
    `);
    const blurred = applyContentFilter(YT, ['ru']);
    expect(blurred).toHaveLength(1);
    expect(document.querySelectorAll('[data-movar-content-blurred]')).toHaveLength(1);
  });
});

describe('applyContentFilter — curtain interaction', () => {
  it('clicking the reveal button removes the curtain and marks the card', () => {
    setBody(ytCard('Всё о программировании'));
    applyContentFilter(YT, ['ru']);

    const card = document.querySelector<HTMLElement>('ytd-video-renderer')!;
    const btn = findRevealButton(card)!;
    btn.click();

    expect(card.querySelector('[data-movar-curtain]')).toBeNull();
    expect(Object.hasOwn(card.dataset, 'movarContentBlurred')).toBe(false);
    expect(card.dataset['movarRevealed']).toBe('true');
  });

  it('a revealed card stays revealed on a re-pass', () => {
    setBody(ytCard('Всё о программировании'));
    applyContentFilter(YT, ['ru']);
    const card = document.querySelector<HTMLElement>('ytd-video-renderer')!;
    findRevealButton(card)!.click();
    applyContentFilter(YT, ['ru']);
    expect(document.querySelector('[data-movar-curtain]')).toBeNull();
    expect(document.querySelector('[data-movar-content-blurred]')).toBeNull();
  });

  it('reveal click does not propagate (would otherwise trigger card click)', () => {
    setBody(ytCard('Всё о программировании'));
    applyContentFilter(YT, ['ru']);
    const card = document.querySelector<HTMLElement>('ytd-video-renderer')!;
    let cardClicked = false;
    card.addEventListener('click', () => {
      cardClicked = true;
    });
    findRevealButton(card)!.click();
    expect(cardClicked).toBe(false);
  });
});

describe('revealAllBlurred', () => {
  it('clears every blurred card on the page', () => {
    setBody(`
      ${ytCard('Всё о тестах')}
      ${ytCard('Это совсем другое — всё, что нужно знать')}
    `);
    applyContentFilter(YT, ['ru']);
    expect(document.querySelectorAll('[data-movar-content-blurred]')).toHaveLength(2);

    revealAllBlurred();

    expect(document.querySelectorAll('[data-movar-content-blurred]')).toHaveLength(0);
    expect(document.querySelectorAll('[data-movar-curtain]')).toHaveLength(0);
    expect(document.querySelectorAll('[data-movar-revealed="true"]')).toHaveLength(2);
  });

  it('does not re-blur revealed cards on a subsequent filter pass', () => {
    setBody(ytCard('Всё о программировании'));
    applyContentFilter(YT, ['ru']);
    revealAllBlurred();
    applyContentFilter(YT, ['ru']);
    expect(document.querySelector('[data-movar-curtain]')).toBeNull();
  });
});

describe('clearAllContentMarks', () => {
  it('strips blur curtains and bookkeeping without marking cards revealed', () => {
    setBody(`
      ${ytCard('Всё о тестах')}
      ${ytCard('Просто новости')}
    `);
    applyContentFilter(YT, ['ru']);
    expect(document.querySelectorAll('[data-movar-content-blurred]')).toHaveLength(2);
    expect(document.querySelectorAll('[data-movar-content-checked]')).toHaveLength(2);

    clearAllContentMarks();

    expect(document.querySelectorAll('[data-movar-content-blurred]')).toHaveLength(0);
    expect(document.querySelectorAll('[data-movar-content-checked]')).toHaveLength(0);
    expect(document.querySelectorAll('[data-movar-curtain]')).toHaveLength(0);
    expect(document.querySelectorAll('[data-movar-revealed="true"]')).toHaveLength(0);
  });

  it('lets a subsequent applyContentFilter re-blur the same cards', () => {
    setBody(ytCard('Всё о программировании'));
    applyContentFilter(YT, ['ru']);
    clearAllContentMarks();

    const reblurred = applyContentFilter(YT, ['ru']);
    expect(reblurred).toHaveLength(1);
    expect(document.querySelector('[data-movar-content-blurred]')).not.toBeNull();
  });

  it('preserves cards that the user had explicitly revealed via the curtain', () => {
    setBody(`
      ${ytCard('Всё о тестах')}
      ${ytCard('Просто новости')}
    `);
    applyContentFilter(YT, ['ru']);
    // Simulate a per-card "Show" click on the first blurred card.
    const firstCard = document.querySelector<HTMLElement>('ytd-video-renderer')!;
    findRevealButton(firstCard)!.click();
    expect(firstCard.getAttribute('data-movar-revealed')).toBe('true');

    clearAllContentMarks();

    // The user-revealed marker survives — a future apply pass will skip it.
    expect(firstCard.getAttribute('data-movar-revealed')).toBe('true');
    applyContentFilter(YT, ['ru']);
    expect(firstCard.hasAttribute('data-movar-content-blurred')).toBe(false);

    // The other card had no user gesture, so it goes back through filtering
    // and ends up blurred again.
    const secondCard = document.querySelectorAll<HTMLElement>('ytd-video-renderer')[1]!;
    expect(secondCard.getAttribute('data-movar-content-blurred')).toBe('ru');
  });
});

describe('applyContentFilter — custom filter shape', () => {
  it('works with a different filter (shapes are data, not hard-coded)', () => {
    const custom: SiteContentFilter = {
      shapes: [
        {
          kind: 'video',
          selector: '.result-card',
          textSelectors: ['.title', '.author'],
        },
      ],
    };
    setBody(`
      <div class="result-card">
        <div class="title">Всё о программировании</div>
        <div class="author">Автор</div>
      </div>
    `);
    const blurred = applyContentFilter(custom, ['ru']);
    expect(blurred).toHaveLength(1);
    expect(blurred[0]?.kind).toBe('video');
    expect(document.querySelector('.result-card')?.getAttribute('data-movar-content-blurred')).toBe(
      'ru',
    );
  });
});

describe('applyContentFilter — hideMode dispatch', () => {
  it("hideMode: 'hide' sets display:none + HIDDEN_ATTR, no curtain attached", () => {
    const filter: SiteContentFilter = {
      shapes: [
        {
          kind: 'channel',
          selector: '.channel-card',
          textSelectors: ['.name', '.description'],
          hideMode: 'hide',
        },
      ],
    };
    setBody(`
      <div class="channel-card">
        <div class="name">Русский канал</div>
        <div class="description">Всё о программировании на русском языке</div>
      </div>
    `);
    const hits = applyContentFilter(filter, ['ru']);
    expect(hits).toHaveLength(1);
    expect(hits[0]?.kind).toBe('channel');
    const card = document.querySelector<HTMLElement>('.channel-card')!;
    expect(card.style.display).toBe('none');
    expect(card.getAttribute('data-movar-hidden')).toMatch(/^content-filter:channel:ru$/);
    // No curtain — hide mode is flat.
    expect(card.querySelector('[data-movar-curtain]')).toBeNull();
  });

  it("hideMode: 'blur' is the default when omitted", () => {
    const filter: SiteContentFilter = {
      shapes: [
        {
          kind: 'video',
          selector: '.video-card',
          textSelectors: ['.title'],
        },
      ],
    };
    setBody(`<div class="video-card"><div class="title">Всё о программировании</div></div>`);
    applyContentFilter(filter, ['ru']);
    const card = document.querySelector<HTMLElement>('.video-card')!;
    expect(card.getAttribute('data-movar-content-blurred')).toBe('ru');
    expect(card.querySelector('[data-movar-curtain]')).not.toBeNull();
  });

  it('a hidden card is not re-scanned on the next pass', () => {
    const filter: SiteContentFilter = {
      shapes: [
        {
          kind: 'channel',
          selector: '.channel-card',
          textSelectors: ['.description'],
          hideMode: 'hide',
        },
      ],
    };
    setBody(
      `<div class="channel-card"><div class="description">Всё о программировании</div></div>`,
    );
    expect(applyContentFilter(filter, ['ru'])).toHaveLength(1);
    expect(applyContentFilter(filter, ['ru'])).toHaveLength(0);
  });
});

describe('applyContentFilter — multi-shape iteration', () => {
  it('scans every shape and aggregates hits across them', () => {
    const filter: SiteContentFilter = {
      shapes: [
        {
          kind: 'video',
          selector: '.video',
          textSelectors: ['.title'],
        },
        {
          kind: 'channel',
          selector: '.channel',
          textSelectors: ['.description'],
          hideMode: 'hide',
        },
      ],
    };
    setBody(`
      <div class="video"><div class="title">Всё о программировании на русском</div></div>
      <div class="channel"><div class="description">Русский канал про программирование</div></div>
      <div class="video"><div class="title">Як писати тести українською мовою</div></div>
    `);
    const hits = applyContentFilter(filter, ['ru']);
    const kinds = hits.map((h) => h.kind).sort();
    expect(kinds).toEqual(['channel', 'video']);
  });

  it('reads text from EVERY textSelector match inside a card (not just the first)', () => {
    // A shelf-like card with many child titles — the joined text should
    // accumulate enough Cyrillic to classify, where any single title alone
    // would be too short.
    const filter: SiteContentFilter = {
      shapes: [
        {
          kind: 'shorts-shelf',
          selector: '.shelf',
          textSelectors: ['.item-title'],
          hideMode: 'hide',
        },
      ],
    };
    setBody(`
      <div class="shelf">
        <div class="item-title">Привет</div>
        <div class="item-title">Хочу</div>
        <div class="item-title">Сейчас</div>
        <div class="item-title">Здравствуйте</div>
      </div>
    `);
    const hits = applyContentFilter(filter, ['ru']);
    expect(hits).toHaveLength(1);
    expect(hits[0]?.kind).toBe('shorts-shelf');
  });

  it('does not double-count text when textSelectors overlap (fallback-chain pair)', () => {
    // Pin the regression: with overlapping selectors that both match nested
    // elements (a wrapper + a child), only the outer one contributes text.
    // Without this dedup, `тест` + `канал` + `канал` (double-counted via the
    // <a> inside the <div id="text">) would tip past MIN_CYRILLIC_FOR_FALLBACK
    // and false-positive blur the card.
    const filter: SiteContentFilter = {
      shapes: [
        {
          kind: 'video',
          selector: '.card',
          textSelectors: ['.outer [data-channel]', '.outer a'],
        },
      ],
    };
    setBody(`
      <div class="card">
        <div class="outer">
          <div data-channel><a>канал</a></div>
        </div>
      </div>
    `);
    // "канал" = 5 Cyrillic chars, below MIN_CYRILLIC_FOR_FALLBACK. With
    // double-count it'd be 10 and would classify as ru.
    expect(applyContentFilter(filter, ['ru'])).toHaveLength(0);
  });

  it('appliesTo predicate gates the shape', () => {
    const filter: SiteContentFilter = {
      shapes: [
        {
          kind: 'post',
          selector: '.post',
          textSelectors: ['.body'],
          // Predicate returns false → shape is skipped.
          appliesTo: () => false,
        },
      ],
    };
    setBody(`<div class="post"><div class="body">Всё о программировании на русском</div></div>`);
    expect(applyContentFilter(filter, ['ru'])).toHaveLength(0);
  });
});

// ─── YouTube non-video shapes ────────────────────────────────────────────

describe('applyContentFilter — YouTube channel cards', () => {
  it('hides a channel card with a Russian description (display:none, no curtain)', () => {
    setBody(`
      <ytd-channel-renderer id="ch">
        <div id="channel-title">Сегодня</div>
        <yt-formatted-string id="description">Канал о русской культуре и истории — выпуски каждую неделю.</yt-formatted-string>
      </ytd-channel-renderer>
    `);
    const hits = applyContentFilter(YT, ['ru']);
    expect(hits).toHaveLength(1);
    expect(hits[0]?.kind).toBe('channel');
    const card = document.querySelector<HTMLElement>('#ch')!;
    expect(card.style.display).toBe('none');
    expect(card.getAttribute('data-movar-hidden')).toMatch(/^content-filter:channel:ru$/);
    expect(card.querySelector('[data-movar-curtain]')).toBeNull();
  });

  it('does NOT hide a Ukrainian-distinctive channel description', () => {
    setBody(`
      <ytd-channel-renderer id="ch">
        <div id="channel-title">Сьогодні</div>
        <yt-formatted-string id="description">Канал про українську культуру та історію — випуски щотижня.</yt-formatted-string>
      </ytd-channel-renderer>
    `);
    expect(applyContentFilter(YT, ['ru'])).toHaveLength(0);
    expect(document.querySelector<HTMLElement>('#ch')!.style.display).toBe('');
  });

  it('also handles ytd-mini-channel-renderer', () => {
    setBody(`
      <ytd-mini-channel-renderer id="mch">
        <div id="channel-title">Русский канал</div>
        <yt-formatted-string id="description">Всё про программирование на русском</yt-formatted-string>
      </ytd-mini-channel-renderer>
    `);
    const hits = applyContentFilter(YT, ['ru']);
    expect(hits).toHaveLength(1);
    expect(hits[0]?.kind).toBe('channel');
  });

  it('idempotent — a hidden channel is not re-scanned', () => {
    setBody(`
      <ytd-channel-renderer>
        <yt-formatted-string id="description">Полностью на русском языке про программирование</yt-formatted-string>
      </ytd-channel-renderer>
    `);
    expect(applyContentFilter(YT, ['ru'])).toHaveLength(1);
    expect(applyContentFilter(YT, ['ru'])).toHaveLength(0);
  });
});

describe('applyContentFilter — YouTube playlist / mix / radio', () => {
  it('blurs a playlist with a Russian title', () => {
    setBody(`
      <ytd-playlist-renderer id="pl">
        <a id="video-title">Всё о программировании — плейлист</a>
        <ytd-channel-name><a>Какой-то Канал</a></ytd-channel-name>
      </ytd-playlist-renderer>
    `);
    const hits = applyContentFilter(YT, ['ru']);
    expect(hits).toHaveLength(1);
    expect(hits[0]?.kind).toBe('playlist');
    const card = document.querySelector<HTMLElement>('#pl')!;
    expect(card.getAttribute('data-movar-content-blurred')).toBe('ru');
    expect(card.querySelector('[data-movar-curtain]')).not.toBeNull();
  });

  it('blurs a radio/mix renderer with Russian text', () => {
    setBody(`
      <ytd-radio-renderer id="rad">
        <a id="video-title">Микс — всё о программировании</a>
        <ytd-channel-name><a>YouTube</a></ytd-channel-name>
      </ytd-radio-renderer>
    `);
    const hits = applyContentFilter(YT, ['ru']);
    expect(hits).toHaveLength(1);
    expect(hits[0]?.kind).toBe('playlist');
  });

  it('blurs ytd-compact-radio-renderer too', () => {
    setBody(`
      <ytd-compact-radio-renderer id="crad">
        <a id="video-title">Микс — всё о программировании</a>
        <ytd-channel-name><a>YouTube</a></ytd-channel-name>
      </ytd-compact-radio-renderer>
    `);
    expect(applyContentFilter(YT, ['ru'])).toHaveLength(1);
  });

  it('does NOT blur a Ukrainian-distinctive playlist', () => {
    setBody(`
      <ytd-playlist-renderer>
        <a id="video-title">Все про програмування — плейлист українською</a>
        <ytd-channel-name><a>Якийсь канал</a></ytd-channel-name>
      </ytd-playlist-renderer>
    `);
    expect(applyContentFilter(YT, ['ru'])).toHaveLength(0);
  });
});

describe('applyContentFilter — YouTube movies', () => {
  it('blurs a movie card with a Russian title', () => {
    setBody(`
      <ytd-movie-renderer id="mv">
        <a id="video-title">Всё, что нужно знать о программировании — документальный фильм</a>
        <ytd-channel-name><a>Канал</a></ytd-channel-name>
      </ytd-movie-renderer>
    `);
    const hits = applyContentFilter(YT, ['ru']);
    expect(hits).toHaveLength(1);
    expect(hits[0]?.kind).toBe('video');
  });
});

describe('applyContentFilter — YouTube shorts shelf', () => {
  it('hides a shorts shelf where every child title is Russian-leaning', () => {
    // Individually these titles wouldn't classify — each is below
    // MIN_CYRILLIC_FOR_FALLBACK = 10. Together they cross the bound and
    // the shelf collapses as a unit.
    setBody(`
      <ytd-reel-shelf-renderer id="shelf">
        <ytd-reel-item-renderer><a id="video-title">Привет</a></ytd-reel-item-renderer>
        <ytd-reel-item-renderer><a id="video-title">Хочу</a></ytd-reel-item-renderer>
        <ytd-reel-item-renderer><a id="video-title">Сейчас</a></ytd-reel-item-renderer>
        <ytd-reel-item-renderer><a id="video-title">Здравствуйте</a></ytd-reel-item-renderer>
      </ytd-reel-shelf-renderer>
    `);
    const hits = applyContentFilter(YT, ['ru']);
    expect(hits).toHaveLength(1);
    expect(hits[0]?.kind).toBe('shorts-shelf');
    const shelf = document.querySelector<HTMLElement>('#shelf')!;
    expect(shelf.style.display).toBe('none');
    expect(shelf.getAttribute('data-movar-hidden')).toMatch(/^content-filter:shorts-shelf:ru$/);
  });

  it('does NOT hide a shelf whose titles carry Ukrainian distinctives', () => {
    setBody(`
      <ytd-reel-shelf-renderer id="shelf">
        <ytd-reel-item-renderer><a id="video-title">Привіт усім</a></ytd-reel-item-renderer>
        <ytd-reel-item-renderer><a id="video-title">Сьогодні</a></ytd-reel-item-renderer>
        <ytd-reel-item-renderer><a id="video-title">Як справи</a></ytd-reel-item-renderer>
      </ytd-reel-shelf-renderer>
    `);
    expect(applyContentFilter(YT, ['ru'])).toHaveLength(0);
    expect(document.querySelector<HTMLElement>('#shelf')!.style.display).toBe('');
  });

  it('leaves a mixed-evidence shelf alone (detector returns unknown on ties)', () => {
    // One UA-distinctive `і` against one RU-distinctive `ё` → ukScore === ruScore === 1
    // → detectCyrillicLanguage returns 'unknown' → shelf left alone. This is
    // the safety net: a shelf the user might want to keep is left alone.
    setBody(`
      <ytd-reel-shelf-renderer id="shelf">
        <ytd-reel-item-renderer><a id="video-title">Сьогодні</a></ytd-reel-item-renderer>
        <ytd-reel-item-renderer><a id="video-title">Это всё</a></ytd-reel-item-renderer>
      </ytd-reel-shelf-renderer>
    `);
    expect(applyContentFilter(YT, ['ru'])).toHaveLength(0);
  });

  it('idempotent — a hidden shelf is not re-scanned on the next pass', () => {
    setBody(`
      <ytd-reel-shelf-renderer>
        <ytd-reel-item-renderer><a id="video-title">Привет</a></ytd-reel-item-renderer>
        <ytd-reel-item-renderer><a id="video-title">Хочу</a></ytd-reel-item-renderer>
        <ytd-reel-item-renderer><a id="video-title">Сейчас</a></ytd-reel-item-renderer>
        <ytd-reel-item-renderer><a id="video-title">Здравствуйте</a></ytd-reel-item-renderer>
      </ytd-reel-shelf-renderer>
    `);
    expect(applyContentFilter(YT, ['ru'])).toHaveLength(1);
    expect(applyContentFilter(YT, ['ru'])).toHaveLength(0);
  });

  it('does not classify a shelf that has no child titles yet (lazy load)', () => {
    setBody(`<ytd-reel-shelf-renderer></ytd-reel-shelf-renderer>`);
    expect(applyContentFilter(YT, ['ru'])).toHaveLength(0);
    // Importantly: NOT marked checked, so the next mutation pass can re-scan
    // once child shorts hydrate in.
    const shelf = document.querySelector<HTMLElement>('ytd-reel-shelf-renderer')!;
    expect(Object.hasOwn(shelf.dataset, 'movarContentChecked')).toBe(false);
  });
});

// ─── Mobile (m.youtube.com) selectors ─────────────────────────────────────

describe('applyContentFilter — YouTube mobile (ytm-*) selectors', () => {
  it('blurs a ytm-video-with-context-renderer with a Russian title', () => {
    setBody(`
      <ytm-video-with-context-renderer id="mv">
        <a id="video-title">Всё о программировании на русском языке</a>
      </ytm-video-with-context-renderer>
    `);
    const hits = applyContentFilter(YT, ['ru']);
    expect(hits).toHaveLength(1);
    expect(hits[0]?.kind).toBe('video');
    expect(
      document.querySelector<HTMLElement>('#mv')!.getAttribute('data-movar-content-blurred'),
    ).toBe('ru');
  });

  it('blurs a ytm-compact-video-renderer with a Russian title', () => {
    setBody(`
      <ytm-compact-video-renderer id="cv">
        <a id="video-title">Всё о программировании на русском</a>
      </ytm-compact-video-renderer>
    `);
    expect(applyContentFilter(YT, ['ru'])).toHaveLength(1);
  });

  it('blurs a ytm-rich-item-renderer', () => {
    setBody(`
      <ytm-rich-item-renderer id="ri">
        <a id="video-title">Совершенно русскоязычный контент про программирование</a>
      </ytm-rich-item-renderer>
    `);
    expect(applyContentFilter(YT, ['ru'])).toHaveLength(1);
  });

  it('hides a ytm-reel-shelf-renderer of Russian shorts', () => {
    setBody(`
      <ytm-reel-shelf-renderer id="shelf">
        <a id="video-title">Привет</a>
        <a id="video-title">Хочу</a>
        <a id="video-title">Сейчас</a>
        <a id="video-title">Здравствуйте</a>
      </ytm-reel-shelf-renderer>
    `);
    const hits = applyContentFilter(YT, ['ru']);
    expect(hits).toHaveLength(1);
    expect(hits[0]?.kind).toBe('shorts-shelf');
    expect(document.querySelector<HTMLElement>('#shelf')!.style.display).toBe('none');
  });
});
