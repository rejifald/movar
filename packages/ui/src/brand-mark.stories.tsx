import type { Meta, StoryObj } from '@storybook/react';

import { BrandMark } from './brand-mark';

const meta = {
  title: 'Primitives/BrandMark',
  component: BrandMark,
  tags: ['autodocs'],
  argTypes: {
    size: { control: { type: 'number', min: 12, max: 128, step: 1 } },
    letterColor: { control: 'color' },
  },
} satisfies Meta<typeof BrandMark>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Solid rectangle, cutout `r`, accent dot. The default for headers and og. */
export const Solid: Story = {
  args: { size: 48, title: 'Movar' },
};

/** Stroked rectangle, currentColor letter. Use inline with body copy. */
export const Outline: Story = {
  args: { size: 48, outline: true, title: 'Movar (outline)' },
};

/** Decorative (no title) — renders `aria-hidden`. */
export const Decorative: Story = {
  args: { size: 64 },
};

/** Custom letter color override — overrides the `--brand-letter` token. */
export const CustomLetterColor: Story = {
  args: { size: 64, letterColor: '#fde68a' },
};

/** Inline glyph inside a paragraph — picks up surrounding `currentColor`. */
export const InlineInCopy: Story = {
  render: (args) => (
    <p className="text-ink text-ui-base max-w-md">
      Keep the internet in your language — <BrandMark {...args} /> sets things straight.
    </p>
  ),
  args: { size: 16, outline: true },
};
