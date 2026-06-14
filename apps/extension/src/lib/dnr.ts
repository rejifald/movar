import { browser } from 'wxt/browser';
import type { MovarSettings } from '@movar/settings';
import { buildAcceptLanguage } from './accept-language';

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
  /** Hosts currently snoozed (a timed per-site break). Excluded from the rule
   *  for the snooze window, on top of the permanent `settings.allowlist`. */
  snoozedHosts: readonly string[] = [],
): Promise<void> {
  const removeRuleIds = [ACCEPT_LANGUAGE_RULE_ID];

  // No-op states: extension off, paused, or nothing to prefer.
  if (!active || !settings.enabled || settings.priority.length === 0) {
    await browser.declarativeNetRequest.updateDynamicRules({ removeRuleIds });
    return;
  }

  // Allowlist (permanent) + snoozed hosts (timed) both exempt a domain; dedupe
  // so a host on both isn't listed twice.
  const excluded = [...new Set([...settings.allowlist, ...snoozedHosts])];

  const rule: DnrRule = {
    id: ACCEPT_LANGUAGE_RULE_ID,
    priority: 1,
    action: {
      type: 'modifyHeaders',
      requestHeaders: [
        {
          header: 'Accept-Language',
          operation: 'set',
          value: buildAcceptLanguage(settings.priority),
        },
      ],
    },
    condition: {
      resourceTypes: ['main_frame', 'sub_frame'],
      ...(excluded.length > 0 ? { excludedRequestDomains: excluded } : {}),
    },
  };

  await browser.declarativeNetRequest.updateDynamicRules({ removeRuleIds, addRules: [rule] });
}
