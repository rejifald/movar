import type { ComponentType } from 'react';
import { browser } from 'wxt/browser';
import { mountApp as mountShell } from '@movar/app-shell';
import type { MountOptions } from '@movar/app-shell';

/** Thin extension-side wrapper over the shared `@movar/app-shell` mount. Reads
 *  the browser UI language here — the one `wxt`/`browser` touch the shared shell
 *  deliberately avoids — and delegates the StrictMode + ErrorBoundary wrapping,
 *  the `<html lang>` seed, and the `#root` mount to the shell. The read is
 *  guarded for the static-serve preview, where `browser.i18n` is absent; there
 *  we pass no language and the shell leaves the document's default lang in
 *  place. The two entrypoints keep calling `mountApp(App)`. */
export function mountApp(App: ComponentType): void {
  let options: MountOptions = {};
  try {
    options = { browserUiLanguage: browser.i18n.getUILanguage() };
  } catch {
    // No browser.i18n (preview) — leave the document's default lang in place.
  }
  mountShell(<App />, options);
}
