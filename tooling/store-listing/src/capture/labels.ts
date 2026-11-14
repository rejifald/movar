import type { Locale } from './shots';

/**
 * Device-language labels the Maestro setup flows tap on. Settings is rendered
 * in the DEVICE language, so these are the iOS 26 strings per locale; the host
 * app ones come from `Shared (App)/Resources/{uk,en}.lproj/Localizable.strings`.
 * (uk verified on iOS 26.3; en follows the stock iOS wording.)
 */
export const LABELS: Record<Locale, Record<string, string>> = {
  uk: {
    L_APPS: 'Програми',
    L_SAFARI: 'Safari',
    L_EXTENSIONS: 'Розширення',
    L_EXT_ROW: 'Movar, Вимкнено',
    L_ALL_SITES_ROW: 'Усі вебсайти, Питати',
    L_ALLOW: 'Дозволити',
    L_HIDE_CONTENT: 'Ховати вміст.*',
    L_TOGGLE_LABEL: 'Приховувати вміст заблокованими мовами',
    L_CONCEAL_HOW: 'Лишати за завісою.*',
  },
  en: {
    L_APPS: 'Apps',
    L_SAFARI: 'Safari',
    L_EXTENSIONS: 'Extensions',
    L_EXT_ROW: 'Movar, Off',
    L_ALL_SITES_ROW: 'All Websites, Ask',
    L_ALLOW: 'Allow',
    L_HIDE_CONTENT: 'Hide content.*',
    L_TOGGLE_LABEL: 'Hide content in blocked languages',
    L_CONCEAL_HOW: 'Keep behind a curtain.*',
  },
};
