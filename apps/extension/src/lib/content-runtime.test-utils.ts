/**
 * Shared harness for the `content-runtime.<surface>.test.ts` suites.
 *
 * The runtime keeps its state at module level (pause/snooze flags, the active
 * presenter, the "Show everything" override), so every test gets a fresh module
 * instance via `vi.resetModules()` and drives it only through its public API and
 * the browser/DOM events it listens to.
 *
 * `vi.mock` is hoisted per file, so each suite still declares its own mocks for
 * `./page-text` (jsdom has no `innerText`) and `./capability-loader` (the real
 * chunks load from web-accessible files jsdom can't import).
 */
import { afterEach, beforeEach, vi } from 'vitest';
import type { Mock } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import { browser } from 'wxt/browser';
import type { MovarMessage } from './messaging';
import type { ContentRuntime } from './content-runtime';
import { installFakeChunks } from '../entrypoints/__tests__/content.test-utils';

export interface RuntimeHarness {
  readonly runtime: ContentRuntime;
}

/** Register the per-test lifecycle every runtime suite shares and return a
 *  handle whose `runtime` is the current test's fresh instance. */
export function useContentRuntime(): RuntimeHarness {
  const harness: { runtime: ContentRuntime | null } = { runtime: null };

  beforeEach(async () => {
    fakeBrowser.reset();
    vi.resetModules();
    harness.runtime = (await import('./content-runtime')).createContentRuntime();
    document.body.innerHTML = '';
    document.documentElement.removeAttribute('lang');
    sessionStorage.clear();
    // fakeBrowser leaves getUILanguage unimplemented; the runtime resolves the
    // content locale through it on every conceal pass.
    vi.spyOn(browser.i18n, 'getUILanguage').mockReturnValue('en');
    installFakeChunks();
  });

  afterEach(async () => {
    // A concealing pass schedules the debounced live-region announcement on a
    // real timer; clear it on this test's module instance before jsdom moves on.
    (await import('./live-region')).teardownLiveRegion();
    restoreLocation();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    sessionStorage.clear();
  });

  return {
    get runtime(): ContentRuntime {
      if (!harness.runtime) throw new Error('runtime is only available inside a test');
      return harness.runtime;
    },
  };
}

export interface StubbedLocation {
  href: string;
  hostname: string;
  protocol: string;
  pathname: string;
  replace: Mock<(url: string) => void>;
  reload: Mock<() => void>;
}

let originalLocation: PropertyDescriptor | undefined;

/** Stand the page on `href`. `replace` moves the stub to the new URL the way a
 *  same-document navigation would, so a test can follow where the runtime sent
 *  the page. Restored automatically after each test by {@link useContentRuntime}. */
export function stubLocation(href: string): StubbedLocation {
  originalLocation ??= Object.getOwnPropertyDescriptor(globalThis, 'location');
  const loc: StubbedLocation = {
    href,
    hostname: '',
    protocol: '',
    pathname: '',
    replace: vi.fn((next: string) => {
      moveTo(next);
    }),
    reload: vi.fn(),
  };
  function moveTo(next: string): void {
    const url = new URL(next);
    loc.href = url.href;
    loc.hostname = url.hostname;
    loc.protocol = url.protocol;
    loc.pathname = url.pathname;
  }
  moveTo(href);
  Object.defineProperty(globalThis, 'location', { configurable: true, value: loc });
  return loc;
}

function restoreLocation(): void {
  if (!originalLocation) return;
  Object.defineProperty(globalThis, 'location', originalLocation);
  originalLocation = undefined;
}

/** Stand in for the page's MutationObserver: records each observer's callback
 *  and target instead of watching the live DOM, so a test drives "the page
 *  mutated" by hand and no observer outlives its module instance. */
export function stubMutationObserver(): {
  callbacks: MutationCallback[];
  targets: Node[];
} {
  const callbacks: MutationCallback[] = [];
  const targets: Node[] = [];
  class RecordingMutationObserver {
    constructor(callback: MutationCallback) {
      callbacks.push(callback);
    }
    observe(target: Node): void {
      targets.push(target);
    }
    disconnect(): void {}
    takeRecords(): MutationRecord[] {
      return [];
    }
  }
  vi.stubGlobal('MutationObserver', RecordingMutationObserver);
  return { callbacks, targets };
}

/** A MutationRecord carrying only what the scheduler reads: the added nodes. */
export function addedNodesRecord(...nodes: Node[]): MutationRecord {
  return { addedNodes: nodes as unknown as NodeList } as unknown as MutationRecord;
}

/** Background stand-in: records the type of every message the content script
 *  sends and answers with `reply` (none = no answer). */
export function recordBackgroundMessages(reply?: (msg: MovarMessage) => unknown): {
  types: string[];
} {
  const types: string[] = [];
  browser.runtime.onMessage.addListener(((raw: unknown) => {
    const msg = raw as MovarMessage;
    types.push(msg.type);
    return reply?.(msg);
  }) as never);
  return { types };
}

/** The handler the runtime registered on `document` for `type`, taken off an
 *  `addEventListener` spy. jsdom pins `isTrusted` to false, so a trusted event
 *  can only be delivered by calling the handler with the browser's event shape. */
export function documentHandler(
  spy: { mock: { calls: unknown[][] } },
  type: string,
): (event: Partial<Event> & { isTrusted: boolean }) => void {
  const handler = spy.mock.calls.find(([t]) => t === type)?.[1];
  if (typeof handler !== 'function') throw new Error(`no ${type} listener was registered`);
  return handler as (event: Partial<Event> & { isTrusted: boolean }) => void;
}
