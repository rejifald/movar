import { defineContentScript } from 'wxt/utils/define-content-script';
import { createContentRuntime } from '../lib/content-runtime';

const runtime = createContentRuntime();

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_start',
  main: runtime.main,
});
