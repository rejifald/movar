import { describe, expect, it } from 'vitest';
import { findLanguagePickers } from '@movar/lang-pickers/extract';
import {
  setBody,
  setup001ComUaPicker,
  setupTwoLanguagePicker,
  expectContainerCurtained,
} from '@movar/lang-pickers/picker.test-utils';
import { filterWithTestPresenter as filterPickers } from './picker.filter.test-utils';

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
