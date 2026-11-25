import { beforeEach, describe, expect, it } from 'vitest';
import { GOOGLE_EXTRACTOR } from './google';
import { setBody } from './google.test-utils';

beforeEach(() => {
  document.body.innerHTML = '';
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

  // The live regression: a lang="ru" product card carrying an inline thumbnail
  // row. Google puts the thumbnails in data-sncf="1" (the snippet's usual slot)
  // and shifts the Russian snippet to data-sncf="2" — where the old whole-card
  // fallback pruned it as "chrome" while re-admitting the Ukrainian pivots and
  // rich-annotation. A declared card classifies allow-list-ONLY, so the
  // unreachable snippet yields empty text and the fused gate decides on the
  // lang="ru" label rather than on leaked UI chrome.
  it('image-carrying card: empty text when the snippet slot is shifted (leans on the declaration)', () => {
    setBody(`
      <div id="rso"><div id="row" class="MjjYud"><div data-dsrp="X" lang="ru">
        <div><div data-hveid="H">
          <div data-snf="x5WNvb"><div role="heading" aria-level="3"><span>Реле напряжения</span></div></div>
          <div data-snf="pXOgFf" data-sncf="1"><a aria-label="зображення"><img alt=""><img alt=""></a></div>
          <div data-snf="nke7rc" data-sncf="2"><div>Реле напряжения отсекатель берет на себя функцию непрерывного мониторинга сети</div></div>
          <div data-snf="mCCBcf" data-sncf="3"><div>4,8 оцінка магазину · Магазин поблизу · Безкоштовна доставка</div></div>
          <div style="grid-area:bvRFlf"><div role="heading" aria-level="4">Люди також шукають</div><a>реле відсікач напруги</a></div>
        </div></div>
      </div></div></div>
    `);
    const node = GOOGLE_EXTRACTOR.extract(document).nodes[0]!;
    expect(node.declaredLang).toBe('ru');
    // Snippet unreachable via the ordinal allow-list AND no chrome-readmitting
    // fallback → empty sample; the ru declaration carries the hide.
    expect(node.text).toBe('');
  });

  // Even with no thumbnail row, a short snippet (below the whole-card fallback's
  // min-chars bar) must not drag in the Ukrainian pivots. Allow-list-only means
  // the sample is the snippet alone — here confidently Russian, so it stays a
  // hide candidate instead of flipping to the interface language.
  it('text-only short snippet: samples the snippet alone, never the pivots chrome', () => {
    setBody(`
      <div id="rso"><div id="row" class="MjjYud"><div data-dsrp="X" lang="ru">
        <div><div data-hveid="H">
          <div data-snf="x5WNvb"><div role="heading" aria-level="3"><span>Реле напряжения</span></div></div>
          <div data-snf="nke7rc" data-sncf="1"><div>Реле напряжения отсекатель для дома</div></div>
          <div data-snf="mCCBcf" data-sncf="2"><div>4,8 оцінка магазину · Безкоштовна доставка</div></div>
          <div style="grid-area:bvRFlf"><div role="heading" aria-level="4">Люди також шукають</div><a>реле відсікач напруги</a><a>купити реле напруги</a></div>
        </div></div>
      </div></div></div>
    `);
    const text = GOOGLE_EXTRACTOR.extract(document).nodes[0]!.text;
    expect(text).toContain('отсекатель'); // the result's own snippet
    expect(text).not.toContain('Люди також'); // pivots chrome excluded
    expect(text).not.toContain('оцінка магазину'); // rich-annotation chrome excluded
  });
});

// ─── Translate-link declared language (Google's own `sl` verdict) ───────────

/** A result card carrying Google's "Translate this page" link. */
function cardWithTranslate(href: string, snippet: string): string {
  return `
    <div id="rso">
      <div data-hveid="r1">
        <h3>Реле напряжения ColorWay DS1</h3>
        <a href="${href}">Перекласти цю сторінку</a>
        <div data-sncf="1">${snippet}</div>
      </div>
    </div>
  `;
}

/** A real shop card's content: product names and model numbers, carrying no
 *  Russian-distinctive letter and too little prose for franc to clear the bar. */
const SPEC_NOISE =
  'Реле напряжения (23 товара) · Реле напряжения ColorWay DS1, white (CW-VR16-01D) · ZUBR D32';

describe('GOOGLE_EXTRACTOR.extract — translate-link declared language', () => {
  it('reads sl= as the card declared language', () => {
    // The signal that decides a shop card whose own text is product-spec noise:
    // no distinctive letters for rungs 1-2, and too little prose for franc to
    // clear the hide bar. Google emits this link only for a result that is NOT
    // in the interface language, so `sl` is a real declaration.
    setBody(
      cardWithTranslate(
        'https://translate.google.com/translate?u=https://brain.com.ua&sl=ru&tl=uk&client=search',
        SPEC_NOISE,
      ),
    );
    expect(GOOGLE_EXTRACTOR.extract(document).nodes[0]!.declaredLang).toBe('ru');
  });

  it('normalizes the code, so a regional sl still lands on the base language', () => {
    setBody(
      cardWithTranslate(
        'https://translate.google.com/translate?u=https://x&sl=ru-RU&tl=uk',
        SPEC_NOISE,
      ),
    );
    expect(GOOGLE_EXTRACTOR.extract(document).nodes[0]!.declaredLang).toBe('ru');
  });

  it('leaves declaredLang unset when the card has no translate link', () => {
    // The normal case for a result already in the interface language — an
    // ABSENT link is not evidence of anything, least of all of being local.
    setBody(`
      <div id="rso">
        <div data-hveid="r1">
          <h3>Реле напруги — купити в Україні</h3>
          <div data-sncf="1">Реле напруги захищає побутову техніку від перепадів у мережі.</div>
        </div>
      </div>
    `);
    expect(GOOGLE_EXTRACTOR.extract(document).nodes[0]!.declaredLang).toBeUndefined();
  });

  it.each([
    ['no sl param', 'https://translate.google.com/translate?u=https://x&tl=uk'],
    ['an unparseable href', 'not a url at all'],
    ['an unknown language code', 'https://translate.google.com/translate?u=https://x&sl=zzz&tl=uk'],
  ])('fails open on %s — the text pipeline decides alone', (_label, href) => {
    setBody(cardWithTranslate(href, SPEC_NOISE));
    expect(GOOGLE_EXTRACTOR.extract(document).nodes[0]!.declaredLang).toBeUndefined();
  });

  it('still widens to the whole-card fallback when the snippet anchor rotated', () => {
    // Load-bearing, and the opposite of how a `lang`/`data-rl` declaration
    // behaves: `sl` must only ADD evidence, never narrow the sample. Were it to
    // narrow, a card with a WRONG `sl` and a rotated snippet anchor would be
    // left with a title too thin to correct it, and a mislabeled Ukrainian
    // result would be concealed on Google's say-so — the exact direction
    // docs/per-snippet-language-detection.md forbids.
    setBody(`
      <div id="rso">
        <div data-hveid="r1">
          <h3>Заголовок</h3>
          <a href="https://translate.google.com/translate?u=https://x&sl=ru&tl=uk">Перекласти цю сторінку</a>
          <div class="snippet-without-anchor">реле напруги захищає техніку від перепадів у мережі</div>
          <div data-sncf="2">4,8 оцінка магазину · Безкоштовна доставка</div>
        </div>
      </div>
    `);
    const node = GOOGLE_EXTRACTOR.extract(document).nodes[0]!;
    expect(node.text).toContain('захищає техніку'); // body recovered via fallback
    expect(node.text).not.toContain('Перекласти'); // the link is still chrome here
    expect(node.text).not.toContain('оцінка магазину');
    expect(node.declaredLang).toBe('ru'); // and the declaration rides along
  });

  it("lets the card's own lang attribute win over the translate link", () => {
    // Both are Google's labels, but `lang` labels THIS card's content while
    // `sl` labels Google's read of the destination page — so `lang` wins.
    //
    // The clash is only reachable on a product card (title is a role="heading"
    // div, no <h3>), which is what `lang` anchors on: on an ordinary <h3> card
    // the element carrying `lang` IS the already-selected atomic unit, and
    // collectDeclaredResults skips those, so no clash arises there.
    setBody(`
      <div id="rso">
        <div id="row">
          <div lang="uk">
            <div data-hveid="CHcQAA">
              <div role="heading" aria-level="3"><span>Реле напруги</span></div>
              <a href="https://translate.google.com/translate?u=https://x&sl=ru&tl=uk">Перекласти цю сторінку</a>
              <div data-sncf="1">Реле напруги захищає побутову техніку від перепадів у мережі.</div>
            </div>
          </div>
        </div>
      </div>
    `);
    expect(GOOGLE_EXTRACTOR.extract(document).nodes[0]!.declaredLang).toBe('uk');
  });
});
