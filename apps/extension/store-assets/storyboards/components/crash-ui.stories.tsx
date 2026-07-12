import type { ReactNode } from 'react';
import type { Decorator, Meta, StoryObj } from '@storybook/react';

import { PopupCrashFallback } from '../../../src/entrypoints/popup/CrashFallback';

/**
 * Visual test for the popup's crash screen. When the popup's React tree throws
 * on first paint, its ErrorBoundary renders {@link PopupCrashFallback} — a
 * crashed `StatusHeader` instance, so a failed popup still reads as Movar: the
 * same brand bar + a muted "unexpected error" hero + a reload button, at the
 * popup's own 360px width, instead of a bespoke panel. Modelled on the
 * StatusHeader `NeedsReload` hero (Components/StatusHeader).
 *
 * Lives under `Components/*` with the `skip-capture` tag, so the screenshot
 * pipeline ignores it — a dev/review surface, not a shipped asset. Each story
 * renders the real production fallback; the copy follows `document.lang`, which
 * mount-app / I18nProvider seed (the same signal the ultimate minimal-panel
 * fallback reads).
 */

/** Seed `<html lang>` before the story renders — `PopupCrashFallback` resolves
 *  its locale from it, exactly as the crashed popup does. Two named decorators
 *  (rather than a factory) so each stays a display-named component. */
const withUkLang: Decorator = (Story) => {
  document.documentElement.lang = 'uk';
  return <Story />;
};

const withEnLang: Decorator = (Story) => {
  document.documentElement.lang = 'en';
  return <Story />;
};

/** Neutral surface modelling the floating popup window: `width: min-content` is
 *  the browser's shrink-to-fit, so the card's own 360px width decides how wide
 *  the popup gets, exactly as it does in Chrome/Firefox/macOS Safari. Rounded +
 *  shadowed so it reads as a popup rather than a bare card. */
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
  component: PopupCrashFallback,
  parameters: { layout: 'fullscreen' },
  tags: ['skip-capture'],
} satisfies Meta<typeof PopupCrashFallback>;

export default meta;

type Story = StoryObj<typeof meta>;

/** The production crash screen, Ukrainian — matches the reported crash. */
export const Ukrainian: Story = {
  name: 'Crash (Ukrainian)',
  decorators: [withUkLang],
  render: () => (
    <PopupWindow>
      <PopupCrashFallback />
    </PopupWindow>
  ),
};

/** The same screen with the English fallback copy. */
export const English: Story = {
  name: 'Crash (English)',
  decorators: [withEnLang],
  render: () => (
    <PopupWindow>
      <PopupCrashFallback />
    </PopupWindow>
  ),
};
