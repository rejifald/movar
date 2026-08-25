/*
 * The words the real browser UI puts on screen.
 *
 * These are *not* Movar's copy — they're facsimiles of Chrome's, Firefox's,
 * Safari's and iOS's own shipped strings, which is why they live here and not
 * in `@movar/i18n` or the marketing site's `i18n.ts`. Those catalogues are
 * things Movar says; this one is what the browser says.
 *
 * ## Which locale a visitor actually sees
 *
 * The mockup renders in the *page's* locale (uk on /uk/install, uk in the
 * extension when the UI language is Ukrainian), not the browser's. Those agree
 * for most visitors and disagree for some — someone reading the Ukrainian page
 * in an English-locale Chrome will see English words in their real toolbar.
 * That's an accepted trade: the illustration is a decorative aid and the step
 * body beside it carries the authoritative instruction. It replaced an earlier
 * text-free design whose neutrality cost it all its recognisability.
 *
 * ## Accuracy
 *
 * The Ukrainian Chrome strings ("На всіх сайтах", "Коли ви натискаєте
 * розширення", "На певних сайтах", "Додати розширення", "Закріпити") are taken
 * from Google's own Ukrainian Chrome documentation. The remaining Ukrainian
 * strings follow each vendor's house style for the same phrase and are
 * close-but-not-guaranteed transcriptions of the shipped builds. Correct one
 * freely against a real screenshot — nothing derives from these but the
 * mockups.
 *
 * The language-settings-panel strings added alongside the install-walkthrough
 * ones follow the same rule, with one difference: their Ukrainian carries over
 * verbatim from `apps/marketing/src/lib/guide-diagnosis.ts`, which already
 * quotes the exact panel words inline in its step prose (e.g. "натисніть
 * «Вилучити» (Remove)"). That prose is the more-visible surface, so it is the
 * source of truth here rather than a second, possibly-drifted copy.
 */

/** UI locales both consuming surfaces render in. */
export type BrowserUiLocale = 'en' | 'uk';

/** The example host Chrome's per-site option names. A real Chrome shows the
 *  current tab's host; ours shows Movar's, so the mockup is legible without
 *  implying anything about where the visitor is. */
export const EXAMPLE_HOST = 'movar.fyi';

/**
 * The name the browser shows for the extension, in every locale.
 *
 * Deliberately not localised: the browser reads it from the manifest's
 * `__MSG_extName__`, and both `_locales/en` and `_locales/uk` set that to the
 * Latin "Movar" (apps/extension/src/public/_locales). A mockup showing "Мовар"
 * in a Ukrainian extension list would be showing something a visitor will never
 * see — the marketing site's uk `<title>` transliterates the brand, the
 * manifest does not.
 */
export const EXTENSION_NAME = 'Movar';

export interface BrowserUiLabels {
  readonly chrome: {
    readonly addTitle: string;
    readonly itCan: string;
    readonly permission: string;
    readonly cancel: string;
    readonly addExtension: string;
    readonly extensions: string;
    readonly pin: string;
    readonly siteAccess: string;
    readonly onClick: string;
    readonly onSpecificSites: string;
    readonly onAllSites: string;
    readonly manageExtensions: string;
    // chrome://settings/languages — the language-list mockup family.
    readonly preferredLanguages: string;
    readonly addLanguages: string;
    readonly moveToTheTop: string;
    readonly remove: string;
  };
  readonly firefox: {
    readonly addTitle: string;
    readonly itRequires: string;
    readonly permission: string;
    readonly cancel: string;
    readonly add: string;
    readonly extensions: string;
    readonly pin: string;
    readonly details: string;
    readonly permissions: string;
    readonly allSitesPermission: string;
    // The "Choose your preferred language for displaying pages" dialog. Its
    // own "Add" button reuses `add` above — same word, same dialog family.
    readonly chooseLanguageTitle: string;
    readonly moveUp: string;
    readonly moveDown: string;
    readonly remove: string;
    readonly selectLanguageToAdd: string;
  };
  readonly safari: {
    readonly extensions: string;
    readonly permissionSummary: string;
    readonly allowOnEveryWebsite: string;
  };
  /** System Settings → General → Language & Region — not Safari, which is why
   *  this is its own section rather than a `safari` addition: the pane belongs
   *  to macOS itself, and every app on the machine (Safari included) reads the
   *  list it draws. */
  readonly macos: {
    readonly languageRegion: string;
    readonly preferredLanguages: string;
  };
  readonly ios: {
    /** The screen this one pushed from — drawn as the nav bar's back item. */
    readonly extensions: string;
    readonly allowExtensions: string;
    readonly allowInPrivate: string;
    readonly permissions: string;
    readonly allWebsites: string;
    readonly allow: string;
    /** iOS renders this as the PERMISSIONS section's footnote. Reuses the
     *  sentence already vetted for the macOS pane rather than minting a second
     *  claim; a close-but-unverified transcription, per the note above. */
    readonly permissionsFooter: string;
    // Settings → General → Language & Region — the other screen this package
    // draws for iOS, unrelated to the Safari-extension screens above.
    /** Back item for *this* screen's nav bar — "General", not "Extensions". */
    readonly general: string;
    readonly languageAndRegion: string;
    readonly iPhoneLanguage: string;
    readonly preferredLanguageOrder: string;
    readonly addLanguage: string;
  };
  /** Settings → Time & language → Language & region. Windows has no other
   *  mockup in this package, so unlike `ios` this section only ever holds
   *  these strings. */
  readonly windows: {
    readonly preferredLanguages: string;
    readonly addALanguage: string;
    readonly remove: string;
  };
  /** Settings → System → Languages. */
  readonly android: {
    readonly languages: string;
    readonly addALanguage: string;
  };
}

const en: BrowserUiLabels = {
  chrome: {
    addTitle: `Add “${EXTENSION_NAME}”?`,
    itCan: 'It can:',
    permission: 'Read and change all your data on the websites you visit',
    cancel: 'Cancel',
    addExtension: 'Add extension',
    extensions: 'Extensions',
    pin: 'Pin',
    siteAccess: 'This can read and change site data',
    onClick: 'When you click the extension',
    onSpecificSites: `On ${EXAMPLE_HOST}`,
    onAllSites: 'On all sites',
    manageExtensions: 'Manage extensions',
    preferredLanguages: 'Preferred languages',
    addLanguages: 'Add languages',
    moveToTheTop: 'Move to the top',
    remove: 'Remove',
  },
  firefox: {
    addTitle: `Add ${EXTENSION_NAME}?`,
    itRequires: 'It requires your permission to:',
    permission: 'Access your data for all websites',
    cancel: 'Cancel',
    add: 'Add',
    extensions: 'Extensions',
    pin: 'Pin to Toolbar',
    details: 'Details',
    permissions: 'Permissions',
    allSitesPermission: 'Access your data for all websites',
    chooseLanguageTitle: 'Choose your preferred language for displaying pages',
    moveUp: 'Move Up',
    moveDown: 'Move Down',
    remove: 'Remove',
    selectLanguageToAdd: 'Select a language to add…',
  },
  safari: {
    extensions: 'Extensions',
    permissionSummary: `${EXTENSION_NAME} can read and alter webpages on all websites.`,
    allowOnEveryWebsite: 'Allow on Every Website',
  },
  macos: {
    languageRegion: 'Language & Region',
    preferredLanguages: 'Preferred Languages',
  },
  ios: {
    extensions: 'Extensions',
    allowExtensions: 'Allow Extension',
    allowInPrivate: 'Allow in Private Browsing',
    permissions: 'PERMISSIONS',
    allWebsites: 'All Websites',
    allow: 'Allow',
    permissionsFooter: `${EXTENSION_NAME} can read and alter webpages on all websites.`,
    general: 'General',
    languageAndRegion: 'Language & Region',
    iPhoneLanguage: 'iPhone Language',
    preferredLanguageOrder: 'PREFERRED LANGUAGE ORDER',
    addLanguage: 'Add Language',
  },
  windows: {
    preferredLanguages: 'Preferred languages',
    addALanguage: 'Add a language',
    remove: 'Remove',
  },
  android: {
    languages: 'Languages',
    addALanguage: 'Add a language',
  },
};

const uk: BrowserUiLabels = {
  chrome: {
    addTitle: `Додати “${EXTENSION_NAME}”?`,
    itCan: 'Це розширення може:',
    permission: 'Читати й змінювати всі ваші дані на вебсайтах, які ви відвідуєте',
    cancel: 'Скасувати',
    addExtension: 'Додати розширення',
    extensions: 'Розширення',
    pin: 'Закріпити',
    siteAccess: 'Може читати й змінювати дані сайту',
    onClick: 'Коли ви натискаєте розширення',
    onSpecificSites: `На сайті ${EXAMPLE_HOST}`,
    onAllSites: 'На всіх сайтах',
    manageExtensions: 'Керувати розширеннями',
    // Quoted verbatim in apps/marketing/src/lib/guide-diagnosis.ts's own step
    // prose (e.g. «У блоці «Бажані мови» (Preferred languages)»), which is why
    // these read slightly differently in style from the rest of this object.
    preferredLanguages: 'Бажані мови',
    addLanguages: 'Додати мови',
    moveToTheTop: 'Перемістити на початок',
    remove: 'Видалити',
  },
  firefox: {
    addTitle: `Додати ${EXTENSION_NAME}?`,
    itRequires: 'Йому потрібен ваш дозвіл на:',
    permission: 'Доступ до ваших даних для всіх вебсайтів',
    cancel: 'Скасувати',
    add: 'Додати',
    extensions: 'Розширення',
    pin: 'Закріпити на панелі',
    details: 'Подробиці',
    permissions: 'Дозволи',
    allSitesPermission: 'Доступ до ваших даних для всіх вебсайтів',
    chooseLanguageTitle: 'Виберіть потрібну мову для показу сторінок',
    moveUp: 'Вгору',
    moveDown: 'Вниз',
    remove: 'Вилучити',
    selectLanguageToAdd: 'Виберіть мову, яку потрібно додати…',
  },
  safari: {
    extensions: 'Розширення',
    permissionSummary: `${EXTENSION_NAME} може читати й змінювати вебсторінки на всіх вебсайтах.`,
    allowOnEveryWebsite: 'Дозволити на кожному вебсайті',
  },
  macos: {
    languageRegion: 'Мова й регіон',
    preferredLanguages: 'Пріоритетні мови',
  },
  ios: {
    extensions: 'Розширення',
    allowExtensions: 'Дозволити розширення',
    allowInPrivate: 'Дозволити у приватному перегляді',
    permissions: 'ДОЗВОЛИ',
    allWebsites: 'Усі вебсайти',
    allow: 'Дозволити',
    permissionsFooter: `${EXTENSION_NAME} може читати й змінювати вебсторінки на всіх вебсайтах.`,
    general: 'Загальні',
    languageAndRegion: 'Мова і регіон',
    iPhoneLanguage: 'Мова для iPhone',
    preferredLanguageOrder: 'БАЖАНИЙ ПОРЯДОК МОВ',
    addLanguage: 'Додати мову',
  },
  windows: {
    preferredLanguages: 'Пріоритетні мови',
    addALanguage: 'Додати мову',
    remove: 'Видалити',
  },
  android: {
    languages: 'Мови',
    addALanguage: 'Додати мову',
  },
};

const CATALOGUE: Record<BrowserUiLocale, BrowserUiLabels> = { en, uk };

/** The browser's own words in `locale`. */
export function labelsFor(locale: BrowserUiLocale): BrowserUiLabels {
  return CATALOGUE[locale];
}
