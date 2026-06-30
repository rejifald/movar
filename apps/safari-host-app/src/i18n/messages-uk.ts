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
  detector: {
    title: 'Визначена мова',
    intro:
      'Вставте будь-який текст — Movar визначить мову на вашому пристрої, нічого не надсилаючи.',
    placeholder: 'Вставте текст сюди…',
    detect: 'Визначити',
    clear: 'Очистити',
    notDetected: 'Кириличну мову не виявлено',
    unavailable: 'Визначення мови недоступне.',
    note: 'Розрізняє кириличні мови, між якими керує Movar — українську, російську та білоруську — за характерними літерами. Латиниця та інші системи письма читаються як невизначені.',
  },
  settings: {
    enabledLabel: 'Movar увімкнено',
    enabledHelp: 'Головний перемикач усього керування мовою.',
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
  feedback: 'Надіслати відгук',
};
