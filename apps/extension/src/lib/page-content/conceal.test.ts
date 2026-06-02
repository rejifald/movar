// fallow-ignore-file code-duplication
import { beforeEach, describe, expect, it } from 'vitest';
import {
  concealNode,
  revealNode,
  revealAllNodes,
  clearAllMarks,
  isConcealed,
  isRevealed,
  applyContentFilter,
} from './conceal';
import type { ContentNode, PageContentModel } from './types';

function setBody(html: string): void {
  document.body.innerHTML = html;
}

function makeNode(el: HTMLElement, overrides: Partial<Omit<ContentNode, 'el'>> = {}): ContentNode {
  return {
    el,
    kind: 'video',
    hideMode: 'blur',
    text: 'Всё о программировании',
    ...overrides,
  };
}

function findRevealButton(el: HTMLElement): HTMLButtonElement | null {
  const host = el.querySelector<HTMLElement>('[data-movar-curtain]');
  if (!host?.shadowRoot) return null;
  return host.shadowRoot.querySelector<HTMLButtonElement>('button');
}

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
    expect(concealNode(node, 'ru')).toBe(true);
    expect(el.getAttribute('data-movar-content-blurred')).toBe('ru');
    expect(el.querySelector('[data-movar-curtain]')).not.toBeNull();
  });

  it('returns false and does nothing if already concealed', () => {
    setBody('<div id="card" data-movar-content-blurred="ru"></div>');
    const el = document.querySelector<HTMLElement>('#card')!;
    const node = makeNode(el, { hideMode: 'blur' });
    expect(concealNode(node, 'ru')).toBe(false);
    // No duplicate curtain.
    expect(el.querySelectorAll('[data-movar-curtain]')).toHaveLength(0);
  });

  it('returns false and does nothing if already revealed', () => {
    setBody('<div id="card" data-movar-revealed="true"></div>');
    const el = document.querySelector<HTMLElement>('#card')!;
    const node = makeNode(el, { hideMode: 'blur' });
    expect(concealNode(node, 'ru')).toBe(false);
    expect(el.querySelector('[data-movar-curtain]')).toBeNull();
  });
});

describe('concealNode — hide mode', () => {
  it('sets display:none and data-movar-hidden, no curtain', () => {
    setBody('<div id="card"></div>');
    const el = document.querySelector<HTMLElement>('#card')!;
    const node = makeNode(el, { kind: 'channel', hideMode: 'hide' });
    expect(concealNode(node, 'ru')).toBe(true);
    expect(el.style.display).toBe('none');
    expect(el.getAttribute('data-movar-hidden')).toMatch(/content-filter:channel:ru/);
    expect(el.querySelector('[data-movar-curtain]')).toBeNull();
  });
});

// ─── revealNode ───────────────────────────────────────────────────────────

describe('revealNode', () => {
  it('removes BLURRED attr and sets REVEALED', () => {
    setBody('<div id="card"></div>');
    const el = document.querySelector<HTMLElement>('#card')!;
    const node = makeNode(el, { hideMode: 'blur' });
    concealNode(node, 'ru');
    expect(el.hasAttribute('data-movar-content-blurred')).toBe(true);
    revealNode(node);
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

describe('applyContentFilter', () => {
  it('returns empty array when ru is not in blocked', () => {
    const el = document.createElement('div');
    document.body.append(el);
    const model: PageContentModel = {
      extractor: 'test',
      nodes: [makeNode(el, { text: 'Всё о программировании на русском языке' })],
    };
    expect(applyContentFilter(model, [])).toHaveLength(0);
    expect(applyContentFilter(model, ['uk'])).toHaveLength(0);
  });

  it('conceals a Russian-language node', () => {
    const el = document.createElement('div');
    document.body.append(el);
    const model: PageContentModel = {
      extractor: 'test',
      nodes: [makeNode(el, { text: 'Всё о программировании на русском языке', hideMode: 'blur' })],
    };
    const hits = applyContentFilter(model, ['ru']);
    expect(hits).toHaveLength(1);
    expect(hits[0]?.fromLang).toBe('ru');
    expect(el.getAttribute('data-movar-content-blurred')).toBe('ru');
  });

  it('does not conceal a Ukrainian-language node', () => {
    const el = document.createElement('div');
    document.body.append(el);
    const model: PageContentModel = {
      extractor: 'test',
      nodes: [makeNode(el, { text: 'Як писати тести українською мовою' })],
    };
    expect(applyContentFilter(model, ['ru'])).toHaveLength(0);
  });

  it('skips a node with empty text (lazy load)', () => {
    const el = document.createElement('div');
    document.body.append(el);
    const model: PageContentModel = {
      extractor: 'test',
      nodes: [makeNode(el, { text: '' })],
    };
    applyContentFilter(model, ['ru']);
    // NOT marked checked — next pass can re-scan once text hydrates.
    expect(el.hasAttribute('data-movar-content-checked')).toBe(false);
  });

  it('skips already-concealed nodes (idempotent)', () => {
    const el = document.createElement('div');
    el.setAttribute('data-movar-content-blurred', 'ru');
    document.body.append(el);
    const model: PageContentModel = {
      extractor: 'test',
      nodes: [makeNode(el, { text: 'Всё о программировании на русском языке' })],
    };
    expect(applyContentFilter(model, ['ru'])).toHaveLength(0);
  });

  it('skips user-revealed nodes', () => {
    const el = document.createElement('div');
    el.setAttribute('data-movar-revealed', 'true');
    document.body.append(el);
    const model: PageContentModel = {
      extractor: 'test',
      nodes: [makeNode(el, { text: 'Всё о программировании на русском языке' })],
    };
    expect(applyContentFilter(model, ['ru'])).toHaveLength(0);
  });

  it('dispatches to hide mode correctly', () => {
    const el = document.createElement('div');
    document.body.append(el);
    const model: PageContentModel = {
      extractor: 'test',
      nodes: [
        makeNode(el, {
          kind: 'channel',
          hideMode: 'hide',
          text: 'Русский канал про программирование',
        }),
      ],
    };
    const hits = applyContentFilter(model, ['ru']);
    expect(hits).toHaveLength(1);
    expect(el.style.display).toBe('none');
    expect(el.querySelector('[data-movar-curtain]')).toBeNull();
  });

  it('the curtain reveal button marks the card REVEALED and removes the curtain', () => {
    const el = document.createElement('div');
    document.body.append(el);
    const model: PageContentModel = {
      extractor: 'test',
      nodes: [
        makeNode(el, {
          text: 'Всё о программировании на русском языке',
          hideMode: 'blur',
        }),
      ],
    };
    applyContentFilter(model, ['ru']);
    const btn = findRevealButton(el);
    expect(btn).not.toBeNull();
    btn!.click();
    expect(el.hasAttribute('data-movar-content-blurred')).toBe(false);
    expect(el.getAttribute('data-movar-revealed')).toBe('true');
    expect(el.querySelector('[data-movar-curtain]')).toBeNull();
  });
});
