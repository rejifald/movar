import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';

import { IconButton } from './icon-button';

const meta = {
  title: 'Primitives/IconButton',
  component: IconButton,
  tags: ['autodocs'],
  args: { label: 'Remove domain', children: '×', onClick: fn() },
} satisfies Meta<typeof IconButton>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Close glyph — the most common use. `label` feeds aria-label since `×` is presentational. */
export const Close: Story = {};

/** Up/down arrows for reorderable lists. */
export const Reorder: Story = {
  render: () => (
    <div className="flex gap-1">
      <IconButton label="Move up" onClick={fn()}>
        ↑
      </IconButton>
      <IconButton label="Move down" onClick={fn()}>
        ↓
      </IconButton>
    </div>
  ),
};

/** Disabled — dim, hover surface suppressed. */
export const Disabled: Story = {
  args: { disabled: true },
};
