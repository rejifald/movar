import { beforeEach, describe, expect, it } from 'vitest';
import {
  concealNode,
  revealNode,
  revealAllNodes,
  clearAllMarks,
  concealModeToHideMode,
  isConcealed,
  isRevealed,
} from './content-conceal';
import { testContentPresenter } from './dom.test-utils';
import { setBody, makeNode } from './content-conceal.test-utils';

beforeEach(() => {
  document.body.innerHTML = '';
});

// ─── isConcealed / isRevealed ─────────────────────────────────────────────

describe('isConcealed', () => {
  it('returns false for a fresh element', () => {
    setBody('<div id="card"></div>');
    const el = document.querySelector<HTMLElement>('#card')!;
    expect(isConcealed(makeNode(el))).toBe(false);
  });

  it('returns true when data-movar-content-blurred is set', () => {
    setBody('<div id="card" data-movar-content-blurred="ru"></div>');
    const el = document.querySelector<HTMLElement>('#card')!;
    expect(isConcealed(makeNode(el))).toBe(true);
  });

  it('returns true when data-movar-hidden is set', () => {
    setBody('<div id="card" data-movar-hidden="content-filter:channel:ru"></div>');
    const el = document.querySelector<HTMLElement>('#card')!;
    expect(isConcealed(makeNode(el))).toBe(true);
  });

  it('returns false when only data-movar-content-checked is set (scanned but not blocked)', () => {
    // CHECKED_ATTR means "was scanned but language was not blocked" — the card
    // is not concealed, just seen. isConcealed only covers actively hidden cards.
    setBody('<div id="card" data-movar-content-checked="true"></div>');
    const el = document.querySelector<HTMLElement>('#card')!;
    expect(isConcealed(makeNode(el))).toBe(false);
  });
});

describe('isRevealed', () => {
  it('returns false for a fresh element', () => {
    setBody('<div id="card"></div>');
    const el = document.querySelector<HTMLElement>('#card')!;
    expect(isRevealed(makeNode(el))).toBe(false);
  });

  it('returns true when data-movar-revealed is set', () => {
    setBody('<div id="card" data-movar-revealed="true"></div>');
    const el = document.querySelector<HTMLElement>('#card')!;
    expect(isRevealed(makeNode(el))).toBe(true);
  });
});

// ─── concealNode ──────────────────────────────────────────────────────────

describe('concealNode — blur mode', () => {
  it('attaches a curtain and sets data-movar-content-blurred', () => {
    setBody('<div id="card"></div>');
    const el = document.querySelector<HTMLElement>('#card')!;
    const node = makeNode(el, { hideMode: 'blur' });
    expect(
      concealNode(node, 'ru', { concealMode: 'curtain', presenter: testContentPresenter }),
    ).toBe(true);
    expect(el.getAttribute('data-movar-content-blurred')).toBe('ru');
    expect(el.querySelector('[data-movar-curtain]')).not.toBeNull();
  });

  it('returns false and does nothing if already concealed', () => {
    setBody('<div id="card" data-movar-content-blurred="ru"></div>');
    const el = document.querySelector<HTMLElement>('#card')!;
    const node = makeNode(el, { hideMode: 'blur' });
    expect(
      concealNode(node, 'ru', { concealMode: 'curtain', presenter: testContentPresenter }),
    ).toBe(false);
    // No duplicate curtain.
    expect(el.querySelectorAll('[data-movar-curtain]')).toHaveLength(0);
  });

  it('returns false and does nothing if already revealed', () => {
    setBody('<div id="card" data-movar-revealed="true"></div>');
    const el = document.querySelector<HTMLElement>('#card')!;
    const node = makeNode(el, { hideMode: 'blur' });
    expect(
      concealNode(node, 'ru', { concealMode: 'curtain', presenter: testContentPresenter }),
    ).toBe(false);
    expect(el.querySelector('[data-movar-curtain]')).toBeNull();
  });
});

describe('concealNode — hide mode', () => {
  it('sets display:none and data-movar-hidden, no curtain when hide is selected', () => {
    setBody('<div id="card"></div>');
    const el = document.querySelector<HTMLElement>('#card')!;
    const node = makeNode(el, { kind: 'channel', hideMode: 'hide' });
    expect(concealNode(node, 'ru', { concealMode: 'hide' })).toBe(true);
    expect(el.style.display).toBe('none');
    expect(el.getAttribute('data-movar-hidden')).toMatch(/content-filter:channel:ru/);
    expect(el.querySelector('[data-movar-curtain]')).toBeNull();
  });

  it('curtains even a hide-floor node when curtain is selected', () => {
    setBody('<div id="card"></div>');
    const el = document.querySelector<HTMLElement>('#card')!;
    const node = makeNode(el, { kind: 'channel', hideMode: 'hide' });
    expect(
      concealNode(node, 'ru', { concealMode: 'curtain', presenter: testContentPresenter }),
    ).toBe(true);
    expect(el.getAttribute('data-movar-content-blurred')).toBe('ru');
    expect(el.style.display).toBe('');
    expect(el.querySelector('[data-movar-curtain]')).not.toBeNull();
  });
});

// ─── Empty-container cleanup ──────────────────────────────────────────────
// General rule, not Google-specific: concealing every child of a container
// must not leave a dangling empty wrapper behind.

describe('revealNode', () => {
  it('removes BLURRED attr and sets REVEALED', () => {
    setBody('<div id="card"></div>');
    const el = document.querySelector<HTMLElement>('#card')!;
    const node = makeNode(el, { hideMode: 'blur' });
    concealNode(node, 'ru', { concealMode: 'curtain', presenter: testContentPresenter });
    expect(el.hasAttribute('data-movar-content-blurred')).toBe(true);
    revealNode(node, testContentPresenter);
    expect(el.hasAttribute('data-movar-content-blurred')).toBe(false);
    expect(el.getAttribute('data-movar-revealed')).toBe('true');
    expect(el.querySelector('[data-movar-curtain]')).toBeNull();
  });
});

// ─── revealAllNodes ───────────────────────────────────────────────────────

describe('revealAllNodes', () => {
  it('clears every blurred card in document', () => {
    setBody(`
      <div id="a" data-movar-content-blurred="ru"></div>
      <div id="b" data-movar-content-blurred="ru"></div>
    `);
    revealAllNodes();
    expect(document.querySelectorAll('[data-movar-content-blurred]')).toHaveLength(0);
    expect(document.querySelectorAll('[data-movar-revealed="true"]')).toHaveLength(2);
  });

  it('accepts a custom root', () => {
    setBody(`
      <div id="scope">
        <div id="in" data-movar-content-blurred="ru"></div>
      </div>
      <div id="out" data-movar-content-blurred="ru"></div>
    `);
    const scope = document.querySelector<HTMLElement>('#scope')!;
    revealAllNodes(scope);
    expect(document.querySelector<HTMLElement>('#in')!.getAttribute('data-movar-revealed')).toBe(
      'true',
    );
    // Outside scope — untouched.
    expect(document.querySelector<HTMLElement>('#out')!.hasAttribute('data-movar-revealed')).toBe(
      false,
    );
  });
});

// ─── clearAllMarks ────────────────────────────────────────────────────────

describe('clearAllMarks', () => {
  it('strips BLURRED and CHECKED without setting REVEALED', () => {
    setBody(`
      <div id="card" data-movar-content-blurred="ru" data-movar-content-checked="true"></div>
    `);
    clearAllMarks();
    const card = document.querySelector<HTMLElement>('#card')!;
    expect(card.hasAttribute('data-movar-content-blurred')).toBe(false);
    expect(card.hasAttribute('data-movar-content-checked')).toBe(false);
    expect(card.hasAttribute('data-movar-revealed')).toBe(false);
  });

  it('preserves REVEALED attr (user gesture survives toggle off/on)', () => {
    setBody(`
      <div id="card" data-movar-content-blurred="ru" data-movar-revealed="true"></div>
    `);
    clearAllMarks();
    expect(document.querySelector<HTMLElement>('#card')!.getAttribute('data-movar-revealed')).toBe(
      'true',
    );
  });
});

// ─── applyContentFilter ───────────────────────────────────────────────────

describe('concealModeToHideMode', () => {
  it('maps curtain to blur and hide to hard-hide', () => {
    expect(concealModeToHideMode('curtain')).toBe('blur');
    expect(concealModeToHideMode('hide')).toBe('hide');
  });
});

describe("concealNode — 'hide' preference escalates a blur-floor card", () => {
  it('sets display:none with no curtain even though the shape floor is blur', () => {
    setBody('<div id="card"></div>');
    const el = document.querySelector<HTMLElement>('#card')!;
    const node = makeNode(el, { kind: 'video', hideMode: 'blur' });
    expect(concealNode(node, 'ru', { concealMode: 'hide' })).toBe(true);
    expect(el.style.display).toBe('none');
    expect(el.getAttribute('data-movar-hidden')).toMatch(/^content-filter:video:ru$/);
    expect(el.querySelector('[data-movar-curtain]')).toBeNull();
  });
});
