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

// ─── Content allow-list vs injected UI-language chrome ──────────────────────

describe('GOOGLE_EXTRACTOR.extract — classifies result content, not chrome', () => {
  it('serializes only the title+snippet, excluding chrome (known or future) for free', () => {
    // Primary path: a rich result card. Being an allow-list, it drops the known
    // chrome (translate link, data-sncf="2" annotations) AND a hypothetical
    // future annotation row — so new chrome needs no ignore-list entry.
    setBody(`
      <div id="rso">
        <div data-hveid="r1">
          <h3>Заголовок результату</h3>
          <a href="https://translate.google.com/translate?u=https://example.com&sl=ru&tl=uk">Перекласти цю сторінку</a>
          <div data-sncf="1">достатньо довгий опис результату власною мовою, що впевнено перевищує поріг довжини у сто символів і веде основним шляхом</div>
          <div data-sncf="2">4,8 оцінка магазину (49 тис.) · Магазин поблизу (3,6 км) · Безкоштовна доставка</div>
          <div data-sncf="9">майбутня чужорідна анотація, якої ще немає у блок-листі</div>
        </div>
      </div>
    `);
    const text = GOOGLE_EXTRACTOR.extract(document).nodes[0]!.text;
    expect(text).toContain('Заголовок результату');
    expect(text).toContain('опис результату власною мовою');
    expect(text).not.toContain('Перекласти'); // translate link
    expect(text).not.toContain('оцінка магазину'); // data-sncf="2" annotations
    expect(text).not.toContain('майбутня чужорідна'); // unknown future chrome — excluded for free
  });

  it('falls back to whole-card-minus-chrome when the snippet anchor is missing', () => {
    // data-sncf="1" rotated away: the allow-list yields only a short title, so we
    // widen to the whole card with the KNOWN chrome (translate link, data-sncf=2)
    // pruned — recovering the body text without re-admitting the chrome.
    setBody(`
      <div id="rso">
        <div data-hveid="r1">
          <h3>Реле напряжения</h3>
          <a href="https://translate.google.com/translate?u=https://x&sl=ru&tl=uk">Перекласти цю сторінку</a>
          <div class="snippet-without-anchor">Реле напряжения отсекатель для защиты приборов в розетку, защита от скачков напряжения в сети</div>
          <div data-sncf="2">4,8 оцінка магазину (49 тис.) · Магазин поблизу · Безкоштовна доставка</div>
        </div>
      </div>
    `);
    const text = GOOGLE_EXTRACTOR.extract(document).nodes[0]!.text;
    expect(text).toContain('защиты приборов'); // body recovered via fallback
    expect(text).not.toContain('Перекласти'); // known chrome still pruned
    expect(text).not.toContain('оцінка магазину');
  });

  it('represents a Rozetka-shaped foreign result by its own content only', () => {
    // The real bug: a Russian shopping result whose only Ukrainian text is
    // Google's injected chrome. Classified on the Russian title+snippet alone.
    setBody(`
      <div id="rso">
        <div data-hveid="CCQQAA">
          <h3>Реле напряжения</h3>
          <a href="https://translate.google.com/translate?u=https://rozetka.com.ua/rele&sl=ru&tl=uk">Перекласти цю сторінку</a>
          <div data-sncf="1">Реле напряжения отсекатель для защиты приборов в розетку HLP02 16А до 3500Вт. Защита от скачков напряжения.</div>
          <div data-sncf="2"><span aria-label="Оцінка 4,8 з 5">4,8</span> оцінка магазину (49 тис.) · Магазин поблизу (3,6 км) · Безкоштовна доставка</div>
        </div>
      </div>
    `);
    const text = GOOGLE_EXTRACTOR.extract(document).nodes[0]!.text;
    expect(text).not.toMatch(/Перекласти|оцінка магазину|поблизу|Безкоштовна/);
    expect(text).toContain('Реле напряжения');
    expect(text).toContain('защиты приборов');
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

// ─── AI Overview extraction ─────────────────────────────────────────────────

describe('GOOGLE_EXTRACTOR.extract — AI Overview (data-rl)', () => {
  it('emits a [data-rl] block as an ai-answer node carrying the declared language', () => {
    setBody(`
      <div data-rl="ru"><p>Реле напряжения — это устройство для защиты техники.</p></div>
      <div id="rso"><div data-hveid="aaa"><h3>Перший результат</h3></div></div>
    `);
    const model = GOOGLE_EXTRACTOR.extract(document);
    const ai = model.nodes.find((n) => n.kind === 'ai-answer');
    expect(ai).toBeDefined();
    expect(ai!.declaredLang).toBe('ru');
    expect(ai!.hideMode).toBe('hide');
    expect(ai!.text).toContain('Реле напряжения');
    expect(model.nodes.filter((n) => n.kind === 'result')).toHaveLength(1);
  });

  it('emits the node before its text streams in (attribute present, block empty)', () => {
    setBody(`<div data-rl="ru"></div>`);
    const model = GOOGLE_EXTRACTOR.extract(document);
    expect(model.nodes).toHaveLength(1);
    expect(model.nodes[0]!.kind).toBe('ai-answer');
    expect(model.nodes[0]!.declaredLang).toBe('ru');
    expect(model.nodes[0]!.text).toBe('');
  });

  it('leaves declaredLang unset when data-rl has no value (text pipeline decides)', () => {
    setBody(`<div data-rl=""><p>Якийсь текст відповіді.</p></div>`);
    const model = GOOGLE_EXTRACTOR.extract(document);
    expect(model.nodes).toHaveLength(1);
    expect(model.nodes[0]!.kind).toBe('ai-answer');
    expect(model.nodes[0]!.declaredLang).toBeUndefined();
  });

  it('climbs from the labeled region to the whole answer unit beside #rso', () => {
    setBody(`
      <div id="page">
        <div id="ai-block">
          <div>Огляд від ШІ</div>
          <div><img alt="" /></div>
          <div><div data-rl="ru"><p>Реле напряжения — это устройство.</p></div></div>
          <div>Показати більше</div>
        </div>
        <div id="rso"><div data-hveid="aaa"><h3>Перший результат</h3></div></div>
      </div>
    `);
    const model = GOOGLE_EXTRACTOR.extract(document);
    const ai = model.nodes.find((n) => n.kind === 'ai-answer');
    expect(ai).toBeDefined();
    // The node is the WHOLE block — header, media, and show-more included —
    // not the inner labeled text region.
    expect(ai!.el.id).toBe('ai-block');
    expect(ai!.declaredLang).toBe('ru');
    expect(ai!.text).toContain('Огляд від ШІ');
    expect(ai!.text).toContain('Реле напряжения');
  });

  it('keeps two labeled blocks as separate nodes with their own declarations', () => {
    setBody(`
      <div id="a1" data-rl="ru">Первый ответ здесь.</div>
      <div id="a2" data-rl="uk">Друга відповідь тут.</div>
      <div id="rso"><div data-hveid="aaa"><h3>Результат</h3></div></div>
    `);
    const model = GOOGLE_EXTRACTOR.extract(document);
    const ai = model.nodes.filter((n) => n.kind === 'ai-answer');
    expect(ai.map((n) => [n.el.id, n.declaredLang])).toEqual([
      ['a1', 'ru'],
      ['a2', 'uk'],
    ]);
  });

  it('skips a labeled element that wraps selected result cards (stays atomic per card)', () => {
    setBody(`
      <div id="rso">
        <div data-rl="ru"><div data-hveid="aaa"><h3>Заголовок</h3></div></div>
      </div>
    `);
    const model = GOOGLE_EXTRACTOR.extract(document);
    expect(model.nodes).toHaveLength(1);
    expect(model.nodes[0]!.kind).toBe('result');
  });

  it('skips a data-rl wrapper that contains the #rso results list (over-broad match)', () => {
    setBody(`
      <div data-rl="ru">
        <div id="rso"><div data-hveid="aaa"><h3>Результат</h3></div></div>
      </div>
    `);
    const model = GOOGLE_EXTRACTOR.extract(document);
    expect(model.nodes).toHaveLength(1);
    expect(model.nodes[0]!.kind).toBe('result');
  });

  it('collapses a data-rl element nested inside a selected result card', () => {
    setBody(`
      <div id="rso">
        <div data-hveid="outer"><h3>Заголовок</h3><span data-rl="ru">цитата</span></div>
      </div>
    `);
    const model = GOOGLE_EXTRACTOR.extract(document);
    expect(model.nodes).toHaveLength(1);
    expect(model.nodes[0]!.kind).toBe('result');
    expect(model.nodes[0]!.declaredLang).toBeUndefined();
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
