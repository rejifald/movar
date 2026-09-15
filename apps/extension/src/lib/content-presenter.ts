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

/** One hidden row of a list-shaped picker, to be marked in its own slot rather
 *  than explained by a tooltip hung off a neighbour. */
export interface PickerEntryCurtainRequest {
  /** The hidden entry. The curtain takes its flow slot; the entry stays hidden. */
  entry: HTMLElement;
  /** The language that entry offered. It goes to the chip's DESCRIPTION (its
   *  `title` and aria-label), never its visible text: the chip stands in a list
   *  of language names, and a visible endonym there reads as one more option to
   *  pick rather than as the mark of one taken away. */
  language: LanguageCode;
  /** Height in px of the box the row used to occupy, measured off a still-
   *  visible sibling. 0 when nothing could be measured, in which case the
   *  curtain sizes to its own content. */
  slotHeight: number;
  restore(): void;
}

/** The control of a picker whose entries Movar cannot mark — a native
 *  `<select>`. The badge sits beside it as the visible sign that Movar acted. */
export interface PickerControlBadgeRequest {
  control: HTMLElement;
  hiddenLanguages: readonly LanguageCode[];
  restore(): void;
}

export interface ContentPresenter {
  readonly hasVisiblePresentation: boolean;
  /** Token that changes whenever an already-mounted surface would now render
   *  DIFFERENT words — today, the active UI locale. Callers that skip rebuilding
   *  an unchanged surface fold this into their key: a locale change re-runs the
   *  filter without a teardown, so a surface keyed only on the hidden languages
   *  would keep the previous language's copy for the life of the page. */
  copyRevision(): string;
  attachContentCurtain(request: ContentCurtainRequest): PresenterHandle | null;
  detachCurtains(root?: ParentNode): void;
  attachPickerContainerCurtain(request: PickerContainerCurtainRequest): PresenterHandle | null;
  attachPickerEntryCurtain(request: PickerEntryCurtainRequest): PresenterHandle | null;
  attachPickerControlBadge(request: PickerControlBadgeRequest): PresenterHandle | null;
  attachPickerSurvivorTooltip(request: PickerSurvivorTooltipRequest): PresenterHandle | null;
  detachAllTooltips(root?: ParentNode): void;
}
