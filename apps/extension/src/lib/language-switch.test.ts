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
  it('bails when recently attempted', async () => {
    const deps = makeDeps({ recentlyAttemptedHere: vi.fn(() => true) });
    expect(await tryPickerRedirect(deps, [], 'ru', ['uk'])).toBe(false);
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
