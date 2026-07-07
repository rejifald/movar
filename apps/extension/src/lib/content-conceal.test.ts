import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildDeclaredClassifier, classifyBySnippet, getProfiles } from '@movar/lang-detect';
import { francRung3Resolver } from '@movar/lang-detect/franc';
import type { SnippetClassifier } from './content-conceal';
import {
  concealNode,
  revealNode,
  revealAllNodes,
  clearAllMarks,
  curtainAllHidden,
  hideAllConcealed,
  concealModeToHideMode,
  isConcealed,
  isRevealed,
  applyContentFilter,
} from './content-conceal';
import type { ConcealMode } from '@movar/settings';
import type { ContentNode, PageContentModel } from '@movar/page-content/types';
import { testContentPresenter } from './dom-test-helpers';

// eslint-disable-next-line @typescript-eslint/require-await -- sync in-process classifier behind the async SnippetClassifier contract; nothing to await
const directClassify: SnippetClassifier = async (items, candidateCodes) => {
  const profiles = getProfiles([...candidateCodes]);
  const fuseDeclared = buildDeclaredClassifier(profiles);
  return items.map((it) =>
    it.declared === undefined
      ? classifyBySnippet(it.text, profiles, francRung3Resolver)
      : fuseDeclared(it.text, it.declared),
  );
};

// Bridges old blocklist-style call sites to the allowlist filter: conceal iff a
// card's detected language ∈ `blocked`. candidates = uk/ru/en; enabled =
// everything not blocked.
const FILTER_LANGS = ['uk', 'ru', 'en'];
async function runFilter(
  model: PageContentModel,
  blocked: readonly string[],
  concealMode: ConcealMode = 'curtain',
): ReturnType<typeof applyContentFilter> {
  return applyContentFilter(model, {
    candidateCodes: FILTER_LANGS,
    enabled: new Set(FILTER_LANGS.filter((c) => !blocked.includes(c))),
    classify: directClassify,
    concealMode,
    ...(concealMode === 'curtain' ? { presenter: testContentPresenter } : {}),
  });
}

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

// ─── revealNode ───────────────────────────────────────────────────────────

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

describe('hideAllConcealed', () => {
  it('escalates every blurred card on the page to display:none', () => {
    setBody(`
      <div id="a" data-movar-content-blurred="ru"></div>
      <div id="b" data-movar-content-blurred="ru"></div>
    `);
    hideAllConcealed();
    for (const id of ['a', 'b']) {
      const el = document.querySelector<HTMLElement>(`#${id}`)!;
      expect(el.style.display).toBe('none');
      expect(el.hasAttribute('data-movar-content-blurred')).toBe(false);
      expect(el.getAttribute('data-movar-hidden')).toMatch(/^content-filter:escalated:ru$/);
    }
  });

  it('leaves already-hidden cards untouched (idempotent)', () => {
    setBody(
      '<div id="a" data-movar-hidden="content-filter:channel:ru" style="display:none"></div>',
    );
    hideAllConcealed();
    expect(document.querySelector<HTMLElement>('#a')!.getAttribute('data-movar-hidden')).toBe(
      'content-filter:channel:ru',
    );
  });
});

describe('curtainAllHidden', () => {
  it('de-escalates every hard-hidden content card back into a curtain', () => {
    setBody(`
      <div id="a" data-movar-hidden="content-filter:channel:ru" style="display:none"></div>
      <div id="b" data-movar-hidden="content-filter:escalated:ru" style="display:none"></div>
    `);
    curtainAllHidden(document, testContentPresenter);
    for (const id of ['a', 'b']) {
      const el = document.querySelector<HTMLElement>(`#${id}`)!;
      expect(el.style.display).toBe('');
      expect(el.hasAttribute('data-movar-hidden')).toBe(false);
      expect(el.getAttribute('data-movar-content-blurred')).toBe('ru');
      expect(el.querySelector('[data-movar-curtain]')).not.toBeNull();
    }
  });

  it('leaves picker hides (reason not-in-priority) untouched', () => {
    setBody('<a id="lnk" data-movar-hidden="not-in-priority"></a>');
    curtainAllHidden(document, testContentPresenter);
    expect(document.querySelector<HTMLElement>('#lnk')!.getAttribute('data-movar-hidden')).toBe(
      'not-in-priority',
    );
  });

  it('leaves already-curtained cards untouched (idempotent)', () => {
    setBody('<div id="a" data-movar-content-blurred="ru"></div>');
    curtainAllHidden(document, testContentPresenter);
    expect(
      document.querySelector<HTMLElement>('#a')!.getAttribute('data-movar-content-blurred'),
    ).toBe('ru');
  });

  it('is a no-op with no presenter (nothing to attach a curtain with)', () => {
    setBody(
      '<div id="a" data-movar-hidden="content-filter:channel:ru" style="display:none"></div>',
    );
    curtainAllHidden();
    const el = document.querySelector<HTMLElement>('#a')!;
    expect(el.style.display).toBe('none');
    expect(el.getAttribute('data-movar-hidden')).toBe('content-filter:channel:ru');
  });
});

describe('revealAllNodes — durable hidden reveal', () => {
  it('clears a hard-hidden content card and marks it REVEALED so it stays gone-then-shown', async () => {
    const el = document.createElement('div');
    document.body.append(el);
    const makeModel = (): PageContentModel => ({
      extractor: 'test',
      nodes: [
        makeNode(el, { kind: 'channel', hideMode: 'hide', text: 'Русский канал — всё о коде' }),
      ],
    });
    expect(await runFilter(makeModel(), ['ru'], 'hide')).toHaveLength(1);
    expect(el.style.display).toBe('none');

    revealAllNodes();
    expect(el.style.display).toBe('');
    expect(el.hasAttribute('data-movar-hidden')).toBe(false);
    expect(el.getAttribute('data-movar-revealed')).toBe('true');

    // The durability the blur path always had: a re-filter must NOT re-hide it.
    expect(await runFilter(makeModel(), ['ru'], 'hide')).toHaveLength(0);
    expect(el.style.display).toBe('');
  });

  it('leaves picker hides (reason not-in-priority) for the picker reveal path', () => {
    setBody('<a id="lnk" data-movar-hidden="not-in-priority"></a>');
    revealAllNodes();
    expect(document.querySelector<HTMLElement>('#lnk')!.getAttribute('data-movar-hidden')).toBe(
      'not-in-priority',
    );
  });
});

describe('curtain "Hide all" action', () => {
  it('escalates every curtained card on the page and fires onHideAll', async () => {
    const onHideAll = vi.fn();
    const a = document.createElement('div');
    const b = document.createElement('div');
    document.body.append(a, b);
    const model: PageContentModel = {
      extractor: 'test',
      nodes: [
        makeNode(a, { hideMode: 'blur', text: 'Всё о программировании на русском языке' }),
        makeNode(b, { hideMode: 'blur', text: 'Совершенно новый русскоязычный контент тут' }),
      ],
    };
    await applyContentFilter(model, {
      candidateCodes: FILTER_LANGS,
      enabled: new Set(['uk', 'en']),
      classify: directClassify,
      concealMode: 'curtain',
      presenter: testContentPresenter,
      onHideAll,
    });
    expect(document.querySelectorAll('[data-movar-content-blurred]')).toHaveLength(2);

    // Click "Hide all" on the first curtain (the second curtain action button).
    const host = a.querySelector<HTMLElement>('[data-movar-curtain]')!;
    const hideAllBtn = [...host.shadowRoot!.querySelectorAll('button')].find(
      (btn) => btn.textContent === 'Hide all',
    )!;
    hideAllBtn.click();

    expect(document.querySelectorAll('[data-movar-content-blurred]')).toHaveLength(0);
    expect(document.querySelectorAll('[data-movar-curtain]')).toHaveLength(0);
    expect(a.style.display).toBe('none');
    expect(b.style.display).toBe('none');
    expect(onHideAll).toHaveBeenCalledTimes(1);
  });
});
