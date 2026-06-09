import type { Decorator, Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { fn } from 'storybook/test';

import { SegmentedControl } from './segmented-control';
import type { SegmentedControlProps, SegmentedOption } from './segmented-control';

/**
 * Neutral example content — a view switcher. These stories document the
 * primitive itself; the extension's conceal-mode selector (the control this was
 * built for) has its own showcase under `Components/ConcealModeField`.
 */
const VIEW_OPTIONS: readonly SegmentedOption[] = [
  { value: 'list', label: 'List', description: 'One item per row' },
  { value: 'grid', label: 'Grid', description: 'Compact tiles' },
  { value: 'cards', label: 'Cards', description: 'Large previews' },
];

/** A placeholder for the `preview` slot — any node works; consumers pass a real
 *  illustration of the option's effect. */
function MiniPreview() {
  return (
    <div className="border-border bg-surface flex min-h-[38px] flex-col gap-1 rounded-md border p-1.5">
      <div className="bg-ink-faint h-1.5 rounded-full" />
      <div className="bg-ink-faint h-1.5 rounded-full" />
      <div className="bg-ink-faint h-1.5 w-2/3 rounded-full" />
    </div>
  );
}

const PREVIEW_OPTIONS: readonly SegmentedOption[] = [
  { value: 'list', label: 'List', description: 'One item per row', preview: <MiniPreview /> },
  { value: 'grid', label: 'Grid', description: 'Compact tiles', preview: <MiniPreview /> },
];

/** Wrap each story in its own state so clicking / arrowing actually moves the
 *  selection (the control is controlled), and still forward `onChange` so the
 *  Actions panel logs each change. */
function Stateful(args: Readonly<SegmentedControlProps>) {
  const [value, setValue] = useState(args.value);
  return (
    <SegmentedControl
      {...args}
      value={value}
      onChange={(next) => {
        setValue(next);
        args.onChange(next);
      }}
    />
  );
}

const meta = {
  title: 'Primitives/SegmentedControl',
  component: SegmentedControl,
  tags: ['autodocs'],
  parameters: { layout: 'padded' },
  decorators: [((Story) => <div className="max-w-sm">{Story()}</div>) satisfies Decorator],
  args: {
    legend: 'View',
    options: VIEW_OPTIONS,
    value: 'grid',
    onChange: fn(),
  },
  render: (args) => <Stateful {...args} />,
} satisfies Meta<typeof SegmentedControl>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Default — one choice across labelled segments with descriptions. Native
 *  radios under the hood: arrow keys move the selection, Space selects. */
export const Default: Story = {};

/** Each option can carry a small `preview` node above the label — the affordance
 *  the extension's conceal-mode selector uses to illustrate each outcome. */
export const WithPreview: Story = {
  args: { legend: 'Layout', options: PREVIEW_OPTIONS, value: 'list' },
};

/** Whole group disabled — every segment dimmed and non-interactive. */
export const Disabled: Story = { args: { disabled: true } };

/** Invalid — selected border/fill and the focus ring swap to the danger family,
 *  and the group gets `aria-invalid`. */
export const Invalid: Story = { args: { invalid: true } };
