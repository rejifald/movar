import { createElement } from 'react';
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { GoogleSerp } from './sites/google-serp';
import type { SerpResult } from './sites/google-serp';
import { COPY, Tochka24, tochka24HeadHtml } from './sites/tochka24';
import type { SiteLang } from './sites/tochka24';
import { YouTubeFeed } from './sites/youtube-feed';
import type { FeedVideo } from './sites/youtube-feed';

/** The one search the Google scene is built around. */
export const GOOGLE_QUERY = 'рецепт борщу';

interface DocumentParts {
  lang: string;
  title: string;
  /** Pre-rendered extra `<head>` markup (alternate links etc.). */
  head?: string;
  body: ReactElement;
}

function documentHtml({ lang, title, head = '', body }: DocumentParts): string {
  return (
    '<!doctype html>' +
    `<html lang="${lang}"><head><meta charset="utf-8">` +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<meta name="color-scheme" content="light dark">' +
    `<title>${title}</title>${head}</head><body>${renderToStaticMarkup(body).replaceAll('hrefLang=', 'hreflang=')}</body></html>`
  );
}

// ── Scene 1: Google ─────────────────────────────────────────────────────────

/** First, un-rewritten load: what a Russian-leaning serve looks like. */
const GOOGLE_INITIAL: readonly SerpResult[] = [
  {
    id: 'ru-1',
    site: 'kuhnya.example',
    crumb: 'kuhnya.example › recepty › borsch',
    title: 'Борщ классический — пошаговый рецепт с фото',
    snippet:
      'Как приготовить настоящий борщ со свёклой, капустой и мясом на косточке. Простой рецепт, который получится даже у начинающей хозяйки.',
  },
  {
    id: 'ru-2',
    site: 'edaprosto.example',
    crumb: 'edaprosto.example › ru › soups',
    title: 'Как варить борщ: секреты вкусного бульона',
    snippet:
      'Пошаговая инструкция и советы шефа: какое мясо выбрать, когда добавлять свёклу и как сохранить яркий цвет борща.',
  },
  {
    id: 'ru-3',
    site: 'povar.example',
    crumb: 'povar.example › recipes',
    title: 'Рецепт борща — 25 вариантов на любой вкус',
    snippet:
      'Борщ с фасолью, с пампушками, постный и мясной. Подробные рецепты с фотографиями каждого шага приготовления.',
  },
];

/** Final page after Movar adds hl=uk&lr=lang_uk|lang_en: Ukrainian on top, one
 *  English result, and two Russian ones Google still lets through. */
const GOOGLE_FINAL: readonly SerpResult[] = [
  {
    id: 'uk-1',
    site: 'smaky.example',
    crumb: 'smaky.example › recepty › borshch',
    title: 'Класичний український борщ — покроковий рецепт з фото',
    snippet:
      'Як приготувати справжній борщ із буряком, капустою та мʼясом на кістці. Секрети насиченого бульйону та яскравого кольору, які знає кожна господиня.',
  },
  {
    id: 'uk-2',
    site: 'kuhar.example',
    crumb: 'kuhar.example › ukrainska-kukhnia',
    title: 'Борщ із пампушками: рецепт від шеф-кухаря',
    snippet:
      'Домашній борщ із часниковими пампушками — страва, що збирає родину за столом. Перевірені пропорції та покрокові поради.',
  },
  {
    id: 'ru-1',
    site: 'kuhnya.example',
    crumb: 'kuhnya.example › recepty › borsch',
    title: 'Борщ классический — пошаговый рецепт с фото',
    snippet:
      'Как приготовить настоящий борщ со свёклой, капустой и мясом на косточке. Простой рецепт, который получится даже у начинающей хозяйки.',
    translateFrom: 'ru',
  },
  {
    id: 'uk-3',
    site: 'uk.wikipedia.example',
    name: 'Вікіпедія',
    crumb: 'uk.wikipedia.example › wiki › Борщ',
    title: 'Борщ — Вікіпедія',
    snippet:
      'Борщ — традиційна українська страва, заправний суп на основі буряка, що має червоний колір. Внесений до списку нематеріальної культурної спадщини.',
  },
  {
    id: 'en-1',
    site: 'worldfood.example',
    crumb: 'worldfood.example › recipes › borscht',
    title: 'Ukrainian borscht recipe — authentic beet soup',
    snippet:
      'A rich, tangy beet soup with cabbage, potatoes and a spoonful of sour cream. Step-by-step recipe with tips for the perfect broth.',
    translateFrom: 'en',
  },
  {
    id: 'uk-4',
    site: 'zelena.example',
    crumb: 'zelena.example › sup › zelenyi-borshch',
    title: 'Зелений борщ зі щавлем — легкий весняний рецепт',
    snippet:
      'Освіжаючий борщ зі щавлем, яйцем та молодою картоплею. Готується за пів години і чудово смакує зі сметаною.',
  },
  {
    id: 'ru-2',
    site: 'edaprosto.example',
    crumb: 'edaprosto.example › ru › soups',
    title: 'Как варить борщ: секреты вкусного бульона',
    snippet:
      'Пошаговая инструкция и советы шефа: какое мясо выбрать, когда добавлять свёклу и как сохранить яркий цвет борща.',
    translateFrom: 'ru',
  },
];

export function googleInitialPage(query: string = GOOGLE_QUERY): string {
  return documentHtml({
    lang: 'ru',
    title: `${query} - Поиск в Google`,
    body: createElement(GoogleSerp, { query, hl: 'ru', results: GOOGLE_INITIAL }),
  });
}

export function googleFinalPage(query: string = GOOGLE_QUERY): string {
  return documentHtml({
    lang: 'uk',
    title: `${query} - Пошук Google`,
    body: createElement(GoogleSerp, { query, hl: 'uk', results: GOOGLE_FINAL }),
  });
}

// ── Scene 2: Tochka24 ───────────────────────────────────────────────────────

export function tochka24Page(lang: SiteLang, opts: { gate?: boolean } = {}): string {
  const gate = opts.gate === true;
  return documentHtml({
    lang,
    title: `Tochka24 — ${COPY[lang].eyebrow}`,
    head: tochka24HeadHtml(lang),
    body: createElement(Tochka24, { lang, gate }),
  });
}

// ── Scene 3: YouTube ────────────────────────────────────────────────────────

const YT_VIDEOS: readonly FeedVideo[] = [
  {
    id: 'uk-1',
    title: 'Карпатські полонини: 5 днів у горах без телефону',
    channel: 'Мандруй Ближче',
    meta: '412 тис. переглядів · 2 дні тому',
    duration: '18:24',
    tone: 0,
  },
  {
    id: 'ru-1',
    title: 'Как приготовить идеальный борщ: секреты шефа',
    channel: 'Кухня без границ',
    meta: '1,2 млн просмотров · 3 дня назад',
    duration: '12:07',
    tone: 3,
  },
  {
    id: 'en-1',
    title: 'How a mechanical watch actually works',
    channel: 'Gear & Gears',
    meta: '2.1M views · 1 week ago',
    duration: '21:40',
    tone: 2,
  },
  {
    id: 'uk-2',
    title: 'Як навчити дитину читати: поради з досвіду вчительки',
    channel: 'Школа вдома',
    meta: '96 тис. переглядів · 5 годин тому',
    duration: '9:52',
    tone: 4,
  },
  {
    id: 'ru-2',
    title: 'Обзор нового смартфона: это лучший выбор за свои деньги?',
    channel: 'Техно Обзор',
    meta: '860 тыс. просмотров · 2 дня назад',
    duration: '15:33',
    tone: 6,
  },
  {
    id: 'uk-3',
    title: 'Київ з висоти: нічне місто в 4K',
    channel: 'Дронова Мапа',
    meta: '1,5 млн переглядів · 3 тижні тому',
    duration: '6:15',
    tone: 1,
  },
  {
    id: 'en-2',
    title: 'Building a tiny cabin in the forest, start to finish',
    channel: 'Quiet Builds',
    meta: '3.4M views · 2 months ago',
    duration: '34:12',
    tone: 7,
  },
  {
    id: 'ru-3',
    title: 'Самые странные места на Земле — подборка путешественника',
    channel: 'Планета Живая',
    meta: '540 тыс. просмотров · 4 дня назад',
    duration: '27:48',
    tone: 5,
  },
];

export function youtubeFeedPage(): string {
  return documentHtml({
    lang: 'uk',
    title: 'YouTube',
    body: createElement(YouTubeFeed, {
      chips: ['Усі', 'Музика', 'Подорожі', 'Кулінарія', 'Нещодавно завантажені', 'Дивилися'],
      videos: YT_VIDEOS,
      tabs: ['Головна', 'Shorts', 'Підписки', 'Бібліотека'],
    }),
  });
}
