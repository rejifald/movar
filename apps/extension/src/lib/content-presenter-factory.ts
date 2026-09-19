import type { LanguageCode } from '@movar/lang-detect';
import type { PageMode } from '@movar/page-mode/types';
import type {
  ContentCurtainRequest,
  ContentPresenter,
  PickerContainerCurtainRequest,
  PickerControlBadgeRequest,
  PickerEntryCurtainRequest,
  PickerSurvivorTooltipRequest,
  PresenterHandle,
} from './content-presenter';
import { attachCurtain, defaultHiddenIcon, detachAllCurtains } from './curtain';
import { getContentLocale, getContentMessages } from './i18n/content';
import { attachTooltip, detachAllTooltips } from './tooltip';

export interface ContentPresenterAdapterOptions {
  getColorScheme: () => PageMode;
}

/** Placeholder until the real teardown is built, below. */
function noop(): void {
  // nothing to release yet
}

function endonym(code: LanguageCode): string {
  try {
    return new Intl.DisplayNames([code], { type: 'language' }).of(code) ?? code;
  } catch {
    return code;
  }
}

export function createContentPresenterAdapter({
  getColorScheme,
}: ContentPresenterAdapterOptions): ContentPresenter {
  return {
    hasVisiblePresentation: true,
    copyRevision(): string {
      return getContentLocale();
    },
    attachContentCurtain(request: ContentCurtainRequest): PresenterHandle {
      const content = getContentMessages();
      return attachCurtain(request.target, {
        mode: 'cover',
        icon: defaultHiddenIcon(),
        title: content.contentHidden.title,
        description: content.contentHidden.descriptionForLanguage(request.language),
        ariaLabel: content.contentHidden.ariaLabelForLanguage(request.language),
        colorScheme: getColorScheme(),
        actions: [
          {
            label: content.contentHidden.show,
            // Primary: "Show" is the reveal control, and the pill's responsive
            // collapse keeps the primary action while shedding the secondary
            // (`--ghost`) one — so marking it primary is what keeps a reveal
            // affordance reachable as the target narrows, down to the icon+Show
            // tier. Without it both actions are `--ghost` and both vanish at the
            // first collapse step, stranding the blur with no in-place reveal.
            variant: 'primary',
            onClick: (ctx) => {
              ctx.detach();
              request.reveal();
            },
          },
          {
            label: content.contentHidden.hideAll,
            variant: 'ghost',
            onClick: () => {
              request.hideAll();
            },
          },
        ],
      });
    },
    detachCurtains(root?: ParentNode): void {
      detachAllCurtains(root);
    },
    attachPickerContainerCurtain(request: PickerContainerCurtainRequest): PresenterHandle {
      const content = getContentMessages();
      const label = request.survivingLanguage === null ? '' : endonym(request.survivingLanguage);
      const description = content.pickerHidden.chipLabel(label || null);
      return attachCurtain(request.container, {
        mode: 'replace',
        skin: 'chip',
        icon: defaultHiddenIcon(),
        title: label,
        description,
        ariaLabel: description,
        colorScheme: getColorScheme(),
        actions: [
          {
            label: content.pickerHidden.show,
            onClick: (ctx) => {
              ctx.detach();
            },
          },
        ],
      });
    },
    attachPickerEntryCurtain(request: PickerEntryCurtainRequest): PresenterHandle {
      const content = getContentMessages();
      const description = content.pickerEntry.chipLabel(endonym(request.language));
      return attachCurtain(request.entry, {
        mode: 'replace',
        skin: 'chip',
        // The row it replaces owned a full-width line among other full-width
        // lines, so the curtain takes the whole slot rather than sitting in it
        // as a short mark with the rest of the row left blank.
        block: true,
        minHeight: request.slotHeight,
        icon: defaultHiddenIcon(),
        // The row sits in a list of language names, so its visible text must
        // read as Movar's mark and not as one more option to pick — naming the
        // hidden language here made the chip look selectable, and clicking it
        // restores the option rather than switching to it. The endonym goes to
        // the description instead, which the host surfaces as its `title` and
        // its aria-label.
        title: content.pickerEntry.label,
        description,
        ariaLabel: description,
        colorScheme: getColorScheme(),
        // Forwarded so the caller hears the page-wide sweep too, not just its
        // own detaches — see PickerEntryCurtainRequest.onDetach.
        onDetach: request.onDetach,
        actions: [
          {
            label: content.pickerEntry.show,
            onClick: (ctx) => {
              // Order matters: the curtain's own detach puts the entry's inline
              // `display` back to what it snapshotted — which is the
              // `none !important` hideElement had already written — so the
              // picker-level restore has to run after it to win.
              ctx.detach();
              request.restore();
            },
          },
        ],
      });
    },
    attachPickerControlBadge(request: PickerControlBadgeRequest): PresenterHandle {
      const content = getContentMessages();
      const endonyms = request.hiddenLanguages.map((code) => endonym(code));
      const body = content.pickerSurvivor.body(endonyms);
      // Two surfaces, one interaction. The badge is the always-visible sign
      // that Movar acted — a native <select> otherwise shows nothing until
      // someone happens to hover it — but it is deliberately inert: floating,
      // pointer-events:none, aria-hidden, no tab stop, so it can neither take a
      // click nor add a stop to the page's keyboard order.
      // Declared before the curtain so `onDetach` can close over them: the
      // page-wide sweep resolves the handle off the host and runs ONLY the
      // curtain's detach, so anything else this surface owns has to be torn
      // down from there or it survives every teardown.
      let releaseControl: () => void = noop;
      const badge = attachCurtain(request.control, {
        mode: 'badge',
        skin: 'chip',
        icon: defaultHiddenIcon(),
        title: content.pickerEntry.label,
        description: body,
        ariaLabel: body,
        colorScheme: getColorScheme(),
        actions: [],
        onDetach: () => {
          releaseControl();
        },
      });
      // Everything interactive hangs off the CONTROL, which the visitor is
      // already aiming at and which is already in the tab order — so the
      // explanation and the way back are reachable by keyboard without Movar
      // adding anything to it.
      const tip = attachTooltip(request.control, {
        title: content.pickerSurvivor.title,
        body,
        colorScheme: getColorScheme(),
        action: {
          label: content.pickerSurvivor.show,
          onClick: () => {
            request.restore();
          },
        },
      });
      // The badge cannot feel its own hover (pointer-events: none), and CSS
      // cannot reach it from the control (different tree), so the control's own
      // hover/focus drives the expansion.
      const expand = (): void => {
        badge.host.dataset['expanded'] = 'true';
      };
      const collapse = (): void => {
        delete badge.host.dataset['expanded'];
      };
      const EXPAND_EVENTS = ['mouseenter', 'focus'] as const;
      const COLLAPSE_EVENTS = ['mouseleave', 'blur'] as const;
      for (const type of EXPAND_EVENTS) request.control.addEventListener(type, expand);
      for (const type of COLLAPSE_EVENTS) request.control.addEventListener(type, collapse);
      releaseControl = (): void => {
        for (const type of EXPAND_EVENTS) request.control.removeEventListener(type, expand);
        for (const type of COLLAPSE_EVENTS) request.control.removeEventListener(type, collapse);
        tip.detach();
      };
      return {
        host: badge.host,
        detach(): void {
          // Delegates to the curtain, whose onDetach runs releaseControl — so
          // this path and the page-wide sweep tear down exactly the same set.
          badge.detach();
        },
      };
    },
    attachPickerSurvivorTooltip(request: PickerSurvivorTooltipRequest): PresenterHandle {
      const content = getContentMessages();
      const hiddenEndonyms = request.hiddenLanguages.map((code) => endonym(code));
      return attachTooltip(request.anchor, {
        title: content.pickerSurvivor.title,
        body: content.pickerSurvivor.body(hiddenEndonyms),
        colorScheme: getColorScheme(),
        action: {
          label: content.pickerSurvivor.show,
          onClick: () => {
            request.restore();
          },
        },
      });
    },
    detachAllTooltips(root?: ParentNode): void {
      detachAllTooltips(root);
    },
  };
}
