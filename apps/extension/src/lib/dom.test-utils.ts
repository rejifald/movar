import { getCurrentColorScheme } from '@movar/page-mode/context';
import { createContentPresenterAdapter } from './content-presenter-factory';

export function setBody(html: string): void {
  // Parse into a detached document and import the nodes rather than assigning
  // to `innerHTML` — keeps this helper free of an unsanitized-sink (no-unsanitized).
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  const nodes = Array.from(parsed.body.childNodes, (node) => document.importNode(node, true));
  document.body.replaceChildren(...nodes);
}

export function getHost(root: ParentNode = document): HTMLElement | null {
  return root.querySelector<HTMLElement>('[data-movar-curtain]');
}

export function getShadow(host: HTMLElement): ShadowRoot {
  if (!host.shadowRoot) throw new Error('host has no shadow root');
  return host.shadowRoot;
}

export const testContentPresenter = createContentPresenterAdapter({
  getColorScheme: getCurrentColorScheme,
});
