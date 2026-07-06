import type { CSSProperties, JSX, ReactNode } from 'react';

import { TABLET_ASPECT } from './portrait-single-panel-frame';

/**
 * Portrait "before / after" frame for the **iOS / iPadOS** App Store
 * screenshots. The marketplace (CWS/AMO) scenes use the *landscape*
 * `before-after-frame.tsx` (two 640-wide halves side by side at
 * 1280×800); App Store wants tall portrait canvases at fixed device
 * sizes (iPhone 6.9″ = 1320×2868, iPad 13″ = 2048×2732), so the same
 * before/after story is re-laid-out *vertically*:
 *
 *   ┌─────────────────────────────┐
 *   │ Headline band (marketing)   │  ← localized hero line + subhead
 *   ├─────────────────────────────┤
 *   │ WITHOUT label               │
 *   │ browser chrome (URL bar)    │  ← before block
 *   │ scaled content (clipped)    │
 *   ├─────────────────────────────┤
 *   │ WITH label  (accent)        │
 *   │ browser chrome (URL bar)    │  ← after block
 *   │ scaled content (clipped)    │
 *   └─────────────────────────────┘
 *
 * One component serves both device sizes: pass `width`/`height` and the
 * content scale is derived from the canvas width (content renders at
 * `COMPOSITION_W` native and scales to fill the canvas, full-bleed like
 * a real mobile page). The before/after content components are the SAME
 * ones the landscape diptych uses (`GoogleSerpFrame`, etc.) rendered
 * with `hideChrome` — only the surrounding frame differs.
 *
 * Captured at the literal device px (deviceScaleFactor handled by the
 * capture script), so design here is a 1320- / 2048-wide marketing
 * canvas, not a faked @3x phone render. Dark variants repaint via the
 * `@media (prefers-color-scheme: dark)` block, exactly like the
 * landscape frame; the nested website backdrops repaint themselves.
 */
export interface PortraitHalfProps {
  /** Short uppercase label, e.g. "Without Movar" / "З Movar". */
  label: string;
  /** URL bar contents — use `<mark>` to highlight the bytes Movar changes. */
  urlBar: ReactNode;
  /** Backdrop rendered at `COMPOSITION_W` native; the frame scales it to
   *  fill the canvas width. Pass `hideChrome` to `GoogleSerpFrame`. */
  content: ReactNode;
  variant: 'before' | 'after';
}

export interface PortraitBeforeAfterFrameProps {
  /** Device canvas width in px — 1320 (iPhone 6.9″) or 2048 (iPad 13″). */
  width: number;
  /** Device canvas height in px — 2868 (iPhone) or 2732 (iPad). */
  height: number;
  /** `lang` attribute — drives screen-reader pronunciation. `'en'`/`'uk'`. */
  lang: string;
  /** Marketing hero line at the top of the canvas. */
  headline: string;
  /** Optional one-line subhead under the headline. */
  subhead?: string;
  before: PortraitHalfProps;
  after: PortraitHalfProps;
  /** Native vertical extent (in composition-space px) the backdrop is allowed to
   *  paint into before clipping. Default `900`. */
  contentNativeHeight?: number;
  /** Native width the content is designed at on a narrow (iPhone) canvas.
   *  Default `880`. */
  compositionWidth?: number;
  /** Native width the content is designed at on a wide (iPad) canvas. Default
   *  `1280` — wider so the site is magnified less and shows a tablet slice. */
  compositionWidthTablet?: number;
}

/** Native width the content children are designed to render at on a narrow
 *  (iPhone) canvas — shared with the landscape frame so the same backdrops drop
 *  in unchanged. */
const COMPOSITION_W = 880;
/** Native width on a wide (iPad) canvas. Wider than the phone composition so the
 *  site inside is magnified ~1.6× (close to the iPhone's 1.5×) instead of 2.3×,
 *  revealing a tablet-proportioned slice — the backdrops' flex navs spread to
 *  fill the width, their content reflows wider — rather than a zoomed-in phone. */
const COMPOSITION_W_TABLET = 1280;
const DEFAULT_CONTENT_NATIVE_HEIGHT = 900;

function PortraitBeforeAfterFrame({
  width,
  height,
  lang,
  headline,
  subhead,
  before,
  after,
  contentNativeHeight = DEFAULT_CONTENT_NATIVE_HEIGHT,
  compositionWidth = COMPOSITION_W,
  compositionWidthTablet = COMPOSITION_W_TABLET,
}: PortraitBeforeAfterFrameProps): JSX.Element {
  // Content is full-bleed: it renders at the active composition width and scales
  // up to the canvas width. On a wide (iPad) canvas it uses the wider tablet
  // composition, so an 880-designed backdrop renders as a ~1280-wide tablet
  // slice magnified ~1.6× rather than a 2.3×-zoomed phone; on iPhone it keeps
  // the 880 composition. Either way it fills the canvas edge to edge.
  const tablet = width / height > TABLET_ASPECT;
  const composition = tablet ? compositionWidthTablet : compositionWidth;
  const scale = width / composition;
  const styleVars = {
    '--pba-w': `${width}px`,
    '--pba-h': `${height}px`,
    '--pba-scale': scale,
    '--pba-composition-w': `${composition}px`,
    '--pba-native-h': `${contentNativeHeight}px`,
  } as CSSProperties;

  return (
    <div className="movar-portrait-ba" lang={lang} style={styleVars}>
      <style>{PORTRAIT_BA_CSS}</style>
      <header className="hero">
        <div className="hero-mark" aria-hidden="true">
          movar
        </div>
        <h2 className="hero-headline">{headline}</h2>
        {subhead ? <p className="hero-subhead">{subhead}</p> : null}
      </header>
      <PortraitHalf {...before} />
      <PortraitHalf {...after} />
    </div>
  );
}

function PortraitHalf({ label, urlBar, content, variant }: PortraitHalfProps): JSX.Element {
  return (
    <section className={`block block--${variant}`}>
      <div className="block-label">{label}</div>
      <div className="browser-chrome">
        <span className="lock" aria-hidden="true">
          🔒
        </span>
        <span className="url">{urlBar}</span>
      </div>
      <div className="content">
        <div className="content-scaled">{content}</div>
      </div>
    </section>
  );
}

const ROOT_STYLE: CSSProperties = {
  position: 'relative',
  overflow: 'hidden',
};

/**
 * Layout CSS. Sizes are absolute px (the canvas is captured at literal
 * device dimensions). `--pba-*` vars come from the inline style above.
 */
const PORTRAIT_BA_CSS = `
  .movar-portrait-ba {
    position: relative;
    width: var(--pba-w);
    height: var(--pba-h);
    background: #ffffff;
    color: #0f172a;
    font: 28px/1.45 system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  /* Marketing hero band — the App Store "say what it does" header. */
  .movar-portrait-ba .hero {
    flex: 0 0 auto;
    padding: 96px 88px 64px;
    background: linear-gradient(180deg, #eff6ff 0%, #ffffff 100%);
    border-bottom: 1px solid #e2e8f0;
  }
  .movar-portrait-ba .hero-mark {
    font: 700 40px/1 system-ui, -apple-system, sans-serif;
    letter-spacing: -0.02em;
    color: #2563eb;
    margin: 0 0 28px;
  }
  .movar-portrait-ba .hero-headline {
    font-size: 76px;
    line-height: 1.1;
    font-weight: 700;
    letter-spacing: -0.02em;
    color: #0f172a;
    margin: 0;
    max-width: 1040px;
  }
  .movar-portrait-ba .hero-subhead {
    font-size: 38px;
    line-height: 1.35;
    font-weight: 500;
    color: #475569;
    margin: 28px 0 0;
    max-width: 1040px;
  }

  /* Each before/after block: label chip, browser chrome, scaled content.
     The two blocks split the remaining height (flex 1 1 0). */
  .movar-portrait-ba .block {
    flex: 1 1 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border-top: 1px solid #e2e8f0;
  }
  .movar-portrait-ba .block-label {
    flex: 0 0 auto;
    font: 600 30px/1 'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: #64748b;
    padding: 36px 88px 24px;
  }

  /* Browser chrome — native-size URL bar; the load-bearing signal for
     search-rewrite where Movar's hl/lr params land. */
  .movar-portrait-ba .browser-chrome {
    flex: 0 0 auto;
    margin: 0 64px 20px;
    background: #ffffff;
    border: 1px solid #dadce0;
    border-radius: 999px;
    padding: 16px 32px;
    font: 26px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
    color: #4d5156;
    display: flex;
    align-items: center;
    gap: 16px;
    overflow: hidden;
  }
  .movar-portrait-ba .browser-chrome .lock {
    color: #70757a;
    font-size: 24px;
    flex-shrink: 0;
  }
  .movar-portrait-ba .browser-chrome .url {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .movar-portrait-ba .browser-chrome .url mark {
    background: #fef7e0;
    color: #5f4500;
    padding: 2px 8px;
    border-radius: 5px;
    margin: 0 -3px;
  }

  /* Scaled content fills the rest of the block; full-bleed to the canvas
     width. overflow hidden clips both the composition-vs-canvas width and
     any vertical overflow past the block. */
  .movar-portrait-ba .content {
    flex: 1 1 0;
    min-height: 0;
    width: var(--pba-w);
    overflow: hidden;
    position: relative;
  }
  .movar-portrait-ba .content-scaled {
    transform: scale(var(--pba-scale));
    transform-origin: top left;
    width: var(--pba-composition-w);
    height: var(--pba-native-h);
  }
  /* Stretch the backdrop to fill the scaled box so a short backdrop
     doesn't leave an unpainted seam at the bottom. */
  .movar-portrait-ba .content-scaled > * {
    min-height: 100%;
    box-sizing: border-box;
  }

  /* Portrait trim: the marketing hero + the URL bar already establish
     "this is a Google search for <query>", so inside the scaled SERP we
     keep only the Google wordmark and drop the redundant search box,
     tabs, and avatar — giving the result list (the real message) more
     room and removing the duplicated query. Reaches into the nested
     backdrop's own classes; harmless for non-SERP scenes. */
  .movar-portrait-ba .content .movar-backdrop-gserp .searchbox,
  .movar-portrait-ba .content .movar-backdrop-gserp .avatar,
  .movar-portrait-ba .content .movar-backdrop-gserp .tabs {
    display: none;
  }

  /* After-block accent — mirrors the landscape frame + marketing diptych
     "with Movar" green treatment. */
  .movar-portrait-ba .block--after {
    border-top: 2px solid rgba(21, 128, 61, 0.28);
    background: #f0fdf4;
  }
  .movar-portrait-ba .block--after .block-label {
    color: #15803d;
  }
  .movar-portrait-ba .block--after .block-label::before {
    content: '✓ ';
  }

  /* Dark theme — repaints the frame chrome (hero, labels, URL bar). The
     nested website backdrops repaint via their own @media blocks. Inert
     unless captured under prefers-color-scheme: dark. */
  @media (prefers-color-scheme: dark) {
    .movar-portrait-ba {
      background: #111827;
      color: #e5e7eb;
    }
    .movar-portrait-ba .hero {
      background: linear-gradient(180deg, #0b1f3a 0%, #111827 100%);
      border-bottom-color: #1f2937;
    }
    .movar-portrait-ba .hero-mark { color: #60a5fa; }
    .movar-portrait-ba .hero-headline { color: #f1f5f9; }
    .movar-portrait-ba .hero-subhead { color: #94a3b8; }
    .movar-portrait-ba .block { border-top-color: #1f2937; }
    .movar-portrait-ba .block-label { color: #94a3b8; }
    .movar-portrait-ba .browser-chrome {
      background: #303134;
      border-color: #5f6368;
      color: #bdc1c6;
    }
    .movar-portrait-ba .browser-chrome .lock { color: #9aa0a6; }
    .movar-portrait-ba .browser-chrome .url mark {
      background: #3a2f12;
      color: #fdd663;
    }
    .movar-portrait-ba .block--after {
      border-top-color: rgba(52, 211, 153, 0.3);
      background: #0f2a1e;
    }
    .movar-portrait-ba .block--after .block-label { color: #34d399; }
  }
`;

/**
 * Storybook renders this at `layout: 'fullscreen'`; the inline width/height
 * make the root exactly the device canvas the capture script screenshots.
 */
export function PortraitBeforeAfterFrameWithFrame(
  props: PortraitBeforeAfterFrameProps,
): JSX.Element {
  return (
    <div style={{ ...ROOT_STYLE, width: props.width, height: props.height }}>
      <PortraitBeforeAfterFrame {...props} />
    </div>
  );
}
