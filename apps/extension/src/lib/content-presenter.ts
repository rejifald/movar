import type { LanguageCode } from '@movar/lang-detect';

export interface PresenterHandle {
  detach(): void;
  readonly host: HTMLElement;
}

export interface ContentCurtainRequest {
  target: HTMLElement;
  language: LanguageCode;
  reveal(): void;
  hideAll(): void;
}

export interface PickerContainerCurtainRequest {
  container: HTMLElement;
  survivingLanguage: LanguageCode | null;
}

export interface PickerSurvivorTooltipRequest {
  anchor: HTMLElement;
  hiddenLanguages: readonly LanguageCode[];
  restore(): void;
}

export interface ContentPresenter {
  readonly hasVisiblePresentation: boolean;
  attachContentCurtain(request: ContentCurtainRequest): PresenterHandle | null;
  detachCurtains(root?: ParentNode): void;
  attachPickerContainerCurtain(request: PickerContainerCurtainRequest): PresenterHandle | null;
  attachPickerSurvivorTooltip(request: PickerSurvivorTooltipRequest): PresenterHandle | null;
  detachAllTooltips(root?: ParentNode): void;
}
