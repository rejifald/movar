import { describe, expect, it } from 'vitest';
import '@movar/page-content/google';
import '@movar/page-content/youtube';
import { buildModelForHost } from '@movar/page-content/registry';
import { runFilter, setBody } from './content-filter.test-utils';

describe('applyContentFilter — YouTube shorts shelf', () => {
  it('curtains a shorts shelf where every child title is Russian-leaning', async () => {
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
    const hits = await runFilter(buildModelForHost('www.youtube.com')!, ['ru']);
    expect(hits).toHaveLength(1);
    expect(hits[0]?.kind).toBe('shorts-shelf');
    const shelf = document.querySelector<HTMLElement>('#shelf')!;
    expect(shelf.style.display).toBe('');
    expect(shelf.getAttribute('data-movar-content-blurred')).toBe('ru');
  });

  it('does NOT hide a shelf whose titles carry Ukrainian distinctives', async () => {
    setBody(`
      <ytd-reel-shelf-renderer id="shelf">
        <ytd-reel-item-renderer><a id="video-title">Привіт усім</a></ytd-reel-item-renderer>
        <ytd-reel-item-renderer><a id="video-title">Сьогодні</a></ytd-reel-item-renderer>
        <ytd-reel-item-renderer><a id="video-title">Як справи</a></ytd-reel-item-renderer>
      </ytd-reel-shelf-renderer>
    `);
    expect(await runFilter(buildModelForHost('www.youtube.com')!, ['ru'])).toHaveLength(0);
    expect(document.querySelector<HTMLElement>('#shelf')!.style.display).toBe('');
  });

  it('leaves a balanced-evidence shelf alone (rung-1 tie → unknown)', async () => {
    // Equal distinctive evidence — `ї` (UA) vs `ы` (RU), with no word markers —
    // ties at rung 1, so classifyBySnippet returns 'unknown' and the shelf is kept.
    setBody(`
      <ytd-reel-shelf-renderer id="shelf">
        <ytd-reel-item-renderer><a id="video-title">ї</a></ytd-reel-item-renderer>
        <ytd-reel-item-renderer><a id="video-title">ы</a></ytd-reel-item-renderer>
      </ytd-reel-shelf-renderer>
    `);
    expect(await runFilter(buildModelForHost('www.youtube.com')!, ['ru'])).toHaveLength(0);
  });

  it('idempotent — a hidden shelf is not re-scanned on the next pass', async () => {
    setBody(`
      <ytd-reel-shelf-renderer>
        <ytd-reel-item-renderer><a id="video-title">Привет</a></ytd-reel-item-renderer>
        <ytd-reel-item-renderer><a id="video-title">Объём</a></ytd-reel-item-renderer>
        <ytd-reel-item-renderer><a id="video-title">Сейчас</a></ytd-reel-item-renderer>
        <ytd-reel-item-renderer><a id="video-title">Здравствуйте</a></ytd-reel-item-renderer>
      </ytd-reel-shelf-renderer>
    `);
    expect(await runFilter(buildModelForHost('www.youtube.com')!, ['ru'])).toHaveLength(1);
    expect(await runFilter(buildModelForHost('www.youtube.com')!, ['ru'])).toHaveLength(0);
  });

  it('does not classify a shelf that has no child titles yet (lazy load)', async () => {
    setBody(`<ytd-reel-shelf-renderer></ytd-reel-shelf-renderer>`);
    expect(await runFilter(buildModelForHost('www.youtube.com')!, ['ru'])).toHaveLength(0);
    // Importantly: NOT marked checked, so the next mutation pass can re-scan
    // once child shorts hydrate in.
    const shelf = document.querySelector<HTMLElement>('ytd-reel-shelf-renderer')!;
    expect(Object.hasOwn(shelf.dataset, 'movarContentChecked')).toBe(false);
  });
});

// ─── Mobile (m.youtube.com) selectors ─────────────────────────────────────

describe('applyContentFilter — YouTube mobile (ytm-*) selectors', () => {
  it('blurs a ytm-video-with-context-renderer with a Russian title', async () => {
    setBody(`
      <ytm-video-with-context-renderer id="mv">
        <a id="video-title">Всё о программировании на русском языке</a>
      </ytm-video-with-context-renderer>
    `);
    const hits = await runFilter(buildModelForHost('m.youtube.com')!, ['ru']);
    expect(hits).toHaveLength(1);
    expect(hits[0]?.kind).toBe('video');
    expect(
      document.querySelector<HTMLElement>('#mv')!.getAttribute('data-movar-content-blurred'),
    ).toBe('ru');
  });

  it('blurs a ytm-compact-video-renderer with a Russian title', async () => {
    setBody(`
      <ytm-compact-video-renderer id="cv">
        <a id="video-title">Всё о программировании на русском</a>
      </ytm-compact-video-renderer>
    `);
    expect(await runFilter(buildModelForHost('m.youtube.com')!, ['ru'])).toHaveLength(1);
  });

  it('blurs a ytm-rich-item-renderer', async () => {
    setBody(`
      <ytm-rich-item-renderer id="ri">
        <a id="video-title">Совершенно новый русскоязычный контент</a>
      </ytm-rich-item-renderer>
    `);
    expect(await runFilter(buildModelForHost('m.youtube.com')!, ['ru'])).toHaveLength(1);
  });

  it('curtains a ytm-reel-shelf-renderer of Russian shorts', async () => {
    setBody(`
      <ytm-reel-shelf-renderer id="shelf">
        <a id="video-title">Привет</a>
        <a id="video-title">Объём</a>
        <a id="video-title">Сейчас</a>
        <a id="video-title">Здравствуйте</a>
      </ytm-reel-shelf-renderer>
    `);
    const hits = await runFilter(buildModelForHost('m.youtube.com')!, ['ru']);
    expect(hits).toHaveLength(1);
    expect(hits[0]?.kind).toBe('shorts-shelf');
    expect(document.querySelector<HTMLElement>('#shelf')!.style.display).toBe('');
    expect(document.querySelector<HTMLElement>('#shelf')!.dataset['movarContentBlurred']).toBe(
      'ru',
    );
  });
});
