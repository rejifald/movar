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
    /** The before pass's flow when it differs from the after's (no Movar UI to tap). */
    readonly flow?: string;
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
/**
 * The gate itself, for "must be gone": its Russian title, or an element that is
 * exactly the Russian option. Not any text containing «Русский»: Movar's own
 * screen-reader note «Мовар приховав: Русский.» says it removed that option, and
 * iPad Safari keeps it in the accessibility tree (CI runs 17 and 19).
 */
const RU_OPTION = 'Русский';
const RU_GATE = `.*Выберите язык.*|${RU_OPTION}`;
/** Matches nothing on screen: for flows with no "must be visible" claim. */
const ANY = '.*';
const NEVER = String.raw`\u0000never`;
/** First Russian result / tile titles of the mock Google and YouTube pages (`src/mock/pages.ts`). */
const RU_RESULT = '.*Борщ классический.*';
const RU_TILE = '.*Как приготовить идеальный борщ.*';
/** The Ukrainian tile that follows it, and takes its slot once Movar hides it. */
const UK_TILE = '.*Карпатські полонини.*';

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
      uk: { visible: ANY, absent: RU_GATE },
      en: { visible: ANY, absent: RU_GATE },
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
      // The option itself, exactly: Movar's note about hiding it stays (CI run 19).
      uk: { visible: '.*Українська.*', absent: RU_OPTION },
      en: { visible: '.*Українська.*', absent: RU_OPTION },
    },
    before: {
      url: SCENES.tochka24.finalUrl,
      expect: both({ visible: '.*Русский.*', absent: NEVER }),
    },
  },
  {
    id: 'youtube',
    url: SCENES.youtube.startUrl,
    // The after taps the curtain's own "Hide all": the Russian card leaves the
    // feed and the Ukrainian one moves into its slot. That persists the hide
    // mode, so this shot stays last in the plan.
    flow: 'shot-youtube-hide-all',
    expect: {
      uk: { visible: UK_TILE, absent: `${RU_TILE}|${CURTAIN.uk}` },
      en: { visible: UK_TILE, absent: `${RU_TILE}|${CURTAIN.en}` },
    },
    before: {
      url: SCENES.youtube.startUrl,
      flow: 'shot-youtube',
      expect: {
        uk: { visible: RU_TILE, absent: CURTAIN.uk },
        en: { visible: RU_TILE, absent: CURTAIN.en },
      },
    },
  },
];

export type CaptureDevice = 'iphone' | 'ipad';

export interface CaptureDeviceProfile {
  /** Simulator device type, as `simctl create` takes it. */
  readonly typeName: string;
  /** Exact App Store pixel size of the device's screenshot slot. */
  readonly size: { readonly width: number; readonly height: number };
  /**
   * Screen points the setup flows tap: a UISwitch flips only on its own control,
   * not its label, and iPad Settings is a split view, so the position differs.
   */
  readonly env: Readonly<Record<'P_EXT_SWITCH' | 'P_HOST_TOGGLE', string>>;
}

/** The captured devices: the 6.9" iPhone slot and the 13" iPad slot. */
export const CAPTURE_DEVICES: Readonly<Record<CaptureDevice, CaptureDeviceProfile>> = {
  iphone: {
    typeName: 'iPhone 17 Pro Max',
    size: { width: 1320, height: 2868 },
    env: { P_EXT_SWITCH: '84%,39%', P_HOST_TOGGLE: '84%,20%' },
  },
  ipad: {
    typeName: 'iPad Pro 13-inch (M5)',
    size: { width: 2064, height: 2752 },
    // Verified on iOS 26.3 (en): Settings' detail pane, and the host app's centred column.
    env: { P_EXT_SWITCH: '93%,26%', P_HOST_TOGGLE: '75%,11%' },
  },
};

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
    flow: shot.before.flow ?? shot.flow,
    env: { V: shot.before.expect[locale].visible, A: shot.before.expect[locale].absent },
  }));
}

/** The mechanics check: one shot of a localhost page, no assertions. */
export function smokePlan(url: string): PlannedShot[] {
  return [{ id: 'smoke', url, flow: 'shot-smoke', env: {} }];
}
