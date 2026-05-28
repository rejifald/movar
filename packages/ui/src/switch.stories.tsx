import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';

import { Switch } from './switch';

const meta = {
  title: 'Primitives/Switch',
  component: Switch,
  tags: ['autodocs'],
  args: { label: 'Enable Movar' },
} satisfies Meta<typeof Switch>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Default off. */
export const Off: Story = {
  args: { defaultChecked: false },
};

/** Default on — track recolors to `--accent`, thumb translates 16px. */
export const On: Story = {
  args: { defaultChecked: true },
};

/** Label + description. */
export const WithDescription: Story = {
  args: {
    label: 'Notifications',
    description: 'Send a system alert when a domain switches state.',
    defaultChecked: true,
  },
};

/** Invalid — track + focus ring switch to the danger family. */
export const Invalid: Story = {
  args: {
    label: 'Accept terms',
    description: 'Required before saving.',
    invalid: true,
  },
};

/** Disabled — dim, no toggle interaction. */
export const Disabled: Story = {
  args: { disabled: true, defaultChecked: true },
};

/** Controlled — props drive the state, `onCheckedChange` reports it. */
export const Controlled: Story = {
  render: (args) => {
    const [checked, setChecked] = useState(true);
    return <Switch {...args} checked={checked} onCheckedChange={setChecked} />;
  },
  args: { label: 'Controlled switch' },
};
