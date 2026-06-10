/**
 * electrica-shop.com.ua — Ukrainian e-com with a `cookie + hreflang` rule
 * in `packages/host-match`. RU canonical: `/`. UA canonical: `/ua/`.
 *
 * Movar's rule sets `lang=ua` cookie, then follows hreflang to `/ua/`.
 *
 * Picker filter: `<span class="ua-link">українською</span>` (active) +
 * `<a class="ru-link">по-русски</a>` + a `<span class="divider">&nbsp;</span>`
 * in between. After Movar runs, the RU anchor is hidden and the divider
 * is hidden as a "useless delimiter".
 */
import type { SiteFixture } from './types';

export const siteElectricaShop: SiteFixture = {
  id: 'electrica-shop-com-ua',
  label: 'electrica-shop.com.ua (rule: cookie + hreflang)',
  kind: 'site',
  startUrl: 'https://electrica-shop.com.ua/',
  hostname: 'electrica-shop.com.ua',
  extraHeaders: { 'Accept-Language': 'ru-RU,ru;q=0.9' },
  // The rule's own switch knob: setting lang=ua takes us to UA, so its
  // inverse (lang=ru) reliably puts us in RU. Without this, the site
  // geolocates UA visitors to /ua/ regardless of Accept-Language, and the
  // baseline assertion can't observe the RU starting state Movar exists
  // to fix.
  preCookies: [{ name: 'lang', value: 'ru', domain: 'electrica-shop.com.ua' }],
  initial: {
    htmlLangPrefix: ['ru', 'uk-UA', 'uk'],
    bodyDetected: ['ru', 'uk'],
  },
  afterMovar: {
    url: /^https:\/\/electrica-shop\.com\.ua\/ua\//,
    htmlLangPrefix: ['uk'],
    bodyDetected: 'uk',
    minHiddenLinks: 1,
    hiddenSelectors: ['#header-languages a.ru-link'],
    visibleSelectors: ['#header-languages .ua-link'],
  },
  correction: {
    fromLang: 'ru',
    toLang: 'uk',
    mechanism: ['cookie', 'redirect'], // compound — head is cookie; hreflang follow is redirect
  },
};
