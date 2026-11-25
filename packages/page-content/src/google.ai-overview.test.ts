import { beforeEach, describe, expect, it } from 'vitest';
import { GOOGLE_EXTRACTOR } from './google';
import { setBody } from './google.test-utils';

beforeEach(() => {
  document.body.innerHTML = '';
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

  it('stops at the answer unit when a sponsored product carousel shares an ancestor (no swallow)', () => {
    // The reported over-cover bug: the AI Overview and a «Рекламовані товари»
    // (data-pla) shopping carousel share a wrapper that sits OUTSIDE #rso. The
    // carousel is not organic/PAA/text-ad, so before it was made a landmark the
    // climb walked past it up to the shared wrapper and the answer's curtain
    // hid the still-valid products too.
    setBody(`
      <div id="page">
        <div id="shared">
          <div id="ai-block">
            <div>Огляд від ШІ</div>
            <div><div data-rl="ru"><p>Реле напряжения — это устройство.</p></div></div>
            <div>Показати більше</div>
          </div>
          <div data-pla="1">
            <div role="heading"><span>Рекламовані товари</span></div>
            <a href="#">Реле напруги ABB</a>
            <a href="#">Реле напруги Hager</a>
          </div>
        </div>
        <div id="rso"><div data-hveid="aaa"><h3>Перший результат</h3></div></div>
      </div>
    `);
    const model = GOOGLE_EXTRACTOR.extract(document);
    const ai = model.nodes.find((n) => n.kind === 'ai-answer');
    expect(ai).toBeDefined();
    // The [data-pla] carousel bounds the climb, so it stops at the answer unit
    // (not the shared wrapper) and the carousel stays out of the concealed block.
    expect(ai!.el.id).toBe('ai-block');
    const carousel = document.querySelector('[data-pla]')!;
    expect(ai!.el.contains(carousel)).toBe(false);
  });

  it('never emits the sponsored product carousel as a node (landmark only)', () => {
    setBody(`
      <div id="page">
        <div id="shared">
          <div id="ai-block"><div data-rl="ru"><p>Ответ на русском здесь.</p></div></div>
          <div data-pla="1"><a href="#">товар</a></div>
        </div>
        <div id="rso"><div data-hveid="aaa"><h3>Результат</h3></div></div>
      </div>
    `);
    const model = GOOGLE_EXTRACTOR.extract(document);
    const carousel = document.querySelector<HTMLElement>('[data-pla]')!;
    // It bounds the climb but is itself never concealed — a carousel mixes many
    // products/languages, so hiding it wholesale would bury valid items.
    expect(model.nodes.some((n) => n.el === carousel || n.el.contains(carousel))).toBe(false);
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

// ─── AI Overview citation cards (sources list) ──────────────────────────────

describe('GOOGLE_EXTRACTOR.extract — AI Overview source cards', () => {
  it('emits one hide-mode ai-answer node per [data-src-id] card', () => {
    setBody(`
      <div data-src-id="7">
        <a aria-label="Что такое реле напряжения. Відкриється в новій вкладці."></a>
        <span data-crb-snippet-text="">Реле напряжения отслеживает отклонения уровня напряжения в сети и отключает нагрузку.</span>
      </div>
    `);
    const model = GOOGLE_EXTRACTOR.extract(document);
    expect(model.nodes).toHaveLength(1);
    expect(model.nodes[0]!.kind).toBe('ai-answer');
    expect(model.nodes[0]!.hideMode).toBe('hide');
  });

  it('classifies a source card from its snippet ALONE, excluding the aria-label chrome and site-name row', () => {
    // The reported bug: the card's only durable text anchor is the snippet — its
    // visible title has none, and the cover-<a>'s aria-label bakes the Russian
    // title together with Google's Ukrainian "opens in new tab" suffix with no
    // separator. Sampling the aria-label (or the whole card, which also carries
    // a Ukrainian site-name row) would flip a short Russian citation to Ukrainian.
    setBody(`
      <div data-src-id="7">
        <a aria-label="Что такое реле напряжения и зачем оно нужно в доме или квартире. Відкриється в новій вкладці."></a>
        <div><span>Что такое реле напряжения и зачем оно нужно в доме или квартире</span></div>
        <span data-crb-snippet-text="">Реле напряжения: отслеживает длительные отклонения уровня напряжения и отключает сеть при выходе за установленные пределы.</span>
        <div><span>Крамниця електротоварів</span></div>
      </div>
    `);
    const text = GOOGLE_EXTRACTOR.extract(document).nodes[0]!.text;
    expect(text).toContain('отслеживает длительные отклонения');
    expect(text).not.toContain('Відкриється'); // aria-label chrome
    expect(text).not.toContain('Крамниця'); // site-name row
  });

  it('creates no node when the snippet anchor is missing (nothing to classify, card untouched)', () => {
    setBody(`
      <div data-src-id="7">
        <a aria-label="Заголовок без сніпету. Відкриється в новій вкладці."></a>
        <div><span>Заголовок без сніпету</span></div>
      </div>
    `);
    expect(GOOGLE_EXTRACTOR.extract(document).nodes).toHaveLength(0);
  });

  it('does not climb past the extraction root (closest walks the live tree)', () => {
    setBody(
      `<div data-src-id="7"><div id="scope"><span data-crb-snippet-text="">текст</span></div></div>`,
    );
    const scope = document.querySelector<HTMLElement>('#scope')!;
    expect(GOOGLE_EXTRACTOR.extract(scope).nodes).toHaveLength(0);
  });

  it('keeps duplicate renderings of the same source (popup + aside) as separate nodes', () => {
    // Google renders the same "N сайтів" sources list twice at once (a hover
    // popup and a persistent aside list) — two distinct DOM cards for one
    // logical source. Both must conceal independently since either may be the
    // one on screen.
    setBody(`
      <ul id="popup">
        <li><div data-src-id="7"><span data-crb-snippet-text="">Реле напряжения отслеживает отклонения уровня напряжения в сети.</span></div></li>
      </ul>
      <ul id="aside">
        <li><div data-src-id="7"><span data-crb-snippet-text="">Реле напряжения отслеживает отклонения уровня напряжения в сети.</span></div></li>
      </ul>
    `);
    const model = GOOGLE_EXTRACTOR.extract(document);
    expect(model.nodes).toHaveLength(2);
    expect(model.nodes.every((n) => n.kind === 'ai-answer')).toBe(true);
  });

  it('coexists with an unrelated organic result on the same page', () => {
    setBody(`
      <div data-src-id="7"><span data-crb-snippet-text="">Джерело українською мовою про реле напруги в мережі.</span></div>
      <div id="rso"><div data-hveid="aaa"><h3>Перший результат</h3></div></div>
    `);
    const model = GOOGLE_EXTRACTOR.extract(document);
    expect(model.nodes.filter((n) => n.kind === 'ai-answer')).toHaveLength(1);
    expect(model.nodes.filter((n) => n.kind === 'result')).toHaveLength(1);
  });
});
