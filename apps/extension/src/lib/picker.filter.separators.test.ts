import { describe, expect, it } from 'vitest';
import { findLanguagePickers } from '@movar/lang-pickers/extract';
import {
  setBody,
  setup001ComUaPicker,
  getTooltipHosts,
} from '@movar/lang-pickers/picker.test-utils';
import {
  filterWithTestPresenter as filterPickers,
  describeNodes,
} from './picker.filter.test-utils';

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
