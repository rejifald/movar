import type { CSSProperties } from 'react';

interface BrandMarkProps {
  size?: number;
  outline?: boolean;
  letterColor?: string;
  className?: string;
  title?: string;
}

export function BrandMark({
  size = 22,
  outline = false,
  letterColor,
  className,
  title,
}: BrandMarkProps) {
  const ariaHidden = title ? undefined : true;
  const role = title ? 'img' : undefined;
  const style = letterColor ? ({ ['--brand-letter']: letterColor } as CSSProperties) : undefined;

  if (outline) {
    return (
      <svg
        viewBox="0 0 128 128"
        width={size}
        height={size}
        aria-hidden={ariaHidden}
        role={role}
        className={className}
      >
        {title ? <title>{title}</title> : null}
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
        <text
          x={56}
          y={100}
          textAnchor="middle"
          fontFamily="Manrope, sans-serif"
          fontWeight={800}
          fontSize={96}
          fill="currentColor"
          letterSpacing="-0.02em"
        >
          r
        </text>
        <circle cx={89.6} cy={90.4} r={9.6} fill="currentColor" />
      </svg>
    );
  }

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
      {title ? <title>{title}</title> : null}
      <rect x={6} y={6} width={116} height={116} rx={28} fill="currentColor" />
      <text
        x={56}
        y={100}
        textAnchor="middle"
        fontFamily="Manrope, sans-serif"
        fontWeight={800}
        fontSize={96}
        fill="var(--brand-letter, #fff)"
        letterSpacing="-0.02em"
      >
        r
      </text>
      <circle cx={89.6} cy={90.4} r={9.6} fill="var(--accent)" />
    </svg>
  );
}
