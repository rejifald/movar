import { afterEach, describe, expect, it, vi } from 'vitest';
import { setContentLocale } from './i18n/content';
import { createContentPresenterAdapter } from './content-presenter-factory';
import { getHost, getShadow, setBody } from './dom-test-helpers';

const RealDisplayNames = Intl.DisplayNames;

function buttonNamed(root: ParentNode, label: string): HTMLButtonElement {
  const button = [...root.querySelectorAll<HTMLButtonElement>('button')].find(
    (candidate) => candidate.textContent === label,
  );
  if (!button) throw new Error(`button not found: ${label}`);
  return button;
}

function setDisplayNames(value: typeof Intl.DisplayNames): void {
  Object.defineProperty(Intl, 'DisplayNames', {
    configurable: true,
    writable: true,
    value,
  });
}

afterEach(() => {
  setDisplayNames(RealDisplayNames);
});

describe('createContentPresenterAdapter', () => {
  it('attaches a localized content curtain and wires both actions', () => {
    setContentLocale('en');
    setBody('<article id="card">Новина</article>');
    const presenter = createContentPresenterAdapter({ getColorScheme: () => 'dark' });
    const reveal = vi.fn();
    const hideAll = vi.fn();

    presenter.attachContentCurtain({
      target: document.querySelector<HTMLElement>('#card')!,
      language: 'ru',
      reveal,
      hideAll,
    });

    const shadow = getShadow(getHost()!);
    expect(shadow.textContent).toContain('Russian');
    expect(shadow.host.getAttribute('data-movar-color-scheme')).toBe('dark');

    buttonNamed(shadow, 'Show').click();
    expect(reveal).toHaveBeenCalledOnce();
    expect(getHost()).toBeNull();

    presenter.attachContentCurtain({
      target: document.querySelector<HTMLElement>('#card')!,
      language: 'ru',
      reveal,
      hideAll,
    });
    buttonNamed(getShadow(getHost()!), 'Hide all').click();
    expect(hideAll).toHaveBeenCalledOnce();
  });

  it('attaches picker curtains for surviving and fully-hidden containers', () => {
    setContentLocale('en');
    setBody('<div id="picker"><a>English</a><a>Russian</a></div>');
    const presenter = createContentPresenterAdapter({ getColorScheme: () => 'light' });
    const container = document.querySelector<HTMLElement>('#picker')!;

    presenter.attachPickerContainerCurtain({ container, survivingLanguage: 'uk' });
    expect(getShadow(getHost()!).textContent).toContain('українська');
    presenter.detachCurtains();

    presenter.attachPickerContainerCurtain({ container, survivingLanguage: null });
    expect(getHost()!.dataset['mode']).toBe('replace');
  });

  it('attaches a survivor tooltip and wires restore', () => {
    setContentLocale('en');
    setBody('<a id="anchor" href="#">English</a>');
    const presenter = createContentPresenterAdapter({ getColorScheme: () => 'dark' });
    const restore = vi.fn();

    presenter.attachPickerSurvivorTooltip({
      anchor: document.querySelector<HTMLAnchorElement>('#anchor')!,
      hiddenLanguages: ['ru', 'be'],
      restore,
    });

    const host = document.querySelector<HTMLElement>('[data-movar-tooltip]')!;
    expect(host.getAttribute('data-movar-color-scheme')).toBe('dark');
    const shadow = getShadow(host);
    expect(shadow.textContent).toContain('русский');
    expect(shadow.textContent).toContain('беларуская');

    buttonNamed(shadow, 'Show hidden options').click();
    expect(restore).toHaveBeenCalledOnce();

    presenter.detachAllTooltips();
    expect(document.querySelector('[data-movar-tooltip]')).toBeNull();
  });

  it('falls back to the language code when Intl has no display name', () => {
    setDisplayNames(function MissingDisplayNames() {
      return { of: () => {} };
    } as unknown as typeof Intl.DisplayNames);
    setContentLocale('en');
    setBody('<div id="picker"><a>English</a><a>Ukrainian</a></div>');
    const presenter = createContentPresenterAdapter({ getColorScheme: () => 'light' });

    presenter.attachPickerContainerCurtain({
      container: document.querySelector<HTMLElement>('#picker')!,
      survivingLanguage: 'uk',
    });

    expect(getShadow(getHost()!).textContent).toContain('uk');
  });

  it('falls back to the language code when Intl.DisplayNames throws', () => {
    setDisplayNames(function ThrowingDisplayNames() {
      throw new Error('display names unavailable');
    } as unknown as typeof Intl.DisplayNames);
    setContentLocale('en');
    setBody('<a id="anchor" href="#">English</a>');
    const presenter = createContentPresenterAdapter({ getColorScheme: () => 'light' });

    presenter.attachPickerSurvivorTooltip({
      anchor: document.querySelector<HTMLAnchorElement>('#anchor')!,
      hiddenLanguages: ['ru'],
      restore: () => {},
    });

    expect(
      getShadow(document.querySelector<HTMLElement>('[data-movar-tooltip]')!).textContent,
    ).toContain('ru');
  });
});
