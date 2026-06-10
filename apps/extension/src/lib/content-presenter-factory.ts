import type { LanguageCode } from '@movar/lang-detect';
import type { PageMode } from '@movar/page-mode/types';
import type {
  ContentCurtainRequest,
  ContentPresenter,
  PickerContainerCurtainRequest,
  PickerSurvivorTooltipRequest,
  PresenterHandle,
} from './content-presenter';
import { attachCurtain, defaultHiddenIcon, detachAllCurtains } from './curtain';
import { getContentMessages } from './i18n/content';
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
            onClick: (ctx) => {
              ctx.detach();
              request.reveal();
            },
          },
          {
            label: content.contentHidden.hideAll,
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
