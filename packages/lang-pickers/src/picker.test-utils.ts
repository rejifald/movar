import { expect } from 'vitest';
import type { LanguageCode } from '@movar/lang-detect';
import { findLanguagePickers } from './extract';

export function setBody(html: string): void {
  document.body.innerHTML = html;
}

/** Parse a single HTML fragment, attach it to the document, and return
 *  the first element typed to the caller's choice. Used by classify/find
 *  tests that need a real DOM-connected element to feed into the picker
 *  classifier (some classify paths read `getBoundingClientRect`, which
 *  requires the element to be in the tree). */
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- test-only convenience cast: callers pass the expected element type (elFromHtml<HTMLAnchorElement>(…)) to get a typed handle on the parsed fixture; the parse can't validate it, so this is an explicit caller-chosen assertion
export function elFromHtml<T extends HTMLElement>(html: string): T {
  const div = document.createElement('div');
  div.innerHTML = html.trim();
  document.body.append(div);
  return div.firstElementChild as T;
}

/** Asserts that the currently-set DOM yields exactly one picker via
 *  `findLanguagePickers` and that its classified languages match the
 *  expected set (order-independent). Body setup is the caller's job —
 *  by the time this runs, `setBody` / `setup*` helpers must already have
 *  populated the document. Folds the three-line findLanguagePickers →
 *  length → languages assertion that several tests repeat verbatim. */
export function expectSinglePickerWithLangs(expected: readonly LanguageCode[]): void {
  const pickers = findLanguagePickers();
  expect(pickers).toHaveLength(1);
  expect(pickers[0]!.links.map((l) => l.language).toSorted()).toEqual([...expected].toSorted());
}

/** 001.com.ua-style picker: an active-language leaf span with a visual
 *  separator baked into the same text node (`UA  |  `), next to a single
 *  switch anchor for the other language. Pass `ruLinkId` when the test
 *  needs to query the anchor by id. */
export function setup001ComUaPicker(options?: { ruLinkId?: string }): void {
  const ruId = options?.ruLinkId;
  const ruIdAttr = ruId != null && ruId !== '' ? ` id="${ruId}"` : '';
  setBody(`
    <ul>
      <li id="header-languages" class="switch-lang">
        <span>UA&nbsp;&nbsp;|&nbsp;&nbsp;</span><a${ruIdAttr} href="https://example.com/?lang=ru">RU</a>
      </li>
    </ul>
  `);
}

/** The inert "you are here" entry of an stls.store picker: a `<span>` wearing
 *  an `href` (so it renders like its anchor sibling) and the language in a
 *  non-standard `value` attribute. */
function stlsMarker(id: string, label: string, href: string, flag: boolean): string {
  return `<span id="${id}" href="${href}" value="${label}" class="sc-b53f1be3-1 peSin"><span>${stlsFlag(flag)}${label}</span></span>`;
}

/** The switch entry of an stls.store picker: an `<a>` with NO href — the
 *  framework owns the click — and the language only in `value`. */
function stlsAnchor(id: string, label: string, flag: boolean): string {
  return `<a id="${id}" value="${label}" class="sc-b53f1be3-1 iFFQHo"><span>${stlsFlag(flag)}${label}</span></a>`;
}

function stlsFlag(present: boolean): string {
  return present ? '<img src="/flag-ua.svg" alt="UA lang" width="16" height="16"/>' : '';
}

/** stls.store-style picker: styled-components hashes every class, so the only
 *  language signals are a non-standard `value="UA"`/`value="RU"` attribute and
 *  the label text. The ACTIVE entry is a `<span href="/uk/">` (an href on a
 *  span, so it renders like its sibling without navigating) and the INACTIVE
 *  one is an `<a>` with no href at all — React handles the click. Neither
 *  element matches `a[href]` or any class hint, so both are invisible to the
 *  seed query without the `value`/`href` carrier selectors.
 *
 *  `side` picks which of the two real pages to reproduce: `'uk'` (default) is
 *  https://stls.store/uk/, where UA is the inert active marker; `'ru'` is the
 *  https://stls.store/ root, where the roles are swapped and the UA anchor is
 *  the user's way out. Both are verbatim from the live DOM. */
export function setupStlsStorePicker(options?: { side?: 'uk' | 'ru' }): void {
  const entries =
    options?.side === 'ru'
      ? stlsAnchor('ua', 'UA', true) + stlsMarker('ru', 'RU', '/', false)
      : stlsMarker('ua', 'UA', '/uk/', true) + stlsAnchor('ru', 'RU', false);
  setBody(`
    <div class="sc-3c9d42ee-9 fLdWEg">
      <div id="lang-switcher" class="sc-b53f1be3-0 cLKwXM">${entries}</div>
    </div>
  `);
}

/** Assert that filterPickers collapsed `containerSelector` and inserted a
 *  picker-container curtain as its immediate previous sibling. Used by
 *  the real-site collapse tests where the assertion shape is identical. */
export function expectContainerCurtained(containerSelector: string): void {
  const container = document.querySelector<HTMLElement>(containerSelector)!;
  expect(container.style.display).toBe('none');
  expect((container.previousElementSibling as HTMLElement | null)?.dataset['movarKind']).toBe(
    'picker-container',
  );
}

export function setupTwoLanguagePicker(options?: {
  container?: string;
  containerAttrs?: string;
}): HTMLElement {
  const containerTag = options?.container ?? 'div';
  const attrs = options?.containerAttrs ?? 'id="picker"';
  // Callers MUST pass `id="picker"` in containerAttrs (the default does).
  // The query below is intentionally strict — a previous fallback to the
  // first matching tag silently returned the wrong element when callers
  // overrode `containerAttrs` without preserving the id.
  setBody(`
    <${containerTag} ${attrs}>
      <a id="ua" href="/ua/x">UA</a>
      <a id="ru" href="/ru/x">RU</a>
    </${containerTag}>
  `);
  const el = document.querySelector<HTMLElement>(`${containerTag}#picker`);
  if (!el) {
    throw new Error(
      `setupTwoLanguagePicker: container ${containerTag}#picker not found — pass id="picker" in containerAttrs`,
    );
  }
  return el;
}

export function setupFlagPickerUA_RU(): void {
  setBody(`
    <div class="lang-switcher">
      <a href="#" id="ua-flag"><img src="/ua.svg" alt="Українська" /></a>
      <a href="#" id="ru-flag"><img src="/ru.svg" alt="Русский" /></a>
    </div>
  `);
}

export function setupDeeplyNestedPicker(): void {
  setBody(`
    <div id="picker">
      <div><div><div><div><div><div><div><div>
        <a href="/ua/x">UA</a>
      </div></div></div></div></div></div></div></div>
      <div><div><div><div><div><div><div><div>
        <a href="/ru/x">RU</a>
      </div></div></div></div></div></div></div></div>
    </div>
  `);
}

export function setupSelectPicker(): void {
  setBody(`
    <select id="lang-select">
      <option value="uk">Українська</option>
      <option value="ru">Русский</option>
      <option value="en">English</option>
    </select>
  `);
}

/** Collect every tooltip host (`[data-movar-tooltip]`) currently attached
 *  under the document. Mirrors the `getHosts` helper in tooltip.test.ts
 *  but lives here because picker tests want the same query without
 *  reaching into the tooltip suite. */
export function getTooltipHosts(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('[data-movar-tooltip]')];
}
