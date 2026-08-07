/*
 * The mockups themselves — one builder per piece of browser UI an install step
 * points at.
 *
 * Each returns a self-contained HTML string whose outermost element carries
 * `aria-hidden="true"`: these are pictures of another product's interface, and
 * a screen reader walking a fake "Add extension" button would be actively
 * misleading. The instruction lives in the step body next to them.
 *
 * They are per-browser on purpose. An earlier generation of these illustrations
 * shared four abstract shapes across all four flows, which only worked because
 * the shapes were abstract — a Chrome install dialog and a Firefox doorhanger
 * genuinely look nothing alike, and neither resembles the iOS Settings row that
 * used to stand in for both Safaris.
 */

import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  Ellipsis,
  EllipsisVertical,
  Lock,
  Menu,
  Pin,
  Puzzle,
  RotateCw,
  Settings,
  Settings2,
} from 'lucide';
import { esc, icon, join } from './html';
import { EXAMPLE_HOST, EXTENSION_NAME, labelsFor } from './labels';
import type { BrowserUiLabels, BrowserUiLocale } from './labels';

/** Every piece of browser UI the install guidance can point at. Named
 *  `<platform>-<surface>` so a step's illustration reads unambiguously at the
 *  call site. */
export type BrowserUiMockup =
  | 'chromium-install-dialog'
  | 'chromium-toolbar'
  | 'chromium-site-access'
  | 'firefox-install-dialog'
  | 'firefox-toolbar'
  | 'firefox-permissions'
  | 'safari-extensions'
  | 'safari-site-access'
  | 'ios-extension-toggle'
  | 'ios-all-websites';

export interface BrowserUiOptions {
  /** Which locale's browser strings to draw. See the note in `labels.ts` on why
   *  this is the page's locale rather than the browser's. */
  readonly locale: BrowserUiLocale;
  /** URL of Movar's own icon. The two surfaces resolve it differently — a
   *  public path on the marketing site, a `runtime.getURL` in the extension —
   *  so it's injected rather than imported. */
  readonly iconSrc: string;
}

/** Chrome and Firefox draw their toolbar glyphs lighter than lucide's default
 *  weight of 2; at 16px anything heavier reads as a different icon set. */
const TOOLBAR_STROKE = 1.5;

/** Apple draws its checkmarks *heavier* than lucide's default. */
const APPLE_STROKE = 3;

/** The iOS disclosure indicator is semibold, but 3 units of stroke on a
 *  6-unit-wide glyph is half ink; 2.5 matches SF Symbols' weight. */
const IOS_CHEVRON_STROKE = 2.5;

const CLOSE = '</div>';

/** Wrap a mockup's body in its platform-scoped, screen-reader-hidden root. The
 *  platform class is what selects Chrome's / Firefox's / macOS's / iOS's
 *  palette out of `browser-ui.css`. */
function shell(
  platform: 'chrome' | 'firefox' | 'macos' | 'ios',
  ...parts: readonly (string | false | null | undefined)[]
): string {
  return join(`<div class="bui bui-${platform}" aria-hidden="true">`, ...parts, CLOSE);
}

/** Movar's icon, at whichever size the surrounding list draws icons. */
function extIcon(src: string, className: string): string {
  return `<img class="${className}" src="${esc(src)}" alt="" width="32" height="32" />`;
}

/* ---------------------------------------------------------------- Chromium */

function chromiumInstallDialog(l: BrowserUiLabels, iconSrc: string): string {
  return shell(
    'chrome',
    '<div class="bui-chrome__dialog">',
    // Chrome hangs the extension's 32px icon at the leading edge of the title
    // row (ExtensionInstallDialogView::CreateTitleContainer).
    '<div class="bui-chrome__dialog-head">',
    extIcon(iconSrc, 'bui-chrome__dialog-icon'),
    `<p class="bui-chrome__dialog-title">${esc(l.chrome.addTitle)}</p>`,
    CLOSE,
    `<p class="bui-chrome__dialog-lead">${esc(l.chrome.itCan)}</p>`,
    `<ul class="bui-chrome__perms"><li><span>${esc(l.chrome.permission)}</span></li></ul>`,
    '<div class="bui-chrome__actions">',
    `<span class="bui-chrome__btn bui-chrome__btn--text">${esc(l.chrome.cancel)}</span>`,
    `<span class="bui-chrome__btn bui-chrome__btn--filled">${esc(l.chrome.addExtension)}</span>`,
    CLOSE,
    CLOSE,
  );
}

/** The toolbar, with the puzzle button lit and the extensions menu open beneath
 *  it — Movar's row pinned, another extension's row not. */
function chromiumToolbar(l: BrowserUiLabels, iconSrc: string): string {
  return shell(
    'chrome',
    '<div class="bui-chrome__toolbar">',
    `<span class="bui-chrome__icon-btn">${icon(ArrowLeft, '', TOOLBAR_STROKE)}</span>`,
    `<span class="bui-chrome__icon-btn">${icon(ArrowRight, '', TOOLBAR_STROKE)}</span>`,
    `<span class="bui-chrome__icon-btn">${icon(RotateCw, '', TOOLBAR_STROKE)}</span>`,
    '<span class="bui-chrome__omnibox">',
    // Chrome 117+ replaced the omnibox padlock with this "tune" glyph; Firefox
    // still draws a padlock, which is why only that mockup keeps `Lock`.
    icon(Settings2, '', TOOLBAR_STROKE),
    `<span class="bui-chrome__omnibox-host">${esc(EXAMPLE_HOST)}</span>`,
    '</span>',
    '<span class="bui-chrome__icon-btn bui-chrome__icon-btn--active">',
    icon(Puzzle, '', TOOLBAR_STROKE),
    '</span>',
    `<span class="bui-chrome__icon-btn">${icon(EllipsisVertical, '', TOOLBAR_STROKE)}</span>`,
    CLOSE,
    '<div class="bui-chrome__popover">',
    `<p class="bui-chrome__popover-title">${esc(l.chrome.extensions)}</p>`,
    '<div class="bui-chrome__row">',
    extIcon(iconSrc, 'bui-chrome__ext-icon'),
    `<span class="bui-chrome__row-name">${esc(EXTENSION_NAME)}</span>`,
    `<span class="bui-chrome__pin bui-chrome__pin--on">${icon(Pin, '')}</span>`,
    `<span class="bui-chrome__more">${icon(EllipsisVertical, '')}</span>`,
    CLOSE,
    '<div class="bui-chrome__row">',
    '<span class="bui-chrome__ext-icon bui-icon-placeholder"></span>',
    '<span class="bui-chrome__row-name"><span class="bui-blank bui-blank--md"></span></span>',
    `<span class="bui-chrome__pin">${icon(Pin, '')}</span>`,
    `<span class="bui-chrome__more">${icon(EllipsisVertical, '')}</span>`,
    CLOSE,
    // The popover's footer row — every Chrome extensions menu ends here.
    '<div class="bui-chrome__divider"></div>',
    '<div class="bui-chrome__row">',
    icon(Settings, 'bui-chrome__row-icon'),
    `<span class="bui-chrome__row-name">${esc(l.chrome.manageExtensions)}</span>`,
    CLOSE,
    CLOSE,
  );
}

/** The site-access menu, with "On all sites" checked — the one setting this
 *  whole guide exists to get switched on. */
function chromiumSiteAccess(l: BrowserUiLabels, iconSrc: string): string {
  const option = (label: string, selected = false): string =>
    join(
      `<div class="bui-chrome__row${selected ? ' bui-chrome__row--selected' : ''}">`,
      icon(Check, `bui-chrome__check${selected ? '' : ' bui-chrome__check--empty'}`),
      `<span class="bui-chrome__row-name">${esc(label)}</span>`,
      CLOSE,
    );

  return shell(
    'chrome',
    '<div class="bui-chrome__popover bui-chrome__popover--menu">',
    '<div class="bui-chrome__row">',
    extIcon(iconSrc, 'bui-chrome__ext-icon'),
    `<span class="bui-chrome__row-name">${esc(EXTENSION_NAME)}</span>`,
    CLOSE,
    '<div class="bui-chrome__divider"></div>',
    `<p class="bui-chrome__section-label">${esc(l.chrome.siteAccess)}</p>`,
    option(l.chrome.onClick),
    option(l.chrome.onSpecificSites),
    option(l.chrome.onAllSites, true),
    CLOSE,
  );
}

/* ----------------------------------------------------------------- Firefox */

function firefoxInstallDialog(l: BrowserUiLabels, iconSrc: string): string {
  return shell(
    'firefox',
    '<div class="bui-firefox__panel">',
    '<div class="bui-firefox__panel-body">',
    '<div class="bui-firefox__panel-head">',
    extIcon(iconSrc, 'bui-firefox__ext-icon'),
    `<p class="bui-firefox__panel-title">${esc(l.firefox.addTitle)}</p>`,
    CLOSE,
    `<p class="bui-firefox__lead">${esc(l.firefox.itRequires)}</p>`,
    `<ul class="bui-firefox__perms"><li><span>${esc(l.firefox.permission)}</span></li></ul>`,
    '<div class="bui-firefox__actions">',
    `<span class="bui-firefox__btn bui-firefox__btn--ghost">${esc(l.firefox.cancel)}</span>`,
    `<span class="bui-firefox__btn bui-firefox__btn--primary">${esc(l.firefox.add)}</span>`,
    CLOSE,
    CLOSE,
    CLOSE,
  );
}

/** The unified-extensions panel, open on Movar's "Pin to Toolbar" item. */
function firefoxToolbar(l: BrowserUiLabels, iconSrc: string): string {
  return shell(
    'firefox',
    '<div class="bui-firefox__toolbar">',
    `<span class="bui-firefox__icon-btn">${icon(ArrowLeft, '', TOOLBAR_STROKE)}</span>`,
    `<span class="bui-firefox__icon-btn">${icon(ArrowRight, '', TOOLBAR_STROKE)}</span>`,
    `<span class="bui-firefox__icon-btn">${icon(RotateCw, '', TOOLBAR_STROKE)}</span>`,
    '<span class="bui-firefox__urlbar">',
    icon(Lock, '', TOOLBAR_STROKE),
    `<span class="bui-firefox__urlbar-host">${esc(EXAMPLE_HOST)}</span>`,
    '</span>',
    '<span class="bui-firefox__icon-btn bui-firefox__icon-btn--active">',
    icon(Puzzle, '', TOOLBAR_STROKE),
    '</span>',
    `<span class="bui-firefox__icon-btn">${icon(Menu, '', TOOLBAR_STROKE)}</span>`,
    CLOSE,
    '<div class="bui-firefox__panel">',
    '<div class="bui-firefox__row">',
    extIcon(iconSrc, 'bui-firefox__ext-icon'),
    `<span class="bui-firefox__row-label">${esc(EXTENSION_NAME)}</span>`,
    // In Firefox this "More options" button is the only route to Pin to
    // Toolbar, so the step's instruction has to start here.
    `<span class="bui-firefox__row-more">${icon(Ellipsis, '', TOOLBAR_STROKE)}</span>`,
    CLOSE,
    '<div class="bui-firefox__separator"></div>',
    '<div class="bui-firefox__row bui-firefox__row--selected">',
    icon(Pin, 'bui-firefox__row-icon'),
    `<span class="bui-firefox__row-label">${esc(l.firefox.pin)}</span>`,
    CLOSE,
    CLOSE,
  );
}

/** about:addons → Movar → Permissions, with all-sites access already on.
 *  Firefox grants it at install, so this step is "confirm it's still there". */
function firefoxPermissions(l: BrowserUiLabels): string {
  return shell(
    'firefox',
    // about:addons is an in-content page, not a chrome panel — hence the
    // `--content` surface rather than the doorhanger's arrowpanel colour.
    '<div class="bui-firefox__panel bui-firefox__panel--content">',
    '<div class="bui-firefox__tabs">',
    `<span class="bui-firefox__tab">${esc(l.firefox.details)}</span>`,
    `<span class="bui-firefox__tab bui-firefox__tab--active">${esc(l.firefox.permissions)}</span>`,
    CLOSE,
    '<div class="bui-firefox__row">',
    `<span class="bui-firefox__row-label">${esc(l.firefox.allSitesPermission)}</span>`,
    '<span class="bui-firefox__switch"><span></span></span>',
    CLOSE,
    CLOSE,
  );
}

/* ------------------------------------------------------------ macOS Safari */

/** Shared shell: the Extensions pane of Safari Settings, with Movar's row and
 *  one anonymous neighbour. `detail` fills the right-hand pane. */
function safariPane(l: BrowserUiLabels, iconSrc: string, detail: string): string {
  return shell(
    'macos',
    '<div class="bui-macos__window">',
    '<div class="bui-macos__titlebar">',
    '<span class="bui-macos__traffic"><i></i><i></i><i></i></span>',
    `<p class="bui-macos__title">${esc(l.safari.extensions)}</p>`,
    CLOSE,
    '<div class="bui-macos__body">',
    '<div class="bui-macos__list">',
    // Master/detail: the row whose detail fills the right pane is always the
    // selected one — an unselected list beside a populated detail pane is a
    // state the real Settings window cannot be in.
    '<div class="bui-macos__list-row bui-macos__list-row--selected">',
    `<span class="bui-macos__checkbox">${icon(Check, '', APPLE_STROKE)}</span>`,
    extIcon(iconSrc, 'bui-macos__ext-icon'),
    `<span class="bui-macos__ext-name">${esc(EXTENSION_NAME)}</span>`,
    CLOSE,
    '<div class="bui-macos__list-row">',
    '<span class="bui-macos__checkbox bui-macos__checkbox--off"></span>',
    '<span class="bui-macos__ext-icon bui-icon-placeholder"></span>',
    '<span class="bui-macos__ext-name"><span class="bui-blank bui-blank--sm"></span></span>',
    CLOSE,
    CLOSE,
    '<div class="bui-macos__detail">',
    // Safari's detail pane opens with the extension's identity, then the
    // permission sentence.
    '<div class="bui-macos__detail-head">',
    extIcon(iconSrc, 'bui-macos__detail-icon'),
    `<p class="bui-macos__detail-name">${esc(EXTENSION_NAME)}</p>`,
    CLOSE,
    detail,
    CLOSE,
    CLOSE,
    CLOSE,
  );
}

/** Enable step: the checkbox beside Movar is ticked. */
function safariExtensions(l: BrowserUiLabels, iconSrc: string): string {
  return safariPane(l, iconSrc, `<p>${esc(l.safari.permissionSummary)}</p>`);
}

/** Access step: same pane, with the site-access pop-up button set to
 *  "Allow on Every Website". */
function safariSiteAccess(l: BrowserUiLabels, iconSrc: string): string {
  return safariPane(
    l,
    iconSrc,
    join(
      `<p>${esc(l.safari.permissionSummary)}</p>`,
      '<span class="bui-macos__popup">',
      `<span class="bui-macos__popup-label">${esc(l.safari.allowOnEveryWebsite)}</span>`,
      `<span class="bui-macos__popup-chevrons">${icon(ChevronsUpDown, '')}</span>`,
      '</span>',
    ),
  );
}

/* -------------------------------------------------------------- iOS Safari */

/** Settings → Apps → Safari → Extensions → Movar. `body` is the part of that
 *  screen the step is pointing at. */
function iosScreen(l: BrowserUiLabels, iconSrc: string, body: string): string {
  return shell(
    'ios',
    '<div class="bui-ios__screen">',
    // A three-column nav bar: the tinted back item, the centred title, and an
    // empty trailing column that keeps the title optically centred.
    '<div class="bui-ios__navbar">',
    '<span class="bui-ios__back">',
    icon(ChevronLeft, 'bui-ios__back-chevron', APPLE_STROKE),
    `<span>${esc(l.ios.extensions)}</span>`,
    '</span>',
    '<span class="bui-ios__navbar-title">',
    extIcon(iconSrc, 'bui-ios__ext-icon'),
    `<span>${esc(EXTENSION_NAME)}</span>`,
    '</span>',
    CLOSE,
    body,
    CLOSE,
  );
}

/** Enable step: both switches on — the extension itself, and Private Browsing,
 *  which the copy calls out because it's off by default and easy to miss. */
function iosExtensionToggle(l: BrowserUiLabels, iconSrc: string): string {
  const row = (label: string): string =>
    join(
      '<div class="bui-ios__row">',
      `<span class="bui-ios__row-label">${esc(label)}</span>`,
      '<span class="bui-ios__switch"><span></span></span>',
      CLOSE,
    );

  return iosScreen(
    l,
    iconSrc,
    join(
      '<div class="bui-ios__group">',
      row(l.ios.allowExtensions),
      row(l.ios.allowInPrivate),
      CLOSE,
    ),
  );
}

/** Access step: the PERMISSIONS section, "All Websites" already set to Allow. */
function iosAllWebsites(l: BrowserUiLabels, iconSrc: string): string {
  return iosScreen(
    l,
    iconSrc,
    join(
      `<p class="bui-ios__header">${esc(l.ios.permissions)}</p>`,
      '<div class="bui-ios__group">',
      '<div class="bui-ios__row">',
      `<span class="bui-ios__row-label">${esc(l.ios.allWebsites)}</span>`,
      `<span class="bui-ios__row-value">${esc(l.ios.allow)}</span>`,
      icon(ChevronRight, 'bui-ios__chevron', IOS_CHEVRON_STROKE),
      CLOSE,
      CLOSE,
      // Closes the header → card → footnote rhythm iOS grouped tables use.
      // Only this group gets one: nobody has transcribed a footnote for the
      // Allow Extension / Private Browsing group off a real device.
      `<p class="bui-ios__footer">${esc(l.ios.permissionsFooter)}</p>`,
    ),
  );
}

const BUILDERS: Record<BrowserUiMockup, (l: BrowserUiLabels, iconSrc: string) => string> = {
  'chromium-install-dialog': chromiumInstallDialog,
  'chromium-toolbar': chromiumToolbar,
  'chromium-site-access': chromiumSiteAccess,
  'firefox-install-dialog': firefoxInstallDialog,
  'firefox-toolbar': firefoxToolbar,
  'firefox-permissions': firefoxPermissions,
  'safari-extensions': safariExtensions,
  'safari-site-access': safariSiteAccess,
  'ios-extension-toggle': iosExtensionToggle,
  'ios-all-websites': iosAllWebsites,
};

/**
 * Render `mockup` as an HTML string, ready to mount with `set:html` (Astro) or
 * `dangerouslySetInnerHTML` (React). The markup needs
 * `@movar/browser-ui/browser-ui.css` on the page to look like anything.
 */
export function renderBrowserUi(mockup: BrowserUiMockup, options: BrowserUiOptions): string {
  return BUILDERS[mockup](labelsFor(options.locale), options.iconSrc);
}
