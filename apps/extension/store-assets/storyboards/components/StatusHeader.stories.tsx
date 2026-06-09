import type { ComponentProps, ReactNode } from 'react';
import type { Meta, StoryObj } from '@storybook/react';

import type { MovarSettings, UiLanguage } from '@movar/settings';

import { withBrowserMock } from '../../../.storybook/decorators/with-browser-mock';
import { StatusHeader } from '../../../src/entrypoints/popup/StatusHeader';
import { I18nProvider } from '../../../src/lib/i18n';
import type { HiddenSummary } from '../../../src/lib/messaging';
import type { PauseState } from '../../../src/lib/pause';

/**
 * Component showcase for the popup's `StatusHeader` — the redesigned hero that
 * replaced the cross-site "corrections today" count with a live, per-page
 * status. Every state the hero can resolve to (see `resolveHero`) gets a
 * story, plus paused / off and two "all states" galleries (English +
 * Ukrainian) for an at-a-glance overview.
 *
 * Lives under `Components/*` (not `Marketplace|Marketing|Promo/*`), so the
 * screenshot capture pipeline ignores it — this is a dev/review surface, not a
 * shipped asset. Each story renders the real component with controlled props,
 * so no content script or live tab is needed.
 */
type Props = ComponentProps<typeof StatusHeader>;

const BASE_SETTINGS: MovarSettings = {
  enabled: true,
  priority: ['uk', 'en'],
  blocked: ['ru'],
  allowlist: [],
  contentModification: true,
  concealMode: 'curtain',
  uiLanguage: 'en',
};

const NOT_PAUSED: PauseState = { paused: false, until: null, indefinite: false };

/** Fixed instant so the paused story reads deterministically. */
const PAUSED_UNTIL = new Date('2026-06-06T17:30:00').getTime();

const noop = (): void => {
  // stories don't need the toggle to do anything
};

/** Build a per-page snapshot, overriding only the fields a state cares about. */
function snap(over: Partial<HiddenSummary> = {}): HiddenSummary {
  return {
    languages: [],
    containers: 0,
    feedCurtained: 0,
    feedHidden: 0,
    pageLang: null,
    userOverride: false,
    ...over,
  };
}

/** The popup-width card the component renders inside, under an i18n provider so
 *  `useI18n()` resolves. Mirrors the real popup wrapper plus a card border so
 *  it reads as a discrete surface on the Storybook canvas. */
function Frame({ locale, children }: { locale: UiLanguage; children: ReactNode }) {
  return (
    <I18nProvider uiLanguage={locale}>
      <div className="bg-surface text-ink-strong border-border w-[360px] overflow-hidden rounded-xl border font-sans text-sm shadow-md">
        {children}
      </div>
    </I18nProvider>
  );
}

function fullProps(over: Partial<Props>): Props {
  return {
    settings: BASE_SETTINGS,
    pause: NOT_PAUSED,
    hidden: snap(),
    exempt: false,
    hasPage: true,
    actions: { onReloadTab: noop, onEnableForSite: noop, onTurnOn: noop },
    ...over,
  };
}

/** Render one framed StatusHeader for a single state. */
function show(over: Partial<Props>, locale: UiLanguage = 'en') {
  return (
    <Frame locale={locale}>
      <StatusHeader {...fullProps(over)} />
    </Frame>
  );
}

/** Single source of truth for every state — drives the galleries, and keeps
 *  the per-state stories below honest about which props produce which hero. */
const CASES: { label: string; over: Partial<Props> }[] = [
  { label: 'Served — page in a preferred language', over: { hidden: snap({ pageLang: 'uk' }) } },
  {
    label: 'Hiding — picker entries hidden',
    over: { hidden: snap({ languages: ['ru'], containers: 1 }) },
  },
  { label: 'Hiding — feed cards blurred', over: { hidden: snap({ feedCurtained: 5 }) } },
  {
    label: 'Blocked — page still in a blocked language',
    over: { hidden: snap({ pageLang: 'ru' }) },
  },
  { label: 'Clean — nothing blocked here', over: { hidden: snap({ pageLang: null }) } },
  { label: 'Reload — content script not loaded yet', over: { hidden: null } },
  { label: 'Exempt — site on the allowlist', over: { hidden: null, exempt: true } },
  { label: 'No page — non-web tab', over: { hidden: null, hasPage: false } },
  {
    label: 'Paused — until a time',
    over: { pause: { paused: true, until: PAUSED_UNTIL, indefinite: false } },
  },
  { label: 'Off — Movar disabled', over: { settings: { ...BASE_SETTINGS, enabled: false } } },
];

function Gallery({ locale }: { locale: UiLanguage }) {
  return (
    <div
      style={{
        display: 'grid',
        gap: 28,
        gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
        alignItems: 'start',
        padding: 28,
      }}
    >
      {CASES.map(({ label, over }) => (
        <div key={label}>
          <div className="text-ink-faint mb-2 font-mono text-[10.5px] font-medium tracking-[0.1em] uppercase">
            {label}
          </div>
          <Frame locale={locale}>
            <StatusHeader {...fullProps(over)} />
          </Frame>
        </div>
      ))}
    </div>
  );
}

const meta = {
  title: 'Components/StatusHeader',
  component: StatusHeader,
  decorators: [withBrowserMock],
  parameters: { layout: 'centered' },
  // Placeholder args — every story drives its real props via `render`, so these
  // never reach the screen; they exist to satisfy CSF strict typing on a meta
  // whose `component` has required props (same pattern as correction-applied).
  args: fullProps({}),
} satisfies Meta<typeof StatusHeader>;

export default meta;

type Story = StoryObj<typeof meta>;

// ─── Active hero variants ──────────────────────────────────────────────────

export const ServedUkrainian: Story = { render: () => show({ hidden: snap({ pageLang: 'uk' }) }) };

export const ServedEnglish: Story = { render: () => show({ hidden: snap({ pageLang: 'en' }) }) };

export const HidingPickers: Story = {
  render: () => show({ hidden: snap({ languages: ['ru'], containers: 1 }) }),
};

export const HidingFeedCards: Story = {
  render: () => show({ hidden: snap({ feedCurtained: 5 }) }),
};

export const BlockedRussian: Story = { render: () => show({ hidden: snap({ pageLang: 'ru' }) }) };

export const CleanNoBlocked: Story = { render: () => show({ hidden: snap({ pageLang: null }) }) };

export const NeedsReload: Story = { render: () => show({ hidden: null }) };

export const Exempt: Story = { render: () => show({ hidden: null, exempt: true }) };

export const NonWebTab: Story = { render: () => show({ hidden: null, hasPage: false }) };

// ─── Paused / off ──────────────────────────────────────────────────────────

export const Paused: Story = {
  render: () => show({ pause: { paused: true, until: PAUSED_UNTIL, indefinite: false } }),
};

export const PausedIndefinitely: Story = {
  render: () => show({ pause: { paused: true, until: null, indefinite: true } }),
};

export const Off: Story = {
  render: () => show({ settings: { ...BASE_SETTINGS, enabled: false } }),
};

// ─── Localised variants ────────────────────────────────────────────────────

export const HidingPickersUkrainian: Story = {
  render: () => show({ hidden: snap({ languages: ['ru'], containers: 1 }) }, 'uk'),
};

// ─── Galleries (every state at once) ───────────────────────────────────────

export const AllStatesEnglish: Story = {
  parameters: { layout: 'fullscreen' },
  render: () => <Gallery locale="en" />,
};

export const AllStatesUkrainian: Story = {
  parameters: { layout: 'fullscreen' },
  render: () => <Gallery locale="uk" />,
};
