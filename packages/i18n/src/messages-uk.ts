import type { Messages } from './messages-en';
import { plural } from './plural';

/**
 * Ukrainian one/few/many noun agreement, via `Intl.PluralRules` (CLDR). Integer
 * counts only ever land in one/few/many — the 'other' category is for fractions
 * — so we map 'other' onto the many form. Thin positional (one, few, many)
 * wrapper kept so the call sites below read cleanly and don't repeat the
 * other === many mapping.
 */
function ukPlural<T>(n: number, one: T, few: T, many: T): T {
  return plural('uk', n, { one, few, many, other: many });
}

/**
 * Ukrainian accusative of the supported language endonyms. Action labels whose
 * verb takes a direct object («Видалити …», «Розблокувати …», «Підняти …»)
 * need the accusative — «Видалити українську», not the nominative «Видалити
 * українська». The endonyms are a fixed, closed list (the catalogue's
 * `Intl.DisplayNames('uk')` output), so a lookup beats a declension engine.
 * Unknown names pass through unchanged.
 */
const ACCUSATIVE_ENDONYM: Record<string, string> = {
  українська: 'українську',
  російська: 'російську',
  англійська: 'англійську',
  німецька: 'німецьку',
  польська: 'польську',
  французька: 'французьку',
  іспанська: 'іспанську',
  італійська: 'італійську',
};
function accusative(name: string): string {
  return ACCUSATIVE_ENDONYM[name] ?? name;
}

export const messagesUk: Messages = {
  status: {
    turnOn: 'Увімкнути Мовар',
  },
  pageStatus: {
    servedIn: (name) => `Мова сторінки — ${name}`,
    blockedTitle: (name) => `Мова сторінки — ${name}`,
    blockedDetail: 'Мовар не знайшов способу перемкнути її тут',
    retrySwitch: 'Спробувати перемкнути знову',
    hiding: (names) =>
      names.length > 0
        ? `Приховано на цій сторінці: ${names.join(', ')}`
        : 'Заблокований вміст приховано на цій сторінці',
    clean: 'Заблокованих мов тут немає',
    reload: 'Мовар тут ще не працює',
    reloadCta: 'Перезавантажити сторінку',
    exemptTitle: 'Мовар вимкнено на цьому сайті',
    exemptDetail: 'Він у вашому списку виключень',
    exemptUntilUpdateDetail: 'Вимкнено до наступного оновлення Мовара',
    enableSiteCta: 'Увімкнути для цього сайту',
    noPage: 'Відкрийте вебсторінку, щоб побачити Мовар у дії',
    snoozedTitle: 'Мовар призупинено на цьому сайті',
  },
  priorityLabel: 'Пріоритет',
  pausedTitle: 'Мовар призупинено',
  pausedUntilDate: (date) => `До ${date}`,
  pausedIndefinitely: 'Доки не відновите',
  pausedNoEnd: 'Без запланованого завершення',
  offTitle: 'Мовар вимкнено',
  offMessage: 'Нічого не блокується й не перемикається',
  hidden: {
    title: 'На цій сторінці',
    fromPickers: 'Приховано в перемикачах:',
    collapsed: (n) => {
      const noun = ukPlural(n, 'перемикач', 'перемикачі', 'перемикачів');
      const tail = ukPlural(
        n,
        'у якому залишився один пункт',
        'у яких залишився один пункт',
        'у яких залишився один пункт',
      );
      return `Згорнуто ${n} ${noun}, ${tail}`;
    },
    feedCurtained: (n) => {
      const noun = ukPlural(n, 'картка', 'картки', 'карток');
      return `${n} ${noun} за завісою`;
    },
    feedHidden: (n) => {
      const noun = ukPlural(n, 'картку', 'картки', 'карток');
      return `Приховано ${n} ${noun}`;
    },
    show: 'Показати все на цій сторінці',
    reload: 'Перезавантажте сторінку, щоб Мовар знову застосувався.',
    restored: 'Відновлено на цій сторінці — перезавантажте, щоб застосувати знову.',
    nothing: 'Нічого не приховано.',
  },
  pause: {
    title: 'Призупинити Мовар',
    durations: {
      '1h': '1 година',
      indefinite: 'Поки не відновлю',
    },
    resume: 'Продовжити',
    snoozeSite: 'Призупинити цей сайт на годину',
    exemptSite: 'Завжди пропускати цей сайт',
  },
  contentToggle: {
    label: 'Фільтрувати вміст заблокованими мовами',
    description: 'У перемикачах мов і стрічках вмісту',
  },
  concealMode: {
    legend: 'Як приховувати відфільтрований вміст',
    curtain: {
      label: 'Лишати за завісою',
      description: 'Картка лишається на місці за розмитою завісою',
    },
    hide: {
      label: 'Приховувати',
      description: 'Картка зникає, а стрічка стуляється',
    },
  },
  settings: 'Налаштування',
  feedback: 'Надіслати відгук',
  sourceCode: 'Вихідний код',
  report: {
    link: 'Повідомити про проблему',
    subject: (host) => (host == null ? 'Мовар — проблема' : `Мовар — проблема на ${host}`),
    bodyPrompt: (hasPage) =>
      hasPage
        ? 'Опишіть, що не так на цій сторінці. Дані нижче допоможуть нам відтворити проблему — ви можете прибрати те, чим не хочете ділитися.'
        : 'Опишіть проблему. Дані нижче допоможуть нам розібратися — ви можете прибрати те, чим не хочете ділитися.',
    blockedSite: {
      link: 'Цей сайт проігнорував мою мову',
      prompt:
        'Цей сайт показав заблоковану мову, і Мовар не зміг її перемкнути. Дані нижче допоможуть нам розібратися — ви можете прибрати те, чим не хочете ділитися.',
    },
  },
  errorBoundary: {
    title: 'Щось пішло не так',
    description: 'У Моварі стався збій. Перезавантажте або спробуйте згодом.',
    reload: 'Перезавантажити',
    turnOffSite: 'Вимкнути для цього сайту',
  },
  languageSelector: {
    label: 'Мова',
    auto: 'Авто',
    en: 'English',
    uk: 'Українська',
  },
  options: {
    nav: { languages: 'Мови' },
    aside: {
      howPriorityWorksTitle: 'Як працює пріоритет',
      howPriorityWorks:
        'Мовар домовляється про мову з кожним сайтом окремо. Якщо сайт має українську — отримуєш українську. Якщо лише англійську — англійську. Якщо лише російську — Мовар намагається переключити тебе на іншу.',
      blockedVsExemptTitle: 'Заблоковані vs виключені',
      blockedVsExempt:
        'Заблоковані мови запускають автоматичне переключення. Виключені сайти повністю ігноруються — Мовар на них нічого не робить.',
    },
    priority: {
      title: 'Пріоритет мов',
      intro: 'Мовар запитуватиме кожен сайт у цьому порядку; перша доступна виграє.',
      addLabel: 'Додати мову',
      addButton: 'Додати',
      moveUp: (language) => `Підняти ${accusative(language)} вище`,
      moveDown: (language) => `Опустити ${accusative(language)} нижче`,
      remove: (language) => `Видалити ${accusative(language)}`,
    },
    blocked: {
      title: 'Заблоковані мови',
      intro: 'Мовар переключатиметься з будь-якої сторінки, що подається цими мовами.',
      empty: 'Жодної мови не заблоковано.',
      addLabel: 'Заблокувати ще',
      addButton: 'Заблокувати',
      unblock: (language) => `Розблокувати ${accusative(language)}`,
      lockedHint: (language) => `${language} завжди заблокована`,
    },
    allowlist: {
      title: 'Виключені сайти',
      intro: 'Мовар не діє на цих доменах.',
      empty: 'Жодного сайту не виключено.',
      errorBadDomain: 'Введіть домен на кшталт example.com',
      errorDuplicate: 'Вже в списку',
      inputLabel: 'Домен для виключення',
      addButton: 'Додати',
      remove: (domain) => `Видалити ${domain}`,
    },
    pageContent: {
      title: 'Вміст сторінки',
    },
    insights: {
      title: 'Виправлення',
      empty: 'Поки що немає виправлень.',
      thisWeek: (n) => {
        const noun = ukPlural(n, 'виправлення', 'виправлення', 'виправлень');
        return `${n} ${noun} цього тижня`;
      },
      total: (n) => `${n} за останні 30 днів`,
      topSitesLabel: 'Найчастіші сайти',
      byMechanismLabel: 'За механізмом',
      byEngineLabel: 'За рушієм',
      syncTier: 'Синхронний рівень',
      siteCount: (n) => {
        const noun = ukPlural(n, 'виправлення', 'виправлення', 'виправлень');
        return `${n} ${noun}`;
      },
      mechanism: {
        header: 'Заголовок запиту',
        cookie: 'Кука',
        localStorage: 'Локальне сховище',
        redirect: 'Перенаправлення',
        dom: 'Вміст сторінки',
        search: 'Пошук',
        'search-retry': 'Повторний пошук',
      },
    },
  },
  onboarding: {
    title: 'Мовар встановлено',
    intro:
      'Мовар тримає кожну сторінку вашою мовою. Для цього він читає вміст кожної сторінки, щоб визначити її мову, — нижче показано, як це увімкнути.',
    stepLabel: (index, total) => `Крок ${index} з ${total}`,
    optionalBadge: 'Необовʼязково',
    steps: {
      pin: {
        title: 'Закріпіть Мовар',
        body: (browserName) =>
          `Відкрийте меню розширень у ${browserName} і закріпіть Мовар, щоб його значок лишався на панелі.`,
      },
    },
    // Apple's Ukrainian calls Settings «Параметри» on both iOS and macOS — the
    // same ruling the Safari host app spells out in `messages-uk.ts`. Movar's
    // own settings link stays «Налаштування» (`settings` above); every path
    // below points at Apple's UI, so it takes Apple's word.
    access: {
      chromium: {
        title: 'Дозвольте Мовару читати вміст сторінки',
        body: (browserName) =>
          `Мовар читає вміст кожної сторінки, щоб визначити її мову, а потім перемикає її на вашу. Натисніть кнопку нижче, щоб дозволити це в ${browserName}.`,
      },
      firefox: {
        title: 'Збережіть доступ до всіх сайтів',
        body: 'Firefox надає Мовару доступ до всіх сайтів під час встановлення. Якщо ви його вимкнули, натисніть кнопку нижче, щоб увімкнути знову.',
      },
      safari: {
        title: 'Дозвольте на всіх сайтах',
        body: 'У параметрах Safari відкрийте «Розширення», виберіть Мовар і оберіть «Дозволити на всіх сайтах».',
      },
      safariIos: {
        title: 'Дозвольте на всіх сайтах',
        body: 'У «Параметрах» відкрийте «Програми» → Safari → «Розширення» → Мовар і встановіть «Усі сайти» на «Дозволити».',
      },
    },
    enable: {
      safari: {
        title: 'Увімкніть Мовар',
        body: 'Відкрийте параметри Safari, перейдіть до «Розширень» і увімкніть Мовар.',
      },
      safariIos: {
        title: 'Увімкніть Мовар',
        body: 'У «Параметрах» відкрийте «Програми» → Safari → «Розширення», увімкніть Мовар і дозвольте його в приватному перегляді — нічого не покидає браузер, тож ваші приватні вкладки залишаються приватними.',
      },
    },
    permission: {
      granted: 'Мовар може читати вміст сторінки.',
      missing: 'Мовару потрібен дозвіл читати вміст сторінки — надайте доступ нижче.',
      recheck: 'Перевірити ще раз',
      button: 'Дозволити доступ',
      requesting: 'Запитуємо…',
    },
    reassuranceTitle: 'Нічого не покидає ваш браузер',
    reassurance:
      'Мовар лише читає вміст сторінки, щоб визначити її мову та перемкнути на вашу. У нього немає ні серверів, ні акаунтів, ні аналітики — жоден слід вашого перегляду не залишає пристрій. Увесь його код відкритий.',
  },
};
