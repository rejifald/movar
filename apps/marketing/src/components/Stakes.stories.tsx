import type { JSX } from 'react';
import type { Meta, StoryObj } from '@storybook/react';

import { strings, type Locale } from '../i18n';
import { FactsSectionMock } from './_facts-section-mock';

/** React mock of `Stakes.astro`. Shell is shared with `Problem` via `FactsSectionMock`. */
function StakesMock({ lang = 'en' as Locale }): JSX.Element {
  return <FactsSectionMock sectionId="why-it-matters" t={strings[lang].stakes} />;
}

const meta = {
  title: 'Marketing/Stakes',
  component: StakesMock,
  argTypes: {
    lang: { control: { type: 'inline-radio' }, options: ['en', 'uk'] satisfies Locale[] },
  },
} satisfies Meta<typeof StakesMock>;
export default meta;

type Story = StoryObj<typeof meta>;

export const English: Story = { args: { lang: 'en' } };
export const Ukrainian: Story = { args: { lang: 'uk' } };
