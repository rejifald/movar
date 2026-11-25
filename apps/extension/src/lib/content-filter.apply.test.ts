import { afterEach, describe, expect, it, vi } from 'vitest';
import '@movar/page-content/google';
import '@movar/page-content/youtube';
import { teardownContentModification } from './content-modification';
import { buildModelForHost, lookupExtractor } from '@movar/page-content/registry';
import type { PageContentModel } from '@movar/page-content/types';
import { loadContentMessages, setContentLocale } from './i18n/content';
import { contentStringsUk } from './i18n/content-strings-uk';
import { testContentPresenter } from './dom.test-utils';
import {
  spySendMessage,
  runFilter,
  setBody,
  ytCard,
  gCard,
  gSerp,
  findRevealButton,
} from './content-filter.test-utils';

describe('applyContentFilter — idempotency', () => {
  it('does not double-curtain already-curtained nodes (uses data attribute marker)', async () => {
    setBody(
      gSerp(
        gCard(
          'Совершенно новый контент',
          'Какой-то очень русский текст для классификации.',
          'ru-card',
        ),
      ),
    );
    await runFilter(buildModelForHost('www.google.com')!, ['ru']);
    const card = document.querySelector<HTMLElement>('#ru-card')!;
    expect(card.dataset['movarContentBlurred']).toBeTruthy();

    // Second call: card is already marked, should be skipped.
    const second = await runFilter(buildModelForHost('www.google.com')!, ['ru']);
    expect(second).toHaveLength(0);
  });
});

describe('short-text guard', () => {
  it('does not hide a node whose Cyrillic sample is too short to classify', async () => {
    // A single Cyrillic word can be many languages; don't act on weak evidence.
    setBody(gSerp(gCard('Привет', '', 'card')));
    const hits = await runFilter(buildModelForHost('www.google.com')!, ['ru']);
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

// ─── AI Overview — declared-language evidence (data-rl) ───────────────────

describe('applyContentFilter — custom filter shape', () => {
  it('works with a different model (shapes are data, not hard-coded)', async () => {
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
    const blurred = await runFilter(model, ['ru']);
    expect(blurred).toHaveLength(1);
    expect(blurred[0]?.kind).toBe('video');
    expect(document.querySelector('.result-card')?.getAttribute('data-movar-content-blurred')).toBe(
      'ru',
    );
  });
});

describe('applyContentFilter — conceal-mode dispatch', () => {
  it("concealMode: 'hide' sets display:none + HIDDEN_ATTR, no curtain attached", async () => {
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
    const hits = await runFilter(model, ['ru'], 'hide');
    expect(hits).toHaveLength(1);
    expect(hits[0]?.kind).toBe('channel');
    const card = document.querySelector<HTMLElement>('.channel-card')!;
    expect(card.style.display).toBe('none');
    expect(card.getAttribute('data-movar-hidden')).toMatch(/^content-filter:channel:ru$/);
    // No curtain — hide mode is flat.
    expect(card.querySelector('[data-movar-curtain]')).toBeNull();
  });

  it("hideMode: 'blur' is the default when omitted", async () => {
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
    await runFilter(model, ['ru']);
    const card = document.querySelector<HTMLElement>('.video-card')!;
    expect(card.getAttribute('data-movar-content-blurred')).toBe('ru');
    expect(card.querySelector('[data-movar-curtain]')).not.toBeNull();
  });

  it('a hidden card is not re-scanned on the next pass', async () => {
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
    expect(await runFilter(makeModel(), ['ru'])).toHaveLength(1);
    expect(await runFilter(makeModel(), ['ru'])).toHaveLength(0);
  });
});

describe('applyContentFilter — multi-shape iteration', () => {
  it('scans every node and aggregates hits across them', async () => {
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
    const hits = await runFilter(model, ['ru']);
    const kinds = hits.map((h) => h.kind).toSorted();
    expect(kinds).toEqual(['channel', 'video']);
  });

  it('reads text from EVERY textSelector match inside a card (not just the first)', async () => {
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
    const allText = [...el.querySelectorAll('.item-title')].map((t) => t.textContent).join(' ');
    const model: PageContentModel = {
      extractor: 'custom-test',
      nodes: [{ el, kind: 'shorts-shelf', hideMode: 'hide', text: allText }],
    };
    const hits = await runFilter(model, ['ru']);
    expect(hits).toHaveLength(1);
    expect(hits[0]?.kind).toBe('shorts-shelf');
  });

  it('does not double-count text when textSelectors overlap (fallback-chain pair)', async () => {
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
    expect(await runFilter(model, ['ru'])).toHaveLength(0);
  });

  it('appliesTo predicate gates the shape', async () => {
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
    expect(await runFilter(model, ['ru'])).toHaveLength(0);
  });
});

// ─── YouTube non-video shapes ────────────────────────────────────────────

// Mid-session UI-language switch: curtains already on the page baked their
// catalogue strings into shadow DOM at build time, so the content script's
// relocalise path (setContentLocale → refetch the worker's strings → teardown →
// re-apply) has to tear the stale-language concealment down and rebuild it. This
// proves the rebuild re-renders in the new locale and leaves no stale duplicate
// curtain behind — the DOM half of installSettingsListener's locale-change
// branch (the decision half — "did the resolved locale change?" — lives in
// resolve.test.ts).
describe('locale switch rebuilds existing curtains', () => {
  afterEach(() => {
    setContentLocale('en');
    vi.restoreAllMocks();
  });

  it('re-renders an English curtain in Ukrainian with no stale duplicate', async () => {
    setContentLocale('en');
    setBody(ytCard('Всё, что нужно знать о тестировании'));
    await runFilter(buildModelForHost('www.youtube.com')!, ['ru']);
    const card = document.querySelector<HTMLElement>('ytd-video-renderer')!;
    expect(findRevealButton(card)?.textContent).toBe('Show');
    expect(document.querySelectorAll('[data-movar-curtain]')).toHaveLength(1);

    // The relocalise sequence the settings listener triggers on a uiLanguage
    // change: switch locale (drops the cache), refetch the worker's uk strings,
    // tear the stale concealment down, then re-apply.
    spySendMessage().mockResolvedValue(contentStringsUk);
    setContentLocale('uk');
    await loadContentMessages();
    teardownContentModification(testContentPresenter);
    await runFilter(buildModelForHost('www.youtube.com')!, ['ru']);

    const rebuilt = document.querySelector<HTMLElement>('ytd-video-renderer')!;
    // Old curtain detached, exactly one fresh curtain in its place.
    expect(document.querySelectorAll('[data-movar-curtain]')).toHaveLength(1);
    expect(findRevealButton(rebuilt)?.textContent).toBe('Показати');
    const desc = rebuilt
      .querySelector<HTMLElement>('[data-movar-curtain]')!
      .shadowRoot!.querySelector('.pill__description');
    expect(desc?.textContent).toContain('Російською');
  });
});
