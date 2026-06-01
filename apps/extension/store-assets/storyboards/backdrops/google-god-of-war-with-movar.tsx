import type { JSX } from 'react';

import {
  GoogleKnowledgeFrame,
  KnowledgeFrameResult,
  KnowledgePanel,
} from './google-knowledge-frame';

/**
 * "With Movar" half of the Knowledge-Panel diptych. Used by both
 * surfaces:
 *
 *   - Marketing single-half PNG (`Marketing/Screenshots/GoogleGodOfWarWith`,
 *     captured at 1280×800 with built-in chrome). Composed at runtime
 *     into the second pair of `apps/marketing/src/components/BeforeAfter.astro`.
 *     Use `GoogleGodOfWarWithMovarBackdrop` (chrome built in).
 *   - Marketplace diptych half (`Marketplace/Screenshots/KnowledgePanel`),
 *     rendered inside `BeforeAfterFrameWithFrame` which supplies its own
 *     browser chrome at the half level. Use
 *     `GoogleGodOfWarWithMovarContent` (chrome suppressed).
 *
 * Both wrappers render the same seed data through a private
 * `GoogleGodOfWarWithMovarFrame` helper so the two surfaces never
 * drift. The two zero-prop exports keep Storybook's `satisfies
 * Meta<typeof …>` type inference unambiguous under
 * `exactOptionalPropertyTypes` — a single component with an optional
 * `hideChrome` prop trips the strict-args inference on the decorator.
 *
 * Same `God of War` query as the without-Movar half, but Movar has
 * appended `&hl=uk&lr=lang_uk` (both highlighted in the URL bar). The
 * Knowledge Panel on the right localises to Ukrainian — title stays
 * in the franchise's original Latin form because that's how Google
 * presents it, but the subtitle, description, property labels, and
 * "people also search for" tiles all switch.
 *
 * Result list also goes Ukrainian — `lr=lang_uk` filters results to
 * Ukrainian-tagged pages. The trade-off (over-filtering on Latin
 * queries) is documented in `packages/rules/src/index.ts`'s
 * `googleRule` comment; the franchise is popular enough that uk.wiki +
 * a couple of Ukrainian gaming sites surface comfortably.
 *
 * Domains are fictitious (`.example`) — same editorial-illustration
 * stance as the sibling backdrops.
 */
export function GoogleGodOfWarWithMovarBackdrop(): JSX.Element {
  return <GoogleGodOfWarWithMovarFrame hideChrome={false} />;
}

export function GoogleGodOfWarWithMovarContent(): JSX.Element {
  return <GoogleGodOfWarWithMovarFrame hideChrome />;
}

function GoogleGodOfWarWithMovarFrame({ hideChrome }: { hideChrome: boolean }): JSX.Element {
  return (
    <GoogleKnowledgeFrame
      hideChrome={hideChrome}
      lang="uk"
      query="God of War"
      tabs={['Усі', 'Зображення', 'Відео', 'Новини', 'Карти', 'Покупки']}
      urlBar={
        <>
          google.com.ua/search?q=God+of+War&amp;<mark>hl=uk</mark>&amp;<mark>lr=lang_uk</mark>
        </>
      }
      stats="Приблизно 24 800 результатів · мова: українська"
      results={
        <>
          <KnowledgeFrameResult
            site="uk.wikipedia.example.org › wiki › God_of_War"
            title={<>God of War — Вікіпедія</>}
            snippet={
              <>
                <b>God of War</b> — серія компʼютерних ігор у жанрі action-adventure, розроблена
                студією Santa Monica Studio для PlayStation. Перша гра серії вийшла 2005 року …
              </>
            }
          />
          <KnowledgeFrameResult
            site="playua.example › ігри › god-of-war"
            title={<>God of War — огляд серії на PlayUA</>}
            snippet={
              <>
                Повний огляд серії <b>God of War</b> українською: від першої гри 2005 року до God of
                War Ragnarök. Сюжет, історія Кратоса, ключові механіки …
              </>
            }
          />
          <KnowledgeFrameResult
            site="sony.example.ua › ігри › god-of-war"
            title={<>God of War — офіційний сайт PlayStation Україна</>}
            snippet={
              <>
                <b>God of War</b> для PlayStation 5 і PlayStation 4. Включає God of War Ragnarök —
                найновіший випуск серії. Купити або дізнатися більше …
              </>
            }
          />
          <KnowledgeFrameResult
            site="gamedev.example.ua › god-of-war-retro"
            title={<>Ретроспектива God of War: двадцять років з Кратосом</>}
            snippet={
              <>
                Як змінювалася культова серія Sony Santa Monica з 2005 року: від античної міфології
                до скандинавської. Інтервʼю з розробниками, аналіз ключових ігор …
              </>
            }
          />
        </>
      }
      panel={
        <KnowledgePanel
          hairline="Серія відеоігор · 2005–"
          title="God of War"
          subtitle="Серія відеоігор"
          description={
            <>
              God of War — серія відеоігор у жанрі action-adventure, створена Девідом Джеффі у
              студії Sony Santa Monica. Серія, яка стартувала 2005 року, стала однією з флагманських
              ігор PlayStation і поєднує міфологію з кінематографічними боями.
            </>
          }
          properties={[
            { label: 'Перший випуск', value: '22 квітня 2005' },
            { label: 'Розробник', value: 'Santa Monica Studio' },
            { label: 'Видавець', value: 'Sony Interactive Entertainment' },
            { label: 'Дизайнер', value: 'Девід Джеффі' },
            { label: 'Жанр', value: 'Action-adventure' },
          ]}
          alsoSearchHeading="Користувачі також шукають"
          alsoSearch={[
            { label: 'God of War Ragnarök' },
            { label: 'Кратос' },
            { label: 'God of War (2018)' },
          ]}
        />
      }
    />
  );
}
