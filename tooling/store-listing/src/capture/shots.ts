/**
 * The shots of one capture run: what URL each one opens and what must be true on
 * screen before the shutter fires.
 *
 * The URLs are the mock agent's contract (`src/mock/routes.ts`); if a host or
 * path moves there, align it here. `expect` is asserted by the shot's Maestro
 * flow against the accessibility tree, so a shot taken in the wrong state
 * (redirect not done, curtain not up, modal still open) fails the run instead of
 * shipping.
 */
import { SCENES } from '../mock/routes';

export type Locale = 'uk' | 'en';

export interface ShotExpectation {
  /** Accessibility text (full-match regex, Maestro syntax) that MUST be visible. */
  readonly visible: string;
  /** Accessibility text that must NOT be visible (use `|` for several). */
  readonly absent: string;
}

export interface Shot {
  readonly id: string;
  /** Opened in Safari via `simctl openurl`. */
  readonly url: string;
  /** `maestro/<flow>.yaml`: asserts the state, may interact (menu tap). */
  readonly flow: string;
  readonly expect: Record<Locale, ShotExpectation>;
  /**
   * The same screen with Movar not yet enabled, taken as `<id>-before` before the
   * extension is switched on. Same flow; its own URL and assertions, which are
   * page content (fixed Russian/Ukrainian mock text), so locale-independent
   * except for the curtain.
   */
  readonly before: {
    readonly url: string;
    readonly expect: Record<Locale, ShotExpectation>;
  };
}

/**
 * Accessible label of a Movar curtain, as Maestro sees it. Built from the
 * extension's own strings (`apps/extension/src/lib/i18n/content-strings-*.ts`:
 * `contentHidden.ariaLabel*`); `test/capture-shots.test.ts` keeps it in step.
 */
export const CURTAIN: Record<Locale, string> = {
  uk: '.*Мовар: приховано вміст.*',
  en: '.*Movar: (Russian )?content hidden.*',
};
const RU_MODAL = '.*(Выберите язык|Русский).*';
/** Matches nothing on screen: for flows with no "must be visible" claim. */
const ANY = '.*';
const NEVER = String.raw`\u0000never`;
/** First Russian result / tile titles of the mock Google and YouTube pages (`src/mock/pages.ts`). */
const RU_RESULT = '.*Борщ классический.*';
const RU_TILE = '.*Как приготовить идеальный борщ.*';

/** The same expectation for both locales. */
const both = (e: ShotExpectation): Record<Locale, ShotExpectation> => ({ uk: e, en: e });

export const SHOTS: readonly Shot[] = [
  {
    id: 'search',
    url: SCENES.google.startUrl,
    flow: 'shot-search',
    expect: {
      uk: { visible: CURTAIN.uk, absent: NEVER },
      en: { visible: CURTAIN.en, absent: NEVER },
    },
    before: {
      url: SCENES.google.startUrl,
      expect: {
        uk: { visible: RU_RESULT, absent: CURTAIN.uk },
        en: { visible: RU_RESULT, absent: CURTAIN.en },
      },
    },
  },
  {
    id: 'site-no-modal',
    url: SCENES.tochka24.startUrl,
    flow: 'shot-site-no-modal',
    expect: {
      uk: { visible: ANY, absent: RU_MODAL },
      en: { visible: ANY, absent: RU_MODAL },
    },
    before: {
      url: SCENES.tochka24.startUrl,
      expect: both({ visible: RU_MODAL, absent: NEVER }),
    },
  },
  {
    id: 'site-menu',
    url: SCENES.tochka24.startUrl,
    flow: 'shot-site-menu',
    expect: {
      uk: { visible: '.*Українська.*', absent: '.*Русский.*' },
      en: { visible: '.*Українська.*', absent: '.*Русский.*' },
    },
    before: {
      url: SCENES.tochka24.finalUrl,
      expect: both({ visible: '.*Русский.*', absent: NEVER }),
    },
  },
  {
    id: 'youtube',
    url: SCENES.youtube.startUrl,
    flow: 'shot-youtube',
    expect: {
      uk: { visible: CURTAIN.uk, absent: NEVER },
      en: { visible: CURTAIN.en, absent: NEVER },
    },
    before: {
      url: SCENES.youtube.startUrl,
      expect: {
        uk: { visible: RU_TILE, absent: CURTAIN.uk },
        en: { visible: RU_TILE, absent: CURTAIN.en },
      },
    },
  },
];

/** Exact App Store pixel size of the 6.9" iPhone slot. */
export const SCREENSHOT_SIZE = { width: 1320, height: 2868 } as const;

export const DEVICE_TYPE_NAME = 'iPhone 17 Pro Max';

/** One shot as the runner drives it: open `url`, run `flow` with `env`. */
export interface PlannedShot {
  readonly id: string;
  readonly url: string;
  readonly flow: string;
  readonly env: Record<string, string>;
}

/** The real listing: every shot, with its visible/absent assertions for `locale`. */
export function listingPlan(locale: Locale): PlannedShot[] {
  return SHOTS.map((shot) => ({
    id: shot.id,
    url: shot.url,
    flow: shot.flow,
    env: { V: shot.expect[locale].visible, A: shot.expect[locale].absent },
  }));
}

/** The "before" pass: each shot as real Safari shows it with no Movar, ids `<id>-before`. */
export function beforePlan(locale: Locale): PlannedShot[] {
  return SHOTS.map((shot) => ({
    id: `${shot.id}-before`,
    url: shot.before.url,
    flow: shot.flow,
    env: { V: shot.before.expect[locale].visible, A: shot.before.expect[locale].absent },
  }));
}

/** The mechanics check: one shot of a localhost page, no assertions. */
export function smokePlan(url: string): PlannedShot[] {
  return [{ id: 'smoke', url, flow: 'shot-smoke', env: {} }];
}
