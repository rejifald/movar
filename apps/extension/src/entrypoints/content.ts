import { defineContentScript } from 'wxt/utils/define-content-script';
import { createContentRuntime } from '../lib/content-runtime';

const runtime = createContentRuntime();

export default defineContentScript({
  matches: ['<all_urls>'],
  // <all_urls> is intentional — Accept-Language correction + conceal must work
  // on arbitrary sites. excludeMatches narrows the http(s) surfaces that should
  // never run: extension galleries forbid content-script UI and reject add-ons
  // that inject into them. (chrome://, about:, and moz-/chrome-extension:// pages
  // aren't matched by <all_urls> for ordinary content scripts anyway; the
  // isSupportedProtocol guard in main() is the runtime backstop.)
  excludeMatches: [
    'https://chromewebstore.google.com/*',
    'https://chrome.google.com/webstore/*',
    'https://microsoftedge.microsoft.com/addons/*',
    'https://addons.mozilla.org/*',
  ],
  runAt: 'document_start',
  // `runtime.main` accepts WXT's ContentScriptContext, so WXT's `main(ctx)` call
  // forwards it straight through — the runtime uses it to register the
  // `wxt:locationchange` re-trigger (auto-removed on context invalidation).
  main: runtime.main,
});
