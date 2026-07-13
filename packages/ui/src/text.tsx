import type { ElementType, HTMLAttributes, JSX, ReactNode } from 'react';
import type { TypeRole } from '@movar/theme';

import { cn } from './internal/cn';

/**
 * Text — the one React entry point for typography. Each `variant` is a semantic
 * role from the styleguide (§2.1), rendered through the matching `type-*`
 * utility that `@movar/theme` generates (`type.css`). The role owns the *shape*
 * of the type — family, size, weight, tracking, leading, transform — so "what a
 * heading is" is defined once in the token source instead of being retyped (and
 * quietly drifting onto Tailwind's `tracking-tight` / `text-sm`) at every call
 * site.
 *
 * **Color is not a variant.** It stays semantic and per-instance: pass `tone`
 * for the common ink/accent/danger cases, or a `text-*` utility via `className`
 * for anything else. This mirrors where color already lived and legitimately
 * varies (a heading is `ink-strong` here, `accent` there).
 *
 * **Element is not a variant.** Defaults to `<span>`; pass `as` for the right
 * semantic tag (`as="h2"` for a heading, `as="p"` for a paragraph). Keeping the
 * tag explicit avoids a component that silently emits three `<h1>`s on a page.
 *
 *   <Text as="h3" variant="heading" tone="strong">Blocked sites</Text>
 *   <Text variant="eyebrow" tone="faint">Evidence</Text>
 *   <Text as="p" variant="body" tone="soft">{copy}</Text>
 *
 * The two size-less roles (`display`, `wordmark`) take their size per surface —
 * pair them with a size utility (`text-6xl` for the marketing hero, `text-base`
 * for the popup brand label).
 */

/** A typographic role — kept in lockstep with `@movar/theme`'s `typeRoles`. */
export type TextVariant = TypeRole;

/** The common semantic ink/brand colors, as a shorthand for the `text-*` util. */
export type TextTone = 'strong' | 'default' | 'soft' | 'faint' | 'accent' | 'danger';

// `Record<TypeRole, …>` makes this a COMPILE-TIME parity guard: add or remove a
// role in `@movar/theme` and `tsc` fails here until the map matches, so the
// component's variants can never drift from the emitted `type-*` utilities. The
// values are static literals (never `type-${variant}`) so Tailwind's scanner
// sees every class and emits it.
const VARIANT_CLASS: Record<TextVariant, string> = {
  eyebrow: 'type-eyebrow',
  display: 'type-display',
  heading: 'type-heading',
  title: 'type-title',
  label: 'type-label',
  body: 'type-body',
  caption: 'type-caption',
  mono: 'type-mono',
  wordmark: 'type-wordmark',
};

const TONE_CLASS: Record<TextTone, string> = {
  strong: 'text-ink-strong',
  default: 'text-ink',
  soft: 'text-ink-soft',
  faint: 'text-ink-faint',
  accent: 'text-accent',
  danger: 'text-danger',
};

export interface TextProps extends HTMLAttributes<HTMLElement> {
  /** The semantic type role. Defaults to `body`. */
  variant?: TextVariant;
  /** Semantic text color. Omit and set a `text-*` utility via `className`. */
  tone?: TextTone;
  /** The rendered element. Defaults to `span`; pass the right semantic tag. */
  as?: ElementType;
  className?: string;
  children?: ReactNode;
}

export function Text({
  variant = 'body',
  tone,
  as: Component = 'span',
  className,
  children,
  ...rest
}: Readonly<TextProps>): JSX.Element {
  return (
    <Component
      className={cn(VARIANT_CLASS[variant], tone ? TONE_CLASS[tone] : undefined, className)}
      {...rest}
    >
      {children}
    </Component>
  );
}
