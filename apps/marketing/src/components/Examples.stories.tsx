import type { JSX } from 'react';
import type { Meta, StoryObj } from '@storybook/react';

import { strings, type Locale } from '../i18n';

/** React mock of `Examples.astro` — the central section the user called out. */
function ExamplesMock({ lang = 'en' as Locale }): JSX.Element {
  const t = strings[lang].examples;
  return (
    <section id="examples" className="border-border bg-bg border-t px-6 py-20">
      <div className="mx-auto max-w-5xl">
        <h2 className="font-display text-ink-strong text-3xl font-extrabold tracking-tight sm:text-4xl">
          {t.sectionTitle}
        </h2>
        <p className="text-ink-soft mt-3 max-w-2xl">{t.sectionLead}</p>

        <div className="mt-10 space-y-6">
          {t.entries.map((example) => (
            <article
              key={example.site}
              className="border-border bg-surface rounded-2xl border p-6 shadow-sm sm:p-8"
            >
              <h3 className="font-display text-ink-strong text-xl font-bold">{example.site}</h3>
              <p className="text-ink-soft mt-2 text-sm italic">{example.scenario}</p>

              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <div className="border-border bg-bg rounded-xl border p-4">
                  <div className="text-ink-faint font-mono text-xs tracking-[0.1em] uppercase">
                    {t.without}
                  </div>
                  <p className="text-ink mt-2 text-sm leading-relaxed">{example.without}</p>
                </div>
                {/*
                 * Eyebrow + body both ride on text-accent-deep so the pair
                 * adapts in dark mode — see Examples.astro for the original
                 * contrast note.
                 */}
                <div className="border-accent/30 bg-accent-surface rounded-xl border p-4">
                  <div className="text-accent-deep font-mono text-xs tracking-[0.1em] uppercase">
                    {t.withMovar}
                  </div>
                  <p className="text-accent-deep mt-2 text-sm leading-relaxed">
                    {example.withMovar}
                  </p>
                </div>
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
