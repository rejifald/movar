import { describe, expect, it } from 'vitest';
import { failingChecksJs } from '../src/capture/desktop/dom-shots';
import {
  assertCaptureSize,
  captureScale,
  CHROME_TOP_BOUNDS,
  chromeTopFromFrames,
  chromeTopFromViewport,
  largestWindow,
  parseXdotoolGeometry,
  sidecar,
  WINDOW,
  LINUX_SCALE,
  XVFB_SCREEN,
} from '../src/capture/desktop/geometry';
import { DESKTOP_LOCALES, parseLocale } from '../src/capture/desktop/locale';
import { DESKTOP_SHOTS, expectedFiles, finalChecks } from '../src/capture/desktop/plan';
import type { DesktopPhase } from '../src/capture/desktop/plan';
import {
  chromePreferences,
  FIREFOX_AUTOMATION_MARKS_JS,
  FIREFOX_EXTENSION_UUID,
  FIREFOX_USER_CHROME_CSS,
  firefoxPrefs,
  geckoIdOf,
  hasRequiredAllUrls,
  unpackedExtensionId,
  userJs,
  withNavbarAction,
} from '../src/capture/desktop/profiles';
import {
  axHolds,
  fullMatch,
  phaseAxFailures,
  systemPromptOwners,
} from '../src/capture/desktop/safari';
import { SHOTS } from '../src/capture/shots';
import { resolveRoute, SCENES } from '../src/mock/routes';

const pattern = (p: DesktopPhase | undefined): RegExp => new RegExp(p?.urlPattern ?? '^$');

const phases = DESKTOP_SHOTS.flatMap((s) => [
  { id: `${s.id}-before`, phase: s.before },
  { id: s.id, phase: s.after },
]);

describe('desktop plan', () => {
  it('tells the same story with the same ids as the phone set', () => {
    expect(DESKTOP_SHOTS.map((s) => s.id)).toEqual(SHOTS.map((s) => s.id));
    expect(expectedFiles()).toContain('youtube-before.png');
    expect(expectedFiles()).toContain('site-menu.json');
  });

  it.each(phases)('$id opens a routed mock page', ({ phase }) => {
    const url = new URL(phase.url);
    expect(resolveRoute(url.hostname, `${url.pathname}${url.search}`)).not.toBeNull();
  });

  it.each(phases)('$id: every DOM check is a valid expression', ({ phase }) => {
    for (const check of [...phase.ready, ...(phase.after ?? [])]) {
      // eslint-disable-next-line @typescript-eslint/no-implied-eval -- syntax check only, never called
      expect(() => new Function(`return (${check.js});`)).not.toThrow();
    }
    // eslint-disable-next-line @typescript-eslint/no-implied-eval -- syntax check only, never called
    expect(
      () => new Function(`return (${failingChecksJs(phase.ready, phase.urlPattern)});`),
    ).not.toThrow();
  });

  it('holds each after to the URL Movar leaves the browser on', () => {
    const byId = new Map(DESKTOP_SHOTS.map((s) => [s.id, s]));
    const search = byId.get('search');
    expect(pattern(search?.before).test(SCENES.google.startUrl)).toBe(true);
    expect(pattern(search?.after).test(SCENES.google.startUrl)).toBe(false);
    expect(pattern(search?.after).test(`${SCENES.google.startUrl}&hl=uk`)).toBe(true);
    const site = byId.get('site-no-modal');
    expect(pattern(site?.before).test(SCENES.tochka24.startUrl)).toBe(true);
    expect(pattern(site?.after).test(SCENES.tochka24.startUrl)).toBe(false);
    expect(pattern(site?.after).test(SCENES.tochka24.finalUrl)).toBe(true);
    expect(byId.get('youtube')?.after.url).toBe(SCENES.youtubeDesktop.startUrl);
  });

  it('re-checks the post-click state before the shutter', () => {
    const menu = DESKTOP_SHOTS.find((s) => s.id === 'site-menu');
    expect(menu?.after.click).toBeDefined();
    expect(menu === undefined ? [] : finalChecks(menu.after)).toBe(menu?.after.after);
    const search = DESKTOP_SHOTS.find((s) => s.id === 'search');
    expect(search === undefined ? [] : finalChecks(search.after)).toBe(search?.after.ready);
  });
});

describe('Safari accessibility checks', () => {
  const menuAfter = DESKTOP_SHOTS.find((s) => s.id === 'site-menu')?.after;

  it('names a system prompt on screen, not ordinary windows', () => {
    expect(
      systemPromptOwners([
        { owner: 'Safari' },
        { owner: 'UserNotificationCenter' },
        { owner: 'Dock' },
      ]),
    ).toEqual(['UserNotificationCenter']);
    expect(systemPromptOwners([{ owner: 'Safari' }])).toEqual([]);
  });

  it('full-matches like Maestro', () => {
    expect(fullMatch('.*Мова.*', 'Мова: Українська')).toBe(true);
    expect(fullMatch('Русский', 'Мовар приховав: Русский.')).toBe(false);
  });

  it('needs the visible text and none of the absent ones', () => {
    const expect_ = { visible: '.*Українська.*', absent: 'Русский' };
    expect(axHolds(['Українська', 'English'], expect_)).toEqual([]);
    expect(axHolds(['Українська', 'Русский'], expect_)).toHaveLength(1);
    expect(axHolds(['English'], expect_)).toHaveLength(1);
  });

  it('does not take a closed menu for an open one', () => {
    if (menuAfter === undefined) throw new Error('no site-menu shot');
    // Before the press the button alone satisfies "Українська is visible"…
    expect(axHolds(['Мова: Українська'], menuAfter.ax.uk)).toEqual([]);
    // …so the final check also needs the menu's own English entry.
    expect(phaseAxFailures(['Мова: Українська'], menuAfter, 'uk', true)).toHaveLength(1);
    expect(
      phaseAxFailures(['Мова: Українська', 'Українська', 'English'], menuAfter, 'uk', true),
    ).toEqual([]);
    expect(phaseAxFailures(['Мова: Українська'], menuAfter, 'uk', false)).toEqual([]);
    expect(phaseAxFailures(['tochka24'], menuAfter, 'uk', false)).toHaveLength(1);
  });
});

describe('desktop geometry', () => {
  it('fits the window on the Xvfb screen', () => {
    // Exactly the window at device scale: the screen grab IS the window once the browser fills it.
    expect(XVFB_SCREEN.width).toBe(WINDOW.width * LINUX_SCALE);
    expect(XVFB_SCREEN.height).toBe(WINDOW.height * LINUX_SCALE);
    // 1200 CSS px keeps the mock sites' desktop layout (≥1100px).
    expect(WINDOW.width).toBeGreaterThanOrEqual(1100);
  });

  it('measures the chrome as capture height minus viewport', () => {
    expect(chromeTopFromViewport(900, 813)).toBe(87);
    expect(chromeTopFromViewport(1800, 813, 2)).toBe(174);
  });

  it('refuses an implausible chrome height', () => {
    expect(() => chromeTopFromViewport(900, 900)).toThrow(/outside/);
    expect(() => chromeTopFromViewport(900, 900 - CHROME_TOP_BOUNDS.max - 1)).toThrow(/outside/);
  });

  it('reads Safari chrome from the AX frames in capture px', () => {
    const window = { x: 0, y: 40, width: 1440, height: 900 };
    expect(chromeTopFromFrames(window, { x: 0, y: 92, width: 1440, height: 848 }, 2)).toBe(104);
  });

  it('accepts only 1×, 1.5× or 2× capture scales and the exact window', () => {
    expect(captureScale(2400, 1200)).toBe(2);
    expect(captureScale(1800, 1200)).toBe(1.5);
    expect(captureScale(1200, 1200)).toBe(1);
    expect(() => captureScale(2000, 1440)).toThrow();
    expect(() => captureScale(500, 1200)).toThrow();
    expect(() => {
      assertCaptureSize({ width: 1800, height: 1125 }, 1.5);
    }).not.toThrow();
    expect(() => {
      assertCaptureSize({ width: 1200, height: 749 });
    }).toThrow(/expected/);
  });

  it('parses xdotool geometry and picks the largest window', () => {
    const g = parseXdotoolGeometry('WINDOW=4194307\nX=0\nY=0\nWIDTH=1440\nHEIGHT=900\nSCREEN=0\n');
    expect(g).toEqual({ id: 4_194_307, x: 0, y: 0, width: 1440, height: 900 });
    expect(largestWindow([{ ...g, id: 1, width: 10, height: 10 }, g]).id).toBe(4_194_307);
    expect(() => largestWindow([])).toThrow();
  });

  it('writes the sidecar the framer reads', () => {
    expect(JSON.parse(sidecar(87))).toEqual({ chromeTop: 87 });
  });
});

describe('desktop locales', () => {
  it('parses only the two capture locales', () => {
    expect(parseLocale('uk')).toBe('uk');
    expect(() => parseLocale('ru')).toThrow();
  });

  it('asks for Ukrainian first in the uk set', () => {
    expect(DESKTOP_LOCALES.uk.acceptLanguages.startsWith('uk')).toBe(true);
    expect(DESKTOP_LOCALES.uk.firefoxLocale).toBe(DESKTOP_LOCALES.uk.firefoxBuild);
  });
});

describe('profiles', () => {
  it('derives a Chrome extension id: 32 letters a–p, stable per path', () => {
    const id = unpackedExtensionId('/work/apps/extension/.output/chrome-mv3');
    expect(id).toMatch(/^[a-p]{32}$/);
    expect(unpackedExtensionId('/work/apps/extension/.output/chrome-mv3')).toBe(id);
    expect(unpackedExtensionId('/other')).not.toBe(id);
  });

  it('pins Movar and silences first-run, translate and suggest in Chrome', () => {
    const prefs = chromePreferences(DESKTOP_LOCALES.uk, 'abc') as Record<
      string,
      Record<string, unknown>
    >;
    expect(prefs['extensions']?.['pinned_extensions']).toEqual(['abc']);
    expect(prefs['translate']?.['enabled']).toBe(false);
    expect(prefs['search']?.['suggest_enabled']).toBe(false);
    expect(prefs['intl']?.['accept_languages']).toBe(DESKTOP_LOCALES.uk.acceptLanguages);
    expect(chromePreferences(DESKTOP_LOCALES.en, null)['extensions']).not.toHaveProperty(
      'pinned_extensions',
    );
  });

  it('points Firefox at the proxy and maps Movar to its fixed UUID', () => {
    const prefs = firefoxPrefs({
      locale: DESKTOP_LOCALES.uk,
      proxyPort: 8877,
      geckoId: 'movar@movar.fyi',
    });
    expect(prefs['network.proxy.ssl_port']).toBe(8877);
    expect(prefs['intl.locale.requested']).toBe('uk');
    expect(prefs['layout.css.devPixelsPerPx']).toBe('1.5');
    expect(prefs['toolkit.legacyUserProfileCustomizations.stylesheets']).toBe(true);
    expect(JSON.parse(String(prefs['extensions.webextensions.uuids']))).toEqual({
      'movar@movar.fyi': FIREFOX_EXTENSION_UUID,
    });
    expect(
      firefoxPrefs({ locale: DESKTOP_LOCALES.en, proxyPort: 1, geckoId: null }),
    ).not.toHaveProperty('extensions.webextensions.uuids');
    expect(userJs({ a: 1, b: 'x' })).toBe('user_pref("a", 1);\nuser_pref("b", "x");\n');
  });

  it('removes the automation stripes with the selector Firefox paints them on, and checks it', () => {
    // browser/themes urlbar.css: `:root[remotecontrol] { #urlbar > .urlbar-background { background-image: repeating-linear-gradient(…) } }`
    expect(FIREFOX_USER_CHROME_CSS).toContain(':root[remotecontrol] #urlbar > .urlbar-background');
    // eslint-disable-next-line @typescript-eslint/no-implied-eval -- syntax check only, never called
    expect(() => new Function(`return ${FIREFOX_AUTOMATION_MARKS_JS};`)).not.toThrow();
  });

  it('pins the Firefox button and checks the e2e build', () => {
    const manifest = {
      action: { default_title: 'Movar' },
      host_permissions: ['<all_urls>'],
      browser_specific_settings: { gecko: { id: 'movar@movar.fyi' } },
    };
    expect(withNavbarAction(manifest)['action']).toEqual({
      default_title: 'Movar',
      default_area: 'navbar',
    });
    expect(hasRequiredAllUrls(manifest)).toBe(true);
    expect(hasRequiredAllUrls({ optional_host_permissions: ['<all_urls>'] })).toBe(false);
    expect(geckoIdOf(manifest)).toBe('movar@movar.fyi');
    expect(() => geckoIdOf({})).toThrow();
  });
});
