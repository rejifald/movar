/**
 * Regression: https://yato.com.ua/ (OpenCart) — Movar broke the on-site search.
 *
 * Symptom (user report 2026-07-20): searching on yato tossed the user back to
 * the homepage, losing their results.
 *
 * Root cause is a picker mis-detection. yato's language switcher renders each
 * option as a `<li>` wrapping a dead-href, JS-driven anchor:
 *
 *   <button class="dropdown-toggle"><span>Українська</span></button>   ← active
 *   <ul>
 *     <li class="top-menu__language-item"><a href="#" data-code="ru-ru">Русский</a></li>
 *     <li class="top-menu__language-item"><a href="#" data-code="uk-ua">Українська</a></li>
 *   </ul>
 *
 * `dedupNested` keeps the `<li>` wrappers as the classified links (they're the
 * outer elements). Pre-fix, `activeLanguageFromPicker`'s "a non-anchor entry is
 * the active language by construction" rule fired on the FIRST `<li>`
 * (Русский), so the Ukrainian page (`<html lang="uk">`) was detected as
 * Russian. The switch ladder then engaged: the page's own `uk-ua` hreflang is
 * self-referential (a no-op), so it fell through to `tryPickerRedirect`, which
 * followed the "Українська" switcher anchor. With `<base href="https://yato.com.ua/">`
 * plus `href="#"`, that anchor resolves to the homepage `https://yato.com.ua/#`
 * — throwing away the `/search/?search=…` results the user was looking at.
 *
 * Fix: a non-anchor element that wraps an interactive switcher (an anchor with
 * an href, or a button) is judged BY that switcher, not assumed to be a bare
 * "you are here" marker. yato's `<li>`s each wrap an `href="#"` anchor → no
 * longer read as active → detection falls through to `<html lang="uk">` → no
 * switch fires. See packages/lang-pickers/src/active.ts (`resolveSwitcher`).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import { defaultSettings } from '@movar/settings';
import { detectPageLanguage } from '@movar/page-language';
import { findLanguagePickers } from '@movar/lang-pickers/extract';
import { buildPickerModel } from '@movar/lang-pickers/build-model';
import { pickRedirectTarget } from '@movar/lang-pickers/redirect';
import { attemptLanguageSwitch } from './language-switch';
import type { LanguageSwitchDeps } from './language-switch';
import { filterPickers } from './picker-filter';
import { testContentPresenter } from './dom-test-helpers';

const SEARCH_HREF =
  'https://yato.com.ua/search/?search=%D0%BC%D0%BE%D0%BB%D0%BE%D1%82%D0%BE%D0%BA&description=true';
const HOMEPAGE = 'https://yato.com.ua/';
const LOC = { pathname: '/search/', hostname: 'yato.com.ua', href: SEARCH_HREF };

/** The language `<form>` verbatim from the live search page (captured
 *  2026-07-20). Active language lives only in the dropdown-toggle button's
 *  text; the two options are `<li>`-wrapped `href="#"` switcher anchors. */
const LANGUAGE_FORM = `
  <div class="top-menu__language">
    <form action="https://yato.com.ua/index.php?route=common/language/language" method="post" id="language">
      <div class="btn-group">
        <button class="top-menu__btn dropdown-toggle" aria-label="language" data-toggle="dropdown"><i class="fa fa-globe"></i><span class="top-menu__btn-text">Українська</span></button>
        <ul class="dropdown-menu dropdown-menu-right">
          <li class="top-menu__language-item"><a href="#" data-code="ru-ru">Русский</a></li>
          <li class="top-menu__language-item"><a href="#" data-code="uk-ua">Українська</a></li>
        </ul>
      </div>
      <input type="hidden" name="code" value="">
      <input type="hidden" name="redirect_route" value="product/search">
      <input type="hidden" name="redirect_query" value="&search=молоток&description=true">
    </form>
  </div>`;

/** `<base>` + the self-referential hreflang set the live page publishes. The
 *  base is load-bearing: it makes every `<a href="#">` resolve to the homepage. */
const HEAD = `
  <base href="https://yato.com.ua/">
  <link rel="alternate" hreflang="ru-ua" href="https://yato.com.ua/ru/search/?search=%D0%BC%D0%BE%D0%BB%D0%BE%D1%82%D0%BE%D0%BA&description=true">
  <link rel="alternate" hreflang="uk-ua" href="${SEARCH_HREF}">
  <link rel="alternate" hreflang="x-default" href="${SEARCH_HREF}">`;

/** `record` and `location.replace` are typed as `Mock` so `expect(deps.record)`
 *  reads them as plain function values rather than tripping `unbound-method`. */
type MockedDeps = Omit<LanguageSwitchDeps, 'record' | 'location'> & {
  record: Mock<LanguageSwitchDeps['record']>;
  location: {
    readonly href: string;
    replace: Mock<(url: string) => void>;
    reload: Mock<() => void>;
  };
};

/** Switch-ladder deps with a stubbed navigation surface. `applyStrategy` is a
 *  no-op (the real hreflang strategy is exercised in strategy.test.ts); what
 *  this file cares about is whether the PICKER-redirect branch fires and where
 *  it points — which flows through `location.replace`, a spy here. */
function makeDeps(href: string): MockedDeps {
  return {
    recentlyAttemptedHere: vi.fn(() => false),
    hasAttemptedNavTo: vi.fn(() => false),
    markAttempt: vi.fn(),
    record: vi.fn(async () => {}),
    applyStrategy: vi.fn(() => ({ navigated: false, needsReload: false, appliedSteps: 0 })),
    loopGuardCtx: {},
    location: { href, replace: vi.fn(), reload: vi.fn() },
    setSimulatedClick: vi.fn(),
  };
}

beforeEach(() => {
  document.documentElement.setAttribute('lang', 'uk');
  document.head.innerHTML = HEAD;
  document.body.innerHTML = LANGUAGE_FORM;
});

afterEach(() => {
  document.documentElement.removeAttribute('lang');
  document.head.innerHTML = '';
  document.body.innerHTML = '';
});

describe('yato.com.ua regression — search-breaking picker mis-detection', () => {
  it('detects exactly one picker whose two options classify as ru + uk', () => {
    const pickers = findLanguagePickers();
    expect(pickers).toHaveLength(1);
    expect(pickers[0]!.links.map((l) => l.language).toSorted()).toEqual(['ru', 'uk']);
  });

  it('does NOT vote Russian as the active language (root cause)', () => {
    // Pre-fix this returned 'ru' — the first `<li>` was read as the active
    // marker. The active language is genuinely ambiguous from the options
    // alone (both are dead-href switchers), so the picker must abstain.
    const model = buildPickerModel(findLanguagePickers(), LOC.href);
    expect(model.activeLanguage).not.toBe('ru');
    expect(model.activeLanguage).toBeNull();
  });

  it('detects the page as Ukrainian via <html lang>, not Russian (the fix)', () => {
    // Pre-fix: 'ru' (picker vote overrode <html lang="uk">). Post-fix: the
    // picker abstains and detection falls through to the honest <html lang>.
    expect(detectPageLanguage(document, LOC)).toBe('uk');
  });

  it('does not attempt any language switch on the (correctly Ukrainian) page', async () => {
    const pageLang = detectPageLanguage(document, LOC);
    const deps = makeDeps(SEARCH_HREF);
    const switched = await attemptLanguageSwitch(
      deps,
      defaultSettings,
      undefined, // no site rule for yato
      pageLang,
      defaultSettings.priority[0],
      findLanguagePickers(),
    );
    expect(switched).toBe(false);
    expect(deps.location.replace).not.toHaveBeenCalled();
    expect(deps.record).not.toHaveBeenCalled();
  });

  it('SYMPTOM PROOF: a mis-detected-as-Russian page would redirect search → homepage', async () => {
    // Force the pre-fix mis-detection to demonstrate exactly why it broke
    // search. With pageLang='ru', the switch ladder engages; hreflang no-ops
    // (stubbed), so tryPickerRedirect follows the uk switcher anchor — which
    // resolves, via <base> + href="#", to the homepage, discarding the query.
    const target = pickRedirectTarget(findLanguagePickers(), ['uk']);
    expect(target).toBeInstanceOf(HTMLAnchorElement);
    expect((target as HTMLAnchorElement).href).toBe(HOMEPAGE + '#');

    const deps = makeDeps(SEARCH_HREF);
    const switched = await attemptLanguageSwitch(
      deps,
      defaultSettings,
      undefined,
      'ru', // the pre-fix (wrong) verdict
      'uk',
      findLanguagePickers(),
    );
    expect(switched).toBe(true);
    // This is the bug the fix prevents: navigating away from /search to the
    // homepage. The `.not` case above (correct 'uk' detection) is the guard.
    expect(deps.location.replace).toHaveBeenCalledWith(HOMEPAGE + '#');
  });

  it('still hides the Russian option in the switcher (block-only behaviour retained)', () => {
    // The fix must not stop Movar doing its actual job: on a correctly-detected
    // uk page it filters the picker, hiding the blocked (ru) option while
    // leaving the uk one.
    filterPickers(
      findLanguagePickers(),
      [...defaultSettings.priority],
      { blocked: [...defaultSettings.blocked] },
      testContentPresenter,
    );
    const ruLi = document.querySelector<HTMLAnchorElement>('a[data-code="ru-ru"]')?.closest('li');
    const ukLi = document.querySelector<HTMLAnchorElement>('a[data-code="uk-ua"]')?.closest('li');
    expect(ruLi?.getAttribute('data-movar-hidden')).not.toBeNull();
    expect(ukLi?.getAttribute('data-movar-hidden')).toBeNull();
  });
});
