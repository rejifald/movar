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
    audit: 'Аудит',
    settings: 'Налаштування',
    about: 'Про Мовар',
  },
  detector: {
    title: 'Яка це мова?',
    intro:
      'Вставте будь-який текст — Мовар визначить мову на вашому пристрої, нічого не надсилаючи.',
    placeholder: 'Вставте текст сюди…',
    detect: 'Визначити',
    notDetected: 'Кириличної мови тут не знайдено',
    ambiguous: 'Змішані сигнали — мова нечітка',
    unavailable: 'Визначення мови недоступне.',
    evidence: 'Що видало мову',
    closestMatch: 'найближчий збіг',
    nativeName: 'Власна назва',
    matchedBy: 'Упізнано за',
    matched: {
      '1': 'характерними літерами',
      '2a': 'дрібними щоденними словами',
      '2b': 'поширеними словами',
      '3': 'сполученнями літер',
    },
    clueLabels: {
      '1': 'Характерні літери',
      '2a': 'Дрібні щоденні слова',
      '2b': 'Поширені слова',
      '3': 'Сполучення літер',
    },
    howItWorks: {
      title: 'Як це працює',
      intro:
        'Мовар читає текст на вашому пристрої й пробує одну ознаку за одною, доки якась не дасть упевнену відповідь, — результат показує, яка саме.',
      layer1Title: 'Характерні літери',
      layer1Lead: 'Літери, які є в одній мові й відсутні в інших —',
      layer2Title: 'Дрібні та поширені слова',
      layer2Detail:
        'Короткі слова, на які спирається кожна мова, а далі — ті, що вживає найчастіше.',
      layer3Title: 'Сполучення літер',
      layer3Detail: 'Сполучення літер, характерні для кожної мови, — для найскладніших уривків.',
      foot: 'Латиниця та інші абетки лишаються невизначеними. Нічого не надсилається.',
    },
    limitations: {
      title: 'Чого він не вміє',
      items: [
        'Це не ШІ — фіксований набір перевірок, а не модель, що «розуміє» текст.',
        'Без сервера й без повного словника — він не шукає слів, і нічого не надсилається.',
        'Зважає лише на те, що є в тексті: характерні літери, поширені слова та сполучення літер.',
        'Короткий, змішаний або латинізований текст може лишитися невизначеним.',
      ],
    },
  },
  audit: {
    title: 'Аудит сайту',
    intro: 'Що сайт заявляє про мови, що видає насправді і чи працює його перемикач.',
    placeholder: 'example.com',
    run: 'Провести аудит',
    running: 'Аудит триває…',
    runningNote: 'По одному запиту на кожну мову…',
    progress: (done, total) => `Запит ${String(done)} з ${String(total)}`,
    uaPack: 'Набір правил українського закону',
    uaPackLaw: 'Закон 2704-VIII, ст. 27 ч. 6.',
    uaPackHint: 'Стосується сайтів, що працюють на Україну, — вмикайте свідомо.',
    invalidUrl: 'Це не схоже на адресу сайту.',
    failed: 'Аудит не завершився. Про цей сайт нічого не повідомлено.',
    noBridge: 'Аудит працює лише в застосунку Мовар.',
    brokenPromises: (count) =>
      `${String(count)} ${ukPlural(count, 'порушена обіцянка', 'порушені обіцянки', 'порушених обіцянок')}`,
    noBrokenPromises: 'Порушених обіцянок не знайдено',
    // `ukPlural` on the numerator, unlike the English: «2 перевірок» was
    // ungrammatical for every count outside the *many* bucket, and the fix
    // arrives with the noun change rather than after it.
    coverage: (ran, rules, notCollected) =>
      notCollected > 0
        ? `Виконано ${String(ran)} ${ukPlural(ran, 'правило', 'правила', 'правил')} із ${String(rules)} · ${String(notCollected)} не перевірено`
        : `Виконано ${String(ran)} ${ukPlural(ran, 'правило', 'правила', 'правил')} із ${String(rules)}`,
    notCollectedNote: 'Неперевірене не зараховується як пройдене.',
    engine: (build) => `Рушій: ${build}`,
    engineUnknown: 'невідомий',
    back: 'Аудити',
    again: 'Провести аудит ще раз',
    export: 'Експортувати',
    exportUnavailable: 'Експорт звіту працює лише в застосунку Мовар.',
    previous: 'Попередні аудити',
    removeRun: (target) => `Вилучити ${target} зі списку`,
    removeConfirm: {
      question: 'Вилучити цей аудит?',
      confirm: 'Вилучити',
      cancel: 'Скасувати',
    },
    notStored: 'Лише на час сеансу. Щоб зберегти — експортуйте звіт.',
    detail: 'Подробиці',
    detailRule: 'Правило',
    detailPage: 'Сторінка',
    detailFinding: 'Як сформульовано',
    detailBasis: 'На підставі',
    detailDenominator: 'З усіх',
    denominator: (matched, examined) => `${String(matched)} із ${String(examined)} фрагментів`,
    findings: 'Що виявлено',
    observations: 'Спостереження',
    observationsNote: 'Занотовано, але не зараховано як порушені обіцянки.',
    allRules: 'Кожне правило та його підсумок',
    filterAll: 'Усі',
    findingCount: (count) =>
      `${String(count)} ${ukPlural(count, 'знахідка', 'знахідки', 'знахідок')}`,
    whyNotCollected: (missing) => `Цей аудит не зібрав ${missing}.`,
    whyNotApplicable: (reason) => `Це правило не стосується цього сайту — ${reason}.`,
    whyPassed: 'Правило виконано на зібраних даних — порушень не виявлено.',
    listAnd: ' та ',
    goToFindings: 'Перейти до знахідок',
    // У родовому відмінку — вони стоять лише після «не зібрав».
    capabilities: {
      static: 'HTML сторінки',
      http: 'справжньої HTTP-відповіді — коду, заголовків, редиректів',
      matrix: 'тієї самої сторінки, запитаної окремо кожною мовою',
      traversal: 'дозволу переходити за посиланнями, які заявляє сайт',
      'multi-vantage':
        'запитів із різних країн — без них не видно, чи сайт обирає мову за вашою IP-адресою',
      browser: 'сторінки в тому вигляді, як її будує браузер, із виконаними скриптами',
      site: 'більш ніж однієї сторінки сайту',
    },
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
    confirm: {
      title: 'Це надішле запит на сайт',
      body: (host) => `Мовар кілька разів завантажить ${host} — по разу на кожну мову.`,
      points: [
        'Нічого про вас: ні куків, ні облікового запису, ні ідентифікаторів.',
        'Мовар називає себе — власник сайту побачить запит у своїх логах.',
        'Сервера Мовара між вами немає.',
      ],
      once: 'Питаємо один раз за сеанс.',
      cancel: 'Скасувати',
      proceed: 'Зрозуміло, провести аудит',
    },
    matrix: {
      title: 'Як сайт відповідав',
      intro: 'Та сама адреса — щоразу її просили іншою мовою.',
      colAsked: 'Запитано',
      colServed: 'Видано',
      noPreference: 'без запиту мови',
      noAnswer: 'не відповів',
      errored: 'сторінку з помилкою',
      undeclared: 'мову не заявлено',
      openSite: 'Відкрити сайт',
    },
    about: {
      title: 'Що таке Мовар Аудит',
      body: 'Розширення Мовар виправляє одну сторінку — для вас і мовчки. Мовар Аудит — це друга половина: наведіть його на сайт — свій чи будь-чий — і він покаже, як той насправді поводиться з мовами, з доказами до кожного висновку.',
      points: [
        'Він ніколи не каже, які мови вам додати. Він показує, де сайт заявив мову — і не видав її. Це дефект із відтворенням, а не думка.',
        'Кожен висновок — із незмінного набору правил, того самого, який виконує програма в терміналі: тут ви бачите те саме, що побачить ваша збірка.',
        'Звіт несе дані, на яких його ухвалено, тож будь-хто може повторити аудит і отримати ту саму відповідь — ваша команда чи компанія, якій ви його надішлете.',
      ],
    },
    privacy: {
      title: 'Як проходить аудит',
      items: [
        'Запити йдуть лише на вказаний сайт із вашого пристрою — сервера Мовара немає.',
        'Без куків, з обмеженим числом запитів, і Мовар завжди називає себе.',
        'Сайт, який просить Мовар довести, що він не робот, лишається неперевіреним, а не засудженим.',
      ],
    },
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
      'Мовар відкриває сайти українською, перемикає сторінки з російської там, де сайт дає вибір, і може приховувати небажані мови просто на сторінці — автоматично.',
    whatTitle: 'Що робить Мовар',
    features: [
      {
        title: 'Відкриває сайти вашою мовою',
        desc: 'У кожного сайту спершу просить українську, потім англійську.',
      },
      {
        title: 'Перемикає з російської',
        desc: 'Коли сайт має кілька мов і віддає заблоковану, Мовар перемикає сторінку на вашу.',
      },
      {
        title: 'Приховує вміст — необовʼязково',
        desc: 'Приховує записи заблокованими мовами в перемикачах мов і стрічках. За замовчуванням вимкнено.',
      },
    ],
    sourceCode: 'Вихідний код',
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
