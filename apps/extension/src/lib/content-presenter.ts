import type { LanguageCode } from '@movar/lang-detect';
import type { CurtainOptions } from './curtain';
import type { TooltipOptions } from './tooltip';
import type { ContentMessages } from './i18n/content-strings';

export interface PresenterHandle {
  detach: () => void;
  readonly host: HTMLElement;
}

export interface ContentCurtainRequest {
  target: HTMLElement;
  language: LanguageCode;
  reveal: () => void;
}

export interface PickerContainerCurtainRequest {
  container: HTMLElement;
  survivingLang: LanguageCode | null;
  kind: string;
}

export interface PickerSurvivorTooltipRequest {
  anchor: HTMLElement;
  hiddenLanguages: readonly LanguageCode[];
  restore: () => void;
}

export interface ContentPresenter {
  readonly hasVisiblePresentation: boolean;
  attachContentCurtain: (request: ContentCurtainRequest) => void;
  detachCurtains: (root?: ParentNode) => void;
  attachPickerContainerCurtain: (request: PickerContainerCurtainRequest) => PresenterHandle | null;
  attachPickerSurvivorTooltip: (request: PickerSurvivorTooltipRequest) => PresenterHandle | null;
}

export const noopContentPresenter: ContentPresenter = {
  hasVisiblePresentation: false,
  attachContentCurtain: () => {
    // Structural-only mode intentionally attaches no visible UI.
  },
  detachCurtains: () => {
    // Nothing was attached by this presenter.
  },
  attachPickerContainerCurtain: () => null,
  attachPickerSurvivorTooltip: () => null,
};

export interface CurtainPresenterDependencies {
  attachCurtain: (target: HTMLElement, options: CurtainOptions) => PresenterHandle;
  attachTooltip: (anchor: HTMLElement, options: TooltipOptions) => PresenterHandle;
  defaultHiddenIcon: () => NonNullable<CurtainOptions['icon']>;
  detachCurtains: (root?: ParentNode) => void;
  getMessages: () => ContentMessages;
  getColorScheme: () => NonNullable<CurtainOptions['colorScheme']>;
}

export function createCurtainPresenter(deps: CurtainPresenterDependencies) {
  const attachContentCurtain = ({ target, language, reveal }: ContentCurtainRequest): void => {
    const content = deps.getMessages();
    deps.attachCurtain(target, {
      mode: 'cover',
      icon: deps.defaultHiddenIcon(),
      title: content.contentHidden.title,
      description: content.contentHidden.descriptionForLanguage(language),
      ariaLabel: content.contentHidden.ariaLabelForLanguage(language),
      colorScheme: deps.getColorScheme(),
      actions: [
        {
          label: content.contentHidden.show,
          onClick: (ctx) => {
            ctx.detach();
            reveal();
          },
        },
      ],
    });
  };

  const detachCurtains = (root?: ParentNode): void => {
    deps.detachCurtains(root);
  };

  const attachPickerContainerCurtain = ({
    container,
    survivingLang,
    kind,
  }: PickerContainerCurtainRequest): PresenterHandle => {
    const content = deps.getMessages();
    const label = survivingLang === null ? '' : endonym(survivingLang);
    const description = content.pickerHidden.chipLabel(label || null);
    const handle = deps.attachCurtain(container, {
      mode: 'replace',
      skin: 'chip',
      icon: deps.defaultHiddenIcon(),
      title: label,
      description,
      ariaLabel: description,
      colorScheme: deps.getColorScheme(),
      actions: [
        {
          label: content.pickerHidden.show,
          onClick: (ctx) => {
            ctx.detach();
          },
        },
      ],
    });
    handle.host.dataset['movarKind'] = kind;
    return handle;
  };

  const attachPickerSurvivorTooltip = ({
    anchor,
    hiddenLanguages,
    restore,
  }: PickerSurvivorTooltipRequest): PresenterHandle | null => {
    if (hiddenLanguages.length === 0) return null;
    const content = deps.getMessages();
    const endonyms = hiddenLanguages.map((code) => endonym(code));
    return deps.attachTooltip(anchor, {
      title: content.pickerSurvivor.title,
      body: content.pickerSurvivor.body(endonyms),
      colorScheme: deps.getColorScheme(),
      action: {
        label: content.pickerSurvivor.show,
        onClick: () => {
          restore();
        },
      },
    });
  };

  return {
    hasVisiblePresentation: true,
    attachContentCurtain,
    detachCurtains,
    attachPickerContainerCurtain,
    attachPickerSurvivorTooltip,
  };
}

function endonym(code: LanguageCode): string {
  try {
    return new Intl.DisplayNames([code], { type: 'language' }).of(code) ?? code;
  } catch {
    return code;
  }
}
