import { describe, expect, it } from 'vitest';
import { findLanguagePickers } from '@movar/lang-pickers/extract';
import { filterPickers as filterPickersWithPresenter } from './picker-filter';
import { testContentPresenter } from './dom-test-helpers';
import { detachAllTooltips } from './tooltip';
import {
  setBody,
  setup001ComUaPicker,
  setupTwoLanguagePicker,
  setupSelectPicker,
  setupStlsStorePicker,
  expectContainerCurtained,
  expectEntryCurtained,
  getControlBadges,
  getEntryCurtainHosts,
  getTooltipHosts,
  setupListboxPicker,
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

describe('filterPickers — orphan edge-border cleanup', () => {
  // The fourth divider shape: the separator is not a node at all but a CSS
  // border painted on the SURVIVOR's edge. stls.store draws its `|` as
  // `border-right: 1px solid #e0e0e0` on the UA entry, so hiding RU leaves a
  // stray vertical rule hanging off the last remaining language. No
  // element-hide or text-trim pass can reach it.

  const BORDER_ATTR = 'data-movar-original-border-right';

  it('zeroes a survivor’s right border when the entry it faced is hidden', () => {
    setBody(`
      <div id="picker">
        <span id="ua" value="UA" style="border-right: 1px solid #e0e0e0">UA</span
        ><a id="ru" value="RU">RU</a>
      </div>
    `);
    filterPickers(findLanguagePickers(), ['uk'], { blocked: ['ru'] });
    const ua = document.querySelector<HTMLElement>('#ua')!;
    expect(ua.style.getPropertyValue('border-right-width')).toBe('0px');
    expect(ua.style.getPropertyPriority('border-right-width')).toBe('important');
  });

  it('zeroes the left border on the mirrored layout', () => {
    setBody(`
      <div id="picker">
        <a id="ru" value="RU">RU</a
        ><span id="ua" value="UA" style="border-left: 1px solid #e0e0e0">UA</span>
      </div>
    `);
    filterPickers(findLanguagePickers(), ['uk'], { blocked: ['ru'] });
    expect(
      document.querySelector<HTMLElement>('#ua')!.style.getPropertyValue('border-left-width'),
    ).toBe('0px');
  });

  it('leaves the border alone when the neighbour it faces is still visible', () => {
    // EN survives, so the rule between UA and EN is still doing its job.
    setBody(`
      <div id="picker">
        <span id="ua" value="UA" style="border-right: 1px solid #e0e0e0">UA</span
        ><a id="en" value="EN">EN</a><a id="ru" value="RU">RU</a>
      </div>
    `);
    filterPickers(findLanguagePickers(), ['uk', 'en'], { blocked: ['ru'] });
    const ua = document.querySelector<HTMLElement>('#ua')!;
    expect(ua.hasAttribute(BORDER_ATTR)).toBe(false);
    expect(ua.style.getPropertyValue('border-right-width')).toBe('1px');
  });

  it('sees a border that comes from a STYLESHEET, not an inline style', () => {
    // The real-world case, and the reason this pass reads computed style: on
    // stls.store the `|` is a styled-components rule, so the element carries
    // no inline border and the snapshot it leaves behind is empty.
    document.head.innerHTML = `<style>.entry.active { border-right: 1px solid #e0e0e0; }</style>`;
    setBody(`
      <div id="picker">
        <span id="ua" class="entry active" value="UA">UA</span
        ><a id="ru" class="entry" value="RU">RU</a>
      </div>
    `);
    filterPickers(findLanguagePickers(), ['uk'], { blocked: ['ru'] });
    const ua = document.querySelector<HTMLElement>('#ua')!;
    expect(ua.style.getPropertyValue('border-right-width')).toBe('0px');
    // Empty snapshot → teardown must removeProperty rather than restore a value.
    expect(ua.getAttribute(BORDER_ATTR)).toBe('');
  });

  it('abstains in a document with no window rather than throwing', () => {
    // `getComputedStyle` lives on the view, and a detached document
    // (createHTMLDocument, DOMParser output, a torn-down frame) has none. The
    // pass can't measure a border there, so it must leave the element alone —
    // the alternative is a TypeError inside the content script's filter tick.
    const detached = document.implementation.createHTMLDocument('detached');
    expect(detached.defaultView).toBeNull();
    detached.body.innerHTML = `
      <div id="picker">
        <span id="ua" value="UA" style="border-right: 1px solid #e0e0e0">UA</span
        ><a id="ru" value="RU">RU</a>
      </div>
    `;
    const container = detached.querySelector<HTMLElement>('#picker')!;
    const ua = detached.querySelector<HTMLElement>('#ua')!;
    const ru = detached.querySelector<HTMLElement>('#ru')!;
    const links = [
      { el: ua, language: 'uk' as const },
      { el: ru, language: 'ru' as const },
    ];

    filterPickers([{ container, links, allLinks: links, layout: 'inline' }], ['uk'], {
      blocked: ['ru'],
    });

    // RU still gets hidden — only the border measurement is skipped, so UA
    // keeps the site's own 1px rule untouched and carries no snapshot.
    expect(ru.style.display).toBe('none');
    expect(ua.hasAttribute(BORDER_ATTR)).toBe(false);
    expect(ua.style.getPropertyValue('border-right-width')).toBe('1px');
  });

  it('does not stamp a snapshot on a survivor that has no border at all', () => {
    setBody(`
      <div id="picker">
        <span id="ua" value="UA">UA</span><a id="ru" value="RU">RU</a>
      </div>
    `);
    filterPickers(findLanguagePickers(), ['uk'], { blocked: ['ru'] });
    expect(document.querySelector<HTMLElement>('#ua')!.hasAttribute(BORDER_ATTR)).toBe(false);
  });

  it('is idempotent across repeated passes (MutationObserver re-fires)', () => {
    setBody(`
      <div id="picker">
        <span id="ua" value="UA" style="border-right: 2px dotted #e0e0e0">UA</span
        ><a id="ru" value="RU">RU</a>
      </div>
    `);
    filterPickers(findLanguagePickers(), ['uk'], { blocked: ['ru'] });
    filterPickers(findLanguagePickers(), ['uk'], { blocked: ['ru'] });
    // The snapshot still holds the SITE's value, not our zero — a second pass
    // must not overwrite it with the width it just wrote.
    expect(document.querySelector<HTMLElement>('#ua')!.getAttribute(BORDER_ATTR)).toBe('2px');
  });

  it('restores the border verbatim on per-picker restore', () => {
    setBody(`
      <div id="picker">
        <span id="ua" value="UA" style="border-right: 2px dotted #e0e0e0">UA</span
        ><a id="ru" value="RU">RU</a>
      </div>
    `);
    filterPickers(findLanguagePickers(), ['uk'], { blocked: ['ru'] });
    const ua = document.querySelector<HTMLElement>('#ua')!;
    ua.focus();
    getTooltipHosts()[0]!.shadowRoot!.querySelector<HTMLButtonElement>('.action')!.click();
    expect(ua.style.getPropertyValue('border-right-width')).toBe('2px');
    expect(ua.hasAttribute(BORDER_ATTR)).toBe(false);
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

  it('leaves the stls.store picker visible, hiding only its RU entry', () => {
    // The reported site, end to end: seed → classify → hide. One survivor,
    // and it stays a normal picker — the tooltip is the only Movar surface.
    setupStlsStorePicker();
    const result = filterPickers(findLanguagePickers(), ['uk'], { blocked: ['ru'] });
    expect(result.hiddenLinks.map((l) => l.language)).toEqual(['ru']);
    expect(result.hiddenContainers).toHaveLength(0);
    const container = document.querySelector<HTMLElement>('#lang-switcher')!;
    expect(container.style.display).toBe('');
    expect(container.previousElementSibling).toBeNull();
    expect(document.querySelector<HTMLElement>('#ru')!.style.display).toBe('none');
    expect(document.querySelector<HTMLElement>('#ua')!.style.display).toBe('');
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

describe('filterPickers — native <select> explains on the control', () => {
  // An <option> can carry neither a chip (it may not contain an element) nor a
  // hover (every <option> reports a 0x0 box even with the control on screen),
  // so the inline path's one-tooltip-per-survivor left explanations that could
  // never be opened. The <select> itself is an ordinary box that takes hover
  // AND focus, so the explanation goes there instead.

  it('still hides the blocked option', () => {
    setupSelectPicker(); // uk / ru / en
    const result = filterPickers(findLanguagePickers(), ['uk', 'en'], { blocked: ['ru'] });

    const ru = document.querySelector<HTMLOptionElement>('option[value="ru"]')!;
    expect(ru.hidden).toBe(true);
    expect(ru.hasAttribute('data-movar-hidden')).toBe(true);
    expect(result.hiddenLinks.map((l) => l.language)).toEqual(['ru']);
  });

  it('adds nothing to the site tree and nothing to the tab order', () => {
    // A wrapper, not the bare fixture: with the <select> as a direct child of
    // <body> the badge would look like its sibling purely because body is where
    // floating hosts live, and the assertion would pass for the wrong reason.
    setBody(`
      <header id="bar">
        <select id="lang-select">
          <option value="uk">Українська</option>
          <option value="ru">Русский</option>
          <option value="en">English</option>
        </select>
        <button id="after">Menu</button>
      </header>
    `);
    const bar = document.querySelector<HTMLElement>('#bar')!;
    const before = bar.children.length;
    filterPickers(findLanguagePickers(), ['uk', 'en'], { blocked: ['ru'] });

    const badges = getControlBadges();
    expect(badges).toHaveLength(1);
    const select = document.querySelector<HTMLElement>('#lang-select')!;
    // The site's own tree is untouched, so `select + button` rules, :last-child,
    // nth-child and flex gap counts all keep working.
    expect(select.nextElementSibling).toBe(document.querySelector('#after'));
    expect(bar.children.length).toBe(before);
    expect(badges[0]!.parentElement).toBe(document.body);
    // And no side effects on the control itself.
    expect(select.style.getPropertyValue('display')).toBe('');
    // Inert: not announced a second time (the tooltip on the control carries
    // the message) and never a tab stop. `pointer-events: none` lives in the
    // shadow root's :host rule, which jsdom does not apply to the host — the
    // e2e spec asserts the computed value in a real browser instead.
    expect(badges[0]!.getAttribute('aria-hidden')).toBe('true');
    expect(badges[0]!.hasAttribute('tabindex')).toBe(false);
    expect(badges[0]!.dataset['mode']).toBe('badge');
  });

  it('rests as the bare mark and carries its label for hover/screen readers', () => {
    setupSelectPicker();
    filterPickers(findLanguagePickers(), ['uk', 'en'], { blocked: ['ru'] });

    const shadow = getControlBadges()[0]!.shadowRoot!;
    // The label is clipped by CSS on hover-out, not removed — so it stays in
    // the accessible name at every width.
    expect(shadow.querySelector('.chip__label')?.textContent).toBe('Movar: hidden');
    expect(shadow.querySelector('.chip__icon')).not.toBeNull();
    // A bare mark, not a button: restoring is a real change, and a target this
    // small beside a control the visitor is aiming at would fire by accident.
    expect(shadow.querySelector('button.chip')).toBeNull();
  });

  it('opens its tooltip from the CONTROL, which is already in the tab order', () => {
    // Anchoring on the badge looked fine in a unit test and was unreachable in
    // a real browser: a <div> host takes no focus, so tabbing never opened it.
    setupSelectPicker();
    filterPickers(findLanguagePickers(), ['uk', 'en'], { blocked: ['ru'] });

    const hosts = getTooltipHosts();
    expect(hosts).toHaveLength(1);
    const select = document.querySelector<HTMLElement>('#lang-select')!;
    select.dispatchEvent(new Event('focus'));
    expect(hosts[0]!.getAttribute('data-state')).toBe('open');
  });

  it('expands the badge while the control is hovered or focused', () => {
    setupSelectPicker();
    filterPickers(findLanguagePickers(), ['uk', 'en'], { blocked: ['ru'] });
    const badge = getControlBadges()[0]!;
    const select = document.querySelector<HTMLElement>('#lang-select')!;
    expect(badge.dataset['expanded']).toBeUndefined();

    select.dispatchEvent(new Event('focus'));
    expect(badge.dataset['expanded']).toBe('true');

    select.dispatchEvent(new Event('blur'));
    expect(badge.dataset['expanded']).toBeUndefined();
  });

  it('names the hidden language in the control tooltip', () => {
    setupSelectPicker();
    filterPickers(findLanguagePickers(), ['uk', 'en'], { blocked: ['ru'] });

    const body = getTooltipHosts()[0]!.shadowRoot!.querySelector('.body')?.textContent ?? '';
    expect(body.toLowerCase()).toContain('русск');
  });

  it("restores in place from the control tooltip, clearing each option's `hidden` flag", () => {
    // The <option>-hide path (HTMLOptionElement.hidden = true) and its inverse
    // in restorePickerInPlace are the only place the option branch fires.
    setupSelectPicker();
    filterPickers(findLanguagePickers(), ['uk', 'en'], { blocked: ['ru'] });
    const ru = document.querySelector<HTMLOptionElement>('option[value="ru"]')!;

    getTooltipHosts()[0]!.shadowRoot!.querySelector<HTMLButtonElement>('.action')!.click();

    expect(ru.hidden).toBe(false);
    expect(ru.hasAttribute('data-movar-hidden')).toBe(false);
    expect(ru.style.getPropertyValue('display')).toBe('');
    expect(getTooltipHosts()).toHaveLength(0);
    expect(getControlBadges()).toHaveLength(0);
  });

  it('adds no surface at all in hide mode', () => {
    // No presenter IS hide mode: applyContentModification passes one only when
    // concealMode is 'curtain'. The option still goes; nothing explains it.
    setupSelectPicker();
    filterPickersWithPresenter(findLanguagePickers(), ['uk', 'en'], { blocked: ['ru'] });

    expect(document.querySelector<HTMLOptionElement>('option[value="ru"]')!.hidden).toBe(true);
    expect(getTooltipHosts()).toHaveLength(0);
    expect(getControlBadges()).toHaveLength(0);
  });

  it('keeps the SAME badge and tooltip across MutationObserver re-fires', () => {
    // Not just "one tooltip": the same host. A rebuild starts closed, and the
    // pointer is already inside the anchor, so no fresh mouseenter fires and an
    // open explanation just disappears — measured at ~600ms into a motionless
    // hover before re-annotation became a no-op.
    setupSelectPicker();
    filterPickers(findLanguagePickers(), ['uk', 'en'], { blocked: ['ru'] });
    const first = getTooltipHosts()[0]!;
    const firstBadge = getControlBadges()[0]!;
    first.dataset['probe'] = 'original';

    filterPickers(findLanguagePickers(), ['uk', 'en'], { blocked: ['ru'] });
    filterPickers(findLanguagePickers(), ['uk', 'en'], { blocked: ['ru'] });

    const hosts = getTooltipHosts();
    expect(hosts).toHaveLength(1);
    expect(hosts[0]).toBe(first);
    expect(hosts[0]!.dataset['probe']).toBe('original');
    expect(getControlBadges()).toEqual([firstBadge]);
  });

  it('stays open across a re-fire while the pointer never moved', () => {
    setupSelectPicker();
    filterPickers(findLanguagePickers(), ['uk', 'en'], { blocked: ['ru'] });
    document.querySelector<HTMLElement>('#lang-select')!.dispatchEvent(new Event('focus'));
    expect(getTooltipHosts()[0]!.getAttribute('data-state')).toBe('open');

    filterPickers(findLanguagePickers(), ['uk', 'en'], { blocked: ['ru'] });

    expect(getTooltipHosts()[0]!.getAttribute('data-state')).toBe('open');
  });

  it('rebuilds when the hidden-language list actually changes', () => {
    // Idempotence must not become staleness: a second blocked language means
    // different copy, so the tooltip has to be replaced.
    setupSelectPicker();
    filterPickers(findLanguagePickers(), ['uk'], { blocked: ['ru'] });
    const first = getTooltipHosts()[0]!;

    filterPickers(findLanguagePickers(), ['uk'], { blocked: ['ru', 'en'] });

    const hosts = getTooltipHosts();
    expect(hosts).toHaveLength(1);
    expect(hosts[0]).not.toBe(first);
    const body = hosts[0]!.shadowRoot!.querySelector('.body')?.textContent ?? '';
    expect(body.toLowerCase()).toContain('русск');
    expect(body.toLowerCase()).toContain('english');
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
  // annotateSurvivingLinks always detaches a link's previously-attached
  // tooltip first (detachSurvivorTooltip), before deciding what to do next.
  // Two outcomes exercise that:
  //  - a link that survives BOTH passes gets its body refreshed instead of
  //    stacking a duplicate (UA here);
  //  - a link that WAS a survivor but is hidden by the second pass has its
  //    stale tooltip detached rather than orphaned — host removed from
  //    `document.body`, entry dropped from tooltip.ts's registry (DE here;
  //    regression coverage for movar#303, which used to `continue` on a
  //    HIDDEN_ATTR link before reaching the detach).

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
    // detached and re-attached with the refreshed hidden list (ru + de). DE
    // stops surviving and its pass-1 tooltip is detached along with it —
    // not left behind (movar#303) — so exactly one host remains.
    filterPickers(findLanguagePickers(), ['uk'], { blocked: ['ru', 'de'] });

    expect(getTooltipHosts()).toHaveLength(1);
    const bodyText =
      getTooltipHosts()[0]!.shadowRoot!.querySelector('.body')?.textContent.toLowerCase() ?? '';
    expect(bodyText).toContain('русск');
    expect(bodyText).toContain('deutsch');
  });

  it('detaches a survivor tooltip (host + registry entry) when the link is later hidden', () => {
    // movar#303: annotateSurvivingLinks's `if (link.el.hasAttribute(HIDDEN_ATTR))
    // continue;` used to run BEFORE the detach-existing branch, so a link
    // that had a survivor tooltip attached and later became HIDDEN_ATTR (a
    // subsequent pass hides it, or an SPA replaces it with a fresh node
    // carrying the marker) kept its old tooltip forever: the host — appended
    // to document.body, outside the picker subtree — was never removed, and
    // its AttachState stayed in tooltip.ts's registry.
    setupTwoLanguagePicker();
    filterPickers(findLanguagePickers(), ['uk'], { blocked: ['ru'] });
    // UA survives (RU is hidden) and gets a survivor tooltip.
    expect(getTooltipHosts()).toHaveLength(1);

    // UA becomes ineligible after its tooltip was attached. Re-running the
    // very same filter pass must not leave UA's now-stale tooltip behind.
    document.querySelector<HTMLAnchorElement>('#ua')!.setAttribute('data-movar-hidden', '');
    filterPickers(findLanguagePickers(), ['uk'], { blocked: ['ru'] });

    // No orphaned host anywhere in the document...
    expect(getTooltipHosts()).toHaveLength(0);
    // ...and nothing left in the registry for the page-wide sweep to find.
    detachAllTooltips();
    expect(getTooltipHosts()).toHaveLength(0);
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

describe("filterPickers — per-picker restore preserves an element's own inline display (#300)", () => {
  // hideElement snapshots the site's own inline `display` (+ priority) into
  // ORIGINAL_DISPLAY_ATTR / ORIGINAL_DISPLAY_PRIORITY_ATTR "so it can be put
  // back verbatim". restorePickerInPlace must actually read that snapshot on
  // restore instead of unconditionally removeProperty-ing `display`, which
  // would wipe an element's own inline display rather than restore it.

  it("restores a link's own inline display verbatim instead of clearing it", () => {
    setBody(`
      <div id="picker">
        <a id="ua" href="/ua/x">UA</a>
        <a id="ru" href="/ru/x" style="display: inline-flex">RU</a>
      </div>
    `);
    filterPickers(findLanguagePickers(), ['uk'], { blocked: ['ru'] });
    const ru = document.querySelector<HTMLAnchorElement>('#ru')!;
    expect(ru.style.display).toBe('none');

    // Restore via a surviving link's tooltip action → restorePickerInPlace.
    const ua = document.querySelector<HTMLAnchorElement>('#ua')!;
    ua.focus();
    getTooltipHosts()[0]!.shadowRoot!.querySelector<HTMLButtonElement>('.action')!.click();

    // RU's own inline-flex is back — not cleared — and the snapshot attrs are gone.
    expect(ru.style.getPropertyValue('display')).toBe('inline-flex');
    expect(ru.hasAttribute('data-movar-original-display')).toBe(false);
    expect(ru.hasAttribute('data-movar-original-display-priority')).toBe(false);
  });

  it("restores a link's own !important display priority, not just the value", () => {
    setBody(`
      <div id="picker">
        <a id="ua" href="/ua/x">UA</a>
        <a id="ru" href="/ru/x" style="display: inline-flex !important">RU</a>
      </div>
    `);
    filterPickers(findLanguagePickers(), ['uk'], { blocked: ['ru'] });
    const ru = document.querySelector<HTMLAnchorElement>('#ru')!;
    expect(ru.style.display).toBe('none');

    const ua = document.querySelector<HTMLAnchorElement>('#ua')!;
    ua.focus();
    getTooltipHosts()[0]!.shadowRoot!.querySelector<HTMLButtonElement>('.action')!.click();

    expect(ru.style.getPropertyValue('display')).toBe('inline-flex');
    expect(ru.style.getPropertyPriority('display')).toBe('important');
  });

  it("restores a stranded divider's own inline display verbatim (the other restoreOriginalDisplay call site)", () => {
    // Same contract, exercised through the divider-sibling un-hide loop in
    // restorePickerInPlace rather than the classified-link loop above.
    setBody(`
      <div id="picker">
        <a id="en" href="/en/x">EN</a>
        <span class="sep">|</span>
        <a id="ua" href="/ua/x">UA</a>
        <span class="sep" style="display: inline-flex">|</span>
        <a id="ru" href="/ru/x">RU</a>
      </div>
    `);
    filterPickers(findLanguagePickers(), ['uk', 'en'], { blocked: ['ru'] });
    const seps = document.querySelectorAll<HTMLElement>('.sep');
    expect(seps[1]!.style.display).toBe('none'); // UA | RU — stranded, hidden

    const en = document.querySelector<HTMLAnchorElement>('#en')!;
    en.focus();
    getTooltipHosts()[0]!.shadowRoot!.querySelector<HTMLButtonElement>('.action')!.click();

    expect(seps[1]!.style.getPropertyValue('display')).toBe('inline-flex');
    expect(seps[1]!.hasAttribute('data-movar-original-display')).toBe(false);
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

describe('filterPickers — regional-variant duplicates of a blocked language (movar#293)', () => {
  // normalizeBCP47 already collapses ru-RU/ru-UA to the base 'ru', so the
  // language MATCH isn't the problem — dedupByLanguage (extract.ts) then
  // keeps only the first same-language entry in picker.links for display.
  // Pre-fix, filterPickerLinks only ever looked at picker.links, so it hid
  // just that first RU anchor; the second RU regional-variant link was
  // never referenced again and stayed fully visible and clickable — the
  // blocked language leaked through it.

  it('hides EVERY regional-variant duplicate of a blocked base language, not just the first', () => {
    setBody(`
      <div id="picker">
        <a id="ru-ru" href="/x" hreflang="ru-RU">RU</a>
        <a id="ru-ua" href="/y" hreflang="ru-UA">RU</a>
        <a id="uk" href="/z" hreflang="uk">UK</a>
      </div>
    `);
    const result = filterPickers(findLanguagePickers(), ['uk'], { blocked: ['ru'] });
    expect(document.querySelector<HTMLElement>('#ru-ru')!.style.display).toBe('none');
    expect(document.querySelector<HTMLElement>('#ru-ua')!.style.display).toBe('none');
    expect(result.hiddenLinks.map((l) => l.language)).toEqual(['ru', 'ru']);
    // The non-blocked language is untouched.
    expect(document.querySelector<HTMLElement>('#uk')!.style.display).toBe('');
  });

  it('does not over-match — a non-blocked language with duplicates stays fully visible', () => {
    setBody(`
      <div id="picker">
        <a id="en-us" href="/x" hreflang="en-US">EN</a>
        <a id="en-gb" href="/y" hreflang="en-GB">EN</a>
        <a id="ru" href="/z" hreflang="ru">RU</a>
      </div>
    `);
    const result = filterPickers(findLanguagePickers(), ['uk', 'en'], { blocked: ['ru'] });
    expect(document.querySelector<HTMLElement>('#en-us')!.style.display).toBe('');
    expect(document.querySelector<HTMLElement>('#en-gb')!.style.display).toBe('');
    expect(result.hiddenLinks.map((l) => l.language)).toEqual(['ru']);
  });

  it('restores every regional-variant duplicate (not just the deduped display entry) on per-picker restore', () => {
    setBody(`
      <div id="picker">
        <a id="ru-ru" href="/x" hreflang="ru-RU">RU</a>
        <a id="ru-ua" href="/y" hreflang="ru-UA">RU</a>
        <a id="uk" href="/z" hreflang="uk">UK</a>
      </div>
    `);
    filterPickers(findLanguagePickers(), ['uk'], { blocked: ['ru'] });
    expect(document.querySelector<HTMLElement>('#ru-ru')!.style.display).toBe('none');
    expect(document.querySelector<HTMLElement>('#ru-ua')!.style.display).toBe('none');

    const uk = document.querySelector<HTMLAnchorElement>('#uk')!;
    uk.focus();
    getTooltipHosts()[0]!.shadowRoot!.querySelector<HTMLButtonElement>('.action')!.click();

    expect(document.querySelector<HTMLElement>('#ru-ru')!.style.display).toBe('');
    expect(document.querySelector<HTMLElement>('#ru-ua')!.style.display).toBe('');
    expect(document.querySelector<HTMLElement>('#ru-ru')!.hasAttribute('data-movar-hidden')).toBe(
      false,
    );
    expect(document.querySelector<HTMLElement>('#ru-ua')!.hasAttribute('data-movar-hidden')).toBe(
      false,
    );
  });
});

describe('filterPickers — list-shaped pickers get an in-row chip, never tooltips', () => {
  // The bigfive-test.com report: its language `<Select>` portals 42
  // `<li role="option">` rows into a dropdown, nine of which are languages
  // Movar classifies. The survivor tooltip attaches to EVERY survivor, so
  // hovering the list to read the options opened a panel over the rows around
  // the cursor — at a z-index above the site's own popover — and picking any
  // other language meant dodging eight of them.
  it('attaches no survivor tooltips to a listbox picker', () => {
    setupListboxPicker();
    filterPickers(findLanguagePickers(), ['uk', 'en'], { blocked: ['ru'] });
    expect(getTooltipHosts()).toHaveLength(0);
  });

  it('stands a chip in the hidden row instead, marked as Movar rather than as an option', () => {
    setupListboxPicker();
    filterPickers(findLanguagePickers(), ['uk', 'en'], { blocked: ['ru'] });

    const host = expectEntryCurtained('#opt-ru');
    expect(host.dataset['skin']).toBe('chip');
    // The row it replaces owned a full-width line, so the curtain takes the
    // whole slot rather than leaving most of the row blank.
    expect(host.dataset['block']).toBe('true');
    // The VISIBLE text names Movar, not the language: a row reading "русский"
    // among "Polish" and "Spanish" reads as an option to pick, and clicking it
    // restores rather than switches.
    const label = host.shadowRoot!.querySelector('.chip__label')?.textContent ?? '';
    expect(label).toBe('Movar: hidden');
    expect(label.toLowerCase()).not.toContain('русск');
    // The language it stands for survives in the hover / screen-reader copy.
    const described = host.shadowRoot!.querySelector('.chip')?.getAttribute('aria-label') ?? '';
    expect(described.toLowerCase()).toContain('русск');
    expect(host.getAttribute('title')?.toLowerCase()).toContain('русск');
    expect(getEntryCurtainHosts()).toHaveLength(1);
  });

  it('floors the chip at the row height, measured off a still-visible sibling', () => {
    // jsdom reports every offsetHeight as 0, so the sibling rows are given one.
    // The hidden row is deliberately NOT given one: the measurement has to come
    // from a sibling, since the entry's own box is gone by the time a chip goes
    // up (filterPickerLinks hides before cleanupSurvivingContainer marks).
    setupListboxPicker();
    for (const row of document.querySelectorAll<HTMLElement>('li[role="option"]')) {
      if (row.id === 'opt-ru') continue;
      Object.defineProperty(row, 'offsetHeight', { value: 28, configurable: true });
    }
    filterPickers(findLanguagePickers(), ['uk', 'en'], { blocked: ['ru'] });

    expect(expectEntryCurtained('#opt-ru').style.minHeight).toBe('28px');
  });

  it('sizes to its own content when no sibling can be measured', () => {
    // Every offsetHeight is 0 here (jsdom's default), which is also the real
    // case of a list rendered but not laid out. No floor beats a 0px one.
    setupListboxPicker();
    filterPickers(findLanguagePickers(), ['uk', 'en'], { blocked: ['ru'] });

    expect(expectEntryCurtained('#opt-ru').style.minHeight).toBe('');
  });

  it('leaves every surviving row untouched and clickable', () => {
    setupListboxPicker();
    filterPickers(findLanguagePickers(), ['uk', 'en'], { blocked: ['ru'] });
    for (const code of ['de', 'en', 'fr', 'uk']) {
      expect(document.querySelector<HTMLElement>(`#opt-${code}`)!.style.display).toBe('');
    }
  });

  it('restores the picker in place when the chip is clicked', () => {
    setupListboxPicker();
    filterPickers(findLanguagePickers(), ['uk', 'en'], { blocked: ['ru'] });

    const host = expectEntryCurtained('#opt-ru');
    host.shadowRoot!.querySelector<HTMLButtonElement>('button.chip')!.click();

    const entry = document.querySelector<HTMLElement>('#opt-ru')!;
    // Back to the site's own display value, not the `none !important` the chip
    // snapshotted when it took the slot.
    expect(entry.style.display).toBe('');
    expect(entry.hasAttribute('data-movar-hidden')).toBe(false);
    expect(getEntryCurtainHosts()).toHaveLength(0);
    expect(
      document.querySelector<HTMLElement>('#picker')!.hasAttribute('data-movar-restored'),
    ).toBe(true);
  });

  it('stays at one chip across MutationObserver re-fires', () => {
    setupListboxPicker();
    filterPickers(findLanguagePickers(), ['uk', 'en'], { blocked: ['ru'] });
    filterPickers(findLanguagePickers(), ['uk', 'en'], { blocked: ['ru'] });
    filterPickers(findLanguagePickers(), ['uk', 'en'], { blocked: ['ru'] });
    expect(getEntryCurtainHosts()).toHaveLength(1);
  });

  it('marks one chip per hidden LANGUAGE while hiding every regional duplicate', () => {
    setBody(`
      <div data-slot="popover">
        <ul id="picker" role="listbox">
          <li role="option" id="opt-uk" value="uk">Українська</li>
          <li role="option" id="opt-ru" value="ru-RU">Русский</li>
          <li role="option" id="opt-ru-ua" value="ru-UA">Русский (Украина)</li>
        </ul>
      </div>
    `);
    filterPickers(findLanguagePickers(), ['uk'], { blocked: ['ru'] });
    expect(getEntryCurtainHosts()).toHaveLength(1);
    expect(document.querySelector<HTMLElement>('#opt-ru')!.style.display).toBe('none');
    expect(document.querySelector<HTMLElement>('#opt-ru-ua')!.style.display).toBe('none');
  });

  it('still uses the survivor tooltip for an inline strip', () => {
    // The other shape keeps the old surface: a header strip's cleanup passes
    // close the gap completely, so there is no row left to mark.
    setBody(`
      <nav>
        <ul id="picker" class="lang-switcher">
          <li><a hreflang="ru" href="/ru/">Русский</a></li>
          <li><a hreflang="uk" href="/">Українська</a></li>
          <li><a hreflang="en" href="/en/">English</a></li>
        </ul>
      </nav>
    `);
    filterPickers(findLanguagePickers(), ['uk', 'en'], { blocked: ['ru'] });
    expect(getEntryCurtainHosts()).toHaveLength(0);
    expect(getTooltipHosts().length).toBeGreaterThan(0);
  });
});

/** What a teardown does to the page: drop every injected host, leaving the
 *  module-level bookkeeping behind exactly as the real sweeps do. */
function sweepInjectedHosts(): void {
  for (const host of document.querySelectorAll('[data-movar-curtain], [data-movar-tooltip]')) {
    host.remove();
  }
  for (const el of document.querySelectorAll('[data-movar-restored]')) {
    el.removeAttribute('data-movar-restored');
  }
}

describe('filterPickers — surfaces survive the sweeps that do not know about them', () => {
  // The page-wide sweeps (detachAllCurtains / detachAllTooltips) resolve handles
  // off the DOM and cannot reach picker-filter's module-level maps. Guards keyed
  // on presence alone therefore read "already marked" after a pause/resume,
  // settings toggle or "Show everything" — and attached nothing, re-hiding the
  // entry with no explanation and no way back.

  it('re-marks a list row after a sweep', () => {
    setupListboxPicker();
    filterPickers(findLanguagePickers(), ['uk', 'en'], { blocked: ['ru'] });
    expect(getEntryCurtainHosts()).toHaveLength(1);

    sweepInjectedHosts();
    filterPickers(findLanguagePickers(), ['uk', 'en'], { blocked: ['ru'] });

    expect(getEntryCurtainHosts()).toHaveLength(1);
  });

  it('re-marks a native <select> after a sweep', () => {
    setupSelectPicker();
    filterPickers(findLanguagePickers(), ['uk', 'en'], { blocked: ['ru'] });
    expect(getControlBadges()).toHaveLength(1);

    sweepInjectedHosts();
    filterPickers(findLanguagePickers(), ['uk', 'en'], { blocked: ['ru'] });

    expect(getControlBadges()).toHaveLength(1);
  });

  it('re-marks an inline strip after a sweep', () => {
    setupTwoLanguagePicker();
    filterPickers(findLanguagePickers(), ['uk'], { blocked: ['ru'] });
    expect(getTooltipHosts().length).toBeGreaterThan(0);

    sweepInjectedHosts();
    filterPickers(findLanguagePickers(), ['uk'], { blocked: ['ru'] });

    expect(getTooltipHosts().length).toBeGreaterThan(0);
  });
});

describe('filterPickers — a conceal-mode flip takes every surface with it', () => {
  // settings-reaction applies a bare concealMode change WITHOUT a teardown, so
  // the next pass simply runs with no presenter. Every mark path must treat that
  // as "remove what you put up", not as "nothing changed".

  it('drops the survivor tooltip when the presenter goes away', () => {
    setupTwoLanguagePicker();
    filterPickers(findLanguagePickers(), ['uk'], { blocked: ['ru'] });
    expect(getTooltipHosts().length).toBeGreaterThan(0);

    filterPickersWithPresenter(findLanguagePickers(), ['uk'], { blocked: ['ru'] });

    expect(getTooltipHosts()).toHaveLength(0);
  });

  it('drops the in-row chip when the presenter goes away', () => {
    setupListboxPicker();
    filterPickers(findLanguagePickers(), ['uk', 'en'], { blocked: ['ru'] });
    expect(getEntryCurtainHosts()).toHaveLength(1);

    filterPickersWithPresenter(findLanguagePickers(), ['uk', 'en'], { blocked: ['ru'] });

    expect(getEntryCurtainHosts()).toHaveLength(0);
  });

  it('drops the control badge when the presenter goes away', () => {
    setupSelectPicker();
    filterPickers(findLanguagePickers(), ['uk', 'en'], { blocked: ['ru'] });
    expect(getControlBadges()).toHaveLength(1);

    filterPickersWithPresenter(findLanguagePickers(), ['uk', 'en'], { blocked: ['ru'] });

    expect(getControlBadges()).toHaveLength(0);
    expect(getTooltipHosts()).toHaveLength(0);
  });
});

describe('filterPickers — a layout verdict that changes takes its old surface down', () => {
  it('removes inline-era tooltips once the picker reads as a list', () => {
    // react-aria stamps role="listbox" after hydration, so Movar's first pass
    // can read 'inline' and the next 'list'. Each path used to detach only its
    // own kind, leaving the tooltips as hover traps over the very rows the chip
    // was added to protect.
    setBody(`
      <div data-slot="popover">
        <ul id="picker">
          <li id="opt-uk" value="uk">Українська</li>
          <li id="opt-ru" value="ru">Русский</li>
          <li id="opt-en" value="en">English</li>
        </ul>
      </div>
    `);
    filterPickers(findLanguagePickers(), ['uk', 'en'], { blocked: ['ru'] });
    expect(getTooltipHosts().length).toBeGreaterThan(0);
    expect(getEntryCurtainHosts()).toHaveLength(0);

    // Hydration lands: the rows gain their roles.
    const list = document.querySelector<HTMLElement>('#picker')!;
    list.setAttribute('role', 'listbox');
    for (const row of list.children) row.setAttribute('role', 'option');
    filterPickers(findLanguagePickers(), ['uk', 'en'], { blocked: ['ru'] });

    expect(getEntryCurtainHosts()).toHaveLength(1);
    expect(getTooltipHosts()).toHaveLength(0);
  });
});

describe('filterPickers — restore covers rows the Picker snapshot never saw', () => {
  it('detaches the chip of an entry added after the snapshot', () => {
    // picker.links is a snapshot. A row the site adds later is hidden by a later
    // pass and carries its own chip; restoring from the first chip un-hid that
    // row but left its chip standing, and clicking the orphan wrote
    // `display:none !important` back onto an entry with no HIDDEN_ATTR — gone,
    // and unreachable by any later pass or sweep.
    setupListboxPicker();
    filterPickers(findLanguagePickers(), ['uk', 'en'], { blocked: ['ru'] });
    const first = expectEntryCurtained('#opt-ru');

    const list = document.querySelector<HTMLElement>('#picker')!;
    const added = document.createElement('li');
    added.setAttribute('role', 'option');
    added.id = 'opt-be';
    added.setAttribute('value', 'be');
    added.textContent = 'Беларуская';
    list.append(added);
    filterPickers(findLanguagePickers(), ['uk', 'en'], { blocked: ['ru', 'be'] });
    expect(getEntryCurtainHosts()).toHaveLength(2);

    first.shadowRoot!.querySelector<HTMLButtonElement>('button.chip')!.click();

    // Both rows are back and NO chip is left behind claiming otherwise.
    expect(getEntryCurtainHosts()).toHaveLength(0);
    for (const id of ['#opt-ru', '#opt-be']) {
      const row = document.querySelector<HTMLElement>(id)!;
      expect(row.style.getPropertyValue('display')).toBe('');
      expect(row.hasAttribute('data-movar-hidden')).toBe(false);
    }
  });
});

describe('filterPickers — a chip measured in a closed dropdown gets its height later', () => {
  it('rebuilds the chip once the row has a box', () => {
    // A list picker is usually inside a dropdown that is closed when the filter
    // runs, where every row measures 0. Keyed only on its language, the chip
    // kept the floorless height it was born with forever.
    setupListboxPicker();
    filterPickers(findLanguagePickers(), ['uk', 'en'], { blocked: ['ru'] });
    expect(expectEntryCurtained('#opt-ru').style.minHeight).toBe('');

    // The dropdown opens: the rows now have a box.
    for (const row of document.querySelectorAll<HTMLElement>('li[role="option"]')) {
      Object.defineProperty(row, 'offsetHeight', { value: 28, configurable: true });
    }
    filterPickers(findLanguagePickers(), ['uk', 'en'], { blocked: ['ru'] });

    expect(expectEntryCurtained('#opt-ru').style.minHeight).toBe('28px');
    expect(getEntryCurtainHosts()).toHaveLength(1);
  });
});

describe('filterPickers — a locale change refreshes the copy', () => {
  it('rebuilds a surface whose words would now render differently', () => {
    // A locale-only settings change re-runs the filter with no teardown, so a
    // surface keyed only on the languages it names kept the old language's copy.
    setupTwoLanguagePicker();
    const enPresenter = { ...testContentPresenter, copyRevision: () => 'en' };
    const ukPresenter = { ...testContentPresenter, copyRevision: () => 'uk' };

    filterPickersWithPresenter(findLanguagePickers(), ['uk'], { blocked: ['ru'] }, enPresenter);
    const first = getTooltipHosts()[0]!;

    filterPickersWithPresenter(findLanguagePickers(), ['uk'], { blocked: ['ru'] }, ukPresenter);

    const hosts = getTooltipHosts();
    expect(hosts.length).toBeGreaterThan(0);
    expect(hosts[0]).not.toBe(first);
  });
});

describe('filterPickers — a presenter that declines to mount', () => {
  // Every attach method on ContentPresenter is declared `PresenterHandle | null`.
  // A presenter that is visible but returns null for a given surface must leave
  // the filter working and the bookkeeping empty, not half-registered.
  const decliningPresenter = {
    ...testContentPresenter,
    attachPickerEntryCurtain: () => null,
    attachPickerControlBadge: () => null,
    attachPickerSurvivorTooltip: () => null,
  };

  it('still hides, and registers nothing, on a list picker', () => {
    setupListboxPicker();
    const result = filterPickersWithPresenter(
      findLanguagePickers(),
      ['uk', 'en'],
      { blocked: ['ru'] },
      decliningPresenter,
    );

    expect(result.hiddenLinks.map((l) => l.language)).toEqual(['ru']);
    expect(getEntryCurtainHosts()).toHaveLength(0);
  });

  it('still hides, and registers nothing, on a native <select>', () => {
    setupSelectPicker();
    filterPickersWithPresenter(
      findLanguagePickers(),
      ['uk', 'en'],
      { blocked: ['ru'] },
      decliningPresenter,
    );

    expect(document.querySelector<HTMLOptionElement>('option[value="ru"]')!.hidden).toBe(true);
    expect(getControlBadges()).toHaveLength(0);
  });

  it('still hides, and registers nothing, on an inline strip', () => {
    setupTwoLanguagePicker();
    filterPickersWithPresenter(
      findLanguagePickers(),
      ['uk'],
      { blocked: ['ru'] },
      decliningPresenter,
    );

    expect(document.querySelector<HTMLElement>('#ru')!.style.display).toBe('none');
    expect(getTooltipHosts()).toHaveLength(0);
  });
});

describe('restorePickerInPlace — a text-divider wrapper with no snapshot', () => {
  it('removes the wrapper rather than leaving a fake entry behind', () => {
    // trimContainerTextSeparators always records the original text, so a
    // wrapper without it is one a site re-render (or another extension) left
    // in the container. There is nothing to put back, so the structural span
    // goes — leaving it would strand a node the picker never rendered.
    setBody(`
      <div id="picker">
        <a id="ua" href="/ua/x">UA</a>
        <span data-movar-kind="text-divider">|</span>
        <a id="ru" href="/ru/x">RU</a>
        <a id="en" href="/en/x">EN</a>
      </div>
    `);
    filterPickers(findLanguagePickers(), ['uk', 'en'], { blocked: ['ru'] });
    const orphan = document.querySelector<HTMLElement>('[data-movar-kind="text-divider"]')!;
    expect(orphan.hasAttribute('data-movar-original-text')).toBe(false);

    getTooltipHosts()[0]!.shadowRoot!.querySelector<HTMLButtonElement>('.action')!.click();

    expect(document.querySelector('[data-movar-kind="text-divider"]')).toBeNull();
    expect(document.querySelector<HTMLElement>('#ru')!.style.display).toBe('');
  });
});
