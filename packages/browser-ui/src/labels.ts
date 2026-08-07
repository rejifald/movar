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
  };
  readonly safari: {
    readonly extensions: string;
    readonly permissionSummary: string;
    readonly allowOnEveryWebsite: string;
  };
  readonly ios: {
    readonly allowExtensions: string;
    readonly allowInPrivate: string;
    readonly permissions: string;
    readonly allWebsites: string;
    readonly allow: string;
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
  },
  safari: {
    extensions: 'Extensions',
    permissionSummary: `${EXTENSION_NAME} can read and alter webpages on all websites.`,
    allowOnEveryWebsite: 'Allow on Every Website',
  },
  ios: {
    allowExtensions: 'Allow Extension',
    allowInPrivate: 'Allow in Private Browsing',
    permissions: 'PERMISSIONS',
    allWebsites: 'All Websites',
    allow: 'Allow',
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
  },
  safari: {
    extensions: 'Розширення',
    permissionSummary: `${EXTENSION_NAME} може читати й змінювати вебсторінки на всіх вебсайтах.`,
    allowOnEveryWebsite: 'Дозволити на кожному вебсайті',
  },
  ios: {
    allowExtensions: 'Дозволити розширення',
    allowInPrivate: 'Дозволити у приватному перегляді',
    permissions: 'ДОЗВОЛИ',
    allWebsites: 'Усі вебсайти',
    allow: 'Дозволити',
  },
};

const CATALOGUE: Record<BrowserUiLocale, BrowserUiLabels> = { en, uk };

/** The browser's own words in `locale`. */
export function labelsFor(locale: BrowserUiLocale): BrowserUiLabels {
  return CATALOGUE[locale];
}
