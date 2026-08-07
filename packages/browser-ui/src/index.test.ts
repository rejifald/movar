import { describe, expect, it } from 'vitest';
import { EXAMPLE_HOST, EXTENSION_NAME, labelsFor, mockupFor, renderBrowserUi } from '.';
import type { BrowserUiLocale, BrowserUiMockup, InstallFlow, InstallStepKind } from '.';

const MOCKUPS: readonly BrowserUiMockup[] = [
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

const FLOWS: readonly InstallFlow[] = ['chromium', 'firefox', 'safari', 'safari-ios'];
const KINDS: readonly InstallStepKind[] = ['store', 'confirm', 'pin', 'enable', 'access'];
const LOCALES: readonly BrowserUiLocale[] = ['en', 'uk'];

const render = (mockup: BrowserUiMockup, locale: BrowserUiLocale = 'en'): string =>
  renderBrowserUi(mockup, { locale, iconSrc: '/icon.svg' });

describe('renderBrowserUi', () => {
  it.each(MOCKUPS)('%s opens on a hidden, platform-scoped root', (mockup) => {
    const html = render(mockup);

    // Decorative by construction: a screen reader must never walk a fake
    // "Add extension" button. The class after `bui ` picks the platform
    // palette, so its absence would render an unstyled skeleton.
    expect(html).toMatch(/^<div class="bui bui-(chrome|firefox|macos|ios)" aria-hidden="true">/);
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

  it('covers every mockup the package ships', () => {
    // A mockup nothing routes to is dead weight; one that exists only in the
    // table is a crash waiting for a step to reach it.
    const routed = new Set(
      FLOWS.flatMap((flow) => KINDS.map((kind) => mockupFor(flow, kind))).filter(
        (mockup): mockup is BrowserUiMockup => mockup !== null,
      ),
    );

    expect([...routed].toSorted()).toEqual([...MOCKUPS].toSorted());
  });
});
