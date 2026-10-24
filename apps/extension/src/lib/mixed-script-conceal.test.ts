/**
 * Mixed-script snippets through the real conceal gate — docs/mixed-script-snippets.md.
 *
 * Two failures with one cause: letters of one script deciding a question about
 * another.
 *   - A Russian clause beside a longer Latin product name was read as the lone
 *     Latin candidate (`en`) and kept.
 *   - A Ukrainian name inside an English title reached franc because the
 *     English lifted it over franc's length floor, and was hidden as `ru`.
 *
 * Every title runs through `applyContentFilter` with a default user's roster
 * (candidates uk/en/ru, enabled uk/en), so the hide predicate is the product's
 * own, not a copy. The over-hide guard is the point: no Ukrainian, English or
 * Belarusian title may be concealed. Russian titles are either asserted hidden
 * or recorded as known misses — titles whose Cyrillic carries no
 * Russian-distinctive letter or word, which this change does not claim to fix
 * and which this suite therefore certifies neither way.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { buildDeclaredClassifier, classifyBySnippet, getProfiles } from '@movar/lang-detect';
import type { LanguageCode } from '@movar/lang-detect';
import { francRung3Resolver } from '@movar/lang-detect/franc';
import type { PageContentModel } from '@movar/page-content/types';
import type { SnippetClassifier } from './content-conceal';
import { applyContentFilter, clearAllMarks } from './content-conceal';

// eslint-disable-next-line @typescript-eslint/require-await -- sync in-process classifier behind the async SnippetClassifier contract; nothing to await
const directClassify: SnippetClassifier = async (items, candidateCodes) => {
  const profiles = getProfiles([...candidateCodes]);
  const fuseDeclared = buildDeclaredClassifier(profiles);
  return items.map((it) =>
    it.declared === undefined
      ? classifyBySnippet(it.text, profiles, francRung3Resolver)
      : fuseDeclared(it.text, it.declared),
  );
};

/** Whether `text` is concealed for a default Ukrainian user. */
async function concealed(text: string, declaredLang?: LanguageCode): Promise<boolean> {
  const el = document.createElement('div');
  el.textContent = text;
  document.body.append(el);
  const model: PageContentModel = {
    extractor: 'test',
    nodes: [
      {
        el,
        kind: 'result',
        hideMode: 'hide',
        text,
        ...(declaredLang === undefined ? {} : { declaredLang }),
      },
    ],
  };
  const hits = await applyContentFilter(model, {
    candidateCodes: ['uk', 'en', 'ru'],
    enabled: new Set(['uk', 'en']),
    classify: directClassify,
    concealMode: 'hide',
  });
  return hits.length > 0;
}

/** Titles that must never be concealed. */
const KEEP: readonly (readonly [lang: string, text: string])[] = [
  // Ukrainian shop/tech titles with Latin product names.
  ['uk', 'Найдешевші в Україні | Victron Multiplus II 48V 6k5va'],
  ['uk', 'Купити Apple iPhone 15 Pro Max 256GB Natural Titanium — ціна, відгуки'],
  ['uk', 'Інвертор Deye SUN-12K-SG04LP3-EU гібридний трифазний'],
  ['uk', 'Ноутбук Lenovo IdeaPad Slim 5 14IRL8 (82XD0055RA) — найкраща ціна'],
  ['uk', 'Огляд Samsung Galaxy S24 Ultra: чи варто купувати?'],
  ['uk', 'Акумулятор LiFePO4 48V 100Ah для сонячної станції купити'],
  ['uk', 'EcoFlow DELTA 2 Max — зарядна станція, доставка по всій Україні'],
  ['uk', 'Відеокарта MSI GeForce RTX 4070 Ti SUPER 16G VENTUS 3X OC'],
  ['uk', 'Як налаштувати Mikrotik hAP ax3 — покрокова інструкція'],
  ['uk', 'Нові кросівки Nike Air Max 90 — найкращі ціни'],
  ['uk', 'Victron MultiPlus-II 48/5000/70-50 — відгуки та характеристики'],
  ['uk', 'Ремонт iPhone 13 Pro в Києві — швидко та недорого'],
  ['uk', 'Смартфон Xiaomi Redmi Note 13 Pro 8/256GB Midnight Black'],
  ['uk', 'Bluetti AC200MAX — огляд, плюси та мінуси'],
  ['uk', 'Курси Python для початківців онлайн | Prometheus'],
  ['uk', 'Монобанк Black card — умови та тарифи'],
  ['uk', 'Rozetka: смартфон Samsung Galaxy A55 5G 8/256GB Navy'],
  ['uk', 'Doc Martens 1460 Smooth Leather Black — купити за найкращою ціною'],
  ['uk', 'Порада: як обрати powerbank Anker PowerCore 26800 PD'],
  ['uk', 'Тест: Tesla Model Y Long Range AWD на морозі'],
  ['uk', 'Новина дня: Google Pixel 9 Pro XL вже в продажу'],
  ['uk', 'Монтаж сонячних панелей Longi Hi-MO 6 LR5-54HTH-430M'],
  ['uk', 'Термос Stanley Classic Legendary Bottle 1.4L Hammertone Green'],
  ['uk', 'Борщ: рецепт від Ever Jacques Food'],
  ['uk', 'Розпродаж Black Friday на Comfy та Foxtrot'],
  ['uk', 'Володимир Зеленський: звернення до нації — повне відео'],
  ['uk', 'Олександр Усик — Daniel Dubois: прогноз на бій'],
  ['uk', 'Новини: Денис Шмигаль про бюджет на 2027 рік'],
  // English titles carrying Cyrillic: names, places, quoted words.
  ['en', 'Interview with Володимир Зеленський on CNN'],
  ['en', 'Олена Зеленська visits Washington to meet First Lady'],
  ['en', 'Boxing: Олександр Усик vs Daniel Dubois — full fight highlights'],
  ['en', 'General Олександр Сирський on the situation near Pokrovsk'],
  ['en', 'Кирило Буданов gives rare interview to The Economist'],
  ['en', 'Денис Шмигаль meets IMF delegation in Kyiv'],
  ['en', 'Одеса Opera House damaged — UNESCO statement'],
  ['en', 'Football: Шахтар Донецьк vs Barcelona — match report'],
  ['en', 'Lviv-based band Океан Ельзи announce European tour'],
  ['en', 'Recipe: Ukrainian борщ with pampushky — step by step'],
  ['en', 'Ukrainian singer Джамала performs at Eurovision final'],
  ['en', 'Book review: Сергій Жадан — The Orphanage, translated by Reilly Costigan-Humes'],
  ['en', 'Ukrainian startup Grammarly founder Макс Литвин interview'],
  ['en', 'Photo essay: Чорнобиль exclusion zone 2026'],
  ['en', 'Learn Russian: привет means hello'],
  ['en', 'How to type Cyrillic: Ж, Щ, Ы on a Mac keyboard'],
  ['en', 'Monobank review — the Ukrainian neobank (Монобанк) explained'],
  ['en', 'Russian word of the day: спасибо (thank you)'],
  ['en', 'Kyiv / Київ travel guide 2026 — top 10 things to do'],
  ['en', 'Victron MultiPlus-II 48/5000 manual (Інструкція) PDF'],
  // Belarusian: `ў` is a letter neither candidate has, so the veto holds.
  ['be', 'Танныя ў Беларусі | Victron Multiplus II 48V'],
];

/** Russian titles that must be concealed. */
const HIDE: readonly string[] = [
  // The reported card, and the shape it stands for: the Cyrillic clause is
  // shorter than the Latin product name.
  'Самые дешевые в Украине | Victron Multiplus II 48V 6k5va',
  'Купить Apple iPhone 15 Pro Max 256GB Natural Titanium — цена, отзывы',
  // franc now reads the Cyrillic alone; the model number was trigram noise.
  'Аккумулятор LiFePO4 48V 100Ah для солнечной станции купить',
  'Инвертор Deye SUN-12K-SG04LP3-EU гибридный трехфазный',
  'Как настроить Mikrotik hAP ax3 — пошаговая инструкция',
  'Новые кроссовки Nike Air Max 90 — лучшие цены',
  'Victron MultiPlus-II 48/5000/70-50 — отзывы и характеристики',
  'Ремонт iPhone 13 Pro в Киеве — быстро и недорого',
  'Bluetti AC200MAX — обзор, плюсы и минусы, стоит ли брать',
  'Курсы Python для начинающих онлайн | Prometheus',
  'Владимир Зеленский: обращение к нации — полное видео',
  'Прогноз погоды на неделю — Kyiv weather forecast',
  'Купить Bosch GSR 18V-55 шуруповерт аккумуляторный',
  'Как выбрать холодильник Bosch KGN39VLEB — советы',
];

beforeEach(() => {
  document.body.innerHTML = '';
  clearAllMarks(document);
});

describe('mixed-script snippets — the conceal gate', () => {
  it.each(KEEP)('keeps a %s title: %s', async (_lang, text) => {
    expect(await concealed(text)).toBe(false);
  });

  it.each(HIDE)('conceals a Russian title: %s', async (text) => {
    expect(await concealed(text)).toBe(true);
  });

  it('conceals the reported card on the declared path too (Google’s sl=ru)', async () => {
    expect(await concealed('Самые дешевые в Украине | Victron Multiplus II 48V 6k5va', 'ru')).toBe(
      true,
    );
  });

  it('still keeps an all-Latin title Google labels ru — decision 2 is deferred', async () => {
    // A title with no Cyrillic at all says nothing about Russian. Hiding it on
    // the label alone is the deferred decision 2 in the ADR; until that lands
    // this pins today's behaviour so the change is deliberate.
    expect(await concealed('Victron Multiplus II 48V 6k5va', 'ru')).toBe(false);
  });
});
