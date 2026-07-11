import type { ReactNode } from 'react';
import type { Decorator, Meta, StoryObj } from '@storybook/react';

import { ErrorBoundary } from '@movar/app-shell';

/**
 * Visual test for the popup's crash screen — the shared `@movar/app-shell`
 * `ErrorBoundary` fallback, the last-resort panel a Movar surface shows when
 * its React tree throws mid-render.
 *
 * Lives under `Components/*` (not `Marketplace|Marketing|Promo/*`) and carries
 * the `skip-capture` tag, so the screenshot pipeline ignores it — this is a
 * dev/review surface, not a shipped asset.
 *
 * Both stories force the real crash path (`<Boom />` throws on first render,
 * the boundary catches it and renders `pickFallbackCopy()`), so the panel and
 * its Ukrainian copy are exactly what ships. The only difference between them
 * is the `panelClassName` the popup now passes:
 *
 *   - {@link Collapsed} — no width (the pre-fix behaviour). The frame models
 *     the floating popup window's shrink-to-fit with `width: min-content`, so a
 *     width-less panel collapses to its longest word / the Reload button and
 *     the message wraps and clips — the reported ugly crash.
 *   - {@link PopupWidth} — `w-[360px] max-w-full` (what `popup/main.tsx` passes
 *     now). The fixed width pins the same shrink-to-fit frame to 360px, so the
 *     crashed popup reads at the healthy popup's size.
 */

/** Forces a render crash so the boundary shows its real fallback — the same
 *  code path a malformed `storage.sync` value or a deep TypeError hits in
 *  production. */
function Boom(): never {
  throw new Error('storybook: forced popup render crash');
}

/** The fallback copy follows `document.documentElement.lang`, which mount-app
 *  seeds before React renders (the boundary sits above `I18nProvider`, so it
 *  can't read the settings locale). Seed `uk` here so the scene matches a
 *  Ukrainian user's crash, like the report. */
const withUkLang: Decorator = (Story) => {
  document.documentElement.lang = 'uk';
  return <Story />;
};

/** Neutral surface that models the floating popup window: `width: min-content`
 *  is the browser's shrink-to-fit, so the panel's own width (or lack of one)
 *  decides how wide the popup gets, exactly as it does in Chrome/Firefox/macOS
 *  Safari. Rounded + shadowed so it reads as a popup rather than a bare panel. */
function PopupWindow({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: 40,
        background: '#e7e5e4',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          width: 'min-content',
          borderRadius: 12,
          overflow: 'hidden',
          boxShadow: '0 18px 56px rgba(0, 0, 0, 0.18), 0 2px 8px rgba(0, 0, 0, 0.08)',
        }}
      >
        {children}
      </div>
    </div>
  );
}

const meta = {
  title: 'Components/CrashUI',
  component: ErrorBoundary,
  // Render-only stories (each forces its own crash), so `children` is never
  // read from args — but `ErrorBoundary` types it required, so satisfy it here.
  args: { children: null },
  decorators: [withUkLang],
  parameters: { layout: 'fullscreen' },
  tags: ['skip-capture'],
} satisfies Meta<typeof ErrorBoundary>;

export default meta;

type Story = StoryObj<typeof meta>;

/** Before the fix: the fallback sets no width, so the popup window collapses. */
export const Collapsed: Story = {
  name: 'Collapsed (no width — before)',
  render: () => (
    <PopupWindow>
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>
    </PopupWindow>
  ),
};

/** After the fix: `panelClassName="w-[360px] max-w-full"` — what `popup/main.tsx`
 *  passes — pins the popup to the healthy 360px width. */
export const PopupWidth: Story = {
  name: 'Popup width (w-[360px] — ships now)',
  render: () => (
    <PopupWindow>
      <ErrorBoundary panelClassName="w-[360px] max-w-full">
        <Boom />
      </ErrorBoundary>
    </PopupWindow>
  ),
};
