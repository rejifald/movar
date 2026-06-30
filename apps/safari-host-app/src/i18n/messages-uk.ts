import type { HostMessages } from './messages-en';

/**
 * Ukrainian string catalogue for the Safari host app's shell. Typed against
 * `HostMessages`, so any key the English canonical adds must be filled here too
 * or the build fails. Strings mirror the copy that previously lived in the
 * native `uk.lproj/Main.html`.
 */
export const messagesUk: HostMessages = {
  tabs: {
    detector: 'Виявлення',
    settings: 'Налаштування',
    about: 'Про застосунок',
  },
  brandSubtitle: 'Налаштуйте інтернет на рідну мову.',
  chips: {
    settingsApp: 'Налаштування',
    safari: 'Safari',
    settings: 'Налаштування',
    settingsLegacy: 'Параметри',
    extensions: 'Розширення',
  },
  pathThen: ' далі ',
  ios: {
    headline: 'Останній крок',
    helper: 'Увімкніть Movar у застосунку «Налаштування»:',
  },
  macSetup: {
    headline: 'Останній крок',
    helper: 'Увімкніть Movar у Safari:',
  },
  macOn: {
    headline: 'Movar увімкнено',
    helper: 'Керуйте ним будь-коли в Safari:',
  },
  openPreferences: {
    label: 'Відкрити налаштування Safari',
    legacy: 'Відкрити параметри Safari',
  },
  trust: {
    free: 'Безкоштовно',
    openSource: 'Відкритий код',
    privacy: 'Нічого не покидає браузер',
  },
};
