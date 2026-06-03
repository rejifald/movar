import type { JSX } from 'react';

import { YouTubeFrame, YouTubeVideo } from './youtube-frame';
import { YT_CHIPS, YT_QUERY, youtubeUrlBar } from './youtube-without-movar';

/**
 * "With Movar" half of the YouTube before/after pair. Same Ukrainian
 * interface, same Cyrillic query, same URL — but now YouTube's
 * recommendations come back from Ukrainian creators. Movar supplies the
 * language/region hints (Accept-Language + locale signals) that tell
 * YouTube to rank Ukrainian-language content, so the user's existing
 * Cyrillic search finally returns the creators they'd expect.
 *
 * Channels are fictitious and carry a verified check to read as
 * established Ukrainian creators at thumbnail scale. See the without
 * half for the shared chrome rationale.
 */

/** Ukrainian recommendations — what the same query returns once Movar's
 *  language/region hints reach YouTube. Exported for the marketplace
 *  diptych. */
export function YouTubeWithVideos(): JSX.Element {
  return (
    <>
      <YouTubeVideo
        lang="uk"
        tone="a"
        duration="12:40"
        verified
        title="Новини тижня: головне за 12 хвилин"
        channel="Свідок"
        meta="1,4 млн переглядів · 2 дні тому"
        snippet="Найважливіші події тижня стисло: політика, економіка, суспільство, безпека …"
      />
      <YouTubeVideo
        lang="uk"
        tone="b"
        duration="9:15"
        verified
        title="Термінові новини: що відбувається зараз"
        channel="Прямий Погляд"
        meta="910 тис. переглядів · 4 години тому"
      />
      <YouTubeVideo
        lang="uk"
        tone="c"
        duration="24:02"
        verified
        title="Підсумки дня — великий новинний випуск"
        channel="Хроніка"
        meta="2,3 млн переглядів · 1 день тому"
      />
      <YouTubeVideo
        lang="uk"
        tone="d"
        duration="13:05"
        verified
        title="Новини економіки за тиждень"
        channel="Вектор Новин"
        meta="512 тис. переглядів · 3 дні тому"
      />
    </>
  );
}

export function YouTubeWithMovarBackdrop(): JSX.Element {
  return (
    <YouTubeFrame lang="uk" query={YT_QUERY} chips={YT_CHIPS} urlBar={youtubeUrlBar()}>
      {YouTubeWithVideos()}
    </YouTubeFrame>
  );
}
