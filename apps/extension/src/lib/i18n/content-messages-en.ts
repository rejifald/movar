/**
 * Content-script curtain strings (English) — the canonical shape.
 *
 * Split out of the full {@link Messages} catalogue (popup + options) so the
 * always-on content script bundles ONLY these few injected-curtain strings,
 * not Movar's entire UI copy. The content script loads on every page; the
 * popup/options strings it never renders were ~20 KB of dead weight there, and
 * that figure grows with every locale added. The full catalogue composes this
 * subset back in (`messagesEn.content = contentMessagesEn`) so popup-side code
 * still sees one `Messages` object.
 *
 * Strings stay TS functions (not ICU/`_locales` placeholders) so each locale
 * applies its own plural/branching rules at the call site — the same choice the
 * parent catalogue documents.
 */
import type { LanguageCode } from '@movar/lang-detect';

/** Injected-curtain strings for the content script (picker chips, survivor
 *  tooltips, blur cards). The Ukrainian catalogue is typed against this so
 *  missing keys surface at build time. */
export interface ContentMessages {
  pickerHidden: {
    /**
     * Hover/screen-reader sentence for the picker-hidden chip. Takes the
     * surviving language's endonym (already localised by the caller via
     * `Intl.DisplayNames`) or `null` when no language survived — the
     * sigil-only state where the chip degrades to icon-without-label.
     */
    chipLabel: (endonym: string | null) => string;
    show: string;
  };
  /**
   * Custom-styled tooltip applied to every surviving link in a picker
   * where Movar hid at least one option. Three slots: a short title,
   * the body listing the hidden languages by endonym (in original
   * picker order), and a button label for the in-place "show hidden
   * options" action.
   */
  pickerSurvivor: {
    title: string;
    body: (hiddenEndonyms: string[]) => string;
    show: string;
  };
  contentHidden: {
    title: string;
    /** Description varies by detected language ('ru' is the only one with
     *  a tailored message today; others use a generic fallback). */
    descriptionForLanguage: (code: LanguageCode) => string;
    ariaLabelForLanguage: (code: LanguageCode) => string;
    show: string;
  };
}

export const contentMessagesEn: ContentMessages = {
  pickerHidden: {
    chipLabel: (endonym) =>
      endonym === null
        ? 'Movar hid this language picker — click to show'
        : `Movar — ${endonym}. Click to show the language picker.`,
    show: 'Show',
  },
  pickerSurvivor: {
    title: 'Some options hidden',
    body: (hidden) => `Movar hid: ${hidden.join(', ')}.`,
    show: 'Show hidden options',
  },
  contentHidden: {
    title: 'Content hidden',
    descriptionForLanguage: (code) => (code === 'ru' ? 'In Russian' : 'Language not in your list'),
    ariaLabelForLanguage: (code) =>
      code === 'ru' ? 'Movar: Russian content hidden' : 'Movar: content hidden',
    show: 'Show',
  },
};
