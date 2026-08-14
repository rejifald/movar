/**
 * The Node collector's DOM tier: HTML in, serializable `DocumentEvidence` out.
 *
 * Everything that reduces a document to evidence lives in
 * {@link ./digest-dom.ts | `./digest-dom`}, which touches no `jsdom` and no DOM
 * globals so the host app's `WKWebView` collector can reuse it verbatim. This
 * module is the two things that are *Node-specific* about doing it here:
 * parsing the HTML with jsdom, and installing the DOM globals
 * `@movar/lang-pickers` needs.
 *
 * ### Why this installs DOM globals
 *
 * `@movar/lang-pickers` is the real picker model the extension ships, and reusing
 * it (rather than a second, drifting reimplementation) is the whole point of this
 * tier. But its production code narrows with `instanceof HTMLAnchorElement` in
 * `classify.ts` / `active.ts` — **globals**, not anything reachable from the
 * `root` it is handed. Under bare Node those identifiers are undefined, so the
 * model would quietly classify nothing and every page would look like it had no
 * language picker — a false `not-applicable` on four rules rather than a loud
 * failure.
 *
 * So {@link withDomGlobals} installs jsdom's constructors for the duration of one
 * digest and restores whatever was there before. That is deliberate and scoped:
 * it happens in the collector, never in the kernel, which `purity.test.ts`
 * enforces. In a real DOM — a browser tab, a `WKWebView` — the same globals are
 * the document's own, so the shim has no counterpart there and
 * `digestFromDocument` is called directly.
 */

import { JSDOM } from 'jsdom';
import { digestFromDocument } from './digest-dom';
import type { DigestOptions, DigestResult } from './digest-dom';

export * from './digest-dom';

/**
 * The globals `@movar/lang-pickers` reaches for outside the `root` it is given.
 *
 * `document` is deliberately still on this list even though the model resolves
 * page-root identity through `el.ownerDocument` now: jsdom leaves several DOM
 * APIs reachable only from a window, and restoring a global that was never
 * needed costs nothing next to the silent zero-picker failure above.
 */
const REQUIRED_GLOBALS = [
  'document',
  'Node',
  'Element',
  'HTMLElement',
  'HTMLAnchorElement',
  'HTMLButtonElement',
  'HTMLSelectElement',
  'HTMLOptionElement',
  'NodeFilter',
  'getComputedStyle',
] as const;

/**
 * Run `fn` with jsdom's DOM constructors installed globally, then restore.
 *
 * Exported because it is the honest shape of "we reuse the real picker model":
 * the model is DOM-global-bound, and pretending otherwise would mean a silent
 * zero-picker result on every page.
 */
export function withDomGlobals<T>(dom: JSDOM, fn: () => T): T {
  const host = globalThis as unknown as Record<string, unknown>;
  const saved = new Map<string, unknown>();
  const source = dom.window as unknown as Record<string, unknown>;

  for (const name of REQUIRED_GLOBALS) {
    saved.set(name, host[name]);
    if (source[name] !== undefined) host[name] = source[name];
  }
  try {
    return fn();
  } finally {
    for (const [name, value] of saved) {
      if (value === undefined) Reflect.deleteProperty(host, name);
      else host[name] = value;
    }
  }
}

/** Parse HTML with jsdom and reduce it to the structural digest. */
export function digestDocument(html: string, options: DigestOptions = {}): DigestResult {
  const dom = new JSDOM(html, options.url === undefined ? {} : { url: options.url });

  try {
    // The whole digest runs inside the shim rather than just the picker step:
    // it is one synchronous call with no I/O and no site code in it, so the
    // window stays exactly as narrow in practice while `digestFromDocument`
    // keeps the plain `(doc, options)` shape the WebView collector calls.
    return withDomGlobals(dom, () => digestFromDocument(dom.window.document, options));
  } finally {
    dom.window.close();
  }
}
