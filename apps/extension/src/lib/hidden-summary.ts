import { classifyLanguageElement } from '@movar/lang-pickers/classify';
import type { LanguageCode } from '@movar/lang-detect';
import type { HiddenSummary } from './messaging';
import { CONTENT_BLURRED_ATTR, CURTAIN_HOST_ATTR, HIDDEN_ATTR } from './movar-markers';

/** Per-pass inputs the summary can't read off the DOM itself. */
interface HiddenSummaryContext {
  /** Detected language of the current page as of the last apply pass. */
  pageLang: LanguageCode | null;
  /** True after the user pressed "Show all". */
  userOverride: boolean;
  /** True when a session guard is currently suppressing a switch on this tab. */
  switchSuppressed: boolean;
}

/**
 * Summarise what the content script has currently concealed on `doc`, for the
 * popup hero + hidden-content panel. Pure DOM read (plus the two per-pass values
 * in `ctx`): counts hidden picker languages, collapsed picker containers, and
 * blurred/hidden feed cards from the `data-movar-*` markers the
 * content-modification facade leaves behind.
 */
export function buildHiddenSummary(doc: Document, ctx: HiddenSummaryContext): HiddenSummary {
  const languages = new Set<LanguageCode>();
  doc.querySelectorAll(`[${HIDDEN_ATTR}]`).forEach((el) => {
    const reason = el.getAttribute(HIDDEN_ATTR);
    if (reason === 'not-in-priority' && el instanceof HTMLElement) {
      const c = classifyLanguageElement(el);
      if (c) languages.add(c.language);
    }
  });
  // Hidden picker containers are tracked via curtain hosts marked
  // data-movar-kind="picker-container".
  const containers = doc.querySelectorAll(
    `[${CURTAIN_HOST_ATTR}][data-movar-kind="picker-container"]`,
  ).length;
  // Content cards concealed by the page-content filter, split by shape so the
  // popup can distinguish recoverable-in-place from removed: blurred (curtain,
  // data-movar-content-blurred) vs hard-hidden (display:none, data-movar-hidden
  // with a "content-filter:…" reason). Picker hides use the "not-in-priority"
  // reason and are counted via `languages` above, so the prefix selector keeps
  // the two channels from double-counting.
  const feedCurtained = doc.querySelectorAll(`[${CONTENT_BLURRED_ATTR}]`).length;
  const feedHidden = doc.querySelectorAll(`[${HIDDEN_ATTR}^="content-filter"]`).length;
  return {
    languages: [...languages].toSorted((a, b) => a.localeCompare(b)),
    containers,
    feedCurtained,
    feedHidden,
    pageLang: ctx.pageLang,
    userOverride: ctx.userOverride,
    switchSuppressed: ctx.switchSuppressed,
  };
}
