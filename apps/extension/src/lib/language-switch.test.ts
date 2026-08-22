import { describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import type { LanguageCode } from '@movar/lang-detect';
import { defaultSettings } from '@movar/settings';
import type { MovarSettings } from '@movar/settings';
import type { SiteRule } from '../sites/types';
import type { Picker } from '@movar/lang-pickers/types';
import {
  attemptLanguageSwitch,
  tryHreflangRedirect,
  tryPickerRedirect,
  tryStrategySwitch,
} from './language-switch';
import type { LanguageSwitchDeps } from './language-switch';

/** `LanguageSwitchDeps` with its callable members re-typed as Vitest mocks.
 *  The interface declares them with method-signature syntax, which makes
 *  `expect(deps.record)` trip `unbound-method`; as `Mock<…>` values the spies
 *  read as plain functions and the rule (rightly) stops flagging them. The
 *  shape is otherwise structurally identical, so a `MockedDeps` still satisfies
 *  `LanguageSwitchDeps` wherever the production code consumes it. */
type MockedDeps = Omit<
  LanguageSwitchDeps,
  | 'recentlyAttemptedHere'
  | 'hasAttemptedNavTo'
  | 'markAttempt'
  | 'record'
  | 'setSimulatedClick'
  | 'location'
> & {
  recentlyAttemptedHere: Mock<LanguageSwitchDeps['recentlyAttemptedHere']>;
  hasAttemptedNavTo: Mock<LanguageSwitchDeps['hasAttemptedNavTo']>;
  markAttempt: Mock<LanguageSwitchDeps['markAttempt']>;
  record: Mock<LanguageSwitchDeps['record']>;
  setSimulatedClick: Mock<LanguageSwitchDeps['setSimulatedClick']>;
  location: {
    readonly href: string;
    replace: Mock<(url: string) => void>;
    reload: Mock<() => void>;
  };
};

interface StrategyOutcome {
  navigated: boolean;
  needsReload: boolean;
  appliedSteps: number;
  clicked?: boolean;
}
const NO_OP: StrategyOutcome = { navigated: false, needsReload: false, appliedSteps: 0 };
const NAVIGATED: StrategyOutcome = { navigated: true, needsReload: false, appliedSteps: 1 };
const RELOAD: StrategyOutcome = { navigated: false, needsReload: true, appliedSteps: 1 };
// A 'click' that matched a selector but whose navigation can't be confirmed.
const CLICKED: StrategyOutcome = {
  navigated: false,
  needsReload: false,
  appliedSteps: 1,
  clicked: true,
};

/** Type-erase a stub through the real applyStrategy signature. */
function applier(...outcomes: StrategyOutcome[]): LanguageSwitchDeps['applyStrategy'] {
  const fn = vi.fn();
  for (const o of outcomes) fn.mockReturnValueOnce(o);
  if (outcomes.length === 1) fn.mockReturnValue(outcomes[0]!);
  return fn;
}

function makeDeps(over: Partial<MockedDeps> = {}): MockedDeps {
  return {
    recentlyAttemptedHere: vi.fn(() => false),
    hasAttemptedNavTo: vi.fn(() => false),
    markAttempt: vi.fn(),
    record: vi.fn(async () => {}),
    applyStrategy: applier(NO_OP),
    loopGuardCtx: {},
    // Default: the page declares nothing, so the already-at-target interlock
    // never fires and each case below exercises the branch it names. The
    // interlock has its own cases at the bottom of this file.
    declaredLanguage: () => null,
    location: { href: 'https://example.com/', replace: vi.fn(), reload: vi.fn() },
    setSimulatedClick: vi.fn(),
    ...over,
  };
}

const cookieRule: SiteRule = { match: 'example.com', strategy: { type: 'cookie', name: 'lang' } };

function settings(over: Partial<MovarSettings> = {}): MovarSettings {
  return {
    ...defaultSettings,
    ...over,
  };
}

function anchor(href: string): HTMLAnchorElement {
  const a = document.createElement('a');
  if (href) a.setAttribute('href', href);
  return a;
}
function picker(el: HTMLElement, language: LanguageCode): Picker {
  return { container: document.createElement('div'), links: [{ el, language }] };
}

describe('tryStrategySwitch', () => {
  it('bails without applying when the URL was recently attempted (loop guard)', async () => {
    const deps = makeDeps({ recentlyAttemptedHere: vi.fn(() => true) });
    expect(await tryStrategySwitch(deps, cookieRule, 'ru', ['uk'])).toBe(false);
    expect(deps.applyStrategy).not.toHaveBeenCalled();
  });

  it('bails when the strategy applied no steps', async () => {
    const deps = makeDeps({ applyStrategy: applier(NO_OP) });
    expect(await tryStrategySwitch(deps, cookieRule, 'ru', ['uk'])).toBe(false);
    expect(deps.markAttempt).not.toHaveBeenCalled();
  });

  it('marks the attempt and records the mechanism when the strategy navigates', async () => {
    const deps = makeDeps({ applyStrategy: applier(NAVIGATED) });
    expect(await tryStrategySwitch(deps, cookieRule, 'ru', ['uk'])).toBe(true);
    expect(deps.markAttempt).toHaveBeenCalledOnce();
    expect(deps.record).toHaveBeenCalledWith('cookie', 'ru', 'uk');
  });

  it('reloads when the strategy needs a reload but did not navigate', async () => {
    const deps = makeDeps({ applyStrategy: applier(RELOAD) });
    expect(await tryStrategySwitch(deps, cookieRule, 'ru', ['uk'])).toBe(true);
    expect(deps.location.reload).toHaveBeenCalledOnce();
  });

  it('does NOT arm the loop guard for a bare click (navigation unconfirmed)', async () => {
    // A 'click' that matched but whose navigation we can't observe must not
    // arm the guard — otherwise a click that did nothing would suppress a later
    // legitimate redirect on this URL. The tick still short-circuits (true) so
    // the content pass is skipped in case the click did navigate.
    const clickRule: SiteRule = {
      match: 'example.com',
      strategy: { type: 'click', selector: 'a.lang-uk' },
    };
    const deps = makeDeps({ applyStrategy: applier(CLICKED) });
    expect(await tryStrategySwitch(deps, clickRule, 'ru', ['uk'])).toBe(true);
    expect(deps.markAttempt).not.toHaveBeenCalled();
    expect(deps.record).not.toHaveBeenCalled();
    expect(deps.location.reload).not.toHaveBeenCalled();
  });

  it('falls back to the page language as the target when priority is empty', async () => {
    const deps = makeDeps({ applyStrategy: applier(NAVIGATED) });
    await tryStrategySwitch(deps, cookieRule, 'ru', []);
    expect(deps.record).toHaveBeenCalledWith('cookie', 'ru', 'ru');
  });
});

describe('tryHreflangRedirect', () => {
  it('bails when recently attempted', async () => {
    const deps = makeDeps({ recentlyAttemptedHere: vi.fn(() => true) });
    expect(await tryHreflangRedirect(deps, 'ru', ['uk', 'en'])).toBe(false);
  });

  it('navigates to the first priority target whose hreflang resolves', async () => {
    // 'uk' does not resolve, 'en' does.
    const deps = makeDeps({ applyStrategy: applier(NO_OP, NAVIGATED) });
    expect(await tryHreflangRedirect(deps, 'ru', ['uk', 'en'])).toBe(true);
    expect(deps.record).toHaveBeenCalledWith('redirect', 'ru', 'en');
    expect(deps.markAttempt).toHaveBeenCalledOnce();
  });

  it('returns false when no priority target resolves', async () => {
    const deps = makeDeps({ applyStrategy: applier(NO_OP) });
    expect(await tryHreflangRedirect(deps, 'ru', ['uk', 'en'])).toBe(false);
  });
});

describe('tryPickerRedirect', () => {
  it('anchor picker fires on a recently-attempted URL when the target is untried', async () => {
    // The page's own hreflang bounced us back to this blocked URL (so
    // recentlyAttemptedHere is true), but the on-page switcher points at a
    // DIFFERENT, untried URL — follow it instead of giving up.
    const deps = makeDeps({ recentlyAttemptedHere: vi.fn(() => true) });
    const link = anchor('https://example.com/uk');
    expect(await tryPickerRedirect(deps, [picker(link, 'uk')], 'ru', ['uk'])).toBe(true);
    expect(deps.location.replace).toHaveBeenCalledWith('https://example.com/uk');
  });

  it('records the anchor target in the loop guard so a bounce cannot re-fire it', async () => {
    // markAttempt(target) is the safety net that replaces the coarse guard: a
    // genuinely-bouncing picker (target 301s back here) is caught on the next
    // pass by hasAttemptedNavTo(target), not by recentlyAttemptedHere.
    const deps = makeDeps({ recentlyAttemptedHere: vi.fn(() => true) });
    const link = anchor('https://example.com/uk');
    await tryPickerRedirect(deps, [picker(link, 'uk')], 'ru', ['uk']);
    expect(deps.markAttempt).toHaveBeenCalledWith('https://example.com/uk');
  });

  it('button picker still bails on a recently-attempted URL (no target to guard per-target)', async () => {
    const deps = makeDeps({ recentlyAttemptedHere: vi.fn(() => true) });
    const button = document.createElement('button');
    const click = vi.spyOn(button, 'click');
    expect(await tryPickerRedirect(deps, [picker(button, 'uk')], 'ru', ['uk'])).toBe(false);
    expect(click).not.toHaveBeenCalled();
  });

  it('returns false when no redirect target is found', async () => {
    expect(await tryPickerRedirect(makeDeps(), [], 'ru', ['uk'])).toBe(false);
  });

  it('replaces location with the anchor href and records the redirect', async () => {
    const deps = makeDeps();
    const link = anchor('https://example.com/uk');
    expect(await tryPickerRedirect(deps, [picker(link, 'uk')], 'ru', ['uk'])).toBe(true);
    expect(deps.record).toHaveBeenCalledWith('redirect', 'ru', 'uk');
    expect(deps.location.replace).toHaveBeenCalledWith('https://example.com/uk');
  });

  it('records the language actually matched, not priority[0], when a higher-priority language has no link (#299)', async () => {
    // priority[0] is 'uk' but the picker only has an 'en' link, so
    // pickRedirectTarget falls through and navigates to 'en'. The event
    // recorded to the correction dashboard must say 'en' — what we actually
    // switched to — not 'uk', the unmatched head of the priority list.
    const deps = makeDeps();
    const link = anchor('https://example.com/en');
    expect(await tryPickerRedirect(deps, [picker(link, 'en')], 'ru', ['uk', 'en'])).toBe(true);
    expect(deps.location.replace).toHaveBeenCalledWith('https://example.com/en');
    expect(deps.record).toHaveBeenCalledWith('redirect', 'ru', 'en');
  });

  it('records the language actually matched for a button picker too (#299)', async () => {
    const deps = makeDeps();
    const button = document.createElement('button');
    vi.spyOn(button, 'click');
    expect(await tryPickerRedirect(deps, [picker(button, 'en')], 'ru', ['uk', 'en'])).toBe(true);
    expect(deps.record).toHaveBeenCalledWith('redirect', 'ru', 'en');
  });

  it('refuses an anchor whose href equals the current URL', async () => {
    const deps = makeDeps();
    expect(
      await tryPickerRedirect(deps, [picker(anchor('https://example.com/'), 'uk')], 'ru', ['uk']),
    ).toBe(false);
    expect(deps.location.replace).not.toHaveBeenCalled();
  });

  it('refuses an anchor with an empty href', async () => {
    const deps = makeDeps();
    expect(await tryPickerRedirect(deps, [picker(anchor(''), 'uk')], 'ru', ['uk'])).toBe(false);
  });

  it('refuses an anchor we already tried navigating to (loop guard)', async () => {
    const deps = makeDeps({ hasAttemptedNavTo: vi.fn(() => true) });
    expect(
      await tryPickerRedirect(deps, [picker(anchor('https://example.com/uk'), 'uk')], 'ru', ['uk']),
    ).toBe(false);
  });

  it('refuses an anchor whose scheme is not http/https (open-redirect guard, #306)', async () => {
    // A picker <a href> is page-controlled markup; an injected off-scheme link
    // must never reach location.replace. (A real anchor's .href resolves to an
    // absolute URL, so these three schemes survive verbatim — the realistic
    // attacker payload; the malformed/parse-throw fail-closed path is covered by
    // the isNavigableHttpUrl unit test.)
    for (const href of [
      'javascript:alert(1)',
      'data:text/html,<h1>pwned</h1>',
      'file:///etc/passwd',
    ]) {
      const deps = makeDeps();
      expect(
        await tryPickerRedirect(deps, [picker(anchor(href), 'uk')], 'ru', ['uk']),
        `must not redirect to ${href}`,
      ).toBe(false);
      expect(deps.location.replace).not.toHaveBeenCalled();
      expect(deps.record).not.toHaveBeenCalled();
    }
  });

  it('still follows a plain http:// anchor picker', async () => {
    const deps = makeDeps();
    expect(
      await tryPickerRedirect(deps, [picker(anchor('http://example.com/uk'), 'uk')], 'ru', ['uk']),
    ).toBe(true);
    expect(deps.location.replace).toHaveBeenCalledWith('http://example.com/uk');
  });

  it('clicks a button picker under the simulated-click guard', async () => {
    const deps = makeDeps();
    const button = document.createElement('button');
    const click = vi.spyOn(button, 'click');
    expect(await tryPickerRedirect(deps, [picker(button, 'uk')], 'ru', ['uk'])).toBe(true);
    expect(click).toHaveBeenCalledOnce();
    expect(deps.setSimulatedClick).toHaveBeenNthCalledWith(1, true);
    expect(deps.setSimulatedClick).toHaveBeenNthCalledWith(2, false);
  });
});

describe('attemptLanguageSwitch', () => {
  it('fires an enforce-mode rule regardless of the page language', async () => {
    const rule: SiteRule = {
      match: 'g',
      strategy: { type: 'searchParams', params: [{ name: 'hl' }] },
      enforce: true,
    };
    const deps = makeDeps({ applyStrategy: applier(NAVIGATED) });
    expect(await attemptLanguageSwitch(deps, settings(), rule, null, 'uk', [])).toBe(true);
  });

  it('does nothing when the page language is not blocked', async () => {
    const deps = makeDeps();
    expect(await attemptLanguageSwitch(deps, settings(), undefined, 'uk', 'uk', [])).toBe(false);
    expect(deps.applyStrategy).not.toHaveBeenCalled();
  });

  it('uses the site rule strategy on a blocked page', async () => {
    const deps = makeDeps({ applyStrategy: applier(NAVIGATED) });
    expect(await attemptLanguageSwitch(deps, settings(), cookieRule, 'ru', 'uk', [])).toBe(true);
    expect(deps.record).toHaveBeenCalledWith('cookie', 'ru', 'uk');
  });

  it('falls back to hreflang when there is no rule', async () => {
    const deps = makeDeps({ applyStrategy: applier(NAVIGATED) });
    expect(await attemptLanguageSwitch(deps, settings(), undefined, 'ru', 'uk', [])).toBe(true);
  });

  it('falls back to the picker when hreflang fails but a picker exists', async () => {
    const deps = makeDeps(); // applyStrategy never navigates → hreflang fails
    const link = anchor('https://example.com/uk');
    expect(
      await attemptLanguageSwitch(deps, settings(), undefined, 'ru', 'uk', [picker(link, 'uk')]),
    ).toBe(true);
    expect(deps.location.replace).toHaveBeenCalledWith('https://example.com/uk');
  });

  it('rescues via the picker after the site hreflang already bounced back here', async () => {
    // UMI.CMS two-pass shape (ds-electronics.com.ua): pass 1 followed the
    // broken `uk-ua` hreflang to a URL that 301'd straight back to this blocked
    // page, arming the loop guard (recentlyAttemptedHere). On this pass hreflang
    // bails, but the on-page switcher's untried target still gets followed —
    // previously the coarse guard suppressed the picker too and Movar gave up.
    const deps = makeDeps({ recentlyAttemptedHere: vi.fn(() => true) });
    const link = anchor('https://example.com/uk');
    expect(
      await attemptLanguageSwitch(deps, settings(), undefined, 'ru', 'uk', [picker(link, 'uk')]),
    ).toBe(true);
    expect(deps.location.replace).toHaveBeenCalledWith('https://example.com/uk');
  });

  it('returns false on a blocked page with no rule, no hreflang, and no pickers', async () => {
    expect(await attemptLanguageSwitch(makeDeps(), settings(), undefined, 'ru', 'uk', [])).toBe(
      false,
    );
  });

  it('returns false when there is no target (empty priority)', async () => {
    expect(
      await attemptLanguageSwitch(
        makeDeps(),
        settings({ priority: [] }),
        undefined,
        'ru',
        undefined,
        [],
      ),
    ).toBe(false);
  });
});

/**
 * The already-at-target interlock: the page's OWN declaration overrules a
 * blocked `pageLang` that only an inference (the picker tier) could have
 * produced, and the generic redirect half of the ladder stands down.
 *
 * This is blast-radius containment, not detection: it holds even when the
 * detector is wrong, which is the property both past incidents needed —
 * yato.com.ua (search results replaced by the homepage) and hotline.ua
 * (`?tab=` / `?sort=` stripped off product links) were each a mis-read picker
 * on a `<html lang="uk">` page.
 */
describe('attemptLanguageSwitch — already-at-target interlock', () => {
  const declaresUk = { declaredLanguage: () => 'uk' as const };

  it('does not follow hreflang when the page already declares the target', async () => {
    const deps = makeDeps({ ...declaresUk, applyStrategy: applier(NAVIGATED) });
    expect(await attemptLanguageSwitch(deps, settings(), undefined, 'ru', 'uk', [])).toBe(false);
    expect(deps.applyStrategy).not.toHaveBeenCalled();
  });

  it('does not follow a picker link when the page already declares the target', async () => {
    const deps = makeDeps(declaresUk);
    const link = anchor('https://example.com/uk');
    expect(
      await attemptLanguageSwitch(deps, settings(), undefined, 'ru', 'uk', [picker(link, 'uk')]),
    ).toBe(false);
    expect(deps.location.replace).not.toHaveBeenCalled();
  });

  it('logs no correction when it stands down', async () => {
    const deps = makeDeps({ ...declaresUk, applyStrategy: applier(NAVIGATED) });
    await attemptLanguageSwitch(deps, settings(), undefined, 'ru', 'uk', []);
    expect(deps.record).not.toHaveBeenCalled();
    expect(deps.markAttempt).not.toHaveBeenCalled();
  });

  it('still switches when the declaration names a DIFFERENT language', async () => {
    // spizhenko.clinic: every locale is served as `<html lang="ru">`, so its
    // Ukrainian pages must stay rescuable. The declaration is not the target,
    // so the interlock is silent and the ladder runs as before.
    const deps = makeDeps({
      declaredLanguage: () => 'ru' as const,
      applyStrategy: applier(NAVIGATED),
    });
    expect(await attemptLanguageSwitch(deps, settings(), undefined, 'ru', 'uk', [])).toBe(true);
  });

  it('still switches when the page declares nothing at all', async () => {
    const deps = makeDeps({ applyStrategy: applier(NAVIGATED) });
    expect(await attemptLanguageSwitch(deps, settings(), undefined, 'ru', 'uk', [])).toBe(true);
  });

  it('leaves a rule-bearing host to its rule', async () => {
    // Hand-written rules exist for hosts whose own declaration can't be
    // trusted, so the interlock sits BELOW the rule branch and must not
    // suppress it.
    const deps = makeDeps({ ...declaresUk, applyStrategy: applier(NAVIGATED) });
    expect(await attemptLanguageSwitch(deps, settings(), cookieRule, 'ru', 'uk', [])).toBe(true);
    expect(deps.applyStrategy).toHaveBeenCalled();
  });

  it('leaves enforce-mode rules alone (Google hl/gl on an already-uk SERP)', async () => {
    const enforce: SiteRule = { ...cookieRule, enforce: true };
    const deps = makeDeps({ ...declaresUk, applyStrategy: applier(NAVIGATED) });
    expect(await attemptLanguageSwitch(deps, settings(), enforce, 'uk', 'uk', [])).toBe(true);
    expect(deps.applyStrategy).toHaveBeenCalled();
  });
});
