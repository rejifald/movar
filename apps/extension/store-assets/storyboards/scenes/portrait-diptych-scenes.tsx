import type { JSX, ReactNode } from 'react';

import {
  PortraitBeforeAfterFrameWithFrame,
  type PortraitHalfProps,
} from '../backdrops/portrait-before-after-frame';
import { YouTubeFrame } from '../backdrops/youtube-frame';
import {
  YT_CHIPS,
  YT_QUERY,
  YouTubeWithoutVideos,
  youtubeUrlBar,
} from '../backdrops/youtube-without-movar';
import { YouTubeWithVideos } from '../backdrops/youtube-with-movar';
import { ShopFrame } from '../backdrops/shop-frame';
import { SHOP_WITHOUT_CONTENT, shopWithoutUrlBar } from '../backdrops/shop-without-movar';
import { SHOP_WITH_CONTENT, shopWithUrlBar } from '../backdrops/shop-with-movar';
import { SiteBackdropEN } from '../backdrops/site-en';
import { SiteBackdropRU } from '../backdrops/site-ru';
import { SiteBackdropUK } from '../backdrops/site-uk';
import { GoogleGodOfWarWithMovarContent } from '../backdrops/google-god-of-war-with-movar';
import { GoogleGodOfWarWithoutMovarContent } from '../backdrops/google-god-of-war-without-movar';
import { GoogleSerpFrame, GoogleSerpResult } from '../backdrops/google-serp-frame';
import { VoyaBackdrop, VOYA_URL, buildBlockedVoyaContent } from '../backdrops/voya-frame';
import { VoyaBackdropEN } from '../backdrops/voya-en';
import { VoyaBackdropUK } from '../backdrops/voya-uk';

/**
 * Shared specs for the **portrait** (iOS / iPadOS) before/after App Store
 * screenshots. Each scene reuses the SAME backdrop components the
 * landscape marketplace + marketing diptychs use, so there is one source
 * of truth for the actual content; only the surrounding frame and the
 * marketing headline differ between surfaces.
 *
 * A thin `*.ios.stories.tsx` / `*.ipad.stories.tsx` pair per scene feeds
 * the matching device size into `renderScene`; the spec (headline, labels,
 * URL bars, before/after backdrops) is identical across both sizes.
 *
 * search-rewrite is the one scene whose content is not yet a shared
 * backdrop (its SERP result lists are inline in its own story); it keeps
 * its self-contained story for now.
 */
export const IPHONE_69 = { width: 1320, height: 2868 } as const;
export const IPAD_13 = { width: 2048, height: 2732 } as const;
export type DeviceSize = typeof IPHONE_69 | typeof IPAD_13;

/** One locale's worth of a portrait before/after scene. */
export interface PortraitSceneLocale {
  headline: string;
  subhead: string;
  before: Pick<PortraitHalfProps, 'label' | 'urlBar' | 'content'>;
  after: Pick<PortraitHalfProps, 'label' | 'urlBar' | 'content'>;
}

export interface PortraitScene {
  /** Stable screenshot index → `{NN}-slug.png`. Mirrors the landscape scene. */
  index: number;
  /** Capture a `-dark` sibling too (the website scenes). */
  darkVariant: boolean;
  /** English locale spec — absent for UK-only scenes (knowledge-panel). */
  en?: PortraitSceneLocale;
  uk: PortraitSceneLocale;
}

/** Render a portrait before/after scene at the given device size. The
 *  locale spec is resolved from the scene; throws if the scene has no
 *  spec for `lang` (e.g. asking knowledge-panel for English). */
export function renderScene(
  size: DeviceSize,
  lang: 'en' | 'uk',
  scene: PortraitScene,
): JSX.Element {
  const sl = lang === 'en' ? scene.en : scene.uk;
  if (!sl) {
    throw new Error(`Portrait scene #${scene.index} has no "${lang}" locale spec.`);
  }
  return (
    <PortraitBeforeAfterFrameWithFrame
      {...size}
      lang={lang}
      headline={sl.headline}
      subhead={sl.subhead}
      before={{ ...sl.before, variant: 'before' }}
      after={{ ...sl.after, variant: 'after' }}
    />
  );
}

// ── Scene #2 — site-language correction ──────────────────────────────
const siteBefore = (label: string): PortraitSceneLocale['before'] => ({
  label,
  urlBar: <>tochka24.example</>,
  content: <SiteBackdropRU />,
});

export const CORRECTION: PortraitScene = {
  index: 2,
  darkVariant: false,
  en: {
    headline: 'Sites in the language you read',
    subhead: 'When a site defaults to Russian, Movar flips it to your language — same URL.',
    before: siteBefore('Before Movar'),
    after: { label: 'After Movar', urlBar: <>tochka24.example</>, content: <SiteBackdropEN /> },
  },
  uk: {
    headline: 'Сайти вашою мовою',
    subhead:
      'Коли сайт відкривається російською, Movar перемикає його на українську — той самий домен.',
    before: siteBefore('До Movar'),
    after: { label: 'Після Movar', urlBar: <>tochka24.example</>, content: <SiteBackdropUK /> },
  },
};

// ── Scene #5 — Google knowledge panel (UK-only) ──────────────────────
export const KNOWLEDGE: PortraitScene = {
  index: 5,
  darkVariant: true,
  uk: {
    headline: 'Google українською',
    subhead: 'Картка знань і результати — українською, а не англійською за замовчуванням.',
    before: {
      label: 'До Movar',
      urlBar: <>google.com.ua/search?q=God+of+War</>,
      content: <GoogleGodOfWarWithoutMovarContent />,
    },
    after: {
      label: 'Після Movar',
      urlBar: (
        <>
          …/search?q=God+of+War&amp;<mark>hl=uk</mark>&amp;<mark>lr=lang_uk</mark>
        </>
      ),
      content: <GoogleGodOfWarWithMovarContent />,
    },
  },
};

// ── Scene #6 — YouTube recommendations ───────────────────────────────
function ytFrame(videos: ReactNode): JSX.Element {
  return (
    <YouTubeFrame lang="uk" query={YT_QUERY} chips={YT_CHIPS} hideChrome>
      {videos}
    </YouTubeFrame>
  );
}

export const YOUTUBE: PortraitScene = {
  index: 6,
  darkVariant: true,
  en: {
    headline: 'YouTube in the language you watch',
    subhead: 'Movar steers recommendations to creators in your language — not Russian.',
    before: {
      label: 'Before Movar',
      urlBar: youtubeUrlBar(),
      content: ytFrame(YouTubeWithoutVideos()),
    },
    after: { label: 'After Movar', urlBar: youtubeUrlBar(), content: ytFrame(YouTubeWithVideos()) },
  },
  uk: {
    headline: 'YouTube вашою мовою',
    subhead: 'Movar виводить нагору авторів вашою мовою, а не російською.',
    before: {
      label: 'До Movar',
      urlBar: youtubeUrlBar(),
      content: ytFrame(YouTubeWithoutVideos()),
    },
    after: { label: 'Після Movar', urlBar: youtubeUrlBar(), content: ytFrame(YouTubeWithVideos()) },
  },
};

// ── Scene #7 — Ukrainian online shop ─────────────────────────────────
const shopBefore = (label: string): PortraitSceneLocale['before'] => ({
  label,
  urlBar: shopWithoutUrlBar(),
  content: <ShopFrame lang="ru" hideChrome content={SHOP_WITHOUT_CONTENT} />,
});
const shopAfter = (label: string): PortraitSceneLocale['after'] => ({
  label,
  urlBar: shopWithUrlBar(),
  content: <ShopFrame lang="uk" hideChrome content={SHOP_WITH_CONTENT} />,
});

export const SHOP: PortraitScene = {
  index: 7,
  darkVariant: true,
  en: {
    headline: 'Shops open in your language',
    subhead: 'Movar negotiates language with the site, so the page loads in yours — not Russian.',
    before: shopBefore('Before Movar'),
    after: shopAfter('After Movar'),
  },
  uk: {
    headline: 'Магазини відкриваються вашою мовою',
    subhead: 'Movar домовляється про мову з сайтом — і сторінка відкривається українською.',
    before: shopBefore('До Movar'),
    after: shopAfter('Після Movar'),
  },
};

// ── Scene #3 — Google search rewrite ─────────────────────────────────
// search-rewrite's SERP content is inline here (it has no dedicated
// with/without backdrop component, unlike the other scenes) so the
// iPhone + iPad stories share one source.
const SR_QUERY = 'новини війни';
const SR_EN_TABS = ['All', 'News', 'Images', 'Videos', 'Maps'] as const;
const SR_UK_TABS = ['Усі', 'Новини', 'Зображення', 'Відео', 'Карти'] as const;

function srWithoutUrl(): ReactNode {
  return <>google.com.ua/search?q=новини+війни</>;
}
function srWithUrl(locale: 'en' | 'uk'): ReactNode {
  return (
    <>
      …/search?q=новини+війни&amp;<mark>hl={locale}</mark>&amp;<mark>lr=lang_{locale}</mark>
    </>
  );
}

function srWithoutResults(): JSX.Element {
  return (
    <>
      <GoogleSerpResult
        site="ru.wikipedia.example.org › wiki › Война"
        title={<>Война на Украине — Википедия</>}
        snippet={
          <>
            Сводная статья энциклопедии о военном конфликте: <b>новости</b> по месяцам, хронология
            боевых действий, потери сторон, международная реакция …
          </>
        }
      />
      <GoogleSerpResult
        site="lenta.example.com › news › war"
        title={<>Лента новостей войны — последние сводки за сегодня</>}
        snippet={
          <>
            Оперативные <b>новости</b> с фронта, военные сводки, заявления политиков и аналитика
            экспертов. Обновляется каждый час …
          </>
        }
      />
      <GoogleSerpResult
        site="rbc.example.com › war"
        title={<>Война: главные новости и события</>}
        snippet={
          <>
            Все <b>новости</b> о ходе боевых действий: оперативная сводка, мнения экспертов,
            переговорный процесс …
          </>
        }
      />
      <GoogleSerpResult
        site="novosti-24.example › voyna"
        title={<>Война: сводки и хроника за сегодня</>}
        snippet={
          <>
            Оперативные <b>новости</b> с фронта, аналитика военных экспертов, заявления сторон.
            Обновляется каждый час …
          </>
        }
      />
      <GoogleSerpResult
        site="svodka.example › war"
        title={<>Военная хроника — последние события дня</>}
        snippet={
          <>Хроника боевых действий по дням: карта фронта, потери сторон, международная реакция …</>
        }
      />
    </>
  );
}

function srEnglishResults(): JSX.Element {
  return (
    <>
      <GoogleSerpResult
        site="reuters.example.com › world › ukraine"
        title={<>Ukraine war news: latest updates — Reuters</>}
        snippet={
          <>
            Live coverage of the war in Ukraine: front-line developments, casualty reports,
            diplomatic moves, and international response …
          </>
        }
      />
      <GoogleSerpResult
        site="bbc.example.com › news › world-europe"
        title={<>Russia–Ukraine war — BBC News</>}
        snippet={
          <>
            BBC coverage of the conflict: reporting from the front, analysis of military and
            political developments, fact-checks of disinformation …
          </>
        }
      />
      <GoogleSerpResult
        site="en.wikipedia.example.org › wiki › Russo-Ukrainian_War"
        title={<>Russo-Ukrainian War — Wikipedia</>}
        snippet={
          <>
            Encyclopaedia overview: timeline of the conflict since 2014, phases of the full-scale
            invasion, casualty figures, sanctions regime …
          </>
        }
      />
      <GoogleSerpResult
        site="theguardian.example.com › world › ukraine"
        title={<>Ukraine war: latest news and live updates — The Guardian</>}
        snippet={
          <>
            Rolling coverage of the war in Ukraine: front-line reports, analysis, and the
            day&rsquo;s key developments verified by correspondents …
          </>
        }
      />
      <GoogleSerpResult
        site="apnews.example.com › hub › russia-ukraine"
        title={<>Russia-Ukraine War — AP News</>}
        snippet={
          <>
            The latest from the war: battlefield updates, humanitarian impact, sanctions, and
            diplomatic efforts, reported by AP journalists …
          </>
        }
      />
    </>
  );
}

function srUkrainianResults(): JSX.Element {
  return (
    <>
      <GoogleSerpResult
        site="pravda.example › news › war"
        title={<>Новини війни — Українська правда</>}
        snippet={
          <>
            Оперативні <b>новини</b> з фронту, зведення Генштабу, аналітика бойових дій, реакція
            світу. Оновлюється щогодини …
          </>
        }
      />
      <GoogleSerpResult
        site="unian.example › news"
        title={<>Війна в Україні — останні новини сьогодні</>}
        snippet={
          <>
            Головні <b>новини</b> війни: зведення ЗСУ, ситуація на напрямках, міжнародна підтримка,
            репортажі з місць подій …
          </>
        }
      />
      <GoogleSerpResult
        site="suspilne.example › news › war"
        title={<>Війна — новини на Суспільному</>}
        snippet={
          <>
            <b>Новини</b> війни на громадському мовнику: репортажі з фронту, інтервʼю з військовими
            та цивільними …
          </>
        }
      />
      <GoogleSerpResult
        site="hromadske.example › news › war"
        title={<>Новини війни — Громадське</>}
        snippet={
          <>
            <b>Новини</b> з фронту, аналітика та розслідування: репортажі кореспондентів, перевірені
            факти, реакція партнерів …
          </>
        }
      />
      <GoogleSerpResult
        site="nv.example › ukraine › war"
        title={<>Війна в Україні — головні новини — NV</>}
        snippet={
          <>
            Головні <b>новини</b> війни за сьогодні: зведення, аналітика, інтервʼю та репортажі з
            місць подій …
          </>
        }
      />
    </>
  );
}

function srFrame(lang: string, tabs: readonly string[], results: JSX.Element): JSX.Element {
  return (
    <GoogleSerpFrame lang={lang} query={SR_QUERY} tabs={tabs} stats="" hideChrome>
      {results}
    </GoogleSerpFrame>
  );
}

// ── Scene #4 — language dialog (Voya) ────────────────────────────────
const BLOCKED_EN = buildBlockedVoyaContent('en');
const BLOCKED_UK = buildBlockedVoyaContent('uk');

export const LANGUAGE_DIALOG: PortraitScene = {
  index: 4,
  darkVariant: false,
  en: {
    headline: 'Skip the “choose your language” wall',
    subhead:
      'Movar tells sites your language up front, so they serve it directly — no Russian gate.',
    before: {
      label: 'Before Movar',
      urlBar: VOYA_URL,
      content: <VoyaBackdrop content={BLOCKED_EN.content} dialog={BLOCKED_EN.dialog} />,
    },
    after: { label: 'After Movar', urlBar: VOYA_URL, content: <VoyaBackdropEN /> },
  },
  uk: {
    headline: 'Без вікна «виберіть мову»',
    subhead:
      'Movar одразу повідомляє сайту вашу мову — і він віддає її без російського блокування.',
    before: {
      label: 'До Movar',
      urlBar: VOYA_URL,
      content: <VoyaBackdrop content={BLOCKED_UK.content} dialog={BLOCKED_UK.dialog} />,
    },
    after: { label: 'Після Movar', urlBar: VOYA_URL, content: <VoyaBackdropUK /> },
  },
};

export const SEARCH_REWRITE: PortraitScene = {
  index: 3,
  darkVariant: true,
  en: {
    headline: 'Search in the language you read',
    subhead: 'Movar adds your language to Google, so results come back right — not Russian.',
    before: {
      label: 'Before Movar',
      urlBar: srWithoutUrl(),
      content: srFrame('ru', SR_EN_TABS, srWithoutResults()),
    },
    after: {
      label: 'After Movar',
      urlBar: srWithUrl('en'),
      content: srFrame('en', SR_EN_TABS, srEnglishResults()),
    },
  },
  uk: {
    headline: 'Пошук вашою мовою',
    subhead:
      'Movar додає вашу мову до Google — результати приходять правильною мовою, а не російською.',
    before: {
      label: 'До Movar',
      urlBar: srWithoutUrl(),
      content: srFrame('ru', SR_UK_TABS, srWithoutResults()),
    },
    after: {
      label: 'Після Movar',
      urlBar: srWithUrl('uk'),
      content: srFrame('uk', SR_UK_TABS, srUkrainianResults()),
    },
  },
};
