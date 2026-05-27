import type { Messages } from './messages-en';

/**
 * Ukrainian one/few/many plural rule (CLDR).
 *  - one: 1, 21, 31, … (mod10 === 1 && mod100 !== 11)
 *  - few: 2-4, 22-24, … (mod10 in 2..4 && mod100 not in 12..14)
 *  - many: everything else (0, 5-20, 25-30, …)
 */
function ukPlural<T>(n: number, one: T, few: T, many: T): T {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

export const messagesUk: Messages = {
  status: {
    active: 'Активно',
    paused: 'Призупинено',
    off: 'Вимкнено',
    turnOn: 'Увімкнути Movar',
    turnOff: 'Вимкнути Movar',
  },
  correctionsTodayLabel: (n) => {
    const noun = ukPlural(n, 'виправлення', 'виправлення', 'виправлень');
    return `${noun} сьогодні`;
  },
  priorityLabel: 'Бажаний порядок',
  priority: (names) => `Пріоритет ${names.join(' → ')}`,
  pausedUntilDate: (date) => `Призупинено до ${date}`,
  pausedUntilSession: 'Призупинено до перезапуску браузера',
  pausedNoEnd: 'Призупинено',
  offMessage: 'Movar вимкнено — увімкніть, щоб продовжити.',
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
    show: 'Показати все на цій сторінці',
    reload: 'Перезавантажте сторінку, щоб Movar знову застосувався.',
    restored: 'Відновлено на цій сторінці — перезавантажте, щоб застосувати знову.',
    nothing: 'Нічого не приховано.',
  },
  pause: {
    title: 'Призупинити Movar',
    durations: {
      '1h': '1 година',
      '24h': '24 години',
      session: 'На сесію',
      '1w': '1 тиждень',
    },
    resume: 'Продовжити',
  },
  feedback: 'Надіслати відгук',
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
      title: 'Перемикач прихований',
      description: 'У списку немає бажаних мов',
      show: 'Показати',
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
