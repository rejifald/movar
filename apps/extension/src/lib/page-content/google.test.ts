// fallow-ignore-file code-duplication
import { beforeEach, describe, expect, it } from 'vitest';
import { getProfiles } from '@movar/lang-detect';
import { GOOGLE_EXTRACTOR } from './google';
import { applyContentFilter } from './conceal';

// Bridges old blocklist-style call sites to the allowlist filter: conceal iff a
// card's detected language ∈ `blocked`. candidates = uk/ru/en; enabled =
// everything not blocked.
const FILTER_LANGS = ['uk', 'ru', 'en'];
function runFilter(
  model: Parameters<typeof applyContentFilter>[0],
  blocked: readonly string[],
): ReturnType<typeof applyContentFilter> {
  return applyContentFilter(model, {
    candidates: getProfiles(FILTER_LANGS),
    enabled: new Set(FILTER_LANGS.filter((c) => !blocked.includes(c))),
  });
}

function setBody(html: string): void {
  document.body.innerHTML = html;
}

// ─── Fixture builders ───────────────────────────────────────────────────────
// These mirror the *reliable* SERP structure the extractor keys on, not the
// rotating styling classes. The class on each card is deliberately a nonsense
// hash to prove extraction never depends on it.

/** One organic result card: the data-hveid logging boundary with an <h3> title
 *  link inside it — the shape every Google web result has had for years. */
function organic({
  title,
  snippet = '',
  id,
}: {
  title: string;
  snippet?: string;
  id?: string;
}): string {
  return `
    <div data-hveid="CAEQAA" class="zZrot9"${id ? ` id="${id}"` : ''}>
      <a href="https://example.com"><h3>${title}</h3></a>
      <div>${snippet}</div>
    </div>`;
}

/** Wrap result cards in the #rso results list (the stable container id). */
function rso(...cards: string[]): string {
  return `<div id="rso">${cards.join('')}</div>`;
}

/** A "People also ask" block: one related-question-pair row per question. */
function paa(questions: { q: string; id?: string }[]): string {
  const rows = questions
    .map(
      ({ q, id }) =>
        `<div class="related-question-pair"${id ? ` id="${id}"` : ''}><span>${q}</span></div>`,
    )
    .join('');
  return `<div class="people-also-ask">${rows}</div>`;
}

beforeEach(() => {
  document.body.innerHTML = '';
});

// ─── Host matching ────────────────────────────────────────────────────────

describe('GOOGLE_EXTRACTOR.matches', () => {
  it('matches google.com', () => {
    expect(GOOGLE_EXTRACTOR.matches('google.com')).toBe(true);
  });

  it('matches www.google.com subdomain', () => {
    expect(GOOGLE_EXTRACTOR.matches('www.google.com')).toBe(true);
  });

  it('matches google.com.ua', () => {
    expect(GOOGLE_EXTRACTOR.matches('google.com.ua')).toBe(true);
  });

  it('matches google.de', () => {
    expect(GOOGLE_EXTRACTOR.matches('google.de')).toBe(true);
  });

  it('matches google.co.uk', () => {
    expect(GOOGLE_EXTRACTOR.matches('google.co.uk')).toBe(true);
  });

  it('does not match youtube.com', () => {
    expect(GOOGLE_EXTRACTOR.matches('youtube.com')).toBe(false);
  });

  it('does not match example.com', () => {
    expect(GOOGLE_EXTRACTOR.matches('example.com')).toBe(false);
  });

  it('does not match a fake google domain (notgoogle.com)', () => {
    expect(GOOGLE_EXTRACTOR.matches('notgoogle.com')).toBe(false);
  });

  // Broadened: any google.* ccTLD, not a fixed allowlist — SERP structure is
  // identical across ccTLDs, so an unlisted one filters just as well.
  it('matches an unlisted ccTLD (google.es)', () => {
    expect(GOOGLE_EXTRACTOR.matches('google.es')).toBe(true);
  });

  it('matches an unlisted two-label ccTLD (google.com.br)', () => {
    expect(GOOGLE_EXTRACTOR.matches('google.com.br')).toBe(true);
  });

  it('matches a subdomain on an unlisted ccTLD (news.google.co.jp)', () => {
    expect(GOOGLE_EXTRACTOR.matches('news.google.co.jp')).toBe(true);
  });

  it('does not match a google label buried mid-host (google.com.evil.com)', () => {
    expect(GOOGLE_EXTRACTOR.matches('google.com.evil.com')).toBe(false);
  });
});

// ─── Node extraction ──────────────────────────────────────────────────────

describe('GOOGLE_EXTRACTOR.extract — node structure', () => {
  it('extracts an organic result via the #rso <h3> → data-hveid climb', () => {
    // The card's class is a nonsense hash — extraction relies only on the
    // stable #rso + <h3> + data-hveid signals.
    setBody(
      rso(
        organic({ title: 'Some result title', snippet: 'A snippet about the result.', id: 'card' }),
      ),
    );
    const model = GOOGLE_EXTRACTOR.extract(document);
    expect(model.extractor).toBe('google');
    expect(model.nodes).toHaveLength(1);
    const node = model.nodes[0]!;
    expect(node.el.id).toBe('card');
    expect(node.el.getAttribute('data-hveid')).toBe('CAEQAA');
    expect(node.kind).toBe('result');
    expect(node.hideMode).toBe('hide');
    expect(node.text).toContain('Some result title');
    expect(node.text).toContain('A snippet about the result.');
  });

  it('produces one node per "People also ask" question (div.related-question-pair)', () => {
    setBody(
      paa([{ q: 'Для чего нужно реле напряжения?' }, { q: 'Для чого ставлять реле напруги?' }]),
    );
    const model = GOOGLE_EXTRACTOR.extract(document);
    expect(model.nodes).toHaveLength(2);
    expect(model.nodes[0]!.kind).toBe('result');
    expect(model.nodes[0]!.text).toContain('Для чего нужно реле напряжения');
  });

  it('ignores a bare <h3> with no data-hveid card (no false result)', () => {
    setBody(`<div id="rso"><h3>Orphan heading with no card</h3></div>`);
    expect(GOOGLE_EXTRACTOR.extract(document).nodes).toHaveLength(0);
  });

  it('ignores an organic card rendered outside #rso (e.g. ads, knowledge panel)', () => {
    // data-hveid + <h3> present, but not inside the #rso results list.
    setBody(organic({ title: 'Sponsored result outside #rso' }));
    expect(GOOGLE_EXTRACTOR.extract(document).nodes).toHaveLength(0);
  });

  it('collapses nested result cards to the outermost (sitelinks)', () => {
    // A main result whose sitelink sub-card carries its own data-hveid + <h3>.
    setBody(
      rso(`
        <div data-hveid="CAEQAA" id="main">
          <a href="#"><h3>Main result</h3></a>
          <div data-hveid="CAIQAA"><a href="#"><h3>Sitelink</h3></a></div>
        </div>
      `),
    );
    const model = GOOGLE_EXTRACTOR.extract(document);
    expect(model.nodes).toHaveLength(1);
    expect(model.nodes[0]!.el.id).toBe('main');
  });

  it('returns zero nodes for an empty page', () => {
    setBody('');
    expect(GOOGLE_EXTRACTOR.extract(document).nodes).toHaveLength(0);
  });

  it('produces a node per result for multiple results', () => {
    setBody(
      rso(
        organic({ title: 'Card one' }),
        organic({ title: 'Card two' }),
        organic({ title: 'Card three' }),
      ),
    );
    expect(GOOGLE_EXTRACTOR.extract(document).nodes).toHaveLength(3);
  });

  it('uses the provided root, not document', () => {
    setBody(`
      ${paa([{ q: 'Зовнішнє питання, що лежить поза областю пошуку.' }])}
      <section id="scope">${paa([{ q: 'Внутрішнє питання у межах заданої області.' }])}</section>
    `);
    const scope = document.querySelector<HTMLElement>('#scope')!;
    const model = GOOGLE_EXTRACTOR.extract(scope);
    expect(model.nodes).toHaveLength(1);
    expect(model.nodes[0]!.text).toContain('Внутрішнє питання');
  });
});

// ─── Full filter integration (extractor + applyContentFilter) ────────────

describe('GOOGLE_EXTRACTOR — applyContentFilter integration', () => {
  it('hides a Russian organic result (display:none + data-movar-hidden)', () => {
    setBody(
      rso(
        organic({
          title: 'Купить картину в Москве',
          snippet: 'Большой выбор картин разных стилей и эпох.',
          id: 'ru-card',
        }),
      ),
    );
    const hits = runFilter(GOOGLE_EXTRACTOR.extract(document), ['ru']);
    expect(hits).toHaveLength(1);
    const card = document.querySelector<HTMLElement>('#ru-card')!;
    // Hidden purely via the stable signals — the card's class is a junk hash.
    expect(card.className).toBe('zZrot9');
    expect(card.style.display).toBe('none');
    expect(card.getAttribute('data-movar-hidden')).toMatch(/^content-filter:result:ru$/);
    // No curtain — hideMode:'hide' is flat.
    expect(card.querySelector('[data-movar-curtain]')).toBeNull();
  });

  it('leaves a Ukrainian result alone', () => {
    setBody(
      rso(
        organic({
          title: 'Купити картину в Києві',
          snippet: 'Великий вибір картин різних стилів та епох.',
          id: 'uk-card',
        }),
      ),
    );
    const hits = runFilter(GOOGLE_EXTRACTOR.extract(document), ['ru']);
    expect(hits).toHaveLength(0);
    expect(document.querySelector<HTMLElement>('#uk-card')!.style.display).toBe('');
  });

  it('leaves an English result alone', () => {
    setBody(
      rso(
        organic({
          title: 'Buy artwork online',
          snippet: 'A wide selection of paintings from many eras.',
          id: 'en-card',
        }),
      ),
    );
    expect(runFilter(GOOGLE_EXTRACTOR.extract(document), ['ru'])).toHaveLength(0);
    expect(document.querySelector<HTMLElement>('#en-card')!.style.display).toBe('');
  });

  it('is idempotent — second pass returns no new hits', () => {
    setBody(
      rso(
        organic({
          title: 'Что-то по-русски',
          snippet: 'Какой-то очень русский текст здесь.',
          id: 'ru-card',
        }),
      ),
    );
    const first = runFilter(GOOGLE_EXTRACTOR.extract(document), ['ru']);
    const second = runFilter(GOOGLE_EXTRACTOR.extract(document), ['ru']);
    expect(first).toHaveLength(1);
    expect(second).toHaveLength(0);
  });

  it('does not hide a result whose text is too short to classify', () => {
    setBody(rso(organic({ title: 'Привет', id: 'card' })));
    expect(runFilter(GOOGLE_EXTRACTOR.extract(document), ['ru'])).toHaveLength(0);
  });

  it('does nothing when ru is not in blocked', () => {
    setBody(
      rso(
        organic({
          title: 'Купить картину в Москве',
          snippet: 'Большой выбор картин разных стилей и эпох.',
        }),
      ),
    );
    expect(runFilter(GOOGLE_EXTRACTOR.extract(document), [])).toHaveLength(0);
    expect(runFilter(GOOGLE_EXTRACTOR.extract(document), ['uk'])).toHaveLength(0);
  });

  it('handles multiple results and hides only Russian ones', () => {
    setBody(
      rso(
        organic({
          title: 'Купить картину в Москве',
          snippet: 'Большой выбор картин разных стилей и эпох.',
          id: 'ru',
        }),
        organic({
          title: 'Купити картину в Києві',
          snippet: 'Великий вибір картин різних стилів та епох.',
          id: 'uk',
        }),
        organic({
          title: 'Buy artwork online',
          snippet: 'A wide selection of paintings.',
          id: 'en',
        }),
      ),
    );
    const hits = runFilter(GOOGLE_EXTRACTOR.extract(document), ['ru']);
    expect(hits).toHaveLength(1);
    expect(document.querySelector<HTMLElement>('#ru')!.style.display).toBe('none');
    expect(document.querySelector<HTMLElement>('#uk')!.style.display).toBe('');
    expect(document.querySelector<HTMLElement>('#en')!.style.display).toBe('');
  });

  it('hides Russian "People also ask" questions and keeps a Ukrainian one in the same block', () => {
    // The "Схожі запитання" accordion from a real ru→uk SERP: three Russian
    // questions and one Ukrainian. Atomic per-row filtering hides only the RU
    // ones — the Ukrainian question stays so the block remains useful.
    setBody(
      paa([
        { q: 'Для чего нужно реле напряжения?', id: 'q-ru-1' },
        { q: 'Где нужно ставить реле напряжения?', id: 'q-ru-2' },
        { q: 'Какое реле напряжения выбрать для дома?', id: 'q-ru-3' },
        { q: 'Для чого ставлять реле напруги?', id: 'q-uk' },
      ]),
    );
    const hits = runFilter(GOOGLE_EXTRACTOR.extract(document), ['ru']);
    expect(hits).toHaveLength(3);
    for (const id of ['q-ru-1', 'q-ru-2', 'q-ru-3']) {
      expect(document.querySelector<HTMLElement>(`#${id}`)!.style.display).toBe('none');
    }
    expect(document.querySelector<HTMLElement>('#q-uk')!.style.display).toBe('');
  });
});
