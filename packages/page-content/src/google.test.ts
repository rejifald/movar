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

  it('represents a shopping-result-shaped foreign result by its own content only', () => {
    // The real bug: a Russian shopping result whose only Ukrainian text is
    // Google's injected chrome. Classified on the Russian title+snippet alone.
    setBody(`
      <div id="rso">
        <div data-hveid="CCQQAA">
          <h3>Реле напряжения</h3>
          <a href="https://translate.google.com/translate?u=https://shop.example/rele&sl=ru&tl=uk">Перекласти цю сторінку</a>
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

// ─── Sponsored text ads ─────────────────────────────────────────────────────

describe('GOOGLE_EXTRACTOR.extract — sponsored ads', () => {
  it('emits one hide-mode ad node per [data-text-ad] card', () => {
    setBody(`
      <div id="tads">
        <div data-text-ad="1" data-hveid="ad1">
          <div role="heading" aria-level="3"><span>Перше оголошення</span></div>
        </div>
      </div>
      <div id="bottomads">
        <div data-text-ad="1" data-hveid="ad2">
          <div role="heading" aria-level="3"><span>Друге оголошення</span></div>
        </div>
      </div>
    `);
    const model = GOOGLE_EXTRACTOR.extract(document);
    expect(model.nodes).toHaveLength(2);
    for (const node of model.nodes) {
      expect(node.kind).toBe('ad');
      expect(node.hideMode).toBe('hide');
    }
    expect(model.nodes[0]!.text).toContain('Перше оголошення');
  });

  it('classifies an ad from its headline ALONE, excluding the injected location extension', () => {
    // The real bug: a Russian ad whose Google-injected location extension
    // (address, weekday hours, visit count) is rendered in the Ukrainian Search
    // UI. Whole-card text is Ukrainian-dominant and would flip the verdict; the
    // headline-only sample stays Russian.
    setBody(`
      <div id="tads">
        <div data-text-ad="1">
          <a href="https://shop.example/">
            <div role="heading" aria-level="3"><span>Электротовары — интернет-магазин качественной электрики</span></div>
          </a>
          <div class="p4wth">Электротовары — качественная электропродукция для дома и офиса</div>
          <div class="m7Bbyf">
            <span>вул. Прикладна, 1, Київ</span>
            <span>Відчинено сьогодні · 09:00–19:00</span>
            <div>понеділок</div><div>вівторок</div><div>середа</div><div>четвер</div>
            <div>пʼятниця</div><div>субота</div><div>неділя</div>
            <div>Понад 100 000 відвідувань за останній місяць</div>
          </div>
        </div>
      </div>
    `);
    const text = GOOGLE_EXTRACTOR.extract(document).nodes[0]!.text;
    expect(text).toContain('качественной электрики'); // Russian headline
    expect(text).not.toContain('Прикладна'); // injected address
    expect(text).not.toContain('Відчинено'); // injected opening hours
    expect(text).not.toContain('відвідувань'); // injected visit count
    expect(text).not.toContain('электропродукция'); // description has no durable anchor — not sampled
  });

  it('fails open when the headline is absent (empty text → kept, never a whole-card read)', () => {
    // No [role="heading"] to anchor on: the allow-list yields nothing and — with
    // no whole-card fallback — the ad's localized chrome stays out. Empty text
    // classifies as unknown downstream, so the ad is kept rather than mislabelled.
    setBody(`
      <div id="tads">
        <div data-text-ad="1">
          <div class="m7Bbyf"><span>вул. Прикладна, 1, Київ</span></div>
        </div>
      </div>
    `);
    const model = GOOGLE_EXTRACTOR.extract(document);
    expect(model.nodes).toHaveLength(1);
    expect(model.nodes[0]!.kind).toBe('ad');
    expect(model.nodes[0]!.text).toBe('');
  });

  it('matches ads by attribute presence, not the "1" value', () => {
    setBody(`
      <div data-text-ad data-hveid="ad0">
        <div role="heading" aria-level="3"><span>Оголошення без значення</span></div>
      </div>
    `);
    const model = GOOGLE_EXTRACTOR.extract(document);
    expect(model.nodes).toHaveLength(1);
    expect(model.nodes[0]!.kind).toBe('ad');
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

  it('normalizes a BCP-47 label at extraction (ru-RU → ru)', () => {
    setBody(`<div data-rl="ru-RU"><p>Текст ответа.</p></div>`);
    const model = GOOGLE_EXTRACTOR.extract(document);
    expect(model.nodes[0]!.declaredLang).toBe('ru');
  });

  it('drops an unrecognized label so the text pipeline decides (zz-XX)', () => {
    setBody(`<div data-rl="zz-XX"><p>Текст ответа.</p></div>`);
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
    // The concealed element is the WHOLE block — header, media, and show-more
    // included — not the inner labeled region.
    expect(ai!.el.id).toBe('ai-block');
    expect(ai!.declaredLang).toBe('ru');
    // …but the classification text is the labeled region only: the answer, with
    // the block's localized UI chrome kept OUT of the language sample so it can't
    // pull the read toward the interface language.
    expect(ai!.text).toContain('Реле напряжения');
    expect(ai!.text).not.toContain('Огляд від ШІ');
    expect(ai!.text).not.toContain('Показати більше');
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

// ─── Declared-language results (lang attribute, no <h3>) ────────────────────

describe('GOOGLE_EXTRACTOR.extract — declared-language results (lang, no <h3>)', () => {
  // The reported bug: a Russian product/shopping result whose title is a
  // role="heading" div (NOT an <h3>), so the #rso <h3> anchor misses the card
  // entirely and it is never filtered. Google tags it with lang="ru"; we anchor
  // on that. The result row (the #rso child, reached by climb — not by its
  // rotating styling class) is the hide unit, carrying the declaration.
  const REAL_SHAPE = `
    <div id="rso">
      <div id="row" class="MjjYud">
        <div data-dsrp="EAIaDRIL" lang="ru">
          <div>
            <div data-hveid="CHcQAA">
              <a href="https://shop.example/rele">
                <h2>Результати веб-пошуку</h2>
                <div role="heading" aria-level="3"><div role="link"><span>Реле напряжения</span></div></div>
              </a>
              <div data-sncf="1"><span><span>25 квіт. 2026 р.</span> — </span>Реле напряжения отсекатель берет на себя функцию непрерывного мониторинга сети: оно мгновенно обесточивает подключенные приборы при выходе за пределы нормы</div>
              <div data-sncf="2">4,8 оцінка магазину (47 тис.) · Магазин поблизу (2,1 км) · Безкоштовна доставка</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  it('extracts a no-<h3> product card via lang, as a result node carrying the declaration', () => {
    setBody(REAL_SHAPE);
    const model = GOOGLE_EXTRACTOR.extract(document);
    expect(model.nodes).toHaveLength(1);
    const node = model.nodes[0]!;
    expect(node.kind).toBe('result');
    expect(node.hideMode).toBe('hide');
    expect(node.declaredLang).toBe('ru');
    // The concealed element is the whole result row, reached by climb — not the
    // rotating .MjjYud class and not the inner labeled div.
    expect(node.el.id).toBe('row');
  });

  it('classifies the card on its own title+snippet, excluding the rich-annotation chrome', () => {
    setBody(REAL_SHAPE);
    const text = GOOGLE_EXTRACTOR.extract(document).nodes[0]!.text;
    expect(text).toContain('Реле напряжения');
    expect(text).toContain('мониторинга сети');
    expect(text).not.toMatch(/оцінка магазину|поблизу|Безкоштовна/); // data-sncf="2" chrome
    expect(text).not.toContain('Результати веб-пошуку'); // section label, not this result's content
  });

  it('normalizes a region-qualified lang (ru-RU → ru) at extraction', () => {
    setBody(`
      <div id="rso">
        <div id="row"><div lang="ru-RU"><div data-hveid="x">
          <div role="heading"><span>Реле напряжения</span></div>
        </div></div></div>
      </div>
    `);
    expect(GOOGLE_EXTRACTOR.extract(document).nodes[0]!.declaredLang).toBe('ru');
  });

  it('emits the node before its text streams in (lang present, card empty)', () => {
    setBody(
      `<div id="rso"><div id="row"><div lang="ru"><div data-hveid="x"></div></div></div></div>`,
    );
    const model = GOOGLE_EXTRACTOR.extract(document);
    expect(model.nodes).toHaveLength(1);
    expect(model.nodes[0]!.declaredLang).toBe('ru');
    expect(model.nodes[0]!.text).toBe('');
  });

  it('leaves declaredLang unset when the lang value is unrecognized (text pipeline decides)', () => {
    setBody(`
      <div id="rso">
        <div id="row"><div lang="zz-XX"><div data-hveid="x">
          <div role="heading"><span>Реле напряжения</span></div>
        </div></div></div>
      </div>
    `);
    const model = GOOGLE_EXTRACTOR.extract(document);
    expect(model.nodes).toHaveLength(1);
    expect(model.nodes[0]!.declaredLang).toBeUndefined();
  });

  it('ignores a lang attribute OUTSIDE the #rso results list (scope guard)', () => {
    setBody(
      `<div lang="ru"><div data-hveid="x"><div role="heading"><span>Поза #rso</span></div></div></div>`,
    );
    expect(GOOGLE_EXTRACTOR.extract(document).nodes).toHaveLength(0);
  });

  it('keeps a Ukrainian-declared product card a keep candidate (declaration ⇒ uk)', () => {
    setBody(`
      <div id="rso">
        <div id="row"><div lang="uk"><div data-hveid="x">
          <div role="heading"><span>Реле напруги</span></div>
        </div></div></div>
      </div>
    `);
    const node = GOOGLE_EXTRACTOR.extract(document).nodes[0]!;
    expect(node.kind).toBe('result');
    expect(node.declaredLang).toBe('uk');
  });

  it('stays atomic per-card when a lang wrapper encloses an <h3> result (no wholesale hide)', () => {
    // A lang="ru" wrapper around a normal <h3> organic result must NOT collapse
    // to one wrapper node — the per-<h3> card already handles it atomically.
    setBody(`
      <div id="rso">
        <div lang="ru">
          <div data-hveid="a"><h3>Перший</h3><div data-sncf="1">опис перший достатньої довжини</div></div>
          <div data-hveid="b"><h3>Другий</h3><div data-sncf="1">опис другий достатньої довжини</div></div>
        </div>
      </div>
    `);
    const model = GOOGLE_EXTRACTOR.extract(document);
    expect(model.nodes).toHaveLength(2);
    expect(model.nodes.every((n) => n.kind === 'result')).toBe(true);
    // The h3 cards are text-classified; the wrapper's declaration is not force-fed.
    expect(model.nodes.every((n) => n.declaredLang === undefined)).toBe(true);
  });

  it('collapses an inner lang quote into the outer product card (outermost declaration wins)', () => {
    setBody(`
      <div id="rso">
        <div id="row"><div lang="ru"><div data-hveid="x">
          <div role="heading"><span>Реле напряжения</span></div>
          <div data-sncf="1">Реле напряжения <span lang="en">voltage relay</span> для защиты</div>
        </div></div></div>
      </div>
    `);
    const model = GOOGLE_EXTRACTOR.extract(document);
    expect(model.nodes).toHaveLength(1);
    expect(model.nodes[0]!.el.id).toBe('row');
    expect(model.nodes[0]!.declaredLang).toBe('ru');
  });

  it('when a result has BOTH <h3> and a lang wrapper, the <h3> card wins and stays atomic', () => {
    // The <h3> anchor already found the data-hveid card, so its enclosing lang
    // wrapper wraps a selected card and is skipped (same guard as data-rl). One
    // node, keyed on the data-hveid card — no wholesale hide of the outer row.
    setBody(`
      <div id="rso">
        <div id="row"><div lang="ru"><div data-hveid="x">
          <h3>Реле напряжения</h3>
          <div data-sncf="1">опис результату достатньої довжини для класифікації</div>
        </div></div></div>
      </div>
    `);
    const model = GOOGLE_EXTRACTOR.extract(document);
    expect(model.nodes).toHaveLength(1);
    expect(model.nodes[0]!.el.getAttribute('data-hveid')).toBe('x');
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
