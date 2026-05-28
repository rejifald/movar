import type { JSX } from 'react';
import type { Meta, StoryObj } from '@storybook/react';

import { strings, type Locale } from '../i18n';

/**
 * React mock of `DownloadButtons.astro`. The Astro version ships an SSR
 * "Add Movar to your browser · Soon" fallback and an inline script that
 * detects the visitor's browser and swaps the label + href to whichever
 * store matches. The mock here doesn't run the script — instead it accepts
 * `browser` + `live` controls so each ship-time state has its own story.
 *
 * In v1 every store has `liveAt: null`, so the Soon badge is the only path
 * users will see. The Live stories are forward-looking previews of the
 * post-launch UI for each browser.
 */
type Browser = 'chrome' | 'edge' | 'firefox' | 'unknown';
type KnownBrowser = Exclude<Browser, 'unknown'>;

interface MockProps {
  lang?: Locale;
  browser?: Browser;
  /** Whether the matched store has `liveAt` set. Mocks the "Soon" → "Live" flip. */
  live?: boolean;
}

/** Pick the per-browser label, falling back to the generic when unknown. */
function resolveAddLabel(t: (typeof strings)[Locale]['download'], browser: Browser): string {
  if (browser !== 'unknown' && browser in t.add) {
    return t.add[browser as KnownBrowser];
  }
  return t.addGeneric;
}

function DownloadButtonsMock({
  lang = 'en' as Locale,
  browser = 'unknown',
  live = false,
}: MockProps): JSX.Element {
  const t = strings[lang].download;
  const label = resolveAddLabel(t, browser);

  return (
    <div className="grid place-items-center px-6 py-20">
      <div id="download" className="flex justify-center">
        <a
          href={live ? '#' : undefined}
          aria-disabled={live ? undefined : 'true'}
          className="group border-accent bg-accent text-accent-on inline-flex items-center justify-center gap-2 rounded-xl border px-6 py-3 text-sm font-semibold shadow-sm transition hover:shadow-md aria-disabled:cursor-not-allowed aria-disabled:opacity-60 aria-disabled:hover:shadow-sm"
        >
          <span>{label}</span>
          {!live && (
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
      options: ['unknown', 'chrome', 'edge', 'firefox'] satisfies Browser[],
    },
    live: { control: 'boolean' },
  },
} satisfies Meta<typeof DownloadButtonsMock>;
export default meta;

type Story = StoryObj<typeof meta>;

export const SoonGeneric: Story = {
  name: 'Soon · unknown browser (SSR fallback)',
  args: { lang: 'en', browser: 'unknown', live: false },
};
export const SoonChrome: Story = {
  name: 'Soon · Chrome',
  args: { lang: 'en', browser: 'chrome', live: false },
};
export const LiveChrome: Story = {
  name: 'Live · Chrome',
  args: { lang: 'en', browser: 'chrome', live: true },
};
export const LiveFirefox: Story = {
  name: 'Live · Firefox',
  args: { lang: 'en', browser: 'firefox', live: true },
};
export const SoonUkrainian: Story = {
  name: 'Soon · Ukrainian',
  args: { lang: 'uk', browser: 'unknown', live: false },
};
