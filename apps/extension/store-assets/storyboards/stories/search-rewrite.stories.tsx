import type { JSX, ReactNode } from 'react';
import type { Meta, StoryObj } from '@storybook/react';

import { withBrowserMock } from '../../../.storybook/decorators/with-browser-mock';
import {
  BeforeAfterFrameWithFrame,
  type BeforeAfterFrameProps,
} from '../backdrops/before-after-frame';
import { GoogleSerpFrame, GoogleSerpResult } from '../backdrops/google-serp-frame';

/**
 * Marketplace screenshot #3 — search rewrite. Both halves show the
 * SAME Google chrome (same UI language, same Cyrillic query, same
 * tabs) so the only differences a viewer sees are:
 *
 *   1. The URL bar — the After half highlights the `&hl=…&lr=lang_…`
 *      params Movar appends.
 *   2. The result list — RU-dominated on the Before half, locale-
 *      dominated on the After half.
 *
 * This pattern (same UI language, same query, params + results
 * differ) mirrors what Movar actually does in real life: it doesn't
 * touch the Google UI language, only the URL it points the browser at.
 * Reuses the same `GoogleSerpFrame` the marketing diptych uses so the
 * two surfaces (marketing page, marketplace screenshot) read as the
 * same engine.
 *
 * Layout: 1280×800 horizontal diptych via `BeforeAfterFrameWithFrame`.
 * Each half is 640×800 with the SERP rendered at `scale(0.5)` from a
 * 1280-wide native composition; captions sit below the scaled content.
 *
 * Per-locale PNGs land at `screenshots/{en,uk}/03-search-rewrite.png`.
 */
const meta = {
  title: 'Marketplace/Screenshots/SearchRewrite',
  component: BeforeAfterFrameWithFrame,
  decorators: [withBrowserMock],
  parameters: {
    layout: 'fullscreen',
    screenshotIndex: 3,
    darkVariant: true,
  },
  args: {
    before: { label: '', body: '', urlBar: null, content: null, variant: 'before' },
    after: { label: '', body: '', urlBar: null, content: null, variant: 'after' },
    lang: 'en',
  } satisfies BeforeAfterFrameProps,
} satisfies Meta<typeof BeforeAfterFrameWithFrame>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Same Cyrillic query used by both halves of both locales — the
 *  pivot the entire scene hinges on. */
const CYRILLIC_QUERY = 'новини війни';

/** English-locale Google chrome — tab labels and stats template. The
 *  same labels render on both halves of the EN story; only the SERP
 *  *content* changes. */
const EN_TABS = ['All', 'News', 'Images', 'Videos', 'Maps', 'Shopping'] as const;
const EN_STATS_WITHOUT = 'About 234,000,000 results (0.42 sec)';
const EN_STATS_WITH = 'About 47,200 results · language: English';

/** Ukrainian-locale Google chrome. */
const UK_TABS = ['Усі', 'Новини', 'Зображення', 'Відео', 'Карти', 'Покупки'] as const;
const UK_STATS_WITHOUT = 'Приблизно 234 000 000 результатів (0,42 с)';
const UK_STATS_WITH = 'Приблизно 47 200 результатів · мова: українська';

/** Shared without-Movar URL bar — bare `google.com.ua/search?q=…`
 *  with no Movar params. Same across EN and UK stories. */
function withoutMovarUrlBar(): ReactNode {
  return <>google.com.ua/search?q=новини+війни</>;
}

/** Shared with-Movar URL bar — `&hl=<locale>&lr=lang_<locale>` is what
 *  Movar appends; the marks highlight exactly those params so the
 *  viewer's eye lands on the rewrite. */
function withMovarUrlBar(locale: 'en' | 'uk'): ReactNode {
  return (
    <>
      google.com.ua/search?q=новини+війни&amp;<mark>hl={locale}</mark>&amp;
      <mark>lr=lang_{locale}</mark>
    </>
  );
}

/** RU-dominated result list — what google.com.ua serves when no
 *  Movar params are in flight. Domains are fictitious (`.example`)
 *  so the comparison stays editorial and reproducible. Shared by both
 *  EN and UK stories' Before halves. */
function withoutMovarResults(): JSX.Element {
  return (
    <>
      <GoogleSerpResult
        site="ru.wikipedia.example.org › wiki › Война"
        title={<>Война на Украине — Википедия</>}
        snippet={
          <>
            Сводная статья энциклопедии о военном конфликте: <b>новости</b> по месяцам, хронология
            боевых действий с 2022 года, потери сторон, международная реакция, последствия для
            экономики …
          </>
        }
      />
      <GoogleSerpResult
        site="lenta.example.com › news › war"
        title={<>Лента новостей войны — последние сводки за сегодня</>}
        snippet={
          <>
            Оперативные <b>новости</b> с фронта, военные сводки Минобороны, заявления политиков и
            аналитика экспертов. Обновляется каждый час …
          </>
        }
      />
      <GoogleSerpResult
        site="meduza-ru.example.org › news"
        title={<>Новости войны — Медуза-RU</>}
        snippet={
          <>
            Главные <b>новости</b> военных действий, репортажи с мест событий, интервью с
            участниками. Подборка ключевых материалов недели …
          </>
        }
      />
      <GoogleSerpResult
        site="rbc.example.com › war"
        title={<>Война: главные новости и события</>}
        snippet={
          <>
            Все <b>новости</b> о ходе боевых действий: оперативная сводка, мнения экспертов,
            переговорный процесс, гуманитарные коридоры …
          </>
        }
      />
      <GoogleSerpResult
        site="forbes-ru.example.org › news › war"
        title={<>Экономика и война: что меняется на рынках</>}
        snippet={
          <>
            Как <b>новости</b> военных действий влияют на курсы валют, цены на энергоносители и
            инвестиционный климат …
          </>
        }
      />
    </>
  );
}

/** EN-dominated result list — what `&lr=lang_en` narrows google.com.ua
 *  to when the user's Movar priority is English. The query stays
 *  Cyrillic (the user is researching the Russia–Ukraine war from an
 *  English-language perspective); Google returns English-language
 *  coverage of the same topic. Used by the EN story's After half. */
function withMovarEnglishResults(): JSX.Element {
  return (
    <>
      <GoogleSerpResult
        site="reuters.example.com › world › ukraine"
        title={<>Ukraine war news: latest updates — Reuters</>}
        snippet={
          <>
            Live coverage of the war in Ukraine: front-line developments, casualty reports,
            diplomatic moves, and international response. Updated throughout the day …
          </>
        }
      />
      <GoogleSerpResult
        site="bbc.example.com › news › world-europe"
        title={<>Russia–Ukraine war — BBC News</>}
        snippet={
          <>
            BBC coverage of the conflict: in-depth reporting from the front, analysis of military
            and political developments, humanitarian stories, fact-checks of disinformation …
          </>
        }
      />
      <GoogleSerpResult
        site="en.wikipedia.example.org › wiki › Russo-Ukrainian_War"
        title={<>Russo-Ukrainian War — Wikipedia</>}
        snippet={
          <>
            Encyclopaedia overview: timeline of the conflict since 2014, phases of the full-scale
            invasion, casualty figures, military doctrines, international sanctions regime …
          </>
        }
      />
      <GoogleSerpResult
        site="economist.example.com › ukraine"
        title={<>The war in Ukraine — The Economist</>}
        snippet={
          <>
            Weekly analysis of the war&apos;s economic, military and geopolitical consequences: how
            energy markets are reshaping, what sanctions are doing to Russia&apos;s economy …
          </>
        }
      />
      <GoogleSerpResult
        site="ft.example.com › world › war-in-ukraine"
        title={<>War in Ukraine: business and economy — FT</>}
        snippet={
          <>
            Coverage of how the war affects currency markets, energy prices, and investment flows.
            Forecasts from analysts on the months ahead …
          </>
        }
      />
    </>
  );
}

/** UA-dominated result list — what `&lr=lang_uk` narrows google.com.ua
 *  to. Same domains never recur across the EN and UK Movar lists
 *  because the language constraint genuinely changes which corpus is
 *  searched. Used by the UK story's After half. */
function withMovarUkrainianResults(): JSX.Element {
  return (
    <>
      <GoogleSerpResult
        site="pravda.example › news › war"
        title={<>Новини війни — Українська правда</>}
        snippet={
          <>
            Оперативні <b>новини</b> з фронту, зведення Генштабу, аналітика бойових дій, реакція
            світу. Оновлюється щогодини протягом доби …
          </>
        }
      />
      <GoogleSerpResult
        site="unian.example › news"
        title={<>Війна в Україні — останні новини сьогодні</>}
        snippet={
          <>
            Головні <b>новини</b> війни: зведення ЗСУ, ситуація на напрямках, міжнародна підтримка,
            заяви політиків, репортажі з місць подій …
          </>
        }
      />
      <GoogleSerpResult
        site="uk.wikipedia.example.org › wiki › Російсько-українська_війна"
        title={<>Російсько-українська війна — Вікіпедія</>}
        snippet={
          <>
            Зведена стаття енциклопедії: хронологія бойових дій з 2022 року,
            <b> новини</b> по місяцях, втрати сторін, міжнародна реакція …
          </>
        }
      />
      <GoogleSerpResult
        site="suspilne.example › news › war"
        title={<>Війна — новини на Суспільному мовленні</>}
        snippet={
          <>
            <b>Новини</b> війни на громадському мовнику: репортажі з фронту, інтервʼю з військовими
            та цивільними, гуманітарна тематика …
          </>
        }
      />
      <GoogleSerpResult
        site="lb.example.ua › news › war"
        title={<>Економіка і війна: що змінюється на ринках</>}
        snippet={
          <>
            Як <b>новини</b> воєнних дій впливають на курси валют, ціни на енергоносії та
            інвестиційний клімат …
          </>
        }
      />
    </>
  );
}

export const English: Story = {
  parameters: {
    browserMock: { uiLanguage: 'en-US' },
  },
  render: () => (
    <BeforeAfterFrameWithFrame
      lang="en"
      contentNativeHeight={860}
      before={{
        label: 'Without Movar',
        body: 'Cyrillic query on google.com.ua — Google reads the query language and ranks Russian-language results on top.',
        urlBar: withoutMovarUrlBar(),
        content: (
          <GoogleSerpFrame
            lang="ru"
            query={CYRILLIC_QUERY}
            tabs={EN_TABS}
            stats={EN_STATS_WITHOUT}
            hideChrome
          >
            {withoutMovarResults()}
          </GoogleSerpFrame>
        ),
        variant: 'before',
      }}
      after={{
        label: 'With Movar',
        body:
          'Same query, same UI. Movar appends hl=en&lr=lang_en — Google narrows ' +
          'the pool to English-language pages.',
        urlBar: withMovarUrlBar('en'),
        content: (
          <GoogleSerpFrame
            lang="en"
            query={CYRILLIC_QUERY}
            tabs={EN_TABS}
            stats={EN_STATS_WITH}
            hideChrome
          >
            {withMovarEnglishResults()}
          </GoogleSerpFrame>
        ),
        variant: 'after',
      }}
    />
  ),
};

export const Ukrainian: Story = {
  parameters: {
    browserMock: { uiLanguage: 'uk' },
  },
  render: () => (
    <BeforeAfterFrameWithFrame
      lang="uk"
      contentNativeHeight={860}
      before={{
        label: 'Без Movar',
        body: 'Кириличний запит на google.com.ua — Google визначає мову запиту і виводить російськомовні результати першими.',
        urlBar: withoutMovarUrlBar(),
        content: (
          <GoogleSerpFrame
            lang="ru"
            query={CYRILLIC_QUERY}
            tabs={UK_TABS}
            stats={UK_STATS_WITHOUT}
            hideChrome
          >
            {withoutMovarResults()}
          </GoogleSerpFrame>
        ),
        variant: 'before',
      }}
      after={{
        label: 'З Movar',
        body: 'Той самий запит, той самий інтерфейс. Movar додає hl=uk&lr=lang_uk — і Google звужує пул до україномовних сторінок.',
        urlBar: withMovarUrlBar('uk'),
        content: (
          <GoogleSerpFrame
            lang="uk"
            query={CYRILLIC_QUERY}
            tabs={UK_TABS}
            stats={UK_STATS_WITH}
            hideChrome
          >
            {withMovarUkrainianResults()}
          </GoogleSerpFrame>
        ),
        variant: 'after',
      }}
    />
  ),
};
