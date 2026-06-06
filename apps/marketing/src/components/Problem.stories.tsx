import type { JSX } from 'react';
import type { Meta, StoryObj } from '@storybook/react';

import { strings } from '../i18n';
import type { Locale } from '../i18n';
import { FactsSectionMock } from './_facts-section-mock';

/** React mock of `Problem.astro`. Shell is shared with `Stakes` via `FactsSectionMock`. */
function ProblemMock({ lang = 'en' as Locale }): JSX.Element {
  return <FactsSectionMock sectionId="why" t={strings[lang].problem} />;
}

const meta = {
  title: 'Marketing/Problem',
  component: ProblemMock,
  argTypes: {
    lang: { control: { type: 'inline-radio' }, options: ['en', 'uk'] satisfies Locale[] },
  },
} satisfies Meta<typeof ProblemMock>;
export default meta;

type Story = StoryObj<typeof meta>;

export const English: Story = { args: { lang: 'en' } };
export const Ukrainian: Story = { args: { lang: 'uk' } };
