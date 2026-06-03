import type { JSX, ReactNode } from 'react';

import { YouTubeFrame, YouTubeVideo } from './youtube-frame';

/**
 * "Without Movar" half of the YouTube before/after pair. The browser is
 * already set to Ukrainian, so the YouTube *interface* is Ukrainian on
 * both halves (Movar never touches a site's UI language) — the only
 * thing that differs is what YouTube *recommends*. Here, a Cyrillic
 * search for `новини` surfaces Russian-language channels because that's
 * the larger corpus YouTube leans on without a language/region hint.
 *
 * Channel names are fictitious — no real broadcaster is named, so the
 * comparison stays editorial and reproducible. The URL bar is identical
 * on both halves (Movar steers YouTube through the request's
 * language/region hints, not a visible URL rewrite — unlike the Google
 * search scene where the `hl/lr` params are the load-bearing signal).
 */

/** Shared Cyrillic query for both halves of the scene. */
export const YT_QUERY = 'новини';

/** Ukrainian YouTube filter chips — identical on both halves because
 *  the UI follows the browser language, which Movar leaves alone. First
 *  chip is active. */
export const YT_CHIPS = ['Усі', 'Відео', 'Канали', 'Плейлисти', 'Нещодавні'] as const;

/** Shared URL bar — same on both halves (no visible param rewrite). */
export function youtubeUrlBar(): ReactNode {
  return <>youtube.com/results?search_query=новини</>;
}

/** Russian-leaning recommendations — what YouTube surfaces for a
 *  Cyrillic query with no language/region hint in flight. Exported so
 *  the marketplace diptych reuses the exact same list. */
export function YouTubeWithoutVideos(): JSX.Element {
  return (
    <>
      <YouTubeVideo
        lang="ru"
        tone="a"
        duration="14:22"
        title="Новости недели: всё, что важно знать"
        channel="Эфир 24"
        meta="1,2 млн просмотров · 2 дня назад"
        snippet="Главные события недели за 15 минут: политика, экономика, общество, происшествия …"
      />
      <YouTubeVideo
        lang="ru"
        tone="b"
        duration="8:05"
        title="Срочный выпуск: что происходит прямо сейчас"
        channel="Лента Дня"
        meta="856 тыс. просмотров · 5 часов назад"
      />
      <YouTubeVideo
        lang="ru"
        tone="c"
        duration="23:10"
        title="Итоги дня — большой новостной выпуск"
        channel="Глобус ТВ"
        meta="2,1 млн просмотров · 1 день назад"
      />
      <YouTubeVideo
        lang="ru"
        tone="d"
        duration="11:48"
        title="Новости экономики и политики за неделю"
        channel="Прайм Ньюс"
        meta="430 тыс. просмотров · 3 дня назад"
      />
    </>
  );
}

export function YouTubeWithoutMovarBackdrop(): JSX.Element {
  return (
    <YouTubeFrame lang="uk" query={YT_QUERY} chips={YT_CHIPS} urlBar={youtubeUrlBar()}>
      {YouTubeWithoutVideos()}
    </YouTubeFrame>
  );
}
