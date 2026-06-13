import { browser } from 'wxt/browser';
import type { MovarSettings } from '@movar/settings';
import { buildAcceptLanguage, enrichWithRegions } from './accept-language';

/** Stable id for our single dynamic Accept-Language rule. */
const ACCEPT_LANGUAGE_RULE_ID = 1;

/** The exact Rule shape the installed `browser` types expect. */
type DnrRule = NonNullable<
  Parameters<typeof browser.declarativeNetRequest.updateDynamicRules>[0]['addRules']
>[number];

/**
 * Install (or remove) a declarativeNetRequest rule that rewrites the
 * Accept-Language header on top-level and sub-frame navigations, so servers
 * serve the user's preferred language. Driven entirely by settings + active
 * state. See movar-spec.md §5.1.
 */
export async function syncAcceptLanguageRule(
  settings: MovarSettings,
  active: boolean,
): Promise<void> {
  const removeRuleIds = [ACCEPT_LANGUAGE_RULE_ID];

  // No-op states: extension off, paused, or nothing to prefer.
  if (!active || !settings.enabled || settings.priority.length === 0) {
    await browser.declarativeNetRequest.updateDynamicRules({ removeRuleIds });
    return;
  }

  const rule: DnrRule = {
    id: ACCEPT_LANGUAGE_RULE_ID,
    priority: 1,
    action: {
      type: 'modifyHeaders',
      requestHeaders: [
        {
          header: 'Accept-Language',
          operation: 'set',
          // Expand bare ISO codes to `<code>-<REGION>, <code>` so servers that
          // do strict region matching get the richer hint while servers that
          // only accept bare codes still match the fallback (enrichWithRegions
          // keeps the bare code after each regional variant). e.g. ['uk','en']
          // -> "uk-UA,uk;q=0.9,en-US;q=0.8,en;q=0.7".
          value: buildAcceptLanguage(enrichWithRegions(settings.priority)),
        },
      ],
    },
    condition: {
      resourceTypes: ['main_frame', 'sub_frame'],
      ...(settings.allowlist.length > 0 ? { excludedRequestDomains: settings.allowlist } : {}),
    },
  };

  await browser.declarativeNetRequest.updateDynamicRules({ removeRuleIds, addRules: [rule] });
}
