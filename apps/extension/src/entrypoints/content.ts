import { browser } from 'wxt/browser';
import { defineContentScript } from 'wxt/utils/define-content-script';
import {
  defaultSettings,
  type CorrectionEvent,
  type HiddenSummary,
  type LanguageCode,
  type MovarMessage,
  type MovarSettings,
} from '@movar/shared';
import { getRuleForHost, type SiteRule } from '@movar/rules';
import { logCorrection } from '../lib/events';
import {
  classifyLanguageElement,
  detectPageLanguage,
  filterPickers,
  findLanguagePickers,
  pickRedirectTarget,
  type Picker,
} from '../lib/picker';
import { applyStrategy } from '../lib/strategy';

const HIDDEN_ATTR = 'data-movar-hidden';

/** True after the user clicks "Show all" — stops the MutationObserver from
 *  re-hiding the picker items we just restored. Resets on page reload. */
let userOverride = false;

function getHiddenSummary(): HiddenSummary {
  const languages = new Set<LanguageCode>();
  let containers = 0;
  document.querySelectorAll(`[${HIDDEN_ATTR}]`).forEach((el) => {
    const reason = el.getAttribute(HIDDEN_ATTR);
    if (reason === 'single-option') {
      containers += 1;
    } else if (reason === 'not-in-priority' && el instanceof HTMLElement) {
      const c = classifyLanguageElement(el);
      if (c) languages.add(c.language);
    }
  });
  return { languages: Array.from(languages).sort(), containers, userOverride };
}

function restoreAll(): void {
  userOverride = true;
  document.querySelectorAll(`[${HIDDEN_ATTR}]`).forEach((el) => {
    el.removeAttribute(HIDDEN_ATTR);
    if (el instanceof HTMLElement) {
      el.style.removeProperty('display');
    }
    if (el instanceof HTMLOptionElement) el.hidden = false;
  });
}

/**
 * URL-scoped loop guard. We store the URL we last redirected FROM in
 * sessionStorage; if we wake up on the same URL after a navigation/reload, we
 * bail to avoid bouncing. Cleared whenever we land on a non-blocked page (the
 * previous attempt succeeded). A different key from the old binary
 * 'movar:redirected' flag, so any stale value from older versions is ignored.
 */
const ATTEMPT_KEY = 'movar:redirectedFrom';

function recentlyAttemptedHere(): boolean {
  try {
    return sessionStorage.getItem(ATTEMPT_KEY) === location.href;
  } catch {
    return false;
  }
}

function markAttempt(): void {
  try {
    sessionStorage.setItem(ATTEMPT_KEY, location.href);
  } catch {
    // sessionStorage unavailable (e.g. private mode) — accept loop risk.
  }
}

function clearAttempt(): void {
  try {
    sessionStorage.removeItem(ATTEMPT_KEY);
    // Also wipe the obsolete key from older builds so users on stuck tabs
    // recover after upgrading without needing to clear storage manually.
    sessionStorage.removeItem('movar:redirected');
  } catch {
    // ignored
  }
}

async function getSettings(): Promise<MovarSettings> {
  const stored = await browser.storage.sync.get('settings');
  return (stored.settings as MovarSettings | undefined) ?? defaultSettings;
}

async function isPaused(): Promise<boolean> {
  const local = await browser.storage.local.get(['movar:pausedUntil', 'movar:pausedSession']);
  if (local['movar:pausedSession']) return true;
  const until = local['movar:pausedUntil'];
  return typeof until === 'number' && Date.now() < until;
}

function hostMatchesAllowlist(host: string, allowlist: string[]): boolean {
  return allowlist.some((d) => host === d || host.endsWith(`.${d}`));
}

async function record(
  mechanism: CorrectionEvent['mechanism'],
  fromLang: LanguageCode,
  toLang: LanguageCode,
): Promise<void> {
  await logCorrection({
    timestamp: Date.now(),
    domain: location.hostname,
    mechanism,
    fromLang,
    toLang,
  });
}

function whenDomReady(): Promise<void> {
  if (document.readyState !== 'loading') return Promise.resolve();
  return new Promise((resolve) =>
    document.addEventListener('DOMContentLoaded', () => resolve(), { once: true }),
  );
}

function mechanismForStrategy(rule: SiteRule): CorrectionEvent['mechanism'] {
  // Best-effort label for the dashboard. Compound reports its dominant step.
  const s = rule.strategy;
  const head = s.type === 'compound' ? s.steps[0]?.type : s.type;
  switch (head) {
    case 'cookie':
      return 'cookie';
    case 'localStorage':
      return 'localStorage';
    case 'pathSegment':
    case 'subdomain':
    case 'query':
    case 'click':
    case undefined:
      return 'redirect';
    default:
      return 'redirect';
  }
}

/** Returns true if a navigation/reload was triggered and the page is unloading. */
async function tryStrategySwitch(
  rule: SiteRule,
  pageLang: LanguageCode,
  target: LanguageCode,
): Promise<boolean> {
  if (recentlyAttemptedHere()) return false;
  const outcome = applyStrategy(rule.strategy, target);
  if (outcome.appliedSteps === 0) return false;

  markAttempt();
  await record(mechanismForStrategy(rule), pageLang, target);

  if (!outcome.navigated && outcome.needsReload) {
    location.reload();
    return true;
  }
  return outcome.navigated;
}

/** Generic hreflang fallback when no rule exists. Works on any site that
 *  publishes <link rel="alternate" hreflang="..."> for the target language. */
async function tryHreflangRedirect(
  pageLang: LanguageCode,
  priority: LanguageCode[],
): Promise<boolean> {
  if (recentlyAttemptedHere()) return false;
  for (const target of priority) {
    const outcome = applyStrategy({ type: 'hreflang' }, target);
    if (outcome.navigated) {
      markAttempt();
      await record('redirect', pageLang, target);
      return true;
    }
  }
  return false;
}

/** Picker-link fallback when no rule and no hreflang got us there. Handles
 *  both anchor- and button-based pickers (the latter for form-POST switchers
 *  like bosch-centre). */
async function tryPickerRedirect(
  pickers: Picker[],
  pageLang: LanguageCode,
  priority: LanguageCode[],
): Promise<boolean> {
  if (recentlyAttemptedHere()) return false;
  const target = pickRedirectTarget(pickers, priority);
  if (!target) return false;

  if (target instanceof HTMLAnchorElement) {
    if (!target.href || target.href === location.href) return false;
    markAttempt();
    await record('redirect', pageLang, priority[0] ?? pageLang);
    location.replace(target.href);
    return true;
  }

  // <button> — let the site's own form-submit / click handler do the work.
  markAttempt();
  await record('redirect', pageLang, priority[0] ?? pageLang);
  target.click();
  return true;
}

async function applyOnce(settings: MovarSettings): Promise<boolean> {
  if (userOverride) return false;
  const pageLang = detectPageLanguage();
  const target = settings.priority[0];

  // Landed on an OK page — the previous redirect (if any) worked. Drop the
  // loop guard so any future blocked page in this tab can redirect again.
  if (pageLang && !settings.blocked.includes(pageLang)) {
    clearAttempt();
  }

  // 1. Switch off a blocked-language page.
  if (pageLang && settings.blocked.includes(pageLang) && target) {
    const rule = getRuleForHost(location.hostname);
    if (rule) {
      if (await tryStrategySwitch(rule, pageLang, target)) return true;
    } else {
      // No site-specific rule: try the page's own hreflang map first (most
      // reliable when present), then fall back to clicking the picker link.
      if (await tryHreflangRedirect(pageLang, settings.priority)) return true;
      const pickers = findLanguagePickers();
      if (pickers.length > 0 && (await tryPickerRedirect(pickers, pageLang, settings.priority))) {
        return true;
      }
    }
  }

  // 2. Filter pickers (independent of switching — we always want to strip
  //    unwanted languages from any visible picker). The "keep" set is the
  //    user's priority minus anything explicitly blocked — so e.g. if
  //    priority=['uk','en'] and blocked=['ru'], a UA/EN/RU/DE picker keeps only
  //    UA and EN, and any single-language remainder hides the container.
  const pickers = findLanguagePickers();
  if (pickers.length === 0) return false;

  const keep = settings.priority.filter((p) => !settings.blocked.includes(p));
  const result = filterPickers(pickers, keep);
  if (result.hiddenLinks.length === 0) return false;

  const preferred = target ?? pageLang ?? '';
  const seen = new Set<LanguageCode>();
  for (const link of result.hiddenLinks) {
    if (seen.has(link.language)) continue;
    seen.add(link.language);
    await record('dom', link.language, preferred);
  }
  return false;
}

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_start',
  async main() {
    const settings = await getSettings();
    if (!settings.enabled) return;
    if (hostMatchesAllowlist(location.hostname, settings.allowlist)) return;
    if (await isPaused()) return;

    // Popup/options ↔ content-script bridge. Synchronous responses; small payloads.
    browser.runtime.onMessage.addListener((raw, _sender, sendResponse) => {
      const msg = raw as MovarMessage | undefined;
      if (!msg) return false;
      if (msg.type === 'movar:getHidden') {
        sendResponse(getHiddenSummary());
        return false;
      }
      if (msg.type === 'movar:restoreHidden') {
        restoreAll();
        sendResponse(getHiddenSummary());
        return false;
      }
      return false;
    });

    await whenDomReady();
    if (await applyOnce(settings)) return;

    let scheduled: ReturnType<typeof setTimeout> | null = null;
    const observer = new MutationObserver(() => {
      if (scheduled !== null) return;
      scheduled = setTimeout(() => {
        scheduled = null;
        void applyOnce(settings);
      }, 150);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  },
});
