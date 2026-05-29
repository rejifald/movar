import { expect } from 'vitest';

export function setBody(html: string): void {
  document.body.innerHTML = html;
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
  setBody(`
    <${containerTag} ${attrs}>
      <a id="ua" href="/ua/x">UA</a>
      <a id="ru" href="/ru/x">RU</a>
    </${containerTag}>
  `);
  return document.querySelector(`${containerTag}#picker`) || document.querySelector(containerTag)!;
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
