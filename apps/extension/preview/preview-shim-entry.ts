/**
 * Static-serve entry for the preview shim. Bundled by esbuild into an IIFE
 * by the wxt `build:done` hook in `apps/extension/wxt.config.ts` and then
 * inlined into the preview `popup.html` / `options.html` as a classic
 * `<script>` tag. Never shipped to the store.
 *
 * Why this exists separately from `src/test/browser-mock.ts`: this file is
 * the entry the bundler walks for the static-serve consumer. It reads the
 * `?locale=…` query string (only meaningful in the static-serve world) and
 * forwards it to `installBrowserMock`. Storybook stories pass the same
 * `uiLanguage` through `parameters.browserMock` instead. Both paths land in
 * the same `installBrowserMock` implementation — no drift.
 */
import { installBrowserMock } from '../src/test/browser-mock';

// `?locale=uk` on popup.html exercises the Ukrainian catalogue without a
// rebuild. Default to en-US to match the previous shim's behaviour.
const params = new URLSearchParams(globalThis.location?.search ?? '');
const uiLanguage = params.get('locale') ?? 'en-US';

installBrowserMock({ uiLanguage });
