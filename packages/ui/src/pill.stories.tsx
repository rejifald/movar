import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';

import { Pill } from './pill';

const meta = {
  title: 'Primitives/Pill',
  component: Pill,
  tags: ['autodocs'],
  args: { children: 'Active' },
} satisfies Meta<typeof Pill>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Default — `md` size, `neutral` tone, passive span. */
export const Default: Story = {};

/** `accent` tone — the "good news" surface. */
export const Accent: Story = {
  args: { tone: 'accent', children: 'UA' },
};

/** `muted` tone — the "off" state. Border + text bump on hover when interactive. */
export const Muted: Story = {
  args: { tone: 'muted', children: 'Off' },
};

/** `sm` size — micro-tag look, font-mono, uppercase, micro type. Pairs with `dot`. */
export const Small: Story = {
  args: { size: 'sm', tone: 'accent', dot: true, children: 'Active' },
};

/** Leading dot — paired with `sm` it becomes the popup status indicator. */
export const WithDot: Story = {
  render: () => (
    <div className="flex gap-2">
      <Pill size="sm" tone="accent" dot>
        Active
      </Pill>
      <Pill size="sm" tone="neutral" dot>
        Paused
      </Pill>
      <Pill size="sm" tone="muted" dot>
        Off
      </Pill>
    </div>
  ),
};

/** Interactive — `onClick` promotes the pill to a button with hover styling and focus ring. */
export const Interactive: Story = {
  args: { onClick: fn(), children: 'Click me' },
};

/** Toggle pattern — `aria-pressed` reflects the on/off state. */
export const Toggle: Story = {
  args: {
    size: 'sm',
    tone: 'accent',
    dot: true,
    onClick: fn(),
    'aria-pressed': true,
    'aria-label': 'Movar is active',
    children: 'Active',
  },
};

/** Disabled interactive pill — dim, hover suppressed. */
export const DisabledInteractive: Story = {
  args: { onClick: fn(), disabled: true },
};
