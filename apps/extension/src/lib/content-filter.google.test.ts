import { describe, expect, it, vi } from 'vitest';
import '@movar/page-content/google';
import '@movar/page-content/youtube';
import { applyContentFilter } from './content-conceal';
import { buildModelForHost } from '@movar/page-content/registry';
import { testContentPresenter } from './dom.test-utils';
import {
  directClassify,
  FILTER_LANGS,
  runFilter,
  setBody,
  gCard,
  gSerp,
} from './content-filter.test-utils';

// A Google product/shopping result the way the real SERP renders it: NO <h3>
// (the title is a role="heading" div), a data-sncf="1" snippet prefixed with a
// localized date, a data-sncf="2" rich-annotation chrome row, all under a
// lang-tagged block. The #rso <h3> anchor misses it entirely; the extractor
// recovers it via the lang attribute and carries the declaration.
function gProductCard(lang: string, title: string, snippet = '', id?: string): string {
  return `
    <div${id != null && id !== '' ? ` id="${id}"` : ''}>
      <div lang="${lang}">
        <div data-hveid="CHcQAA">
          <a href="#"><div role="heading" aria-level="3"><div role="link"><span>${title}</span></div></div></a>
          ${snippet === '' ? '' : `<div data-sncf="1"><span><span>25 квіт. 2026 р.</span> — </span>${snippet}</div>`}
          <div data-sncf="2">4,8 оцінка магазину (47 тис.) · Магазин поблизу (2,1 км) · Безкоштовна доставка</div>
        </div>
      </div>
    </div>`;
}

function aiOverview(lang: string, text: string): string {
  return `<div data-rl="${lang}" id="ai-overview"><p>${text}</p></div>`;
}

describe('Google SERP cards', () => {
  it('curtains a result card whose title and snippet are Russian', async () => {
    setBody(
      gSerp(
        gCard('Купить картину в Москве', 'Большой выбор картин разных стилей и эпох.', 'ru-card'),
        gCard('Купити картину в Києві', 'Великий вибір картин різних стилів та епох.', 'uk-card'),
      ),
    );
    const model = buildModelForHost('www.google.com')!;
    const hits = await runFilter(model, ['ru']);
    expect(hits).toHaveLength(1);
    expect(document.querySelector<HTMLElement>('#ru-card')!.style.display).toBe('');
    expect(document.querySelector<HTMLElement>('#ru-card')!.dataset['movarContentBlurred']).toBe(
      'ru',
    );
    expect(document.querySelector<HTMLElement>('#uk-card')!.style.display).toBe('');
  });

  it('leaves English / Latin-script cards alone', async () => {
    setBody(
      gSerp(
        gCard('Buy artwork online', 'A wide selection of paintings from many eras.', 'en-card'),
      ),
    );
    const model = buildModelForHost('www.google.com')!;
    const hits = await runFilter(model, ['ru']);
    expect(hits).toHaveLength(0);
    expect(document.querySelector<HTMLElement>('#en-card')!.style.display).toBe('');
  });

  it('is idempotent across repeated calls', async () => {
    setBody(gSerp(gCard('Что-то по-русски', 'Какой-то очень русский текст здесь.', 'ru-card')));
    const first = await runFilter(buildModelForHost('www.google.com')!, ['ru']);
    const second = await runFilter(buildModelForHost('www.google.com')!, ['ru']);
    expect(first).toHaveLength(1);
    expect(second).toHaveLength(0);
  });

  it('does nothing when blocked is empty', async () => {
    setBody(
      gSerp(
        gCard('Какой-то русский текст', 'Большой русский текст здесь для надёжной классификации.'),
      ),
    );
    const hits = await runFilter(buildModelForHost('www.google.com')!, []);
    expect(hits).toHaveLength(0);
  });
});

describe('Product/shopping results — declared-language evidence (lang, no <h3>)', () => {
  const RU_SNIPPET =
    'Реле напряжения отсекатель берет на себя функцию непрерывного мониторинга сети: оно мгновенно обесточивает подключенные приборы при выходе за пределы нормы.';

  it('conceals a declared-Russian product card that has no <h3> (the reported bug)', async () => {
    setBody(gSerp(gProductCard('ru', 'Реле напряжения', RU_SNIPPET, 'ru-shop')));
    const hits = await runFilter(buildModelForHost('www.google.com')!, ['ru']);
    expect(hits).toHaveLength(1);
    expect(hits[0]!.kind).toBe('result');
    expect(hits[0]!.fromLang).toBe('ru');
    // The hidden unit is the whole result row, tagged with the language.
    expect(document.querySelector<HTMLElement>('#ru-shop')!.dataset['movarContentBlurred']).toBe(
      'ru',
    );
  });

  it('conceals on the declaration alone before the snippet streams in (title-only text is unknown)', async () => {
    // A role="heading" title with no distinctive letters classifies as unknown;
    // only lang="ru" decides. This is exactly the card a text-only path can't hide.
    setBody(gSerp(gProductCard('ru', 'Реле напряжения', '', 'ru-shop')));
    const hits = await runFilter(buildModelForHost('www.google.com')!, ['ru']);
    expect(hits).toHaveLength(1);
    expect(hits[0]!.fromLang).toBe('ru');
  });

  it('conceals in hide mode too (display:none on the row, no curtain)', async () => {
    setBody(gSerp(gProductCard('ru', 'Реле напряжения', RU_SNIPPET, 'ru-shop')));
    const hits = await runFilter(buildModelForHost('www.google.com')!, ['ru'], 'hide');
    expect(hits).toHaveLength(1);
    expect(document.querySelector<HTMLElement>('#ru-shop')!.style.display).toBe('none');
  });

  it('keeps a declared-Ukrainian product card (declaration ⇒ uk, not blocked)', async () => {
    setBody(
      gSerp(
        gProductCard(
          'uk',
          'Реле напруги',
          'Реле напруги відсікач бере на себе функцію моніторингу мережі та захищає прилади від стрибків.',
          'uk-shop',
        ),
      ),
    );
    const hits = await runFilter(buildModelForHost('www.google.com')!, ['ru']);
    expect(hits).toHaveLength(0);
    expect(
      document.querySelector<HTMLElement>('#uk-shop')!.dataset['movarContentBlurred'],
    ).toBeUndefined();
  });

  it('keeps the card when Russian is among the enabled languages', async () => {
    setBody(gSerp(gProductCard('ru', 'Реле напряжения', RU_SNIPPET, 'ru-shop')));
    const hits = await runFilter(buildModelForHost('www.google.com')!, []);
    expect(hits).toHaveLength(0);
  });
});

// Note: 'filterContentByLanguage — YouTube grid items' was deleted in PR 2.
// YouTube nodes use hideMode:'blur', not the flat-hide path exercised by the
// old filterContentByLanguage. All behavioral coverage lives in the
// 'applyContentFilter — YouTube blur behavior' describe group below.

describe('AI Overview — declared-language evidence (data-rl)', () => {
  it('conceals a declared-Russian answer, fusing the declaration through the classifier', async () => {
    const classify = vi.fn(directClassify);
    setBody(aiOverview('ru', 'Реле напряжения — это устройство для защиты техники.'));
    const hits = await applyContentFilter(buildModelForHost('www.google.com')!, {
      candidateCodes: FILTER_LANGS,
      enabled: new Set(['uk', 'en']),
      classify,
      concealMode: 'curtain',
      presenter: testContentPresenter,
    });
    expect(hits).toHaveLength(1);
    expect(hits[0]!.kind).toBe('ai-answer');
    expect(hits[0]!.fromLang).toBe('ru');
    // The declaration is evidence now, not a short-circuit: it rides the batch.
    expect(classify).toHaveBeenCalledTimes(1);
    expect(
      document.querySelector<HTMLElement>('#ai-overview')!.dataset['movarContentBlurred'],
    ).toBe('ru');
  });

  it('conceals the whole answer unit — header and chrome included, not just the labeled region', async () => {
    setBody(`
      <div id="ai-block">
        <div>Огляд від ШІ</div>
        <div data-rl="ru"><p>Реле напряжения — это устройство для защиты техники.</p></div>
        <div>Показати більше</div>
      </div>
      ${gSerp(gCard('Реле напруги', 'Пристрій для захисту техніки від стрибків напруги.', 'uk-card'))}
    `);
    const hits = await runFilter(buildModelForHost('www.google.com')!, ['ru']);
    expect(hits).toHaveLength(1);
    expect(document.querySelector<HTMLElement>('#ai-block')!.dataset['movarContentBlurred']).toBe(
      'ru',
    );
    expect(document.querySelector<HTMLElement>('#uk-card')!.style.display).toBe('');
  });

  it('conceals a declared-Russian answer whose text has not streamed in yet', async () => {
    setBody(`<div data-rl="ru" id="ai-overview"></div>`);
    const hits = await runFilter(buildModelForHost('www.google.com')!, ['ru']);
    expect(hits).toHaveLength(1);
    expect(hits[0]!.kind).toBe('ai-answer');
  });

  it('normalizes a region-qualified declaration (ru-RU) before deciding', async () => {
    setBody(`<div data-rl="ru-RU" id="ai-overview"></div>`);
    const hits = await runFilter(buildModelForHost('www.google.com')!, ['ru']);
    expect(hits).toHaveLength(1);
    expect(hits[0]!.fromLang).toBe('ru');
  });

  it('keeps an answer whose declaration names an enabled language, marking it CHECKED', async () => {
    setBody(aiOverview('uk', 'Реле напруги — це пристрій для захисту техніки.'));
    const hits = await runFilter(buildModelForHost('www.google.com')!, ['ru']);
    expect(hits).toHaveLength(0);
    const card = document.querySelector<HTMLElement>('#ai-overview')!;
    expect(card.dataset['movarContentChecked']).toBe('true');
    expect(card.dataset['movarContentBlurred']).toBeUndefined();
  });

  it('keeps a declared-Russian answer when Russian is among the enabled languages', async () => {
    setBody(aiOverview('ru', 'Реле напряжения — это устройство для защиты техники.'));
    const hits = await runFilter(buildModelForHost('www.google.com')!, []);
    expect(hits).toHaveLength(0);
  });

  it('falls back to text classification when the declared value is unrecognized', async () => {
    const classify = vi.fn(directClassify);
    setBody(aiOverview('zz-XX', 'Большой выбор реле напряжения разных типов и классов защиты.'));
    const hits = await applyContentFilter(buildModelForHost('www.google.com')!, {
      candidateCodes: FILTER_LANGS,
      enabled: new Set(['uk', 'en']),
      classify,
      concealMode: 'curtain',
      presenter: testContentPresenter,
    });
    expect(hits).toHaveLength(1);
    expect(hits[0]!.fromLang).toBe('ru');
    expect(classify).toHaveBeenCalledTimes(1);
  });

  // The point of declaration-as-evidence: a confident text read overrides a
  // mislabel, in both directions.
  it('keeps a Russian-declared block whose text is confidently Ukrainian (text overrides mislabel)', async () => {
    setBody(
      aiOverview('ru', 'Реле напруги — це надійний пристрій, що захищає техніку від стрибків.'),
    );
    const hits = await runFilter(buildModelForHost('www.google.com')!, ['ru']);
    expect(hits).toHaveLength(0);
    expect(
      document.querySelector<HTMLElement>('#ai-overview')!.dataset['movarContentBlurred'],
    ).toBeUndefined();
  });

  it('conceals a Ukrainian-declared block whose text is confidently Russian (text overrides mislabel)', async () => {
    setBody(aiOverview('uk', 'Реле напряжения — это очень мощное устройство для защиты техники.'));
    const hits = await runFilter(buildModelForHost('www.google.com')!, ['ru']);
    expect(hits).toHaveLength(1);
    expect(hits[0]!.fromLang).toBe('ru');
  });

  it('leaves a declaration-only keep UNMARKED, re-fusing once its text streams in', async () => {
    setBody(`<div data-rl="uk" id="ai-overview"></div>`);
    const first = await runFilter(buildModelForHost('www.google.com')!, ['ru']);
    expect(first).toHaveLength(0);
    const card = document.querySelector<HTMLElement>('#ai-overview')!;
    // Not marked CHECKED: a declaration-only keep must be revisited when text lands.
    expect(card.dataset['movarContentChecked']).toBeUndefined();
    // Russian streams into the uk-declared block; the next tick re-fuses and hides it.
    card.innerHTML = '<p>Реле напряжения — это устройство для защиты техники.</p>';
    const second = await runFilter(buildModelForHost('www.google.com')!, ['ru']);
    expect(second).toHaveLength(1);
    expect(second[0]!.fromLang).toBe('ru');
  });
});

// ─── applyContentFilter tests — use buildModelForHost for YT model ────────
//
// All behavioral assertions are preserved. The API shape changes from
// runFilter(SiteContentFilter, blocked) to
// runFilter(PageContentModel, blocked), so we build the model via
// buildModelForHost and pass it in.
