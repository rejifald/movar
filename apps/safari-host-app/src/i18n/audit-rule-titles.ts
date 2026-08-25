/**
 * Ukrainian display titles for the audit rules.
 *
 * The kernel is not localised: it emits English titles alongside its findings,
 * and this map re-states them in Ukrainian for the report UI only. Nothing here
 * feeds adjudication — a title never decides a verdict, so a missing entry
 * degrades to the kernel's English rather than changing what the audit says.
 *
 * The keys are rule IDs, which are the kernel's stable public API (suppressions
 * cite them, stored evidence is adjudicated against them, published reports
 * quote them) and are never renamed once published. That is what makes them
 * safe to key a translation catalogue by — and why nothing here is derived from
 * the English wording, which is free to be reworded without a rename.
 *
 * A drift guard asserts this map covers exactly the shipped ruleset: every rule
 * the kernel exports has a title here, and no title here names a rule that no
 * longer exists. Adding a rule to the catalogue therefore fails this app's tests
 * until its Ukrainian title lands too.
 */
export const auditRuleTitlesUk: Readonly<Record<string, string>> = {
  'core/lang-missing': 'У <html> немає lang',
  'core/lang-malformed': '<html lang> не є коректним тегом BCP-47',
  'core/lang-contradicts-url': '<html lang> суперечить мовній мітці в URL',
  'core/lang-contradicts-picker': '<html lang> суперечить активному пункту перемикача мов',
  'core/lang-contradicts-og-locale': '<html lang> суперечить og:locale',
  'core/lang-contradicts-content-language': '<html lang> суперечить заявленому Content-Language',
  'core/og-locale-malformed': 'og:locale не є коректною локаллю Open Graph у форматі ll_CC',
  'core/lang-part-unmarked': 'Уривок іншою мовою без lang',
  'core/lang-part-malformed': 'lang елемента не є коректним тегом BCP-47',
  'core/inventory-sources-disagree': 'hreflang, перемикач мов і sitemap заявляють різні набори мов',
  'core/inventory-varies-across-pages': 'Сторінки одного сайту заявляють різні переліки мов',
  'core/inventory-undetermined': 'Сигнали багатомовності є, але перелік мов не визначити',
  'core/hreflang-self-missing':
    'Сторінка заявляє інші мовні версії, але не вказує hreflang на себе',
  'core/hreflang-not-reciprocal': 'hreflang не взаємний — ціль не заявляє його у відповідь',
  'core/hreflang-duplicate': 'Той самий код hreflang заявлено двічі з різними цілями',
  'core/hreflang-malformed': 'Значення hreflang — не коректний тег BCP-47 і не x-default',
  'core/hreflang-target-relative': 'Ціль hreflang — не абсолютний URL',
  'core/hreflang-x-default-missing': 'Багатомовна сторінка не заявляє x-default',
  'core/hreflang-target-unresolvable': 'Цілі hreflang немає серед зібраних сторінок',
  'core/hreflang-target-wrong-language': 'Ціль hreflang видає не ту мову, що заявлено',
  'core/picker-option-undeclared': 'Перемикач мов пропонує мову, якої більше ніде не заявлено',
  'core/picker-omits-declared-language': 'Заявленої мови немає в перемикачі мов',
  'core/picker-no-navigable-target':
    'Пункт перемикача мов не дає URL — ні href, ні hreflang, ні адреси для переходу',
  'core/picker-target-unresolvable': 'Ціль перемикача мов віддає 404 або її немає у збірці',
  'core/serving-default-language': 'Яка мова завантажується без жодної мовної вподоби',
  'core/serving-header-ignored':
    'Відповіді побайтово однакові за будь-якого заголовка, хоча заявлено кілька мов',
  'core/serving-header-partial': 'Частину заявлених мов ураховано, решту мовчки проігноровано',
  'core/serving-declared-never-served': 'Заявлену мову не видано за жодного заголовка',
  'core/serving-vary-missing':
    'Відповідь залежить від Accept-Language, а Vary: Accept-Language немає',
  'core/serving-decided-by-ip': 'Однакові заголовки, різні мови з різних точок запиту',
  'core/serving-cookie-overrides-header': 'Збережена мовна кука перебиває явну вподобу в заголовку',
  'core/switch-no-effect': 'Перехід на заявлену ціль видає ту саму мову',
  'core/switch-bounces': 'Ціль редиректом кидає назад на початкову мовну версію',
  'core/switch-loses-path': 'Перемикання викидає на головну замість перекладеної сторінки',
  'core/switch-requires-script': 'Перемикач без адреси для переходу таки спрацьовує на клік',
  'core/content-language-mixed':
    'Фрагменти тексту класифіковано не тією мовою, яку заявила сторінка',
  'core/content-contradicts-declaration':
    'Мова, що переважає в тексті, не збігається з <html lang>',
  'core/content-chrome-untranslated': 'Меню й футер — іншою мовою, ніж тіло сторінки',
  'core/title-contradicts-declaration': '<title> класифіковано не тією мовою, яку заявила сторінка',
  'core/head-metadata-contradicts-declaration':
    'Текст description, og: і twitter: класифіковано іншою мовою',
  'ua/market-determination': 'Як визначено український ринок — або що визначити не вдалося',
  'ua/state-language-absent': 'Версію державною мовою ніде не заявлено й ніде не видано',
  'ua/state-language-not-default':
    'Версія державною мовою є, але за замовчуванням завантажується не вона',
  'ua/state-language-not-default-by-ip':
    'Державна мова завантажується за замовчуванням не з усіх точок запиту',
  'ua/state-language-version-lesser':
    'Версія державною мовою менша за обсягом чи змістом, ніж інша',
  'ua/state-language-interface-elements': 'Сторінку видано українською, а елементи інтерфейсу — ні',
};
