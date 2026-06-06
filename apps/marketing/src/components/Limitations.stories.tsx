import type { JSX } from 'react';
import type { Meta, StoryObj } from '@storybook/react';

import { SOURCE_URL } from '@movar/brand';

import { strings } from '../i18n';
import type { Locale } from '../i18n';

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
          {t.items.map((item, i) => (
            <li key={item} className="flex items-start gap-3">
              <span
                className="font-display text-accent mt-0.5 shrink-0 text-sm font-bold tabular-nums"
                aria-hidden="true"
              >
                {String(i + 1).padStart(2, '0')}
              </span>
              <p className="text-ink leading-relaxed">
                {item}
                {i === t.items.length - 1 && (
                  <>
                    {' '}
                    <a
                      href={SOURCE_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-accent hover:text-ink-strong font-medium underline underline-offset-4 transition"
                    >
                      {t.sourceLink}
                    </a>
                  </>
                )}
              </p>
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
