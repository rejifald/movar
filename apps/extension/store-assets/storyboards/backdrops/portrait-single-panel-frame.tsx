import type { CSSProperties, JSX, ReactNode } from 'react';

import { useMeasuredHeight } from '../use-measured-height';

/**
 * Portrait **single-panel** frame for the App Store screenshots whose
 * message is the product UI itself rather than a before/after contrast —
 * scene #1 (the Movar popup open over a news article). A marketing hero
 * band sits on top; below it a full-bleed page backdrop fills the canvas
 * with the product popup overlaid, prominently, near the bottom and offset
 * to the right (not centered) — echoing where the Safari toolbar button that
 * opens it sits, and matching the landscape scene's right-bottom placement.
 *
 * Sibling to `portrait-before-after-frame.tsx`; same hero treatment and
 * the same "design at literal device px" approach (iPhone 1320×2868,
 * iPad 2048×2732). The popup is passed separately from the page (rather
 * than via the backdrop's own `position: fixed` slot) so the frame
 * controls its size and placement independent of the scaled page.
 */
export interface PortraitSinglePanelFrameProps {
  width: number;
  height: number;
  lang: string;
  headline: string;
  subhead?: string;
  /** Full-page backdrop (no popup) rendered at `compositionWidth` native. */
  pageContent: ReactNode;
  /** Product popup overlaid near the bottom, at `popupNativeWidth` native. */
  popup: ReactNode;
  /** Native width the page backdrop is designed at. Default 1280. */
  compositionWidth?: number;
  /** Native height the page paints into before clipping. Default 2400. */
  contentNativeHeight?: number;
  /** Native width of the popup card (the extension popup is ~360). Default 360. */
  popupNativeWidth?: number;
}

const DEFAULT_COMPOSITION_W = 1280;
const DEFAULT_CONTENT_NATIVE_HEIGHT = 2400;
const DEFAULT_POPUP_NATIVE_W = 360;
/** First-paint estimate of the popup's natural height, refined by measuring
 *  the rendered card (see below). Only used for the pre-measure frame. */
const DEFAULT_POPUP_NATIVE_H = 741;
/** Target popup width as a fraction of the canvas — the prominence the design
 *  wants on a narrow (iPhone) canvas. */
const POPUP_WIDTH_FRACTION = 0.62;
/** Ceiling on the popup's rendered height as a fraction of the canvas height.
 *  On a tall narrow canvas (iPhone 1320×2868) the width fraction stays the
 *  binding constraint; on a wider canvas (iPad 2048×2732) the 62%-width popup
 *  would scale up past the canvas and clip its header, so this cap takes over
 *  and the popup is sized to its natural height instead. Tuned so the iPhone
 *  scene is unchanged (its height works out to ~0.59) while the iPad fits. */
const POPUP_MAX_HEIGHT_FRACTION = 0.62;

function PortraitSinglePanelFrame({
  width,
  height,
  lang,
  headline,
  subhead,
  pageContent,
  popup,
  compositionWidth = DEFAULT_COMPOSITION_W,
  contentNativeHeight = DEFAULT_CONTENT_NATIVE_HEIGHT,
  popupNativeWidth = DEFAULT_POPUP_NATIVE_W,
}: PortraitSinglePanelFrameProps): JSX.Element {
  const pageScale = width / compositionWidth;
  // Measure the popup card's natural (untransformed) height and keep the frame
  // fitted to the popup's *current* height: if the popup grows, the scale
  // shrinks to fit rather than silently clipping (the capture-script guard is
  // the backstop for the cases a fixed canvas can't absorb).
  const [cardRef, popupNativeHeight] = useMeasuredHeight(DEFAULT_POPUP_NATIVE_H);
  // The popup is scaled to be ~62% of the canvas width, but never so large that
  // its height exceeds POPUP_MAX_HEIGHT_FRACTION of the canvas — whichever is
  // smaller wins. The width term drives the iPhone; the height cap drives the
  // (wider) iPad.
  const widthScale = (width * POPUP_WIDTH_FRACTION) / popupNativeWidth;
  const heightScale = (height * POPUP_MAX_HEIGHT_FRACTION) / popupNativeHeight;
  const popupScale = Math.min(widthScale, heightScale);
  const styleVars = {
    '--psp-w': `${width}px`,
    '--psp-h': `${height}px`,
    '--psp-page-scale': pageScale,
    '--psp-comp-w': `${compositionWidth}px`,
    '--psp-native-h': `${contentNativeHeight}px`,
    '--psp-popup-w': `${popupNativeWidth}px`,
    '--psp-popup-scale': popupScale,
  } as CSSProperties;

  return (
    <div className="movar-portrait-sp" lang={lang} style={styleVars}>
      <style>{PORTRAIT_SP_CSS}</style>
      <header className="hero">
        <div className="hero-mark" aria-hidden="true">
          movar
        </div>
        <h2 className="hero-headline">{headline}</h2>
        {subhead ? <p className="hero-subhead">{subhead}</p> : null}
      </header>
      <div className="stage">
        <div className="page-scaled">{pageContent}</div>
        <div className="scrim" aria-hidden="true" />
        <div className="popup-layer">
          <div className="popup-card" ref={cardRef}>
            {popup}
          </div>
        </div>
      </div>
    </div>
  );
}

const ROOT_STYLE: CSSProperties = {
  position: 'relative',
  overflow: 'hidden',
};

const PORTRAIT_SP_CSS = `
  .movar-portrait-sp {
    position: relative;
    width: var(--psp-w);
    height: var(--psp-h);
    background: #ffffff;
    color: #0f172a;
    font: 28px/1.45 system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }
  .movar-portrait-sp .hero {
    flex: 0 0 auto;
    padding: 96px 88px 64px;
    background: linear-gradient(180deg, #eff6ff 0%, #ffffff 100%);
    border-bottom: 1px solid #e2e8f0;
  }
  .movar-portrait-sp .hero-mark {
    font: 700 40px/1 system-ui, -apple-system, sans-serif;
    letter-spacing: -0.02em;
    color: #2563eb;
    margin: 0 0 28px;
  }
  .movar-portrait-sp .hero-headline {
    font-size: 76px;
    line-height: 1.1;
    font-weight: 700;
    letter-spacing: -0.02em;
    color: #0f172a;
    margin: 0;
    max-width: 1040px;
  }
  .movar-portrait-sp .hero-subhead {
    font-size: 38px;
    line-height: 1.35;
    font-weight: 500;
    color: #475569;
    margin: 28px 0 0;
    max-width: 1040px;
  }

  /* Stage holds the scaled page backdrop, a fade scrim, and the popup. */
  .movar-portrait-sp .stage {
    flex: 1 1 0;
    min-height: 0;
    position: relative;
    overflow: hidden;
  }
  .movar-portrait-sp .page-scaled {
    transform: scale(var(--psp-page-scale));
    transform-origin: top left;
    width: var(--psp-comp-w);
    height: var(--psp-native-h);
  }
  .movar-portrait-sp .page-scaled > * {
    min-height: 100%;
    box-sizing: border-box;
  }
  /* Bottom fade so the page recedes and the popup reads as the subject. */
  .movar-portrait-sp .scrim {
    position: absolute;
    inset: 0;
    pointer-events: none;
    background: linear-gradient(
      180deg,
      rgba(248, 250, 252, 0) 38%,
      rgba(226, 232, 240, 0.62) 100%
    );
  }
  .movar-portrait-sp .popup-layer {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 8%;
    display: flex;
    /* Offset to the right rather than centered — reads as "popped from the
     * toolbar button" and matches the landscape scene's right-bottom popup.
     * The padding keeps it off the very edge; the card scales from its
     * bottom-right anchor so this right inset holds at any popup size. */
    justify-content: flex-end;
    padding-right: 6%;
  }
  .movar-portrait-sp .popup-card {
    width: var(--psp-popup-w);
    transform: scale(var(--psp-popup-scale));
    transform-origin: bottom right;
    border-radius: 14px;
    overflow: hidden;
    background: #ffffff;
    box-shadow:
      0 30px 80px rgba(2, 6, 23, 0.28),
      0 4px 10px rgba(2, 6, 23, 0.12);
  }
`;

export function PortraitSinglePanelFrameWithFrame(
  props: PortraitSinglePanelFrameProps,
): JSX.Element {
  return (
    <div style={{ ...ROOT_STYLE, width: props.width, height: props.height }}>
      <PortraitSinglePanelFrame {...props} />
    </div>
  );
}
