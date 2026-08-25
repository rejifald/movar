import { describe, expect, it } from 'vitest';
import { EXAMPLE_HOST, EXTENSION_NAME, labelsFor, mockupFor, renderBrowserUi } from '.';
import type {
  BrowserUiHighlight,
  BrowserUiLocale,
  BrowserUiMockup,
  InstallFlow,
  InstallStepKind,
} from '.';

/** The install-walkthrough family — every mockup `mockupFor` can route a step
 *  to. Kept separate from the language-panel family below because the
 *  routing-completeness tests in the `mockupFor` describe block are only
 *  about this one closed system. */
const INSTALL_MOCKUPS: readonly BrowserUiMockup[] = [
  'chromium-install-dialog',
  'chromium-toolbar',
  'chromium-site-access',
  'firefox-install-dialog',
  'firefox-toolbar',
  'firefox-permissions',
  'safari-extensions',
  'safari-site-access',
  'ios-extension-toggle',
  'ios-all-websites',
];

/** The language-priority-panel family — drawn directly by the /uk/guide
 *  diagnosis widget, never through `mockupFor`. */
const LANGUAGE_MOCKUPS: readonly BrowserUiMockup[] = [
  'chromium-languages',
  'firefox-languages',
  'macos-language-region',
  'windows-languages',
  'ios-language-region',
  'android-languages',
];

const MOCKUPS: readonly BrowserUiMockup[] = [...INSTALL_MOCKUPS, ...LANGUAGE_MOCKUPS];

const FLOWS: readonly InstallFlow[] = ['chromium', 'firefox', 'safari', 'safari-ios'];
const KINDS: readonly InstallStepKind[] = ['store', 'confirm', 'pin', 'enable', 'access'];
const LOCALES: readonly BrowserUiLocale[] = ['en', 'uk'];
const HIGHLIGHTS: readonly BrowserUiHighlight[] = ['remove', 'add', 'top'];

const render = (mockup: BrowserUiMockup, locale: BrowserUiLocale = 'en'): string =>
  renderBrowserUi(mockup, { locale, iconSrc: '/icon.svg' });

describe('renderBrowserUi', () => {
  it.each(MOCKUPS)('%s opens on a hidden, platform-scoped root', (mockup) => {
    const html = render(mockup);

    // Decorative by construction: a screen reader must never walk a fake
    // "Add extension" button. The class after `bui ` picks the platform
    // palette, so its absence would render an unstyled skeleton.
    expect(html).toMatch(
      /^<div class="bui bui-(chrome|firefox|macos|ios|windows|android)" aria-hidden="true">/,
    );
  });

  it.each(MOCKUPS)('%s balances its tags', (mockup) => {
    const html = render(mockup);
    const opened = html.match(/<div\b/g)?.length ?? 0;
    const closed = html.match(/<\/div>/g)?.length ?? 0;

    expect(opened).toBe(closed);
  });

  it.each(MOCKUPS)('%s renders in both locales', (mockup) => {
    for (const locale of LOCALES) {
      expect(render(mockup, locale).length).toBeGreaterThan(0);
    }
  });

  it('draws the browser strings for the requested locale', () => {
    expect(render('chromium-site-access', 'en')).toContain(labelsFor('en').chrome.onAllSites);
    expect(render('chromium-site-access', 'uk')).toContain('На всіх сайтах');
  });

  it('names the extension as the manifest does, in every locale', () => {
    // `_locales/uk` sets extName to the Latin "Movar", so a uk mockup showing a
    // transliterated name would show something no visitor's browser displays.
    for (const locale of LOCALES) {
      expect(render('chromium-toolbar', locale)).toContain(`>${EXTENSION_NAME}<`);
    }
  });

  it('marks exactly one site-access option as chosen', () => {
    const html = render('chromium-site-access');
    const selected = html.match(/bui-chrome__row--selected/g) ?? [];

    expect(selected).toHaveLength(1);
    expect(html).toContain(labelsFor('en').chrome.onAllSites);
  });

  it('escapes label text rather than letting it reach the markup raw', () => {
    // Guards the mockups against a future label carrying a quote or bracket —
    // the Chrome title already ships typographic quotes.
    const html = render('chromium-install-dialog');

    expect(html).not.toMatch(/<[^>]*<[^>]*>/);
  });

  it("threads the caller's icon through, since each surface resolves it differently", () => {
    const html = renderBrowserUi('chromium-toolbar', {
      locale: 'en',
      iconSrc: 'chrome-extension://abc/icon/48.png',
    });

    expect(html).toContain('src="chrome-extension://abc/icon/48.png"');
  });

  it("shows Movar's own host in the address bar, not the visitor's", () => {
    expect(render('chromium-toolbar')).toContain(EXAMPLE_HOST);
  });
});

describe('mockupFor', () => {
  it('gives every flow a distinct picture of the access step', () => {
    const access = FLOWS.map((flow) => mockupFor(flow, 'access'));

    expect(access.every((mockup) => mockup !== null)).toBe(true);
    expect(new Set(access).size).toBe(FLOWS.length);
  });

  it('draws nothing for the store step, which points at a web page', () => {
    for (const flow of FLOWS) {
      expect(mockupFor(flow, 'store')).toBeNull();
    }
  });

  it('gives Safari an enable step and no pin step, and Chromium the reverse', () => {
    // Safari extensions ship off until switched on in Settings; Chromium and
    // Firefox install enabled, with pinning as an optional convenience.
    expect(mockupFor('safari', 'enable')).not.toBeNull();
    expect(mockupFor('safari-ios', 'enable')).not.toBeNull();
    expect(mockupFor('safari', 'pin')).toBeNull();
    expect(mockupFor('chromium', 'pin')).not.toBeNull();
    expect(mockupFor('chromium', 'enable')).toBeNull();
  });

  it('never hands back a mockup drawn for another platform', () => {
    const platform: Record<InstallFlow, string> = {
      chromium: 'chromium-',
      firefox: 'firefox-',
      safari: 'safari-',
      'safari-ios': 'ios-',
    };
    const misrouted = FLOWS.flatMap((flow) =>
      KINDS.map((kind) => ({ flow, mockup: mockupFor(flow, kind) })).filter(
        ({ mockup }) => mockup !== null && !mockup.startsWith(platform[flow]),
      ),
    );

    expect(misrouted).toEqual([]);
  });

  it('covers every install-walkthrough mockup the package ships', () => {
    // A mockup nothing routes to is dead weight; one that exists only in the
    // table is a crash waiting for a step to reach it. Scoped to
    // INSTALL_MOCKUPS rather than the full MOCKUPS list: the six
    // language-panel mockups are drawn directly by the /uk/guide diagnosis
    // widget and deliberately have nothing routing to them here.
    const routed = new Set(
      FLOWS.flatMap((flow) => KINDS.map((kind) => mockupFor(flow, kind))).filter(
        (mockup): mockup is BrowserUiMockup => mockup !== null,
      ),
    );

    expect([...routed].toSorted()).toEqual([...INSTALL_MOCKUPS].toSorted());
  });
});

describe('language-settings panels', () => {
  it.each(LANGUAGE_MOCKUPS)('%s draws different markup for each highlight', (mockup) => {
    const outputs = HIGHLIGHTS.map((highlight) =>
      renderBrowserUi(mockup, {
        locale: 'en',
        iconSrc: '',
        highlight,
        languages: ['Alpha', 'Beta', 'Gamma'],
      }),
    );

    // Otherwise the variant is decorative and silently broken: a caller could
    // pass a different `highlight` and get back the exact same picture.
    expect(new Set(outputs).size).toBe(HIGHLIGHTS.length);
  });

  it.each(LANGUAGE_MOCKUPS)('%s points at the row the caller names, not a fixed one', (mockup) => {
    // The whole reason `highlightRow` exists: this package cannot read the
    // language strings, so a picture that always calls out the last row would
    // tell a reader whose Russian sits first to delete the wrong language.
    const render = (highlightRow: number): string =>
      renderBrowserUi(mockup, {
        locale: 'en',
        iconSrc: '',
        highlight: 'remove',
        languages: ['Alpha', 'Beta', 'Gamma'],
        highlightRow,
      });

    expect(new Set([render(0), render(1), render(2)]).size).toBe(3);
  });

  it.each(LANGUAGE_MOCKUPS)('%s falls back to the last row rather than throwing', (mockup) => {
    const base = {
      locale: 'en',
      iconSrc: '',
      highlight: 'remove',
      languages: ['Alpha', 'Beta'],
    } as const;
    const unspecified = renderBrowserUi(mockup, base);

    // Out of range, negative and fractional all mean "the caller does not
    // know", which has to land on the same picture as saying nothing at all —
    // otherwise a typo'd index quietly points somewhere.
    for (const bad of [9, -1, 1.5]) {
      expect(renderBrowserUi(mockup, { ...base, highlightRow: bad })).toBe(unspecified);
    }
  });

  it.each(LANGUAGE_MOCKUPS)("%s draws the caller's own language list", (mockup) => {
    const html = renderBrowserUi(mockup, {
      locale: 'en',
      iconSrc: '',
      languages: ['Klingon', 'Elvish'],
    });

    expect(html).toContain('Klingon');
    expect(html).toContain('Elvish');
  });

  it.each(LANGUAGE_MOCKUPS)('%s escapes language names rather than trusting them', (mockup) => {
    // The caller hands these panels the reader's own language names — the one
    // place in this package the markup is built from something other than its
    // own catalogue — so this is the one place that HTML-escaping is actually
    // load-bearing rather than defensive.
    const html = renderBrowserUi(mockup, {
      locale: 'en',
      iconSrc: '',
      languages: ['<b>evil</b> & co'],
    });

    expect(html).not.toContain('<b>evil</b>');
    expect(html).toContain('&lt;b&gt;evil&lt;/b&gt; &amp; co');
  });

  it("defaults the highlight to 'remove' when the caller doesn't pick one", () => {
    const languages = ['English', 'Русский'];
    const withoutHighlight = renderBrowserUi('chromium-languages', {
      locale: 'en',
      iconSrc: '',
      languages,
    });
    const explicitRemove = renderBrowserUi('chromium-languages', {
      locale: 'en',
      iconSrc: '',
      highlight: 'remove',
      languages,
    });

    expect(withoutHighlight).toBe(explicitRemove);
  });
});
