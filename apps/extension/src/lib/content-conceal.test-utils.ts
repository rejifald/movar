import { buildDeclaredClassifier, classifyBySnippet, getProfiles } from '@movar/lang-detect';
import { francRung3Resolver } from '@movar/lang-detect/franc';
import type { SnippetClassifier } from './content-conceal';
import { applyContentFilter } from './content-conceal';
import type { ConcealMode } from '@movar/settings';
import type { ContentNode, PageContentModel } from '@movar/page-content/types';
import { testContentPresenter } from './dom.test-utils';

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

// Bridges old blocklist-style call sites to the allowlist filter: conceal iff a
// card's detected language ∈ `blocked`. candidates = uk/ru/en; enabled =
// everything not blocked.
export const FILTER_LANGS = ['uk', 'ru', 'en'];

export async function runFilter(
  model: PageContentModel,
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

export function makeNode(
  el: HTMLElement,
  overrides: Partial<Omit<ContentNode, 'el'>> = {},
): ContentNode {
  return {
    el,
    kind: 'video',
    hideMode: 'blur',
    text: 'Всё о программировании',
    ...overrides,
  };
}
