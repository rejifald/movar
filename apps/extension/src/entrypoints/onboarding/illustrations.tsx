import type { JSX } from 'react';
import { Check, Globe, Pin, Puzzle } from 'lucide-react';
import { BrandMark } from '@movar/ui';

/**
 * Flat, text-free illustrations of the browser UI each step points at. Text-free
 * on purpose: the step body carries the literal, locale-aware label (copy.md),
 * so the illustration only has to show the *shape* to look for — which keeps it
 * correct in every browser locale. Built from design tokens + lucide glyphs so
 * it flips with light/dark on its own.
 *
 * Mirrored, by design, in the marketing site's InstallIllustration.astro (the
 * marketing app has no @astrojs/react, so the two can't share a component) —
 * keep the two visually in step.
 */
export type IllustrationName = 'toolbar' | 'menu' | 'toggle' | 'dialog';

export function StepIllustration({ name }: Readonly<{ name: IllustrationName }>): JSX.Element {
  switch (name) {
    case 'toolbar': {
      return <Toolbar />;
    }
    case 'menu': {
      return <Menu />;
    }
    case 'toggle': {
      return <Toggle />;
    }
    case 'dialog': {
      return <Dialog />;
    }
  }
}

/** Pin step: a browser toolbar with the puzzle (extensions) menu and Movar
 *  pinned beside it in the accent highlight. */
function Toolbar(): JSX.Element {
  return (
    <div
      aria-hidden="true"
      className="border-border bg-surface-3 mt-3 flex items-center gap-2 rounded-lg border p-2.5"
    >
      <span className="bg-surface h-4 flex-1 rounded" />
      <Puzzle className="text-ink-faint h-4 w-4 shrink-0" />
      <span className="bg-accent-surface text-accent flex shrink-0 items-center gap-1 rounded px-1.5 py-1">
        <BrandMark size={12} />
        <Pin className="h-3 w-3" />
      </span>
    </div>
  );
}

/** Access step: a site-access dropdown with the all-sites option highlighted +
 *  checked. */
function Menu(): JSX.Element {
  return (
    <div
      aria-hidden="true"
      className="border-border bg-surface mt-3 overflow-hidden rounded-lg border"
    >
      <div className="flex items-center gap-2 px-3 py-2">
        <Globe className="text-ink-faint h-4 w-4 shrink-0" />
        <span className="bg-surface-3 h-2 w-20 rounded" />
      </div>
      <div className="bg-accent-surface flex items-center gap-2 px-3 py-2">
        <Check className="text-accent h-4 w-4 shrink-0" />
        <span className="bg-accent-soft h-2 w-24 rounded" />
      </div>
    </div>
  );
}

/** Enable step (Safari): a settings row with Movar switched on. */
function Toggle(): JSX.Element {
  return (
    <div
      aria-hidden="true"
      className="border-border bg-surface mt-3 flex items-center gap-2.5 rounded-lg border p-2.5"
    >
      <BrandMark size={16} />
      <span className="bg-surface-3 h-2 flex-1 rounded" />
      <span className="bg-accent inline-flex h-5 w-9 shrink-0 items-center justify-end rounded-full p-0.5">
        <span className="bg-accent-on h-4 w-4 rounded-full" />
      </span>
    </div>
  );
}

/** Confirm step: the install permission dialog, its accept button in the accent
 *  highlight. */
function Dialog(): JSX.Element {
  return (
    <div
      aria-hidden="true"
      className="border-border bg-surface mt-3 flex flex-col gap-2 rounded-lg border p-3"
    >
      <div className="flex items-center gap-2">
        <Globe className="text-ink-faint h-4 w-4 shrink-0" />
        <span className="bg-surface-3 h-2 w-28 rounded" />
      </div>
      <span className="bg-surface-3 h-2 w-full rounded" />
      <div className="mt-1 flex justify-end gap-2">
        <span className="border-border h-5 w-12 rounded border" />
        <span className="bg-accent h-5 w-14 rounded" />
      </div>
    </div>
  );
}
