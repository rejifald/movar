import type { JSX } from 'react';
import type { Meta, StoryObj } from '@storybook/react';

import { strings, type Locale } from '../i18n';

/** Stroked "no" icon — paired with each limitation. */
function NoIcon(): JSX.Element {
  return (
    <svg
      className="text-ink-faint mt-1 size-5 shrink-0"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <line x1="5.6" y1="5.6" x2="18.4" y2="18.4" />
    </svg>
  );
}

/** React mock of `Limitations.astro` — the single "what it can't do" list. */
function LimitationsMock({ lang = 'en' as Locale }): JSX.Element {
  const t = strings[lang].limitations;
  return (
    <section id="limitations" className="border-border bg-bg border-t px-6 py-20">
      <div className="mx-auto max-w-3xl">
        <h2 className="font-display text-ink-strong text-3xl font-extrabold tracking-tight sm:text-4xl">
          {t.sectionTitle}
        </h2>
        <p className="text-ink-soft mt-3 max-w-2xl">{t.sectionLead}</p>

        <ul className="mt-10 space-y-5">
          {t.items.map((item) => (
            <li key={item} className="flex items-start gap-3">
              <NoIcon />
              <p className="text-ink-soft leading-relaxed">{item}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

const meta = {
  title: 'Marketing/Limitations',
  component: LimitationsMock,
  argTypes: {
    lang: { control: { type: 'inline-radio' }, options: ['en', 'uk'] satisfies Locale[] },
  },
} satisfies Meta<typeof LimitationsMock>;
export default meta;

type Story = StoryObj<typeof meta>;

export const English: Story = { args: { lang: 'en' } };
export const Ukrainian: Story = { args: { lang: 'uk' } };
