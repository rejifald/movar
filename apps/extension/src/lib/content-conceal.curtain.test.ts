import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  concealNode,
  revealAllNodes,
  curtainAllHidden,
  hideAllConcealed,
  applyContentFilter,
} from './content-conceal';
import type { PageContentModel } from '@movar/page-content/types';
import type { ContentPresenter } from './content-presenter';
import { testContentPresenter } from './dom.test-utils';
import {
  directClassify,
  FILTER_LANGS,
  runFilter,
  setBody,
  makeNode,
} from './content-conceal.test-utils';

/** A presenter whose curtain attachment always fails — exercises the
 *  hard-hide fallback taken when presentation can't be provided. */
const failingCurtainPresenter: ContentPresenter = {
  hasVisiblePresentation: true,
  attachContentCurtain: () => null,
  detachCurtains: () => {},
  attachPickerContainerCurtain: () => null,
  attachPickerEntryCurtain: () => null,
  pickerHiddenOptionLabel: () => 'Movar: hidden',
  copyRevision: () => 'en',
  attachPickerSurvivorTooltip: () => null,
  detachAllTooltips: () => {},
};

beforeEach(() => {
  document.body.innerHTML = '';
});

// ─── isConcealed / isRevealed ─────────────────────────────────────────────

describe('hideAllConcealed', () => {
  it('escalates every blurred card on the page to display:none', () => {
    setBody(`
      <div id="a" data-movar-content-blurred="ru"></div>
      <div id="b" data-movar-content-blurred="ru"></div>
    `);
    hideAllConcealed();
    for (const id of ['a', 'b']) {
      const el = document.querySelector<HTMLElement>(`#${id}`)!;
      expect(el.style.display).toBe('none');
      expect(el.hasAttribute('data-movar-content-blurred')).toBe(false);
      expect(el.getAttribute('data-movar-hidden')).toMatch(/^content-filter:escalated:ru$/);
    }
  });

  it('leaves already-hidden cards untouched (idempotent)', () => {
    setBody(
      '<div id="a" data-movar-hidden="content-filter:channel:ru" style="display:none"></div>',
    );
    hideAllConcealed();
    expect(document.querySelector<HTMLElement>('#a')!.getAttribute('data-movar-hidden')).toBe(
      'content-filter:channel:ru',
    );
  });
});

describe('curtainAllHidden', () => {
  it('de-escalates every hard-hidden content card back into a curtain', () => {
    setBody(`
      <div id="a" data-movar-hidden="content-filter:channel:ru" style="display:none"></div>
      <div id="b" data-movar-hidden="content-filter:escalated:ru" style="display:none"></div>
    `);
    curtainAllHidden(document, testContentPresenter);
    for (const id of ['a', 'b']) {
      const el = document.querySelector<HTMLElement>(`#${id}`)!;
      expect(el.style.display).toBe('');
      expect(el.hasAttribute('data-movar-hidden')).toBe(false);
      expect(el.getAttribute('data-movar-content-blurred')).toBe('ru');
      expect(el.querySelector('[data-movar-curtain]')).not.toBeNull();
    }
  });

  it('leaves picker hides (reason not-in-priority) untouched', () => {
    setBody('<a id="lnk" data-movar-hidden="not-in-priority"></a>');
    curtainAllHidden(document, testContentPresenter);
    expect(document.querySelector<HTMLElement>('#lnk')!.getAttribute('data-movar-hidden')).toBe(
      'not-in-priority',
    );
  });

  it('leaves already-curtained cards untouched (idempotent)', () => {
    setBody('<div id="a" data-movar-content-blurred="ru"></div>');
    curtainAllHidden(document, testContentPresenter);
    expect(
      document.querySelector<HTMLElement>('#a')!.getAttribute('data-movar-content-blurred'),
    ).toBe('ru');
  });

  it('is a no-op with no presenter (nothing to attach a curtain with)', () => {
    setBody(
      '<div id="a" data-movar-hidden="content-filter:channel:ru" style="display:none"></div>',
    );
    curtainAllHidden();
    const el = document.querySelector<HTMLElement>('#a')!;
    expect(el.style.display).toBe('none');
    expect(el.getAttribute('data-movar-hidden')).toBe('content-filter:channel:ru');
  });

  it('falls back to a hard hide when the presenter fails to attach a curtain', () => {
    setBody(
      '<div id="a" data-movar-hidden="content-filter:channel:ru" style="display:none"></div>',
    );
    curtainAllHidden(document, failingCurtainPresenter);
    const el = document.querySelector<HTMLElement>('#a')!;
    expect(el.hasAttribute('data-movar-content-blurred')).toBe(false);
    expect(el.getAttribute('data-movar-hidden')).toBe('content-filter:escalated:ru');
    expect(el.style.display).toBe('none');
  });

  it('clears an emptied container instead of wrapping it in a spurious "empty" curtain, while the real card underneath still gets curtained (#296)', () => {
    // Hide mode: concealing the only card empties its <ul>, so
    // concealEmptyAncestors stamps the container content-filter:container:empty
    // right alongside the card's own content-filter:<kind>:<language> reason —
    // both match HIDDEN_CONTENT_SELECTOR's `^="content-filter"` prefix.
    setBody(`<ul id="list"><li id="card"></li></ul>`);
    const card = document.querySelector<HTMLElement>('#card')!;
    const list = document.querySelector<HTMLElement>('#list')!;
    concealNode(makeNode(card, { hideMode: 'hide' }), 'ru', { concealMode: 'hide' });
    expect(list.getAttribute('data-movar-hidden')).toBe('content-filter:container:empty');
    expect(card.getAttribute('data-movar-hidden')).toBe('content-filter:video:ru');

    // Now the user flips the conceal mode from hide to curtain.
    curtainAllHidden(document, testContentPresenter);

    // The real card is de-escalated into a genuine curtain, as usual.
    expect(card.hasAttribute('data-movar-hidden')).toBe(false);
    expect(card.getAttribute('data-movar-content-blurred')).toBe('ru');
    expect(card.querySelector('[data-movar-curtain]')).not.toBeNull();

    // The container was only ever hidden because concealing its last card left
    // it empty — it must be cleared back to plain and visible, NOT re-hidden
    // behind a curtain of its own (there's nothing of its own to show).
    expect(list.hasAttribute('data-movar-hidden')).toBe(false);
    expect(list.hasAttribute('data-movar-content-blurred')).toBe(false);
    expect(list.style.display).toBe('');
    // No curtain host directly on the container itself (as opposed to the
    // card's own, which is a descendant of #list too — scope to a direct child).
    expect(list.querySelector(':scope > [data-movar-curtain]')).toBeNull();
    expect(document.querySelector('[data-movar-content-blurred="empty"]')).toBeNull();
  });
});

describe('revealAllNodes — durable hidden reveal', () => {
  it('clears a hard-hidden content card and marks it REVEALED so it stays gone-then-shown', async () => {
    const el = document.createElement('div');
    document.body.append(el);
    const makeModel = (): PageContentModel => ({
      extractor: 'test',
      nodes: [
        makeNode(el, { kind: 'channel', hideMode: 'hide', text: 'Русский канал — всё о коде' }),
      ],
    });
    expect(await runFilter(makeModel(), ['ru'], 'hide')).toHaveLength(1);
    expect(el.style.display).toBe('none');

    revealAllNodes();
    expect(el.style.display).toBe('');
    expect(el.hasAttribute('data-movar-hidden')).toBe(false);
    expect(el.getAttribute('data-movar-revealed')).toBe('true');

    // The durability the blur path always had: a re-filter must NOT re-hide it.
    expect(await runFilter(makeModel(), ['ru'], 'hide')).toHaveLength(0);
    expect(el.style.display).toBe('');
  });

  it('leaves picker hides (reason not-in-priority) for the picker reveal path', () => {
    setBody('<a id="lnk" data-movar-hidden="not-in-priority"></a>');
    revealAllNodes();
    expect(document.querySelector<HTMLElement>('#lnk')!.getAttribute('data-movar-hidden')).toBe(
      'not-in-priority',
    );
  });
});

describe('curtain "Hide all" action', () => {
  it('escalates every curtained card on the page and fires onHideAll', async () => {
    const onHideAll = vi.fn();
    const a = document.createElement('div');
    const b = document.createElement('div');
    document.body.append(a, b);
    const model: PageContentModel = {
      extractor: 'test',
      nodes: [
        makeNode(a, { hideMode: 'blur', text: 'Всё о программировании на русском языке' }),
        makeNode(b, { hideMode: 'blur', text: 'Совершенно новый русскоязычный контент тут' }),
      ],
    };
    await applyContentFilter(model, {
      candidateCodes: FILTER_LANGS,
      enabled: new Set(['uk', 'en']),
      classify: directClassify,
      concealMode: 'curtain',
      presenter: testContentPresenter,
      onHideAll,
    });
    expect(document.querySelectorAll('[data-movar-content-blurred]')).toHaveLength(2);

    // Click "Hide all" on the first curtain (the second curtain action button).
    const host = a.querySelector<HTMLElement>('[data-movar-curtain]')!;
    const hideAllBtn = [...host.shadowRoot!.querySelectorAll('button')].find(
      (btn) => btn.textContent === 'Hide all',
    )!;
    hideAllBtn.click();

    expect(document.querySelectorAll('[data-movar-content-blurred]')).toHaveLength(0);
    expect(document.querySelectorAll('[data-movar-curtain]')).toHaveLength(0);
    expect(a.style.display).toBe('none');
    expect(b.style.display).toBe('none');
    expect(onHideAll).toHaveBeenCalledTimes(1);
  });
});
