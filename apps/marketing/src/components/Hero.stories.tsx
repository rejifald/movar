import type { JSX } from 'react';
import type { Meta, StoryObj } from '@storybook/react';

import { strings, type Locale } from '../i18n';

/**
 * React mock of `Hero.astro`. Keep markup + className strings in lockstep
 * when either side changes. The inlined download button mirrors the
 * disabled "Soon" SSR fallback from `DownloadButtons.astro`; full
 * browser-detection behaviour has its own story.
 */
function HeroMock({ lang = 'en' as Locale }): JSX.Element {
  const t = strings[lang].hero;
  const dl = strings[lang].download;
  return (
    <section className="relative px-6 pt-20 pb-16 sm:pt-28 sm:pb-24">
      <div className="mx-auto max-w-3xl text-center">
        <div className="border-border bg-surface text-ink-soft mb-6 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium shadow-sm">
          <span className="bg-accent size-1.5 rounded-full" />
          {t.badge}
        </div>

        <h1 className="font-display text-ink-strong text-5xl font-extrabold tracking-tight sm:text-6xl">
          {t.headlineLine1}
          <span className="text-accent block">{t.headlineLine2}</span>
        </h1>

        <p className="text-ink-soft mx-auto mt-6 max-w-2xl text-lg sm:text-xl">{t.subhead}</p>

        <div className="mt-10">
          <div id="download" className="flex justify-center">
            <a
              aria-disabled="true"
              className="group border-accent bg-accent text-accent-on inline-flex items-center justify-center gap-2 rounded-xl border px-6 py-3 text-sm font-semibold shadow-sm transition hover:shadow-md aria-disabled:cursor-not-allowed aria-disabled:opacity-60 aria-disabled:hover:shadow-sm"
            >
              <span>{dl.addGeneric}</span>
              <span className="text-accent-on rounded-md bg-black/25 px-1.5 py-0.5 text-[11px] font-medium tracking-wide uppercase">
                {dl.soon}
              </span>
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

const meta = {
  title: 'Marketing/Hero',
  component: HeroMock,
  argTypes: {
    lang: { control: { type: 'inline-radio' }, options: ['en', 'uk'] satisfies Locale[] },
  },
} satisfies Meta<typeof HeroMock>;
export default meta;

type Story = StoryObj<typeof meta>;

export const English: Story = { args: { lang: 'en' } };
export const Ukrainian: Story = { args: { lang: 'uk' } };
