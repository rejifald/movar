import { describe, expect, it } from 'vitest';
import '@movar/page-content/google';
import '@movar/page-content/youtube';
import { clearAllMarks, revealAllNodes } from './content-conceal';
import { buildModelForHost } from '@movar/page-content/registry';
import { testContentPresenter } from './dom.test-utils';
import { runFilter, setBody, ytCard, findRevealButton } from './content-filter.test-utils';

describe('applyContentFilter — curtain interaction', () => {
  it('clicking the reveal button removes the curtain and marks the card', async () => {
    setBody(ytCard('Всё о программировании'));
    await runFilter(buildModelForHost('www.youtube.com')!, ['ru']);

    const card = document.querySelector<HTMLElement>('ytd-video-renderer')!;
    const btn = findRevealButton(card)!;
    btn.click();

    expect(card.querySelector('[data-movar-curtain]')).toBeNull();
    expect(Object.hasOwn(card.dataset, 'movarContentBlurred')).toBe(false);
    expect(card.dataset['movarRevealed']).toBe('true');
  });

  it('a revealed card stays revealed on a re-pass', async () => {
    setBody(ytCard('Всё о программировании'));
    await runFilter(buildModelForHost('www.youtube.com')!, ['ru']);
    const card = document.querySelector<HTMLElement>('ytd-video-renderer')!;
    findRevealButton(card)!.click();
    await runFilter(buildModelForHost('www.youtube.com')!, ['ru']);
    expect(document.querySelector('[data-movar-curtain]')).toBeNull();
    expect(document.querySelector('[data-movar-content-blurred]')).toBeNull();
  });

  it('reveal click does not propagate (would otherwise trigger card click)', async () => {
    setBody(ytCard('Всё о программировании'));
    await runFilter(buildModelForHost('www.youtube.com')!, ['ru']);
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
  it('clears every blurred card on the page', async () => {
    setBody(`
      ${ytCard('Всё о тестах')}
      ${ytCard('Это совсем другое — всё, что нужно знать')}
    `);
    await runFilter(buildModelForHost('www.youtube.com')!, ['ru']);
    expect(document.querySelectorAll('[data-movar-content-blurred]')).toHaveLength(2);

    revealAllNodes(document, testContentPresenter);

    expect(document.querySelectorAll('[data-movar-content-blurred]')).toHaveLength(0);
    expect(document.querySelectorAll('[data-movar-curtain]')).toHaveLength(0);
    expect(document.querySelectorAll('[data-movar-revealed="true"]')).toHaveLength(2);
  });

  it('does not re-blur revealed cards on a subsequent filter pass', async () => {
    setBody(ytCard('Всё о программировании'));
    await runFilter(buildModelForHost('www.youtube.com')!, ['ru']);
    revealAllNodes(document, testContentPresenter);
    await runFilter(buildModelForHost('www.youtube.com')!, ['ru']);
    expect(document.querySelector('[data-movar-curtain]')).toBeNull();
  });
});

describe('clearAllMarks', () => {
  it('strips blur curtains and bookkeeping without marking cards revealed', async () => {
    setBody(`
      ${ytCard('Всё о тестах')}
      ${ytCard('Новый выпуск')}
    `);
    await runFilter(buildModelForHost('www.youtube.com')!, ['ru']);
    expect(document.querySelectorAll('[data-movar-content-blurred]')).toHaveLength(2);
    expect(document.querySelectorAll('[data-movar-content-checked]')).toHaveLength(2);

    clearAllMarks(document, testContentPresenter);

    expect(document.querySelectorAll('[data-movar-content-blurred]')).toHaveLength(0);
    expect(document.querySelectorAll('[data-movar-content-checked]')).toHaveLength(0);
    expect(document.querySelectorAll('[data-movar-curtain]')).toHaveLength(0);
    expect(document.querySelectorAll('[data-movar-revealed="true"]')).toHaveLength(0);
  });

  it('lets a subsequent applyContentFilter re-blur the same cards', async () => {
    setBody(ytCard('Всё о программировании'));
    await runFilter(buildModelForHost('www.youtube.com')!, ['ru']);
    clearAllMarks(document, testContentPresenter);

    const reblurred = await runFilter(buildModelForHost('www.youtube.com')!, ['ru']);
    expect(reblurred).toHaveLength(1);
    expect(document.querySelector('[data-movar-content-blurred]')).not.toBeNull();
  });

  it('preserves cards that the user had explicitly revealed via the curtain', async () => {
    setBody(`
      ${ytCard('Всё о тестах')}
      ${ytCard('Новый выпуск')}
    `);
    await runFilter(buildModelForHost('www.youtube.com')!, ['ru']);
    // Simulate a per-card "Show" click on the first blurred card.
    const firstCard = document.querySelector<HTMLElement>('ytd-video-renderer')!;
    findRevealButton(firstCard)!.click();
    expect(firstCard.getAttribute('data-movar-revealed')).toBe('true');

    clearAllMarks(document, testContentPresenter);

    // The user-revealed marker survives — a future apply pass will skip it.
    expect(firstCard.getAttribute('data-movar-revealed')).toBe('true');
    await runFilter(buildModelForHost('www.youtube.com')!, ['ru']);
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
