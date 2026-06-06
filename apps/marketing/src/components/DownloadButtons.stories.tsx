import type { JSX } from 'react';
import type { Meta, StoryObj } from '@storybook/react';

import { strings } from '../i18n';
import type { Locale } from '../i18n';

/**
 * React mock of `DownloadButtons.astro`. The Astro version SSR-renders the
 * neutral "Add Movar to your browser" label (with the GitHub releases href),
 * then an inline script detects the browser and swaps in the per-browser
 * label + target. The button is ALWAYS enabled; when the matched store isn't
 * live yet it becomes inert (no-op click) and shows a "Soon" chip.
 *
 * This mock skips the script and takes `browser` + `live` controls so each
 * post-detection state has its own story. `live` is ignored for `unknown`
 * (GitHub is always available, so unknown is never Soon).
 */
type Browser = 'chrome' | 'edge' | 'firefox' | 'opera' | 'brave' | 'safari' | 'unknown';

interface MockProps {
  lang?: Locale;
  browser?: Browser;
  /** Whether the matched store has `liveAt` set. Mocks the "Soon" → live flip. */
  live?: boolean;
}

/** Per-browser label, with the GitHub fallback label for unknown browsers. */
function resolveLabel(t: (typeof strings)[Locale]['download'], browser: Browser): string {
  if (browser === 'unknown') return t.viaGithub;
  if (browser in t.add) return t.add[browser];
  return t.addGeneric;
}

function DownloadButtonsMock({
  lang = 'en',
  browser = 'unknown',
  live = false,
}: MockProps): JSX.Element {
  const t = strings[lang].download;
  // A recognised browser whose store isn't live yet → inert + "Soon" chip.
  // Unknown browsers route to GitHub releases, so they're never Soon.
  const soon = browser !== 'unknown' && !live;

  return (
    <div className="grid place-items-center px-6 py-20">
      <div id="download" className="flex justify-center">
        <a
          {...(soon ? {} : { href: '#' })}
          className="group border-accent bg-accent text-accent-on inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border px-6 py-3 text-sm font-semibold shadow-sm transition hover:shadow-md"
        >
          <span>{resolveLabel(t, browser)}</span>
          {soon && (
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
export const SoonSafari: Story = {
  name: 'Soon · Safari',
  args: { lang: 'en', browser: 'safari', live: false },
};
export const LiveFirefox: Story = {
  name: 'Live · Firefox',
  args: { lang: 'en', browser: 'firefox', live: true },
};
export const SoonUkrainian: Story = {
  name: 'Soon · Chrome · Ukrainian',
  args: { lang: 'uk', browser: 'chrome', live: false },
};
