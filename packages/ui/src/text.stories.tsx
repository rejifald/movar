import type { Meta, StoryObj } from '@storybook/react';

import { Text } from './text';

/**
 * Text is the single React entry point for typography. Each `variant` is a
 * styleguide role (§2.1) rendered through the matching `type-*` utility from
 * `@movar/theme`; `tone` sets the semantic color. The gallery below is the whole
 * scale in one place — the reference for "which variant is this?".
 */
const meta = {
  title: 'Primitives/Text',
  component: Text,
  tags: ['autodocs'],
  args: { variant: 'body', tone: 'default', children: 'The quick brown fox — Тримай інтернет' },
} satisfies Meta<typeof Text>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Body: Story = {};

/** Mono uppercase kicker over a heading. */
export const Eyebrow: Story = { args: { variant: 'eyebrow', tone: 'faint', children: 'Evidence' } };

/** Product section heading — 22px display 700 at brand tracking. */
export const Heading: Story = {
  args: { as: 'h2', variant: 'heading', tone: 'strong', children: 'Blocked sites' },
};

/** Card / feature title — 15px display 700. */
export const Title: Story = {
  args: { as: 'h3', variant: 'title', tone: 'strong', children: 'Correction applied' },
};

/** UI label — 14px sans 500. */
export const Label: Story = { args: { variant: 'label', tone: 'strong', children: 'Ukrainian' } };

/** Caption / meta — 11.5px. */
export const Caption: Story = {
  args: { variant: 'caption', tone: 'soft', children: 'Nothing leaves your browser.' },
};

/** Mono data — locale codes, tokens. */
export const Mono: Story = { args: { variant: 'mono', tone: 'faint', children: 'uk-UA' } };

/**
 * The size-less roles (`display`, `wordmark`) take their size per surface — pair
 * them with a size utility. Here `display` is shown at `text-5xl` (marketing
 * hero) and `wordmark` at `text-base` (the popup brand label).
 */
export const SizePerSurface: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      <Text variant="display" tone="strong" className="text-5xl">
        Keep the internet in your language.
      </Text>
      <Text variant="wordmark" tone="strong" className="text-base">
        Movar
      </Text>
    </div>
  ),
};

/** The full role gallery — every variant, top to bottom. */
export const AllVariants: Story = {
  render: () => (
    <div className="flex max-w-md flex-col gap-3">
      <Text variant="eyebrow" tone="faint">
        Eyebrow
      </Text>
      <Text variant="display" tone="strong" className="text-3xl">
        Display
      </Text>
      <Text as="h2" variant="heading" tone="strong">
        Heading
      </Text>
      <Text as="h3" variant="title" tone="strong">
        Title
      </Text>
      <Text variant="label" tone="strong">
        Label
      </Text>
      <Text as="p" variant="body" tone="soft">
        Body — the default. Long-form and detail copy render through this role.
      </Text>
      <Text variant="caption" tone="soft">
        Caption
      </Text>
      <Text variant="mono" tone="faint">
        mono-uk-UA
      </Text>
    </div>
  ),
};
