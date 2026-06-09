/**
 * Content-modification facade — the single boundary for the "hide content in
 * blocked languages" feature (the off-by-default `settings.contentModification`
 * toggle, distinct from always-on language switching).
 *
 * This facade is structural: it imports picker filtering, card concealment, and
 * the background classifier bridge, but NOT the curtain/tooltip presenter and
 * NOT any page-content extractor bodies. The content-script orchestrator injects
 * the host model and an optional presenter after resolving the current capability
 * set. That is what lets `features/conceal.js`, `features/curtain-ui.js`, and
 * `models/<site>.js` load independently.
 *
 * State note: this module is intentionally stateless. The orchestrator owns
 * per-tick state (settings snapshot, detected pageLang, picker model, content
 * model) and the `record` correction-logger; both are passed in via
 * {@link ContentModificationContext}. Teardown/reveal helpers operate on Movar's
 * marker attributes plus the injected presenter's detach methods, so they are
 * safe no-ops when nothing has been concealed.
 */
import type { LanguageCode } from '@movar/lang-detect';
import type { MovarSettings } from '@movar/settings';
import { ORIGINAL_TEXT_ATTR, RESTORED_ATTR } from '@movar/lang-pickers/types';
import type { Picker } from '@movar/lang-pickers/types';
import type { PageContentModel } from '@movar/page-content/types';
import type { ContentPresenter } from './content-presenter';
import { filterPickers } from './picker-filter';
import {
  applyContentFilter,
  clearAllMarks,
  hideAllConcealed,
  revealAllNodes,
} from './content-conceal';
import { classifySnippets } from './lang-detect-bridge';

/** Stable contract — content-conceal writes this; teardown sweeps it. Mirrors
 *  the constant in content-conceal.ts (kept local so teardown doesn't import
 *  the conceal module just for a string literal). */
const HIDDEN_ATTR = 'data-movar-hidden';

/** One correction the hiding feature wants logged. The orchestrator stamps the
 *  rest (domain, timestamp, detection engine, mechanism) and batches the write,
 *  so this module stays stateless and never touches the corrections log itself. */
export interface ContentCorrection {
  fromLang: LanguageCode;
  toLang: LanguageCode;
}

/** Everything {@link applyContentModification} needs for one orchestrator tick. */
export interface ContentModificationContext {
  settings: MovarSettings;
  pageLang: LanguageCode | null;
  target: LanguageCode | undefined;
  pickers: Picker[];
  model: PageContentModel | null;
  /** Active presenter for this pass. Present only in curtain mode. */
  presenter?: ContentPresenter;
  /** Previous presenter to use while revoking curtain-mode DOM on a pass that
   *  no longer wants presentation (for example curtain -> hide). */
  cleanupPresenter?: ContentPresenter;
  /** Persist `concealMode: 'hide'` — wired to a blur curtain's "Hide all" action.
   *  The orchestrator owns settings I/O, so it supplies this; the facade only
   *  forwards it to the content filter. Optional: a pass without it still
   *  escalates the page on "Hide all", it just doesn't persist the choice (the
   *  shape unit tests exercise). */
  onHideAll?: () => void;
}

/** Strip unwanted-language entries from any visible language pickers; return one
 *  correction per distinct hidden language (the orchestrator logs them). Synchronous
 *  — `filterPickers` is pure DOM work — so it runs during the content pass's worker
 *  round-trip when the two are kicked off together. */
// Set-dedup loop + early returns; cyclomatic count comes from short-circuits,
// not nested logic.
// fallow-ignore-next-line complexity
function collectPickerCorrections(
  settings: MovarSettings,
  pageLang: LanguageCode | null,
  target: LanguageCode | undefined,
  pickers: Picker[],
  presenter: ContentPresenter | undefined,
): ContentCorrection[] {
  if (pickers.length === 0) return [];

  // Blocked-only mode is the default: strip languages the user explicitly
  // blocked, leave everything else visible — including languages outside
  // the priority list. This matches the "blocked vs everything-else"
  // mental model and means the picker container itself is never replaced
  // by a chip overlay through this path. Pickers that lose every option
  // to blocking just become empty (children display:none); the consent
  // wall handles the active-switch consent flow separately. The chip
  // overlay is reserved for the strict keep-only path — production no longer
  // takes that path by default.
  //
  // The survivor tooltip's "Show hidden options" button does an in-place
  // per-picker restore (lang-pickers/filter owns the implementation) and marks the
  // container with `data-movar-restored` so filterPickers skips it on
  // future MutationObserver re-runs. The popup's "Show everything on
  // this page" stays available as the page-wide global sweep.
  const result = filterPickers(
    pickers,
    settings.priority,
    { blocked: settings.blocked },
    presenter,
  );
  if (result.hiddenLinks.length === 0) return [];

  const preferred = target ?? pageLang ?? '';
  const corrections: ContentCorrection[] = [];
  const seen = new Set<LanguageCode>();
  for (const link of result.hiddenLinks) {
    if (seen.has(link.language)) continue;
    seen.add(link.language);
    corrections.push({ fromLang: link.language, toLang: preferred });
  }
  return corrections;
}

/** Filter content cards whose title/channel reads as a blocked language (YouTube +
 *  similar — sites with no usable language picker for results); return one
 *  correction per concealed card. The classification is a background-worker
 *  round-trip, so the caller kicks this off before the synchronous picker pass. */
// Guards + per-card loop; counts above threshold because of the early-returns,
// not nested branches.
// fallow-ignore-next-line complexity
async function collectContentCorrections(
  settings: MovarSettings,
  pageLang: LanguageCode | null,
  target: LanguageCode | undefined,
  contentModel: PageContentModel | null,
  presenter: ContentPresenter | undefined,
  cleanupPresenter: ContentPresenter | undefined,
  onHideAll: (() => void) | undefined,
): Promise<ContentCorrection[]> {
  if (!contentModel || settings.blocked.length === 0) return [];
  // Enforce 'hide' mode on cards curtained before the user escalated (a mid-
  // session mode flip, or a curtain attached on a prior tick). Idempotent and
  // cheap — a no-op selector sweep when no curtains remain. New cards below are
  // concealed directly in the selected mode, so this only catches stragglers.
  if (settings.concealMode === 'hide') hideAllConcealed(document, cleanupPresenter ?? presenter);
  // Candidates = languages the user cares about (enabled ∪ blocked overlay);
  // a card is concealed only when its detected language is confidently not
  // enabled. With priority ∪ blocked as candidates this matches "hide iff the
  // card reads as a blocked language", now via the set-difference classifier.
  const enabled = new Set(settings.priority);
  const candidateCodes = [...new Set([...settings.priority, ...settings.blocked])];
  if (candidateCodes.length === 0) return [];
  const filterOptions = {
    candidateCodes,
    enabled,
    // Classification (the language profiles + franc) runs in the background
    // worker; the content filter sends it the card texts, batched once per tick.
    classify: classifySnippets,
    concealMode: settings.concealMode,
  };
  const blurred = await applyContentFilter(contentModel, {
    ...filterOptions,
    ...(presenter ? { presenter } : {}),
    ...(onHideAll ? { onHideAll } : {}),
  });
  const toLang = target ?? pageLang ?? '';
  return blurred.map((card) => ({ fromLang: card.fromLang, toLang }));
}

/**
 * Gated entry point — run one content-modification pass for the current tick. The
 * orchestrator calls this only when `settings.contentModification` is on, and logs
 * the returned corrections (this module never touches the log).
 *
 * The picker pass (synchronous DOM) and the content pass (an async worker
 * classification round-trip) are independent — disjoint elements, neither writes
 * the log — so the content pass is kicked off first and the picker pass runs
 * during its round-trip. Presenter strings are loaded by the presenter chunk
 * before this facade sees the handle, so hide mode does not load them.
 */
export async function applyContentModification(
  ctx: ContentModificationContext,
): Promise<ContentCorrection[]> {
  const { settings, pageLang, target, pickers, model, onHideAll } = ctx;
  const presenter = settings.concealMode === 'curtain' ? ctx.presenter : undefined;
  const contentDone = collectContentCorrections(
    settings,
    pageLang,
    target,
    model,
    presenter,
    ctx.cleanupPresenter,
    onHideAll,
  );
  const pickerCorrections = collectPickerCorrections(
    settings,
    pageLang,
    target,
    pickers,
    presenter,
  );
  return [...pickerCorrections, ...(await contentDone)];
}

/**
 * Reverse every DOM modification the hiding feature applied — without marking
 * content cards REVEALED. Suitable for "the feature was turned off, undo what
 * we did" gestures (settings toggle off); a future {@link applyContentModification}
 * pass treats the page as never-seen and re-filters from scratch. Sibling to
 * {@link revealAllContent}, which carries the extra "the user explicitly opted
 * to see this page's content" semantics.
 */
export function teardownContentModification(presenter?: ContentPresenter): void {
  // Detach every curtain on the page — reverses the per-curtain side effects
  // (display:none on picker containers, pointer-events/aria-hidden on blur
  // cards) in one sweep.
  presenter?.detachCurtains();
  // Sweep the remaining hideElement-marked links (no curtain attached to those).
  document.querySelectorAll(`[${HIDDEN_ATTR}]`).forEach((el) => {
    el.removeAttribute(HIDDEN_ATTR);
    if (el instanceof HTMLElement) {
      el.style.removeProperty('display');
    }
    if (el instanceof HTMLOptionElement) el.hidden = false;
  });
  // Sweep trimOrphanSeparators text mutations. These leaves had their
  // textContent rewritten ("UA  |  " → "UA") in-place because the
  // separator shared a text node with the language label; the original
  // sits in ORIGINAL_TEXT_ATTR so restore puts the text back verbatim.
  // text-divider marker spans (from trimContainerTextSeparators) get
  // replaced with text nodes containing the original separator — the
  // wrapper is structural, so once we're restoring we put the DOM back
  // to the verbatim shape the site rendered.
  document.querySelectorAll(`[${ORIGINAL_TEXT_ATTR}]`).forEach((el) => {
    if (!(el instanceof HTMLElement)) return;
    const original = el.getAttribute(ORIGINAL_TEXT_ATTR);
    el.removeAttribute(ORIGINAL_TEXT_ATTR);
    if (original === null) return;
    if (el.dataset['movarKind'] === 'text-divider') {
      el.replaceWith(document.createTextNode(original));
    } else {
      el.textContent = original;
    }
  });
  // Detach every survivor tooltip — the picker links they explained are
  // about to be restored, so the explanation is stale. detachAllTooltips
  // sweeps via the host marker attribute (`data-movar-tooltip`).
  presenter?.detachAllTooltips();
  // Clear per-picker "user restored this container" markers. The global
  // "Show everything" sweep is a stronger statement than any per-picker
  // restore, so we reset the picker-level memory too — otherwise a
  // container marked restored here would never get re-filtered after the
  // popup-driven sweep finishes.
  document.querySelectorAll(`[${RESTORED_ATTR}]`).forEach((el) => {
    el.removeAttribute(RESTORED_ATTR);
  });
  // Drop the content-filter bookkeeping (BLURRED/CHECKED) so a future
  // applyContentFilter pass can re-blur the same cards if filtering comes
  // back on. Per-card REVEALED_ATTR survives — those are explicit user
  // "Show" clicks we should never undo.
  clearAllMarks(document, presenter);
}

/**
 * "Show everything on this page" — reveal every concealed content card AND undo
 * all picker/content hides. Unlike {@link teardownContentModification}, this
 * marks cards REVEALED so future filter passes skip them (the user opted in to
 * seeing this page's content).
 *
 * Order matters: revealAllNodes reads BLURRED_ATTR to know which cards to mark
 * REVEALED, so it has to run before teardown strips that mark. REVEALED is what
 * tells future applyContentFilter passes to skip these cards — without it, the
 * MutationObserver would re-blur them the next time YouTube re-renders the grid.
 * teardown then sweeps the picker hides and any other curtains. Encapsulated
 * here so the orchestrator never has to know the ordering constraint.
 */
export function revealAllContent(presenter?: ContentPresenter): void {
  revealAllNodes(document, presenter);
  teardownContentModification(presenter);
}
