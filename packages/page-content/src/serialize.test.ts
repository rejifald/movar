import { beforeEach, describe, expect, it } from 'vitest';
import { serializeElementText, serializeNodeText, serializeModelText } from './serialize';
import type { PageContentModel } from './types';

function setBody(html: string): void {
  document.body.innerHTML = html;
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('serializeNodeText — basic extraction', () => {
  it('returns joined text from textSelector matches', () => {
    setBody(`
      <div id="card">
        <div class="title">Hello world</div>
        <div class="author">Some Author</div>
      </div>
    `);
    const card = document.querySelector<HTMLElement>('#card')!;
    expect(serializeNodeText(card, ['.title', '.author'])).toBe('Hello world Some Author');
  });

  it('returns empty string when no selectors match', () => {
    setBody(`<div id="card"><span>text</span></div>`);
    const card = document.querySelector<HTMLElement>('#card')!;
    expect(serializeNodeText(card, ['.missing'])).toBe('');
  });

  it('returns empty string when all matches are empty', () => {
    setBody(`<div id="card"><div class="title"></div></div>`);
    const card = document.querySelector<HTMLElement>('#card')!;
    expect(serializeNodeText(card, ['.title'])).toBe('');
  });
});

describe('serializeNodeText — whitespace collapse', () => {
  it('collapses runs of whitespace to a single space', () => {
    setBody(`<div id="card"><div class="t">  hello   world  </div></div>`);
    const card = document.querySelector<HTMLElement>('#card')!;
    expect(serializeNodeText(card, ['.t'])).toBe('hello world');
  });

  it('collapses newlines and tabs inside text', () => {
    setBody(`<div id="card"><div class="t">line1\n\nline2\ttab</div></div>`);
    const card = document.querySelector<HTMLElement>('#card')!;
    expect(serializeNodeText(card, ['.t'])).toBe('line1 line2 tab');
  });
});

describe('serializeNodeText — nested-match dedup', () => {
  it('skips an element already contained inside another matched element', () => {
    // Both `.outer` and `.inner` match, but `.inner` is inside `.outer`.
    // Only `.outer`'s text should contribute — no double-count.
    setBody(`
      <div id="card">
        <div class="outer"><span class="inner">канал</span></div>
      </div>
    `);
    const card = document.querySelector<HTMLElement>('#card')!;
    const text = serializeNodeText(card, ['.outer', '.inner']);
    // Without dedup: "канал канал"; with dedup: "канал"
    expect(text).toBe('канал');
  });

  it('does NOT dedup sibling matches (non-nested)', () => {
    setBody(`
      <div id="card">
        <div class="item">alpha</div>
        <div class="item">beta</div>
      </div>
    `);
    const card = document.querySelector<HTMLElement>('#card')!;
    const text = serializeNodeText(card, ['.item']);
    expect(text).toBe('alpha beta');
  });
});

describe('serializeNodeText — hidden-subtree skip', () => {
  it('skips elements with aria-hidden="true"', () => {
    setBody(`
      <div id="card">
        <div class="visible">visible</div>
        <div class="hidden-aria" aria-hidden="true">hidden-aria</div>
      </div>
    `);
    const card = document.querySelector<HTMLElement>('#card')!;
    const text = serializeNodeText(card, ['.visible', '.hidden-aria']);
    expect(text).toBe('visible');
  });

  it('skips elements with the hidden attribute', () => {
    setBody(`
      <div id="card">
        <div class="visible">visible</div>
        <div class="hidden-attr" hidden>hidden-attr</div>
      </div>
    `);
    const card = document.querySelector<HTMLElement>('#card')!;
    const text = serializeNodeText(card, ['.visible', '.hidden-attr']);
    expect(text).toBe('visible');
  });

  it('skips elements with style.display === "none"', () => {
    setBody(`
      <div id="card">
        <div class="visible">visible</div>
        <div class="hidden-display" style="display:none">hidden-display</div>
      </div>
    `);
    const card = document.querySelector<HTMLElement>('#card')!;
    const text = serializeNodeText(card, ['.visible', '.hidden-display']);
    expect(text).toBe('visible');
  });

  it('skips <script> elements', () => {
    setBody(`
      <div id="card">
        <div class="title">title text</div>
        <script class="script-el">var x = 1;</script>
      </div>
    `);
    const card = document.querySelector<HTMLElement>('#card')!;
    const text = serializeNodeText(card, ['.title', '.script-el']);
    expect(text).toBe('title text');
  });

  it('skips <style> elements', () => {
    setBody(`
      <div id="card">
        <div class="title">title text</div>
        <style class="style-el">.foo { color: red; }</style>
      </div>
    `);
    const card = document.querySelector<HTMLElement>('#card')!;
    const text = serializeNodeText(card, ['.title', '.style-el']);
    expect(text).toBe('title text');
  });

  it('skips <noscript> elements', () => {
    setBody(`
      <div id="card">
        <div class="title">title text</div>
        <noscript class="noscript-el">fallback</noscript>
      </div>
    `);
    const card = document.querySelector<HTMLElement>('#card')!;
    const text = serializeNodeText(card, ['.title', '.noscript-el']);
    expect(text).toBe('title text');
  });
});

describe('serializeElementText — whole-card text', () => {
  it('returns the card text with whitespace collapsed', () => {
    setBody(`<div id="card">  Привіт   світ  </div>`);
    const card = document.querySelector<HTMLElement>('#card')!;
    expect(serializeElementText(card)).toBe('Привіт світ');
  });

  it('skips descendant <script>/<style> and hidden subtrees (no leak into the sample)', () => {
    // SERP cards carry inline scripts and JSON; that text must not pollute the
    // language sample. serializeElementText must skip invisible descendants the
    // same way serializeNodeText does — not just check the root.
    setBody(`
      <div id="card">
        Заголовок результату
        <script>var trackingPayload = { lang: "en" };</script>
        <style>.snippet { color: red }</style>
        <span aria-hidden="true">decorative-glyph</span>
        <span hidden>offscreen-label</span>
        <span style="display:none">collapsed-meta</span>
        <p>Опис сторінки українською</p>
      </div>
    `);
    const card = document.querySelector<HTMLElement>('#card')!;
    const text = serializeElementText(card);
    expect(text).toContain('Заголовок результату');
    expect(text).toContain('Опис сторінки українською');
    expect(text).not.toContain('trackingPayload');
    expect(text).not.toContain('color: red');
    expect(text).not.toContain('decorative-glyph');
    expect(text).not.toContain('offscreen-label');
    expect(text).not.toContain('collapsed-meta');
  });

  it('returns empty string when the card root itself is aria-hidden', () => {
    setBody(`<div id="card" aria-hidden="true">прихований текст</div>`);
    const card = document.querySelector<HTMLElement>('#card')!;
    expect(serializeElementText(card)).toBe('');
  });

  it('returns empty string when the card root is display:none', () => {
    setBody(`<div id="card" style="display:none">невидимий</div>`);
    const card = document.querySelector<HTMLElement>('#card')!;
    expect(serializeElementText(card)).toBe('');
  });

  it('returns empty string when the card root has the hidden attribute', () => {
    setBody(`<div id="card" hidden>прихований</div>`);
    const card = document.querySelector<HTMLElement>('#card')!;
    expect(serializeElementText(card)).toBe('');
  });
});

describe('serializeModelText', () => {
  it('joins all node texts with newlines', () => {
    const model: PageContentModel = {
      extractor: 'test',
      nodes: [
        { el: document.createElement('div'), kind: 'video', hideMode: 'blur', text: 'alpha' },
        { el: document.createElement('div'), kind: 'video', hideMode: 'blur', text: 'beta' },
        { el: document.createElement('div'), kind: 'video', hideMode: 'blur', text: 'gamma' },
      ],
    };
    expect(serializeModelText(model)).toBe('alpha\nbeta\ngamma');
  });

  it('filters out empty node texts', () => {
    const model: PageContentModel = {
      extractor: 'test',
      nodes: [
        { el: document.createElement('div'), kind: 'video', hideMode: 'blur', text: 'alpha' },
        { el: document.createElement('div'), kind: 'video', hideMode: 'blur', text: '' },
        { el: document.createElement('div'), kind: 'video', hideMode: 'blur', text: 'gamma' },
      ],
    };
    expect(serializeModelText(model)).toBe('alpha\ngamma');
  });

  it('returns empty string for an empty model', () => {
    const model: PageContentModel = { extractor: 'test', nodes: [] };
    expect(serializeModelText(model)).toBe('');
  });
});
