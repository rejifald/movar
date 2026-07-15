import type { Meta, StoryObj } from '@storybook/react';
import type { JSX } from 'react';

import {
  PortraitBeforeAfterFrameWithFrame,
  type PortraitBeforeAfterFrameProps,
} from '../../backdrops/portrait-before-after-frame';
import { GoogleSerpFrame, GoogleSerpResult } from '../../backdrops/google-serp-frame';
import { SEARCH_REWRITE } from '../../scenes/portrait-diptych-scenes';

/**
 * Social-post card (Instagram / Threads / Facebook) — the same
 * search-rewrite before/after the iOS App Store screenshot uses
 * (`SEARCH_REWRITE`), re-laid-out at a 4:5 feed ratio and trimmed to a
 * single result + the results-count / language line per panel.
 *
 * Fully code-rendered: it reuses `GoogleSerpFrame`, the portrait
 * before/after frame, and `SEARCH_REWRITE`'s localized headline / labels /
 * URL bars, so the capture script emits **en/uk × light/dark** from one
 * source (no baked-in PNG). Captured by `capture-storybook-assets.mts`
 * (prefix `Marketing/SocialCards/`) into `apps/marketing/public/social/<lang>/`.
 *
 * Only the result list is trimmed to one row (the portrait frame + a 4:5
 * canvas leave room for a single result under the stats line); the query,
 * stats strings, and first result mirror the landscape `google-{with,
 * without}-movar` backdrops so the card can't drift from the site diptych.
 */
const SOCIAL = { width: 1320, height: 1650 } as const;

const TABS_RU = ['Все', 'Новости', 'Картинки', 'Видео', 'Карты'] as const;
const TABS_UK = ['Усі', 'Новини', 'Зображення', 'Відео', 'Карти'] as const;
const TABS_EN = ['All', 'News', 'Images', 'Videos', 'Maps'] as const;

/** Russian-dominated "before" — identical for both card locales. */
function beforeContent(): JSX.Element {
  return (
    <GoogleSerpFrame
      lang="ru"
      query="новини війни"
      tabs={TABS_RU}
      stats="Результатов: примерно 234 000 000 (0,42 сек.)"
      hideChrome
    >
      <GoogleSerpResult
        site="ru.wikipedia.example.org › wiki › Война"
        title={<>Война на Украине — Википедия</>}
        snippet={
          <>
            Сводная статья энциклопедии о военном конфликте: <b>новости</b> по месяцам, хронология
            боевых действий с 2022 года, потери сторон …
          </>
        }
      />
    </GoogleSerpFrame>
  );
}

/** "After" — results in the card's own language (uk → Ukrainian, en → English). */
function afterContent(lang: 'en' | 'uk'): JSX.Element {
  if (lang === 'uk') {
    return (
      <GoogleSerpFrame
        lang="uk"
        query="новини війни"
        tabs={TABS_UK}
        stats="Приблизно 47 200 результатів · мова: українська"
        hideChrome
      >
        <GoogleSerpResult
          site="pravda.example › news › war"
          title={<>Новини війни — Українська правда</>}
          snippet={
            <>
              Оперативні <b>новини</b> з фронту, зведення Генштабу, аналітика бойових дій, реакція
              світу …
            </>
          }
        />
      </GoogleSerpFrame>
    );
  }
  return (
    <GoogleSerpFrame
      lang="en"
      query="новини війни"
      tabs={TABS_EN}
      stats="About 47,200 results · language: English"
      hideChrome
    >
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
    </GoogleSerpFrame>
  );
}

function renderSocial(lang: 'en' | 'uk'): JSX.Element {
  const sr = lang === 'en' ? SEARCH_REWRITE.en : SEARCH_REWRITE.uk;
  if (!sr) throw new Error(`SEARCH_REWRITE has no "${lang}" spec`);
  return (
    <PortraitBeforeAfterFrameWithFrame
      {...SOCIAL}
      lang={lang}
      headline={sr.headline}
      subhead={sr.subhead}
      before={{
        label: sr.before.label,
        urlBar: sr.before.urlBar,
        content: beforeContent(),
        variant: 'before',
      }}
      after={{
        label: sr.after.label,
        urlBar: sr.after.urlBar,
        content: afterContent(lang),
        variant: 'after',
      }}
      transition="band"
    />
  );
}

const meta = {
  title: 'Marketing/SocialCards/MeetMovar',
  component: PortraitBeforeAfterFrameWithFrame,
  parameters: {
    layout: 'fullscreen',
    screenshotIndex: 1,
    darkVariant: true,
    viewport: SOCIAL,
  },
  args: {
    ...SOCIAL,
    lang: 'en',
    headline: '',
    before: { label: '', urlBar: null, content: null, variant: 'before' },
    after: { label: '', urlBar: null, content: null, variant: 'after' },
  } satisfies PortraitBeforeAfterFrameProps,
} satisfies Meta<typeof PortraitBeforeAfterFrameWithFrame>;

export default meta;
type Story = StoryObj<typeof meta>;

export const English: Story = { render: () => renderSocial('en') };
export const Ukrainian: Story = { render: () => renderSocial('uk') };
