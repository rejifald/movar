import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import { browser } from 'wxt/browser';
import { defaultSettings } from '@movar/settings';
import type { MovarSettings } from '@movar/settings';
import type { CapabilityNeeds } from '../../lib/capabilities';
import type { ProvisionedCapabilityModules } from '../../lib/capability-loader';
import type { ContentRuntime } from '../../lib/content-runtime';
import { isSupportedProtocol } from '../../lib/content-runtime';
import { getCorrectionEvents } from '../../lib/events';
import { correctionSink, installFakeChunks } from './content.test-utils';

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

describe('main() surface guards', () => {
  it('isSupportedProtocol allows only http/https', () => {
    expect(isSupportedProtocol('http:')).toBe(true);
    expect(isSupportedProtocol('https:')).toBe(true);
    for (const p of [
      'file:',
      'ftp:',
      'ws:',
      'wss:',
      'view-source:',
      'chrome-extension:',
      'about:',
    ]) {
      expect(isSupportedProtocol(p)).toBe(false);
    }
  });

  it('bails on a non-http(s) document before reading settings', async () => {
    // Rejecting get proves the proceed-path would have been observable; here it
    // must never be reached because the protocol guard short-circuits first.
    const get = vi.spyOn(browser.storage.sync, 'get').mockRejectedValue(new Error('stop'));
    const originalLocation = globalThis.location;
    Object.defineProperty(globalThis, 'location', {
      configurable: true,
      value: new URL('file:///Users/me/page.html'),
    });
    try {
      await runtime.main();
      expect(get).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(globalThis, 'location', {
        configurable: true,
        value: originalLocation,
      });
    }
  });

  it('bails inside a (sub)frame before reading settings', async () => {
    const get = vi.spyOn(browser.storage.sync, 'get').mockRejectedValue(new Error('stop'));
    const originalTop = Object.getOwnPropertyDescriptor(globalThis, 'top');
    Object.defineProperty(globalThis, 'top', { configurable: true, value: {} });
    try {
      // Default jsdom location is http://localhost/ (protocol ok); the top-frame
      // guard is what must trip here.
      await runtime.main();
      expect(get).not.toHaveBeenCalled();
    } finally {
      if (originalTop) Object.defineProperty(globalThis, 'top', originalTop);
      else delete (globalThis as { top?: unknown }).top;
    }
  });

  it('proceeds to read settings on an https top-level page', async () => {
    // get rejects so main() aborts at getSettings — right after the guards —
    // without installing listeners/observer; reaching get proves both guards passed.
    const get = vi.spyOn(browser.storage.sync, 'get').mockRejectedValue(new Error('stop'));
    const originalLocation = globalThis.location;
    Object.defineProperty(globalThis, 'location', {
      configurable: true,
      value: new URL('https://example.com/'),
    });
    try {
      await expect(runtime.main()).rejects.toThrow('stop');
      expect(get).toHaveBeenCalled();
    } finally {
      Object.defineProperty(globalThis, 'location', {
        configurable: true,
        value: originalLocation,
      });
    }
  });
});

/** jsdom has no layout, so a gate backdrop's blocking geometry has to be
 *  stubbed against the same viewport `findGateOverlay` reads (globalThis.inner*). */
function stubViewportRect(el: Element): void {
  const width = globalThis.innerWidth;
  const height = globalThis.innerHeight;
  el.getBoundingClientRect = (): DOMRect =>
    ({ x: 0, y: 0, top: 0, left: 0, right: width, bottom: height, width, height }) as DOMRect;
}

/** The «Оберіть мову / Выберите язык» interstitial reduced to what matters: a
 *  fixed full-viewport backdrop → panel → the two language anchors. The page
 *  behind it is already Ukrainian, which is exactly why the redirect ladder
 *  can't see this and the gate pass has to. Returns the languages clicked, with
 *  the default prevented — jsdom can't navigate. */
function setupGate(): { clicked: string[] } {
  document.documentElement.lang = 'uk';
  document.body.innerHTML = `
    <div id="backdrop" style="position:fixed;inset:0;z-index:99999;">
      <div id="panel">
        <p>Оберіть мову / Выберите язык</p>
        <p id="options">
          <a href="https://shop.example/ua/thing">Українська</a>
          <a href="https://shop.example/thing">Русский</a>
        </p>
      </div>
    </div>
  `;
  const backdrop = document.querySelector('#backdrop');
  if (backdrop) stubViewportRect(backdrop);
  const [uk, ru] = [...document.querySelectorAll('#options a')] as HTMLAnchorElement[];
  if (!uk || !ru) throw new Error('gate fixture did not render both anchors');
  const clicked: string[] = [];
  for (const [lang, el] of [
    ['uk', uk],
    ['ru', ru],
  ] as const) {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      clicked.push(lang);
    });
  }
  return { clicked };
}

const gateSettings: MovarSettings = {
  ...defaultSettings,
  priority: ['uk'],
  blocked: ['ru'],
  contentModification: false,
};

describe('blocking language gate', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    sessionStorage.clear();
    document.documentElement.lang = '';
  });

  it('clicks the preferred option and logs the correction', async () => {
    // End-to-end through applyOnce: proves the gateDeps wiring (interaction
    // flag, latch, session choice, simulated-click flag, correction record)
    // reaches trySatisfyLanguageGate, whose decision logic is unit-tested in
    // language-gate.test.ts.
    browser.runtime.onMessage.addListener(correctionSink as never);
    const { clicked } = setupGate();
    try {
      expect(await runtime.applyOnce(gateSettings)).toBe(true);
      expect(clicked).toEqual(['uk']);

      // fromLang is the blocked option the gate offered; toLang the one taken.
      const events = await getCorrectionEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({ mechanism: 'redirect', fromLang: 'ru', toLang: 'uk' });

      // Latched: a second pass on the same host must not click again, so a gate
      // whose own cookie never sticks costs one wasted reload, not a loop.
      clicked.length = 0;
      expect(await runtime.applyOnce(gateSettings)).toBe(false);
      expect(clicked).toEqual([]);
    } finally {
      browser.runtime.onMessage.removeListener(correctionSink as never);
    }
  });

  it('leaves the gate alone once the visitor has interacted with the page', async () => {
    // main() installs the interaction listener; once a trusted pointerdown has
    // reached the page, whatever is on screen may be something the visitor
    // opened, so the gate pass must stand down. Stub MutationObserver so
    // main()'s observer can't outlive this test's module instance and fire
    // against a later one.
    class NoopMutationObserver {
      observe(): void {}
      disconnect(): void {}
      takeRecords(): MutationRecord[] {
        return [];
      }
    }
    vi.stubGlobal('MutationObserver', NoopMutationObserver);
    // jsdom pins `isTrusted` to false as a non-configurable own property, so a
    // trusted event cannot be dispatched at all — take the registered handler
    // off the spy and hand it the event shape the browser would deliver.
    const addEventListener = vi.spyOn(document, 'addEventListener');
    try {
      await runtime.main();

      const handler = addEventListener.mock.calls.find(([type]) => type === 'pointerdown')?.[1];
      expect(typeof handler).toBe('function');
      if (typeof handler !== 'function') return;
      // A synthetic click (isTrusted false) is exactly what Movar's own picker
      // automation dispatches, and must not count as the visitor interacting.
      handler({ isTrusted: false } as Event);
      const beforeInteraction = setupGate();
      expect(await runtime.applyOnce(gateSettings)).toBe(true);
      expect(beforeInteraction.clicked).toEqual(['uk']);

      // Now the real thing. Fresh host so the latch from the pass above isn't
      // what's doing the work.
      sessionStorage.clear();
      handler({ isTrusted: true } as Event);
      const { clicked } = setupGate();
      expect(await runtime.applyOnce(gateSettings)).toBe(false);
      expect(clicked).toEqual([]);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
