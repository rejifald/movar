import type { JSX } from 'react';
import type { Meta, StoryObj } from '@storybook/react';

import { strings, type Locale } from '../i18n';

/**
 * React mock of `DownloadButtons.astro`. The Astro version ships an SSR
 * "Add Movar to your browser" fallback (with the GitHub releases href so
 * the button is always actionable) and an inline script that detects the
 * visitor's browser and swaps the label + href to whichever store matches.
 * The mock here doesn't run the script — instead it accepts `browser` +
 * `live` controls so each post-detection state has its own story.
 *
 * As of 2026-06-01 only Firefox is live; Chrome, Edge, Opera, Brave and
 * Safari render disabled with the Soon badge until their listings publish.
 * Visitors on a browser we don't recognise see the GitHub releases CTA,
 * enabled. The `live` toggle is ignored when `browser` is `unknown` —
 * GitHub is always available, so unknown is never Soon.
 */
type Browser = 'chrome' | 'edge' | 'firefox' | 'opera' | 'brave' | 'safari' | 'unknown';
type KnownBrowser = Exclude<Browser, 'unknown'>;

interface MockProps {
  lang?: Locale;
  browser?: Browser;
  /** Whether the matched store has `liveAt` set. Mocks the "Soon" → "Live" flip. */
  live?: boolean;
}

/** Pick the per-browser label, with a GitHub fallback for unknown browsers. */
function resolveLabel(t: (typeof strings)[Locale]['download'], browser: Browser): string {
  if (browser === 'unknown') return t.viaGithub;
  if (browser in t.add) return t.add[browser as KnownBrowser];
  return t.addGeneric;
}

/**
 * Pick the anchor attributes for the enabled/disabled state. Collapses two
 * ternaries (href + aria-disabled) into one, which keeps the mock simple.
 */
function anchorAttrs(enabled: boolean): { href?: string; 'aria-disabled'?: 'true' } {
  return enabled ? { href: '#' } : { 'aria-disabled': 'true' };
}

function DownloadButtonsMock({
  lang = 'en' as Locale,
  browser = 'unknown',
  live = false,
}: MockProps): JSX.Element {
  const t = strings[lang].download;
  const label = resolveLabel(t, browser);
  // Unknown browsers route to the GitHub releases page — always enabled,
  // never Soon. Known browsers respect the `live` toggle.
  const enabled = browser === 'unknown' || live;

  return (
    <div className="grid place-items-center px-6 py-20">
      <div id="download" className="flex justify-center">
        <a
          {...anchorAttrs(enabled)}
          className="group border-accent bg-accent text-accent-on inline-flex items-center justify-center gap-2 rounded-xl border px-6 py-3 text-sm font-semibold shadow-sm transition hover:shadow-md aria-disabled:cursor-not-allowed aria-disabled:opacity-60 aria-disabled:hover:shadow-sm"
        >
          <span>{label}</span>
          {!enabled && (
            <span className="text-accent-on rounded-md bg-black/25 px-1.5 py-0.5 text-[11px] font-medium tracking-wide uppercase">
              {t.soon}
            </span>
          )}
        </a>
      </div>
    </div>
  );
}

const meta = {
  title: 'Marketing/DownloadButtons',
  component: DownloadButtonsMock,
  argTypes: {
    lang: { control: { type: 'inline-radio' }, options: ['en', 'uk'] satisfies Locale[] },
    browser: {
      control: { type: 'inline-radio' },
      options: [
        'unknown',
        'chrome',
        'edge',
        'firefox',
        'opera',
        'brave',
        'safari',
      ] satisfies Browser[],
    },
    live: { control: 'boolean' },
  },
} satisfies Meta<typeof DownloadButtonsMock>;
export default meta;

type Story = StoryObj<typeof meta>;

export const FallbackUnknown: Story = {
  name: 'GitHub fallback · unknown browser',
  args: { lang: 'en', browser: 'unknown', live: false },
};
export const SoonChrome: Story = {
  name: 'Soon · Chrome',
  args: { lang: 'en', browser: 'chrome', live: false },
};
export const SoonOpera: Story = {
  name: 'Soon · Opera',
  args: { lang: 'en', browser: 'opera', live: false },
};
export const SoonBrave: Story = {
  name: 'Soon · Brave',
  args: { lang: 'en', browser: 'brave', live: false },
};
export const SoonSafari: Story = {
  name: 'Soon · Safari',
  args: { lang: 'en', browser: 'safari', live: false },
};
export const LiveChrome: Story = {
  name: 'Live · Chrome',
  args: { lang: 'en', browser: 'chrome', live: true },
};
export const LiveFirefox: Story = {
  name: 'Live · Firefox',
  args: { lang: 'en', browser: 'firefox', live: true },
};
export const FallbackUkrainian: Story = {
  name: 'GitHub fallback · Ukrainian',
  args: { lang: 'uk', browser: 'unknown', live: false },
};
