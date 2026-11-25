import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import { browser } from 'wxt/browser';
import { defaultSettings } from '@movar/settings';
import type { HiddenSummary } from '../../lib/messaging';
import type { CapabilityNeeds } from '../../lib/capabilities';
import type { ProvisionedCapabilityModules } from '../../lib/capability-loader';
import type { ContentRuntime } from '../../lib/content-runtime';
import { getPickerChoice, recordPickerChoice } from '../../lib/session-choice';
import { getAttemptedUrls, markAttempt } from '../../lib/loop-guard';
import { getCorrectionEvents } from '../../lib/events';
import { RETRY_SETTLE_DELAY_MS } from '../../lib/empty-results-retry';
import type { Picker } from '@movar/lang-pickers/types';
import { correctionSink, fakeConcealModule, installFakeChunks } from './content.test-utils';

const capabilityLoaderMock = vi.hoisted(() => ({
  provisionCapabilities: vi.fn<(needs: CapabilityNeeds) => Promise<ProvisionedCapabilityModules>>(),
}));

// page-text's sampleVisibleText reads `innerText`, which jsdom doesn't
// implement; the tier-7 text sniff is exercised by page-text's own suite, so
// here we stub it to "no sample" to keep applyOnce deterministic. vi.mock is
// hoisted above the `../content` import, so the stub is in place on load.
vi.mock('../../lib/page-text', () => ({ sampleVisibleText: () => '' }));
vi.mock('../../lib/capability-loader', async (importOriginal) => {
  const actual = await importOriginal<object>();
  return {
    ...actual,
    provisionCapabilities: capabilityLoaderMock.provisionCapabilities,
  };
});

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

let runtime: ContentRuntime;

beforeEach(async () => {
  fakeBrowser.reset();
  capabilityLoaderMock.provisionCapabilities.mockReset();
  vi.resetModules();
  runtime = (await import('../../lib/content-runtime')).createContentRuntime();
  document.body.innerHTML = '';
  // installSettingsListener (since #79) resolves the UI locale via
  // browser.i18n.getUILanguage(), which fakeBrowser leaves unimplemented.
  vi.spyOn(browser.i18n, 'getUILanguage').mockReturnValue('en');
  // Stand in fake dynamic chunks so the content-modification branch is
  // exercisable without resolving real runtime.getURL modules in jsdom.
  installFakeChunks();
});

afterEach(async () => {
  // restoreAll / a concealing applyOnce schedule the debounced live-region
  // announcement on a real 600ms timer; clear it so it can't fire after jsdom
  // is torn down (`document is not defined` crashing whatever file runs next).
  // Dynamic import on purpose: resetModules in beforeEach gives each test a
  // fresh live-region instance, and a static import would tear down a stale one.
  (await import('../../lib/live-region')).teardownLiveRegion();
  vi.restoreAllMocks();
});

describe('applyOnce orchestration', () => {
  it('no-ops on a neutral page and caches a null page language', async () => {
    expect(await runtime.applyOnce(defaultSettings)).toBe(false);
    expect(runtime.getHiddenSummary().pageLang).toBeNull();
  });

  it('bails immediately once the user override is set', async () => {
    runtime.restoreAll();
    expect(runtime.getHiddenSummary().userOverride).toBe(true);
    expect(await runtime.applyOnce(defaultSettings)).toBe(false);
  });
});

describe('empty-SERP retry wiring', () => {
  // End-to-end through the real applyOnce: a google.com SERP already at the
  // rewrite target (hl/lr correct — the switch ladder no-ops) that renders an
  // empty results area must arm the settle-time retry, which then navigates
  // to the same query without `lr` and logs a 'search-retry' correction. The
  // decision logic itself is unit-tested in empty-results-retry.test.ts; this
  // pins the applyOnceInner wiring and the DOM/loop-guard/record deps.
  it('retries an empty google SERP once without lr and records the correction', async () => {
    sessionStorage.clear();
    vi.useFakeTimers();
    document.body.innerHTML = '<div id="search"><div id="rso"></div><p>0</p></div>';
    const pinnedUrl = 'https://www.google.com/search?q=test&hl=uk&lr=lang_uk';
    const fakeLocation = {
      href: pinnedUrl,
      hostname: 'www.google.com',
      protocol: 'https:',
      pathname: '/search',
      replace: vi.fn((next: string) => {
        fakeLocation.href = next;
      }),
      reload: vi.fn(),
    };
    // Stand the background correction writer in as the receiver for record()'s
    // `movar:logCorrections` send (see correctionSink); removed in `finally`.
    browser.runtime.onMessage.addListener(correctionSink as never);
    const originalLocation = globalThis.location;
    Object.defineProperty(globalThis, 'location', { configurable: true, value: fakeLocation });
    try {
      const settings = {
        ...defaultSettings,
        priority: ['uk' as const],
        contentModification: false,
      };
      expect(await runtime.applyOnce(settings)).toBe(false);
      // jsdom may not report readyState 'complete'; a load event releases the
      // whenSettled gate either way (the once-listener is gone if it already ran).
      globalThis.window.dispatchEvent(new Event('load'));
      await vi.advanceTimersByTimeAsync(RETRY_SETTLE_DELAY_MS);

      expect(fakeLocation.replace).toHaveBeenCalledTimes(1);
      const retried = new URL(fakeLocation.href);
      expect(retried.searchParams.has('lr')).toBe(false);
      expect(retried.searchParams.get('hl')).toBe('uk');
      expect(retried.searchParams.get('q')).toBe('test');
      // Both sides marked: the empty URL never re-retries, and the enforce
      // rewrite bails on the retried URL instead of re-adding lr.
      expect(getAttemptedUrls().toSorted()).toEqual([pinnedUrl, fakeLocation.href].toSorted());
      const events = await getCorrectionEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({ mechanism: 'search-retry', domain: 'www.google.com' });
    } finally {
      browser.runtime.onMessage.removeListener(correctionSink as never);
      Object.defineProperty(globalThis, 'location', {
        configurable: true,
        value: originalLocation,
      });
      vi.useRealTimers();
      sessionStorage.clear();
    }
  });

  // Reported bug: Google AI Mode (udm=50) blinked and lost its answer right
  // after "thinking". The DNR layer adds `lr` to any /search URL (udm-blind,
  // see lib/dnr.ts), and AI Mode renders `#search` with no `#rso` cards — the
  // exact empty-SERP shape (confirmed live) — so the retry fired a
  // location.replace mid-chat. It must share the rewrite's udm scope.
  it('never retries on Google AI Mode, even with lr present and no organic cards', async () => {
    sessionStorage.clear();
    vi.useFakeTimers();
    document.body.innerHTML = '<div id="search"><div class="ai-chat"></div></div>';
    const fakeLocation = {
      href: 'https://www.google.com/search?q=test&udm=50&hl=uk&lr=lang_uk',
      hostname: 'www.google.com',
      protocol: 'https:',
      pathname: '/search',
      replace: vi.fn((next: string) => {
        fakeLocation.href = next;
      }),
      reload: vi.fn(),
    };
    const originalLocation = globalThis.location;
    Object.defineProperty(globalThis, 'location', { configurable: true, value: fakeLocation });
    try {
      const settings = {
        ...defaultSettings,
        priority: ['uk' as const],
        contentModification: false,
      };
      expect(await runtime.applyOnce(settings)).toBe(false);
      globalThis.window.dispatchEvent(new Event('load'));
      await vi.advanceTimersByTimeAsync(RETRY_SETTLE_DELAY_MS);

      expect(fakeLocation.replace).not.toHaveBeenCalled();
      expect(getAttemptedUrls()).toEqual([]);
    } finally {
      Object.defineProperty(globalThis, 'location', {
        configurable: true,
        value: originalLocation,
      });
      vi.useRealTimers();
      sessionStorage.clear();
    }
  });
});

describe('picker choice capture', () => {
  it('records clicks inside remembered picker containers', () => {
    const picker = document.createElement('nav');
    const link = document.createElement('a');
    link.href = '/ru';
    link.hreflang = 'ru';
    link.textContent = 'Russian';
    picker.append(link);
    document.body.append(picker);

    runtime.rememberPickerContainers([{ container: picker } as Picker]);
    const event = new MouseEvent('click', { bubbles: true });
    Object.defineProperty(event, 'target', { value: link });

    runtime.handlePickerClickCapture(event);

    expect(getPickerChoice(location.hostname)).toBe('ru');
  });
});

describe('popup ↔ content message bridge', () => {
  it('answers movar:getHidden with the current hidden summary', () => {
    runtime.installMessageBridge();
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
    runtime.installMessageBridge();
    const sendResponse = vi.fn();
    triggerMessage({ type: 'movar:restoreHidden' }, {}, sendResponse);
    expect((sendResponse.mock.calls[0]![0] as HiddenSummary).userOverride).toBe(true);
  });

  it('reports switchSuppressed while the loop guard holds attempt history', () => {
    sessionStorage.clear();
    expect(runtime.getHiddenSummary().switchSuppressed).toBe(false);
    markAttempt('https://example.com/ru');
    expect(runtime.getHiddenSummary().switchSuppressed).toBe(true);
  });

  it('movar:retrySwitch clears both session guards so the switch can retry', () => {
    // Arm both suppressors, as a prior redirect "hiccup" + a manual picker
    // click to the blocked language would.
    sessionStorage.clear();
    markAttempt('https://example.com/ru');
    recordPickerChoice(location.hostname, 'ru');

    runtime.installMessageBridge();
    const sendResponse = vi.fn();
    triggerMessage({ type: 'movar:retrySwitch' }, {}, sendResponse);

    expect(getAttemptedUrls()).toEqual([]);
    expect(getPickerChoice(location.hostname)).toBeNull();
    expect(sendResponse).toHaveBeenCalledOnce();
    expect((sendResponse.mock.calls[0]![0] as HiddenSummary).switchSuppressed).toBe(false);
  });

  it('ignores message types it does not own', () => {
    runtime.installMessageBridge();
    const sendResponse = vi.fn();
    triggerMessage({ type: 'movar:detectText', text: 'x' }, {}, sendResponse);
    expect(sendResponse).not.toHaveBeenCalled();
  });
});

describe('settings listener', () => {
  it('tears content modification down when the flag is switched off', () => {
    const live = { current: { ...defaultSettings, contentModification: true } };
    runtime.installSettingsListener(live);
    void fakeBrowser.storage.onChanged.trigger(
      { settings: { newValue: { ...defaultSettings, contentModification: false } } },
      'sync',
    );
    expect(live.current.contentModification).toBe(false);
  });

  it('re-applies when content modification is switched on (clearing a prior override)', async () => {
    runtime.restoreAll(); // sets userOverride
    const live = { current: { ...defaultSettings, contentModification: false } };
    runtime.installSettingsListener(live);
    void fakeBrowser.storage.onChanged.trigger(
      { settings: { newValue: { ...defaultSettings, contentModification: true } } },
      'sync',
    );
    await vi.waitFor(() => {
      expect(live.current.contentModification).toBe(true);
    });
    expect(runtime.getHiddenSummary().userOverride).toBe(false);
  });
});

describe('pause listener', () => {
  it('stands an already-open tab down on pause and re-arms on resume (no reload)', async () => {
    const mod = fakeConcealModule();
    installFakeChunks({ 'features/conceal.js': mod });
    const settings = {
      ...defaultSettings,
      contentModification: true,
      concealMode: 'hide' as const,
    };
    const live = { current: settings };
    runtime.installPauseListener(live);

    // Baseline: on an active tab applyOnce runs the conceal facade.
    await runtime.applyOnce(settings);
    expect(mod.applyContentModification).toHaveBeenCalled();

    // Pause (the popup writes pause state to storage.local) → the listener tears
    // concealment down and makes applyOnce inert.
    await fakeBrowser.storage.local.set({
      'movar:pausedIndefinitely': true,
      'movar:pausedUntil': null,
    });
    await vi.waitFor(() => {
      expect(mod.teardownContentModification).toHaveBeenCalled();
    });

    // While paused, applyOnce is a no-op — so an observer/locationchange tick
    // (both of which just call applyOnce) does nothing and no redirect fires.
    mod.applyContentModification.mockClear();
    expect(await runtime.applyOnce(settings)).toBe(false);
    expect(mod.applyContentModification).not.toHaveBeenCalled();

    // Resume → the listener clears the flag and re-applies, no page reload.
    await fakeBrowser.storage.local.set({
      'movar:pausedIndefinitely': false,
      'movar:pausedUntil': null,
    });
    await vi.waitFor(() => {
      expect(mod.applyContentModification).toHaveBeenCalled();
    });
  });
});

describe('snooze listener', () => {
  it('stands a snoozed host down and re-arms when the snooze is removed (no reload)', async () => {
    const mod = fakeConcealModule();
    installFakeChunks({ 'features/conceal.js': mod });
    const settings = {
      ...defaultSettings,
      contentModification: true,
      concealMode: 'hide' as const,
    };
    const live = { current: settings };
    runtime.installSnoozeListener(live);

    // Baseline: the host isn't snoozed, so applyOnce conceals.
    await runtime.applyOnce(settings);
    expect(mod.applyContentModification).toHaveBeenCalled();

    // Snooze this host (the popup writes the snooze map to storage.local) → the
    // listener tears concealment down and makes applyOnce inert.
    await fakeBrowser.storage.local.set({
      'movar:snoozedHosts': { [location.hostname]: Date.now() + 3_600_000 },
    });
    await vi.waitFor(() => {
      expect(mod.teardownContentModification).toHaveBeenCalled();
    });

    mod.applyContentModification.mockClear();
    expect(await runtime.applyOnce(settings)).toBe(false);
    expect(mod.applyContentModification).not.toHaveBeenCalled();

    // Resume the site (snooze entry removed / swept at expiry) → re-applies in
    // place, no page reload.
    await fakeBrowser.storage.local.set({ 'movar:snoozedHosts': {} });
    await vi.waitFor(() => {
      expect(mod.applyContentModification).toHaveBeenCalled();
    });
  });
});
