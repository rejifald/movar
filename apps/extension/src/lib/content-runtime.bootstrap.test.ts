/**
 * `main()` — the content-script bootstrap: inert-tab guards, the paused/snoozed
 * seed, the DOM-ready wait, and the listeners and observer it leaves behind.
 */
import { describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import { browser } from 'wxt/browser';
import type { ContentScriptContext } from 'wxt/utils/content-script-context';
import { defaultSettings } from '@movar/settings';
import type { MovarSettings } from '@movar/settings';
import { getPickerChoice } from './session-choice';
import { fakeConcealModule, installFakeChunks } from '../entrypoints/__tests__/content.test-utils';
import {
  addedNodesRecord,
  documentHandler,
  recordBackgroundMessages,
  stubLocation,
  stubMutationObserver,
  useContentRuntime,
} from './content-runtime.test-utils';

vi.mock('./page-text', () => ({ sampleVisibleText: () => '' }));
vi.mock('./capability-loader', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  provisionCapabilities: vi.fn(),
}));

const h = useContentRuntime();

const filtering: MovarSettings = { ...defaultSettings, contentModification: true };

async function storeSettings(settings: MovarSettings): Promise<void> {
  await fakeBrowser.storage.sync.set({ settings });
}

/** A conceal facade wired in as the loaded chunk, so "did a tick run the
 *  content pass" is a call count. */
function installConceal(): ReturnType<typeof fakeConcealModule> {
  const mod = fakeConcealModule();
  installFakeChunks({ 'features/conceal.js': mod });
  return mod;
}

describe('main() inert-tab guards', () => {
  it('bails in a cross-origin frame, where reading window.top throws', async () => {
    const get = vi.spyOn(browser.storage.sync, 'get');
    vi.spyOn(globalThis, 'top', 'get').mockImplementation(() => {
      throw new DOMException('Blocked a frame with origin', 'SecurityError');
    });

    await h.runtime.main();

    expect(get).not.toHaveBeenCalled();
  });

  it.each([
    ['Movar is switched off', { settings: { ...filtering, enabled: false } }, {}],
    ['the host is an exempt site', { settings: { ...filtering, allowlist: ['shop.example'] } }, {}],
    [
      'the host was turned off until the next update',
      { settings: filtering },
      { 'movar:disabledUntilUpdateHosts': ['shop.example'] },
    ],
  ])('leaves the page untouched when %s', async (_why, sync, local) => {
    stubLocation('https://shop.example/catalog');
    await fakeBrowser.storage.sync.set(sync);
    await fakeBrowser.storage.local.set(local);
    const observer = stubMutationObserver();
    const conceal = installConceal();
    const background = recordBackgroundMessages();

    await h.runtime.main();

    expect(conceal.applyContentModification).not.toHaveBeenCalled();
    expect(observer.callbacks).toHaveLength(0);
    expect(background.types).not.toContain('movar:warmFranc');
  });
});

describe('main() on an active tab', () => {
  it('warms the background language engine, applies once and starts watching the body', async () => {
    await storeSettings(filtering);
    const observer = stubMutationObserver();
    const conceal = installConceal();
    const background = recordBackgroundMessages();

    await h.runtime.main();

    expect(background.types).toContain('movar:warmFranc');
    expect(conceal.applyContentModification).toHaveBeenCalledOnce();
    expect(observer.targets).toEqual([document.body]);
  });

  it('re-applies once per burst of page mutations, after the debounce', async () => {
    await storeSettings(filtering);
    const observer = stubMutationObserver();
    const conceal = installConceal();
    await h.runtime.main();
    const [onMutations] = observer.callbacks;
    if (!onMutations) throw new Error('main() installed no observer');

    vi.useFakeTimers();
    const record = addedNodesRecord(document.createElement('article'));
    onMutations([record], {} as MutationObserver);
    onMutations([record], {} as MutationObserver);
    await vi.runAllTimersAsync();

    expect(conceal.applyContentModification).toHaveBeenCalledTimes(2);
  });

  it('does not start the observer when the first apply navigates the page away', async () => {
    // An indexed `?hl=ru` link: the blocked-locale rewrite navigates on the
    // first tick, so the page is unloading and nothing is left to watch.
    const loc = stubLocation('https://classroom.google.com/u/1/h?hl=ru');
    await storeSettings({ ...defaultSettings, priority: ['uk'], blocked: ['ru'] });
    const observer = stubMutationObserver();

    await h.runtime.main();

    expect(loc.replace).toHaveBeenCalledOnce();
    expect(new URL(loc.href).searchParams.get('hl')).toBe('uk');
    expect(observer.callbacks).toHaveLength(0);
  });

  it('holds the first apply until the DOM is parsed', async () => {
    // document_start: the body the passes walk doesn't exist yet.
    await storeSettings(filtering);
    stubMutationObserver();
    const conceal = installConceal();
    vi.spyOn(document, 'readyState', 'get').mockReturnValue('loading');
    const addListener = vi.spyOn(document, 'addEventListener');

    const done = h.runtime.main();
    await vi.waitFor(() => {
      expect(addListener.mock.calls.some(([type]) => type === 'DOMContentLoaded')).toBe(true);
    });
    expect(conceal.applyContentModification).not.toHaveBeenCalled();

    document.dispatchEvent(new Event('DOMContentLoaded'));
    await done;

    expect(conceal.applyContentModification).toHaveBeenCalledOnce();
  });
});

describe('main() on a tab that loads paused or snoozed', () => {
  it.each([
    [
      'paused',
      { 'movar:pausedIndefinitely': true, 'movar:pausedUntil': null },
      { 'movar:pausedIndefinitely': false, 'movar:pausedUntil': null },
    ],
    [
      'snoozed',
      { 'movar:snoozedHosts': { localhost: Date.now() + 3_600_000 } },
      { 'movar:snoozedHosts': {} },
    ],
  ])('stays inert while %s, then re-arms on resume without a reload', async (_s, on, off) => {
    await storeSettings(filtering);
    await fakeBrowser.storage.local.set(on);
    const observer = stubMutationObserver();
    const conceal = installConceal();
    const background = recordBackgroundMessages();

    await h.runtime.main();

    // Nothing detects until resume, so the worker isn't woken either.
    expect(background.types).not.toContain('movar:warmFranc');
    expect(conceal.applyContentModification).not.toHaveBeenCalled();
    // ...but the listeners and observer are in place for the resume.
    expect(observer.callbacks).toHaveLength(1);

    await fakeBrowser.storage.local.set(off);
    await vi.waitFor(() => {
      expect(conceal.applyContentModification).toHaveBeenCalledOnce();
    });
  });
});

/** A header language switcher on an already-Ukrainian page, so the first
 *  apply remembers it as a picker and has nothing to switch. */
function renderSwitcher(): { ru: HTMLAnchorElement } {
  document.documentElement.lang = 'uk';
  document.body.innerHTML = `
    <ul class="lang-switcher">
      <li><a href="https://shop.example/uk/" hreflang="uk">Українська</a></li>
      <li><a id="ru" href="https://shop.example/ru/" hreflang="ru">Русский</a></li>
    </ul>`;
  const ru = document.querySelector<HTMLAnchorElement>('#ru');
  if (!ru) throw new Error('switcher did not render');
  return { ru };
}

describe('main() listeners', () => {
  it('records a trusted click in the site picker as the visitor’s choice, and nothing else', async () => {
    stubMutationObserver();
    const { ru } = renderSwitcher();
    const addListener = vi.spyOn(document, 'addEventListener');
    await h.runtime.main();
    const onClick = documentHandler(addListener, 'click');

    // A page script's synthetic click is not the visitor choosing anything.
    onClick({ isTrusted: false, target: ru });
    expect(getPickerChoice(location.hostname)).toBeNull();
    // Nor is a trusted event that didn't land on an element.
    onClick({ isTrusted: true, target: document });
    expect(getPickerChoice(location.hostname)).toBeNull();

    onClick({ isTrusted: true, target: ru });
    expect(getPickerChoice(location.hostname)).toBe('ru');
  });

  it('re-applies on an SPA navigation WXT reports through the script context', async () => {
    await storeSettings(filtering);
    stubMutationObserver();
    const conceal = installConceal();
    const addEventListener = vi.fn();
    const ctx = { addEventListener } as unknown as ContentScriptContext;

    await h.runtime.main(ctx);
    expect(addEventListener).toHaveBeenCalledWith(
      globalThis,
      'wxt:locationchange',
      expect.any(Function),
    );
    const onLocationChange = addEventListener.mock.calls[0]?.[2] as (event: {
      newUrl: URL;
      oldUrl: URL;
    }) => void;

    // "Show everything" silences this page...
    h.runtime.restoreAll();
    expect(h.runtime.getHiddenSummary().userOverride).toBe(true);

    // ...until the visitor moves to a new route (committed navigation).
    stubLocation('https://example.com/next');
    onLocationChange({
      newUrl: new URL('https://example.com/next'),
      oldUrl: new URL('https://example.com/first'),
    });

    expect(h.runtime.getHiddenSummary().userOverride).toBe(false);
    await vi.waitFor(() => {
      expect(conceal.applyContentModification).toHaveBeenCalledTimes(2);
    });
  });
});
