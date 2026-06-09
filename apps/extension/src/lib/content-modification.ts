/**
 * Content-modification facade — the single boundary for the "hide content in
 * blocked languages" feature (the off-by-default `settings.contentModification`
 * toggle, distinct from always-on language switching).
 *
 * Everything the hiding feature needs — picker filtering, content-card
 * concealment, the curtain/tooltip overlays, and the page-content site models —
 * is imported HERE and nowhere else in the content script. The orchestrator
 * (`entrypoints/content.ts`) talks to the feature exclusively through the four
 * exports below and never imports the underlying modules directly.
 *
 * Why funnel it through one module: it makes the hiding code a single,
 * self-contained dependency subtree. Today it's a static import; flipping this
 * one import to a lazy `import()` (or moving it behind a separately-registered
 * content script) is then a localised change that keeps the ~hiding-only bytes
 * off pages where the feature is disabled. Keeping the boundary clean now is
 * what makes that deferral cheap later.
 *
 * State note: this module is intentionally stateless. The orchestrator owns
 * per-tick state (settings snapshot, detected pageLang, the picker model) and
 * the `record` correction-logger; both are passed in via
 * {@link ContentModificationContext}. Teardown/reveal/color-scheme helpers
 * operate purely on the DOM (sweeping Movar's marker attributes), so they are
 * safe no-ops when nothing has been concealed — which is also what lets them be
 * called unconditionally from the orchestrator.
 */
import type { LanguageCode } from '@movar/lang-detect';
import type { CorrectionEvent } from '@movar/events';
import type { MovarSettings } from '@movar/settings';
import { ORIGINAL_TEXT_ATTR, RESTORED_ATTR } from '@movar/lang-pickers/types';
import type { Picker } from '@movar/lang-pickers/types';
import type { PageMode } from '@movar/page-mode/types';
import { getCurrentColorScheme } from '@movar/page-mode/context';
import { filterPickers } from './picker-filter';
import { attachTooltip, detachAllTooltips, setAllTooltipsColorScheme } from './tooltip';
import { applyContentFilter, clearAllMarks, revealAllNodes } from './content-conceal';
import { classifySnippets } from './lang-detect-bridge';
import { getContentMessages, loadContentMessages } from './i18n/content';
import {
  attachCurtain,
  defaultHiddenIcon,
  detachAllCurtains,
  setAllCurtainsColorScheme,
} from './curtain';
import type { ContentPresenter } from './content-presenter';
import { createCurtainPresenter, noopContentPresenter } from './content-presenter';
import { buildModelForHost } from '@movar/page-content/registry';
import '@movar/page-content/google';
import '@movar/page-content/youtube';

/** Stable contract — content-conceal writes this; teardown sweeps it. Mirrors
 *  the constant in content-conceal.ts (kept local so teardown doesn't import
 *  the conceal module just for a string literal). */
const HIDDEN_ATTR = 'data-movar-hidden';

const curtainPresenter = createCurtainPresenter({
  attachCurtain,
  attachTooltip,
  defaultHiddenIcon,
  detachCurtains: detachAllCurtains,
  getMessages: getContentMessages,
  getColorScheme: getCurrentColorScheme,
});

function presenterFor(settings: MovarSettings): ContentPresenter {
  return settings.concealMode === 'curtain' ? curtainPresenter : noopContentPresenter;
}

/** Correction-event logger, owned by the orchestrator (it carries per-tick
 *  detection-engine state) and injected so this module stays stateless. */
export type RecordCorrection = (
  mechanism: CorrectionEvent['mechanism'],
  fromLang: LanguageCode,
  toLang: LanguageCode,
) => Promise<void>;

/** Everything {@link applyContentModification} needs for one orchestrator tick. */
export interface ContentModificationContext {
  settings: MovarSettings;
  pageLang: LanguageCode | null;
  target: LanguageCode | undefined;
  pickers: Picker[];
  record: RecordCorrection;
}

/** Strip unwanted-language entries from any visible language pickers and log
 *  one correction event per distinct hidden language. */
// Set-dedup loop + early returns; cyclomatic count comes from short-circuits,
// not nested logic.
// fallow-ignore-next-line complexity
async function filterAndRecordPickers(
  settings: MovarSettings,
  pageLang: LanguageCode | null,
  target: LanguageCode | undefined,
  pickers: Picker[],
  record: RecordCorrection,
  presenter: ContentPresenter,
): Promise<void> {
  if (pickers.length === 0) return;

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
  if (result.hiddenLinks.length === 0) return;

  const preferred = target ?? pageLang ?? '';
  const seen = new Set<LanguageCode>();
  for (const link of result.hiddenLinks) {
    if (seen.has(link.language)) continue;
    seen.add(link.language);
    await record('dom', link.language, preferred);
  }
}

/** Blur content cards whose title/channel reads as a blocked language
 *  (YouTube + similar — sites with no usable language picker for results). */
// Guards + per-card loop; counts above threshold because of the early-returns,
// not nested branches.
// fallow-ignore-next-line complexity
async function filterAndRecordContent(
  settings: MovarSettings,
  pageLang: LanguageCode | null,
  target: LanguageCode | undefined,
  record: RecordCorrection,
  presenter: ContentPresenter,
): Promise<void> {
  const contentModel = buildModelForHost(location.hostname);
  if (!contentModel || settings.blocked.length === 0) return;
  // Candidates = languages the user cares about (enabled ∪ blocked overlay);
  // a card is concealed only when its detected language is confidently not
  // enabled. With priority ∪ blocked as candidates this matches "hide iff the
  // card reads as a blocked language", now via the set-difference classifier.
  const enabled = new Set(settings.priority);
  const candidateCodes = [...new Set([...settings.priority, ...settings.blocked])];
  if (candidateCodes.length === 0) return;
  const blurred = await applyContentFilter(contentModel, {
    candidateCodes,
    enabled,
    // Classification (the language profiles + franc) runs in the background
    // worker; the content filter sends it the card texts, batched once per tick.
    classify: classifySnippets,
    presenter,
    concealMode: settings.concealMode,
  });
  const toLang = target ?? pageLang ?? '';
  for (const card of blurred) {
    await record('dom', card.fromLang, toLang);
  }
}

/**
 * Gated entry point — run one content-modification pass for the current tick.
 * The orchestrator calls this only when `settings.contentModification` is on.
 * Pickers first, then content cards, matching the original orchestrator order.
 */
export async function applyContentModification(ctx: ContentModificationContext): Promise<void> {
  const { settings, pageLang, target, pickers, record } = ctx;
  const presenter = presenterFor(settings);
  // Ensure the active locale's curtain strings are loaded before any curtain is
  // built — the worker hosts non-English catalogues; English is the bundled
  // fallback. Idempotent + cached after the first successful fetch.
  if (settings.concealMode === 'curtain') await loadContentMessages();
  await filterAndRecordPickers(settings, pageLang, target, pickers, record, presenter);
  await filterAndRecordContent(settings, pageLang, target, record, presenter);
}

/**
 * Reverse every DOM modification the hiding feature applied — without marking
 * content cards REVEALED. Suitable for "the feature was turned off, undo what
 * we did" gestures (settings toggle off); a future {@link applyContentModification}
 * pass treats the page as never-seen and re-filters from scratch. Sibling to
 * {@link revealAllContent}, which carries the extra "the user explicitly opted
 * to see this page's content" semantics.
 */
export function teardownContentModification(): void {
  // Detach every curtain on the page — reverses the per-curtain side effects
  // (display:none on picker containers, pointer-events/aria-hidden on blur
  // cards) in one sweep.
  detachAllCurtains();
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
  detachAllTooltips();
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
  clearAllMarks(document, curtainPresenter);
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
export function revealAllContent(): void {
  revealAllNodes(document, curtainPresenter);
  teardownContentModification();
}

/**
 * Repaint every live curtain/tooltip for the new page color scheme. Driven by
 * the orchestrator's page-mode watcher. Both calls are DOM-query sweeps, so
 * this is a no-op when nothing is concealed.
 */
export function setContentModificationColorScheme(mode: PageMode): void {
  setAllCurtainsColorScheme(mode);
  setAllTooltipsColorScheme(mode);
}
