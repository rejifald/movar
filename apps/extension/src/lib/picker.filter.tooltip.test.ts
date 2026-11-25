import { describe, expect, it } from 'vitest';
import { findLanguagePickers } from '@movar/lang-pickers/extract';
import {
  setBody,
  setup001ComUaPicker,
  setupTwoLanguagePicker,
  setupStlsStorePicker,
  getTooltipHosts,
} from '@movar/lang-pickers/picker.test-utils';
import { filterWithTestPresenter as filterPickers } from './picker.filter.test-utils';

/** Assert that the '#picker' container was left fully visible and uncurtained
 *  after a blocked-mode filterPickers call. */
function expectPickerUncurtained(result: ReturnType<typeof filterPickers>): void {
  expect(result.hiddenContainers).toHaveLength(0);
  const container = document.querySelector<HTMLElement>('#picker')!;
  expect(container.style.display).toBe('');
  expect(container.previousElementSibling).toBeNull();
}

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
