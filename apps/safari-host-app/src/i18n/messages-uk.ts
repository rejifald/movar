import type { HostMessages } from './messages-en';

/**
 * Ukrainian string catalogue for the Safari host app's shell. Typed against
 * `HostMessages`, so any key the English canonical adds must be filled here too
 * or the build fails. Strings mirror the copy that previously lived in the
 * native `uk.lproj/Main.html`.
 */
export const messagesUk: HostMessages = {
  tabs: {
    detector: 'Визначник',
    audit: 'Перевірка',
    settings: 'Налаштування',
    about: 'Про',
  },
  detector: {
    title: 'Визначник мови',
    intro:
      'Вставте будь-який текст — Мовар визначить мову на вашому пристрої, нічого не надсилаючи.',
    placeholder: 'Вставте текст сюди…',
    detect: 'Визначити',
    notDetected: 'Кириличну мову не виявлено',
    ambiguous: 'Змішані сигнали — мова нечітка',
    unavailable: 'Визначення мови недоступне.',
    evidence: 'Ознаки',
    closestMatch: 'найближчий збіг',
    nativeName: 'Власна назва',
    matchedBy: 'Визначено за',
    matched: {
      '1': 'характерними літерами',
      '2a': 'функційними словами',
      '2b': 'частотними словами',
      '3': 'буквосполученнями',
    },
    clueLabels: {
      '1': 'Характерні літери',
      '2a': 'Функційні слова',
      '2b': 'Частотні слова',
      '3': 'Буквосполучення',
    },
    howItWorks: {
      title: 'Як це працює',
      intro:
        'Мовар визначає мову на вашому пристрої, проходячи рівні, доки один не дасть упевнену відповідь — результат показує, який саме.',
      layer1Title: 'Характерні літери',
      layer1Lead: 'Літери, які є в одній мові й відсутні в інших —',
      layer2Title: 'Функційні та частотні слова',
      layer2Detail: 'Короткі найпоширеніші слова кожної мови, далі — її частотна лексика.',
      layer3Title: 'Буквосполучення',
      layer3Detail: 'Сполучення літер, характерні для кожної мови, — для найскладніших уривків.',
      foot: 'Латиниця та інші системи письма читаються як невизначені. Нічого не надсилається.',
    },
    limitations: {
      title: 'Обмеження',
      items: [
        'Це не ШІ — фіксований набір перевірок, а не модель, що «розуміє» текст.',
        'Без сервера й без повного словника — він не шукає слів, і нічого не надсилається.',
        'Враховує лише ознаки в тексті: характерні літери, поширені слова та буквосполучення.',
        'Короткий, змішаний або латинізований текст може лишитися невизначеним.',
      ],
    },
  },
  audit: {
    title: 'Перевірити сайт',
    intro:
      'Погляньте, як сайт поводиться з мовами: що він про себе заявляє, що видає насправді і чи працює його перемикач мов.',
    placeholder: 'example.com',
    run: 'Перевірити',
    running: 'Перевіряємо…',
    runningNote: 'Запитуємо сторінку кілька разів — по разу на кожну мовну вподобу…',
    progress: (done, total) => `Запит ${String(done)} з ${String(total)}`,
    uaPack: 'Ще й за українським законом',
    uaPackHint:
      'Закон 2704-VIII, ст. 27 ч. 6. Вимкнено типово: він стосується сайтів, що працюють на Україну, і лише ви знаєте, чи це такий сайт.',
    invalidUrl: 'Це не схоже на адресу сайту.',
    failed: 'Перевірка не завершилася. Про цей сайт нічого не повідомлено.',
    noBridge: 'Перевірка працює лише в застосунку Мовар.',
    brokenPromises: (count) =>
      `${String(count)} ${ukPlural(count, 'порушена обіцянка', 'порушені обіцянки', 'порушених обіцянок')}`,
    noBrokenPromises: 'Порушених обіцянок не знайдено',
    coverage: (ran, rules, notCollected) =>
      notCollected > 0
        ? `Виконано ${String(ran)} перевірок із ${String(rules)} · ${String(notCollected)} потребували даних, яких цей запуск не зібрав`
        : `Виконано ${String(ran)} перевірок із ${String(rules)}`,
    notCollectedNote:
      'Перевірки, яким забракло даних, так і позначено — вони ніколи не зараховуються як пройдені.',
    back: 'Перевірки',
    again: 'Перевірити ще раз',
    export: 'Експортувати',
    exportUnavailable: 'Експорт звіту працює лише в застосунку Мовар.',
    previous: 'Попередні перевірки',
    notStored:
      'Вони зберігаються лише на час цього сеансу — після закриття чи перевстановлення застосунку зникнуть. Щоб зберегти звіт, експортуйте його.',
    detail: 'Подробиці',
    detailRule: 'Перевірка',
    detailPage: 'Сторінка',
    detailFinding: 'У звіті',
    detailBasis: 'На підставі',
    detailDenominator: 'Із загальної кількості',
    denominator: (matched, examined) => `${String(matched)} із ${String(examined)} фрагментів`,
    findings: 'Що виявлено',
    observations: 'Спостереження',
    observationsNote:
      'Занотовано, але не зараховано як порушені обіцянки — це або результат автоматичного визначення мови, або контекст для читача, а не те, що сайт про себе заявив.',
    nothingToReport: 'Усі виконані перевірки не виявили порушень.',
    allRules: 'Що перевіряли',
    filterAll: 'Усі',
    findingCount: (count) =>
      `${String(count)} ${ukPlural(count, 'знахідка', 'знахідки', 'знахідок')}`,
    verdicts: {
      pass: 'пройдено',
      fail: 'порушено',
      warn: 'попередження',
      'not-applicable': 'не стосується',
      'not-collected': 'не перевірено',
    },
    findingVerdicts: {
      fail: 'Порушена обіцянка',
      warn: 'Попередження',
      observation: 'Спостереження',
      info: 'Виміряно',
    },
    pageCount: (count) =>
      `на ${String(count)} ${ukPlural(count, 'сторінці', 'сторінках', 'сторінках')}`,
    grounding: {
      declared: 'За тим, що сайт заявляє про себе',
      observed: 'За тим, що сайт видав насправді',
      classified: 'За автоматичним визначенням мови — це підказка, а не вирок',
    },
    downgraded: 'не зараховано як порушену обіцянку',
    privacy: {
      title: 'Як це працює',
      items: [
        'Запити йдуть лише на вказаний вами сайт і лише з цього пристрою. Сервера Мовара тут немає.',
        'Мовар підписується в кожному запиті й ніколи не вдає із себе браузер.',
        'Кожна перевірка починається без куків і має обмежену кількість запитів.',
        'Сайт за captcha-заслоном позначається як неперевірений — його ніколи не судять за сторінкою заслону.',
      ],
    },
  },
  settings: {
    enabledLabel: 'Мовар увімкнено',
    enabledHelp: 'Головний перемикач усього керування мовою.',
  },
  brandSubtitle: 'Налаштуйте інтернет на рідну мову.',
  // Apple's Ukrainian calls Settings «Параметри» on both iOS and macOS, and it
  // never mirrored the English macOS-13 "Preferences" → "Settings" rename — so
  // `settings` and `settingsLegacy` intentionally carry the SAME word here (the
  // ≤12 split is English-only). Not a copy-paste slip; don't dedupe them.
  // Movar's own settings tab stays «Налаштування» (`tabs.settings`) — that's our
  // UI, not Apple's app.
  chips: {
    settingsApp: 'Параметри',
    apps: 'Програми',
    safari: 'Safari',
    settings: 'Параметри',
    settingsLegacy: 'Параметри',
    extensions: 'Розширення',
    movar: 'Мовар',
  },
  pathThen: ' далі ',
  ios: {
    headline: 'Останній крок',
    helper: 'Відкрийте Мовар у застосунку «Параметри»:',
    action:
      'Увімкніть його та дозвольте й у приватному перегляді — Мовар має відкритий код і нічого не покидає браузер, тож ваші приватні вкладки залишаються приватними.',
  },
  macSetup: {
    headline: 'Останній крок',
    helper: 'Увімкніть Мовар у Safari:',
  },
  macOn: {
    headline: 'Мовар увімкнено',
    helper: 'Керуйте ним будь-коли в Safari:',
  },
  // Same «Параметри» story as `chips` above: Apple's uk wording didn't change
  // with the macOS-13 rename, so `label` and `legacy` coincide in Ukrainian.
  openPreferences: {
    label: 'Відкрити параметри Safari',
    legacy: 'Відкрити параметри Safari',
  },
  trust: {
    free: 'Безкоштовно',
    openSource: 'Відкритий код',
    privacy: 'Нічого не покидає браузер',
  },
  feedback: 'Надіслати відгук',
  about: {
    lede: 'Налаштуйте інтернет на рідну мову.',
    summary:
      'Мовар типово відкриває сайти українською, перемикає багатомовні сторінки з російської та може прибирати небажані мови з вмісту сторінок — автоматично.',
    whatTitle: 'Що робить Мовар',
    features: [
      {
        title: 'Типово відкриває сайти вашою мовою',
        desc: 'Спершу запитує українську, англійська — запасний варіант.',
      },
      {
        title: 'Перемикає з російської',
        desc: 'Коли багатомовна сторінка віддає заблоковану мову, Мовар переводить її на бажану.',
      },
      {
        title: 'Фільтрує вміст — необовʼязково',
        desc: 'Приховує записи заблокованою мовою у перемикачах мов і стрічках. Типово вимкнено.',
      },
    ],
    sourceCode: 'Початковий код',
    versionLink: (stamp) => `${stamp} — що нового`,
  },
};

/**
 * Ukrainian plural selection: one / few / many.
 *
 * One for 1, 21, 31…; few for 2–4, 22–24…; many for 0, 5–20, 25–30… — with the
 * teens 11–14 taking *many* despite ending in 1–4. The report headline and the
 * per-rule counts are the strings a reader should not have to parse twice, so
 * they are inflected properly rather than fudged to "обіцянок: N".
 */
function ukPlural(count: number, one: string, few: string, many: string): string {
  const TEENS_START = 11;
  const TEENS_END = 14;
  const FEW_END = 4;
  const TEEN_MODULUS = 100;
  const LAST_DIGIT_MODULUS = 10;
  const teen = count % TEEN_MODULUS;
  const last = count % LAST_DIGIT_MODULUS;
  if (teen >= TEENS_START && teen <= TEENS_END) return many;
  if (last === 1) return one;
  if (last >= 2 && last <= FEW_END) return few;
  return many;
}
