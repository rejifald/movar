import type { Messages } from './messages-en';

/**
 * Ukrainian one/few/many plural rule (CLDR).
 *  - one: 1, 21, 31, … (mod10 === 1 && mod100 !== 11)
 *  - few: 2-4, 22-24, … (mod10 in 2..4 && mod100 not in 12..14)
 *  - many: everything else (0, 5-20, 25-30, …)
 */
// CLDR plural-operand boundaries for Ukrainian (see the rule summary above).
const ONES_MODULUS = 10;
const TENS_MODULUS = 100;
const TEEN_EXCEPTION = 11; // mod100 === 11 → many, despite mod10 === 1
const FEW_MAX_ONES = 4; // mod10 in 2..4 → few
const TEEN_RANGE_MIN = 12; // mod100 in 12..14 → many, despite mod10 in 2..4
const TEEN_RANGE_MAX = 14;

function ukPlural<T>(n: number, one: T, few: T, many: T): T {
  const mod10 = n % ONES_MODULUS;
  const mod100 = n % TENS_MODULUS;
  if (mod10 === 1 && mod100 !== TEEN_EXCEPTION) return one;
  if (mod10 >= 2 && mod10 <= FEW_MAX_ONES && (mod100 < TEEN_RANGE_MIN || mod100 > TEEN_RANGE_MAX)) {
    return few;
  }
  return many;
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
    feedHidden: (n) => {
      const noun = ukPlural(n, 'картку', 'картки', 'карток');
      return `Приховано ${n} ${noun} у стрічці`;
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
    label: 'Приховувати вміст заблокованими мовами',
    description: 'У перемикачах мов і стрічках вмісту',
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
      moveUp: (language) => `Підняти ${language} вище`,
      moveDown: (language) => `Опустити ${language} нижче`,
      remove: (language) => `Видалити ${language}`,
    },
    blocked: {
      title: 'Заблоковані мови',
      intro: 'Movar переключатиметься з будь-якої сторінки, що подається цими мовами.',
      empty: 'Жодної мови не заблоковано.',
      addLabel: 'Заблокувати ще',
      unblock: (language) => `Розблокувати ${language}`,
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
      intro:
        'Коли увімкнено, Movar також приховує заблоковані мови з перемикачів на сайтах і розмиває картки вмісту (наприклад, відео на YouTube) заблокованою мовою. Вимкнено за замовчуванням; увімкни, щоб сторінка була охайнішою.',
      toggleLabel: 'Дозволити Movar змінювати вміст сторінок на відвіданих сайтах.',
    },
  },
  content: {
    pickerHidden: {
      chipLabel: (endonym) =>
        endonym === null
          ? 'Movar приховав перемикач мов — натисніть, щоб показати'
          : `Movar — ${endonym}. Натисніть, щоб показати перемикач мов.`,
      show: 'Показати',
    },
    pickerSurvivor: {
      title: 'Деякі варіанти приховано',
      body: (hidden) => `Movar приховав: ${hidden.join(', ')}.`,
      show: 'Показати приховані варіанти',
    },
    contentHidden: {
      title: 'Приховано вміст',
      descriptionForLanguage: (code) =>
        code === 'ru' ? 'Російською мовою' : 'Мова не у вашому списку',
      ariaLabelForLanguage: (code) =>
        code === 'ru' ? 'Movar: приховано російськомовний вміст' : 'Movar: приховано вміст',
      show: 'Показати',
    },
  },
};
