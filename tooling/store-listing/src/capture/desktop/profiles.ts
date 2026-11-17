/**
 * Fresh-profile contents for the Linux browsers, as pure builders: everything a
 * first launch would otherwise ask about (welcome pages, default-browser and
 * translation prompts, sign-in) is answered up front, the proxy and the UI
 * language are set, and Movar's toolbar button is pinned. Nothing here touches
 * the machine; the runner writes these into a throwaway profile directory.
 */
import { createHash } from 'node:crypto';
import { LINUX_SCALE } from './geometry';
import type { DesktopLocale } from './locale';

// ── Chrome ──────────────────────────────────────────────────────────────────

/**
 * The id Chrome gives an unpacked extension: SHA-256 of its absolute (real)
 * path, first 16 bytes, hex digits mapped 0-f → a-p. Needed to pin it before
 * the first launch.
 */
/** An extension id is 32 letters: the first 16 bytes of the hash, one letter per hex digit. */
const ID_HEX_CHARS = 32;

export function unpackedExtensionId(absolutePath: string): string {
  const hex = createHash('sha256')
    .update(absolutePath, 'utf8')
    .digest('hex')
    .slice(0, ID_HEX_CHARS);
  const a = 'a'.codePointAt(0) ?? 0;
  return Array.from(hex, (c) => String.fromCodePoint(a + Number.parseInt(c, 16))).join('');
}

/** `<user-data-dir>/Default/Preferences` for a capture profile. */
export function chromePreferences(
  locale: DesktopLocale,
  pinnedExtensionId: string | null,
): Record<string, unknown> {
  return {
    browser: { has_seen_welcome_page: true, check_default_browser: false, show_home_button: false },
    bookmark_bar: { show_on_all_tabs: false },
    distribution: { skip_first_run_ui: true, suppress_first_run_default_browser_prompt: true },
    extensions: {
      ...(pinnedExtensionId === null ? {} : { pinned_extensions: [pinnedExtensionId] }),
      ui: { developer_mode: false },
    },
    intl: { accept_languages: locale.acceptLanguages, selected_languages: locale.acceptLanguages },
    // The mock pages are partly Russian: no "Translate this page?" bubble over them.
    translate: { enabled: false },
    // The default engine is Google, a mocked host: no omnibox suggest requests to it.
    search: { suggest_enabled: false },
    credentials_enable_service: false,
    signin: { allowed: false },
    profile: { exit_type: 'Normal', exited_cleanly: true, password_manager_enabled: false },
  };
}

// ── Firefox ─────────────────────────────────────────────────────────────────

/** Fixed internal UUID for Movar's moz-extension:// origin, so its pages are addressable. */
export const FIREFOX_EXTENSION_UUID = '6d6f7661-7200-4c69-8374-696e67000001';

export interface FirefoxPrefsInput {
  readonly locale: DesktopLocale;
  readonly proxyPort: number;
  /** Gecko id of the extension to map to `FIREFOX_EXTENSION_UUID`, or null (before pass). */
  readonly geckoId: string | null;
}

type PrefValue = string | number | boolean;

export function firefoxPrefs(input: FirefoxPrefsInput): Record<string, PrefValue> {
  const { locale, proxyPort, geckoId } = input;
  return {
    // Proxy: every request through the mock proxy (it refuses unmocked hosts).
    'network.proxy.type': 1,
    'network.proxy.http': '127.0.0.1',
    'network.proxy.http_port': proxyPort,
    'network.proxy.ssl': '127.0.0.1',
    'network.proxy.ssl_port': proxyPort,
    'network.proxy.share_proxy_settings': true,
    'network.proxy.no_proxies_on': '',
    'network.captive-portal-service.enabled': false,
    'network.connectivity-service.enabled': false,
    // Language: UI (= the extension's i18n locale) and Accept-Language.
    'intl.locale.requested': locale.firefoxLocale,
    'intl.accept_languages': locale.acceptLanguages,
    // First run, prompts and panels a fresh profile would show.
    'browser.aboutwelcome.enabled': false,
    'browser.shell.checkDefaultBrowser': false,
    'browser.startup.homepage_override.mstone': 'ignore',
    'browser.startup.firstrunSkipsHomepage': true,
    'startup.homepage_welcome_url': '',
    'startup.homepage_welcome_url.additional': '',
    'datareporting.policy.dataSubmissionPolicyBypassNotification': true,
    'toolkit.telemetry.reportingpolicy.firstRun': false,
    'trailhead.firstrun.didSeeAboutWelcome': true,
    'browser.translations.enable': false,
    'browser.translations.automaticallyPopup': false,
    'browser.toolbars.bookmarks.visibility': 'never',
    'browser.tabs.warnOnClose': false,
    'browser.uitour.enabled': false,
    'browser.discovery.enabled': false,
    'extensions.recommendations.hideNotice': true,
    'sidebar.revamp': false,
    'sidebar.verticalTabs': false,
    'app.update.auto': false,
    // Never update the Firefox it runs (a local install may have one staged).
    'app.update.disabledForTesting': true,
    'browser.download.panel.shown': true,
    // The window at LINUX_SCALE device px per CSS px, chrome and page alike.
    'layout.css.devPixelsPerPx': String(LINUX_SCALE),
    // userChrome.css (below) is read only with this on.
    'toolkit.legacyUserProfileCustomizations.stylesheets': true,
    // MV3 host permissions granted at install, as a store install grants them.
    'extensions.originControls.grantByDefault': true,
    ...(geckoId === null
      ? {}
      : {
          'extensions.webextensions.uuids': JSON.stringify({ [geckoId]: FIREFOX_EXTENSION_UUID }),
        }),
  };
}

export function userJs(prefs: Record<string, PrefValue>): string {
  return Object.entries(prefs)
    .map(([key, value]) => `user_pref(${JSON.stringify(key)}, ${JSON.stringify(value)});`)
    .join('\n')
    .concat('\n');
}

/**
 * Firefox paints an automated session's address bar with stripes and a robot
 * icon. A user's Firefox never shows them; nothing else of the UI is touched.
 */
export const FIREFOX_USER_CHROME_CSS = `:root[remotecontrol] #urlbar > .urlbar-background { background-image: none !important; }
:root[remotecontrol] #remote-control-box { visibility: collapse !important; width: 0 !important; }
#remote-control-toolbar-button { display: none !important; }
`;

/**
 * Chrome-realm check that no automation marking survives in the toolbar: any
 * element painted with the stripes' repeating gradient, or the robot box or
 * button laid out. Yields the offenders; empty means a user's Firefox look.
 */
export const FIREFOX_AUTOMATION_MARKS_JS = `(() => {
  const hits = [];
  for (const el of document.querySelectorAll('#navigator-toolbox, #navigator-toolbox *')) {
    if (getComputedStyle(el).backgroundImage.includes('repeating-linear-gradient')) hits.push('stripes on ' + (el.id || el.className || el.localName));
  }
  for (const id of ['remote-control-box', 'remote-control-toolbar-button']) {
    const el = document.getElementById(id);
    if (el !== null && el.getBoundingClientRect().width > 0 && getComputedStyle(el).visibility === 'visible') hits.push(id + ' shown');
  }
  return hits;
})()`;

/**
 * The built manifest with Movar's button pinned to the toolbar
 * (`action.default_area`, Firefox's own key) instead of tucked into the
 * extensions menu: what a user who pinned it sees.
 */
export function withNavbarAction(manifest: Record<string, unknown>): Record<string, unknown> {
  const action = (manifest['action'] ?? {}) as Record<string, unknown>;
  return { ...manifest, action: { ...action, default_area: 'navbar' } };
}

/** The e2e build (MOVAR_E2E=1) holds `<all_urls>` as a required host permission. */
export function hasRequiredAllUrls(manifest: Record<string, unknown>): boolean {
  const hosts = manifest['host_permissions'];
  return Array.isArray(hosts) && hosts.includes('<all_urls>');
}

export function geckoIdOf(manifest: Record<string, unknown>): string {
  const settings = manifest['browser_specific_settings'] as
    | { gecko?: { id?: unknown } }
    | undefined;
  const id = settings?.gecko?.id;
  if (typeof id !== 'string') throw new Error('manifest has no browser_specific_settings.gecko.id');
  return id;
}
