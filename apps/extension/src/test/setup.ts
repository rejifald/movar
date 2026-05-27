/**
 * Per-file test setup for integration tests that boot the background
 * entrypoint under wxt/testing's `fakeBrowser`.
 *
 * NOTE: This file is a stub — `installFakeBrowserHooks` throws on call.
 * Flesh out before running
 * `apps/extension/src/test/background.integration.test.ts`. The intended
 * shape:
 *
 *   import { beforeEach } from 'vitest';
 *   import { fakeBrowser } from 'wxt/testing';
 *   import { installDnrShim } from './dnr-mock';
 *
 *   export function installFakeBrowserHooks(): void {
 *     beforeEach(() => {
 *       fakeBrowser.reset();
 *       installDnrShim();
 *     });
 *   }
 *
 * Pure-DOM unit tests under `src/lib/` don't need this hook.
 */

const NOT_IMPLEMENTED =
  'apps/extension/src/test/setup.ts is a stub. ' +
  'Implement installFakeBrowserHooks before running the background integration tests.';

/**
 * Register the per-file beforeEach hook that resets fakeBrowser state and
 * reinstalls the DNR shim between tests.
 */
export function installFakeBrowserHooks(): void {
  throw new Error(NOT_IMPLEMENTED);
}
