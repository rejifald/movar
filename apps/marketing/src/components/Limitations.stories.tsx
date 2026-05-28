import type { JSX } from 'react';
import type { Meta, StoryObj } from '@storybook/react';

import { strings, type Locale } from '../i18n';

type LimitationsSlice = (typeof strings)[Locale]['limitations'];
type Row = LimitationsSlice['rows'][number];

/** Filled check icon — paired with the "does" column rows. */
function CheckIcon(): JSX.Element {
  return (
    <svg
      className="text-accent-deep mt-0.5 size-4 shrink-0"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12.5 3 3 5-6.5" />
    </svg>
  );
}

/** Stroked X icon — paired with the "doesn't" column rows. */
function CrossIcon(): JSX.Element {
  return (
    <svg
      className="text-ink-soft mt-0.5 size-4 shrink-0"
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

function DoesColumn({ heading, rows }: { heading: string; rows: readonly Row[] }): JSX.Element {
  return (
    <div className="border-accent/30 bg-accent-surface overflow-hidden rounded-2xl border shadow-sm">
      <div className="border-accent/20 border-b px-6 py-4">
        <h3 className="font-display text-accent-deep text-base font-bold">{heading}</h3>
      </div>
      <ul className="divide-accent/10 divide-y">
        {rows.map((row) => (
          <li key={row.does} className="flex items-start gap-3 px-6 py-4">
            <CheckIcon />
            <p className="text-accent-deep text-sm leading-relaxed">{row.does}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DoesNotColumn({ heading, rows }: { heading: string; rows: readonly Row[] }): JSX.Element {
  return (
    <div className="border-border bg-surface overflow-hidden rounded-2xl border shadow-sm">
      <div className="border-border border-b px-6 py-4">
        <h3 className="font-display text-ink text-base font-bold">{heading}</h3>
      </div>
      <ul className="divide-border divide-y">
        {rows.map((row) => (
          <li key={row.doesNot} className="flex items-start gap-3 px-6 py-4">
            <CrossIcon />
            <p className="text-ink-soft text-sm leading-relaxed">{row.doesNot}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** React mock of `Limitations.astro` — the two-column does / doesn't card. */
function LimitationsMock({ lang = 'en' as Locale }): JSX.Element {
  const t = strings[lang].limitations;
  return (
    <section id="limitations" className="border-border bg-bg border-t px-6 py-20">
      <div className="mx-auto max-w-5xl">
        <h2 className="font-display text-ink-strong text-3xl font-extrabold tracking-tight sm:text-4xl">
          {t.sectionTitle}
        </h2>
        <p className="text-ink-soft mt-3 max-w-2xl">{t.sectionLead}</p>

        <div className="mt-10 grid gap-6 sm:grid-cols-2">
          <DoesColumn heading={t.doesHeading} rows={t.rows} />
          <DoesNotColumn heading={t.doesNotHeading} rows={t.rows} />
        </div>
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
