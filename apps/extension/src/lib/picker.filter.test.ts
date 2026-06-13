import { describe, expect, it } from 'vitest';
import { findLanguagePickers } from '@movar/lang-pickers/extract';
import { filterPickers as filterPickersWithPresenter } from './picker-filter';
import { testContentPresenter } from './dom-test-helpers';
import {
  setBody,
  setup001ComUaPicker,
  setupTwoLanguagePicker,
  setupSelectPicker,
  expectContainerCurtained,
  getTooltipHosts,
} from '@movar/lang-pickers/picker.test-utils';

function filterPickers(
  pickers: Parameters<typeof filterPickersWithPresenter>[0],
  keep: Parameters<typeof filterPickersWithPresenter>[1],
  options?: Parameters<typeof filterPickersWithPresenter>[2],
): ReturnType<typeof filterPickersWithPresenter> {
  return filterPickersWithPresenter(pickers, keep, options, testContentPresenter);
}

function describeNodes(container: HTMLElement): string[] {
  return [...container.childNodes].map((n) => {
    if (n.nodeType === Node.TEXT_NODE) return `text:${n.nodeValue ?? ''}`;
    if (n.nodeType === Node.ELEMENT_NODE) {
      const el = n as HTMLElement;
      const kind = el.dataset['movarKind'] ?? '';
      const hidden = el.hasAttribute('data-movar-hidden') ? '[hidden]' : '';
      return `el:${el.tagName.toLowerCase()}${kind ? `[${kind}]` : ''}${hidden}:${el.textContent}`;
    }
    return 'other';
  });
}

/** Filter the '#picker' container keeping only 'uk'+'en', then return the
 *  picker element and its immediately preceding curtain host element. Asserts
 *  the picker is hidden (display:none) before returning. */
function filterAndGetCurtainedPicker(): { picker: HTMLElement; host: HTMLElement } {
  filterPickers(findLanguagePickers(), ['uk', 'en']);
  const picker = document.querySelector<HTMLElement>('#picker')!;
  expect(picker.style.display).toBe('none');
  const host = picker.previousElementSibling as HTMLElement;
  return { picker, host };
}

/** Assert that the '#picker' container was left fully visible and uncurtained
 *  after a blocked-mode filterPickers call. */
function expectPickerUncurtained(result: ReturnType<typeof filterPickers>): void {
  expect(result.hiddenContainers).toHaveLength(0);
  const container = document.querySelector<HTMLElement>('#picker')!;
  expect(container.style.display).toBe('');
  expect(container.previousElementSibling).toBeNull();
}

describe('filterPickers — keep semantics', () => {
  it('hides languages not in the keep list', () => {
    setBody(`
      <div id="picker">
        <a id="ua" href="/ua/x">UA</a>
        <a id="en" href="/en/x">EN</a>
        <a id="ru" href="/ru/x">RU</a>
        <a id="de" href="/de/x">DE</a>
      </div>
    `);
    const result = filterPickers(findLanguagePickers(), ['uk', 'en']);
    expect(result.hiddenLinks.map((l) => l.language).toSorted()).toEqual(['de', 'ru']);
    expect(document.querySelector<HTMLElement>('#ua')!.style.display).toBe('');
    expect(document.querySelector<HTMLElement>('#en')!.style.display).toBe('');
    expect(document.querySelector<HTMLElement>('#ru')!.style.display).toBe('none');
    expect(document.querySelector<HTMLElement>('#de')!.style.display).toBe('none');
  });

  it('hides the whole container when only one language remains and attaches a curtain', () => {
    setupTwoLanguagePicker({ containerAttrs: 'id="picker" class="lang"' });
    // The curtain host is inserted as the immediate previous sibling.
    const { host } = filterAndGetCurtainedPicker();
    expect(host.getAttribute('data-movar-curtain')).toBe('');
    expect(host.dataset['movarKind']).toBe('picker-container');
  });

  it('collapses the 001.com.ua picker (hides RU, leaves container visible in blocked-only mode)', () => {
    // Blocked-only mode strips the blocked entries and trusts the user's
    // own choice for what survives — even when only one option remains, we
    // don't curtain the container. Curtaining is reserved for the strict
    // legacy mode (keep-only, no `blocked`), where ≤1 survivor means the
    // user's priority list collapsed and the chip explains why.
    setup001ComUaPicker({ ruLinkId: 'ru-link' });
    filterPickers(findLanguagePickers(), ['uk', 'en'], { blocked: ['ru'] });
    expect(document.querySelector<HTMLAnchorElement>('#ru-link')!.style.display).toBe('none');
    const container = document.querySelector<HTMLElement>('#header-languages')!;
    expect(container.style.display).toBe('');
    expect(container.previousElementSibling).toBeNull();
  });

  it('collapses the 001.com.ua picker in strict mode (hides RU, curtains the container)', () => {
    // Same setup as above but without `blocked` — keep-only semantics, so
    // RU falls outside the keep list and the container is curtained when
    // UK is the lone survivor.
    setup001ComUaPicker({ ruLinkId: 'ru-link' });
    filterPickers(findLanguagePickers(), ['uk', 'en']);
    expect(document.querySelector<HTMLAnchorElement>('#ru-link')!.style.display).toBe('none');
    expectContainerCurtained('#header-languages');
  });

  it('collapses the electrica-shop picker to nothing', () => {
    setBody(`
      <ul>
        <li id="header-languages">
          <a href="/ua/error404.htm" class="ua-link" title="Украинский язык">українською</a>
          <span class="divider">&nbsp;</span>
          <span class="ru-link" title="Русский язык">по-русски</span>
        </li>
      </ul>
    `);
    filterPickers(findLanguagePickers(), ['uk', 'en']);
    expect(document.querySelector<HTMLElement>('.ru-link')!.getAttribute('style')).toContain(
      'display: none',
    );
    const container = document.querySelector<HTMLElement>('#header-languages')!;
    expect(container.style.display).toBe('none');
    expect((container.previousElementSibling as HTMLElement | null)?.dataset['movarKind']).toBe(
      'picker-container',
    );
  });

  it('leaves the container visible when multiple languages remain', () => {
    setBody(`
      <div id="picker">
        <a href="/ua/x">UA</a>
        <a href="/en/x">EN</a>
        <a href="/ru/x">RU</a>
      </div>
    `);
    filterPickers(findLanguagePickers(), ['uk', 'en']);
    expect(document.querySelector<HTMLElement>('#picker')!.style.display).toBe('');
  });

  it('is idempotent across repeated calls', () => {
    setBody(`
      <div id="picker">
        <a id="ua" href="/ua/x">UA</a>
        <a id="ru" href="/ru/x">RU</a>
      </div>
    `);
    const first = filterPickers(findLanguagePickers(), ['uk', 'en']);
    const second = filterPickers(findLanguagePickers(), ['uk', 'en']);
    expect(first.hiddenLinks).toHaveLength(1);
    expect(second.hiddenLinks).toHaveLength(0);
    expect(second.hiddenContainers).toHaveLength(0);
  });

  it('does NOT treat a same-language cluster as a picker (Google SERP hl=uk propagation)', () => {
    // Google search results carry ?hl=uk on EVERY internal link, so every
    // anchor in a result block classifies as "uk". That cluster is not a
    // language picker — picker semantics require a CHOICE between languages.
    setBody(`
      <div id="results">
        <a href="https://www.google.com/url?q=https://x.com&amp;hl=uk">Result A</a>
        <a href="https://www.google.com/url?q=https://y.com&amp;hl=uk">Result B</a>
        <a href="https://www.google.com/url?q=https://z.com&amp;hl=uk">Result C</a>
      </div>
    `);
    const pickers = findLanguagePickers();
    expect(pickers).toHaveLength(0);
    const result = filterPickers(pickers, ['uk']);
    expect(result.hiddenContainers).toHaveLength(0);
    // No curtain should be attached.
    expect(document.querySelector('[data-movar-curtain]')).toBeNull();
  });

  it('finds the real picker and ignores a same-language cluster on the same page', () => {
    // Mirrors the actual production shape that surfaced the bug: a Google SERP
    // where every result link carries ?hl=uk (false-positive cluster), PLUS
    // a legitimate language switcher in the header. Detection must isolate
    // the real picker and leave the result block untouched.
    setBody(`
      <header>
        <div id="lang-picker">
          <a href="?hl=uk">UA</a>
          <a href="?hl=en">EN</a>
          <a href="?hl=ru">RU</a>
        </div>
      </header>
      <main>
        <div id="results">
          <a href="/url?q=https://a.com&amp;hl=uk">Result A</a>
          <a href="/url?q=https://b.com&amp;hl=uk">Result B</a>
          <a href="/url?q=https://c.com&amp;hl=uk">Result C</a>
        </div>
      </main>
    `);
    const pickers = findLanguagePickers();
    expect(pickers.map((p) => p.container.id)).toEqual(['lang-picker']);

    filterPickers(pickers, ['uk']);
    const langPicker = document.querySelector<HTMLElement>('#lang-picker')!;
    const results = document.querySelector<HTMLElement>('#results')!;

    // Real picker collapsed (uk remains, en + ru hidden, container curtained).
    expect(langPicker.style.display).toBe('none');
    expect((langPicker.previousElementSibling as HTMLElement | null)?.dataset['movarKind']).toBe(
      'picker-container',
    );

    // Result block is untouched — no curtain, no display:none.
    expect(results.style.display).toBe('');
    expect(results.previousElementSibling).toBeNull();
    expect(document.querySelectorAll('[data-movar-curtain]')).toHaveLength(1);
  });
});

describe('filterPickers — keep semantics: empty priority', () => {
  it('does not hide everything when keep is empty', () => {
    // Defensive: an empty `keep` set means "user removed their priority list",
    // not "hide every language picker on the page".
    setBody(`
      <div id="picker">
        <a id="ua" href="/ua/x">UA</a>
        <a id="ru" href="/ru/x">RU</a>
        <a id="en" href="/en/x">EN</a>
      </div>
    `);
    const result = filterPickers(findLanguagePickers(), []);
    expect(result.hiddenLinks).toHaveLength(0);
    expect(result.hiddenContainers).toHaveLength(0);
  });
});

describe('filterPickers — container curtain detach restores display', () => {
  it("restores the site's own inline display when the user shows the picker again", () => {
    // Pickers commonly use display:flex inline; the curtain sets display:none.
    // Detaching the curtain reinstates the original so the picker doesn't
    // lose its layout after restore.
    setupTwoLanguagePicker({ containerAttrs: 'id="picker" style="display: flex"' });
    const { picker, host } = filterAndGetCurtainedPicker();
    const restoreBtn = host.shadowRoot!.querySelector<HTMLButtonElement>('button')!;
    restoreBtn.click();

    expect(picker.style.display).toBe('flex');
  });

  it('clears display entirely on restore when no inline style was present', () => {
    setupTwoLanguagePicker();
    filterPickers(findLanguagePickers(), ['uk', 'en']);
    const picker = document.querySelector<HTMLElement>('#picker')!;
    const host = picker.previousElementSibling as HTMLElement;
    host.shadowRoot!.querySelector<HTMLButtonElement>('button')!.click();
    expect(picker.style.display).toBe('');
  });
});

describe('filterPickers — tolerated languages', () => {
  it('does not hide a non-blocked language that is also outside priority', () => {
    // User has priority=['uk','en'] and blocked=['ru']. A picker with UA/EN/PL/RU
    // should keep PL visible (Polish is not in priority but the user did not
    // ask for it to be blocked either).
    setBody(`
      <div id="picker">
        <a id="ua" href="/ua/x">UA</a>
        <a id="en" href="/en/x">EN</a>
        <a id="pl" href="/pl/x">PL</a>
        <a id="ru" href="/ru/x">RU</a>
      </div>
    `);
    const result = filterPickers(findLanguagePickers(), ['uk', 'en'], { blocked: ['ru'] });
    const hidden = result.hiddenLinks.map((l) => l.language);
    expect(hidden).toEqual(['ru']);
    expect(document.querySelector<HTMLElement>('#pl')!.style.display).toBe('');
  });
});

describe('filterPickers — useless delimiter cleanup', () => {
  // Stranded `|`, `·`, and explicit divider spans are visual noise once the
  // language link they bracket is hidden. The cleanup runs in both modes
  // (strict and blocked-only); we test in blocked-only because that's the
  // production default and the case where the container itself stays.

  it('hides an explicit divider span between two visible-then-hidden links (electrica-shop)', () => {
    setBody(`
      <ul>
        <li id="header-languages">
          <a href="/ua/x" class="ua-link" title="Украинский язык">українською</a>
          <span class="divider">&nbsp;</span>
          <span class="ru-link" title="Русский язык">по-русски</span>
        </li>
      </ul>
    `);
    filterPickers(findLanguagePickers(), ['uk', 'en'], { blocked: ['ru'] });
    expect(document.querySelector<HTMLElement>('.ru-link')!.style.display).toBe('none');
    const divider = document.querySelector<HTMLElement>('.divider')!;
    expect(divider.style.display).toBe('none');
    expect(divider.getAttribute('data-movar-hidden')).toBe('useless-delimiter');
  });

  it('hides the trailing divider when the last link is hidden', () => {
    // EN | UA | RU → block RU → "EN | UA" (only the divider before RU hides).
    setBody(`
      <div id="picker">
        <a id="en" href="/en/x">EN</a>
        <span class="sep">|</span>
        <a id="ua" href="/ua/x">UA</a>
        <span class="sep">|</span>
        <a id="ru" href="/ru/x">RU</a>
      </div>
    `);
    filterPickers(findLanguagePickers(), ['uk', 'en'], { blocked: ['ru'] });
    const seps = document.querySelectorAll<HTMLElement>('.sep');
    expect(seps[0]!.style.display).toBe(''); // EN | UA — both visible, keep
    expect(seps[1]!.style.display).toBe('none'); // UA | RU — RU hidden, hide
  });

  it('hides the leading divider when the first link is hidden', () => {
    // EN | UA | RU → block EN → "UA | RU".
    setBody(`
      <div id="picker">
        <a id="en" href="/en/x">EN</a>
        <span class="sep">|</span>
        <a id="ua" href="/ua/x">UA</a>
        <span class="sep">|</span>
        <a id="ru" href="/ru/x">RU</a>
      </div>
    `);
    filterPickers(findLanguagePickers(), ['uk', 'ru'], { blocked: ['en'] });
    const seps = document.querySelectorAll<HTMLElement>('.sep');
    expect(seps[0]!.style.display).toBe('none'); // EN | UA — EN hidden, hide
    expect(seps[1]!.style.display).toBe(''); // UA | RU — both visible, keep
  });

  it('hides both dividers around a middle hidden link', () => {
    // EN | UA | RU → block UA → "EN  RU" with both dividers hidden.
    setBody(`
      <div id="picker">
        <a id="en" href="/en/x">EN</a>
        <span class="sep">|</span>
        <a id="ua" href="/ua/x">UA</a>
        <span class="sep">|</span>
        <a id="ru" href="/ru/x">RU</a>
      </div>
    `);
    filterPickers(findLanguagePickers(), ['en', 'ru'], { blocked: ['uk'] });
    const seps = document.querySelectorAll<HTMLElement>('.sep');
    expect(seps[0]!.style.display).toBe('none');
    expect(seps[1]!.style.display).toBe('none');
  });

  it('detects bare-text dividers (span containing only "·" or "|")', () => {
    // No "divider" class, just a leaf element whose text is pure separator.
    setBody(`
      <div id="picker">
        <a id="ua" href="/ua/x">UA</a>
        <span class="bullet">·</span>
        <a id="ru" href="/ru/x">RU</a>
      </div>
    `);
    filterPickers(findLanguagePickers(), ['uk'], { blocked: ['ru'] });
    expect(document.querySelector<HTMLElement>('.bullet')!.style.display).toBe('none');
  });

  it('leaves dividers alone when no links were hidden', () => {
    // Cheap-path guarantee: a no-op filter must not touch the dividers.
    setBody(`
      <div id="picker">
        <a id="ua" href="/ua/x">UA</a>
        <span class="sep">|</span>
        <a id="ru" href="/ru/x">RU</a>
      </div>
    `);
    filterPickers(findLanguagePickers(), ['uk', 'ru'], { blocked: [] });
    expect(document.querySelector<HTMLElement>('.sep')!.style.display).toBe('');
  });

  it('does not classify a content span whose text is not pure-separator', () => {
    // Defensive: a span like "(beta)" or "3 languages" sitting in a picker
    // container should never be classified as a divider, even if a
    // neighbouring link is hidden.
    setBody(`
      <div id="picker">
        <a id="ua" href="/ua/x">UA</a>
        <span class="info">(beta)</span>
        <a id="ru" href="/ru/x">RU</a>
      </div>
    `);
    filterPickers(findLanguagePickers(), ['uk'], { blocked: ['ru'] });
    expect(document.querySelector<HTMLElement>('.info')!.style.display).toBe('');
  });
});

describe('filterPickers — bare-text orphan separator trimming', () => {
  // The 001.com.ua-style picker bakes the active language and its visual
  // separator into one text node: `<span>UA  |  </span><a>RU</a>`. When
  // RU is hidden, the trailing `|` in the UA span becomes a stranded
  // character that element-level hides can't reach.

  it('trims a trailing orphan `|` from the surviving 001.com.ua active-language span', () => {
    setup001ComUaPicker({ ruLinkId: 'ru-link' });
    // Capture the original text so the assertion documents what we expect
    // to trim down from — including the &nbsp; padding that real sites use.
    const activeSpan = document.querySelector<HTMLSpanElement>('#header-languages > span')!;
    expect(activeSpan.textContent).toBe('UA  |  ');
    filterPickers(findLanguagePickers(), ['uk', 'en'], { blocked: ['ru'] });
    expect(document.querySelector<HTMLAnchorElement>('#ru-link')!.style.display).toBe('none');
    expect(activeSpan.textContent).toBe('UA');
    // Original text snapshotted on the element for clearAllModifications.
    expect(activeSpan.getAttribute('data-movar-original-text')).toBe('UA  |  ');
  });

  it('trims a leading orphan `|` when the hidden sibling is on the left', () => {
    // Mirror layout: <a>RU</a><span>  |  UA</span>.
    setBody(`
      <li id="header-languages" class="switch-lang">
        <a id="ru-link" href="https://example.com/?lang=ru">RU</a><span>&nbsp;&nbsp;|&nbsp;&nbsp;UA</span>
      </li>
    `);
    const activeSpan = document.querySelector<HTMLSpanElement>('#header-languages > span')!;
    filterPickers(findLanguagePickers(), ['uk', 'en'], { blocked: ['ru'] });
    expect(activeSpan.textContent).toBe('UA');
  });

  it('does not trim when no sibling is hidden', () => {
    // Defensive: a picker where nothing gets filtered must leave the leaf
    // text untouched, no matter how many separator chars it contains.
    setup001ComUaPicker();
    const activeSpan = document.querySelector<HTMLSpanElement>('#header-languages > span')!;
    filterPickers(findLanguagePickers(), ['uk', 'ru'], { blocked: [] });
    expect(activeSpan.textContent).toBe('UA  |  ');
    expect(activeSpan.hasAttribute('data-movar-original-text')).toBe(false);
  });

  it('does not trim when the surviving link is inside a chip-curtained container', () => {
    // Strict mode: 1 survivor → container gets a chip curtain → in-container
    // cleanup is skipped so the chip's click-to-restore returns the picker
    // exactly as the site rendered it.
    setup001ComUaPicker();
    const activeSpan = document.querySelector<HTMLSpanElement>('#header-languages > span')!;
    filterPickers(findLanguagePickers(), ['uk', 'en']); // strict mode
    // Container is curtained (chip sibling-before, container display:none).
    const container = document.querySelector<HTMLElement>('#header-languages')!;
    expect(container.style.display).toBe('none');
    // Span text is untouched — the curtain hides the whole container, and
    // detaching the curtain must restore the picker verbatim.
    expect(activeSpan.textContent).toBe('UA  |  ');
    expect(activeSpan.hasAttribute('data-movar-original-text')).toBe(false);
  });
});

describe('filterPickers — text-node separator trimming (spizhenko pattern)', () => {
  // spizhenko.clinic and many WordPress themes render the picker as
  //   <div>UA | <a>RU</a> | <a>EN</a></div>
  // with the active locale ("UA") as a BARE TEXT NODE — no wrapping element.
  // The trailing " | " after UA and the standalone " | " between RU and EN
  // are text nodes too. When RU gets hidden, both separators become stranded
  // characters that element-level hides (hideUselessDividers) and leaf-text
  // trims (trimOrphanSeparators) can't reach.

  const NBSP = ' ';
  const PICKER_HTML = (urlRu: string, urlEn: string) =>
    `<div id="picker">UA${NBSP}|${NBSP}<a id="ru" href="${urlRu}">RU</a>${NBSP}|${NBSP}<a id="en" href="${urlEn}">EN</a></div>`;

  it('hides the separator between hidden RU and visible EN (and trailing | after UA)', () => {
    setBody(PICKER_HTML('https://e.com/ru', 'https://e.com/en'));
    filterPickers(findLanguagePickers(), ['uk', 'en'], { blocked: ['ru'] });

    const container = document.querySelector<HTMLElement>('#picker')!;
    expect(describeNodes(container)).toEqual([
      'el:span[text-divider]:UA',
      'el:a[hidden]:RU',
      'el:span[text-divider]:',
      'el:a:EN',
    ]);
  });

  it('hides both surrounding separators when only UA survives', () => {
    setBody(PICKER_HTML('https://e.com/ru', 'https://e.com/en'));
    filterPickers(findLanguagePickers(), ['uk'], { blocked: ['ru', 'en'] });

    const container = document.querySelector<HTMLElement>('#picker')!;
    expect(describeNodes(container)).toEqual([
      'el:span[text-divider]:UA',
      'el:a[hidden]:RU',
      'el:span[text-divider]:',
      'el:a[hidden]:EN',
    ]);
  });

  it('trims the leading separator on the reversed layout', () => {
    // Layout: <a>RU</a> | <a>EN</a> | UA — UA is the trailing active marker.
    // With EN blocked (RU visible, EN hidden, UA the always-visible marker):
    //   - " | " between RU and EN → trailing trim (next is hidden) → ""
    //   - " | UA" after EN → leading trim (prev is hidden) → "UA"
    setBody(
      `<div id="picker"><a id="ru" href="https://e.com/ru">RU</a>${NBSP}|${NBSP}<a id="en" href="https://e.com/en">EN</a>${NBSP}|${NBSP}UA</div>`,
    );
    filterPickers(findLanguagePickers(), ['uk', 'ru'], { blocked: ['en'] });

    const container = document.querySelector<HTMLElement>('#picker')!;
    expect(describeNodes(container)).toEqual([
      'el:a:RU',
      'el:span[text-divider]:',
      'el:a[hidden]:EN',
      'el:span[text-divider]:UA',
    ]);
  });

  it('leaves all text nodes alone when no links got hidden', () => {
    setBody(PICKER_HTML('https://e.com/ru', 'https://e.com/en'));
    filterPickers(findLanguagePickers(), ['uk', 'ru', 'en'], { blocked: [] });

    const container = document.querySelector<HTMLElement>('#picker')!;
    expect(describeNodes(container)).toEqual([
      `text:UA${NBSP}|${NBSP}`,
      'el:a:RU',
      `text:${NBSP}|${NBSP}`,
      'el:a:EN',
    ]);
  });

  it('snapshots the original text on the wrapper for restore', () => {
    setBody(PICKER_HTML('https://e.com/ru', 'https://e.com/en'));
    filterPickers(findLanguagePickers(), ['uk', 'en'], { blocked: ['ru'] });

    const container = document.querySelector<HTMLElement>('#picker')!;
    const spans = container.querySelectorAll<HTMLElement>('[data-movar-kind="text-divider"]');
    expect(spans).toHaveLength(2);
    const originals = [...spans].map((s) => s.getAttribute('data-movar-original-text'));
    expect(originals).toEqual([`UA${NBSP}|${NBSP}`, `${NBSP}|${NBSP}`]);
  });

  it('does not re-classify the marker span as a new picker entry on the next pass', () => {
    setBody(PICKER_HTML('https://e.com/ru', 'https://e.com/en'));
    filterPickers(findLanguagePickers(), ['uk', 'en'], { blocked: ['ru'] });

    // MutationObserver-style re-fire: rerun detection on the now-mutated DOM.
    // classifyContainerChildren must skip text-divider spans so the next
    // filterPickers pass sees the same picker.links it saw the first time.
    const pickers2 = findLanguagePickers();
    expect(pickers2).toHaveLength(1);
    const langs = pickers2[0]!.links.map((l) => l.language).toSorted();
    expect(langs).toEqual(['en', 'ru']);
  });
});

describe('filterPickers — survivor hover tooltip', () => {
  // Every surviving classified link in a picker where Movar hid something
  // gets a shadow-rooted tooltip (host appended to document.body, marked
  // `data-movar-tooltip`). The tooltip carries title + body listing
  // endonyms + a "Show hidden options" action that restores the picker
  // in place. Skipped when the whole container will be chip-curtained.

  it('attaches one tooltip host per surviving link in a multi-survivor picker', () => {
    setBody(`
      <div id="picker">
        <a id="en" href="/en/x">EN</a>
        <a id="ua" href="/ua/x">UA</a>
        <a id="ru" href="/ru/x">RU</a>
      </div>
    `);
    filterPickers(findLanguagePickers(), ['uk', 'en'], { blocked: ['ru'] });
    // Two visible links → two tooltip hosts.
    expect(getTooltipHosts()).toHaveLength(2);
  });

  it('attaches a tooltip on the surviving 001.com.ua active-language span', () => {
    setup001ComUaPicker({ ruLinkId: 'ru-link' });
    filterPickers(findLanguagePickers(), ['uk', 'en'], { blocked: ['ru'] });
    expect(getTooltipHosts()).toHaveLength(1);
    const shadow = getTooltipHosts()[0]!.shadowRoot!;
    // Endonym for Russian appears in the body of the tooltip.
    expect(shadow.querySelector('.body')?.textContent.toLowerCase()).toContain('русск');
  });

  it('lists every currently-hidden language in original picker order', () => {
    setBody(`
      <div id="picker">
        <a id="ua" href="/ua/x">UA</a>
        <a id="ru" href="/ru/x">RU</a>
        <a id="de" href="/de/x">DE</a>
      </div>
    `);
    filterPickers(findLanguagePickers(), ['uk'], { blocked: ['ru', 'de'] });
    const shadow = getTooltipHosts()[0]!.shadowRoot!;
    const bodyText = (shadow.querySelector('.body')?.textContent ?? '').toLowerCase();
    expect(bodyText).toContain('русск');
    expect(bodyText).toContain('deutsch');
    expect(bodyText.indexOf('русск')).toBeLessThan(bodyText.indexOf('deutsch'));
  });

  it('the action button restores the picker in place (per-picker scope)', () => {
    setBody(`
      <div id="picker">
        <a id="ua" href="/ua/x">UA</a>
        <a id="ru" href="/ru/x">RU</a>
      </div>
    `);
    filterPickers(findLanguagePickers(), ['uk'], { blocked: ['ru'] });
    const ru = document.querySelector<HTMLAnchorElement>('#ru')!;
    expect(ru.style.display).toBe('none');
    // Force-open the tooltip so the action button is reachable.
    const ua = document.querySelector<HTMLAnchorElement>('#ua')!;
    (ua as HTMLElement).focus();
    const action = getTooltipHosts()[0]!.shadowRoot!.querySelector<HTMLButtonElement>('.action')!;
    action.click();
    // Hidden link is back, container is marked restored, tooltip is gone.
    expect(ru.style.display).toBe('');
    expect(ru.hasAttribute('data-movar-hidden')).toBe(false);
    const container = document.querySelector<HTMLElement>('#picker')!;
    expect(container.hasAttribute('data-movar-restored')).toBe(true);
    expect(getTooltipHosts()).toHaveLength(0);
  });

  it('subsequent filterPickers calls skip a restored container', () => {
    // MutationObserver re-firing must not undo a per-picker restore.
    setBody(`
      <div id="picker">
        <a id="ua" href="/ua/x">UA</a>
        <a id="ru" href="/ru/x">RU</a>
      </div>
    `);
    filterPickers(findLanguagePickers(), ['uk'], { blocked: ['ru'] });
    const ua = document.querySelector<HTMLAnchorElement>('#ua')!;
    (ua as HTMLElement).focus();
    getTooltipHosts()[0]!.shadowRoot!.querySelector<HTMLButtonElement>('.action')!.click();

    // Re-run the filter — equivalent to a MutationObserver tick.
    filterPickers(findLanguagePickers(), ['uk'], { blocked: ['ru'] });
    const ru = document.querySelector<HTMLAnchorElement>('#ru')!;
    expect(ru.style.display).toBe('');
    expect(ru.hasAttribute('data-movar-hidden')).toBe(false);
  });

  it('replaces text-divider marker spans with original text on per-picker restore', () => {
    // spizhenko-style picker, RU blocked. After filterPickers, the "UA | "
    // and " | " text nodes are wrapped in text-divider spans. After the
    // user clicks "Show hidden options" on a surviving link's tooltip,
    // the marker spans should be gone and the original text nodes back
    // in their place — the picker container is byte-for-byte what the
    // site rendered.
    const NBSP = ' ';
    setBody(
      `<div id="picker">UA${NBSP}|${NBSP}<a id="ru" href="https://e.com/ru">RU</a>${NBSP}|${NBSP}<a id="en" href="https://e.com/en">EN</a></div>`,
    );
    filterPickers(findLanguagePickers(), ['uk', 'en'], { blocked: ['ru'] });

    const container = document.querySelector<HTMLElement>('#picker')!;
    // Sanity-check the filtered state.
    expect(container.querySelectorAll('[data-movar-kind="text-divider"]')).toHaveLength(2);

    // Click "Show hidden options" on EN's survivor tooltip.
    const en = document.querySelector<HTMLAnchorElement>('#en')!;
    en.focus();
    getTooltipHosts()[0]!.shadowRoot!.querySelector<HTMLButtonElement>('.action')!.click();

    // Marker spans are gone; original text nodes are back.
    expect(container.querySelectorAll('[data-movar-kind="text-divider"]')).toHaveLength(0);
    const nodeShape = [...container.childNodes].map((n) =>
      n.nodeType === Node.TEXT_NODE
        ? `text:${n.nodeValue ?? ''}`
        : `el:${(n as HTMLElement).tagName.toLowerCase()}`,
    );
    expect(nodeShape).toEqual([`text:UA${NBSP}|${NBSP}`, 'el:a', `text:${NBSP}|${NBSP}`, 'el:a']);
  });

  it('restores hidden delimiters and trimmed text inside the picker', () => {
    // 001.com.ua style: active-language span with trimmed separator text.
    // After in-place restore, the span's original text is reinstated and
    // the data-movar-original-text attribute is removed.
    setup001ComUaPicker({ ruLinkId: 'ru-link' });
    const activeSpan = document.querySelector<HTMLSpanElement>('#header-languages > span')!;
    // Capture the original text before filtering (contains non-breaking spaces from &nbsp;).
    const originalText = activeSpan.textContent;
    expect(originalText).toContain('UA');
    expect(originalText).toContain('|');
    filterPickers(findLanguagePickers(), ['uk', 'en'], { blocked: ['ru'] });
    // Span text was trimmed to 'UA'.
    expect(activeSpan.textContent).toBe('UA');
    expect(activeSpan.getAttribute('data-movar-original-text')).toBe(originalText);
    // Open + click restore on the UA-span tooltip.
    activeSpan.focus();
    getTooltipHosts()[0]!.shadowRoot!.querySelector<HTMLButtonElement>('.action')!.click();
    // Original text is restored and the snapshot attribute is cleared.
    expect(activeSpan.textContent).toBe(originalText);
    expect(activeSpan.hasAttribute('data-movar-original-text')).toBe(false);
  });

  it('does not attach a tooltip when nothing was hidden', () => {
    setBody(`
      <div id="picker">
        <a id="ua" href="/ua/x">UA</a>
        <a id="en" href="/en/x">EN</a>
      </div>
    `);
    filterPickers(findLanguagePickers(), ['uk', 'en'], { blocked: ['ru'] });
    expect(getTooltipHosts()).toHaveLength(0);
  });

  it('does not attach a tooltip when the container is chip-curtained (strict mode)', () => {
    // Strict mode + ≤1 survivor → chip curtain hides the whole container.
    // The chip carries the explanation; surviving link is untouched.
    setupTwoLanguagePicker();
    filterPickers(findLanguagePickers(), ['uk']);
    expect(getTooltipHosts()).toHaveLength(0);
  });
});

describe('filterPickers — blocked-only mode never curtains the container', () => {
  // When the caller passes `options.blocked`, the picker just loses its blocked entries —
  // even a single surviving link stays visible as a normal picker. The
  // chip overlay is reserved for the strict keep-only path where the
  // user's priority list collapsed it to nothing.

  it('leaves container visible when one survivor remains after blocking', () => {
    setBody(`
      <div id="picker">
        <a id="ua" href="/ua/x">UA</a>
        <a id="ru" href="/ru/x">RU</a>
      </div>
    `);
    const result = filterPickers(findLanguagePickers(), ['uk'], { blocked: ['ru'] });
    // Direct assertion (expectPickerUncurtained asserts too, but the lint
    // rule only sees inline expect()) — helper then checks display/sibling.
    expect(result.hiddenContainers).toHaveLength(0);
    expectPickerUncurtained(result);
  });

  it('leaves container visible even when ALL languages are blocked (zero survivors)', () => {
    // Page is EN, picker offers EN/RU, user blocks both. In strict mode this
    // would trigger a sigil-only chip; in blocked-only mode we keep the (now
    // empty) container — the consent wall handles the real consent-and-bypass
    // UX when the user actively tries to switch.
    setBody(`
      <div id="picker">
        <a id="en" href="/en/x">EN</a>
        <a id="ru" href="/ru/x">RU</a>
      </div>
    `);
    const result = filterPickers(findLanguagePickers(), ['uk'], { blocked: ['en', 'ru'] });
    // Direct assertion (expectPickerUncurtained asserts too, but the lint
    // rule only sees inline expect()) — helper then checks display/sibling.
    expect(result.hiddenContainers).toHaveLength(0);
    expectPickerUncurtained(result);
  });
});

describe('filterPickers — container curtain uses chip skin', () => {
  it('renders the surviving language endonym as the chip label', () => {
    // Strict keep-only mode collapses UA/RU to just UA — the chip should
    // surface "Українська" so the user reads the result as "you're sorted,
    // here's the language we settled on."
    setupTwoLanguagePicker();
    filterPickers(findLanguagePickers(), ['uk']);
    const host = document.querySelector<HTMLElement>('#picker')!
      .previousElementSibling as HTMLElement;
    expect(host.dataset['skin']).toBe('chip');
    // jsdom ships the CLDR data for the languages we test against, so the
    // endonym lookup is deterministic; first letter casing varies by impl,
    // hence the lowercase comparison.
    const label = host.shadowRoot!.querySelector('.chip__label')?.textContent ?? '';
    expect(label.toLowerCase()).toContain('українськ');
  });

  it('renders sigil-only (no label span) when zero languages survive', () => {
    // Strict mode + every language outside keep → the chip has no language
    // to name. The icon stays as the Movar signal; the label node is omitted.
    setBody(`
      <div id="picker">
        <a id="en" href="/en/x">EN</a>
        <a id="ru" href="/ru/x">RU</a>
      </div>
    `);
    filterPickers(findLanguagePickers(), ['uk']);
    const host = document.querySelector<HTMLElement>('#picker')!
      .previousElementSibling as HTMLElement;
    expect(host.dataset['skin']).toBe('chip');
    const shadow = host.shadowRoot!;
    expect(shadow.querySelector('.chip__label')).toBeNull();
    expect(shadow.querySelector('.chip__icon')).not.toBeNull();
    // aria-label carries the explanation copy with the product name but no language endonym.
    const label = shadow.querySelector('.chip')?.getAttribute('aria-label') ?? '';
    expect(label).toMatch(/Movar/i);
    expect(label).not.toMatch(/українськ/i);
  });

  it('the whole chip is the restore button — clicking it detaches the curtain', () => {
    setupTwoLanguagePicker({ containerAttrs: 'id="picker" style="display: flex"' });
    filterPickers(findLanguagePickers(), ['uk']);
    const picker = document.querySelector<HTMLElement>('#picker')!;
    expect(picker.style.display).toBe('none');

    const host = picker.previousElementSibling as HTMLElement;
    const chip = host.shadowRoot!.querySelector<HTMLButtonElement>('button.chip')!;
    chip.click();

    expect(picker.style.display).toBe('flex');
    expect(picker.previousElementSibling).toBeNull();
  });
});

describe('filterPickers — native <select> per-picker restore', () => {
  // The <option>-hide path (HTMLOptionElement.hidden = true) and its inverse
  // in restorePickerInPlace (hidden = false) are the only place the option
  // branch fires. Blocked-only mode keeps the container visible with two
  // survivors, so the survivor tooltip's "show" action restores in place.

  it("clears each hidden <option>'s `hidden` flag on per-picker restore", () => {
    setupSelectPicker(); // uk / ru / en
    filterPickers(findLanguagePickers(), ['uk', 'en'], { blocked: ['ru'] });
    const ru = document.querySelector<HTMLOptionElement>('option[value="ru"]')!;
    expect(ru.hidden).toBe(true);
    expect(ru.hasAttribute('data-movar-hidden')).toBe(true);

    // Two survivors (uk + en) → a survivor tooltip carries the restore action.
    const uk = document.querySelector<HTMLOptionElement>('option[value="uk"]')!;
    (uk as HTMLElement).focus();
    getTooltipHosts()[0]!.shadowRoot!.querySelector<HTMLButtonElement>('.action')!.click();

    // The option is back: `hidden` cleared, display restored, marker removed.
    expect(ru.hidden).toBe(false);
    expect(ru.hasAttribute('data-movar-hidden')).toBe(false);
    expect(ru.style.getPropertyValue('display')).toBe('');
  });

  it('keeps the currently-selected <option> visible even when its language is blocked', () => {
    // `ru` is the active value of the select. Hiding it would point the control
    // at a hidden value (blank/stale rendering). It must survive; a non-selected
    // blocked option (`en` here) is still hidden.
    setBody(`
      <select id="lang-select">
        <option value="uk">Українська</option>
        <option value="ru" selected>Русский</option>
        <option value="en">English</option>
      </select>
    `);
    filterPickers(findLanguagePickers(), ['uk'], { blocked: ['ru', 'en'] });

    const ru = document.querySelector<HTMLOptionElement>('option[value="ru"]')!;
    expect(ru.selected).toBe(true);
    expect(ru.hidden).toBe(false);
    expect(ru.hasAttribute('data-movar-hidden')).toBe(false);

    // The non-selected blocked option is still hidden.
    const en = document.querySelector<HTMLOptionElement>('option[value="en"]')!;
    expect(en.selected).toBe(false);
    expect(en.hidden).toBe(true);
    expect(en.hasAttribute('data-movar-hidden')).toBe(true);
  });
});

describe('filterPickers — divider element edge cases', () => {
  // hideUselessDividers walks the container's direct children with a
  // two-pointer scan for the nearest link-bearing sibling on each side.
  // These cases drive the branches where a side has NO link, where the
  // link sits inside a wrapper, and where a candidate child contains no
  // classified link at all (childIsHidden's empty-contained guard).

  it('hides a leading divider that has no link to its left (container edge)', () => {
    // `| EN UA` — the leading `|` has nothing on its left, so leftLink stays
    // null → leftHidden is true → the stranded leading separator is hidden.
    setBody(`
      <div id="picker">
        <span class="sep">|</span>
        <a id="en" href="/en/x">EN</a>
        <a id="ua" href="/ua/x">UA</a>
        <a id="ru" href="/ru/x">RU</a>
      </div>
    `);
    filterPickers(findLanguagePickers(), ['uk', 'en'], { blocked: ['ru'] });
    // The leading separator is orphaned (no left link) and hidden.
    expect(document.querySelector<HTMLElement>('.sep')!.style.display).toBe('none');
  });

  it('hides a divider whose adjacent link is wrapped in a non-link element', () => {
    // The classified link is the <a>, but it lives inside a <span> wrapper
    // that is the container's direct child. childIsHidden must look INTO the
    // wrapper (child.contains(link.el)) to see the hidden link, then hide the
    // neighbouring `|`.
    setBody(`
      <div id="picker">
        <span class="wrap"><a id="ua" href="/ua/x">UA</a></span>
        <span class="sep">|</span>
        <span class="wrap"><a id="ru" href="/ru/x">RU</a></span>
      </div>
    `);
    filterPickers(findLanguagePickers(), ['uk'], { blocked: ['ru'] });
    expect(document.querySelector<HTMLAnchorElement>('#ru')!.style.display).toBe('none');
    // RU's wrapper holds the only hidden link, so the `|` before it is stranded.
    expect(document.querySelector<HTMLElement>('.sep')!.style.display).toBe('none');
  });
});

describe('filterPickers — survivor tooltip re-fire', () => {
  // annotateSurvivingLinks detaches a previously-attached tooltip before
  // re-attaching, so a MutationObserver re-fire that hides a SECOND language
  // refreshes the body text on a link that survives BOTH passes rather than
  // stacking a duplicate. Exercises the `if (existing) existing.detach()`
  // branch on the re-annotated survivor (UA here).

  it('refreshes a surviving link tooltip body when the hidden set grows', () => {
    setBody(`
      <div id="picker">
        <a id="ua" href="/ua/x">UA</a>
        <a id="ru" href="/ru/x">RU</a>
        <a id="de" href="/de/x">DE</a>
      </div>
    `);
    // First pass blocks RU only — UA + DE survive; UA's tooltip lists "русск".
    filterPickers(findLanguagePickers(), ['uk', 'de'], { blocked: ['ru'] });

    // Second pass also blocks DE. UA survives again: its existing tooltip is
    // detached and re-attached with the refreshed hidden list (ru + de).
    filterPickers(findLanguagePickers(), ['uk'], { blocked: ['ru', 'de'] });

    // Exactly one tooltip body now lists BOTH hidden languages — UA's,
    // re-annotated. (DE's pass-1 tooltip lingers with only "русск" since it
    // is no longer a survivor, so we look for the refreshed one specifically.)
    const refreshed = getTooltipHosts()
      .map((h) => (h.shadowRoot!.querySelector('.body')?.textContent ?? '').toLowerCase())
      .filter((b) => b.includes('русск') && b.includes('deutsch'));
    expect(refreshed).toHaveLength(1);
  });
});

describe('filterPickers — per-picker restore un-hides divider elements', () => {
  // restorePickerInPlace un-hides not just the classified links but also the
  // `<span class="sep">` divider siblings that hideUselessDividers collapsed.
  // Exercises the divider-child un-hide loop (removeAttribute + display reset)
  // that the link-only and text-divider restores don't reach.

  it('reinstates a hidden separator span when the picker is shown again', () => {
    // EN | UA | RU, RU blocked → the `|` before RU is stranded and hidden.
    setBody(`
      <div id="picker">
        <a id="en" href="/en/x">EN</a>
        <span class="sep">|</span>
        <a id="ua" href="/ua/x">UA</a>
        <span class="sep">|</span>
        <a id="ru" href="/ru/x">RU</a>
      </div>
    `);
    filterPickers(findLanguagePickers(), ['uk', 'en'], { blocked: ['ru'] });
    const seps = document.querySelectorAll<HTMLElement>('.sep');
    expect(seps[1]!.style.display).toBe('none'); // UA | RU — hidden
    expect(seps[1]!.hasAttribute('data-movar-hidden')).toBe(true);

    // Restore via a surviving link's tooltip action → restorePickerInPlace.
    const en = document.querySelector<HTMLAnchorElement>('#en')!;
    en.focus();
    getTooltipHosts()[0]!.shadowRoot!.querySelector<HTMLButtonElement>('.action')!.click();

    // The stranded `|` is back: marker cleared and display reset.
    expect(seps[1]!.hasAttribute('data-movar-hidden')).toBe(false);
    expect(seps[1]!.style.getPropertyValue('display')).toBe('');
  });
});

describe('filterPickers — hideElement is idempotent on an already-hidden link', () => {
  // hideElement bails immediately when the element already carries HIDDEN_ATTR,
  // so it never re-snapshots the original display. A site that pre-hides a
  // picker entry with its own inline display:none must keep that snapshot
  // intact across a filter pass.
  it('does not re-snapshot an entry the site already hid', () => {
    setBody(`
      <div id="picker">
        <a id="ua" href="/ua/x">UA</a>
        <a id="ru" href="/ru/x" data-movar-hidden="pre-existing" style="display: none">RU</a>
        <a id="en" href="/en/x">EN</a>
      </div>
    `);
    const result = filterPickers(findLanguagePickers(), ['uk', 'en'], { blocked: ['ru'] });
    // RU was already marked hidden — filterPickerLinks skips it, so it is NOT
    // re-reported in hiddenLinks and its original marker survives untouched.
    expect(result.hiddenLinks.map((l) => l.language)).not.toContain('ru');
    expect(
      document.querySelector<HTMLAnchorElement>('#ru')!.getAttribute('data-movar-hidden'),
    ).toBe('pre-existing');
  });
});
