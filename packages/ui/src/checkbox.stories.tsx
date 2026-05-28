import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';

import { Checkbox } from './checkbox';

const meta = {
  title: 'Primitives/Checkbox',
  component: Checkbox,
  tags: ['autodocs'],
  args: { label: 'Translate untranslated pages' },
} satisfies Meta<typeof Checkbox>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Default unchecked state. */
export const Default: Story = {
  args: { defaultChecked: false },
};

/** Pre-checked. */
export const Checked: Story = {
  args: { defaultChecked: true },
};

/** Indeterminate (tri-state). DOM property, not attribute — see component JSDoc. */
export const Indeterminate: Story = {
  args: { indeterminate: true },
};

/** Label + description — both are part of the accessible name/description. */
export const WithDescription: Story = {
  args: {
    label: 'Show on hover only',
    description: 'Keeps the page chrome quiet until you point at it.',
  },
};

/** Invalid — sets `aria-invalid` and swaps every accent surface to the danger family. */
export const Invalid: Story = {
  args: {
    label: 'I accept the terms',
    description: 'Required before continuing.',
    invalid: true,
  },
};

/** Disabled — dimmed, hover suppressed. */
export const Disabled: Story = {
  args: { disabled: true, label: 'Translate untranslated pages', defaultChecked: true },
};

/** Controlled — react to `onCheckedChange`. */
export const Controlled: Story = {
  render: (args) => {
    const [checked, setChecked] = useState(true);
    return <Checkbox {...args} checked={checked} onCheckedChange={setChecked} />;
  },
  args: { label: 'Controlled checkbox' },
};
