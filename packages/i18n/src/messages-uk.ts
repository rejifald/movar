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
    blockedDetail: 'Мовар не знайшов, як її перемкнути',
    retrySwitch: 'Спробувати перемкнути знову',
    hiding: (names) =>
      names.length > 0
        ? `Приховано на цій сторінці: ${names.join(', ')}`
        : 'Дещо на цій сторінці приховано',
    clean: 'Тут нічого перемикати',
    reload: 'Мовар тут ще не працює',
    reloadCta: 'Перезавантажити сторінку',
    exemptTitle: 'Мовар вимкнено на цьому сайті',
    exemptDetail: 'Ви обрали пропускати цей сайт',
    exemptUntilUpdateDetail: 'Вимкнено до наступного оновлення Мовара',
    enableSiteCta: 'Увімкнути для цього сайту',
    noPage: 'Відкрийте вебсторінку, щоб побачити Мовар у дії',
    snoozedTitle: 'Мовар призупинено на цьому сайті',
  },
  priorityLabel: 'Пріоритет',
  pausedTitle: 'Мовар призупинено',
  pausedUntilDate: (date) => `До ${date}`,
  pausedIndefinitely: 'Доки не продовжите',
  pausedNoEnd: 'Час завершення не вказано',
  offTitle: 'Мовар вимкнено',
  offMessage: 'Мовар нічого не перемикає і не приховує',
  hidden: {
    title: 'На цій сторінці',
    fromPickers: 'Приховано в перемикачах мов:',
    collapsed: (n) => {
      const noun = ukPlural(n, 'перемикач', 'перемикачі', 'перемикачів');
      const tail = ukPlural(
        n,
        'у якому лишився один пункт',
        'у яких лишився один пункт',
        'у яких лишився один пункт',
      );
      return `Приховано ${n} ${noun} мов, ${tail}`;
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
    reload: 'Перезавантажте сторінку, щоб Мовар знову спрацював.',
    restored: 'Усе на місці — перезавантажте, щоб Мовар знову спрацював.',
    nothing: 'Нічого не приховано.',
  },
  pause: {
    title: 'Призупинити Мовар',
    durations: {
      '1h': '1 година',
      indefinite: 'Поки не продовжу',
    },
    resume: 'Продовжити',
    snoozeSite: 'Призупинити цей сайт на годину',
    exemptSite: 'Завжди пропускати цей сайт',
  },
  contentToggle: {
    label: 'Приховувати вміст заблокованими мовами',
    description: 'У перемикачах мов і стрічках',
  },
  concealMode: {
    legend: 'Що робити з прихованим вмістом',
    curtain: {
      label: 'Лишати за завісою',
      description: 'Розмивається, але лишається на місці — натисніть, щоб зазирнути',
    },
    hide: {
      label: 'Приховувати',
      description: 'Зникає, а сусідні картки змикаються',
    },
  },
  settings: 'Налаштування',
  feedback: 'Надіслати відгук',
  sourceCode: 'Вихідний код',
  versionLink: (stamp) => `${stamp} — що нового`,
  report: {
    link: 'Повідомити про проблему',
    subject: (host) => (host == null ? 'Мовар — проблема' : `Мовар — проблема на ${host}`),
    bodyPrompt: (hasPage) =>
      hasPage
        ? 'Опишіть, що не так на цій сторінці. Дані нижче допоможуть нам побачити те саме, що й ви, — можете прибрати те, чим не хочете ділитися.'
        : 'Опишіть проблему. Дані нижче допоможуть нам розібратися — можете прибрати те, чим не хочете ділитися.',
    blockedSite: {
      link: 'Цей сайт проігнорував мою мову',
      prompt:
        'Цей сайт показував заблоковану мову, і Мовар не зміг її перемкнути. Дані нижче допоможуть нам розібратися — можете прибрати те, чим не хочете ділитися.',
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
        'Мовар просить у кожного сайту першу мову з вашого списку. Є українська — ви отримуєте українську. Є лише англійська — англійську. Є лише російська — Мовар пробує перемкнути вас на іншу.',
      blockedVsExemptTitle: 'Заблоковані мови й пропущені сайти',
      blockedVsExempt:
        'Заблокована мова змушує Мовар перемкнути сторінку з неї. Пропущений сайт лишається як є — там Мовар не робить нічого.',
    },
    priority: {
      title: 'Пріоритет мов',
      intro: 'Мовар просить у кожного сайту ці мови саме в такому порядку і бере першу, яка там є.',
      addLabel: 'Додати мову',
      addButton: 'Додати',
      moveUp: (language) => `Підняти ${accusative(language)} вище`,
      moveDown: (language) => `Опустити ${accusative(language)} нижче`,
      remove: (language) => `Видалити ${accusative(language)}`,
    },
    allowlist: {
      title: 'Сайти, які Мовар пропускає',
      intro: 'Ці сайти Мовар не чіпає.',
      empty: 'Поки що Мовар не пропускає жодного сайту.',
      errorBadDomain: 'Введіть адресу на кшталт example.com',
      errorDuplicate: 'Вже в списку',
      inputLabel: 'Сайт, який пропускати',
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
      byMechanismLabel: 'Як саме',
      bySourceLabel: 'Звідки Мовар знає мову',
      siteCount: (n) => {
        const noun = ukPlural(n, 'виправлення', 'виправлення', 'виправлень');
        return `${n} ${noun}`;
      },
      mechanism: {
        header: 'Попросив у сайту',
        cookie: 'Зберіг вибір на сайті',
        localStorage: 'Зберіг вибір у браузері',
        redirect: 'Відкрив потрібну адресу',
        dom: 'Змінив на сторінці',
        search: 'Додав підказку в пошук',
        'search-retry': 'Пошукав ще раз',
      },
      source: {
        declared: 'Сторінка сама сказала',
        read: 'Прочитав текст сторінки',
      },
    },
  },
  onboarding: {
    title: 'Мовар встановлено',
    intro:
      'Мовар відкриває кожну сторінку вашою мовою. Для цього він читає вміст сторінки, щоб визначити її мову, — нижче показано, як це увімкнути.',
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
