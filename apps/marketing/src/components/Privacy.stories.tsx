import type { JSX } from 'react';
import type { Meta, StoryObj } from '@storybook/react';

import { strings, type Locale, localePrivacyHref } from '../i18n';

/** React mock of `Privacy.astro`. */
function PrivacyMock({ lang = 'en' as Locale }): JSX.Element {
  const t = strings[lang].privacy;
  return (
    <section id="privacy-callout" className="border-border bg-bg border-t px-6 py-20">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-start gap-4">
          <svg
            className="text-accent mt-1 size-6 shrink-0"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 2 4 6v6c0 5 3.5 8.5 8 10 4.5-1.5 8-5 8-10V6l-8-4Z" />
          </svg>
          <div>
            <h2 className="font-display text-ink-strong text-3xl font-extrabold tracking-tight sm:text-4xl">
              {t.sectionTitle}
            </h2>
            <p className="text-ink-soft mt-4 leading-relaxed">{t.sectionLead}</p>
            <p className="mt-6">
              <a
                href={localePrivacyHref(lang)}
                className="text-accent inline-flex items-center gap-1 text-sm font-semibold hover:underline"
              >
                {t.linkLabel}
                <span aria-hidden="true">→</span>
              </a>
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

const meta = {
  title: 'Marketing/Privacy',
  component: PrivacyMock,
  argTypes: {
    lang: { control: { type: 'inline-radio' }, options: ['en', 'uk'] satisfies Locale[] },
  },
} satisfies Meta<typeof PrivacyMock>;
export default meta;

type Story = StoryObj<typeof meta>;

export const English: Story = { args: { lang: 'en' } };
export const Ukrainian: Story = { args: { lang: 'uk' } };
