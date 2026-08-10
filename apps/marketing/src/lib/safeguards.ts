/**
 * The structural safeguards behind "Movar can't quietly start spying on you" —
 * the single most common worry about any browser extension, and the one thing
 * the machine-verified promises on `/transparency` can't answer on their own.
 * A promise check proves what the code does *today*; these are the reasons a
 * *future* version couldn't change that without you finding out.
 *
 * Ids and their citations live here rather than in `i18n.ts` for two reasons:
 *
 *  1. the copy is localized, the evidence isn't — a uk/en pair that drifted on
 *     which vendor doc backs a claim would be a factual divergence, not a
 *     translation choice;
 *  2. every claim on this list is a claim about somebody else's platform
 *     (Chrome, Firefox, Apple) or about this repo's own tooling, so each one
 *     ships with the primary source a sceptical reader can check.
 *
 * `label` stays English on both locales: these are the titles of English-only
 * vendor documents, and translating a document's title makes it harder, not
 * easier, to confirm you landed on the right page.
 */

/** Render order of the safeguard cards on `/transparency`. */
export const SAFEGUARD_IDS = [
  'openSource',
  'permissions',
  'permissionChange',
  'storeReview',
  'buildCheck',
  'noRemoteCode',
] as const;

export type SafeguardId = (typeof SAFEGUARD_IDS)[number];

export interface SafeguardSource {
  /** The document's own title — kept English; see the module note. */
  label: string;
  href: string;
}

/** Primary sources backing each safeguard, in the order they're cited. */
export const SAFEGUARD_SOURCES: Record<SafeguardId, readonly SafeguardSource[]> = {
  openSource: [
    {
      label: 'Movar on GitHub',
      href: 'https://github.com/rejifald/movar',
    },
    {
      label: 'Mozilla — Source code submission',
      href: 'https://extensionworkshop.com/documentation/publish/source-code-submission/',
    },
  ],
  permissions: [
    {
      label: 'Chrome — declarativeNetRequest',
      href: 'https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest',
    },
    {
      label: 'Movar’s manifest',
      href: 'https://github.com/rejifald/movar/blob/main/apps/extension/wxt.config.ts',
    },
  ],
  permissionChange: [
    {
      label: 'Chrome — Permission warnings',
      href: 'https://developer.chrome.com/docs/extensions/develop/concepts/permission-warnings',
    },
    {
      label: 'Mozilla — Request the right permissions',
      href: 'https://extensionworkshop.com/documentation/develop/request-the-right-permissions/',
    },
  ],
  storeReview: [
    {
      label: 'Chrome Web Store — Review process',
      href: 'https://developer.chrome.com/docs/webstore/review-process',
    },
    {
      label: 'Mozilla — Add-on policies',
      href: 'https://extensionworkshop.com/documentation/publish/add-on-policies/',
    },
    {
      label: 'Apple — App Review Guidelines',
      href: 'https://developer.apple.com/app-store/review/guidelines/',
    },
  ],
  buildCheck: [
    {
      label: 'The source scan — scripts/lib/promises.mts',
      href: 'https://github.com/rejifald/movar/blob/main/scripts/lib/promises.mts',
    },
    {
      label: 'The bundle scan — wxt.config.ts',
      href: 'https://github.com/rejifald/movar/blob/main/apps/extension/wxt.config.ts',
    },
  ],
  noRemoteCode: [
    {
      label: 'Chrome Web Store — Manifest V3 requirements',
      href: 'https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements',
    },
    {
      label: 'Mozilla — Firefox data-collection consent',
      href: 'https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/',
    },
  ],
};
