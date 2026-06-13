import { defineContentScript } from 'wxt/utils/define-content-script';
import { createContentRuntime } from '../lib/content-runtime';

const runtime = createContentRuntime();

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_start',
  // `runtime.main` accepts WXT's ContentScriptContext, so WXT's `main(ctx)` call
  // forwards it straight through — the runtime uses it to register the
  // `wxt:locationchange` re-trigger (auto-removed on context invalidation).
  main: runtime.main,
});
