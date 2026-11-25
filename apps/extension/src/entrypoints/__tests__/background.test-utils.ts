import { vi } from 'vitest';
import type { Mock } from 'vitest';
import { fakeBrowser } from 'wxt/testing';
import { browser } from 'wxt/browser';

export const SETTINGS_KEY = 'settings';
export const RULE_ID = 1;
export const GOOGLE_RULE_ID = 2;

type DnrUpdate = Parameters<typeof browser.declarativeNetRequest.updateDynamicRules>[0];
type DnrRule = NonNullable<DnrUpdate['addRules']>[number];

/** In-memory backing store for the DNR rule. The base fakeBrowser leaves
 *  `declarativeNetRequest` unimplemented (it throws "not implemented"), so we
 *  provide a tiny working implementation ourselves — exactly what that error
 *  message asks for — and read the installed rule back through it. Reset and
 *  re-spied per test in `installDnr()`. */
let dynamicRules: DnrRule[] = [];

/** Wire `updateDynamicRules` to mutate `dynamicRules` (sweep removeRuleIds,
 *  then append addRules) — the atomic replace `dnr.ts` relies on. The mock
 *  body is synchronous; `dnr.ts` awaits the call and `await undefined` settles
 *  immediately, so the in-memory store is consistent on the next read. */
export function installDnr(): void {
  dynamicRules = [];
  vi.spyOn(browser.declarativeNetRequest, 'updateDynamicRules').mockImplementation(
    (update: DnrUpdate) => {
      const remove = new Set<number>(update.removeRuleIds);
      dynamicRules = dynamicRules.filter((r) => !remove.has(r.id));
      if (update.addRules) dynamicRules.push(...update.addRules);
    },
  );
  // dnr.ts reads the installed rules back to skip writes whose outcome is
  // already in place, so the fake must answer reads too. A fresh clone per
  // read — dnr.ts deep-compares the result, and handing out the live store
  // reference would let structural sharing fake an equality. Returned as a
  // plain value (dnr.ts awaits it, and `await` lifts non-promises) so the
  // implementation fits the callback overload's void-return signature.
  vi.spyOn(browser.declarativeNetRequest, 'getDynamicRules').mockImplementation(() =>
    structuredClone(dynamicRules),
  );
}

/** The currently-installed Accept-Language rule, or undefined when removed. */
export function currentRule(): DnrRule | undefined {
  return dynamicRules.find((r) => r.id === RULE_ID);
}

/** The Google /search redirect rule (id 2), or undefined when removed. */
export function googleRedirectRule(): DnrRule | undefined {
  return dynamicRules.find((r) => r.id === GOOGLE_RULE_ID);
}

/** Run the background's main() to register every listener against the current
 *  fakeBrowser. The module is import-cached; `fakeBrowser.reset()` in beforeEach
 *  has already cleared every prior listener, so re-running main() registers a
 *  clean set (no resetModules — that would detach the spy we install on
 *  `declarativeNetRequest` from the `browser` the worker imports). */
export async function loadBackground(): Promise<void> {
  const mod = await import('../background');
  mod.default.main();
}

/** Fire the runtime.onMessage event and return the (single) franc listener's
 *  return value. fakeBrowser's `trigger` resolves to an array of every
 *  listener's result; the worker registers exactly one onMessage listener, so
 *  index 0 is its `true`/`false` "keep the channel open?" verdict. `msg` is
 *  optional so the falsy-message case omits it (a bare `undefined` arg).
 *
 *  fakeBrowser types `onMessage.trigger` as `(message, sender)` only, but the
 *  real Chrome listener (and the fake's runtime forwarding) also receives a
 *  `sendResponse` callback — so we widen the trigger to the 3-arg shape the
 *  worker's listener actually consumes. */
export interface MessageTriggerEvent {
  trigger(message: unknown, sender: unknown, sendResponse: () => void): Promise<unknown[]>;
}

/** fakeBrowser types `tabs.onUpdated.trigger` against the full Tabs.* types;
 *  widen it to the minimal `(tabId, changeInfo, tab)` shape the worker's
 *  `onUpdated` listener actually reads (status + url only). */
export interface UpdatedTriggerEvent {
  trigger(
    tabId: number,
    changeInfo: { status?: string; url?: string },
    tab: { url?: string; status?: string },
  ): Promise<unknown>;
}

export async function triggerMessage(sendResponse: () => void, msg?: unknown): Promise<unknown> {
  const onMessage = fakeBrowser.runtime.onMessage as unknown as MessageTriggerEvent;
  const results = await onMessage.trigger(msg, {}, sendResponse);
  return results[0];
}

/** fakeBrowser leaves `commands` unimplemented; stub `onCommand` so the
 *  worker's keyboard-shortcut listener registers in main() without throwing.
 *  The dispatch behaviour itself is covered in lib/commands.test.ts. */
export function stubCommands(): void {
  (browser as unknown as { commands: { onCommand: { addListener: () => void } } }).commands = {
    onCommand: { addListener: vi.fn() },
  };
}

/** fakeBrowser ships no `action` namespace; inject setIcon/setBadgeText spies
 *  (plus a no-op setBadgeBackgroundColor for main()'s initBadgeStyle) so the
 *  icon-repaint paths — the `movar:hiddenChanged` push handler and the
 *  `tabs.onUpdated` listener — register and are assertable (mirrors
 *  toolbar-icon.test.ts, which stubs the same surface). */
export const setIcon: Mock = vi.fn();
export const setBadgeText: Mock = vi.fn();
export function stubAction(): void {
  (browser as unknown as { action: unknown }).action = {
    setIcon,
    setBadgeText,
    setBadgeBackgroundColor: vi.fn(),
  };
}
