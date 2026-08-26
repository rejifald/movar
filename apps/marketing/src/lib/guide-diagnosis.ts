/*
 * The guide hub's diagnosis: what a visitor's browser is asking sites for, what
 * is wrong with it, and where — on *their* platform — the fix lives.
 *
 * Split out of `./guide` (which keeps the hub's routes, grouping and page
 * chrome) because this is a domain of its own: a fault model, a language
 * vocabulary, a platform table, and the copy that goes with all three. Keeping
 * it here means the hub's strings file stays a strings file.
 *
 * ## Faults are independent, not a ladder
 *
 * The checker this replaces resolved a language list to ONE verdict through an
 * ordered first-match table. That shape cannot report a list which is wrong in
 * two ways at once, and `['ru']` is exactly that list: Ukrainian is missing
 * *and* Russian is being asked for. Whichever row went second was unreachable,
 * so the reader was told only half of the one case this guide exists for.
 *
 * {@link guideFaults} answers with every fault that holds. Two of the three are
 * mutually exclusive by construction (`absent` and `notFirst` both describe
 * where Ukrainian sits), so at most two ever fire together.
 *
 * ## Nothing here blames the reader
 *
 * Every string names the state of the list, the setting or the site — never the
 * reader's action. See `docs/copy.md` §1.7: almost none of these settings were
 * chosen, so "ви просите російську" is not just unkind, it is usually untrue.
 *
 * ## Everything runs on the device
 *
 * `navigator.languages`, the user agent and `Intl.DisplayNames` are all local.
 * Nothing here is sent anywhere, which is the same promise the product makes.
 */

import type { BrowserUiMockup } from '@movar/browser-ui';

import { pluralForm } from './guide';

/** The language the guide is trying to get to the top of the list. */
const TARGET_LANGUAGE = 'uk';

/** The language whose presence anywhere in the list is a fault on its own. */
const BLOCKED_LANGUAGE = 'ru';

/**
 * The three ways a language list can be wrong, each checked independently.
 *
 * `absent` and `notFirst` are alternatives — Ukrainian is either missing or
 * placed — so a list carries at most two faults.
 */
export type GuideFault = 'blocked' | 'absent' | 'notFirst';

/** `uk-UA` and `uk` are the same claim, so tags compare on the primary subtag. */
const primarySubtag = (tag: string): string => tag.toLowerCase().split('-')[0] ?? '';

/**
 * One language in the reader's list, as the widget shows it.
 *
 * `rank` counts LANGUAGES, not tags: a browser reporting `ru-RU, ru, en-US` is
 * asking for two languages, and numbering the raw tags would tell the reader
 * their list is longer than it is.
 */
export interface GuideLanguage {
  /** Primary subtag — `uk`, `ru`, `en`. */
  readonly code: string;
  /** Display name in Ukrainian, lowercase: «українська», «російська». */
  readonly name: string;
  /** 1-based position among languages. */
  readonly rank: number;
  readonly role: 'target' | 'blocked' | 'other';
}

/**
 * Name a language in Ukrainian.
 *
 * `Intl.DisplayNames` is the whole implementation on purpose: CLDR already has
 * the lowercase nominative Ukrainian name for every code a browser can emit, so
 * a hand-kept table would be a second, worse copy that silently misses
 * languages. It is also why the widget's field label is a noun phrase («Сайти
 * бачать ці мови як пріоритетні») rather than «просить російською» — the
 * instrumental case would need exactly the table this avoids.
 *
 * Falls back to the code itself where the runtime has no data, which reads as
 * `qtz` rather than as a wrong name.
 */
function displayName(code: string): string {
  try {
    return new Intl.DisplayNames(['uk'], { type: 'language' }).of(code) ?? code;
  } catch {
    return code;
  }
}

/**
 * The reader's language list, deduplicated to one entry per language.
 *
 * Exported (and taking the tags as an argument) so the whole vocabulary can be
 * driven from a test without a browser profile per case.
 */
export function guideLanguages(
  tags: readonly string[],
  name: (code: string) => string = displayName,
): GuideLanguage[] {
  const seen: string[] = [];
  for (const tag of tags) {
    const code = primarySubtag(tag);
    if (code !== '' && !seen.includes(code)) seen.push(code);
  }

  const roleOf = (code: string): GuideLanguage['role'] => {
    if (code === TARGET_LANGUAGE) return 'target';
    if (code === BLOCKED_LANGUAGE) return 'blocked';
    return 'other';
  };

  return seen.map((code, index) => ({
    code,
    name: name(code),
    rank: index + 1,
    role: roleOf(code),
  }));
}

/**
 * Every fault the list carries, in the order the widget lists them.
 *
 * An empty array means the list is in the target state; it does NOT mean the
 * browser said nothing. Callers distinguish those two by the list's own length,
 * because "no data" is not a fault the reader can fix from here.
 */
export function guideFaults(tags: readonly string[]): GuideFault[] {
  const languages = guideLanguages(tags);
  if (languages.length === 0) return [];

  const target = languages.find((language) => language.role === 'target');
  const faults: GuideFault[] = [];

  if (languages.some((language) => language.role === 'blocked')) faults.push('blocked');
  if (target === undefined) faults.push('absent');
  else if (target.rank > 1) faults.push('notFirst');

  return faults;
}

/* -------------------------------------------------------------------------- */
/* Where the fix lives                                                        */
/* -------------------------------------------------------------------------- */

/**
 * The surface that OWNS the reader's language list — which is not always their
 * browser, and that difference is the whole reason this table exists.
 *
 * Safari has no language list of its own on either platform, and neither does
 * any browser on iOS (they all run on WebKit and read the system list). Sending
 * those readers to "your browser's settings" would send them somewhere that
 * does not exist.
 */
export type GuideFixTarget =
  | 'chrome'
  | 'chrome-android'
  | 'edge'
  | 'firefox'
  | 'macos'
  | 'windows'
  | 'ios'
  | 'android';

/** Which affordance a mockup should light up for a given fault. */
export type GuideFixHighlight = 'remove' | 'add' | 'top';

const HIGHLIGHTS: Record<GuideFault, GuideFixHighlight> = {
  blocked: 'remove',
  absent: 'add',
  notFirst: 'top',
};

/** Which affordance a mockup lights up for a fault. */
export function fixHighlight(fault: GuideFault): GuideFixHighlight {
  return HIGHLIGHTS[fault];
}

/**
 * Which row of the reader's list the mockup should call out.
 *
 * `@movar/browser-ui` cannot read the language names it is handed, so it cannot
 * find "the Russian one" — only this side knows. Getting it wrong would draw a
 * picture telling the reader to delete the wrong language, which is worse than
 * drawing no picture at all.
 *
 * `absent` has no row to point at: the whole fault is that Ukrainian is not in
 * the list, so the mockup lights the add-a-language control instead.
 */
export function fixHighlightRow(
  fault: GuideFault,
  languages: readonly GuideLanguage[],
): number | undefined {
  if (fault === 'absent') return undefined;

  const role = fault === 'blocked' ? 'blocked' : 'target';
  const index = languages.findIndex((language) => language.role === role);
  return index === -1 ? undefined : index;
}

/**
 * Resolve the owning surface from a user agent.
 *
 * Order matters and is the whole trick, same as `detectTokens` in `./guide`:
 * iOS is checked before any browser because on iOS the browser is irrelevant,
 * and Edge's user agent also says "Chrome".
 *
 * Returns `null` for a user agent that names neither a known OS nor a known
 * browser — the widget then reports the faults without claiming to know where
 * the reader should click, which is better than guessing Chrome.
 */
const UNKNOWN = 'не вдалося визначити';

/*
 * The user-agent vocabulary, in ONE place.
 *
 * Both questions this module asks of a user agent — what to call the browser,
 * and which surface owns the language list — read the same signatures, and two
 * copies of a user-agent table is how one of them goes stale.
 *
 * Order is the whole trick: Edge's user agent also says "Chrome", and Chrome's
 * also says "Safari", so a later row must never win over an earlier one.
 */
const isEdge = (ua: string): boolean => ua.includes('Edg/');
const isFirefox = (ua: string): boolean => ua.includes('Firefox/') || ua.includes('FxiOS');
const isChrome = (ua: string): boolean =>
  !isEdge(ua) && (ua.includes('Chrome/') || ua.includes('CriOS'));
const isSafari = (ua: string): boolean =>
  !isEdge(ua) && !isFirefox(ua) && !isChrome(ua) && ua.includes('Safari/');

const isIos = (ua: string): boolean =>
  ua.includes('iPhone') || ua.includes('iPad') || ua.includes('iPod');
const isAndroid = (ua: string): boolean => ua.includes('Android');
const isMac = (ua: string): boolean => ua.includes('Mac OS X');
const isWindows = (ua: string): boolean => ua.includes('Windows');

const BROWSERS: readonly (readonly [string, (ua: string) => boolean])[] = [
  ['Edge', isEdge],
  ['Firefox', isFirefox],
  ['Chrome', isChrome],
  ['Safari', isSafari],
];

const PLATFORMS: readonly (readonly [string, (ua: string) => boolean])[] = [
  ['iOS', isIos],
  ['Android', isAndroid],
  ['macOS', isMac],
  ['Windows', isWindows],
];

/**
 * What to call the reader's browser and system in the widget's two fields.
 *
 * Separate from {@link resolveFixTarget} even though both read the same user
 * agent, because they answer different questions and must be allowed to
 * disagree: on iOS the fix target is `ios` (no browser owns the language list
 * there), but the browser field still has to say «Safari» or «Chrome». Telling
 * a Safari-on-iOS visitor that their browser is "iOS" would be plainly wrong.
 */
export function describeAgent(userAgent: string): { browser: string; system: string } {
  return {
    browser: BROWSERS.find(([, matches]) => matches(userAgent))?.[0] ?? UNKNOWN,
    system: PLATFORMS.find(([, matches]) => matches(userAgent))?.[0] ?? UNKNOWN,
  };
}

/**
 * Which surface owns the language list, most specific first.
 *
 * A table rather than a branch chain, for the same reason `detectTokens` in
 * `./guide` is one: the ORDER is the whole rule, and a table states it where an
 * if/else only implies it.
 *
 * The two platform rows come first and that is the load-bearing part. On iOS
 * every browser runs on WebKit and reads the system list, so the browser is
 * irrelevant there; on Android Chrome keeps a list of its own while everything
 * else falls through to the system. `macos` sits BELOW the browser rows because
 * only Safari has no list of its own — Chrome on a Mac keeps one.
 */
const TARGETS: readonly (readonly [GuideFixTarget, (ua: string) => boolean])[] = [
  ['ios', isIos],
  ['chrome-android', (ua) => isAndroid(ua) && (isChrome(ua) || isEdge(ua))],
  ['android', isAndroid],
  ['edge', isEdge],
  ['firefox', isFirefox],
  ['chrome', isChrome],
  ['macos', (ua) => isMac(ua) && isSafari(ua)],
  ['windows', isWindows],
];

/**
 * Resolve the owning surface from a user agent.
 *
 * `null` for a user agent naming neither a known browser nor a known platform —
 * the widget then reports the faults without claiming to know where the reader
 * should click, which is better than guessing Chrome.
 */
export function resolveFixTarget(userAgent: string): GuideFixTarget | null {
  return TARGETS.find(([, matches]) => matches(userAgent))?.[0] ?? null;
}

/** One numbered instruction. `address` renders as a copyable settings URL. */
export interface GuideFixStep {
  readonly text: string;
  readonly address?: string;
}

/** Everything the widget needs to show one fix. */
export interface GuideFix {
  /** «Як виправити в Chrome» — names the surface, not the fault. */
  readonly label: string;
  readonly steps: readonly GuideFixStep[];
  /** The vendor-specific gotcha, drawn from the guide page's own «Пастка».
   *  Explicitly `| undefined` because the repo runs `exactOptionalPropertyTypes`
   *  and most surface/fault pairs genuinely have no gotcha worth repeating. */
  readonly trap?: string | undefined;
  /** Content-collection id of the page carrying the full instruction. */
  readonly guideId: string;
  /** Label for the link to that page. */
  readonly guideLabel: string;
  /** Which panel to draw, or `null` where no facsimile helps. */
  readonly mockup: BrowserUiMockup;
}

/**
 * The name each surface goes by in the widget's chrome.
 *
 * Where the list is not the browser's, the label says so — a Safari reader sent
 * to «Системні параметри» needs to know before the first step that they are not
 * looking for a Safari menu.
 */
const TARGET_LABELS: Record<GuideFixTarget, string> = {
  chrome: 'Як виправити в Chrome',
  'chrome-android': 'Як виправити в Chrome на Android',
  edge: 'Як виправити в Edge',
  firefox: 'Як виправити у Firefox',
  macos: 'Як виправити — у системі, не в Safari',
  windows: 'Як виправити в параметрах Windows',
  ios: 'Як виправити — у системі, не в браузері',
  android: 'Як виправити в налаштуваннях Android',
};

const GUIDE_PAGES: Record<GuideFixTarget, { readonly id: string; readonly label: string }> = {
  chrome: { id: 'chrome', label: 'Повна інструкція для Chrome →' },
  'chrome-android': { id: 'chrome', label: 'Повна інструкція для Chrome →' },
  edge: { id: 'edge', label: 'Повна інструкція для Edge →' },
  firefox: { id: 'firefox', label: 'Повна інструкція для Firefox →' },
  macos: { id: 'macos', label: 'Повна інструкція для macOS →' },
  windows: { id: 'windows', label: 'Повна інструкція для Windows →' },
  ios: { id: 'ios', label: 'Повна інструкція для iOS →' },
  android: { id: 'android', label: 'Повна інструкція для Android →' },
};

const MOCKUPS: Record<GuideFixTarget, BrowserUiMockup> = {
  chrome: 'chromium-languages',
  'chrome-android': 'android-languages',
  edge: 'chromium-languages',
  firefox: 'firefox-languages',
  macos: 'macos-language-region',
  windows: 'windows-languages',
  ios: 'ios-language-region',
  android: 'android-languages',
};

/** Settings addresses, where the platform has one a reader can paste. */
const ADDRESSES: Partial<Record<GuideFixTarget, string>> = {
  chrome: 'chrome://settings/languages',
  'chrome-android': 'chrome://settings/languages',
  edge: 'edge://settings/languages',
  firefox: 'about:preferences#general',
};

const PASTE = 'Вставте в адресний рядок і натисніть Enter:';

/**
 * The steps themselves, per surface and per fault.
 *
 * Every line is drawn from the guide page named in {@link GUIDE_PAGES} — this
 * table is a summary of prose that already exists, not a second source for it.
 * When a vendor moves a menu, both change together or the widget starts lying;
 * `docs/copy.md` and the pages' own «Оновлено» stamps are the current guard.
 */
const STEPS: Record<GuideFixTarget, Record<GuideFault, readonly GuideFixStep[]>> = {
  chrome: {
    blocked: [
      {
        text: 'У блоці «Бажані мови» (Preferred languages) відкрийте меню з трьох крапок біля російської.',
      },
      { text: 'Виберіть «Видалити» (Remove).' },
    ],
    absent: [
      { text: '«Додати мови» (Add languages) — додайте українську та англійську.' },
      {
        text: 'Біля української відкрийте меню з трьох крапок і виберіть «Перемістити на початок» (Move to the top).',
      },
    ],
    notFirst: [
      { text: 'Біля української відкрийте меню з трьох крапок.' },
      { text: 'Виберіть «Перемістити на початок» (Move to the top).' },
    ],
  },
  'chrome-android': {
    blocked: [
      { text: 'Меню з трьох крапок → «Налаштування» (Settings) → «Мови» (Languages).' },
      { text: 'У меню біля російської виберіть «Видалити» (Remove).' },
    ],
    absent: [
      { text: 'Меню з трьох крапок → «Налаштування» (Settings) → «Мови» (Languages).' },
      { text: '«Додати мову» (Add language) — додайте українську та англійську.' },
      { text: 'Утримайте пункт списку й перетягніть українську на перше місце.' },
    ],
    notFirst: [
      { text: 'Меню з трьох крапок → «Налаштування» (Settings) → «Мови» (Languages).' },
      {
        text: 'Утримайте пункт списку й перетягніть українську на перше місце — порядок тут задають перетягуванням, а не пунктом меню.',
      },
    ],
  },
  edge: {
    blocked: [
      {
        text: 'У блоці «Бажані мови» (Preferred languages) відкрийте меню з трьох крапок біля російської.',
      },
      { text: 'Виберіть видалення.' },
    ],
    absent: [
      { text: '«Додати мови» (Add languages) — додайте українську та англійську.' },
      { text: 'У меню біля української виберіть дію, яка піднімає мову на початок.' },
    ],
    notFirst: [
      {
        text: 'У меню з трьох крапок біля української виберіть дію, яка піднімає мову на початок.',
      },
    ],
  },
  firefox: {
    blocked: [
      { text: 'Розділ «Мова» → у рядку про показ сторінок натисніть «Вибрати…» (Choose…).' },
      { text: 'У діалозі виберіть російську й натисніть «Вилучити» (Remove).' },
    ],
    absent: [
      { text: 'Розділ «Мова» → «Вибрати…» (Choose…) у рядку про показ сторінок.' },
      {
        text: 'Додайте українську та англійську, кнопкою «Вгору» (Move Up) поставте українську першою.',
      },
    ],
    notFirst: [
      { text: 'Розділ «Мова» → «Вибрати…» (Choose…).' },
      { text: 'Кнопками «Вгору» / «Вниз» (Move Up / Move Down) поставте українську першою.' },
    ],
  },
  macos: {
    blocked: [
      { text: 'Меню Apple → «Системні параметри» → «Загальні» → «Мова й регіон».' },
      { text: 'Виберіть російську й натисніть «−» під списком «Пріоритетні мови».' },
      { text: 'Перезапустіть браузер, щоб зміна підхопилася.' },
    ],
    absent: [
      { text: 'Меню Apple → «Системні параметри» → «Загальні» → «Мова й регіон».' },
      { text: 'Кнопкою «+» додайте українську та англійську.' },
      { text: 'Перетягніть українську на початок списку «Пріоритетні мови».' },
    ],
    notFirst: [
      { text: 'Меню Apple → «Системні параметри» → «Загальні» → «Мова й регіон».' },
      { text: 'Перетягніть українську на початок списку «Пріоритетні мови».' },
      { text: 'Перезапустіть браузер.' },
    ],
  },
  windows: {
    blocked: [
      {
        text: '«Параметри» (Settings) → «Час і мова» (Time & language) → «Мова й регіон» (Language & region).',
      },
      { text: 'Кнопка з трьома крапками біля російської → «Видалити» (Remove) → «Так» (Yes).' },
    ],
    absent: [
      {
        text: '«Параметри» (Settings) → «Час і мова» (Time & language) → «Мова й регіон» (Language & region).',
      },
      { text: '«Додати мову» (Add a language) — додайте українську та англійську.' },
      { text: 'У списку «Пріоритетні мови» поставте українську першою, англійську другою.' },
    ],
    notFirst: [
      {
        text: '«Параметри» (Settings) → «Час і мова» (Time & language) → «Мова й регіон» (Language & region).',
      },
      { text: 'У списку «Пріоритетні мови» поставте українську першою, англійську другою.' },
    ],
  },
  ios: {
    blocked: [
      {
        text: '«Параметри» (Settings) → «Загальні» (General) → «Мова і регіон» (Language & Region).',
      },
      { text: 'Приберіть російську з переліку «Бажаний порядок мов».' },
    ],
    absent: [
      {
        text: '«Параметри» (Settings) → «Загальні» (General) → «Мова і регіон» (Language & Region).',
      },
      { text: '«Мова для iPhone» (iPhone Language) → українська.' },
      {
        text: '«Додати мову» (Add Language) → English; коли система запитає, лишіть основною українську.',
      },
    ],
    notFirst: [
      {
        text: '«Параметри» (Settings) → «Загальні» (General) → «Мова і регіон» (Language & Region).',
      },
      {
        text: '«Мова для iPhone» (iPhone Language) → українська, щоб вона стала першою в переліку.',
      },
    ],
  },
  android: {
    blocked: [
      { text: '«Налаштування» (Settings) → «Система» (System) → «Мови» (Languages).' },
      {
        text: 'Меню з трьох крапок → «Видалити» (Remove) → позначте російську → «Видалити» (Delete).',
      },
    ],
    absent: [
      { text: '«Налаштування» (Settings) → «Система» (System) → «Мови» (Languages).' },
      { text: '«Додати мову» (Add a language) — додайте українську та англійську.' },
      { text: 'Перетягніть українську на перший рядок, англійську на другий.' },
    ],
    notFirst: [
      { text: '«Налаштування» (Settings) → «Система» (System) → «Мови» (Languages).' },
      { text: 'Перетягніть українську на перший рядок.' },
    ],
  },
};

/**
 * The vendor gotcha worth repeating inside the widget, per surface and fault.
 *
 * Only where there is one — an empty entry renders nothing rather than a box
 * with filler in it.
 */
const TRAPS: Partial<Record<GuideFixTarget, Partial<Record<GuideFault, string>>>> = {
  chrome: {
    blocked:
      'Видалити, а не опустити нижче. Рядок у списку — не позначка «я знаю цю мову», а дозвіл віддати вам сторінку саме нею.',
  },
  'chrome-android': {
    notFirst:
      'Порядок тут задають перетягуванням, а не пунктом меню. Починаючи з Android 13 система має ще й власну мову для окремої програми — перевірте «Програми» → Chrome → «Мова».',
    blocked:
      'Список у Chrome власний, окремий від системного: почистити мови в Android недостатньо.',
  },
  edge: {
    blocked:
      'Список у Edge власний, окремий від системного: почистити мови у Windows недостатньо — Edge читає свій.',
    absent:
      'Microsoft формулює правило прямо: сайт відкривається першою мовою зі списку, яку він підтримує.',
    notFirst:
      'Переклад теж цілиться в першу мову списку — поки нагорі не українська, обидва механізми віддають не те, що заявлено.',
  },
  firefox: {
    blocked:
      'Два контролі виглядають як один блок. Випадний список угорі змінює лише меню Firefox; сайти бачать тільки список із діалогу внизу.',
    absent:
      'Перевірити результат можна напряму: у about:config параметр intl.accept_languages показує той самий список рядком.',
  },
  macos: {
    blocked:
      'У Safari немає власного списку мов — його задає система. Цей самий список читають і програми macOS, тож російську тут прибирають, а не опускають нижче.',
    notFirst:
      'Safari передає сайтам лише верхній рядок списку, тож тут «не перша» означає «її немає».',
  },
  windows: {
    blocked:
      'Кнопка «Видалити» неактивна, поки мова, яку ви прибираєте, є мовою інтерфейсу Windows. Спершу перемкніть інтерфейс на українську, вийдіть із системи й увійдіть знову.',
  },
  ios: {
    blocked:
      'Додавання клавіатури автоматично додає її мову назад до цього переліку, а видалення клавіатури мову не забирає. Після кожної зміни клавіатур відкривайте «Мова і регіон» і дивіться на сам список.',
    notFirst:
      'Це налаштування — уся історія для будь-якого браузера на iOS: Chrome, Edge і Firefox там працюють на WebKit і читають той самий список.',
  },
  android: {
    blocked:
      'Приберіть, а не опустіть нижче: застосунок, який не має української, знайде російську і в кінці списку.',
    absent:
      'Gboard тримає власний перелік мов, незалежний від системного — чистий системний список нічого не каже про клавіатуру.',
  },
};

/**
 * The fix for one fault on one surface.
 *
 * The settings address, where the platform has one, rides step 01 rather than
 * sitting in a box of its own: browsers block page-initiated navigation to
 * `chrome://` and `about:`, so it can never be a link, and an address with no
 * instruction beside it does not tell the reader to paste it anywhere.
 */
export function guideFix(target: GuideFixTarget, fault: GuideFault): GuideFix {
  const address = ADDRESSES[target];
  const steps = STEPS[target][fault];

  return {
    label: TARGET_LABELS[target],
    steps: address === undefined ? steps : [{ text: PASTE, address }, ...steps],
    trap: TRAPS[target]?.[fault],
    guideId: GUIDE_PAGES[target].id,
    guideLabel: GUIDE_PAGES[target].label,
    mockup: MOCKUPS[target],
  };
}

/* -------------------------------------------------------------------------- */
/* Copy                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Everything the widget says.
 *
 * Read `docs/copy.md` §1.7 before editing any of it: the subject of a fault is
 * the list, the setting or the site, never the reader.
 */
export const diagnosisStrings = {
  /** Section label. Literally true of all three fields below — a site reads the
   *  browser and OS from the user agent and the languages from what the browser
   *  adds to every request. */
  heading: 'Що бачать сайти',
  privacy: 'Ці дані визначено на вашому пристрої. Мовар їх не бачить.',
  browserLabel: 'Ваш браузер',
  systemLabel: 'Ваша операційна система',
  unknownValue: UNKNOWN,
  languagesLabel: 'Сайти бачать ці мови як пріоритетні',
  languagesLabelUnavailable: 'Пріоритетні мови',
  languagesEmpty: 'браузер не каже',
  /** Right-hand side of the count strip: instructions rot, so they carry a date. */
  stepsUpdated: 'Кроки оновлено',
  /** The address control. Not a link — browsers block navigation to chrome://
   *  and about: from a page, so pasting is the only thing that works. */
  copy: 'Копіювати',
  copied: 'Скопійовано',

  /** Leading sentence of every explanation but the no-data one. */
  lead: 'Кожен сайт обирає з цього списку найвищу мову, яку він підтримує. ',
  explain: {
    blockedAndAbsent:
      'У списку є російська й немає української, тож сайт, який має обидві версії, віддасть російську.',
    /* Both faults, but Ukrainian IS in the list — so this cannot borrow either
     * single-fault sentence: `blocked` claims Ukrainian is first, and `notFirst`
     * never mentions Russian at all. */
    blockedAndNotFirst:
      'Українська в списку є, але не першою — і поки в ньому лишається російська, сайт без української версії візьме саме її.',
    blocked:
      'Українська стоїть першою, але поки в списку є російська, сайт без української версії візьме саме її.',
    notFirst: 'Українська в списку є, але не першою — тож сайти віддаватимуть те, що вище.',
    absent:
      'Української в списку немає, тож вибір робить сайт: за регіоном, за IP, або просто англійською.',
    clear:
      'Українська стоїть першою, російської в списку немає — тож сайт з українською версією віддасть саме її.',
    unavailable:
      'Зазвичай тут видно список, з якого кожен сайт обирає версію сторінки. Ваш браузер його не показує — так навмисне поводяться приватні вікна і Safari.',
  },
  /** Appended where the platform sends only the first entry. */
  firstOnly:
    ' Safari до того ж передає сайтам лише перший рядок списку, тож другої мови для них не існує.',

  count: {
    clear: 'Усе гаразд',
    unavailable: 'Немає даних',
    /** `{n}` is substituted in all three. Ukrainian needs three plural forms,
     *  and the `one` form is NOT always the number 1 — 21 and 101 take it too. */
    one: '{n} проблема',
    few: '{n} проблеми',
    many: '{n} проблем',
  },

  faults: {
    blocked: {
      title: 'Російська в списку запитуваних мов',
      body: 'Сайт, який має російську версію й не має української, віддасть саме її — навіть якщо російська стоїть у самому кінці списку.',
    },
    absent: {
      title: 'Української немає в списку запитуваних мов',
      body: 'Поки її немає в списку, сайти обиратимуть мову самі — за регіоном, за IP, або просто англійську.',
    },
    notFirst: {
      /** `{rank}` and `{total}` are substituted. */
      title: 'Українська не перша — вона {rank}-ша з {total}',
      body: 'Сайт бере найвищу мову, яку підтримує. Поки вище стоїть інша мова, сайти віддаватимуть її.',
    },
  },

  clear: {
    title: 'Проблем немає',
    body: 'Українська перша, російської в списку немає. Далі залежить уже не від налаштувань, а від того, чи сайт послухає — і саме цю частину бере на себе Мовар.',
  },

  /**
   * The strip that closes the card, under whatever verdict it reached.
   *
   * It is the one place on the hub where the extension is allowed to speak,
   * and it earns that here rather than 6000px lower because this is where the
   * reader has just been handed a verdict about their own browser — the whole
   * page's peak attention. The argument only works in that order: the fixes
   * above are the reader's half, and this is where their half runs out.
   *
   * Worded to hold under all three verdicts, including «Проблем немає» — a
   * clean list is the *strongest* version of the claim, not an exception to it,
   * because a site is free to ignore a perfect list too. So no wording here may
   * count faults or assume there are any.
   *
   * Every claim is one the guide already makes elsewhere in these words: the
   * header-as-request and the mislabelled Russian text come from
   * `guideStrings.limits`, the switch and the local-only reckoning from
   * `guideStrings.cta`. Keep it that way — this is a marketing surface on a
   * page whose credibility is the product.
   */
  beyond: {
    label: 'Чого не полагодити налаштуваннями',
    heading: 'Сайт може проігнорувати ваш список',
    body: 'Заголовок, який надсилає браузер, — це прохання, а не команда: сайт може віддати російський текст, підписавши його як українську. Мовар бере на себе саме цю частину — знаходить українську версію, яка вже існує, і перемикає на неї. Усе рахується у вашому браузері.',
  },

  unavailable: {
    title: 'Перевірити звідси не вийде',
    body: 'Приватні вікна і Safari навмисне ховають список мов від сторінки. Це не помилка — але означає, що подивитися доведеться в самих налаштуваннях.',
    step: 'Відкрийте список мов і звірте його з цільовим станом: українська перша, англійська друга, російської немає.',
    guideLabel: 'Як подивитися список вручну →',
  },

  /** Shown when the user agent names no surface this table knows. */
  unknownTarget: {
    label: 'Де це виправити',
    body: 'Відкрийте список мов свого браузера або системи й приведіть його до цільового стану: українська перша, англійська друга, російської немає.',
    guideLabel: 'Усі інструкції →',
  },
} as const;

/**
 * Ukrainian plural for the problem count.
 *
 * The widget can only ever show 1 or 2, so the wider rule is defensive rather
 * than load-bearing — but it is the same rule the hub's page count needs, and
 * a second copy is how the two stop agreeing. See `pluralForm` in `./guide`.
 */
export function faultCountLabel(count: number): string {
  const { one, few, many } = diagnosisStrings.count;
  const form = pluralForm(count);
  const template = { one, few, many }[form];

  return template.replace('{n}', String(count));
}
