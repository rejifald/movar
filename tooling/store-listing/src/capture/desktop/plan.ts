/**
 * The desktop shots: the same story and ids as the phone set (`../shots.ts`
 * SHOTS), each a before/after pair of one real browser window.
 *
 * A phase says what URL to open, what must hold before anything is touched,
 * what (if anything) to click, and what must hold before the shutter. Firefox and
 * Chrome check the page DOM (`DomCheck`, a JS expression evaluated in the page);
 * Safari has no page-script channel we can open unattended, so it checks the
 * accessibility tree with the phone set's own expectations (`ax`) and the URL
 * Safari reports. A check that never holds fails the run: no frame of a wrong
 * state is ever written.
 */
import { SCENES } from '../../mock/routes';
import { COPY } from '../../mock/sites/tochka24';
import { CURTAIN, SHOTS } from '../shots';
import type { Locale, ShotExpectation } from '../shots';

export type DesktopBrowser = 'firefox' | 'chrome' | 'safari';
export const DESKTOP_BROWSERS: readonly DesktopBrowser[] = ['firefox', 'chrome', 'safari'];

/** A predicate evaluated in the page; `js` is an expression yielding a boolean. */
export interface DomCheck {
  readonly label: string;
  readonly js: string;
}

export interface DesktopClick {
  readonly label: string;
  /** DOM: an expression yielding the element to click (or null). */
  readonly target: string;
  /** Safari: accessibility label (regex) of the control to press. */
  readonly axLabel: string;
  /** Safari: a text (regex) that reads only once the click took effect. */
  readonly axEffect?: string;
}

export interface DesktopPhase {
  readonly url: string;
  /** The page URL must match this (regex source) before the shutter. */
  readonly urlPattern: string;
  /** Must hold before the click (or the shutter, when there is no click). */
  readonly ready: readonly DomCheck[];
  readonly click?: DesktopClick;
  /** Must hold after the click; also re-checked right before the shutter. */
  readonly after?: readonly DomCheck[];
  /** Safari: accessibility-text expectation (the phone set's, same mock pages). */
  readonly ax: Record<Locale, ShotExpectation>;
}

export interface DesktopShot {
  readonly id: string;
  readonly before: DesktopPhase;
  readonly after: DesktopPhase;
}

const q = (selector: string): string => JSON.stringify(selector);

/** Concealed: Movar curtained or hid the node, an ancestor or a descendant. */
function concealedJs(selector: string): string {
  return `(() => { const el = document.querySelector(${q(selector)}); if (el === null) return false;
    const m = '[data-movar-curtain],[data-movar-hidden]';
    return el.closest(m) !== null || el.querySelector(m) !== null; })()`;
}

/** Rendered: the node exists and lays out a box. */
function renderedJs(selector: string): string {
  return `(() => { const el = document.querySelector(${q(selector)});
    return el !== null && el.getClientRects().length > 0; })()`;
}

const existsJs = (selector: string): string => `document.querySelector(${q(selector)}) !== null`;
const absentJs = (selector: string): string => `document.querySelector(${q(selector)}) === null`;

/** At least one Movar curtain is on screen. */
const CURTAIN_SHOWN_JS = `[...document.querySelectorAll('[data-movar-curtain]')].some((h) => h.getClientRects().length > 0)`;
const NO_CURTAIN_JS = `!(${CURTAIN_SHOWN_JS})`;

const check = (label: string, js: string): DomCheck => ({ label, js });
const fixture = (id: string): string => `[data-fixture-id="${id}"]`;
const escapeRe = (s: string): string => s.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);

function ax(id: string, phase: 'before' | 'after'): Record<Locale, ShotExpectation> {
  const shot = SHOTS.find((s) => s.id === id);
  if (shot === undefined) throw new Error(`no phone shot "${id}" to borrow expectations from`);
  return phase === 'before' ? shot.before.expect : shot.expect;
}

/** Matches no accessibility text: for phases with no "must be absent" claim. */
const NEVER = String.raw`\u0000never`;

const MENU_BUTTON = '#lang-menu-button';
const RU_ENTRY = '#lang-menu a[hreflang="ru"]';
const UK_ENTRY = '#lang-menu a[hreflang="uk"]';
const GATE = '#language-gate';
/**
 * The menu button's accessible name on every tochka24 page, taken from the
 * page's own labels («Язык: …» on the before pass, «Мова: …», «Language: …»).
 */
export const MENU_AX = `.*(${Object.values(COPY)
  .map((copy) => copy.menuLabel.split(':')[0])
  .join('|')}).*`;

const openMenu: DesktopClick = {
  label: 'open the language menu',
  target: `document.querySelector(${q(MENU_BUTTON)})`,
  axLabel: MENU_AX,
  // The English entry: only in the open menu of a Ukrainian page.
  axEffect: '.*English.*',
};

const googleStart = SCENES.google.startUrl;
const tochkaStart = SCENES.tochka24.startUrl;
const tochkaUk = SCENES.tochka24.finalUrl;
const youtube = SCENES.youtubeDesktop.startUrl;

export const DESKTOP_SHOTS: readonly DesktopShot[] = [
  {
    id: 'search',
    before: {
      url: googleStart,
      urlPattern: String.raw`^(?!.*[?&]hl=uk).*google\.com/search`,
      ready: [
        check('Russian result 1 shown', renderedJs(fixture('ru-1'))),
        check('no curtain', NO_CURTAIN_JS),
      ],
      ax: ax('search', 'before'),
    },
    after: {
      url: googleStart,
      urlPattern: String.raw`google\.com/search.*[?&]hl=uk`,
      ready: [
        check('Ukrainian SERP', existsJs(fixture('uk-1'))),
        check('Russian result 1 curtained', concealedJs(fixture('ru-1'))),
        check('a curtain on screen', CURTAIN_SHOWN_JS),
      ],
      ax: ax('search', 'after'),
    },
  },
  {
    id: 'site-no-modal',
    before: {
      url: tochkaStart,
      urlPattern: `^${escapeRe(tochkaStart)}$`,
      ready: [check('Russian language gate up', renderedJs(GATE))],
      ax: ax('site-no-modal', 'before'),
    },
    after: {
      url: tochkaStart,
      urlPattern: `^${escapeRe(tochkaUk)}$`,
      ready: [
        check('no language gate', absentJs(GATE)),
        check('<html lang="uk">', `document.documentElement.lang === 'uk'`),
      ],
      ax: ax('site-no-modal', 'after'),
    },
  },
  {
    id: 'site-menu',
    before: {
      url: tochkaUk,
      urlPattern: `^${escapeRe(tochkaUk)}$`,
      ready: [check('menu button', renderedJs(MENU_BUTTON))],
      click: openMenu,
      after: [
        check('menu open', existsJs('#lang-menu.open')),
        check('Russian entry offered', renderedJs(RU_ENTRY)),
      ],
      ax: ax('site-menu', 'before'),
    },
    after: {
      url: tochkaStart,
      urlPattern: `^${escapeRe(tochkaUk)}$`,
      ready: [
        check('menu button', renderedJs(MENU_BUTTON)),
        check('Russian entry hidden by Movar', concealedJs(RU_ENTRY)),
      ],
      click: openMenu,
      after: [
        check('menu open', existsJs('#lang-menu.open')),
        check('Ukrainian entry shown', renderedJs(UK_ENTRY)),
        check('Russian entry not shown', `!(${renderedJs(RU_ENTRY)})`),
      ],
      ax: ax('site-menu', 'after'),
    },
  },
  {
    id: 'youtube',
    before: {
      url: youtube,
      urlPattern: `^${escapeRe(youtube)}$`,
      ready: [
        check('Russian video shown', renderedJs(fixture('ru-1'))),
        check('no curtain', NO_CURTAIN_JS),
      ],
      ax: ax('youtube', 'before'),
    },
    // The phone flow taps the curtain's «Hide all»; on desktop YouTube the real
    // curtain does not offer it: a grid card is too small for the pill's
    // secondary action (curtain.ts sheds it below the `lg`×`xl` container band).
    // So the desktop after shows the Russian cards curtained in the grid, which
    // is what a desktop user sees. (Owner call pending: see AGENTS.md.)
    after: {
      url: youtube,
      urlPattern: `^${escapeRe(youtube)}$`,
      ready: [
        check('Russian video curtained', concealedJs(fixture('ru-1'))),
        check('a curtain on screen', CURTAIN_SHOWN_JS),
        check('Ukrainian video shown', renderedJs(fixture('uk-1'))),
      ],
      ax: {
        uk: { visible: CURTAIN.uk, absent: NEVER },
        en: { visible: CURTAIN.en, absent: NEVER },
      },
    },
  },
];

/** The checks that must hold right before the shutter. */
export function finalChecks(phase: DesktopPhase): readonly DomCheck[] {
  return phase.click === undefined ? phase.ready : (phase.after ?? []);
}

/** Expected files of one browser/locale folder. */
export function expectedFiles(shots: readonly DesktopShot[] = DESKTOP_SHOTS): string[] {
  return shots.flatMap((s) => [`${s.id}.png`, `${s.id}-before.png`, `${s.id}.json`]);
}
