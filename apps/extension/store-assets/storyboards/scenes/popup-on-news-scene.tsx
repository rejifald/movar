import type { JSX } from 'react';

import { App } from '../../../src/entrypoints/popup/App';
import type { HiddenSummary } from '../../../src/lib/messaging';
import { NewsBackdropEN } from '../backdrops/news-en';
import { NewsBackdropUK } from '../backdrops/news-uk';
import {
  PortraitSinglePanelFrameWithFrame,
  TABLET_ASPECT,
} from '../backdrops/portrait-single-panel-frame';
import { enSettings, ukSettings } from '../stories/_seed';
import type { DeviceSize } from './portrait-diptych-scenes';

/**
 * Shared spec for the portrait popup-on-news scene (App Store #1) — the
 * real Movar popup (`App`) overlaid on a localised news article. The
 * iPhone + iPad stories share the headline copy, the per-locale browser
 * mock (settings + active-tab status the popup reads), and the render.
 *
 * The article is served in the user's language, so the popup hero reports
 * the all-clear "this page is in <language>" — mirrors the landscape
 * `popup-on-news` marketplace scene.
 */
function servedPage(pageLang: HiddenSummary['pageLang']): HiddenSummary {
  return {
    languages: [],
    containers: 0,
    feedCurtained: 0,
    feedHidden: 0,
    pageLang,
    userOverride: false,
  };
}

const HERO: Record<'en' | 'uk', { headline: string; subhead: string }> = {
  en: {
    headline: 'See the language of every page',
    subhead:
      "Movar's popup shows what language the page is in — and lets you switch or pause in one tap.",
  },
  uk: {
    headline: 'Бачте мову кожної сторінки',
    subhead:
      'Спливне вікно Movar показує мову сторінки — і дозволяє перемкнути чи призупинити одним дотиком.',
  },
};

/** Per-locale `browserMock` story parameter the popup reads its state from. */
export function popupBrowserMock(locale: 'en' | 'uk') {
  if (locale === 'en') {
    return {
      uiLanguage: 'en-US',
      storage: { sync: { settings: enSettings } },
      activeTab: { url: 'https://dnipropost.example/article', hidden: servedPage('en') },
    };
  }
  return {
    uiLanguage: 'uk',
    storage: { sync: { settings: ukSettings } },
    activeTab: { url: 'https://dnipropost.example/article', hidden: servedPage('uk') },
  };
}

export function renderPopupScene(size: DeviceSize, locale: 'en' | 'uk'): JSX.Element {
  const News = locale === 'en' ? NewsBackdropEN : NewsBackdropUK;
  const hero = HERO[locale];
  // Wide (iPad) canvases render the page at the tablet composition, so the news
  // backdrop switches to its full-width tablet layout; the narrow (iPhone)
  // overlay keeps the desktop layout at its native scale.
  const tablet = size.width / size.height > TABLET_ASPECT;
  return (
    <PortraitSinglePanelFrameWithFrame
      {...size}
      lang={locale}
      headline={hero.headline}
      subhead={hero.subhead}
      pageContent={<News tablet={tablet} />}
      popup={<App />}
    />
  );
}
