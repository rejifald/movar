import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { fn } from 'storybook/test';

import { Select } from './select';
import type { SelectOption } from './select';

const LANGUAGES: readonly SelectOption[] = [
  { value: 'uk', label: 'Українська' },
  { value: 'en', label: 'English' },
  { value: 'pl', label: 'Polski' },
  { value: 'de', label: 'Deutsch' },
];

const meta = {
  title: 'Primitives/Select',
  component: Select,
  tags: ['autodocs'],
  args: {
    value: 'uk',
    onChange: fn(),
    options: LANGUAGES,
    'aria-label': 'Preferred language',
  },
} satisfies Meta<typeof Select>;

export default meta;

type Story = StoryObj<typeof meta>;

/**
 * The render functions below thread a real `useState` through the component
 * so the dropdown actually updates in the canvas. Args are still
 * Storybook-controlled (placeholder, disabled, invalid) and feed through.
 */

/** `form` variant — the standard bordered control with the custom SVG chevron. */
export const Form: Story = {
  render: (args) => {
    const [value, setValue] = useState(args.value);
    return <Select {...args} value={value} onChange={setValue} />;
  },
  args: { variant: 'form' },
};

/** `inline` variant — borderless, transparent, behaves like inline text. Used in footers. */
export const Inline: Story = {
  render: (args) => {
    const [value, setValue] = useState(args.value);
    return <Select {...args} value={value} onChange={setValue} />;
  },
  args: { variant: 'inline' },
};

/** Placeholder — empty initial value with a "Pick one…" first option. */
export const WithPlaceholder: Story = {
  render: (args) => {
    const [value, setValue] = useState(args.value);
    return <Select {...args} value={value} onChange={setValue} />;
  },
  args: { variant: 'form', value: '', placeholder: 'Pick a language…' },
};

/** Invalid — `aria-invalid` plus the danger-family border + focus ring. */
export const Invalid: Story = {
  render: (args) => {
    const [value, setValue] = useState(args.value);
    return <Select {...args} value={value} onChange={setValue} />;
  },
  args: { variant: 'form', value: '', placeholder: 'Pick a language…', invalid: true },
};

/** Disabled — dim, hover suppressed. */
export const Disabled: Story = {
  args: { variant: 'form', disabled: true },
};
