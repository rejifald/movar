import type { CorrectionEvent } from '@movar/events';
import type { LanguageCode } from '@movar/lang-detect';
import type { MovarSettings } from '@movar/settings';
import type { SiteRule } from '../sites/types';
import { pickRedirectTarget } from '@movar/lang-pickers/redirect';
import type { Picker } from '@movar/lang-pickers/types';
import type { applyStrategy } from './strategy';
import type { StrategyContext } from './strategy';
import { mechanismForStrategy } from './correction-mechanism';

/**
 * The side effects the language-switch ladder reaches for, injected so the
 * decision logic is testable in isolation. The content script builds the real
 * implementations (loop guard, correction log, `location`, the simulated-click
 * flag) and hands them in; tests pass stubs and assert which branch fired.
 */
export interface LanguageSwitchDeps {
  /** True if this URL was already redirected from earlier this session. */
  recentlyAttemptedHere(): boolean;
  /** True if we've already tried navigating to `url` this session. */
  hasAttemptedNavTo(url: string): boolean;
  /** Mark a URL as redirected-from (arms the loop guard). Defaults to the
   *  current URL; pass an explicit href to also record a navigation TARGET, so a
   *  later bounce back to it is caught by `hasAttemptedNavTo`. */
  markAttempt(href?: string): void;
  /** Log a correction to the on-device dashboard. */
  record(
    mechanism: CorrectionEvent['mechanism'],
    fromLang: LanguageCode,
    toLang: LanguageCode,
  ): Promise<void>;
  /** The strategy applier (injected so tests control navigated/needsReload). */
  applyStrategy: typeof applyStrategy;
  /** Loop-guard-aware partial context merged onto applyStrategy's defaults. */
  loopGuardCtx: Partial<StrategyContext>;
  /** Navigation surface (real `location` in the content script). */
  location: { readonly href: string; replace(url: string): void; reload(): void };
  /** Toggle the "Movar is driving this click" flag around a synthetic click. */
  setSimulatedClick(active: boolean): void;
}

/** Returns true if a navigation/reload was triggered and the page is unloading. */
export async function tryStrategySwitch(
  deps: LanguageSwitchDeps,
  rule: SiteRule,
  pageLang: LanguageCode,
  priority: readonly LanguageCode[],
): Promise<boolean> {
  if (deps.recentlyAttemptedHere()) return false;
  // Pass the full priority list so searchParams params with
  // `joinPreferences: true` (Google's `lr`) can pipe-join every preferred
  // language — single-target leaves still use priority[0] internally.
  const outcome = deps.applyStrategy(rule.strategy, priority, deps.loopGuardCtx);
  if (outcome.appliedSteps === 0) return false;

  // Only arm the loop guard for an outcome that will actually unload the page —
  // a confirmed navigation or a write that needs a reload. A bare `'click'`
  // (clicked but navigation unobservable) must NOT arm: if the click did
  // nothing, arming would wrongly suppress a later legitimate redirect on this
  // same URL. A real click-driven navigation re-enters applyOnce on the new
  // page, where the guard arms against the post-navigation URL.
  const willUnload = outcome.navigated || outcome.needsReload;
  if (willUnload) {
    const target = priority[0] ?? pageLang;
    deps.markAttempt();
    await deps.record(mechanismForStrategy(rule), pageLang, target);
  }

  if (!outcome.navigated && outcome.needsReload) {
    deps.location.reload();
    return true;
  }
  // Return true when the page may be unloading (navigation or a bare click) so
  // the orchestrator skips the content pass on this tick. `clicked` is the
  // unconfirmed-navigation case — we short-circuit but did not arm above.
  return outcome.navigated || outcome.clicked === true;
}

/** Generic hreflang fallback when no rule exists. Works on any site that
 *  publishes <link rel="alternate" hreflang="..."> for the target language. */
export async function tryHreflangRedirect(
  deps: LanguageSwitchDeps,
  pageLang: LanguageCode,
  priority: LanguageCode[],
): Promise<boolean> {
  if (deps.recentlyAttemptedHere()) return false;
  for (const target of priority) {
    const outcome = deps.applyStrategy({ type: 'hreflang' }, target, deps.loopGuardCtx);
    if (outcome.navigated) {
      deps.markAttempt();
      await deps.record('redirect', pageLang, target);
      return true;
    }
  }
  return false;
}

/** Picker-link fallback when no rule and no hreflang got us there. Handles both
 *  anchor- and button-based pickers (the latter for form-POST switchers like
 *  bosch-centre). */
export async function tryPickerRedirect(
  deps: LanguageSwitchDeps,
  pickers: Picker[],
  pageLang: LanguageCode,
  priority: LanguageCode[],
): Promise<boolean> {
  const target = pickRedirectTarget(pickers, priority);
  if (!target) return false;

  if (target instanceof HTMLAnchorElement) {
    if (!target.href || target.href === deps.location.href) return false;
    // Per-target loop guard (NOT the coarse recentlyAttemptedHere): refuse only
    // a target we already navigated TO this session. Firing on a URL we merely
    // redirected FROM is exactly what rescues a misconfigured site — its own
    // hreflang can point at a sibling URL that 301s straight back to this
    // blocked page, arming recentlyAttemptedHere here, while the on-page
    // switcher still points at the CORRECT, untried URL (UMI.CMS shops:
    // `hreflang="uk-ua"` → `/ua/ru/…` → 301 → `/ru/…`, but the switcher's
    // "UKR" link goes to the prefix-less Ukrainian page). Recording the target
    // below (markAttempt(target.href)) is what stops a genuinely-bouncing
    // picker from re-firing the same target forever.
    if (deps.hasAttemptedNavTo(target.href)) return false;
    deps.markAttempt();
    deps.markAttempt(target.href);
    await deps.record('redirect', pageLang, priority[0] ?? pageLang);
    deps.location.replace(target.href);
    return true;
  }

  // <button> — let the site's own form-submit / click handler do the work.
  // No target URL to guard per-target, so keep the coarse session guard: refuse
  // to re-fire on a URL we already redirected from.
  if (deps.recentlyAttemptedHere()) return false;
  deps.markAttempt();
  await deps.record('redirect', pageLang, priority[0] ?? pageLang);
  // Suppress the capture-phase click listener — Movar driving this click is not
  // the user expressing a preference for `priority[0]`.
  deps.setSimulatedClick(true);
  try {
    target.click();
  } finally {
    deps.setSimulatedClick(false);
  }
  return true;
}

/** Returns true if a navigation/reload was triggered and the page is unloading.
 *  Strategy ordering (enforce → rule → hreflang → picker) is intentionally
 *  explicit; collapsing it would hide which fallback fired. */
export async function attemptLanguageSwitch(
  deps: LanguageSwitchDeps,
  settings: MovarSettings,
  rule: SiteRule | undefined,
  pageLang: LanguageCode | null,
  target: LanguageCode | undefined,
  pickers: Picker[],
): Promise<boolean> {
  // Enforce-mode rules (search engines): fire regardless of pageLang. A Google
  // SERP can have a Ukrainian interface but Russian-language results —
  // page-language detection can't see that. The strategy must be no-op-safe
  // when the URL is already at the target (searchParams is).
  if (
    rule?.enforce === true &&
    target != null &&
    (await tryStrategySwitch(deps, rule, pageLang ?? target, settings.priority))
  )
    return true;

  // Switch off a blocked-language page.
  if (pageLang == null || target == null || !settings.blocked.includes(pageLang)) return false;

  if (rule) return tryStrategySwitch(deps, rule, pageLang, settings.priority);

  // No site-specific rule: try the page's own hreflang map first (most reliable
  // when present), then fall back to clicking the picker link.
  if (await tryHreflangRedirect(deps, pageLang, settings.priority)) return true;
  if (pickers.length === 0) return false;
  return tryPickerRedirect(deps, pickers, pageLang, settings.priority);
}
