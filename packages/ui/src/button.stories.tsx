import type { Meta, StoryObj } from '@storybook/react';

import { Button } from './button';

const meta = {
  title: 'Primitives/Button',
  component: Button,
  tags: ['autodocs'],
  args: { children: 'Add domain' },
} satisfies Meta<typeof Button>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Solid `ink-strong` bg, `bg` text — the dominant action in a row. */
export const Primary: Story = {};

/** Bordered, `surface-2` bg — pairs with a primary or stands alone for low-commitment actions. */
export const Secondary: Story = {
  args: { variant: 'secondary', children: 'Pause for 1 hour' },
};

/** `sm` shaves padding and drops to `text-ui-sm` (12px) — popup-dense scale. */
export const Small: Story = {
  args: { size: 'sm', children: 'Show all hidden' },
};

/** Stretches to fill the container. Used by the popup's Resume button and the options page's row CTAs. */
export const FullWidth: Story = {
  args: { fullWidth: true, children: 'Resume Movar' },
  parameters: { layout: 'padded' },
  decorators: [(Story) => <div className="w-80">{Story()}</div>],
};

/** Disabled state — dimmed, hover suppressed. Both variants share the same affordance. */
export const Disabled: Story = {
  args: { disabled: true, children: 'Loading…' },
};

/** Side-by-side primary + secondary — the canonical "do this, or that" row. */
export const Pair: Story = {
  render: () => (
    <div className="flex gap-2">
      <Button>Add domain</Button>
      <Button variant="secondary">Cancel</Button>
    </div>
  ),
};
