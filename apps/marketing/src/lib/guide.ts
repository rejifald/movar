/*
 * The guide's routes, grouping and Ukrainian chrome copy.
 *
 * Sibling of ./blog, and single-locale for the same reason (see
 * `src/content.config.ts`). Kept apart from `i18n.ts` because that module's
 * shape is a bilingual parity contract, and this section has no English half
 * to keep in step.
 */

import { blogPostHref } from './blog';

/** Hub page. Ukrainian-only, so the `/uk` prefix is unconditional. */
export const GUIDE_INDEX_HREF = '/uk/guide';

/**
 * The explainer this guide was split out of: «Як зробити українську мовою за
 * замовчуванням» tells a reader *why* the settings behave this way, and the
 * pages here tell them *where to click*. The article links here for the steps,
 * so the hub links back — otherwise the split leaves the article reachable only
 * from the blog index.
 *
 * A literal post id, checked by `marketing.guide.spec.ts` rather than by the
 * type system: content-collection ids are filenames, so nothing but a test can
 * notice the post being renamed out from under this link.
 */
export const GUIDE_EXPLAINER_HREF = blogPostHref('ukrainska-za-zamovchuvannyam');

/**
 * The post behind the footnote at the foot of this hub. «Мовна гігієна» is
 * defined there in a paragraph and three negations; the article says the part
 * a footnote has no room for — which mechanisms put a removed language back,
 * and what the upkeep actually costs once the first pass is done.
 *
 * A literal post id, and checked by the same spec as
 * {@link GUIDE_EXPLAINER_HREF}, for the same reason.
 */
export const GUIDE_HYGIENE_HREF = blogPostHref('movna-hihiiena');

/** Permalink for one guide page, keyed by its content-collection id. */
export function guidePageHref(id: string): string {
  return `${GUIDE_INDEX_HREF}/${id}`;
}

/** The hub's blocks, in render order. `id` matches the collection's `group`. */
export const GUIDE_GROUPS = [
  {
    id: 'device',
    heading: 'Пристрій',
    lead: 'Системна мова й список мов, який читають застосунки та сайти.',
    icon: 'Monitor',
  },
  {
    id: 'browser',
    heading: 'Браузер',
    lead: 'Список мов, який браузер просить у кожного сайту.',
    icon: 'AppWindow',
  },
  {
    id: 'account',
    heading: 'Google',
    lead: 'Мова інтерфейсу, мова результатів і кожен продукт окремо.',
    icon: 'CircleUser',
  },
  {
    id: 'service',
    heading: 'Сервіси',
    lead: 'Власні списки мов, які не читають ні систему, ні браузер.',
    icon: 'Play',
  },
  {
    id: 'sites',
    heading: 'Окремі сайти',
    lead: 'Вибір, збережений на самому сайті, і мова листів.',
    icon: 'Globe',
  },
] as const;

/**
 * Which of three Ukrainian noun forms fits a count.
 *
 * Not a singular/plural switch: 1 (and 21, 31…) takes `one`; 2–4 (and 22–24,
 * 32–34… but never 12–14) takes `few`; everything else — 0, 5–20, 25–30… —
 * takes `many`. The teens are the exception a naive `n % 10` gets wrong.
 *
 * Lives here because two callers now need the same rule for different nouns —
 * the hub's «сторінка/сторінки/сторінок» stamp and the diagnosis widget's
 * «проблема/проблеми/проблем» count — and the second copy is where a plural
 * rule quietly stops matching the first.
 */
export function pluralForm(count: number): 'one' | 'few' | 'many' {
  const TEEN_LOW = 11;
  const TEEN_HIGH = 14;
  const FEW_HIGH = 4;
  const HUNDRED = 100;
  const TEN = 10;

  /* Teens first: 11–14 all take `many`, and checking them up front is what
   * lets the digit rules below stay unqualified. */
  const teen = count % HUNDRED;
  if (teen >= TEEN_LOW && teen <= TEEN_HIGH) return 'many';

  const digit = count % TEN;
  if (digit === 1) return 'one';
  return digit > 1 && digit <= FEW_HIGH ? 'few' : 'many';
}

/** In-page anchor for a group's block, used by the hub's sticky rail. */
export function guideGroupAnchor(id: string): string {
  return `grupa-${id}`;
}

/**
 * The complete vocabulary a page's `match` may draw on — every token
 * {@link detectTokens} can emit, and nothing else.
 *
 * This list is the *only* copy. `src/content.config.ts` builds the collection
 * schema from it (`z.enum`), so a page that invents a token fails the build
 * instead of shipping a card the detection can never surface. It used to be a
 * free `z.string()` documented in a comment, and `google-poshuk.md` duly
 * carried `match: ['google']` — untypoed, unvalidated, and dead, because no
 * user agent says "google".
 */
export const GUIDE_MATCH_TOKENS = [
  'windows',
  'macos',
  'ios',
  'android',
  'chrome',
  'firefox',
  'safari',
  'edge',
] as const;

export type GuideMatchToken = (typeof GUIDE_MATCH_TOKENS)[number];

/**
 * User-agent signatures, most specific first — the order is the whole trick, and
 * a table states it where an if/else chain only implied it.
 *
 * Edge's UA also says "Chrome", and Chrome's also says "Safari", so a later row
 * must never win over an earlier one. Every iOS browser's UA says "Safari" too,
 * which is convenient rather than wrong here: on iOS they genuinely all read the
 * same system language list.
 *
 * One token per table at most — a visitor has one OS and one browser.
 */
const OS_SIGNATURES: readonly (readonly [GuideMatchToken, RegExp])[] = [
  ['ios', /iPhone|iPad|iPod/],
  ['android', /Android/],
  ['macos', /Mac OS X/],
  ['windows', /Windows/],
];

const BROWSER_SIGNATURES: readonly (readonly [GuideMatchToken, RegExp])[] = [
  ['edge', /Edg\//],
  ['firefox', /Firefox\/|FxiOS/],
  ['chrome', /Chrome\/|CriOS/],
  ['safari', /Safari\//],
];

/**
 * Guess OS and browser from a user-agent string.
 *
 * Lives here rather than inline in the island so it shares one vocabulary with
 * the collection schema, and so it can be exercised without a browser.
 */
export function detectTokens(userAgent: string): GuideMatchToken[] {
  const firstMatch = (
    signatures: readonly (readonly [GuideMatchToken, RegExp])[],
  ): GuideMatchToken | undefined => signatures.find(([, pattern]) => pattern.test(userAgent))?.[0];

  return [firstMatch(OS_SIGNATURES), firstMatch(BROWSER_SIGNATURES)].filter(
    (token): token is GuideMatchToken => token !== undefined,
  );
}

/**
 * Format the «оновлено» stamp. Guide pages carry a date because a settings
 * instruction without one cannot be trusted — vendors move these menus.
 */
export function formatUpdated(date: Date): string {
  return new Intl.DateTimeFormat('uk-UA', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

export const guideStrings = {
  navLabel: 'Інструкція',
  /**
   * The homepage band that opens this guide — Ukrainian-only, like everything
   * else here, so it renders on `/uk` and has no English counterpart.
   *
   * ## Why the homepage carries it at all
   *
   * The guide was reachable from one footer column and from blog posts. A nav
   * slot fixes the address problem and nothing else: «Інструкція» is a word,
   * and a word does not tell a reader that the thing behind it is about *them*.
   * The band does, because the verdict it renders is read off this visitor's
   * own browser.
   *
   * ## Why it never hides itself
   *
   * `GuideChecker` on the hub ships `hidden` and reveals itself, because the
   * page underneath it is the whole guide. Here there is nothing underneath —
   * this section is the homepage's only route into the guide — so it renders
   * complete, and only the reader's own language list appears. A no-JS visitor
   * gets the claim and the link, which is the argument minus its evidence.
   *
   * ## What is deliberately NOT here
   *
   * No verdict, no fault count, and no word for how wrong the list is. The
   * section shows the list and says what decides it; grading it is
   * `GuideChecker`'s job, on a page the reader chose to open. See
   * `components/GuideTeaser.astro` for why that line matters — a page that
   * announces problems it found on your device, in red, beside one button, is
   * a shape this site cannot afford to borrow.
   *
   * The words around the list are this section's own — see `listLabel` below
   * for why that one departure from `diagnosisStrings` is deliberate.
   */
  teaser: {
    /* Names the subject rather than echoing the heading. It was «Що бачать
       сайти» — the hub's own section name — until the heading below started
       naming sites too, and two lines running on «сайти» read as a stutter. */
    eyebrow: 'Ваш список мов',
    /*
     * The heading and the list are one sentence: this states what the browser
     * tells sites, and the rows below it are the «цими мовами» it ends on.
     * Nothing sits between them, and nothing labels the rows, because the
     * heading a reader has just read is the label.
     *
     * That is why it is not «Що про вас каже ваш браузер», which was the
     * version before this one. A heading with no predicate left three language
     * names under it and no stated relation between them and the reader — the
     * browser does not report three names, it reports that this reader wants
     * content in these languages, in this order. The list cannot supply a verb
     * the heading never offered.
     *
     * Two earlier drafts are also gone: «Перш ніж віддати сторінку, сайт читає
     * ваш список мов» with a paragraph under it, and a separate small-caps
     * label over the list. Between them they established whose data this is
     * three times.
     *
     * What went with the paragraph, and is worth knowing was deliberate: it
     * said Movar passes your language to sites but does not write your system,
     * Google or per-service settings. True, and the honest reason to open the
     * guide — but the link now carries the guide's own title, which says the
     * same thing in the place a reader is deciding whether to click.
     *
     * «хочете читати» and not «віддаєте перевагу контенту»: the second is the
     * literal sense of the header and is also канцелярит (§4.12), which the
     * plain verb says better.
     */
    heading: 'Ваш браузер каже сайтам, що ви хочете читати цими мовами',
    /*
     * No `linkLabel`. The section closes on {@link guideStrings.index.title},
     * read from the hub rather than restated here, so a reader arrives at a
     * page whose h1 is the words they clicked and a retitle cannot leave the
     * homepage advertising a heading the guide no longer has.
     *
     * It said «Відкрити інструкцію» first, which named the act of clicking and
     * not one thing about the destination — «інструкція» on its own could be
     * four sentences or forty pages, about this extension or about the reader's
     * own settings. Every other closing link on the site names its subject
     * («Чому так стається — докладніше», «Як Мовар визначає мову»), and this
     * was the only one that did not.
     */
    /*
     * The line under the list, and the one place this section does NOT borrow
     * `diagnosisStrings`.
     *
     * The hub's privacy sentence says «на вашому пристрої», which is true and
     * is not the same claim: a device is where a file could sit, and the point
     * here is that this ran in the page and stopped there. Naming the browser
     * and the moment is what stops three chips reading as an illustration of
     * what sites see in general, rather than as this reader's own list, read a
     * second ago.
     *
     * On «каже про вас» and not «каже про вас нам»: the browser tells SITES,
     * and Movar is not among them. A line that put this site on
     * the receiving end would be false, and false in the exact direction the
     * whole product is a claim against — the sentence beside it says Movar
     * cannot see this. Whatever else these words become, they must never
     * acquire a first-person recipient.
     */
    /*
     * The row's label, and the thing that turns it from a sequence into a
     * ranking. Arrows alone say «then»: nothing in them says the first entry
     * is the one the reader actually gets. That reads acceptably at three
     * languages and falls apart at eight, which is an ordinary list — Chrome
     * adds a regional variant per keyboard layout.
     *
     * «У», not «В»: sentence-initial before a consonant cluster.
     *
     * It names the ordering rather than its consequence, and the draft before
     * it («Сайт бере першу, яку має») did the reverse. Naming it is the
     * shorter of the two and matches how the systems that own such a list
     * label it — the reference for this row was Binance's «Payment Priority
     * Order», which is this line's four words in another language. The
     * consequence is the guide's subject, one link below.
     *
     * The extension states both halves in one sentence on the options page
     * («Мовар просить у кожного сайту ці мови саме в такому порядку і бере
     * першу, яка там є», `packages/i18n/src/messages-uk.ts`). That is the right
     * length THERE, above a list the reader is about to reorder. Here it would
     * be a third variant of a claim already made twice on this page.
     */
    listRule: 'У порядку пріоритету',
    listSource:
      'Прочитано у вашому браузері, поки ви читаєте цю сторінку. Мовар цих даних не бачить.',
  },
  /**
   * The mono line beside every install button in this section — the diagnosis
   * strip, the checklist's twenty-first row, and each page's callout.
   *
   * One string rather than three, because these are factual claims about the
   * product (`docs/copy.md`), and three copies is how one of them quietly
   * stops being true. Everything in it is asserted elsewhere on the site in
   * these words: free and open-source in {@link guideStrings.cta}, sends
   * nothing in the checker's privacy line.
   */
  installMeta: 'безкоштовно · відкритий код · нічого не надсилає',
  index: {
    pageTitle: 'Як зробити українську мовою за замовчуванням — Movar',
    pageDescription:
      'Покрокові інструкції для системи, браузера, Google і сервісів: де заявити українську і як не дати налаштуванням відкотитися.',
    eyebrow: 'Інструкція',
    /** Tag on the cards that match the reader's own platform. */
    yours: 'ваше',
    title: 'Як зробити українську мовою за замовчуванням',
    lead: 'Прибрати російську недостатньо — видалення нічого не обирає. Оберіть, що налаштовуєте, і поставте українську першою за кілька хвилин.',
    /**
     * The hub's freshness stamp: how many pages it indexes and the most
     * recent `updated` date among them, e.g. «20 сторінок · оновлено 13
     * серпня 2026» — one honest signal for a reader deciding whether to
     * trust the whole guide before opening any single page.
     *
     * `{count}`, `{word}` and `{date}` are substituted by the hub; `date` is
     * `formatUpdated`'s output. `word` is the pluralised «сторінка» — the
     * three noun forms live here with the rest of the copy, but *which* one
     * applies is Ukrainian plural grammar, not copy, so that rule stays with
     * the page that renders this rather than joining the exports below.
     */
    freshness: {
      template: '{count} {word} · оновлено {date}',
      one: 'сторінка',
      few: 'сторінки',
      many: 'сторінок',
    },
  },
  /** The three rules, restated compactly on the hub. Every page below applies
   *  them, so they are stated once here rather than repeated twenty times. */
  rules: {
    heading: 'Три правила',
    lead: 'Усі інструкції нижче — застосування цих трьох правил.',
    items: [
      {
        title: 'Прибрати російську ≠ обрати українську',
        body: 'Мову контенту сервіси зважують з кількох сигналів одразу — мови запиту, інтерфейсу, пристрою та регіону. Профіль, у якому російської просто немає, розвʼязується в англійську. Українську треба поставити першою, а не просто звільнити місце.',
      },
      {
        title: 'Видалити, а не понизити',
        body: 'Сайт бере з вашого списку найвищу мову, яку підтримує. Якщо української та англійської версій у нього немає, російська на останньому місці все одно виграє — вона є в списку, і цього достатньо.',
      },
      {
        title: 'Мова інтерфейсу ≠ мова контенту',
        body: 'Майже скрізь це два різні налаштування. Мова інтерфейсу пошуку Google не змінює мови результатів; мова інтерфейсу X не змінює стрічки. Якщо ви перемкнули інтерфейс, а нічого не змінилося — шукайте друге налаштування.',
      },
    ],
  },
  detect: {
    /** Rendered by the hub's on-device detection. `{platform}` is replaced. */
    heading: 'Схоже, у вас {platform}',
    body: 'Почніть із цих сторінок — решта нижче.',
  },
  page: {
    backToIndex: 'Усі інструкції',
    updated: 'Оновлено',
    /**
     * Heading over the cross-links at the foot of every page.
     *
     * `{group}` is the page's own group heading from {@link GUIDE_GROUPS}.
     * It used to read «Далі», which promised a sequence the guide does not
     * have: these pages are the REST OF THIS PAGE'S GROUP — four ways to do
     * the same job on four platforms — and a reader who just fixed Chrome has
     * no reason to read Firefox next. Naming the group states the actual
     * relationship, and states it differently on each page.
     */
    siblingsHeading: 'Ще в розділі «{group}»',
  },
  /**
   * The guide's closing pitch — now the body of the checklist's twenty-first
   * row (`checklist.beyond`) rather than a `ReaderCta` prop.
   *
   * Distinct from the blog's because the reader arrives at it from a different
   * place: they have just changed their own settings, so the argument that
   * lands is the boundary of what settings reach — not the diagnosis they never
   * needed. Stays inside the honest claim the article makes: Movar does not
   * replace these settings, it holds sites to them.
   *
   * It moved because position was the whole problem: on a hub that runs to
   * roughly 6700px this was the last block on the page, argued to whoever was
   * still scrolling. Attached to the checklist it is read by everyone who
   * finishes the list.
   */
  cta: {
    heading: 'Налаштування зроблено — далі залежить не від вас',
    body: 'Мовар — безкоштовне розширення з відкритим кодом. Воно бере на себе ту частину, яку налаштуваннями не закрити: передає вашу мову кожному сайту, знаходить українську версію, яка вже існує, і перемикає на неї. Усе рахується у вашому браузері.',
  },
  /**
   * Link to the explainer behind the guide. The hub says what to do; the
   * article says why the settings behave this way, for a reader who wants
   * that before touching anything.
   *
   * It is no longer a card of its own. As one it was full-width, in the same
   * treatment the page gives blocks that carry their own content («Що бачать
   * сайти», «Три правила»), and it held a teaser and a link. Worse, it was
   * headed «Як це працює», which everywhere else on movar.fyi names how the
   * EXTENSION works: the homepage section, the page that heading links to
   * there, and the footer column that renders half a screen below this one.
   * The same two words, a different subject, twice within one screen — so the
   * block read as a stray copy of a section that lives elsewhere.
   *
   * The heading now names its own subject, and the block renders as a second
   * footnote under {@link about}'s hairline. That is the job it does: optional
   * further reading, with nothing above the rule depending on the reader
   * following it — the same argument that put `about` down there, and the
   * reason this block took the loud treatment badly. Left where it was, it
   * would now be the one full-weight card standing between the checklist and a
   * deliberately quiet foot.
   */
  explainer: {
    heading: 'Чому налаштувань так багато',
    body: 'Їх близько десятка, вони лежать у різних місцях і майже не повʼязані між собою. Стаття пояснює, як програми обирають мову — і чому набір, правильний на вигляд, дає не той результат.',
    linkLabel: 'Прочитати пояснення',
  },
  /**
   * What the guide is — and, more importantly, what it is not.
   *
   * «Мовна гігієна» names the idea the guide is built on: language settings
   * are upkeep, not one-time setup, because they silently roll back. But the
   * phrase is already used in Ukrainian for watching your own speech —
   * surzhyk, calques, «правильні» слова — so leaving it undefined invites a
   * reading the guide does not intend. Hence this block, and hence the three
   * explicit negations: they close off the misreadings rather than hoping
   * nobody arrives at them.
   *
   * Rendered as a footnote at the foot of the hub — quieter type under a
   * hairline rule — because that is the job it does. The term appears nowhere
   * else on the page, so nothing above depends on the reader having read this;
   * it is here for the reader who arrives at the misreading, not for everyone.
   */
  about: {
    heading: 'Що таке мовна гігієна',
    body: '«Гігієна» тут у тому ж значенні, що в «цифровій гігієні»: кілька простих речей, які варто робити регулярно, щоб середовище лишалося таким, як ви його налаштували. Мовна гігієна — це доглядати за тим, як ви заявляєте свою мову, і не давати налаштуванням тихо відкотитися: додана клавіатура повертає мову до списку, а Google дописує до профілю ту мову, якою ви щось прочитали.',
    notHeading: 'Чим це не є',
    not: [
      {
        title: 'Це не про те, як ви говорите й пишете',
        body: 'Тут не буде ні суржику, ні кальок, ні «правильних» слів. Ідеться не про ваше мовлення, а про ваше середовище: мову, якою з вами розмовляють інтерфейси, пошук і стрічки.',
      },
      {
        title: 'Це не про оцінку мов чи текстів',
        body: 'Критерій один — мова, якою ви попросили з вами говорити. Російська згадується тут часто, бо саме вона найчастіше приїжджає замість української за замовчуванням, і сховати це означало б не пояснити механізм.',
      },
      {
        title: 'Це не «прибрати російську»',
        body: 'Видалення нічого не обирає: звільнене місце дістається наступній мові в черзі — зазвичай англійській, а там, де української немає зовсім, тій, яку стандарт вважає найближчою: для української це була російська, і прибрали це лише у жовтні 2024-го. Саме тому кожен крок сформульовано як «поставте українську першою».',
      },
    ],
    /** To the post the term comes from — the only place on the site that
     *  explains why these settings roll back rather than stating that they do. */
    linkLabel: 'Чому налаштування повертаються назад',
  },
  /**
   * The honest boundary. Everything above is the reader's half of the deal;
   * this is where the other half starts, and where the extension has a
   * legitimate reason to appear rather than an advertising one.
   *
   * Rendered by `GuideChecklist` immediately above the twenty-first row, not
   * as a section of its own further down: this paragraph is the evidence for
   * the claim that row makes ({@link cta}), and an argument printed after its
   * conclusion is decoration. It is also the only place on the hub that
   * carries the mechanism in full — the mislabelled `lang`, the menu link back
   * to Russian, the guessed signal in a feed — which the diagnosis card and
   * the row both compress to a sentence.
   */
  limits: {
    heading: 'Чого не полагодити налаштуваннями',
    body: 'Заголовок, який надсилає браузер, — це прохання, і сервер може його проігнорувати. Сайт може віддати російський текст, підписавши його як українську; посилання в меню може повернути вас на російську версію. Рекомендаційні стрічки мають ще один шар: налаштування прибирає заявлений сигнал, але не вгаданий — X прямо каже, що перелік «мов, які ви можете знати» він склав із вашої активності. Тому стрічки вирівнюються тижнями й від того, що ви дивитесь, а не тільки від того, що ви обрали.',
  },
  /**
   * The closing checklist. Ticks live in `localStorage` — on the device, like
   * everything else on this page — so a reader can work through twenty
   * settings across several sittings without losing their place.
   */
  /**
   * The closing checklist. Ticks live in `localStorage` — on the device, like
   * everything else on this page — so a reader can work through twenty
   * settings across several sittings without losing their place.
   *
   * Every item carries the page that explains it, so the checklist doubles as
   * an index and the hub does not have to inventory the same twenty settings
   * twice. Items whose page depends on the reader's own OS point at the group
   * block instead of guessing a platform.
   *
   * Exactly one item is `auto`: whether the browser really asks for Ukrainian
   * is the only line on this list a machine can settle, and it is settled by
   * the diagnosis at the top of the page. It renders as a verdict rather than a
   * checkbox, labelled so the difference from the nineteen manual ticks is
   * visible rather than hidden.
   */
  checklist: {
    heading: 'Чекліст',
    lead: 'Скрізь, де є список мов, цільовий стан один: українська перша, англійська друга, російської в списку немає.',
    /** `{done}` and `{total}` are substituted by the component. */
    progress: '{done} з {total}',
    reset: 'Очистити',
    /** Sticky bar, shown while the checklist is in view. */
    totalLabel: 'Загальний поступ',
    /** Mono label on the machine-settled row. */
    autoLabel: 'перевірено вище',
    /** Shown on that row while the diagnosis has no answer. */
    autoUnknown: 'не перевірено',
    /**
     * The row that closes the list — and the only one with no checkbox.
     *
     * The checklist's implicit promise is «do these twenty things and you are
     * done», and that promise is not true: a site is free to ignore a perfect
     * list. Stating the twenty-first item as a *row of the list* is the honest
     * shape, because it is genuinely part of the same job; rendering it without
     * a tick is what keeps it from claiming to be part of the same tally.
     *
     * Its heading and body are {@link guideStrings.cta} — the closing pitch
     * this guide already had, which used to sit ~700px lower inside
     * `ReaderCta` where a reader who had just finished twenty settings was
     * least likely to still be scrolling. It is the same argument at the moment
     * it lands, not a new one — and {@link guideStrings.limits} now sits
     * directly above it, so the row reads as the conclusion of the paragraph
     * before it rather than a claim the reader is asked to take on trust.
     */
    beyond: {
      label: '21 · не ставиться галочкою',
      /** Sticky-bar CTA, revealed only once all twenty are ticked — a reader
       *  mid-list is being told about a step they have not reached. */
      done: 'Лишився крок 21',
    },
    groups: [
      {
        heading: 'Пристрій',
        group: 'device',
        items: [
          { id: 'os-lang', label: 'Мова інтерфейсу системи — українська', to: 'group:device' },
          {
            id: 'os-list',
            label: 'Список мов упорядковано, російської в ньому немає',
            to: 'group:device',
          },
          { id: 'os-region', label: 'Регіон — Україна', to: 'group:device' },
          {
            id: 'os-keys',
            label: 'Розкладки: лишилися українська та англійська',
            to: 'page:klaviatura',
          },
          {
            id: 'os-recheck',
            label: 'Після зміни клавіатур список мов перевірено ще раз',
            to: 'page:klaviatura',
          },
        ],
      },
      {
        heading: 'Браузер',
        group: 'browser',
        items: [
          { id: 'br-pages', label: 'Мова сторінок — українська перша', to: 'group:browser' },
          { id: 'br-ui', label: 'Мова інтерфейсу браузера — українська', to: 'group:browser' },
          {
            id: 'br-check',
            label: 'Браузер справді просить українську',
            to: 'page:perevirka',
            auto: true,
          },
        ],
      },
      {
        heading: 'Google',
        group: 'account',
        items: [
          {
            id: 'g-account',
            label: 'Мова облікового запису — українська',
            to: 'page:google-akaunt',
          },
          { id: 'g-auto', label: 'Автододавання мов вимкнено', to: 'page:google-akaunt' },
          {
            id: 'g-display',
            label: 'Мова інтерфейсу пошуку — українська',
            to: 'page:google-poshuk',
          },
          {
            id: 'g-results',
            label: 'Фільтр мови результатів — українська',
            to: 'page:google-poshuk',
          },
          { id: 'g-region', label: 'Регіон пошуку — Україна', to: 'page:google-poshuk' },
          {
            id: 'g-products',
            label: 'Gmail, YouTube, Maps і News перевірено окремо',
            to: 'page:google-servisy',
          },
        ],
      },
      {
        heading: 'Сервіси й сайти',
        group: 'service',
        items: [
          {
            id: 's-steam',
            label: 'Steam: клієнт і магазин — два різні налаштування',
            to: 'page:steam',
          },
          { id: 's-fb', label: 'Facebook: перевірено на кожному пристрої', to: 'page:socmerezhi' },
          {
            id: 's-x',
            label: 'X: перелік «мов, які ви можете знати» почищено',
            to: 'page:socmerezhi',
          },
          { id: 's-netflix', label: 'Netflix: на кожному профілі', to: 'page:netflix-spotify' },
          {
            id: 's-mail',
            label: 'Мова листів і сповіщень — окремо від мови інтерфейсу',
            to: 'page:sajty',
          },
          {
            id: 'site-pick',
            label: 'На щоденних сайтах мову обрано на самому сайті',
            to: 'page:sajty',
          },
        ],
      },
    ],
  },
} as const;

/**
 * Resolve a checklist item's `to` into an href.
 *
 * Two forms, because two things a reader can be sent to are genuinely
 * different: `page:<id>` is one instruction, `group:<id>` is the hub block
 * listing every platform's version of it. Items whose page depends on the
 * reader's own OS take the second form rather than guessing Windows.
 */
export function checklistHref(to: string): string {
  const [kind, id] = to.split(':');
  return kind === 'group' ? `#${guideGroupAnchor(id ?? '')}` : guidePageHref(id ?? '');
}

/** Label for that link — the page's own nav label, or the group's heading. */
export function checklistLinkLabel(to: string): string {
  const [kind, id] = to.split(':');
  if (kind === 'group') {
    return GUIDE_GROUPS.find((group) => group.id === id)?.heading ?? '';
  }
  return CHECKLIST_PAGE_LABELS[id ?? ''] ?? '';
}

/**
 * Nav labels for the pages the checklist links to.
 *
 * A literal table rather than a lookup into the content collection: the
 * checklist renders in the same island as the progress count, which has no
 * access to `getCollection`, and `marketing.guide.spec.ts` walks every one of
 * these hrefs so a renamed page fails there rather than 404ing quietly.
 */
const CHECKLIST_PAGE_LABELS: Record<string, string> = {
  klaviatura: 'Клавіатури',
  perevirka: 'Перевірка',
  'google-akaunt': 'Обліковий запис',
  'google-poshuk': 'Пошук Google',
  'google-servisy': 'Gmail, Maps, News',
  steam: 'Steam',
  socmerezhi: 'Facebook, Instagram, X',
  'netflix-spotify': 'Netflix, Spotify',
  sajty: 'Куки й листи',
};
