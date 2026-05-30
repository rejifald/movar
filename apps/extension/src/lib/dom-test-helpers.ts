export function setBody(html: string): void {
  document.body.innerHTML = html;
}

export function getHost(root: ParentNode = document): HTMLElement | null {
  return root.querySelector<HTMLElement>('[data-movar-curtain]');
}

export function getShadow(host: HTMLElement): ShadowRoot {
  if (!host.shadowRoot) throw new Error('host has no shadow root');
  return host.shadowRoot;
}
