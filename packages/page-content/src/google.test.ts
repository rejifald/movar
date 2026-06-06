import { beforeEach, describe, expect, it } from 'vitest';
import { GOOGLE_EXTRACTOR } from './google';

function setBody(html: string): void {
  document.body.innerHTML = html;
}

beforeEach(() => {
  document.body.innerHTML = '';
});

// ─── Host matching ────────────────────────────────────────────────────────

describe('GOOGLE_EXTRACTOR.matches', () => {
  it('matches google.com and the www host', () => {
    expect(GOOGLE_EXTRACTOR.matches('google.com')).toBe(true);
    expect(GOOGLE_EXTRACTOR.matches('www.google.com')).toBe(true);
  });

  it('matches every google ccTLD (SERP structure is identical across them)', () => {
    expect(GOOGLE_EXTRACTOR.matches('google.de')).toBe(true);
    expect(GOOGLE_EXTRACTOR.matches('google.co.uk')).toBe(true);
  });

  it('matches non-SERP google properties too (harmless — extract finds no #rso there)', () => {
    expect(GOOGLE_EXTRACTOR.matches('mail.google.com')).toBe(true);
  });

  it('does not match non-Google hosts or substring lookalikes', () => {
    expect(GOOGLE_EXTRACTOR.matches('example.com')).toBe(false);
    expect(GOOGLE_EXTRACTOR.matches('notgoogle.com')).toBe(false);
  });
});

// ─── Organic result extraction ─────────────────────────────────────────────

describe('GOOGLE_EXTRACTOR.extract — organic results', () => {
  it('anchors each #rso <h3> to its data-hveid card as a hide-mode result node', () => {
    setBody(`
      <div id="rso">
        <div data-hveid="aaa"><h3>Перший результат</h3><span>опис результату</span></div>
        <div data-hveid="bbb"><h3>Другий результат</h3></div>
      </div>
    `);
    const model = GOOGLE_EXTRACTOR.extract(document);
    expect(model.extractor).toBe('google');
    expect(model.nodes).toHaveLength(2);
    for (const node of model.nodes) {
      expect(node.kind).toBe('result');
      expect(node.hideMode).toBe('hide');
    }
    expect(model.nodes[0]!.text).toContain('Перший результат');
    expect(model.nodes[0]!.text).toContain('опис результату');
  });

  it('ignores an <h3> with no data-hveid ancestor (no card boundary to hide)', () => {
    setBody(`<div id="rso"><h3>Заголовок без картки</h3></div>`);
    expect(GOOGLE_EXTRACTOR.extract(document).nodes).toHaveLength(0);
  });

  it('ignores titles outside the #rso results list (anchor is scoped to #rso)', () => {
    setBody(`<div data-hveid="x"><h3>Поза #rso</h3></div>`);
    expect(GOOGLE_EXTRACTOR.extract(document).nodes).toHaveLength(0);
  });

  it('collapses a nested data-hveid (sitelink) into its outer result card', () => {
    setBody(`
      <div id="rso">
        <div data-hveid="outer"><h3>Зовнішній</h3>
          <div data-hveid="inner"><h3>Сайтлінк</h3></div>
        </div>
      </div>
    `);
    const model = GOOGLE_EXTRACTOR.extract(document);
    expect(model.nodes).toHaveLength(1);
    expect(model.nodes[0]!.el.getAttribute('data-hveid')).toBe('outer');
  });

  it('does not climb past the extraction root (closest walks the live tree)', () => {
    // The data-hveid card lives ABOVE the scope root; the h3 is inside it.
    // organicCardFor must reject a card that escapes the root subtree.
    setBody(
      `<div data-hveid="card"><div id="scope"><div id="rso"><h3>Заголовок</h3></div></div></div>`,
    );
    const scope = document.querySelector<HTMLElement>('#scope')!;
    expect(GOOGLE_EXTRACTOR.extract(scope).nodes).toHaveLength(0);
  });
});

// ─── People-also-ask extraction ─────────────────────────────────────────────

describe('GOOGLE_EXTRACTOR.extract — People also ask', () => {
  it('emits one result node per related-question-pair row', () => {
    setBody(`
      <div class="related-question-pair">Що таке тестування?</div>
      <div class="related-question-pair">Як це працює?</div>
    `);
    const model = GOOGLE_EXTRACTOR.extract(document);
    expect(model.nodes).toHaveLength(2);
    expect(model.nodes.every((n) => n.kind === 'result' && n.hideMode === 'hide')).toBe(true);
    expect(model.nodes[0]!.text).toContain('Що таке тестування?');
  });
});

// ─── Empty / non-SERP pages ─────────────────────────────────────────────────

describe('GOOGLE_EXTRACTOR.extract — no results', () => {
  it('returns zero nodes on a page with no #rso results and no PAA', () => {
    setBody(`<div id="searchform"><input name="q" /></div>`);
    const model = GOOGLE_EXTRACTOR.extract(document);
    expect(model.extractor).toBe('google');
    expect(model.nodes).toHaveLength(0);
  });
});
