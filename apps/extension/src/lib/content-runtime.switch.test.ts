/**
 * The redirect layer as `applyOnce` wires it: tier-7 detection, the session
 * choice and loop-guard escapes, the blocked-locale rewrite, the declared-
 * language interlock and the side effects the switch ladder reaches for. The
 * ladder's own decisions are unit-tested in language-switch.test.ts; these pin
 * the runtime's bindings to page state.
 */
import { describe, expect, it, vi } from 'vitest';
import { browser } from 'wxt/browser';
import { defaultSettings } from '@movar/settings';
import type { MovarSettings } from '@movar/settings';
import type { CorrectionEvent } from '@movar/events';
import { getAttemptedUrls, markAttempt } from './loop-guard';
import { getPickerChoice, recordPickerChoice } from './session-choice';
import { getCorrectionEvents } from './events';
import {
  correctionSink,
  fakeConcealModule,
  installFakeChunks,
} from '../entrypoints/__tests__/content.test-utils';
import {
  recordBackgroundMessages,
  stubLocation,
  useContentRuntime,
} from './content-runtime.test-utils';

const pageText = vi.hoisted(() => ({ sample: vi.fn(() => '') }));
vi.mock('./page-text', () => ({ sampleVisibleText: pageText.sample }));
vi.mock('./capability-loader', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  provisionCapabilities: vi.fn(),
}));

const h = useContentRuntime();

const ukFirst: MovarSettings = {
  ...defaultSettings,
  priority: ['uk'],
  blocked: ['ru'],
  contentModification: false,
};

/** jsdom can't dispatch a trusted click, so this forwards every click to the
 *  runtime's capture handler the way its trusted-only listener would. */
function forward(e: MouseEvent): void {
  h.runtime.handlePickerClickCapture(e);
}

function installConceal(
  corrections: { fromLang: 'ru'; toLang: 'uk' }[] = [],
): ReturnType<typeof fakeConcealModule> {
  const mod = fakeConcealModule();
  mod.applyContentModification.mockResolvedValue(corrections);
  installFakeChunks({ 'features/conceal.js': mod });
  return mod;
}

describe('tier-7 text detection', () => {
  it('falls back to the background engine when the page declares nothing, and stamps it on corrections', async () => {
    pageText.sample.mockReturnValue('Текст сторінки без жодних мовних позначок');
    recordBackgroundMessages((msg) => {
      if (msg.type === 'movar:detectText')
        return { language: 'ru', confidence: 0.9, engine: 'franc' };
      return correctionSink(msg);
    });
    installConceal([{ fromLang: 'ru', toLang: 'uk' }]);

    await h.runtime.applyOnce({ ...ukFirst, contentModification: true });

    expect(h.runtime.getHiddenSummary().pageLang).toBe('ru');
    const events = await getCorrectionEvents();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject<Partial<CorrectionEvent>>({
      mechanism: 'dom',
      detectionEngine: 'franc',
    });
  });

  it('leaves the page language unknown when no engine recognises the sample', async () => {
    pageText.sample.mockReturnValue('12345 67890');
    const background = recordBackgroundMessages(() => null);

    expect(await h.runtime.applyOnce(ukFirst)).toBe(false);

    expect(background.types).toContain('movar:detectText');
    expect(h.runtime.getHiddenSummary().pageLang).toBeNull();
  });
});

describe('session picker choice', () => {
  it('stands down entirely when the page serves the language the visitor picked this session', async () => {
    // They clicked the site's own "Русский" earlier: switching back would undo
    // their click and filtering the picker would hide the entry they used.
    document.documentElement.lang = 'ru';
    const conceal = installConceal();
    recordPickerChoice(location.hostname, 'ru');

    expect(await h.runtime.applyOnce({ ...ukFirst, contentModification: true })).toBe(false);

    expect(conceal.applyContentModification).not.toHaveBeenCalled();
    expect(h.runtime.getHiddenSummary().switchSuppressed).toBe(true);
  });

  it('still runs the content pass on that page when the visitor picked nothing', async () => {
    document.documentElement.lang = 'ru';
    const conceal = installConceal();

    await h.runtime.applyOnce({ ...ukFirst, contentModification: true });

    expect(conceal.applyContentModification).toHaveBeenCalledOnce();
  });
});

describe('captcha interstitial (#251)', () => {
  // An entry URL (no hl/lr yet): only the enforce rewrite can correct it, and
  // the loop guard holds it as redirected-from from before the captcha.
  const preCaptcha = 'https://www.google.com/search?q=test';

  it('drops the loop guard while the visitor is on the interstitial', async () => {
    markAttempt(preCaptcha);
    stubLocation(`https://www.google.com/sorry/index?continue=${encodeURIComponent(preCaptcha)}`);

    await h.runtime.applyOnce(ukFirst);

    expect(getAttemptedUrls()).not.toContain(preCaptcha);
  });

  it('re-applies the enforce rewrite on the SERP the captcha returns to', async () => {
    // Without the referrer signal the pre-captcha URL reads as a redirect
    // bounce and the SERP stays in the blocked language.
    markAttempt(preCaptcha);
    const loc = stubLocation(preCaptcha);
    vi.spyOn(document, 'referrer', 'get').mockReturnValue('https://www.google.com/sorry/index');

    expect(await h.runtime.applyOnce(ukFirst)).toBe(true);

    expect(loc.replace).toHaveBeenCalledOnce();
    expect(new URL(loc.href).searchParams.get('hl')).toBe('uk');
  });

  it('keeps the guard (no rewrite) when the SERP was not reached through the captcha', async () => {
    markAttempt(preCaptcha);
    const loc = stubLocation(preCaptcha);

    expect(await h.runtime.applyOnce(ukFirst)).toBe(false);

    expect(loc.replace).not.toHaveBeenCalled();
  });
});

describe('blocked locale in the URL', () => {
  it('rewrites an explicit ?hl=ru to the top preference and skips the content pass', async () => {
    browser.runtime.onMessage.addListener(correctionSink as never);
    const loc = stubLocation('https://classroom.google.com/u/1/h?hl=ru');
    const conceal = installConceal();

    expect(await h.runtime.applyOnce({ ...ukFirst, contentModification: true })).toBe(true);

    expect(loc.replace).toHaveBeenCalledWith('https://classroom.google.com/u/1/h?hl=uk');
    expect(conceal.applyContentModification).not.toHaveBeenCalled();
    expect(await getCorrectionEvents()).toEqual([
      expect.objectContaining({ mechanism: 'redirect', fromLang: 'ru', toLang: 'uk' }),
    ]);
  });
});

describe('switch side effects', () => {
  it('reloads the page after a cookie-only switch so the server serves the new language', async () => {
    // electrica-shop's rule sets a `lang` cookie, then follows hreflang; with no
    // hreflang on the page only the cookie lands, which needs a reload to count.
    const loc = stubLocation('https://electrica-shop.com.ua/catalog');
    document.documentElement.lang = 'ru';

    expect(await h.runtime.applyOnce(ukFirst)).toBe(true);

    expect(loc.reload).toHaveBeenCalledOnce();
    expect(loc.replace).not.toHaveBeenCalled();
  });

  it('does not navigate off a page that declares the target language on a picker’s say-so', async () => {
    // The picker's bare "you are here" entry reads Russian, but the page itself
    // declares Ukrainian: following the picker would discard the visitor's URL
    // (the yato / hotline incidents).
    const loc = stubLocation('https://shop.example/search?q=hammer');
    document.documentElement.lang = 'uk';
    document.body.innerHTML = `
      <ul class="lang-switcher">
        <li><span>Русский</span></li>
        <li><a href="https://shop.example/uk/" hreflang="uk">Українська</a></li>
      </ul>`;

    expect(await h.runtime.applyOnce(ukFirst)).toBe(false);

    expect(h.runtime.getHiddenSummary().pageLang).toBe('ru');
    expect(loc.replace).not.toHaveBeenCalled();
  });

  it('clicks a button picker without recording the click as the visitor’s choice', async () => {
    // A form-POST switcher (bosch-centre style): the active entry is marked,
    // the other is a button the site's own handler acts on.
    document.body.innerHTML = `
      <form class="language">
        <button type="button" name="lang" value="ru" class="active" aria-current="true">RU</button>
        <button type="button" name="lang" value="uk" id="uk">UA</button>
      </form>`;
    const button = document.querySelector<HTMLButtonElement>('#uk');
    if (!button) throw new Error('picker did not render');
    let clicks = 0;
    button.addEventListener('click', () => {
      clicks += 1;
    });
    document.addEventListener('click', forward, { capture: true });
    try {
      expect(await h.runtime.applyOnce(ukFirst)).toBe(true);
      expect(clicks).toBe(1);
      expect(getPickerChoice(location.hostname)).toBeNull();

      // The same click from the visitor does count — the guard is what kept
      // Movar's own click out.
      button.click();
      expect(getPickerChoice(location.hostname)).toBe('uk');
    } finally {
      document.removeEventListener('click', forward, { capture: true });
    }
  });
});
