import type { JSX } from 'react';
import type { Meta, StoryObj } from '@storybook/react';

import { DISCORD_URL, FEEDBACK_URL } from '@movar/brand';

import { discordIconPath } from '../lib/social-links';
import { strings } from '../i18n';
import type { Locale } from '../i18n';

/** React mock of `Close.astro` — the closing CTA: Discord, then the mailto. */
function CloseMock({ lang = 'en' as Locale }): JSX.Element {
  const t = strings[lang].close;
  return (
    <section
      id="close"
      className="border-border bg-surface relative overflow-hidden border-t px-6 py-20"
    >
      <div className="close-backdrop" aria-hidden="true">
        <span className="close-backdrop__aurora" />
        <span className="close-backdrop__glow" />
        <span className="close-backdrop__grid" />
      </div>

      <div className="relative z-10 mx-auto max-w-5xl">
        <h2 className="font-display text-ink-strong text-3xl font-extrabold tracking-tight sm:text-4xl">
          {t.sectionTitle}
        </h2>
        <p className="text-ink-soft mt-3 max-w-2xl">{t.sectionLead}</p>
        <div className="mt-8 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
          <a
            href={DISCORD_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="border-accent bg-accent text-accent-on inline-flex items-center justify-center gap-2 rounded-xl border px-6 py-4 text-base font-semibold shadow-sm transition hover:shadow-md"
          >
            <svg
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
              className="size-5 shrink-0"
            >
              <path d={discordIconPath} />
            </svg>
            {t.discordLabel}
          </a>
          <a
            href={FEEDBACK_URL}
            className="border-accent bg-surface text-accent hover:bg-accent-surface inline-flex items-center justify-center gap-2 rounded-xl border px-6 py-4 text-base font-semibold shadow-sm transition hover:shadow-md"
          >
            {t.emailLabel}
          </a>
        </div>
      </div>
    </section>
  );
}

const meta = {
  title: 'Marketing/Close',
  component: CloseMock,
  argTypes: {
    lang: { control: { type: 'inline-radio' }, options: ['en', 'uk'] satisfies Locale[] },
  },
} satisfies Meta<typeof CloseMock>;
export default meta;

type Story = StoryObj<typeof meta>;

export const English: Story = { args: { lang: 'en' } };
export const Ukrainian: Story = { args: { lang: 'uk' } };
