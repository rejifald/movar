import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import { browser } from 'wxt/browser';
import { defaultSettings } from '@movar/settings';
import type { HiddenSummary } from '../../lib/messaging';

// page-text's sampleVisibleText reads `innerText`, which jsdom doesn't
// implement; the tier-7 text sniff is exercised by page-text's own suite, so
// here we stub it to "no sample" to keep applyOnce deterministic. vi.mock is
// hoisted above the `../content` import, so the stub is in place on load.
vi.mock('../../lib/page-text', () => ({ sampleVisibleText: () => '' }));
import { __test } from '../content';

/** fakeBrowser's onMessage.trigger only types (message, sender); the content
 *  bridge replies through the third `sendResponse` arg, so widen it here. The
 *  cast lives at the call so the fake method is invoked (not read off the
 *  object), keeping `unbound-method` quiet. */
type TriggerMessageFn = (
  message: unknown,
  sender: unknown,
  sendResponse: (response?: unknown) => void,
) => void;
function triggerMessage(
  message: unknown,
  sender: unknown,
  sendResponse: (response?: unknown) => void,
): void {
  (fakeBrowser.runtime.onMessage.trigger as unknown as TriggerMessageFn)(
    message,
    sender,
    sendResponse,
  );
}

beforeEach(() => {
  fakeBrowser.reset();
  __test.reset();
  document.body.innerHTML = '';
  // installSettingsListener (since #79) resolves the UI locale via
  // browser.i18n.getUILanguage(), which fakeBrowser leaves unimplemented.
  vi.spyOn(browser.i18n, 'getUILanguage').mockReturnValue('en');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('applyOnce orchestration', () => {
  it('no-ops on a neutral page and caches a null page language', async () => {
    expect(await __test.applyOnce(defaultSettings)).toBe(false);
    expect(__test.getHiddenSummary().pageLang).toBeNull();
  });

  it('bails immediately once the user override is set', async () => {
    __test.restoreAll();
    expect(__test.getHiddenSummary().userOverride).toBe(true);
    expect(await __test.applyOnce(defaultSettings)).toBe(false);
  });
});

describe('popup ↔ content message bridge', () => {
  it('answers movar:getHidden with the current hidden summary', () => {
    __test.installMessageBridge();
    const sendResponse = vi.fn();
    triggerMessage({ type: 'movar:getHidden' }, {}, sendResponse);
    expect(sendResponse).toHaveBeenCalledOnce();
    expect(sendResponse.mock.calls[0]![0]).toMatchObject({
      languages: [],
      containers: 0,
      feedCurtained: 0,
      feedHidden: 0,
    });
  });

  it('movar:restoreHidden sets the page override and returns the summary', () => {
    __test.installMessageBridge();
    const sendResponse = vi.fn();
    triggerMessage({ type: 'movar:restoreHidden' }, {}, sendResponse);
    expect((sendResponse.mock.calls[0]![0] as HiddenSummary).userOverride).toBe(true);
  });

  it('ignores message types it does not own', () => {
    __test.installMessageBridge();
    const sendResponse = vi.fn();
    triggerMessage({ type: 'movar:detectText', text: 'x' }, {}, sendResponse);
    expect(sendResponse).not.toHaveBeenCalled();
  });
});

describe('settings listener', () => {
  it('tears content modification down when the flag is switched off', () => {
    const live = { current: { ...defaultSettings, contentModification: true } };
    __test.installSettingsListener(live);
    void fakeBrowser.storage.onChanged.trigger(
      { settings: { newValue: { ...defaultSettings, contentModification: false } } },
      'sync',
    );
    expect(live.current.contentModification).toBe(false);
  });

  it('re-applies when content modification is switched on (clearing a prior override)', async () => {
    __test.restoreAll(); // sets userOverride
    const live = { current: { ...defaultSettings, contentModification: false } };
    __test.installSettingsListener(live);
    void fakeBrowser.storage.onChanged.trigger(
      { settings: { newValue: { ...defaultSettings, contentModification: true } } },
      'sync',
    );
    await vi.waitFor(() => {
      expect(live.current.contentModification).toBe(true);
    });
    expect(__test.getHiddenSummary().userOverride).toBe(false);
  });
});
