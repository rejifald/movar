import { classifyLanguageElement } from '@movar/lang-pickers/classify';
import type { LanguageCode } from '@movar/lang-detect';
import type { HiddenSummary } from './messaging';

/** Attribute marking an element the content script hard-hides; its value is the
 *  reason (`not-in-priority` for picker items, `content-filter:…` for cards). */
const HIDDEN_ATTR = 'data-movar-hidden';

/** Per-pass inputs the summary can't read off the DOM itself. */
interface HiddenSummaryContext {
  /** Detected language of the current page as of the last apply pass. */
  pageLang: LanguageCode | null;
  /** True after the user pressed "Show all". */
  userOverride: boolean;
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
    '[data-movar-curtain][data-movar-kind="picker-container"]',
  ).length;
  // Content cards concealed by the page-content filter — blurred (curtain,
  // data-movar-content-blurred) or hard-hidden (display:none, data-movar-hidden
  // with a "content-filter:…" reason). Picker hides use the "not-in-priority"
  // reason and are counted via `languages` above, so the prefix selector keeps
  // the two channels from double-counting.
  const feedCards =
    doc.querySelectorAll('[data-movar-content-blurred]').length +
    doc.querySelectorAll(`[${HIDDEN_ATTR}^="content-filter"]`).length;
  return {
    languages: [...languages].toSorted((a, b) => a.localeCompare(b)),
    containers,
    feedCards,
    pageLang: ctx.pageLang,
    userOverride: ctx.userOverride,
  };
}
