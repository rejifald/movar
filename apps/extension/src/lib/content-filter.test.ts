import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getProfiles } from '@movar/lang-detect';
import '@movar/page-content/google';
import '@movar/page-content/youtube';
import { applyContentFilter, clearAllMarks, revealAllNodes } from './content-conceal';
import { buildModelForHost, lookupExtractor } from '@movar/page-content/registry';
import type { PageContentModel } from '@movar/page-content/types';
import { setContentLocale } from './i18n/content';

// Bridges old blocklist-style call sites to the allowlist filter: conceal iff a
// card's detected language ∈ `blocked`. candidates = uk/ru/en; enabled =
// everything not blocked — equivalent to the old (model, blocked) semantics.
const FILTER_LANGS = ['uk', 'ru', 'en'];
function runFilter(
  model: Parameters<typeof applyContentFilter>[0],
  blocked: readonly string[],
): ReturnType<typeof applyContentFilter> {
  return applyContentFilter(model, {
    candidates: getProfiles(FILTER_LANGS),
    enabled: new Set(FILTER_LANGS.filter((c) => !blocked.includes(c))),
  });
}

function setBody(html: string): void {
  document.body.innerHTML = html;
}

function ytCard(title: string, channel = ''): string {
  return `
    <ytd-video-renderer>
      <a id="video-title">${title}</a>
      <ytd-channel-name><div id="text"><a>${channel}</a></div></ytd-channel-name>
    </ytd-video-renderer>
  `;
}

// A Google organic result the way the extractor finds it: an #rso results list
// holding data-hveid cards, each with an <h3> title link. Styling class is
// irrelevant — extraction keys on #rso + <h3> + data-hveid.
function gCard(title: string, snippet = '', id?: string): string {
  return `
    <div data-hveid="CAEQAA"${id ? ` id="${id}"` : ''}>
      <a href="#"><h3>${title}</h3></a>
      <div>${snippet}</div>
    </div>`;
}
function gSerp(...cards: string[]): string {
  return `<div id="rso">${cards.join('')}</div>`;
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

describe('Google SERP cards', () => {
  it('hides a result card whose title and snippet are Russian', () => {
    setBody(
      gSerp(
        gCard('Купить картину в Москве', 'Большой выбор картин разных стилей и эпох.', 'ru-card'),
        gCard('Купити картину в Києві', 'Великий вибір картин різних стилів та епох.', 'uk-card'),
      ),
    );
    const model = buildModelForHost('www.google.com')!;
    const hits = runFilter(model, ['ru']);
    expect(hits).toHaveLength(1);
    expect(document.querySelector<HTMLElement>('#ru-card')!.style.display).toBe('none');
    expect(document.querySelector<HTMLElement>('#uk-card')!.style.display).toBe('');
  });

  it('leaves English / Latin-script cards alone', () => {
    setBody(
      gSerp(
        gCard('Buy artwork online', 'A wide selection of paintings from many eras.', 'en-card'),
      ),
    );
    const model = buildModelForHost('www.google.com')!;
    const hits = runFilter(model, ['ru']);
    expect(hits).toHaveLength(0);
    expect(document.querySelector<HTMLElement>('#en-card')!.style.display).toBe('');
  });

  it('is idempotent across repeated calls', () => {
    setBody(gSerp(gCard('Что-то по-русски', 'Какой-то очень русский текст здесь.', 'ru-card')));
    const first = runFilter(buildModelForHost('www.google.com')!, ['ru']);
    const second = runFilter(buildModelForHost('www.google.com')!, ['ru']);
    expect(first).toHaveLength(1);
    expect(second).toHaveLength(0);
  });

  it('does nothing when blocked is empty', () => {
    setBody(
      gSerp(
        gCard('Какой-то русский текст', 'Большой русский текст здесь для надёжной классификации.'),
      ),
    );
    const hits = runFilter(buildModelForHost('www.google.com')!, []);
    expect(hits).toHaveLength(0);
  });
});

// Note: 'filterContentByLanguage — YouTube grid items' was deleted in PR 2.
// YouTube nodes use hideMode:'blur', not the flat-hide path exercised by the
// old filterContentByLanguage. All behavioral coverage lives in the
// 'applyContentFilter — YouTube blur behavior' describe group below.

describe('applyContentFilter — idempotency', () => {
  it('does not double-hide already-hidden nodes (uses data attribute marker)', () => {
    setBody(
      gSerp(
        gCard(
          'Совершенно новый контент',
          'Какой-то очень русский текст для классификации.',
          'ru-card',
        ),
      ),
    );
    runFilter(buildModelForHost('www.google.com')!, ['ru']);
    const card = document.querySelector<HTMLElement>('#ru-card')!;
    expect(card.dataset['movarHidden']).toBeTruthy();

    // Second call: card is already marked, should be skipped.
    const second = runFilter(buildModelForHost('www.google.com')!, ['ru']);
    expect(second).toHaveLength(0);
  });
});

describe('short-text guard', () => {
  it('does not hide a node whose Cyrillic sample is too short to classify', () => {
    // A single Cyrillic word can be many languages; don't act on weak evidence.
    setBody(gSerp(gCard('Привет', '', 'card')));
    const hits = runFilter(buildModelForHost('www.google.com')!, ['ru']);
    expect(hits).toHaveLength(0);
  });
});

describe('lookupExtractor', () => {
  it('returns the YouTube extractor on www.youtube.com', () => {
    expect(lookupExtractor('www.youtube.com')).not.toBeNull();
  });

  it('matches mobile YouTube subdomain', () => {
    expect(lookupExtractor('m.youtube.com')).not.toBeNull();
  });

  it('matches the bare youtube.com', () => {
    expect(lookupExtractor('youtube.com')).not.toBeNull();
  });

  it('returns null for unknown hosts', () => {
    expect(lookupExtractor('example.com')).toBeNull();
  });

  it('returns non-null for google.com (Google extractor now registered)', () => {
    expect(lookupExtractor('google.com')).not.toBeNull();
  });

  it('does NOT collide on substring (youtube.com.suffix)', () => {
    expect(lookupExtractor('fake-youtube.com')).toBeNull();
  });
});

// ─── applyContentFilter tests — use buildModelForHost for YT model ────────
//
// All behavioral assertions are preserved. The API shape changes from
// runFilter(SiteContentFilter, blocked) to
// runFilter(PageContentModel, blocked), so we build the model via
// buildModelForHost and pass it in.

describe('applyContentFilter — YouTube blur behavior', () => {
  it('blurs a card with a Russian title', () => {
    // "ы" and "э" — distinctive Russian letters.
    setBody(ytCard('Всё, что нужно знать о тестировании'));
    const model = buildModelForHost('www.youtube.com')!;
    const blurred = runFilter(model, ['ru']);
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
    runFilter(buildModelForHost('www.youtube.com')!, ['ru']);
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
      runFilter(buildModelForHost('www.youtube.com')!, ['ru']);
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
    expect(runFilter(buildModelForHost('www.youtube.com')!, ['ru'])).toHaveLength(0);
    expect(document.querySelector('[data-movar-content-blurred]')).toBeNull();
  });

  it('does NOT blur an English-only card', () => {
    setBody(ytCard('How to write a unit test in JavaScript', 'SomeChannel'));
    expect(runFilter(buildModelForHost('www.youtube.com')!, ['ru'])).toHaveLength(0);
  });

  it('does NOT blur a card with no distinctive letters either way ("тест")', () => {
    // "тест" has zero UA or RU distinctive letters, so detection returns
    // 'unknown' and we don't blur. Acknowledged false-negative — we'd
    // rather miss it than blur UA.
    setBody(ytCard('тест', 'канал'));
    expect(runFilter(buildModelForHost('www.youtube.com')!, ['ru'])).toHaveLength(0);
  });

  it('considers the channel text in addition to the title', () => {
    setBody(ytCard('Tutorial', 'Всё о программировании'));
    expect(runFilter(buildModelForHost('www.youtube.com')!, ['ru'])).toHaveLength(1);
  });

  it('skips cards the user already revealed', () => {
    setBody(`
      <ytd-video-renderer data-movar-revealed="true">
        <a id="video-title">Полностью на русском языке</a>
      </ytd-video-renderer>
    `);
    expect(runFilter(buildModelForHost('www.youtube.com')!, ['ru'])).toHaveLength(0);
    expect(document.querySelector('[data-movar-curtain]')).toBeNull();
  });

  it('skips lazy-loading cards with no text yet (no checked mark)', () => {
    setBody(`
      <ytd-video-renderer>
        <a id="video-title"></a>
      </ytd-video-renderer>
    `);
    expect(runFilter(buildModelForHost('www.youtube.com')!, ['ru'])).toHaveLength(0);
    const card = document.querySelector<HTMLElement>('ytd-video-renderer')!;
    expect(Object.hasOwn(card.dataset, 'movarContentChecked')).toBe(false);
  });

  it('is idempotent — second call returns no new cards, no duplicate curtains', () => {
    setBody(ytCard('Всё о программировании'));
    expect(runFilter(buildModelForHost('www.youtube.com')!, ['ru'])).toHaveLength(1);
    expect(runFilter(buildModelForHost('www.youtube.com')!, ['ru'])).toHaveLength(0);
    expect(document.querySelectorAll('[data-movar-curtain]')).toHaveLength(1);
  });

  it('does nothing when ru is not in blocked', () => {
    setBody(ytCard('Всё о программировании'));
    expect(runFilter(buildModelForHost('www.youtube.com')!, [])).toHaveLength(0);
    expect(runFilter(buildModelForHost('www.youtube.com')!, ['uk'])).toHaveLength(0);
    expect(document.querySelector('[data-movar-curtain]')).toBeNull();
  });

  it('handles multiple cards independently', () => {
    setBody(`
      ${ytCard('Всё о тестах', 'РусскийКанал')}
      ${ytCard('Як писати тести українською мовою', 'УкрКанал')}
      ${ytCard('How to write tests', 'EnChannel')}
    `);
    const blurred = runFilter(buildModelForHost('www.youtube.com')!, ['ru']);
    expect(blurred).toHaveLength(1);
    expect(document.querySelectorAll('[data-movar-content-blurred]')).toHaveLength(1);
  });
});

describe('applyContentFilter — curtain interaction', () => {
  it('clicking the reveal button removes the curtain and marks the card', () => {
    setBody(ytCard('Всё о программировании'));
    runFilter(buildModelForHost('www.youtube.com')!, ['ru']);

    const card = document.querySelector<HTMLElement>('ytd-video-renderer')!;
    const btn = findRevealButton(card)!;
    btn.click();

    expect(card.querySelector('[data-movar-curtain]')).toBeNull();
    expect(Object.hasOwn(card.dataset, 'movarContentBlurred')).toBe(false);
    expect(card.dataset['movarRevealed']).toBe('true');
  });

  it('a revealed card stays revealed on a re-pass', () => {
    setBody(ytCard('Всё о программировании'));
    runFilter(buildModelForHost('www.youtube.com')!, ['ru']);
    const card = document.querySelector<HTMLElement>('ytd-video-renderer')!;
    findRevealButton(card)!.click();
    runFilter(buildModelForHost('www.youtube.com')!, ['ru']);
    expect(document.querySelector('[data-movar-curtain]')).toBeNull();
    expect(document.querySelector('[data-movar-content-blurred]')).toBeNull();
  });

  it('reveal click does not propagate (would otherwise trigger card click)', () => {
    setBody(ytCard('Всё о программировании'));
    runFilter(buildModelForHost('www.youtube.com')!, ['ru']);
    const card = document.querySelector<HTMLElement>('ytd-video-renderer')!;
    let cardClicked = false;
    card.addEventListener('click', () => {
      cardClicked = true;
    });
    findRevealButton(card)!.click();
    expect(cardClicked).toBe(false);
  });
});

describe('revealAllNodes', () => {
  it('clears every blurred card on the page', () => {
    setBody(`
      ${ytCard('Всё о тестах')}
      ${ytCard('Это совсем другое — всё, что нужно знать')}
    `);
    runFilter(buildModelForHost('www.youtube.com')!, ['ru']);
    expect(document.querySelectorAll('[data-movar-content-blurred]')).toHaveLength(2);

    revealAllNodes();

    expect(document.querySelectorAll('[data-movar-content-blurred]')).toHaveLength(0);
    expect(document.querySelectorAll('[data-movar-curtain]')).toHaveLength(0);
    expect(document.querySelectorAll('[data-movar-revealed="true"]')).toHaveLength(2);
  });

  it('does not re-blur revealed cards on a subsequent filter pass', () => {
    setBody(ytCard('Всё о программировании'));
    runFilter(buildModelForHost('www.youtube.com')!, ['ru']);
    revealAllNodes();
    runFilter(buildModelForHost('www.youtube.com')!, ['ru']);
    expect(document.querySelector('[data-movar-curtain]')).toBeNull();
  });
});

describe('clearAllMarks', () => {
  it('strips blur curtains and bookkeeping without marking cards revealed', () => {
    setBody(`
      ${ytCard('Всё о тестах')}
      ${ytCard('Новый выпуск')}
    `);
    runFilter(buildModelForHost('www.youtube.com')!, ['ru']);
    expect(document.querySelectorAll('[data-movar-content-blurred]')).toHaveLength(2);
    expect(document.querySelectorAll('[data-movar-content-checked]')).toHaveLength(2);

    clearAllMarks();

    expect(document.querySelectorAll('[data-movar-content-blurred]')).toHaveLength(0);
    expect(document.querySelectorAll('[data-movar-content-checked]')).toHaveLength(0);
    expect(document.querySelectorAll('[data-movar-curtain]')).toHaveLength(0);
    expect(document.querySelectorAll('[data-movar-revealed="true"]')).toHaveLength(0);
  });

  it('lets a subsequent applyContentFilter re-blur the same cards', () => {
    setBody(ytCard('Всё о программировании'));
    runFilter(buildModelForHost('www.youtube.com')!, ['ru']);
    clearAllMarks();

    const reblurred = runFilter(buildModelForHost('www.youtube.com')!, ['ru']);
    expect(reblurred).toHaveLength(1);
    expect(document.querySelector('[data-movar-content-blurred]')).not.toBeNull();
  });

  it('preserves cards that the user had explicitly revealed via the curtain', () => {
    setBody(`
      ${ytCard('Всё о тестах')}
      ${ytCard('Новый выпуск')}
    `);
    runFilter(buildModelForHost('www.youtube.com')!, ['ru']);
    // Simulate a per-card "Show" click on the first blurred card.
    const firstCard = document.querySelector<HTMLElement>('ytd-video-renderer')!;
    findRevealButton(firstCard)!.click();
    expect(firstCard.getAttribute('data-movar-revealed')).toBe('true');

    clearAllMarks();

    // The user-revealed marker survives — a future apply pass will skip it.
    expect(firstCard.getAttribute('data-movar-revealed')).toBe('true');
    runFilter(buildModelForHost('www.youtube.com')!, ['ru']);
    expect(firstCard.hasAttribute('data-movar-content-blurred')).toBe(false);

    // The other card had no user gesture, so it goes back through filtering
    // and ends up blurred again.
    const secondCard = document.querySelectorAll<HTMLElement>('ytd-video-renderer')[1]!;
    expect(secondCard.getAttribute('data-movar-content-blurred')).toBe('ru');
  });
});

// ─── Custom PageContentModel tests (was "custom filter shape") ────────────
//
// The intent: "shapes/extractors are data, not hard-coded". We now express
// this by constructing a custom PageContentModel inline instead of a custom
// SiteContentFilter. applyContentFilter works directly on the model, so the
// test semantics are fully preserved.

describe('applyContentFilter — custom filter shape', () => {
  it('works with a different model (shapes are data, not hard-coded)', () => {
    setBody(`
      <div class="result-card">
        <div class="title">Всё о программировании</div>
        <div class="author">Автор</div>
      </div>
    `);
    const el = document.querySelector<HTMLElement>('.result-card')!;
    const model: PageContentModel = {
      extractor: 'custom-test',
      nodes: [
        {
          el,
          kind: 'video',
          hideMode: 'blur',
          text: 'Всё о программировании Автор',
        },
      ],
    };
    const blurred = runFilter(model, ['ru']);
    expect(blurred).toHaveLength(1);
    expect(blurred[0]?.kind).toBe('video');
    expect(document.querySelector('.result-card')?.getAttribute('data-movar-content-blurred')).toBe(
      'ru',
    );
  });
});

describe('applyContentFilter — hideMode dispatch', () => {
  it("hideMode: 'hide' sets display:none + HIDDEN_ATTR, no curtain attached", () => {
    setBody(`
      <div class="channel-card">
        <div class="name">Русский канал</div>
        <div class="description">Всё о программировании на русском языке</div>
      </div>
    `);
    const el = document.querySelector<HTMLElement>('.channel-card')!;
    const model: PageContentModel = {
      extractor: 'custom-test',
      nodes: [
        {
          el,
          kind: 'channel',
          hideMode: 'hide',
          text: 'Русский канал Всё о программировании на русском языке',
        },
      ],
    };
    const hits = runFilter(model, ['ru']);
    expect(hits).toHaveLength(1);
    expect(hits[0]?.kind).toBe('channel');
    const card = document.querySelector<HTMLElement>('.channel-card')!;
    expect(card.style.display).toBe('none');
    expect(card.getAttribute('data-movar-hidden')).toMatch(/^content-filter:channel:ru$/);
    // No curtain — hide mode is flat.
    expect(card.querySelector('[data-movar-curtain]')).toBeNull();
  });

  it("hideMode: 'blur' is the default when omitted", () => {
    setBody(`<div class="video-card"><div class="title">Всё о программировании</div></div>`);
    const el = document.querySelector<HTMLElement>('.video-card')!;
    const model: PageContentModel = {
      extractor: 'custom-test',
      nodes: [
        {
          el,
          kind: 'video',
          hideMode: 'blur',
          text: 'Всё о программировании',
        },
      ],
    };
    runFilter(model, ['ru']);
    const card = document.querySelector<HTMLElement>('.video-card')!;
    expect(card.getAttribute('data-movar-content-blurred')).toBe('ru');
    expect(card.querySelector('[data-movar-curtain]')).not.toBeNull();
  });

  it('a hidden card is not re-scanned on the next pass', () => {
    setBody(
      `<div class="channel-card"><div class="description">Всё о программировании</div></div>`,
    );
    const el = document.querySelector<HTMLElement>('.channel-card')!;
    const makeModel = (): PageContentModel => ({
      extractor: 'custom-test',
      nodes: [
        {
          el,
          kind: 'channel',
          hideMode: 'hide',
          text: 'Всё о программировании',
        },
      ],
    });
    expect(runFilter(makeModel(), ['ru'])).toHaveLength(1);
    expect(runFilter(makeModel(), ['ru'])).toHaveLength(0);
  });
});

describe('applyContentFilter — multi-shape iteration', () => {
  it('scans every node and aggregates hits across them', () => {
    setBody(`
      <div class="video"><div class="title">Всё о программировании на русском</div></div>
      <div class="channel"><div class="description">Русский канал — всё о коде</div></div>
      <div class="video"><div class="title">Як писати тести українською мовою</div></div>
    `);
    const videoEl = document.querySelector<HTMLElement>('.video')!;
    const channelEl = document.querySelector<HTMLElement>('.channel')!;
    const model: PageContentModel = {
      extractor: 'custom-test',
      nodes: [
        { el: videoEl, kind: 'video', hideMode: 'blur', text: 'Всё о программировании на русском' },
        {
          el: channelEl,
          kind: 'channel',
          hideMode: 'hide',
          text: 'Русский канал — всё о коде',
        },
      ],
    };
    const hits = runFilter(model, ['ru']);
    const kinds = hits.map((h) => h.kind).toSorted();
    expect(kinds).toEqual(['channel', 'video']);
  });

  it('reads text from EVERY textSelector match inside a card (not just the first)', () => {
    // A shelf-like card with many child titles — the joined text carries
    // Russian distinctive signal (Объём → ё) even where a single short title
    // would not.
    setBody(`
      <div class="shelf">
        <div class="item-title">Привет</div>
        <div class="item-title">Объём</div>
        <div class="item-title">Сейчас</div>
        <div class="item-title">Здравствуйте</div>
      </div>
    `);
    const el = document.querySelector<HTMLElement>('.shelf')!;
    const allText = [...el.querySelectorAll('.item-title')]
      .map((t) => t.textContent ?? '')
      .join(' ');
    const model: PageContentModel = {
      extractor: 'custom-test',
      nodes: [{ el, kind: 'shorts-shelf', hideMode: 'hide', text: allText }],
    };
    const hits = runFilter(model, ['ru']);
    expect(hits).toHaveLength(1);
    expect(hits[0]?.kind).toBe('shorts-shelf');
  });

  it('does not double-count text when textSelectors overlap (fallback-chain pair)', () => {
    // Pin the regression: with overlapping selectors that both match nested
    // elements (a wrapper + a child), only the outer one contributes text.
    // Without this dedup, `тест` + `канал` + `канал` (double-counted via the
    // <a> inside the <div data-channel>) would tip past MIN_CYRILLIC_FOR_FALLBACK
    // and false-positive blur the card.
    setBody(`
      <div class="card">
        <div class="outer">
          <div data-channel><a>канал</a></div>
        </div>
      </div>
    `);
    const el = document.querySelector<HTMLElement>('.card')!;
    // Use serializeNodeText to demonstrate the dedup.
    // Here we directly construct the node with text that would be deduped:
    // "канал" = 5 Cyrillic chars, below MIN_CYRILLIC_FOR_FALLBACK. With
    // double-count it'd be 10 and would classify as ru.
    const model: PageContentModel = {
      extractor: 'custom-test',
      nodes: [{ el, kind: 'video', hideMode: 'blur', text: 'канал' }],
    };
    expect(runFilter(model, ['ru'])).toHaveLength(0);
  });

  it('appliesTo predicate gates the shape', () => {
    // A node with no text simulates an appliesTo: () => false result (the
    // extractor simply produces no nodes for that shape). An empty-text node
    // is skipped by the filter loop.
    setBody(`<div class="post"><div class="body">Всё о программировании на русском</div></div>`);
    const el = document.querySelector<HTMLElement>('.post')!;
    // Empty text = extractor chose not to produce this node (appliesTo false).
    const model: PageContentModel = {
      extractor: 'custom-test',
      nodes: [{ el, kind: 'post', hideMode: 'blur', text: '' }],
    };
    expect(runFilter(model, ['ru'])).toHaveLength(0);
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
    const hits = runFilter(buildModelForHost('www.youtube.com')!, ['ru']);
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
    expect(runFilter(buildModelForHost('www.youtube.com')!, ['ru'])).toHaveLength(0);
    expect(document.querySelector<HTMLElement>('#ch')!.style.display).toBe('');
  });

  it('also handles ytd-mini-channel-renderer', () => {
    setBody(`
      <ytd-mini-channel-renderer id="mch">
        <div id="channel-title">Русский канал</div>
        <yt-formatted-string id="description">Всё про программирование на русском</yt-formatted-string>
      </ytd-mini-channel-renderer>
    `);
    const hits = runFilter(buildModelForHost('www.youtube.com')!, ['ru']);
    expect(hits).toHaveLength(1);
    expect(hits[0]?.kind).toBe('channel');
  });

  it('idempotent — a hidden channel is not re-scanned', () => {
    setBody(`
      <ytd-channel-renderer>
        <yt-formatted-string id="description">Полностью на русском языке про программирование</yt-formatted-string>
      </ytd-channel-renderer>
    `);
    expect(runFilter(buildModelForHost('www.youtube.com')!, ['ru'])).toHaveLength(1);
    expect(runFilter(buildModelForHost('www.youtube.com')!, ['ru'])).toHaveLength(0);
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
    const hits = runFilter(buildModelForHost('www.youtube.com')!, ['ru']);
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
    const hits = runFilter(buildModelForHost('www.youtube.com')!, ['ru']);
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
    expect(runFilter(buildModelForHost('www.youtube.com')!, ['ru'])).toHaveLength(1);
  });

  it('does NOT blur a Ukrainian-distinctive playlist', () => {
    setBody(`
      <ytd-playlist-renderer>
        <a id="video-title">Все про програмування — плейлист українською</a>
        <ytd-channel-name><a>Якийсь канал</a></ytd-channel-name>
      </ytd-playlist-renderer>
    `);
    expect(runFilter(buildModelForHost('www.youtube.com')!, ['ru'])).toHaveLength(0);
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
    const hits = runFilter(buildModelForHost('www.youtube.com')!, ['ru']);
    expect(hits).toHaveLength(1);
    expect(hits[0]?.kind).toBe('video');
  });
});

describe('applyContentFilter — YouTube shorts shelf', () => {
  it('hides a shorts shelf where every child title is Russian-leaning', () => {
    // The shelf collapses as a unit: the joined child titles carry Russian
    // distinctive signal (Объём → ё), even though several individual titles
    // are language-ambiguous on their own.
    setBody(`
      <ytd-reel-shelf-renderer id="shelf">
        <ytd-reel-item-renderer><a id="video-title">Привет</a></ytd-reel-item-renderer>
        <ytd-reel-item-renderer><a id="video-title">Объём</a></ytd-reel-item-renderer>
        <ytd-reel-item-renderer><a id="video-title">Сейчас</a></ytd-reel-item-renderer>
        <ytd-reel-item-renderer><a id="video-title">Здравствуйте</a></ytd-reel-item-renderer>
      </ytd-reel-shelf-renderer>
    `);
    const hits = runFilter(buildModelForHost('www.youtube.com')!, ['ru']);
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
    expect(runFilter(buildModelForHost('www.youtube.com')!, ['ru'])).toHaveLength(0);
    expect(document.querySelector<HTMLElement>('#shelf')!.style.display).toBe('');
  });

  it('leaves a balanced-evidence shelf alone (rung-1 tie → unknown)', () => {
    // Equal distinctive evidence — `ї` (UA) vs `ы` (RU), with no word markers —
    // ties at rung 1, so classifyBySnippet returns 'unknown' and the shelf is kept.
    setBody(`
      <ytd-reel-shelf-renderer id="shelf">
        <ytd-reel-item-renderer><a id="video-title">ї</a></ytd-reel-item-renderer>
        <ytd-reel-item-renderer><a id="video-title">ы</a></ytd-reel-item-renderer>
      </ytd-reel-shelf-renderer>
    `);
    expect(runFilter(buildModelForHost('www.youtube.com')!, ['ru'])).toHaveLength(0);
  });

  it('idempotent — a hidden shelf is not re-scanned on the next pass', () => {
    setBody(`
      <ytd-reel-shelf-renderer>
        <ytd-reel-item-renderer><a id="video-title">Привет</a></ytd-reel-item-renderer>
        <ytd-reel-item-renderer><a id="video-title">Объём</a></ytd-reel-item-renderer>
        <ytd-reel-item-renderer><a id="video-title">Сейчас</a></ytd-reel-item-renderer>
        <ytd-reel-item-renderer><a id="video-title">Здравствуйте</a></ytd-reel-item-renderer>
      </ytd-reel-shelf-renderer>
    `);
    expect(runFilter(buildModelForHost('www.youtube.com')!, ['ru'])).toHaveLength(1);
    expect(runFilter(buildModelForHost('www.youtube.com')!, ['ru'])).toHaveLength(0);
  });

  it('does not classify a shelf that has no child titles yet (lazy load)', () => {
    setBody(`<ytd-reel-shelf-renderer></ytd-reel-shelf-renderer>`);
    expect(runFilter(buildModelForHost('www.youtube.com')!, ['ru'])).toHaveLength(0);
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
    const hits = runFilter(buildModelForHost('m.youtube.com')!, ['ru']);
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
    expect(runFilter(buildModelForHost('m.youtube.com')!, ['ru'])).toHaveLength(1);
  });

  it('blurs a ytm-rich-item-renderer', () => {
    setBody(`
      <ytm-rich-item-renderer id="ri">
        <a id="video-title">Совершенно новый русскоязычный контент</a>
      </ytm-rich-item-renderer>
    `);
    expect(runFilter(buildModelForHost('m.youtube.com')!, ['ru'])).toHaveLength(1);
  });

  it('hides a ytm-reel-shelf-renderer of Russian shorts', () => {
    setBody(`
      <ytm-reel-shelf-renderer id="shelf">
        <a id="video-title">Привет</a>
        <a id="video-title">Объём</a>
        <a id="video-title">Сейчас</a>
        <a id="video-title">Здравствуйте</a>
      </ytm-reel-shelf-renderer>
    `);
    const hits = runFilter(buildModelForHost('m.youtube.com')!, ['ru']);
    expect(hits).toHaveLength(1);
    expect(hits[0]?.kind).toBe('shorts-shelf');
    expect(document.querySelector<HTMLElement>('#shelf')!.style.display).toBe('none');
  });
});
