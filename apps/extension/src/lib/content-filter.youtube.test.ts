import { afterEach, describe, expect, it, vi } from 'vitest';
import '@movar/page-content/google';
import '@movar/page-content/youtube';
import { buildModelForHost } from '@movar/page-content/registry';
import { loadContentMessages, setContentLocale } from './i18n/content';
import { contentStringsUk } from './i18n/content-strings-uk';
import {
  spySendMessage,
  runFilter,
  setBody,
  ytCard,
  findRevealButton,
} from './content-filter.test-utils';

describe('applyContentFilter — YouTube blur behavior', () => {
  it('blurs a card with a Russian title', async () => {
    // "ы" and "э" — distinctive Russian letters.
    setBody(ytCard('Всё, что нужно знать о тестировании'));
    const model = buildModelForHost('www.youtube.com')!;
    const blurred = await runFilter(model, ['ru']);
    expect(blurred).toHaveLength(1);
    const card = document.querySelector<HTMLElement>('ytd-video-renderer')!;
    expect(card.dataset['movarContentBlurred']).toBe('ru');
    expect(card.querySelector('[data-movar-curtain]')).not.toBeNull();
    // Default locale in tests is English; the localised path is exercised in
    // a dedicated describe below.
    expect(findRevealButton(card)?.textContent).toBe('Show');
  });

  it('shows the language reason in the curtain description', async () => {
    setBody(ytCard('Всё, что нужно знать о тестировании'));
    await runFilter(buildModelForHost('www.youtube.com')!, ['ru']);
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
      vi.restoreAllMocks();
    });

    it('renders the reveal button and description in Ukrainian', async () => {
      // Non-English locales load their curtain strings from the worker; stub the
      // reply so loadContentMessages caches Ukrainian before the curtain builds.
      spySendMessage().mockResolvedValue(contentStringsUk);
      setContentLocale('uk');
      await loadContentMessages();
      setBody(ytCard('Всё, что нужно знать о тестировании'));
      await runFilter(buildModelForHost('www.youtube.com')!, ['ru']);
      const card = document.querySelector<HTMLElement>('ytd-video-renderer')!;
      const host = card.querySelector<HTMLElement>('[data-movar-curtain]')!;
      expect(findRevealButton(card)?.textContent).toBe('Показати');
      expect(host.shadowRoot!.querySelector('.pill__description')?.textContent).toContain(
        'Російською',
      );
    });
  });

  it('does NOT blur a card with a Ukrainian-distinctive title', async () => {
    // "і", "ї", "є" — distinctive Ukrainian letters.
    setBody(ytCard('Як зробити тест українською мовою'));
    expect(await runFilter(buildModelForHost('www.youtube.com')!, ['ru'])).toHaveLength(0);
    expect(document.querySelector('[data-movar-content-blurred]')).toBeNull();
  });

  it('does NOT blur an English-only card', async () => {
    setBody(ytCard('How to write a unit test in JavaScript', 'SomeChannel'));
    expect(await runFilter(buildModelForHost('www.youtube.com')!, ['ru'])).toHaveLength(0);
  });

  it('does NOT blur a card with no distinctive letters either way ("тест")', async () => {
    // "тест" has zero UA or RU distinctive letters, so detection returns
    // 'unknown' and we don't blur. Acknowledged false-negative — we'd
    // rather miss it than blur UA.
    setBody(ytCard('тест', 'канал'));
    expect(await runFilter(buildModelForHost('www.youtube.com')!, ['ru'])).toHaveLength(0);
  });

  it('considers the channel text in addition to the title', async () => {
    setBody(ytCard('Tutorial', 'Всё о программировании'));
    expect(await runFilter(buildModelForHost('www.youtube.com')!, ['ru'])).toHaveLength(1);
  });

  it('skips cards the user already revealed', async () => {
    setBody(`
      <ytd-video-renderer data-movar-revealed="true">
        <a id="video-title">Полностью на русском языке</a>
      </ytd-video-renderer>
    `);
    expect(await runFilter(buildModelForHost('www.youtube.com')!, ['ru'])).toHaveLength(0);
    expect(document.querySelector('[data-movar-curtain]')).toBeNull();
  });

  it('skips lazy-loading cards with no text yet (no checked mark)', async () => {
    setBody(`
      <ytd-video-renderer>
        <a id="video-title"></a>
      </ytd-video-renderer>
    `);
    expect(await runFilter(buildModelForHost('www.youtube.com')!, ['ru'])).toHaveLength(0);
    const card = document.querySelector<HTMLElement>('ytd-video-renderer')!;
    expect(Object.hasOwn(card.dataset, 'movarContentChecked')).toBe(false);
  });

  it('is idempotent — second call returns no new cards, no duplicate curtains', async () => {
    setBody(ytCard('Всё о программировании'));
    expect(await runFilter(buildModelForHost('www.youtube.com')!, ['ru'])).toHaveLength(1);
    expect(await runFilter(buildModelForHost('www.youtube.com')!, ['ru'])).toHaveLength(0);
    expect(document.querySelectorAll('[data-movar-curtain]')).toHaveLength(1);
  });

  it('does nothing when ru is not in blocked', async () => {
    setBody(ytCard('Всё о программировании'));
    expect(await runFilter(buildModelForHost('www.youtube.com')!, [])).toHaveLength(0);
    expect(await runFilter(buildModelForHost('www.youtube.com')!, ['uk'])).toHaveLength(0);
    expect(document.querySelector('[data-movar-curtain]')).toBeNull();
  });

  it('handles multiple cards independently', async () => {
    setBody(`
      ${ytCard('Всё о тестах', 'РусскийКанал')}
      ${ytCard('Як писати тести українською мовою', 'УкрКанал')}
      ${ytCard('How to write tests', 'EnChannel')}
    `);
    const blurred = await runFilter(buildModelForHost('www.youtube.com')!, ['ru']);
    expect(blurred).toHaveLength(1);
    expect(document.querySelectorAll('[data-movar-content-blurred]')).toHaveLength(1);
  });
});

describe('applyContentFilter — YouTube channel cards', () => {
  it('curtains a channel card with a Russian description', async () => {
    setBody(`
      <ytd-channel-renderer id="ch">
        <div id="channel-title">Сегодня</div>
        <yt-formatted-string id="description">Канал о русской культуре и истории — выпуски каждую неделю.</yt-formatted-string>
      </ytd-channel-renderer>
    `);
    const hits = await runFilter(buildModelForHost('www.youtube.com')!, ['ru']);
    expect(hits).toHaveLength(1);
    expect(hits[0]?.kind).toBe('channel');
    const card = document.querySelector<HTMLElement>('#ch')!;
    expect(card.style.display).toBe('');
    expect(card.getAttribute('data-movar-content-blurred')).toBe('ru');
    expect(card.querySelector('[data-movar-curtain]')).not.toBeNull();
  });

  it('does NOT hide a Ukrainian-distinctive channel description', async () => {
    setBody(`
      <ytd-channel-renderer id="ch">
        <div id="channel-title">Сьогодні</div>
        <yt-formatted-string id="description">Канал про українську культуру та історію — випуски щотижня.</yt-formatted-string>
      </ytd-channel-renderer>
    `);
    expect(await runFilter(buildModelForHost('www.youtube.com')!, ['ru'])).toHaveLength(0);
    expect(document.querySelector<HTMLElement>('#ch')!.style.display).toBe('');
  });

  it('also handles ytd-mini-channel-renderer', async () => {
    setBody(`
      <ytd-mini-channel-renderer id="mch">
        <div id="channel-title">Русский канал</div>
        <yt-formatted-string id="description">Всё про программирование на русском</yt-formatted-string>
      </ytd-mini-channel-renderer>
    `);
    const hits = await runFilter(buildModelForHost('www.youtube.com')!, ['ru']);
    expect(hits).toHaveLength(1);
    expect(hits[0]?.kind).toBe('channel');
  });

  it('idempotent — a hidden channel is not re-scanned', async () => {
    setBody(`
      <ytd-channel-renderer>
        <yt-formatted-string id="description">Полностью на русском языке про программирование</yt-formatted-string>
      </ytd-channel-renderer>
    `);
    expect(await runFilter(buildModelForHost('www.youtube.com')!, ['ru'])).toHaveLength(1);
    expect(await runFilter(buildModelForHost('www.youtube.com')!, ['ru'])).toHaveLength(0);
  });
});

describe('applyContentFilter — YouTube playlist / mix / radio', () => {
  it('blurs a playlist with a Russian title', async () => {
    setBody(`
      <ytd-playlist-renderer id="pl">
        <a id="video-title">Всё о программировании — плейлист</a>
        <ytd-channel-name><a>Какой-то Канал</a></ytd-channel-name>
      </ytd-playlist-renderer>
    `);
    const hits = await runFilter(buildModelForHost('www.youtube.com')!, ['ru']);
    expect(hits).toHaveLength(1);
    expect(hits[0]?.kind).toBe('playlist');
    const card = document.querySelector<HTMLElement>('#pl')!;
    expect(card.getAttribute('data-movar-content-blurred')).toBe('ru');
    expect(card.querySelector('[data-movar-curtain]')).not.toBeNull();
  });

  it('blurs a radio/mix renderer with Russian text', async () => {
    setBody(`
      <ytd-radio-renderer id="rad">
        <a id="video-title">Микс — всё о программировании</a>
        <ytd-channel-name><a>YouTube</a></ytd-channel-name>
      </ytd-radio-renderer>
    `);
    const hits = await runFilter(buildModelForHost('www.youtube.com')!, ['ru']);
    expect(hits).toHaveLength(1);
    expect(hits[0]?.kind).toBe('playlist');
  });

  it('blurs ytd-compact-radio-renderer too', async () => {
    setBody(`
      <ytd-compact-radio-renderer id="crad">
        <a id="video-title">Микс — всё о программировании</a>
        <ytd-channel-name><a>YouTube</a></ytd-channel-name>
      </ytd-compact-radio-renderer>
    `);
    expect(await runFilter(buildModelForHost('www.youtube.com')!, ['ru'])).toHaveLength(1);
  });

  it('does NOT blur a Ukrainian-distinctive playlist', async () => {
    setBody(`
      <ytd-playlist-renderer>
        <a id="video-title">Все про програмування — плейлист українською</a>
        <ytd-channel-name><a>Якийсь канал</a></ytd-channel-name>
      </ytd-playlist-renderer>
    `);
    expect(await runFilter(buildModelForHost('www.youtube.com')!, ['ru'])).toHaveLength(0);
  });
});

describe('applyContentFilter — YouTube movies', () => {
  it('blurs a movie card with a Russian title', async () => {
    setBody(`
      <ytd-movie-renderer id="mv">
        <a id="video-title">Всё, что нужно знать о программировании — документальный фильм</a>
        <ytd-channel-name><a>Канал</a></ytd-channel-name>
      </ytd-movie-renderer>
    `);
    const hits = await runFilter(buildModelForHost('www.youtube.com')!, ['ru']);
    expect(hits).toHaveLength(1);
    expect(hits[0]?.kind).toBe('video');
  });
});
