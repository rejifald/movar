import type { JSX } from 'react';

import { GoogleSerpFrame, GoogleSerpResult } from './google-serp-frame';

/**
 * "Without Movar" half of the marketing before/after diptych
 * (`apps/marketing/src/components/BeforeAfter.astro`). Same Cyrillic
 * query as the "with" half — `новини війни` — but Russian-language
 * results dominate the top of the page. Mirrors the rhetorical setup
 * the section's copy spells out: Google reads Cyrillic as Russian by
 * default and ranks the larger Russian-language web on top.
 *
 * Domains are fictitious (`.example.org`) — no real news brand is
 * named, so the comparison stays editorial and reproducible without
 * tracking real-world ranking drift.
 *
 * URL bar shows a bare `google.com.ua/search?q=…` (no `hl=uk` or
 * `lr=lang_uk`) — exactly what Google receives when no Movar rule
 * is in flight.
 */
export function GoogleWithoutMovarBackdrop(): JSX.Element {
  return (
    <GoogleSerpFrame
      lang="ru"
      query="новини війни"
      tabs={['Все', 'Новости', 'Картинки', 'Видео', 'Карты', 'Покупки']}
      urlBar={<>google.com.ua/search?q=новини+війни</>}
      stats="Результатов: примерно 234 000 000 (0,42 сек.)"
    >
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
        title={
          <>
            Лента новостей <em style={{ fontStyle: 'normal' }}>войны</em> — последние сводки за
            сегодня
          </>
        }
        snippet={
          <>
            Оперативные <b>новости</b> с фронта, военные сводки Минобороны, заявления политиков и
            аналитика экспертов. Обновляется каждый час …
          </>
        }
      />
      <GoogleSerpResult
        site="meduza-ru.example.org › news"
        title={
          <>
            <em style={{ fontStyle: 'normal' }}>Новости</em> войны — Медуза-RU
          </>
        }
        snippet={
          <>
            Главные <b>новости</b> военных действий, репортажи с мест событий, интервью с
            участниками. Подборка ключевых материалов недели для читателей …
          </>
        }
      />
      <GoogleSerpResult
        site="rbc.example.com › war"
        title={
          <>
            <em style={{ fontStyle: 'normal' }}>Война</em>: главные{' '}
            <em style={{ fontStyle: 'normal' }}>новости</em> и события
          </>
        }
        snippet={
          <>
            Все <b>новости</b> о ходе боевых действий: оперативная сводка, мнения экспертов,
            переговорный процесс, гуманитарные коридоры, обстановка в регионах …
          </>
        }
      />
      <GoogleSerpResult
        site="forbes-ru.example.org › news › war"
        title={
          <>
            Экономика и <em style={{ fontStyle: 'normal' }}>война</em>: что меняется на рынках
          </>
        }
        snippet={
          <>
            Как <b>новости</b> военных действий влияют на курсы валют, цены на энергоносители и
            инвестиционный климат. Прогнозы аналитиков на ближайшие месяцы …
          </>
        }
      />
    </GoogleSerpFrame>
  );
}
