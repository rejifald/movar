import type { LanguageCode } from '@movar/lang-detect';
import type { PageMode } from '@movar/page-mode/types';
import type {
  ContentCurtainRequest,
  ContentPresenter,
  PickerContainerCurtainRequest,
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
    pickerHiddenOptionLabel(): string {
      // The same words the in-row chip shows, because it is the same statement
      // — "Movar took an option out of here" — in the one layout that has to
      // say it inside the control rather than beside it.
      return getContentMessages().pickerEntry.label;
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
