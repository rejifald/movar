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
  GripVertical,
  Lock,
  Menu,
  Minus,
  Pin,
  Plus,
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
  | 'ios-all-websites'
  // The second mockup family: each platform's own language-priority panel,
  // for the /uk/guide diagnosis widget rather than the install walkthrough.
  | 'chromium-languages'
  | 'firefox-languages'
  | 'macos-language-region'
  | 'windows-languages'
  | 'ios-language-region'
  | 'android-languages';

/**
 * Which of a language-priority list's three fixes a settings-panel mockup
 * calls out. Meaningless for the ten install-walkthrough mockups above, which
 * ignore it.
 *
 * Mirrors `GuideFixHighlight` in `apps/marketing/src/lib/guide-diagnosis.ts` —
 * that module computes *which* fix a reader's list needs, this package only
 * draws the picture for whichever one it's told.
 */
export type BrowserUiHighlight = 'remove' | 'add' | 'top';

export interface BrowserUiOptions {
  /** Which locale's browser strings to draw. See the note in `labels.ts` on why
   *  this is the page's locale rather than the browser's. */
  readonly locale: BrowserUiLocale;
  /** URL of Movar's own icon. The two surfaces resolve it differently — a
   *  public path on the marketing site, a `runtime.getURL` in the extension —
   *  so it's injected rather than imported. Ignored by the six language-panel
   *  mockups, which draw no extension icon at all. */
  readonly iconSrc: string;
  /** Which fix a language-settings-panel mockup calls out: removing a
   *  blocked language, adding a missing one, or promoting one already present
   *  to the top. Ignored by the install-walkthrough mockups. Defaults to
   *  'remove'. */
  readonly highlight?: BrowserUiHighlight;
  /** The reader's own language list, in their own order, already localised by
   *  the caller (e.g. «російська», «англійська») — see the /uk/guide
   *  diagnosis widget, the one caller with a real list to pass. This package
   *  never inspects the strings themselves, only their order and count: it has
   *  no way to know which entry is "the Russian one". Falls back to a
   *  representative trio when omitted, so a caller previewing a panel doesn't
   *  have to invent one. */
  readonly languages?: readonly string[];
  /** Which row a 'remove' or 'top' highlight acts on, as a 0-based index into
   *  `languages`.
   *
   *  Load-bearing, not cosmetic: a caller that knows its list is
   *  `[російська, англійська]` and asks for 'remove' means the FIRST row, and a
   *  picture pointing at the second one would be telling the reader to delete
   *  the wrong language. Only the caller can know which entry is which, so only
   *  the caller can say. Out-of-range or omitted falls back to the last row,
   *  which is the least-wrong guess for a list this package cannot read. */
  readonly highlightRow?: number;
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
  platform: 'chrome' | 'firefox' | 'macos' | 'ios' | 'windows' | 'android',
  ...parts: readonly (string | false | null | undefined)[]
): string {
  return join(`<div class="bui bui-${platform}" aria-hidden="true">`, ...parts, CLOSE);
}

/** Movar's icon, at whichever size the surrounding list draws icons. */
function extIcon(src: string, className: string): string {
  return `<img class="${className}" src="${esc(src)}" alt="" width="32" height="32" />`;
}

/* ---------------------------------------------------------------- Chromium */

function chromiumInstallDialog(l: BrowserUiLabels, { iconSrc }: BuilderOptions): string {
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
function chromiumToolbar(l: BrowserUiLabels, { iconSrc }: BuilderOptions): string {
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
function chromiumSiteAccess(l: BrowserUiLabels, { iconSrc }: BuilderOptions): string {
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

function firefoxInstallDialog(l: BrowserUiLabels, { iconSrc }: BuilderOptions): string {
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
function firefoxToolbar(l: BrowserUiLabels, { iconSrc }: BuilderOptions): string {
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
function firefoxPermissions(l: BrowserUiLabels, _o: BuilderOptions): string {
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
function safariExtensions(l: BrowserUiLabels, { iconSrc }: BuilderOptions): string {
  return safariPane(l, iconSrc, `<p>${esc(l.safari.permissionSummary)}</p>`);
}

/** Access step: same pane, with the site-access pop-up button set to
 *  "Allow on Every Website". */
function safariSiteAccess(l: BrowserUiLabels, { iconSrc }: BuilderOptions): string {
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
function iosExtensionToggle(l: BrowserUiLabels, { iconSrc }: BuilderOptions): string {
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
function iosAllWebsites(l: BrowserUiLabels, { iconSrc }: BuilderOptions): string {
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

/* -------------------------------------------------------------- Languages */

/*
 * The second mockup family: each platform's own language-priority panel — the
 * screen the /uk/guide diagnosis widget points a reader at once it knows
 * which of three fixes their list needs. One builder per platform below,
 * reusing `highlight` to swap which fix the picture calls out.
 */

/** A representative trio, drawn only when the caller hasn't got the reader's
 *  real list. Every production caller (the /uk/guide diagnosis widget) has
 *  one and passes it via `languages`. */
const DEFAULT_LANGUAGES: readonly string[] = ['English (United States)', 'Русский', 'Українська'];

/**
 * The rows to render and which one (if any) is selected — shared by all six
 * builders below.
 *
 * WHICH row a 'remove' or 'top' highlight acts on comes from the caller, via
 * `highlightRow` — this package never reads the language strings themselves
 * (see the note on `BrowserUiOptions.languages`), so it cannot find "the
 * Russian one" and must not guess. Pointing at the wrong row would tell a
 * reader to delete the wrong language. The last row is the fallback for a
 * caller that says nothing, being the least-wrong guess rather than a claim.
 *
 * Chrome, Firefox and Windows each have a dedicated reorder control, so their
 * 'top' leaves the list in place and lights that control instead of moving
 * anything (`reorder: false`). macOS, iOS and Android reorder by dragging in
 * the real UI, which a static picture cannot animate, so their 'top' shows the
 * *result* instead: the row already leading the list, selected
 * (`reorder: true`).
 */
/**
 * The row a highlight acts on: the one the caller named, or the last row when
 * they named nothing the panel can use.
 *
 * Out of range, negative and fractional all mean the same thing — the caller
 * does not know — and must land on the same answer as saying nothing, so a
 * typo'd index cannot quietly point somewhere.
 */
function resolveRow(highlightRow: number | undefined, last: number): number {
  const named = highlightRow ?? -1;
  return Number.isInteger(named) && named >= 0 && named <= last ? named : last;
}

function languageRows(
  { highlight, languages, highlightRow }: BuilderOptions,
  reorder: boolean,
): { readonly rows: readonly string[]; readonly selected: number } {
  if (languages.length === 0 || highlight === 'add') {
    return { rows: languages, selected: -1 };
  }

  const selected = resolveRow(highlightRow, languages.length - 1);
  if (highlight === 'remove' || !reorder) {
    return { rows: languages, selected };
  }

  const rest = [...languages];
  const [promoted] = rest.splice(selected, 1);
  return promoted === undefined
    ? { rows: languages, selected }
    : { rows: [promoted, ...rest], selected: 0 };
}

/** A row's class list, with BEM's `--selected` modifier appended when it is the
 *  one the caller asked the panel to call out. */
function rowClass(className: string, selected: boolean): string {
  return selected ? `${className} ${className}--selected` : className;
}

/**
 * A language row that carries something besides its name — a trailing menu
 * button (Chrome, Windows) or a leading drag handle and ordinal (Android).
 *
 * The wrapper and its selected-state class are the same in all three; only
 * what goes inside differs, so that is the only thing a caller passes.
 */
function decoratedRow(
  className: string,
  selected: number,
  parts: (name: string, index: number) => readonly string[],
): (name: string, index: number) => string {
  return (name, index) =>
    join(`<div class="${rowClass(className, index === selected)}">`, ...parts(name, index), CLOSE);
}

/**
 * A language row that is nothing but its name and its selected state.
 *
 * Four of the six panels draw exactly this — macOS, iOS, Windows and Android
 * all list languages as plain rows with no per-row control. Chrome and Firefox
 * do not, because theirs carry a trailing menu button.
 */
function plainRow(className: string, selected: number): (name: string, index: number) => string {
  return (name, index) =>
    `<div class="${rowClass(className, index === selected)}">${esc(name)}</div>`;
}

/** chrome://settings/languages — desktop Chrome and Edge share this screen. */
function chromiumLanguages(l: BrowserUiLabels, o: BuilderOptions): string {
  const { highlight } = o;
  const { rows, selected } = languageRows(o, false);

  const row = decoratedRow('bui-chrome__row', selected, (name) => [
    `<span class="bui-chrome__row-name">${esc(name)}</span>`,
    `<span class="bui-chrome__more">${icon(EllipsisVertical, '', TOOLBAR_STROKE)}</span>`,
  ]);

  const menuItem = (label: string, active: boolean): string =>
    `<div class="bui-chrome__menu-item${active ? ' bui-chrome__menu-item--active' : ''}">${esc(label)}</div>`;

  return shell(
    'chrome',
    '<div class="bui-chrome__lang-panel">',
    '<div class="bui-chrome__lang-header">',
    `<p class="bui-chrome__lang-title">${esc(l.chrome.preferredLanguages)}</p>`,
    `<span class="bui-chrome__lang-add${highlight === 'add' ? ' bui-chrome__lang-add--active' : ''}">${esc(l.chrome.addLanguages)}</span>`,
    CLOSE,
    `<div class="bui-chrome__lang-list">${rows.map((name, index) => row(name, index)).join('')}</div>`,
    // The popover only exists once a row's kebab (or the header button, for
    // 'add') has notionally been clicked — 'add' selects no row and needs no
    // menu at all.
    highlight === 'add'
      ? false
      : join(
          '<div class="bui-chrome__lang-menu bui-chrome__popover">',
          menuItem(l.chrome.moveToTheTop, highlight === 'top'),
          menuItem(l.chrome.remove, highlight === 'remove'),
          CLOSE,
        ),
    CLOSE,
  );
}

/** The "Choose your preferred language for displaying pages" dialog, reached
 *  from about:preferences#general. */
function firefoxLanguages(l: BrowserUiLabels, o: BuilderOptions): string {
  const { highlight } = o;
  const { rows, selected } = languageRows(o, false);

  const row = plainRow('bui-firefox__lang-row', selected);

  const button = (label: string, active: boolean): string =>
    `<span class="bui-firefox__lang-btn${active ? ' bui-firefox__lang-btn--active' : ''}">${esc(label)}</span>`;

  return shell(
    'firefox',
    '<div class="bui-firefox__lang-dialog">',
    `<p class="bui-firefox__lang-title">${esc(l.firefox.chooseLanguageTitle)}</p>`,
    '<div class="bui-firefox__lang-body">',
    `<div class="bui-firefox__lang-list">${rows.map((name, index) => row(name, index)).join('')}</div>`,
    '<div class="bui-firefox__lang-buttons">',
    button(l.firefox.moveUp, highlight === 'top'),
    button(l.firefox.moveDown, false),
    button(l.firefox.remove, highlight === 'remove'),
    CLOSE,
    CLOSE,
    // Real Firefox pairs a "Select a language to add…" dropdown with this Add
    // button below the list — the only place this dialog's 'add' affordance
    // can live, since none of the three buttons above mean "add".
    '<div class="bui-firefox__lang-add-row">',
    `<span class="bui-firefox__lang-select">${esc(l.firefox.selectLanguageToAdd)}</span>`,
    `<span class="bui-firefox__lang-add-btn${highlight === 'add' ? ' bui-firefox__lang-add-btn--active' : ''}">${esc(l.firefox.add)}</span>`,
    CLOSE,
    CLOSE,
  );
}

/** System Settings → General → Language & Region. Not a Safari screen — see
 *  the note on `BrowserUiLabels.macos` — so it draws its own titlebar instead
 *  of reusing `safariPane`. */
function macosLanguageRegion(l: BrowserUiLabels, o: BuilderOptions): string {
  const { highlight } = o;
  const { rows, selected } = languageRows(o, true);

  const row = plainRow('bui-macos__lang-row', selected);

  return shell(
    'macos',
    '<div class="bui-macos__window">',
    '<div class="bui-macos__titlebar">',
    '<span class="bui-macos__traffic"><i></i><i></i><i></i></span>',
    `<p class="bui-macos__title">${esc(l.macos.languageRegion)}</p>`,
    CLOSE,
    '<div class="bui-macos__lang-pane">',
    `<p class="bui-macos__lang-title">${esc(l.macos.preferredLanguages)}</p>`,
    `<div class="bui-macos__lang-list">${rows.map((name, index) => row(name, index)).join('')}</div>`,
    // AppKit's add/remove stepper: no "move to top" control exists here, which
    // is why 'top' reorders the list above instead of lighting either button.
    '<div class="bui-macos__lang-steps">',
    `<span class="bui-macos__lang-step${highlight === 'add' ? ' bui-macos__lang-step--active' : ''}">${icon(Plus, '', APPLE_STROKE)}</span>`,
    `<span class="bui-macos__lang-step${highlight === 'remove' ? ' bui-macos__lang-step--active' : ''}">${icon(Minus, '', APPLE_STROKE)}</span>`,
    CLOSE,
    CLOSE,
    CLOSE,
  );
}

/** Settings → Time & language → Language & region. Reorders the same way
 *  macOS/iOS/Android do — dragging, not a menu item — so 'top' behaves like
 *  theirs rather than like Chrome's. */
function windowsLanguages(l: BrowserUiLabels, o: BuilderOptions): string {
  const { highlight } = o;
  const { rows, selected } = languageRows(o, true);

  const row = decoratedRow('bui-windows__row', selected, (name) => [
    `<span class="bui-windows__row-name">${esc(name)}</span>`,
    `<span class="bui-windows__more">${icon(EllipsisVertical, '', TOOLBAR_STROKE)}</span>`,
  ]);

  return shell(
    'windows',
    '<div class="bui-windows__panel">',
    '<div class="bui-windows__header">',
    `<p class="bui-windows__title">${esc(l.windows.preferredLanguages)}</p>`,
    join(
      `<span class="bui-windows__add${highlight === 'add' ? ' bui-windows__add--active' : ''}">`,
      icon(Plus, 'bui-windows__add-icon', TOOLBAR_STROKE),
      `<span>${esc(l.windows.addALanguage)}</span>`,
      '</span>',
    ),
    CLOSE,
    `<div class="bui-windows__list">${rows.map((name, index) => row(name, index)).join('')}</div>`,
    // Only 'remove' opens the kebab menu — 'top' has no button to light (see
    // above), so showing the menu for it would have nothing active inside it.
    highlight === 'remove'
      ? join(
          '<div class="bui-windows__menu">',
          `<div class="bui-windows__menu-item bui-windows__menu-item--active">${esc(l.windows.remove)}</div>`,
          CLOSE,
        )
      : false,
    CLOSE,
  );
}

/** Settings → General → Language & Region. A plain-title screen — unlike
 *  `iosScreen` above, its nav bar has no extension icon, because no extension
 *  is involved in this one. */
function iosLanguageRegion(l: BrowserUiLabels, o: BuilderOptions): string {
  const { highlight } = o;
  const { rows, selected } = languageRows(o, true);
  // "iPhone Language" mirrors whichever entry currently leads the list below
  // it — real iOS keeps the two in lockstep — so 'top' shows both already
  // updated to the promoted language, the same "after" picture together.
  const current = rows[0] ?? '';

  const row = (name: string, index: number): string =>
    `<div class="bui-ios__row${index === selected ? ' bui-ios__row--selected' : ''}"><span class="bui-ios__row-label">${esc(name)}</span></div>`;

  return shell(
    'ios',
    '<div class="bui-ios__screen">',
    '<div class="bui-ios__navbar">',
    '<span class="bui-ios__back">',
    icon(ChevronLeft, 'bui-ios__back-chevron', APPLE_STROKE),
    `<span>${esc(l.ios.general)}</span>`,
    '</span>',
    `<span class="bui-ios__navbar-title">${esc(l.ios.languageAndRegion)}</span>`,
    CLOSE,
    '<div class="bui-ios__group">',
    '<div class="bui-ios__row">',
    `<span class="bui-ios__row-label">${esc(l.ios.iPhoneLanguage)}</span>`,
    `<span class="bui-ios__row-value">${esc(current)}</span>`,
    icon(ChevronRight, 'bui-ios__chevron', IOS_CHEVRON_STROKE),
    CLOSE,
    CLOSE,
    `<p class="bui-ios__header">${esc(l.ios.preferredLanguageOrder)}</p>`,
    '<div class="bui-ios__group">',
    rows.map((name, index) => row(name, index)).join(''),
    // Real iOS lists "Add Language…" as the last row of this same card, not a
    // separate one — 'add' reuses the row-selected look for it below.
    `<div class="bui-ios__row${highlight === 'add' ? ' bui-ios__row--selected' : ''}"><span class="bui-ios__row-label bui-ios__row-label--action">${esc(l.ios.addLanguage)}</span></div>`,
    CLOSE,
    CLOSE,
  );
}

/** Settings → System → Languages. */
function androidLanguages(l: BrowserUiLabels, o: BuilderOptions): string {
  const { highlight } = o;
  const { rows, selected } = languageRows(o, true);

  const row = decoratedRow('bui-android__row', selected, (name, index) => [
    `<span class="bui-android__handle">${icon(GripVertical, '')}</span>`,
    `<span class="bui-android__ordinal">${index + 1}</span>`,
    `<span class="bui-android__row-name">${esc(name)}</span>`,
  ]);

  return shell(
    'android',
    '<div class="bui-android__panel">',
    `<p class="bui-android__title">${esc(l.android.languages)}</p>`,
    '<div class="bui-android__list">',
    rows.map((name, index) => row(name, index)).join(''),
    join(
      `<div class="bui-android__row${highlight === 'add' ? ' bui-android__row--selected' : ''}">`,
      `<span class="bui-android__row-name bui-android__row-name--action">${esc(l.android.addALanguage)}</span>`,
      CLOSE,
    ),
    CLOSE,
    CLOSE,
  );
}

/**
 * Every builder, keyed by the mockup name it draws. The ten install-walkthrough
 * builders only take `(l, iconSrc)`; a function with fewer parameters than a
 * `MockupBuilder` needs is still assignable to it, so none of them had to
 * change shape to fit alongside the six language-panel builders that do use
 * `highlight` and `languages`.
 */
/**
 * Everything a builder can draw from, as one bag.
 *
 * A bag rather than five positional parameters because six of the sixteen
 * builders need the same five, and six identical parameter lists is both a
 * clone and a place for two of them to drift out of order.
 */
interface BuilderOptions {
  readonly iconSrc: string;
  readonly highlight: BrowserUiHighlight;
  readonly languages: readonly string[];
  readonly highlightRow: number | undefined;
}

type MockupBuilder = (l: BrowserUiLabels, o: BuilderOptions) => string;

const BUILDERS: Record<BrowserUiMockup, MockupBuilder> = {
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
  'chromium-languages': chromiumLanguages,
  'firefox-languages': firefoxLanguages,
  'macos-language-region': macosLanguageRegion,
  'windows-languages': windowsLanguages,
  'ios-language-region': iosLanguageRegion,
  'android-languages': androidLanguages,
};

/**
 * Render `mockup` as an HTML string, ready to mount with `set:html` (Astro) or
 * `dangerouslySetInnerHTML` (React). The markup needs
 * `@movar/browser-ui/browser-ui.css` on the page to look like anything.
 */
export function renderBrowserUi(mockup: BrowserUiMockup, options: BrowserUiOptions): string {
  return BUILDERS[mockup](labelsFor(options.locale), {
    iconSrc: options.iconSrc,
    highlight: options.highlight ?? 'remove',
    languages: options.languages ?? DEFAULT_LANGUAGES,
    highlightRow: options.highlightRow,
  });
}
