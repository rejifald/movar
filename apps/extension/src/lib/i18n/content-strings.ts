/**
 * Content-script curtain strings — the serializable data behind {@link ContentMessages}.
 *
 * The content script loads on every page but renders these curtain strings only
 * when the off-by-default content-hiding feature is on. To keep inactive locales
 * out of the always-on bundle entirely, the per-locale catalogues live in the
 * background worker; the content fetches just its active locale's
 * {@link ContentStrings} over a message and adapts it back into the
 * {@link ContentMessages} function shape the curtain factories consume. English is
 * the one locale bundled in the content script — the default, and the fallback
 * shown if the worker can't be reached.
 *
 * Functions can't cross `runtime.sendMessage`, so the wire shape is plain data:
 * fixed strings plus `{endonym}` / `{languages}` placeholders and a Russian-vs-rest
 * split. {@link adaptContentStrings} rebuilds the interpolating/branching functions
 * on the content side, so the call sites (and their tests) stay unchanged.
 */
import type { LanguageCode } from '@movar/lang-detect';

/** Serializable curtain strings for one locale — sent worker → content. */
export interface ContentStrings {
  pickerHidden: {
    /** `{endonym}` → the surviving language's name (localised by the caller). */
    chipLabel: string;
    /** Shown when no language survived — the sigil-only chip. */
    chipLabelNoLang: string;
    show: string;
  };
  pickerSurvivor: {
    title: string;
    /** `{languages}` → comma-joined hidden endonyms, in picker order. */
    body: string;
    show: string;
  };
  contentHidden: {
    title: string;
    /** Russian gets a tailored line; every other blocked language uses the
     *  generic `description` / `ariaLabel`. */
    descriptionRussian: string;
    description: string;
    ariaLabelRussian: string;
    ariaLabel: string;
    show: string;
  };
}

/** Injected-curtain strings as the curtain factories consume them — interpolating
 *  functions over an already-resolved endonym / language list. Built from a
 *  {@link ContentStrings} by {@link adaptContentStrings}. */
export interface ContentMessages {
  pickerHidden: {
    /**
     * Hover/screen-reader sentence for the picker-hidden chip. Takes the
     * surviving language's endonym (already localised by the caller via
     * `Intl.DisplayNames`) or `null` when no language survived.
     */
    chipLabel: (endonym: string | null) => string;
    show: string;
  };
  pickerSurvivor: {
    title: string;
    body: (hiddenEndonyms: string[]) => string;
    show: string;
  };
  contentHidden: {
    title: string;
    /** Description varies by detected language ('ru' is the only one with a
     *  tailored message today; others use a generic fallback). */
    descriptionForLanguage: (code: LanguageCode) => string;
    ariaLabelForLanguage: (code: LanguageCode) => string;
    show: string;
  };
}

/** Rebuild the {@link ContentMessages} function shape from serialized
 *  {@link ContentStrings}. Placeholders occur once, so a plain `String.replace`
 *  suffices. */
export function adaptContentStrings(s: ContentStrings): ContentMessages {
  return {
    pickerHidden: {
      chipLabel: (endonym) =>
        endonym === null
          ? s.pickerHidden.chipLabelNoLang
          : s.pickerHidden.chipLabel.replace('{endonym}', endonym),
      show: s.pickerHidden.show,
    },
    pickerSurvivor: {
      title: s.pickerSurvivor.title,
      body: (hiddenEndonyms) =>
        s.pickerSurvivor.body.replace('{languages}', hiddenEndonyms.join(', ')),
      show: s.pickerSurvivor.show,
    },
    contentHidden: {
      title: s.contentHidden.title,
      descriptionForLanguage: (code) =>
        code === 'ru' ? s.contentHidden.descriptionRussian : s.contentHidden.description,
      ariaLabelForLanguage: (code) =>
        code === 'ru' ? s.contentHidden.ariaLabelRussian : s.contentHidden.ariaLabel,
      show: s.contentHidden.show,
    },
  };
}
