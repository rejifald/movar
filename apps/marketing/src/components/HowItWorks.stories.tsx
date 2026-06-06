import type { JSX } from 'react';
import type { Meta, StoryObj } from '@storybook/react';

import { strings } from '../i18n';
import type { Locale } from '../i18n';

/** React mock of `HowItWorks.astro`. */
function HowItWorksMock({ lang = 'en' as Locale }): JSX.Element {
  const t = strings[lang].howItWorks;
  return (
    <section id="how-it-works" className="border-border bg-surface border-t px-6 py-20">
      <div className="mx-auto max-w-5xl">
        <h2 className="font-display text-ink-strong text-3xl font-extrabold tracking-tight sm:text-4xl">
          {t.sectionTitle}
        </h2>
        <p className="text-ink-soft mt-3 max-w-2xl">{t.sectionLead}</p>

        <div className="mt-10 grid gap-8 sm:grid-cols-2">
          {t.steps.map((step) => (
            <div key={step.title} className="flex flex-col gap-3">
              <h3 className="font-display text-ink-strong text-xl font-bold">{step.title}</h3>
              <p className="text-ink-soft text-sm leading-relaxed">{step.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const meta = {
  title: 'Marketing/HowItWorks',
  component: HowItWorksMock,
  argTypes: {
    lang: { control: { type: 'inline-radio' }, options: ['en', 'uk'] satisfies Locale[] },
  },
} satisfies Meta<typeof HowItWorksMock>;
export default meta;

type Story = StoryObj<typeof meta>;

export const English: Story = { args: { lang: 'en' } };
export const Ukrainian: Story = { args: { lang: 'uk' } };
