import type { LanguageCode } from '@movar/lang-detect';

/** Max length a link/label's text can be before we stop treating it as a language label. */
export const MAX_LANG_TEXT = 32;

/** Max ancestors we walk up looking for a picker container. Picker items in
 *  modern frameworks (Headless UI, Radix, etc.) are commonly wrapped 8+
 *  levels deep before reaching the shared container. */
export const MAX_PICKER_DEPTH = 12;

export const QUERY_LANG_PARAMS = ['lang', 'locale', 'hl', 'language'] as const;

/** Visual separators that sit between adjacent language labels in a single
 *  text node ("UA  |  RU", "EN / DE", "Українська · Русский", "EN – DE").
 *  Hyphen/underscore/whitespace are intentionally excluded — those occur
 *  inside legitimate alias keys ('по-русски', 'in english') and would
 *  over-split. Used only by `textToLanguage`; `languageFromText` restricts
 *  separator splitting to leaf elements so a container of inline labels
 *  doesn't classify as one of its inner languages. */
export const LABEL_SEPARATORS = /[|/·•›→,;–—]/;

export const HIDDEN_ATTR = 'data-movar-hidden';
export const ORIGINAL_DISPLAY_ATTR = 'data-movar-original-display';
export const ORIGINAL_DISPLAY_PRIORITY_ATTR = 'data-movar-original-display-priority';
/** Snapshot of a picker-link leaf's textContent before we trimmed an orphan
 *  separator from it. Restored by content.ts clearAllModifications so
 *  "Show everything on this page" returns the leaf to verbatim site state. */
export const ORIGINAL_TEXT_ATTR = 'data-movar-original-text';
/**
 * Per-side snapshots of a surviving picker entry's inline border width, taken
 * before we zeroed a separator rule that faced a now-hidden neighbour.
 *
 * The fourth separator shape, and the only one no element- or text-level pass
 * can reach: the divider is not a node at all but a CSS border painted on the
 * SURVIVOR's edge (`border-right: 1px solid #e0e0e0` on stls.store's UA entry).
 * Hiding the RU sibling leaves that rule hanging in space. Keyed by side so a
 * survivor flanked by two hidden entries restores both edges verbatim.
 */
export const ORIGINAL_BORDER_ATTRS = {
  left: {
    value: 'data-movar-original-border-left',
    priority: 'data-movar-original-border-left-priority',
  },
  right: {
    value: 'data-movar-original-border-right',
    priority: 'data-movar-original-border-right-priority',
  },
} as const;

/** Marker placed on a picker container after the user clicks "Show hidden
 *  options" in the survivor tooltip. filterPickers skips marked containers
 *  so MutationObserver re-runs don't undo the restore. Cleared by
 *  clearAllModifications (popup's "Show everything") so global restore
 *  resets per-picker memory too. */
export const RESTORED_ATTR = 'data-movar-restored';
/** `data-movar-kind` value for a span that wraps a separator-bearing text
 *  node we mutated. Lets classifyContainerChildren recognize and skip the
 *  span on subsequent passes — the wrapper is structural, not a language
 *  entry, so it shouldn't be picked up as a switchable link. */
export const TEXT_DIVIDER_KIND = 'text-divider';

/** Leading/trailing run of whitespace + separator characters. Same set as
 *  LABEL_SEPARATORS plus whitespace (`\s` matches U+00A0 nbsp, which is
 *  what real sites use for `UA&nbsp;|&nbsp;` spacing). */
export const LEADING_SEPARATOR_RUN = /^[\s|/·•›→,;–—]+/;
// eslint-disable-next-line sonarjs/slow-regex -- linear, not ReDoS: a single character class with one `+` quantifier has no overlapping/nested ambiguity to backtrack on, and it only runs on bounded, trusted picker-leaf label text (≤ MAX_LANG_TEXT)
export const TRAILING_SEPARATOR_RUN = /[\s|/·•›→,;–—]+$/;

/** ISO 3166-1 alpha-2 country → primary language we ship a rule for. */
export const COUNTRY_TO_LANG: Record<string, LanguageCode> = {
  UA: 'uk',
  RU: 'ru',
  GB: 'en',
  US: 'en',
  DE: 'de',
  AT: 'de',
  CH: 'de',
  FR: 'fr',
  ES: 'es',
  IT: 'it',
  PL: 'pl',
};

/**
 * Class-name parts we should NEVER treat as language codes. Most are common
 * structural/library prefixes that happen to be 2-3 letters and could collide
 * with ISO codes (e.g. `fi` for Finnish vs flag-icons-css's `fi` prefix).
 */
export const CLASS_NOISE = new Set([
  // Structural words common in picker class names
  'link',
  'flag',
  'icon',
  'menu',
  'item',
  'option',
  'option-value',
  'header',
  'footer',
  'social',
  'lang',
  'language',
  'locale',
  'i18n',
  'switch',
  'switcher',
  'nav',
  'tab',
  'list',
  'wrapper',
  'container',
  'btn',
  'button',
  'control',
  'dropdown',
  // Library prefixes that frequently appear in class lists
  'fa', // Font Awesome
  'fi', // flag-icons-css — also Finnish, but the icon-lib usage is overwhelming
  'mb', // Tailwind margin
  'ml',
  'mr',
  'mt',
  'pb',
  'pl',
  'pr',
  'pt',
  'px',
  'py',
  // Tailwind/Bootstrap state words
  'is',
  'has',
  'active',
  'current',
  'selected',
  'disabled',
]);

/**
 * Elements that may carry a language token in a `value` attribute. `<option
 * value="uk">` is the standards-blessed case; the rest are the component-
 * framework idiom where a picker entry is a plain `<span>`/`<a>` stamped with
 * `value="UA"` and a build-hashed class (`sc-b53f1be3-1`) that leaks no
 * language signal at all — stls.store's header switcher, for one. Form
 * controls are deliberately absent: an `<input value="ru">` is user data, not
 * a switcher, and seeding every input on a page is pure noise.
 */
export const VALUE_CARRIER_TAGS = ['option', 'a', 'button', 'span', 'div', 'li'] as const;

/**
 * Elements that may carry a picker destination in an `href` attribute despite
 * not being anchors. Same framework idiom as {@link VALUE_CARRIER_TAGS}: the
 * ACTIVE entry of a switcher is rendered as a non-clickable `<span href="/uk/">`
 * so it looks like its `<a>` siblings without navigating. Restricted to a
 * handful of tags rather than `[href]:not(a)` because SVG `<use href>` is on
 * nearly every icon-heavy page and would flood the seed set.
 */
export const HREF_CARRIER_TAGS = ['span', 'div', 'li', 'button'] as const;

/**
 * Selectors that broadly indicate "could be a language switcher element".
 * classify() filters the noise — querying broadly is fine. Excludes
 * `link[hreflang]` (in <head>, not visible picker UI) and `<meta>` cases.
 *
 * Includes `option[value]` so native <select>-based pickers get discovered;
 * an `<option>` doesn't typically carry the lang/locale/flag class hints. The
 * `value`/`href` carrier tags generalise that to framework switchers whose
 * only language signal is an attribute or the label text (see
 * {@link VALUE_CARRIER_TAGS} / {@link HREF_CARRIER_TAGS}).
 */
export const SEED_SELECTORS = [
  'a[href]',
  '[data-lang]',
  '[data-locale]',
  '[hreflang]:not(link):not(meta)',
  '[class*="lang"]',
  '[class*="locale"]',
  '[class*="flag-"]',
  '[class*="-link"]',
  ...VALUE_CARRIER_TAGS.map((tag) => `${tag}[value]`),
  ...HREF_CARRIER_TAGS.map((tag) => `${tag}[href]`),
].join(', ');

export interface ClassifiedLink {
  el: HTMLElement;
  language: LanguageCode;
}

export interface Picker {
  container: HTMLElement;
  /** Deduped-by-language display set (see `dedupByLanguage` in extract.ts) —
   *  one entry per distinct language, for counting/labelling/tooltip use. */
  links: ClassifiedLink[];
  /** Every classified link inside the container BEFORE the language dedup
   *  that produces `links` above — includes regional-variant duplicates
   *  (e.g. both `ru-RU` and `ru-UA`) that dedup collapsed away. Filtering
   *  must hide/restore against this full set, or a duplicate dropped from
   *  `links` never gets touched and stays visible/clickable — the blocked
   *  language "leaks" through it (movar#293). Optional so pre-existing
   *  hand-built test fixtures that only set `links` keep compiling;
   *  consumers fall back to `links` when it's absent. */
  allLinks?: ClassifiedLink[];
}

export interface FilterResult {
  hiddenLinks: ClassifiedLink[];
  hiddenContainers: HTMLElement[];
}

export interface FilterOptions {
  /** Explicitly blocked languages — distinct from "not in priority". When
   *  provided, only blocked languages are stripped; languages outside the
   *  keep list but not blocked are tolerated. */
  blocked?: LanguageCode[];
}

/**
 * The clickable element a content script can use to switch into the
 * highest-priority language available in the picker. Prefers a real anchor
 * (cleanest: just `location.replace(href)`), but falls back to a button —
 * useful on sites whose language picker is a form POST (e.g. bosch-centre).
 */
export type RedirectTarget = HTMLAnchorElement | HTMLButtonElement;

/**
 * Result of `pickRedirectTarget`: the clickable element to activate AND the
 * priority language it actually matched. `language` can differ from
 * `priority[0]` when higher-priority languages have no corresponding picker
 * link — callers must record this matched language, not assume the top of
 * the priority list (issue #299).
 */
export interface PickedRedirect {
  target: RedirectTarget;
  language: LanguageCode;
}

/**
 * Pre-computed snapshot of all language pickers found on a page in a single
 * DOM walk. Passed through the orchestration chain so `findLanguagePickers`
 * is called only once per tick.
 */
export interface PickerModel {
  /** Extractor id — 'generic' today; per-site overrides will use their own id. */
  extractor: string;
  pickers: Picker[];
  /** Aggregate of activeLanguageFromPicker across all pickers, pre-computed. */
  activeLanguage: LanguageCode | null;
}
