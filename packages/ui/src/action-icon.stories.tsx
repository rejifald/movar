import type { Meta, StoryObj } from '@storybook/react';

import { ActionIcon } from './action-icon';
import { ACTION_ICON_STATES } from './action-icon-svg';
import type { ActionIconState } from './action-icon-svg';

/**
 * The browser toolbar / "action" button — the one that opens the popover.
 *
 * Unlike the rest of the primitives, this icon is theme-INVARIANT: one raster
 * ships to `browser.action.setIcon`, so it must read on both light and dark
 * browser chrome. The stories therefore pin their own light / dark chrome
 * backdrops instead of riding `prefers-color-scheme` — flip your OS theme to
 * check the surrounding Storybook canvas, but the icon itself won't change.
 *
 * `Gallery` is the one to eyeball: every state, on both chromes, from a big
 * preview down to true 16px toolbar size.
 */
const meta = {
  title: 'Primitives/ActionIcon',
  component: ActionIcon,
  parameters: { layout: 'centered' },
  argTypes: {
    state: {
      control: 'select',
      options: ACTION_ICON_STATES.map((s) => s.key),
    },
    size: { control: { type: 'number', min: 12, max: 128, step: 1 } },
  },
} satisfies Meta<typeof ActionIcon>;

export default meta;

type Story = StoryObj<typeof meta>;

// Representative browser-chrome greys — Chrome's light and dark toolbar fills.
// Fixed (not tokens) because the point of this component is to survive both,
// independent of the app's own theme.
const LIGHT_CHROME = '#e8eaed';
const DARK_CHROME = '#202124';

/** One icon on a fixed chrome swatch, with a size caption. */
function Swatch({
  state,
  size,
  chrome,
  label,
}: Readonly<{ state: ActionIconState; size: number; chrome: string; label: string }>) {
  const onDark = chrome === DARK_CHROME;
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div
        className="flex items-center justify-center rounded-xl"
        style={{ background: chrome, padding: 14 }}
      >
        <ActionIcon state={state} size={size} title={`Movar — ${state}`} />
      </div>
      <span className="text-ui-xs" style={{ color: onDark ? '#9aa0a6' : '#5f6368' }}>
        {label}
      </span>
    </div>
  );
}

/** Every state as its own story, so each shows up in the sidebar and can be
 *  deep-linked. Built from the catalogue so the list can't drift from the
 *  source of truth. */
function makeStateStory(state: ActionIconState): Story {
  return { args: { state, size: 96, title: `Movar — ${state}` } };
}

export const Active = makeStateStory('active');
export const Blocking = makeStateStory('blocking');
export const Paused = makeStateStory('paused');
export const Off = makeStateStory('off');
export const Exempt = makeStateStory('exempt');
export const Attention = makeStateStory('attention');

/**
 * The contact sheet — every state, big preview + true toolbar sizes, on both
 * light and dark chrome. This is the "so I can eyeball it" view: scan the
 * column at 16px to judge whether each state actually reads at toolbar size.
 */
export const Gallery: Story = {
  // `state` is unused (the render iterates the whole catalogue) but required by
  // the typed meta, so give it a placeholder.
  args: { state: 'active' },
  parameters: { layout: 'padded' },
  render: () => (
    <div className="flex flex-col gap-5">
      {ACTION_ICON_STATES.map(({ key, label, summary }) => (
        <div
          key={key}
          className="border-border flex flex-col gap-3 border-b pb-5 last:border-b-0 md:flex-row md:items-center"
        >
          <div className="md:w-64 md:flex-shrink-0">
            <div className="text-ink-strong text-ui-base font-semibold">{label}</div>
            <code className="text-ink-faint text-ui-xs">{key}</code>
            <p className="text-ink-soft text-ui-sm mt-1">{summary}</p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <Swatch state={key} size={96} chrome={LIGHT_CHROME} label="96" />
            <Swatch state={key} size={96} chrome={DARK_CHROME} label="96" />
            <Swatch state={key} size={32} chrome={LIGHT_CHROME} label="32" />
            <Swatch state={key} size={32} chrome={DARK_CHROME} label="32" />
            <Swatch state={key} size={16} chrome={LIGHT_CHROME} label="16 · real" />
            <Swatch state={key} size={16} chrome={DARK_CHROME} label="16 · real" />
          </div>
        </div>
      ))}
    </div>
  ),
};

/**
 * The states side-by-side in a mock toolbar strip, at a realistic ~18px, so the
 * whole set can be compared at a glance the way a user would meet them one at a
 * time in their browser.
 */
export const ToolbarStrip: Story = {
  args: { state: 'active' },
  parameters: { layout: 'centered' },
  render: () => (
    <div className="flex flex-col gap-4">
      {[LIGHT_CHROME, DARK_CHROME].map((chrome) => (
        <div
          key={chrome}
          className="flex items-center gap-2 rounded-xl px-3 py-2"
          style={{ background: chrome }}
        >
          {ACTION_ICON_STATES.map(({ key }) => (
            <ActionIcon key={key} state={key} size={18} title={`Movar — ${key}`} />
          ))}
        </div>
      ))}
    </div>
  ),
};
