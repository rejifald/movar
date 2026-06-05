import { describe, expect, it } from 'vitest';
import { findLanguagePickers } from './extract';
import { pickRedirectTarget } from './redirect';
import { setBody } from './picker.test-utils';

describe('pickRedirectTarget — descend into wrappers', () => {
  it('returns the inner anchor when the classified element is a wrapper', () => {
    setBody(`
      <ul>
        <li data-lang="uk"><a id="uk-link" href="/uk/x">Українська</a></li>
        <li data-lang="ru"><a href="/ru/x">Русский</a></li>
      </ul>
    `);
    const pickers = findLanguagePickers();
    expect(pickRedirectTarget(pickers, ['uk'])?.id).toBe('uk-link');
  });

  it('returns null when the wrapper has no inner clickable (covers inner ?? null branch)', () => {
    setBody(`
      <ul>
        <li data-lang="uk"><span>Українська</span></li>
        <li data-lang="ru"><span>Русский</span></li>
      </ul>
    `);
    const pickers = findLanguagePickers();
    expect(pickRedirectTarget(pickers, ['uk'])).toBeNull();
  });

  it('returns a <button> when the picker is form-POST based (bosch-style)', () => {
    setBody(`
      <form id="form-language">
        <button type="button" id="ru-btn" class="language-select active" title="Russian">ru</button>
        <button type="button" id="ua-btn" class="language-select" title="Українська">ua</button>
      </form>
    `);
    const pickers = findLanguagePickers();
    expect(pickRedirectTarget(pickers, ['uk'])?.id).toBe('ua-btn');
    expect(pickRedirectTarget(pickers, ['ru'])?.id).toBe('ru-btn');
  });
});

describe('pickRedirectTarget', () => {
  it('returns the highest-priority available anchor', () => {
    setBody(`
      <div id="picker">
        <a id="ru" href="/ru/x">RU</a>
        <a id="ua" href="/ua/x">UA</a>
        <a id="en" href="/en/x">EN</a>
      </div>
    `);
    const pickers = findLanguagePickers();
    expect(pickRedirectTarget(pickers, ['uk', 'en'])?.id).toBe('ua');
    expect(pickRedirectTarget(pickers, ['en', 'uk'])?.id).toBe('en');
  });

  it('falls through to the next priority language when the first is absent (if (!match) continue branch)', () => {
    setBody(`
      <div id="picker">
        <a id="ru" href="/ru/x">RU</a>
        <a id="ua" href="/ua/x">UA</a>
        <a id="en" href="/en/x">EN</a>
      </div>
    `);
    const pickers = findLanguagePickers();
    // 'fr' is not present in the picker → must skip to 'en'.
    expect(pickRedirectTarget(pickers, ['fr', 'en'])?.id).toBe('en');
  });

  it('skips non-anchor classified elements (no href to follow)', () => {
    setBody(`
      <li id="header-languages">
        <a id="ua" href="/ua/x" class="ua-link">українською</a>
        <span class="ru-link">по-русски</span>
      </li>
    `);
    const pickers = findLanguagePickers();
    expect(pickRedirectTarget(pickers, ['uk'])?.id).toBe('ua');
    expect(pickRedirectTarget(pickers, ['ru'])).toBeNull();
  });

  it('returns null when no priority language is present', () => {
    setBody(`
      <div id="picker">
        <a href="/ru/x">RU</a>
        <a href="/pl/x">PL</a>
      </div>
    `);
    expect(pickRedirectTarget(findLanguagePickers(), ['uk', 'en'])).toBeNull();
  });
});
