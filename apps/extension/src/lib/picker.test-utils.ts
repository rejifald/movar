import { expect } from 'vitest';
import type { LanguageCode } from '@movar/shared';
import { findLanguagePickers } from './picker';

export function setBody(html: string): void {
  document.body.innerHTML = html;
}

/** Parse a single HTML fragment, attach it to the document, and return
 *  the first element typed to the caller's choice. Used by classify/find
 *  tests that need a real DOM-connected element to feed into the picker
 *  classifier (some classify paths read `getBoundingClientRect`, which
 *  requires the element to be in the tree). */
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
  expect(pickers[0]!.links.map((l) => l.language).sort()).toEqual([...expected].sort());
}

/** 001.com.ua-style picker: an active-language leaf span with a visual
 *  separator baked into the same text node (`UA  |  `), next to a single
 *  switch anchor for the other language. Pass `ruLinkId` when the test
 *  needs to query the anchor by id. */
export function setup001ComUaPicker(options?: { ruLinkId?: string }): void {
  const ruIdAttr = options?.ruLinkId ? ` id="${options.ruLinkId}"` : '';
  setBody(`
    <ul>
      <li id="header-languages" class="switch-lang">
        <span>UA&nbsp;&nbsp;|&nbsp;&nbsp;</span><a${ruIdAttr} href="https://example.com/?lang=ru">RU</a>
      </li>
    </ul>
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
