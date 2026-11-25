import { beforeEach, describe, expect, it } from 'vitest';
import { classifyBySnippet, getProfiles } from '@movar/lang-detect';
import type { LanguageCode } from '@movar/lang-detect';
import { francRung3Resolver } from '@movar/lang-detect/franc';
import type { SnippetClassifier } from './content-conceal';
import { clearAllMarks, isConcealed, applyContentFilter } from './content-conceal';
import type { ContentNode, PageContentModel } from '@movar/page-content/types';
import { directClassify, FILTER_LANGS, runFilter, makeNode } from './content-conceal.test-utils';

/** A one-node, flat-hide PageContentModel from `text` — for franc-tier tests. */
function oneNodeModel(text: string): PageContentModel {
  const el = document.createElement('div');
  document.body.append(el);
  return { extractor: 'test', nodes: [makeNode(el, { hideMode: 'hide', text })] };
}

function findRevealButton(el: HTMLElement): HTMLButtonElement | null {
  const host = el.querySelector<HTMLElement>('[data-movar-curtain]');
  if (!host?.shadowRoot) return null;
  return host.shadowRoot.querySelector<HTMLButtonElement>('button');
}

/** A Google-shaped result card carrying a page declaration, appended to the
 *  document so the conceal path has a real element to hide. */
function declaredNode(
  text: string,
  declared: LanguageCode,
): { el: HTMLElement; node: ContentNode } {
  const el = document.createElement('div');
  el.textContent = text;
  document.body.append(el);
  return { el, node: { el, kind: 'result', hideMode: 'hide', text, declaredLang: declared } };
}

beforeEach(() => {
  document.body.innerHTML = '';
});

// ─── isConcealed / isRevealed ─────────────────────────────────────────────

describe('applyContentFilter', () => {
  it('returns empty array when ru is not in blocked', async () => {
    const el = document.createElement('div');
    document.body.append(el);
    const model: PageContentModel = {
      extractor: 'test',
      nodes: [makeNode(el, { text: 'Всё о программировании на русском языке' })],
    };
    expect(await runFilter(model, [])).toHaveLength(0);
    expect(await runFilter(model, ['uk'])).toHaveLength(0);
  });

  it('conceals a Russian-language node', async () => {
    const el = document.createElement('div');
    document.body.append(el);
    const model: PageContentModel = {
      extractor: 'test',
      nodes: [makeNode(el, { text: 'Всё о программировании на русском языке', hideMode: 'blur' })],
    };
    const hits = await runFilter(model, ['ru']);
    expect(hits).toHaveLength(1);
    expect(hits[0]?.fromLang).toBe('ru');
    expect(el.getAttribute('data-movar-content-blurred')).toBe('ru');
  });

  it('does not conceal a Ukrainian-language node', async () => {
    const el = document.createElement('div');
    document.body.append(el);
    const model: PageContentModel = {
      extractor: 'test',
      nodes: [makeNode(el, { text: 'Як писати тести українською мовою' })],
    };
    expect(await runFilter(model, ['ru'])).toHaveLength(0);
  });

  it('skips a node with empty text (lazy load)', async () => {
    const el = document.createElement('div');
    document.body.append(el);
    const model: PageContentModel = {
      extractor: 'test',
      nodes: [makeNode(el, { text: '' })],
    };
    await runFilter(model, ['ru']);
    // NOT marked checked — next pass can re-scan once text hydrates.
    expect(el.hasAttribute('data-movar-content-checked')).toBe(false);
  });

  it('skips already-concealed nodes (idempotent)', async () => {
    const el = document.createElement('div');
    el.setAttribute('data-movar-content-blurred', 'ru');
    document.body.append(el);
    const model: PageContentModel = {
      extractor: 'test',
      nodes: [makeNode(el, { text: 'Всё о программировании на русском языке' })],
    };
    expect(await runFilter(model, ['ru'])).toHaveLength(0);
  });

  it('skips user-revealed nodes', async () => {
    const el = document.createElement('div');
    el.setAttribute('data-movar-revealed', 'true');
    document.body.append(el);
    const model: PageContentModel = {
      extractor: 'test',
      nodes: [makeNode(el, { text: 'Всё о программировании на русском языке' })],
    };
    expect(await runFilter(model, ['ru'])).toHaveLength(0);
  });

  it('dispatches to hide mode when the user selected hide', async () => {
    const el = document.createElement('div');
    document.body.append(el);
    const model: PageContentModel = {
      extractor: 'test',
      nodes: [
        makeNode(el, {
          kind: 'channel',
          hideMode: 'hide',
          text: 'Русский канал — всё о коде',
        }),
      ],
    };
    const hits = await runFilter(model, ['ru'], 'hide');
    expect(hits).toHaveLength(1);
    expect(el.style.display).toBe('none');
    expect(el.querySelector('[data-movar-curtain]')).toBeNull();
  });

  it('the curtain reveal button marks the card REVEALED and removes the curtain', async () => {
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
    await runFilter(model, ['ru']);
    const btn = findRevealButton(el);
    expect(btn).not.toBeNull();
    btn!.click();
    expect(el.hasAttribute('data-movar-content-blurred')).toBe(false);
    expect(el.getAttribute('data-movar-revealed')).toBe('true');
    expect(el.querySelector('[data-movar-curtain]')).toBeNull();
  });
});

describe('applyContentFilter — post-await staleness gate', () => {
  it('conceals nothing when the tick is superseded during the classify round-trip', async () => {
    const el = document.createElement('div');
    document.body.append(el);
    const model: PageContentModel = {
      extractor: 'test',
      nodes: [makeNode(el, { text: 'Всё о программировании на русском языке', hideMode: 'hide' })],
    };

    // A settings change / "Show everything" / pause lands while classify is in
    // flight: simulate by flipping the staleness flag inside the classifier (it
    // resolves AFTER the change), then asserting nothing was concealed.
    let stale = false;
    const classify: SnippetClassifier = async (items, candidateCodes) => {
      const profiles = getProfiles([...candidateCodes]);
      const verdicts = items.map((it) => classifyBySnippet(it.text, profiles, francRung3Resolver));
      await Promise.resolve(); // model the worker round-trip's microtask boundary
      stale = true; // the tick is superseded before the conceal loop runs
      return verdicts;
    };

    const hits = await applyContentFilter(model, {
      candidateCodes: FILTER_LANGS,
      enabled: new Set(['uk', 'en']),
      classify,
      concealMode: 'hide',
      isStale: () => stale,
    });

    expect(hits).toHaveLength(0);
    expect(el.style.display).not.toBe('none');
    expect(el.hasAttribute('data-movar-hidden')).toBe(false);
  });

  it('does not leave a stale CHECKED mark on a superseded tick, so the next pass re-evaluates the card (#289)', async () => {
    // Some supersede paths never call clearAllMarks — a settings reaction with
    // {teardown:false} (a conceal-mode flip) and a query-only SPA route change
    // both only bump the apply generation. If the superseded tick's CHECKED
    // stamp survives, shouldSkip treats the card as already-scanned forever and
    // it never gets (re-)evaluated for blocking again.
    const el = document.createElement('div');
    document.body.append(el);
    const model: PageContentModel = {
      extractor: 'test',
      nodes: [makeNode(el, { text: 'Всё о программировании на русском языке', hideMode: 'hide' })],
    };

    let stale = false;
    const classify: SnippetClassifier = async (items, candidateCodes) => {
      const profiles = getProfiles([...candidateCodes]);
      const verdicts = items.map((it) => classifyBySnippet(it.text, profiles, francRung3Resolver));
      await Promise.resolve(); // model the worker round-trip's microtask boundary
      stale = true; // superseded before the conceal loop runs, no teardown
      return verdicts;
    };

    const firstPass = await applyContentFilter(model, {
      candidateCodes: FILTER_LANGS,
      enabled: new Set(['uk', 'en']),
      classify,
      concealMode: 'hide',
      isStale: () => stale,
    });
    expect(firstPass).toHaveLength(0);
    expect(el.hasAttribute('data-movar-content-checked')).toBe(false);

    // A later, non-stale pass — e.g. the very re-apply the settings reaction or
    // route change kicked off — must still be able to scan and conceal it.
    const secondPass = await applyContentFilter(model, {
      candidateCodes: FILTER_LANGS,
      enabled: new Set(['uk', 'en']),
      classify: directClassify,
      concealMode: 'hide',
      isStale: () => false,
    });
    expect(secondPass).toHaveLength(1);
    expect(el.style.display).toBe('none');
  });

  it('still conceals when the tick stays current (isStale never trips)', async () => {
    const el = document.createElement('div');
    document.body.append(el);
    const model: PageContentModel = {
      extractor: 'test',
      nodes: [makeNode(el, { text: 'Всё о программировании на русском языке', hideMode: 'hide' })],
    };
    const hits = await applyContentFilter(model, {
      candidateCodes: FILTER_LANGS,
      enabled: new Set(['uk', 'en']),
      classify: directClassify,
      concealMode: 'hide',
      isStale: () => false,
    });
    expect(hits).toHaveLength(1);
    expect(el.style.display).toBe('none');
  });
});

describe('applyContentFilter — rung-3 franc hide threshold (calibration)', () => {
  // The franc backstop (rung 3) decides the distinctive-free residual — titles
  // with no ru/uk-unique letters and no marker words. minHideMargin(3) = 0.22.
  it('hides a distinctive-free Russian residual via franc (ru-1 from the YT fixture)', async () => {
    // No ы/ё, no marker words → franc backstop, ru margin ~0.24 (above 0.22).
    const hits = await runFilter(
      oneNodeModel('Обзор нового смартфона — подробное сравнение характеристик Технологии Сегодня'),
      ['ru'],
    );
    expect(hits).toHaveLength(1);
    expect(hits[0]!.fromLang).toBe('ru');
  });

  it('hides a clearly-Russian residual with a comfortable franc margin', async () => {
    const hits = await runFilter(
      oneNodeModel('Подробная инструкция по сборке компьютера для домашнего использования'),
      ['ru'],
    );
    expect(hits).toHaveLength(1);
  });

  it('keeps a distinctive-free Ukrainian residual (reaches franc, but franc ranks uk)', async () => {
    expect(
      await runFilter(oneNodeModel('Смачна домашня страва покроково за десять простих хвилин'), [
        'ru',
      ]),
    ).toHaveLength(0);
  });
});

// ─── Conceal-mode (curtain vs. hide) ──────────────────────────────────────

describe('applyContentFilter — a declaration outside the roster never conceals', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    clearAllMarks(document);
  });

  /** Roster a Ukrainian user actually ships with: priority [uk] plus the
   *  imposer overlay [ru]. Deliberately EXCLUDES `en` — the shared `runFilter`
   *  helper keeps `en` a candidate, which is exactly why this class of bug was
   *  invisible to every other test in this file. */
  const UK_ROSTER = ['uk', 'ru'];

  async function runNarrowFilter(model: PageContentModel): ReturnType<typeof applyContentFilter> {
    return applyContentFilter(model, {
      candidateCodes: UK_ROSTER,
      enabled: new Set(['uk']),
      classify: directClassify,
      concealMode: 'hide',
    });
  }

  it.each([
    ['en', 'Voltage relay DS1 white — buy online, free delivery'],
    ['de', 'Spannungsrelais kaufen — schnelle Lieferung ab Lager'],
    ['pl', 'Przekaznik napiecia — sklep internetowy, szybka dostawa'],
  ])('keeps a card declared %s when the roster is uk/ru', async (declared, text) => {
    const { el, node } = declaredNode(text, declared);
    const hits = await runNarrowFilter({ extractor: 'google', nodes: [node] });
    expect(hits).toHaveLength(0);
    expect(isConcealed(node)).toBe(false);
    expect(el.style.display).not.toBe('none');
  });

  it('still conceals a card declared ru — the roster language the user blocked', async () => {
    const { node } = declaredNode('Реле напряжения ColorWay DS1, белое', 'ru');
    const hits = await runNarrowFilter({ extractor: 'google', nodes: [node] });
    expect(hits).toHaveLength(1);
    expect(hits[0]?.fromLang).toBe('ru');
    expect(isConcealed(node)).toBe(true);
  });

  it('keeps a Ukrainian card that Google mislabels ru — text still overrides', async () => {
    const { node } = declaredNode('Реле напруги ColorWay DS1, біле — купити в Києві', 'ru');
    const hits = await runNarrowFilter({ extractor: 'google', nodes: [node] });
    expect(hits).toHaveLength(0);
    expect(isConcealed(node)).toBe(false);
  });

  it('keeps an out-of-roster declaration even with no text to correct it', async () => {
    // The worst shape: a declaration-only card. Before the candidate gate the
    // fusion returned `en` verbatim at 0.752 and the card was hidden outright,
    // with nothing in its own text able to argue back.
    const { node } = declaredNode('', 'en');
    const hits = await runNarrowFilter({ extractor: 'google', nodes: [node] });
    expect(hits).toHaveLength(0);
    expect(isConcealed(node)).toBe(false);
  });
});
