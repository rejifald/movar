export function setBody(html: string): void {
  document.body.innerHTML = html;
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
