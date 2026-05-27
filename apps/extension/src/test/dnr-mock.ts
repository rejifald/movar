/**
 * DNR (declarativeNetRequest) shim for integration tests.
 *
 * wxt/testing's `fakeBrowser` does not implement
 * `browser.declarativeNetRequest`, so we provide our own in-memory shim
 * here. Tests that boot the background script through fakeBrowser query
 * the installed rules via the helpers below.
 *
 * NOTE: This file is a stub — the helpers throw on call. Flesh out before
 * running `apps/extension/src/test/background.integration.test.ts`:
 *   - `installDnrShim()` should attach a fake
 *     `declarativeNetRequest.updateDynamicRules(...)` onto `fakeBrowser`
 *     that maintains a Map<ruleId, rule> in this module's scope.
 *   - `getInstalledRules()` should return Array.from(map.values()).
 *   - `getInstalledAcceptLanguageRule()` should return the rule with
 *     id === 1 (the constant ACCEPT_LANGUAGE_RULE_ID from ../lib/dnr).
 */
import type { browser } from 'wxt/browser';

/** The exact Rule shape the installed `browser` types expect. */
export type DnrRule = NonNullable<
  Parameters<typeof browser.declarativeNetRequest.updateDynamicRules>[0]['addRules']
>[number];

const NOT_IMPLEMENTED =
  'apps/extension/src/test/dnr-mock.ts is a stub. ' +
  'Implement the DNR shim before running the background integration tests.';

/** Return the installed Accept-Language rule (id 1), or null if not installed. */
export function getInstalledAcceptLanguageRule(): DnrRule | null {
  throw new Error(NOT_IMPLEMENTED);
}

/** Return every rule currently installed via updateDynamicRules. */
export function getInstalledRules(): DnrRule[] {
  throw new Error(NOT_IMPLEMENTED);
}

/** Install the shim onto fakeBrowser. Call from beforeEach (via setup.ts). */
// Intentional scaffolding referenced by the .skip'd integration tests;
// drops when the stub is fleshed out.
// fallow-ignore-next-line unused-export
export function installDnrShim(): void {
  throw new Error(NOT_IMPLEMENTED);
}
