import type { JSX } from 'react';

import {
  GoogleKnowledgeFrame,
  KnowledgeFrameResult,
  KnowledgePanel,
} from './google-knowledge-frame';

/**
 * "Without Movar" half of the Knowledge-Panel diptych. Used by both
 * surfaces:
 *
 *   - Marketing single-half PNG (`Marketing/Screenshots/GoogleGodOfWarWithout`,
 *     captured at 1280×800 with built-in chrome). Composed at runtime
 *     into the second pair of `apps/marketing/src/components/BeforeAfter.astro`.
 *     Use `GoogleGodOfWarWithoutMovarBackdrop` (chrome built in).
 *   - Marketplace diptych half (`Marketplace/Screenshots/KnowledgePanel`),
 *     rendered inside `BeforeAfterFrameWithFrame` which supplies its own
 *     browser chrome at the half level. Use
 *     `GoogleGodOfWarWithoutMovarContent` (chrome suppressed).
 *
 * The two wrappers share a private `GoogleGodOfWarWithoutMovarFrame`
 * helper so the seed data never drifts between surfaces. Two
 * zero-prop exports keep Storybook's `satisfies Meta<typeof …>`
 * inference clean under `exactOptionalPropertyTypes`.
 *
 * Latin-script query — `God of War` — on google.com.ua with no Movar
 * params. Google's entity Knowledge Panel comes back in English because
 * Google has no `hl` hint and falls back to its canonical English data
 * for the franchise; result list is a mix of English and Russian
 * (the two largest-corpus languages Google falls back to for Latin
 * queries with no `lr` constraint). This mirrors what an actual
 * Ukrainian-locale visitor sees: an English summary plus an
 * English-and-Russian result list, with Ukrainian sources nowhere
 * near the top.
 *
 * Mirrors `GoogleWithoutMovarBackdrop` rhetorically — same diptych
 * vocabulary, same domain conventions (`.example`) — but loads through
 * the wider `GoogleKnowledgeFrame` so the right-column panel has
 * somewhere to live.
 *
 * URL bar shows the bare `google.com.ua/search?q=…` — no `hl=uk`, no
 * `lr=lang_uk`. That's exactly what Google receives without Movar in
 * flight, and the contrast with the highlighted params on the with-
 * Movar half is what the diptych's caption pair leans on.
 */
export function GoogleGodOfWarWithoutMovarBackdrop(): JSX.Element {
  return <GoogleGodOfWarWithoutMovarFrame hideChrome={false} />;
}

export function GoogleGodOfWarWithoutMovarContent(): JSX.Element {
  return <GoogleGodOfWarWithoutMovarFrame hideChrome />;
}

function GoogleGodOfWarWithoutMovarFrame({ hideChrome }: { hideChrome: boolean }): JSX.Element {
  return (
    <GoogleKnowledgeFrame
      hideChrome={hideChrome}
      lang="en"
      query="God of War"
      tabs={['Усі', 'Зображення', 'Відео', 'Новини', 'Карти', 'Покупки']}
      urlBar={<>google.com.ua/search?q=God+of+War</>}
      stats="Приблизно 187 000 000 результатів (0,42 с)"
      results={
        <>
          <KnowledgeFrameResult
            site="en.wikipedia.example.org › wiki › God_of_War"
            title={<>God of War — Wikipedia</>}
            snippet={
              <>
                <b>God of War</b> is a video game franchise developed by Santa Monica Studio and
                published by Sony Interactive Entertainment. The series is loosely based on Greek
                and later Norse mythology …
              </>
            }
          />
          <KnowledgeFrameResult
            lang="ru"
            site="ru.wikipedia.example.org › wiki › God_of_War"
            title={<>God of War — Википедия</>}
            snippet={
              <>
                <b>God of War</b> — серия компьютерных игр в жанре action-adventure, разработанная
                студией Santa Monica Studio. Первая игра серии вышла в 2005 году эксклюзивно для
                PlayStation 2 …
              </>
            }
          />
          <KnowledgeFrameResult
            site="metacritic.example.com › game › god-of-war"
            title={<>God of War (2018) — Metacritic</>}
            snippet={
              <>
                Reviews and ratings for <b>God of War</b>. Critic score: 94. User score: 9.1. A
                masterpiece of action-adventure design that reinvented the franchise on PS4 …
              </>
            }
          />
          <KnowledgeFrameResult
            lang="ru"
            site="stopgame.example.ru › games › god-of-war"
            title={<>God of War — обзор и оценка серии — StopGame</>}
            snippet={
              <>
                Полный разбор серии <b>God of War</b>: история Кратоса, обзоры всех частей от 2005
                года до Ragnarök, рейтинги пользователей, видеоразборы боевой системы …
              </>
            }
          />
        </>
      }
      panel={
        <KnowledgePanel
          hairline="Video game series · 2005–"
          title="God of War"
          subtitle="Video game franchise"
          description={
            <>
              God of War is an action-adventure game franchise created by David Jaffe at Sony&apos;s
              Santa Monica Studio. The series, which began in 2005, has become a flagship title for
              the PlayStation brand, blending mythology with cinematic combat.
            </>
          }
          properties={[
            { label: 'Initial release', value: 'April 22, 2005' },
            { label: 'Developer', value: 'Santa Monica Studio' },
            { label: 'Publisher', value: 'Sony Interactive Entertainment' },
            { label: 'Designer', value: 'David Jaffe' },
            { label: 'Genre', value: 'Action-adventure' },
          ]}
          alsoSearchHeading="People also search for"
          alsoSearch={[
            { label: 'God of War Ragnarök' },
            { label: 'Kratos' },
            { label: 'God of War (2018)' },
          ]}
        />
      }
    />
  );
}
