import type { JSX } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { ShieldCheck } from 'lucide-react';

import { strings, type Locale, localePrivacyHref } from '../i18n';

/** React mock of `Privacy.astro`. */
function PrivacyMock({ lang = 'en' as Locale }): JSX.Element {
  const t = strings[lang].privacy;
  return (
    <section id="privacy-callout" className="border-border bg-bg border-t px-6 py-20">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-start gap-4">
          <ShieldCheck className="text-accent mt-1 size-6 shrink-0" aria-hidden="true" />
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
