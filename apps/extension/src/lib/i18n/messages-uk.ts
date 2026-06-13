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
    turnOn: 'Увімкнути Movar',
  },
  pageStatus: {
    servedIn: (name) => `Мова сторінки — ${name}`,
    blockedTitle: (name) => `Мова сторінки — ${name}`,
    blockedDetail: 'Movar не знайшов способу перемкнути її тут',
    hiding: (names) =>
      names.length > 0
        ? `Приховано на цій сторінці: ${names.join(', ')}`
        : 'Заблокований вміст приховано на цій сторінці',
    clean: 'Заблокованих мов тут немає',
    reload: 'Movar тут ще не працює',
    reloadCta: 'Перезавантажити сторінку',
    exemptTitle: 'Movar вимкнено на цьому сайті',
    exemptDetail: 'Він у вашому списку виключень',
    enableSiteCta: 'Увімкнути для цього сайту',
    noPage: 'Відкрийте вебсторінку, щоб побачити Movar у дії',
  },
  priorityLabel: 'Бажаний порядок',
  priority: (names) => `Пріоритет ${names.join(' → ')}`,
  pausedTitle: 'Movar призупинено',
  pausedUntilDate: (date) => `До ${date}`,
  pausedIndefinitely: 'Доки не відновите',
  pausedNoEnd: 'Без запланованого завершення',
  offTitle: 'Movar вимкнено',
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
    reload: 'Перезавантажте сторінку, щоб Movar знову застосувався.',
    restored: 'Відновлено на цій сторінці — перезавантажте, щоб застосувати знову.',
    nothing: 'Нічого не приховано.',
  },
  pause: {
    title: 'Призупинити Movar',
    durations: {
      '1h': '1 година',
      indefinite: 'Поки не відновлю',
    },
    resume: 'Продовжити',
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
  report: {
    link: 'Повідомити про проблему',
    subject: (host) => (host == null ? 'Movar — проблема' : `Movar — проблема на ${host}`),
    bodyPrompt: (hasPage) =>
      hasPage
        ? 'Опишіть, що не так на цій сторінці. Дані нижче допоможуть нам відтворити проблему — ви можете прибрати те, чим не хочете ділитися.'
        : 'Опишіть проблему. Дані нижче допоможуть нам розібратися — ви можете прибрати те, чим не хочете ділитися.',
    blockedSite: {
      link: 'Цей сайт проігнорував мою мову',
      prompt:
        'Цей сайт показав заблоковану мову, і Movar не зміг її перемкнути. Дані нижче допоможуть нам розібратися — ви можете прибрати те, чим не хочете ділитися.',
    },
  },
  errorBoundary: {
    title: 'У Movar сталася непередбачена помилка',
    description:
      'Не вдалося завантажити спливне вікно. Перезавантажте, щоб спробувати ще раз — ваші налаштування не постраждали.',
    reload: 'Перезавантажити',
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
        'Movar домовляється про мову з кожним сайтом окремо. Якщо сайт має українську — отримуєш українську. Якщо лише англійську — англійську. Якщо лише російську — Movar намагається переключити тебе на іншу.',
      blockedVsExemptTitle: 'Заблоковані vs виключені',
      blockedVsExempt:
        'Заблоковані мови запускають автоматичне переключення. Виключені сайти повністю ігноруються — Movar на них нічого не робить.',
    },
    priority: {
      title: 'Пріоритет мов',
      intro: 'Movar запитуватиме кожен сайт у цьому порядку; перша доступна виграє.',
      addLabel: 'Додати мову',
      moveUp: (language) => `Підняти ${accusative(language)} вище`,
      moveDown: (language) => `Опустити ${accusative(language)} нижче`,
      remove: (language) => `Видалити ${accusative(language)}`,
    },
    blocked: {
      title: 'Заблоковані мови',
      intro: 'Movar переключатиметься з будь-якої сторінки, що подається цими мовами.',
      empty: 'Жодної мови не заблоковано.',
      addLabel: 'Заблокувати ще',
      unblock: (language) => `Розблокувати ${accusative(language)}`,
      lockedHint: (language) => `${language} завжди заблокована`,
    },
    allowlist: {
      title: 'Виключені сайти',
      intro: 'Movar не діє на цих доменах.',
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
    io: {
      export: 'Експортувати налаштування',
      import: 'Імпортувати налаштування',
      importError: 'Цей файл не містить дійсних налаштувань Movar.',
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
      },
    },
  },
};
