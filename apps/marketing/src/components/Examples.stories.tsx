import type { JSX } from 'react';
import type { Meta, StoryObj } from '@storybook/react';

import { strings, type Locale } from '../i18n';

/** React mock of `Examples.astro` — the central section the user called out. */
const chipBase =
  'inline-flex items-center rounded-full px-2.5 py-1 font-mono text-[11px] font-semibold uppercase tracking-wider';

function ExamplesMock({ lang = 'en' as Locale }): JSX.Element {
  const t = strings[lang].examples;
  // The real Examples.astro renders before/after screenshots above each
  // breakdown when the PNG pair is on disk. The Storybook canvas has no
  // built public/ dir, so this mock shows the text-only fallback in the
  // same open, card-less, stacked layout the .astro uses.
  return (
    <section id="examples" className="border-border bg-bg border-t px-6 py-20">
      <div className="mx-auto max-w-5xl">
        <h2 className="font-display text-ink-strong text-3xl font-extrabold tracking-tight sm:text-4xl">
          {t.sectionTitle}
        </h2>
        <p className="text-ink-soft mt-3 max-w-2xl">{t.sectionLead}</p>

        <div className="divide-border mt-12 divide-y">
          {t.entries.map((example) => (
            <article key={example.site} className="py-12 first:pt-0">
              <p className="font-display text-accent text-xs font-bold tracking-wider uppercase">
                {example.site}
              </p>
              <h3 className="text-ink-strong mt-2 max-w-2xl text-lg leading-snug font-medium sm:text-xl">
                {example.scenario}
              </h3>

              <div className="mt-6 grid items-start gap-x-8 gap-y-8 sm:grid-cols-2">
                <figure>
                  <span className={`${chipBase} border-border bg-surface text-ink-soft border`}>
                    {t.without}
                  </span>
                  <p className="text-ink-soft mt-3 text-sm leading-relaxed">{example.without}</p>
                </figure>
                <figure>
                  <span
                    className={`${chipBase} border-accent/30 bg-accent-surface text-accent-deep border`}
                  >
                    {t.withMovar}
                  </span>
                  <p className="text-ink-soft mt-3 text-sm leading-relaxed">{example.withMovar}</p>
                </figure>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

const meta = {
  title: 'Marketing/Examples',
  component: ExamplesMock,
  argTypes: {
    lang: { control: { type: 'inline-radio' }, options: ['en', 'uk'] satisfies Locale[] },
  },
} satisfies Meta<typeof ExamplesMock>;
export default meta;

type Story = StoryObj<typeof meta>;

export const English: Story = { args: { lang: 'en' } };
export const Ukrainian: Story = { args: { lang: 'uk' } };
