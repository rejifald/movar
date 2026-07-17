import type { CSSProperties, JSX, ReactNode } from 'react';

/**
 * Movar brand mark — the rounded "r." rectangle with the accent dot.
 *
 * Two visual modes:
 *   - `solid` (default) — filled rectangle, cutout letter via `--brand-letter`
 *     (defaults to `#fff` if the host page hasn't defined the var), accent dot.
 *   - `outline` — stroked rectangle, currentColor letter, currentColor dot.
 *     Useful as a typographic glyph inside body copy.
 *
 * `currentColor` drives both the rectangle (solid mode) and the strokes
 * (outline mode), so the mark inherits the surrounding text color and flips
 * naturally with the rest of the design system.
 */
export interface BrandMarkProps {
  /** Rendered px. The mark is a logo, so its size is per-surface rather than a
   *  rung of the icon-glyph ladder (`iconSize` in `@movar/theme`); the PNG
   *  manifest sizes live in that package's `size.brandMark`. Optional only so a
   *  CSS-sized call site — the Safari host's `.ico` chips — can omit it and let
   *  the stylesheet size the SVG; the default matches the popup's brand bar, the
   *  one piece of chrome that renders the mark at UI scale. */
  size?: number;
  outline?: boolean;
  /** Override the cutout-letter color. Defaults to `var(--brand-letter, #fff)`. */
  letterColor?: string;
  className?: string;
  /** Accessible name. Omit to render aria-hidden (decorative). */
  title?: string;
}

export function BrandMark({
  size = 20,
  outline = false,
  letterColor,
  className,
  title,
}: Readonly<BrandMarkProps>): JSX.Element {
  if (outline) {
    return (
      <BrandMarkSvg size={size} title={title} className={className}>
        <rect
          x={9}
          y={9}
          width={110}
          height={110}
          rx={22}
          fill="none"
          stroke="currentColor"
          strokeWidth={6}
        />
        <BrandLetter fill="currentColor" />
        <circle cx={89.6} cy={90.4} r={9.6} fill="currentColor" />
      </BrandMarkSvg>
    );
  }

  return (
    <BrandMarkSvg size={size} title={title} className={className} letterColor={letterColor}>
      <rect x={6} y={6} width={116} height={116} rx={28} fill="currentColor" />
      <BrandLetter fill="var(--brand-letter, #fff)" />
      <circle cx={89.6} cy={90.4} r={9.6} fill="var(--accent)" />
    </BrandMarkSvg>
  );
}

interface BrandMarkSvgProps {
  size: number;
  title: string | undefined;
  className: string | undefined;
  /** Only meaningful for the solid variant; the outline variant uses
   *  currentColor for everything and ignores the CSS-var override. */
  letterColor?: string | undefined;
  children: ReactNode;
}

/** Shared SVG shell — owns the viewBox, sizing, aria/title slot, and the
 *  optional `--brand-letter` override. Each variant supplies its own shapes
 *  as children, which keeps the per-variant geometry colocated with the
 *  variant that needs it while the framing stays in one place. */
function BrandMarkSvg({
  size,
  title,
  className,
  letterColor,
  children,
}: Readonly<BrandMarkSvgProps>) {
  const { ariaHidden, role } = svgTitleA11y(title);
  const style =
    letterColor === undefined ? undefined : ({ ['--brand-letter']: letterColor } as CSSProperties);
  return (
    <svg
      viewBox="0 0 128 128"
      width={size}
      height={size}
      aria-hidden={ariaHidden}
      role={role}
      className={className}
      style={style}
    >
      {title === undefined ? null : <title>{title}</title>}
      {children}
    </svg>
  );
}

/** Pair of `aria-hidden` / `role` values derived from whether a title is
 *  present. Extracted so BrandMarkSvg only has one branch on `title` for the
 *  inline `<title>` element — the a11y pair travels together as a destructure. */
function svgTitleA11y(title: string | undefined): {
  ariaHidden: true | undefined;
  role: 'img' | undefined;
} {
  if (title === undefined) return { ariaHidden: true, role: undefined };
  return { ariaHidden: undefined, role: 'img' };
}

/** The "r" glyph. Identical geometry in both variants; only the fill changes. */
function BrandLetter({ fill }: Readonly<{ fill: string }>) {
  return (
    <text
      x={56}
      y={100}
      textAnchor="middle"
      className="font-display"
      fontWeight={800}
      fontSize={96}
      fill={fill}
      letterSpacing="-0.02em"
    >
      r
    </text>
  );
}
