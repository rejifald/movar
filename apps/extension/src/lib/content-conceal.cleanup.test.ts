import { beforeEach, describe, expect, it } from 'vitest';
import { concealNode, revealAllNodes } from './content-conceal';
import type { PageContentModel } from '@movar/page-content/types';
import { testContentPresenter } from './dom.test-utils';
import { runFilter, setBody, makeNode } from './content-conceal.test-utils';

beforeEach(() => {
  document.body.innerHTML = '';
});

// ─── isConcealed / isRevealed ─────────────────────────────────────────────

describe('concealNode — empty-container cleanup', () => {
  it('hides a parent left with no other visible content after a hide-mode conceal', () => {
    setBody(`<ul id="list"><li id="card"></li></ul>`);
    const el = document.querySelector<HTMLElement>('#card')!;
    concealNode(makeNode(el, { hideMode: 'hide' }), 'ru', { concealMode: 'hide' });
    const list = document.querySelector<HTMLElement>('#list')!;
    expect(list.style.display).toBe('none');
    expect(list.getAttribute('data-movar-hidden')).toBe('content-filter:container:empty');
  });

  it('does not hide a parent that still has other visible content', () => {
    setBody(`
      <ul id="list">
        <li id="card"></li>
        <li id="sibling">Залишається видимим</li>
      </ul>
    `);
    const el = document.querySelector<HTMLElement>('#card')!;
    concealNode(makeNode(el, { hideMode: 'hide' }), 'ru', { concealMode: 'hide' });
    const list = document.querySelector<HTMLElement>('#list')!;
    expect(list.style.display).not.toBe('none');
    expect(list.hasAttribute('data-movar-hidden')).toBe(false);
  });

  it('does not hide a parent whose only remaining visible content is a lone <svg> icon (#291)', () => {
    // Regression for #291: isHiddenElement used to misreport every <svg> as
    // hidden (the `hidden` IDL isn't reflected on SVGElement), which made
    // VISUAL_LEAF_TAGS' 'svg' entry dead — a sibling icon like this one was
    // invisible to the empty-ancestor check, so the whole container got
    // wrongly hard-hidden alongside the concealed card.
    setBody(`
      <ul id="list">
        <li id="card"></li>
        <li id="sibling"><svg viewBox="0 0 10 10"><path d="M0 0h10v10H0z"></path></svg></li>
      </ul>
    `);
    const el = document.querySelector<HTMLElement>('#card')!;
    concealNode(makeNode(el, { hideMode: 'hide' }), 'ru', { concealMode: 'hide' });
    const list = document.querySelector<HTMLElement>('#list')!;
    expect(list.style.display).not.toBe('none');
    expect(list.hasAttribute('data-movar-hidden')).toBe(false);
  });

  it('climbs multiple wrapper levels while each is left empty in turn', () => {
    setBody(`
      <div id="outer"><ul id="list"><li id="row"><div id="card"></div></li></ul></div>
    `);
    const el = document.querySelector<HTMLElement>('#card')!;
    concealNode(makeNode(el, { hideMode: 'hide' }), 'ru', { concealMode: 'hide' });
    for (const id of ['row', 'list', 'outer']) {
      expect(document.querySelector<HTMLElement>(`#${id}`)!.style.display).toBe('none');
    }
  });

  it('stops at the first ancestor with its own visible content (e.g. a toggle button)', () => {
    // Mirrors the AI Overview sources popup: a "5 сайтів" toggle sits OUTSIDE
    // the list as a SIBLING, not a descendant. Emptying the list must not
    // reach past its parent once that parent still shows the toggle.
    setBody(`
      <div id="popup">
        <button id="toggle">5 сайтів</button>
        <ul id="list"><li id="card"></li></ul>
      </div>
    `);
    const el = document.querySelector<HTMLElement>('#card')!;
    concealNode(makeNode(el, { hideMode: 'hide' }), 'ru', { concealMode: 'hide' });
    expect(document.querySelector<HTMLElement>('#list')!.style.display).toBe('none');
    expect(document.querySelector<HTMLElement>('#popup')!.style.display).not.toBe('none');
    expect(document.querySelector<HTMLElement>('#toggle')!.style.display).not.toBe('none');
  });

  it('tears down a section whose only leftover is its heading label (PAA "Схожі запитання")', () => {
    // Real-SERP shape (#218): a visible section HEADING sits as a sibling of the
    // rows-list, not inside it. Once every row is hidden the list empties, and
    // the heading is a dangling label over an empty box — the whole section must
    // go, not stop at the heading's text the way plain content would.
    setBody(`
      <div id="section">
        <div role="heading" aria-level="2" id="heading">Схожі запитання</div>
        <div id="list">
          <div class="related-question-pair" id="r1"><span>Для чего реле?</span></div>
          <div class="related-question-pair" id="r2"><span>Где ставить реле?</span></div>
        </div>
      </div>
    `);
    const section = document.querySelector<HTMLElement>('#section')!;
    const r1 = document.querySelector<HTMLElement>('#r1')!;
    const r2 = document.querySelector<HTMLElement>('#r2')!;

    concealNode(makeNode(r1, { hideMode: 'hide' }), 'ru', { concealMode: 'hide' });
    expect(section.style.display).not.toBe('none'); // r2 still shows — don't teardown yet

    concealNode(makeNode(r2, { hideMode: 'hide' }), 'ru', { concealMode: 'hide' });
    expect(document.querySelector<HTMLElement>('#list')!.style.display).toBe('none');
    expect(section.style.display).toBe('none');
    expect(section.getAttribute('data-movar-hidden')).toBe('content-filter:container:empty');
  });

  it('reveals a torn-down PAA section (heading + list) together under "Show everything"', () => {
    setBody(`
      <div id="section">
        <h2 id="heading">Схожі запитання</h2>
        <div id="list"><div class="related-question-pair" id="r1"><span>Реле?</span></div></div>
      </div>
    `);
    const r1 = document.querySelector<HTMLElement>('#r1')!;
    concealNode(makeNode(r1, { hideMode: 'hide' }), 'ru', { concealMode: 'hide' });
    const section = document.querySelector<HTMLElement>('#section')!;
    expect(section.style.display).toBe('none');

    revealAllNodes();
    expect(section.style.display).toBe('');
    expect(section.hasAttribute('data-movar-hidden')).toBe(false);
  });

  it('keeps a section whose leftover is a functional control even alongside a heading', () => {
    // The heading-skip must not cascade: a section with BOTH a label AND a
    // control (e.g. the AI Overview "Джерела" heading + "5 сайтів" toggle) still
    // survives its list emptying, because the control is meaningful content.
    setBody(`
      <div id="popup">
        <div role="heading" id="heading">Джерела</div>
        <button id="toggle">5 сайтів</button>
        <ul id="list"><li id="card"></li></ul>
      </div>
    `);
    const el = document.querySelector<HTMLElement>('#card')!;
    concealNode(makeNode(el, { hideMode: 'hide' }), 'ru', { concealMode: 'hide' });
    expect(document.querySelector<HTMLElement>('#list')!.style.display).toBe('none');
    expect(document.querySelector<HTMLElement>('#popup')!.style.display).not.toBe('none');
    expect(document.querySelector<HTMLElement>('#toggle')!.style.display).not.toBe('none');
  });

  it('never conceals body or html even when the whole page empties out', () => {
    setBody(`<div id="card"></div>`);
    const el = document.querySelector<HTMLElement>('#card')!;
    concealNode(makeNode(el, { hideMode: 'hide' }), 'ru', { concealMode: 'hide' });
    expect(document.body.style.display).not.toBe('none');
    expect(document.body.hasAttribute('data-movar-hidden')).toBe(false);
  });

  it('leaves the parent alone in curtain mode — the attached curtain is itself visible content', () => {
    setBody(`<ul id="list"><li id="card"></li></ul>`);
    const el = document.querySelector<HTMLElement>('#card')!;
    concealNode(makeNode(el, { hideMode: 'blur' }), 'ru', {
      concealMode: 'curtain',
      presenter: testContentPresenter,
    });
    const list = document.querySelector<HTMLElement>('#list')!;
    expect(list.hasAttribute('data-movar-hidden')).toBe(false);
    expect(list.style.display).not.toBe('none');
  });

  it('hides the container only once every sibling card is concealed', () => {
    setBody(`
      <ul id="list">
        <li id="a">Перший</li>
        <li id="b">Другий</li>
      </ul>
    `);
    const a = document.querySelector<HTMLElement>('#a')!;
    const b = document.querySelector<HTMLElement>('#b')!;
    const list = document.querySelector<HTMLElement>('#list')!;

    concealNode(makeNode(a, { hideMode: 'hide' }), 'ru', { concealMode: 'hide' });
    expect(list.hasAttribute('data-movar-hidden')).toBe(false); // "Другий" still visible

    concealNode(makeNode(b, { hideMode: 'hide' }), 'ru', { concealMode: 'hide' });
    expect(list.style.display).toBe('none'); // now both cards are gone
    expect(list.getAttribute('data-movar-hidden')).toBe('content-filter:container:empty');
  });

  it('reveals an auto-hidden container via revealAllNodes, alongside its card', () => {
    setBody(`<ul id="list"><li id="card"></li></ul>`);
    const el = document.querySelector<HTMLElement>('#card')!;
    concealNode(makeNode(el, { hideMode: 'hide' }), 'ru', { concealMode: 'hide' });
    revealAllNodes();
    const list = document.querySelector<HTMLElement>('#list')!;
    expect(list.style.display).toBe('');
    expect(list.hasAttribute('data-movar-hidden')).toBe(false);
    expect(list.getAttribute('data-movar-revealed')).toBe('true');
  });

  it('applyContentFilter: a shared container empties once its last blocked card is classified', async () => {
    const a = document.createElement('li');
    const b = document.createElement('li');
    const list = document.createElement('ul');
    list.append(a, b);
    document.body.append(list);
    const model: PageContentModel = {
      extractor: 'test',
      nodes: [
        makeNode(a, { hideMode: 'hide', text: 'Всё о программировании на русском языке' }),
        makeNode(b, { hideMode: 'hide', text: 'Совершенно новый русскоязычный контент тут' }),
      ],
    };
    await runFilter(model, ['ru'], 'hide');
    expect(a.style.display).toBe('none');
    expect(b.style.display).toBe('none');
    expect(list.style.display).toBe('none');
    expect(list.getAttribute('data-movar-hidden')).toBe('content-filter:container:empty');
  });

  it('applyContentFilter: the container stays put while a kept sibling card remains', async () => {
    const a = document.createElement('li');
    const b = document.createElement('li');
    // b's real DOM text (not just its ContentNode.text used for classification)
    // is what makes the container non-empty once a is concealed.
    b.textContent = 'Як писати тести українською мовою';
    const list = document.createElement('ul');
    list.append(a, b);
    document.body.append(list);
    const model: PageContentModel = {
      extractor: 'test',
      nodes: [
        makeNode(a, { hideMode: 'hide', text: 'Всё о программировании на русском языке' }),
        makeNode(b, { hideMode: 'hide', text: 'Як писати тести українською мовою' }),
      ],
    };
    await runFilter(model, ['ru'], 'hide');
    expect(a.style.display).toBe('none'); // ru — concealed
    expect(b.style.display).not.toBe('none'); // uk — kept
    expect(list.hasAttribute('data-movar-hidden')).toBe(false);
  });
});

// ─── revealNode ───────────────────────────────────────────────────────────
