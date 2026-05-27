import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  applyContentFilter,
  filterContentByLanguage,
  getFilterForHost,
  revealAllBlurred,
  GOOGLE_SERP_SELECTORS,
  YT_GRID_SELECTORS,
  type ContentFilter,
} from './content-filter';
import { setContentLocale } from './i18n/content';

function setBody(html: string): void {
  document.body.innerHTML = html;
}

const YT = getFilterForHost('www.youtube.com')!;

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
  // render in Ukrainian. Reset to en afterwards — module-level state would
  // leak into later tests otherwise.
  describe('with Ukrainian locale', () => {
    afterAll(() => {
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

describe('applyContentFilter — custom filter shape', () => {
  it('works with a different filter (selectors are data, not hard-coded)', () => {
    const custom: ContentFilter = {
      cardSelectors: ['.result-card'],
      titleSelector: '.title',
      channelSelector: '.author',
    };
    setBody(`
      <div class="result-card">
        <div class="title">Всё о программировании</div>
        <div class="author">Автор</div>
      </div>
    `);
    const blurred = applyContentFilter(custom, ['ru']);
    expect(blurred).toHaveLength(1);
    expect(document.querySelector('.result-card')?.getAttribute('data-movar-content-blurred')).toBe(
      'ru',
    );
  });
});
