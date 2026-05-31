import type { JSX } from 'react';

import { GoogleSerpFrame, GoogleSerpResult } from './google-serp-frame';

/**
 * "With Movar" half of the marketing before/after diptych
 * (`apps/marketing/src/components/BeforeAfter.astro`). Same Cyrillic
 * query — `новини війни` — but Ukrainian-language results now occupy
 * the top of the page. The URL bar shows the two query params Movar
 * appends in real life (`&hl=uk&lr=lang_uk`), highlighted so the
 * `BeforeAfter` rhetoric ("Movar's only user-visible Google behavior
 * is appending these params") has somewhere visual to land.
 *
 * Result count and language label in the stats line both change vs.
 * the without half: `lr=lang_uk` narrows the pool to Ukrainian-tagged
 * pages and Google echoes the language constraint in the stats row.
 *
 * Domains are fictitious (`.example`) — see the without-Movar story
 * for the rationale.
 */
export function GoogleWithMovarBackdrop(): JSX.Element {
  return (
    <GoogleSerpFrame
      lang="uk"
      query="новини війни"
      tabs={['Усі', 'Новини', 'Зображення', 'Відео', 'Карти', 'Покупки']}
      urlBar={
        <>
          google.com.ua/search?q=новини+війни&amp;<mark>hl=uk</mark>&amp;<mark>lr=lang_uk</mark>
        </>
      }
      stats="Приблизно 47 200 результатів · мова: українська"
    >
      <GoogleSerpResult
        site="pravda.example › news › war"
        title={
          <>
            <em style={{ fontStyle: 'normal' }}>Новини</em>{' '}
            <em style={{ fontStyle: 'normal' }}>війни</em> — Українська правда
          </>
        }
        snippet={
          <>
            Оперативні <b>новини</b> з фронту, зведення Генштабу, аналітика бойових дій, реакція
            світу. Оновлюється щогодини протягом доби …
          </>
        }
      />
      <GoogleSerpResult
        site="unian.example › news"
        title={
          <>
            Війна в Україні — останні <em style={{ fontStyle: 'normal' }}>новини</em> сьогодні
          </>
        }
        snippet={
          <>
            Головні <b>новини</b> війни: зведення ЗСУ, ситуація на напрямках, міжнародна підтримка,
            заяви політиків, репортажі з місць подій …
          </>
        }
      />
      <GoogleSerpResult
        site="uk.wikipedia.example.org › wiki › Російсько-українська_війна"
        title={
          <>
            Російсько-українська <em style={{ fontStyle: 'normal' }}>війна</em> — Вікіпедія
          </>
        }
        snippet={
          <>
            Зведена стаття енциклопедії: хронологія бойових дій з 2022 року,
            <b> новини </b>по місяцях, втрати сторін, міжнародна реакція, наслідки для економіки …
          </>
        }
      />
      <GoogleSerpResult
        site="suspilne.example › news › war"
        title={
          <>
            Війна — <em style={{ fontStyle: 'normal' }}>новини</em> на Суспільному мовленні
          </>
        }
        snippet={
          <>
            <b>Новини</b> війни на громадському мовнику: репортажі з фронту, інтервʼю з військовими
            та цивільними, гуманітарна тематика, відновлення регіонів …
          </>
        }
      />
      <GoogleSerpResult
        site="lb.example.ua › news › war"
        title={
          <>
            Економіка і <em style={{ fontStyle: 'normal' }}>війна</em>: що змінюється на ринках
          </>
        }
        snippet={
          <>
            Як <b>новини</b> воєнних дій впливають на курси валют, ціни на енергоносії та
            інвестиційний клімат. Прогнози аналітиків на найближчі місяці …
          </>
        }
      />
    </GoogleSerpFrame>
  );
}
