import { vi } from 'vitest';
import type { MockInstance } from 'vitest';
import { buildDeclaredClassifier, classifyBySnippet, getProfiles } from '@movar/lang-detect';
import { francRung3Resolver } from '@movar/lang-detect/franc';
import type { ConcealMode } from '@movar/settings';
import type { SnippetClassifier } from './content-conceal';
import '@movar/page-content/google';
import '@movar/page-content/youtube';
import { applyContentFilter } from './content-conceal';
import { browser } from 'wxt/browser';
import { testContentPresenter } from './dom.test-utils';

// Tests run franc's rung-3 directly (no background worker) so the 'unknown'
// residual behaves exactly as the in-process classifier used to.
// eslint-disable-next-line @typescript-eslint/require-await -- sync in-process classifier behind the async SnippetClassifier contract; nothing to await
export const directClassify: SnippetClassifier = async (items, candidateCodes) => {
  const profiles = getProfiles([...candidateCodes]);
  const fuseDeclared = buildDeclaredClassifier(profiles);
  return items.map((it) =>
    it.declared === undefined
      ? classifyBySnippet(it.text, profiles, francRung3Resolver)
      : fuseDeclared(it.text, it.declared),
  );
};

/** Stub runtime.sendMessage with a loose type — fakeBrowser declares it
 *  `Promise<void>`, but loadContentMessages expects a ContentStrings reply. */
export function spySendMessage(): MockInstance<(message: unknown) => Promise<unknown>> {
  return vi.spyOn(browser.runtime, 'sendMessage');
}

// Bridges old blocklist-style call sites to the allowlist filter: conceal iff a
// card's detected language ∈ `blocked`. candidates = uk/ru/en; enabled =
// everything not blocked — equivalent to the old (model, blocked) semantics.
export const FILTER_LANGS = ['uk', 'ru', 'en'];

export async function runFilter(
  model: Parameters<typeof applyContentFilter>[0],
  blocked: readonly string[],
  concealMode: ConcealMode = 'curtain',
): ReturnType<typeof applyContentFilter> {
  return applyContentFilter(model, {
    candidateCodes: FILTER_LANGS,
    enabled: new Set(FILTER_LANGS.filter((c) => !blocked.includes(c))),
    classify: directClassify,
    concealMode,
    ...(concealMode === 'curtain' ? { presenter: testContentPresenter } : {}),
  });
}

export { setBody } from './dom.test-utils';

export function ytCard(title: string, channel = ''): string {
  return `
    <ytd-video-renderer>
      <a id="video-title">${title}</a>
      <ytd-channel-name><div id="text"><a>${channel}</a></div></ytd-channel-name>
    </ytd-video-renderer>
  `;
}

// A Google organic result the way the extractor finds it: an #rso results list
// holding data-hveid cards, each with an <h3> title link. Styling class is
// irrelevant — extraction keys on #rso + <h3> + data-hveid.
export function gCard(title: string, snippet = '', id?: string): string {
  return `
    <div data-hveid="CAEQAA"${id != null && id !== '' ? ` id="${id}"` : ''}>
      <a href="#"><h3>${title}</h3></a>
      <div>${snippet}</div>
    </div>`;
}

export function gSerp(...cards: string[]): string {
  return `<div id="rso">${cards.join('')}</div>`;
}

export function findRevealButton(card: HTMLElement): HTMLButtonElement | null {
  const host = card.querySelector<HTMLElement>('[data-movar-curtain]');
  if (!host?.shadowRoot) return null;
  return host.shadowRoot.querySelector<HTMLButtonElement>('button');
}

// Per-test DOM reset (body + head clear, plus the jsdom site-CSS fidelity rule)
// is handled globally in test-setup.ts. A local reset here would run after it and
// wipe that fidelity style, so this file relies on the shared hook.
