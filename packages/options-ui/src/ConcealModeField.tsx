import type { JSX, ReactNode } from 'react';
import { EyeOff } from 'lucide-react';
import { SegmentedControl } from '@movar/ui';
import type { SegmentedOption } from '@movar/ui';
import type { ConcealMode } from '@movar/settings';
import { useI18n } from '@movar/i18n';

interface ConcealModeFieldProps {
  value: ConcealMode;
  onChange: (next: ConcealMode) => void;
}

/** One abstracted "content card" row in the mini previews — a thumbnail block
 *  plus two text bars. Pure decorative scaffolding for the curtain/hide
 *  illustrations below; `blurred` veils it the way the real curtain does. */
function PreviewRow({ blurred = false }: Readonly<{ blurred?: boolean }>) {
  return (
    <div
      className={
        blurred ? 'flex items-center gap-1 opacity-80 blur-[2px]' : 'flex items-center gap-1'
      }
    >
      <div className="bg-ink-faint size-3 shrink-0 rounded-sm" />
      <div className="flex-1 space-y-1">
        <div className="bg-ink-faint h-1 w-full rounded-full" />
        <div className="bg-border-strong h-1 w-2/3 rounded-full" />
      </div>
    </div>
  );
}

/** Shared little "feed" frame. The min-height is what keeps the two previews the
 *  same height (so their labels align): the curtain fills it with three rows,
 *  while hide collapses to two and leaves the reclaimed space at the bottom.
 *
 *  **`min-h-16` is DERIVED — it only works while it stays >= the CURTAIN's
 *  natural height**, since that's the taller of the two; the floor then binds
 *  both and they match. Curtain (border-box) = 3 rows (12) + 2 `gap-1` (4) +
 *  2 `p-2` (8) + 2 border = 62, so the 64 floor covers it with 2 to spare.
 *  Change a row, the gap or the padding and this number must be recomputed —
 *  raise the padding without it and the curtain outgrows the floor, leaving the
 *  two previews (and their labels) misaligned.
 *
 *  Both numbers are rungs of the `space` ladder, and they have to be solved as a
 *  pair: the floor's only free choices are the rungs above the natural height,
 *  so the padding is what tunes the natural height up to meet one snugly. The
 *  previous 56 floor was a tight fit over a 54 natural, but 56 is not a rung;
 *  going straight to 64 would have left the curtain 10px of slack and read as a
 *  half-empty feed, so the padding moved up a rung with it. */
function PreviewFrame({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="border-border bg-surface flex min-h-16 flex-col gap-1 rounded-md border p-2">
      {children}
    </div>
  );
}

/** Curtain — the blocked row stays in place, blurred behind a small marker. */
function CurtainPreview() {
  return (
    <PreviewFrame>
      <PreviewRow />
      <div className="relative">
        <PreviewRow blurred />
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="border-border bg-surface text-ink-soft inline-flex items-center rounded-full border px-1 py-1 shadow-sm">
            <EyeOff size={9} />
          </span>
        </span>
      </div>
      <PreviewRow />
    </PreviewFrame>
  );
}

/** Hide — the blocked row is gone and the rest reflow up to reclaim its space,
 *  exactly as the page relayouts. No gap is left where it was; the freed space
 *  falls to the bottom of the (same-height) frame. */
function HidePreview() {
  return (
    <PreviewFrame>
      <PreviewRow />
      <PreviewRow />
    </PreviewFrame>
  );
}

/** Cross-entrypoint curtain-vs-hide selector, shown under the filtering toggle
 *  on both the popup and the options page. Composes the shared
 *  {@link SegmentedControl} with the `concealMode` i18n strings, a peek/hide
 *  icon pair, and a small inline preview of each outcome (a blurred row vs. a
 *  removed one) so the choice is legible at a glance. Render it only while
 *  content filtering is on — the mode is meaningless otherwise. */
export function ConcealModeField({
  value,
  onChange,
}: Readonly<ConcealModeFieldProps>): JSX.Element {
  const { t } = useI18n();
  const options: readonly SegmentedOption<ConcealMode>[] = [
    {
      value: 'curtain',
      label: t.concealMode.curtain.label,
      description: t.concealMode.curtain.description,
      preview: <CurtainPreview />,
    },
    {
      value: 'hide',
      label: t.concealMode.hide.label,
      description: t.concealMode.hide.description,
      preview: <HidePreview />,
    },
  ];

  return (
    <SegmentedControl<ConcealMode>
      legend={t.concealMode.legend}
      options={options}
      value={value}
      onChange={onChange}
    />
  );
}
