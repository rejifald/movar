import type { CSSProperties, JSX, ReactNode } from 'react';
import { cn } from '@movar/ui';

import { deviceTierClass } from '../device-tiers';

/**
 * Shared layout for the two marketplace "before / after" scenes —
 * `correction-applied` (site diptych) and `search-rewrite` (Google
 * SERP diptych). Both scenes share the same composition rules:
 *
 *   - 1280×800 canvas, no popup overlay (the diptych IS the message).
 *   - Two halves side-by-side, 640×800 each, hairline divider between.
 *   - Each half stacks **three** rows top-to-bottom:
 *       1. Browser chrome (URL bar) — natural size, pinned to the top.
 *       2. Scaled content — fills the remaining vertical room between
 *          the chrome and the caption (`flex: 1 1 0`); `overflow:
 *          hidden` clips any content past the bottom of the area.
 *       3. Caption strip — natural size, pinned to the bottom; the
 *          half-inner's own `overflow: hidden` plus the fixed 800px
 *          height guarantee the caption never extends past the
 *          viewport edge regardless of how tall its text is.
 *   - The After half gets an accent treatment on the caption so a
 *     thumbnail-sized preview still reads as a comparison.
 *
 * Why the chrome lives at the half level (not inside the scaled
 * content): the URL is the load-bearing signal for the search-rewrite
 * scene — it's where `hl/lr` params land. Scaling it down by 0.7
 * with the rest of the SERP would shrink the params past legibility.
 * Hoisting the chrome out of the scaled box lets the URL bar render
 * at full display size while the SERP/site renders below it at
 * scaled size. The site backdrop (correction-applied) doesn't
 * intrinsically have a URL bar, but the unified chrome at the top
 * makes both scenes read as "the user's browser" — same vocabulary.
 *
 * Composition width: the scaled-content children render at 880-wide
 * native (not 1280) and scale to `640 / 880 ≈ 0.727`. That's the
 * largest scale that fits 1280-class compositions into 640 without
 * mid-card horizontal clipping — see scene-specific notes in
 * `correction-applied.stories.tsx`.
 */
export interface BeforeAfterHalfProps {
  /** Short uppercase label, e.g. "Without Movar". */
  label: string;
  /** Multi-line body explaining what the half demonstrates. */
  body: string;
  /**
   * URL bar contents rendered inside the browser chrome at the top
   * of the half. Display at native (non-scaled) size — use a
   * `<mark>` to highlight the bytes Movar appends/changes.
   */
  urlBar: ReactNode;
  /**
   * The backdrop component to render. Designed to render at
   * 880-wide native; the frame transforms it via `scale(640/880)`
   * anchored at top-left. Should NOT include its own browser-chrome
   * strip — pass `hideChrome` to `GoogleSerpFrame` and rely on the
   * frame's chrome above.
   */
  content: ReactNode;
  /** Visual variant. `'after'` lights up the accent treatment on the
   *  caption strip. */
  variant: 'before' | 'after';
}

export interface BeforeAfterFrameProps {
  before: BeforeAfterHalfProps;
  after: BeforeAfterHalfProps;
  /** `lang` attribute on the wrapping div — drives screen-reader
   *  pronunciation of the captions. `'en'` or `'uk'`. */
  lang: string;
  /** Native vertical extent the backdrop is allowed to render into,
   *  in 880-wide composition pixels. The inner element gets this as
   *  its CSS `height`; what fits inside the post-chrome /
   *  post-caption content area is visible, anything beyond is
   *  clipped by `overflow: hidden`. Default `920`. */
  contentNativeHeight?: number;
}

/** Composition width — the native width the children are designed
 *  to render at when used inside the diptych. The scale factor
 *  follows from this and the half width. */
const COMPOSITION_W = 880;
const FRAME_W = 1280;
const FRAME_H = 800;
const HALF_W = FRAME_W / 2;
const SCALE = HALF_W / COMPOSITION_W;
const DEFAULT_CONTENT_NATIVE_HEIGHT = 860;
/** Fixed caption height in display pixels. Sized to comfortably fit
 *  the longest 3-line caption body across every scene and locale
 *  (story copy is trimmed so the body never spills past 3 lines);
 *  shorter captions get padding around the text. Held constant so
 *  the two halves of every diptych end with identical footers — a
 *  height that varied per-half would read as a layout bug at
 *  thumbnail scale. */
const CAPTION_H = 150;

function BeforeAfterFrame({
  before,
  after,
  lang,
  contentNativeHeight = DEFAULT_CONTENT_NATIVE_HEIGHT,
}: BeforeAfterFrameProps): JSX.Element {
  const styleVars = {
    '--ba-scale': SCALE,
    '--ba-composition-w': `${COMPOSITION_W}px`,
    '--ba-native-h': `${contentNativeHeight}px`,
  } as CSSProperties;

  return (
    <div
      className={cn('movar-before-after', deviceTierClass('desktop'))}
      lang={lang}
      style={styleVars}
    >
      <style>{BEFORE_AFTER_CSS}</style>
      <div className="half half--before">
        <BeforeAfterHalf {...before} />
      </div>
      <div className="half half--after">
        <BeforeAfterHalf {...after} />
      </div>
      <div className="divider" aria-hidden="true" />
    </div>
  );
}

function BeforeAfterHalf({
  label,
  body,
  urlBar,
  content,
  variant,
}: BeforeAfterHalfProps): JSX.Element {
  return (
    <div className={cn('half-inner', `half-inner--${variant}`)}>
      <div className="browser-chrome">
        <div className="dots" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <div className="urlbar">
          <span className="lock" aria-hidden="true">
            🔒
          </span>
          <span className="url">{urlBar}</span>
        </div>
      </div>
      <div className="content">
        <div className="content-scaled">{content}</div>
      </div>
      <div className="caption">
        <div className="caption-label">{label}</div>
        <p className="caption-body">{body}</p>
      </div>
    </div>
  );
}

const FRAME_STYLE: CSSProperties = {
  position: 'relative',
  width: FRAME_W,
  height: FRAME_H,
  overflow: 'hidden',
};

/**
 * Layout-level CSS. Variant treatments (accent border, accent label
 * color) live here so the `BeforeAfterHalf` component stays a pure
 * dumb renderer. The accent token mirrors the marketing diptych's
 * `border-accent/30` + accent label rule from `BeforeAfter.astro`.
 *
 * `var(--ba-scale)`, `var(--ba-composition-w)`, and `var(--ba-native-h)`
 * come from the inline style on `.movar-before-after`.
 */
const BEFORE_AFTER_CSS = `
  .movar-before-after {
    position: relative;
    width: ${FRAME_W}px;
    height: ${FRAME_H}px;
    background: #ffffff;
    color: #0f172a;
    font: 14px/1.45 system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
    overflow: hidden;
  }
  .movar-before-after .half {
    position: absolute;
    top: 0;
    width: ${HALF_W}px;
    height: ${FRAME_H}px;
    overflow: hidden;
  }
  .movar-before-after .half--before { left: 0; }
  .movar-before-after .half--after { left: ${HALF_W}px; }
  /* Hairline divider — 1px is enough for PNG; anything thicker reads
     as chrome and competes with the captions. */
  .movar-before-after .divider {
    position: absolute;
    left: ${HALF_W}px;
    top: 0;
    bottom: 0;
    width: 1px;
    background: rgba(15, 23, 42, 0.10);
    z-index: 5;
  }

  .movar-before-after .half-inner {
    position: relative;
    width: ${HALF_W}px;
    height: ${FRAME_H}px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  /* Browser chrome — native-size at the top of each half. The dots
     suggest a window header; the URL bar is the load-bearing signal
     (especially for search-rewrite where Movar's params land here).
     Styling matches the chrome that used to live inside
     google-serp-frame.tsx so the marketing diptych and the
     marketplace diptych read with the same browser vocabulary. */
  .movar-before-after .browser-chrome {
    flex: 0 0 auto;
    background: #f1f3f4;
    border-bottom: 1px solid #dadce0;
    padding: 8px 14px;
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .movar-before-after .browser-chrome .dots {
    display: flex;
    gap: 6px;
    flex-shrink: 0;
  }
  .movar-before-after .browser-chrome .dots span {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #cbd2da;
  }
  .movar-before-after .browser-chrome .urlbar {
    flex: 1;
    min-width: 0;
    background: #ffffff;
    border: 1px solid #dadce0;
    border-radius: 999px;
    padding: 6px 14px;
    font: 12px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
    color: #4d5156;
    display: flex;
    align-items: center;
    gap: 8px;
    overflow: hidden;
  }
  .movar-before-after .browser-chrome .urlbar .lock {
    color: #70757a;
    font-size: 11px;
    flex-shrink: 0;
  }
  .movar-before-after .browser-chrome .urlbar .url {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .movar-before-after .browser-chrome .urlbar .url mark {
    background: #fef7e0;
    color: #5f4500;
    padding: 1px 4px;
    border-radius: 3px;
    margin: 0 -2px;
  }

  /* Content area sits between the chrome and the caption and absorbs
     whatever vertical room those two leave (flex 1 1 0 + min-height
     0 makes flex shrink the box past intrinsic content size).
     overflow hidden clips both the horizontal composition (renders
     at 880-wide native vs. the 640-wide half) and any vertical
     overflow when the scaled content is taller than the remaining
     area. The half-inner's own overflow hidden is the final guard —
     the caption stays pinned to the bottom of the 800px viewport
     regardless of how tall the scaled content is. */
  .movar-before-after .content {
    flex: 1 1 0;
    width: ${HALF_W}px;
    min-height: 0;
    overflow: hidden;
    position: relative;
  }
  .movar-before-after .content-scaled {
    transform: scale(var(--ba-scale));
    transform-origin: top left;
    width: var(--ba-composition-w);
    height: var(--ba-native-h);
  }
  /* Force the backdrop child to stretch to the full height of the
     content-scaled box. Without this, a backdrop with intrinsic
     content shorter than var(--ba-native-h) would leave the bottom
     of content-scaled unpainted — and that gap shows through as a
     seam between the page body and the footer. */
  .movar-before-after .content-scaled > * {
    min-height: 100%;
    box-sizing: border-box;
  }

  /* Caption is pinned to the bottom of the half (flex 0 0 auto =
     natural size) with a fixed height so both halves of the diptych
     end with footers of identical size — different-length
     translations would otherwise produce asymmetric strips. The
     half-inner's overflow hidden plus the fixed 800px height
     guarantee the caption never extends past the viewport. */
  .movar-before-after .caption {
    flex: 0 0 ${CAPTION_H}px;
    height: ${CAPTION_H}px;
    padding: 22px 32px 26px;
    border-top: 1px solid rgba(15, 23, 42, 0.08);
    background: #f8fafc;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    overflow: hidden;
  }
  .movar-before-after .caption-label {
    font: 600 14px/1 'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: #64748b;
    margin: 0 0 12px;
  }
  .movar-before-after .caption-body {
    font-size: 18px;
    line-height: 1.45;
    font-weight: 500;
    color: #1e293b;
    margin: 0;
    max-width: 540px;
  }

  /* After-half accent. Border + label colour mirror the marketing
     diptych's "with-Movar" treatment so the two surfaces (marketing
     page, marketplace screenshot) read as the same comparison
     vocabulary. */
  .movar-before-after .half-inner--after .caption {
    background: #ecfdf5;
    border-top-color: rgba(21, 128, 61, 0.25);
  }
  .movar-before-after .half-inner--after .caption-label {
    color: #15803d;
  }
  .movar-before-after .half-inner--after .caption-label::before {
    content: '✓';
    font-size: 1.4em;
    font-weight: 700;
    line-height: 0;
    vertical-align: -0.1em;
    margin-right: 0.3em;
  }
  .movar-before-after .half-inner--after .caption-body {
    color: #1f2937;
  }

  /* Dark theme — repaints the diptych's own chrome (browser frame +
     caption strips + divider). Inert unless captured under
     prefers-color-scheme: dark, so the light-only scenes
     (popup-on-news / correction-applied / language-dialog) are
     unaffected. The website backdrops nested inside repaint via their
     own @media blocks; this keeps the surrounding frame in step. */
  @media (prefers-color-scheme: dark) {
    .movar-before-after {
      background: #111827;
      color: #e5e7eb;
    }
    .movar-before-after .divider {
      background: rgba(255, 255, 255, 0.12);
    }
    .movar-before-after .browser-chrome {
      background: #292a2d;
      border-bottom-color: #3c4043;
    }
    .movar-before-after .browser-chrome .dots span {
      background: #5f6368;
    }
    .movar-before-after .browser-chrome .urlbar {
      background: #303134;
      border-color: #5f6368;
      color: #bdc1c6;
    }
    .movar-before-after .browser-chrome .urlbar .lock {
      color: #9aa0a6;
    }
    .movar-before-after .browser-chrome .urlbar .url mark {
      background: #3a2f12;
      color: #fdd663;
    }
    .movar-before-after .caption {
      background: #1f2937;
      border-top-color: rgba(255, 255, 255, 0.08);
    }
    .movar-before-after .caption-label {
      color: #94a3b8;
    }
    .movar-before-after .caption-body {
      color: #e2e8f0;
    }
    .movar-before-after .half-inner--after .caption {
      background: #0f2a1e;
      border-top-color: rgba(52, 211, 153, 0.3);
    }
    .movar-before-after .half-inner--after .caption-label {
      color: #34d399;
    }
    .movar-before-after .half-inner--after .caption-body {
      color: #e2e8f0;
    }
  }
`;

// Apply the frame size via inline style on the root so component
// consumers don't need to wrap us in their own positioned container.
// Storybook's `layout: 'fullscreen'` viewport plus this 1280×800 root
// is what the capture script screenshots.
export function BeforeAfterFrameWithFrame(props: BeforeAfterFrameProps): JSX.Element {
  return (
    <div style={FRAME_STYLE}>
      <BeforeAfterFrame {...props} />
    </div>
  );
}
