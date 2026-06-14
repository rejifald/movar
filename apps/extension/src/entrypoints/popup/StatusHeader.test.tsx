import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { defaultSettings } from '@movar/settings';
import type { MovarSettings } from '@movar/settings';
import { messagesEn } from '../../lib/i18n/messages-en';
import type { HiddenSummary } from '../../lib/messaging';
import type { PauseState } from '../../lib/pause';
import { resolveHero, StatusHeader } from './StatusHeader';
import type { HeroActions, StatusHeaderProps } from './StatusHeader';

afterEach(cleanup);

const NOT_PAUSED: PauseState = { paused: false, until: null, indefinite: false };

function settings(overrides: Partial<MovarSettings> = {}): MovarSettings {
  return { ...defaultSettings, ...overrides };
}

function hiddenSummary(overrides: Partial<HiddenSummary> = {}): HiddenSummary {
  return {
    languages: [],
    containers: 0,
    feedCurtained: 0,
    feedHidden: 0,
    pageLang: null,
    userOverride: false,
    ...overrides,
  };
}

function noopActions(overrides: Partial<HeroActions> = {}): HeroActions {
  return {
    onReloadTab: vi.fn(),
    onEnableForSite: vi.fn(),
    onTurnOn: vi.fn(),
    onResumeSite: vi.fn(),
    ...overrides,
  };
}

function renderHeader(overrides: Partial<StatusHeaderProps> = {}) {
  const props: StatusHeaderProps = {
    settings: settings(),
    pause: NOT_PAUSED,
    hidden: hiddenSummary(),
    exempt: false,
    hasPage: true,
    snoozedUntil: null,
    actions: noopActions(),
    ...overrides,
  };
  render(<StatusHeader {...props} />);
  return props;
}

// ─── resolveHero (the pure dispatch) ──────────────────────────────────────
describe('resolveHero', () => {
  it('prefers exempt over everything', () => {
    expect(resolveHero(hiddenSummary(), true, true, settings())).toEqual({ kind: 'exempt' });
  });

  it('reports noPage on a non-web tab', () => {
    expect(resolveHero(hiddenSummary(), false, false, settings())).toEqual({ kind: 'noPage' });
  });

  it('reports reload when no content script answered', () => {
    expect(resolveHero(null, false, true, settings())).toEqual({ kind: 'reload' });
  });

  it('reports hiding when something is concealed', () => {
    expect(resolveHero(hiddenSummary({ languages: ['ru'] }), false, true, settings())).toEqual({
      kind: 'hiding',
      languages: ['ru'],
    });
  });

  it('classifies a blocked page language', () => {
    const hero = resolveHero(hiddenSummary({ pageLang: 'ru' }), false, true, settings());
    expect(hero).toEqual({ kind: 'blocked', language: 'ru' });
  });

  it('classifies a served (preferred) page language', () => {
    const hero = resolveHero(hiddenSummary({ pageLang: 'uk' }), false, true, settings());
    expect(hero).toEqual({ kind: 'served', language: 'uk' });
  });

  it('falls through to clean for an unblocked, non-preferred language', () => {
    const hero = resolveHero(hiddenSummary({ pageLang: 'fr' }), false, true, settings());
    expect(hero).toEqual({ kind: 'clean' });
  });

  it('is clean when the page language is unknown', () => {
    const hero = resolveHero(hiddenSummary({ pageLang: null }), false, true, settings());
    expect(hero).toEqual({ kind: 'clean' });
  });

  it('reports snoozed (outranking the page-content read) when the host is snoozed', () => {
    // A blocked page that is also snoozed shows the snoozed hero, not blocked.
    const hero = resolveHero(hiddenSummary({ pageLang: 'ru' }), false, true, settings(), 42_000);
    expect(hero).toEqual({ kind: 'snoozed', until: 42_000 });
  });

  it('still prefers exempt over snoozed', () => {
    expect(resolveHero(hiddenSummary(), true, true, settings(), 42_000)).toEqual({
      kind: 'exempt',
    });
  });
});

// ─── StatusHeader rendering ───────────────────────────────────────────────
describe('StatusHeader', () => {
  it('always renders the Movar brand bar', () => {
    renderHeader();
    expect(screen.getAllByText('Movar').length).toBeGreaterThan(0);
  });

  describe('off state', () => {
    it('shows the off hero with a "turn on" CTA and no priority chain', async () => {
      const onTurnOn = vi.fn();
      renderHeader({ settings: settings({ enabled: false }), actions: noopActions({ onTurnOn }) });

      expect(screen.getByText(messagesEn.offTitle)).toBeTruthy();
      expect(screen.getByText(messagesEn.offMessage)).toBeTruthy();
      expect(screen.queryByText(messagesEn.priorityLabel)).toBeNull();

      await userEvent.click(screen.getByRole('button', { name: messagesEn.status.turnOn }));
      expect(onTurnOn).toHaveBeenCalledTimes(1);
    });
  });

  describe('paused state', () => {
    it('renders the indefinite-pause subtitle', () => {
      renderHeader({ pause: { paused: true, until: null, indefinite: true } });
      expect(screen.getByText(messagesEn.pausedTitle)).toBeTruthy();
      expect(screen.getByText(messagesEn.pausedIndefinitely)).toBeTruthy();
    });

    it('renders a "no scheduled end" subtitle when paused without an until', () => {
      // paused but not indefinite and no `until` — the defensive third branch.
      renderHeader({ pause: { paused: true, until: null, indefinite: false } });
      expect(screen.getByText(messagesEn.pausedNoEnd)).toBeTruthy();
    });

    it('renders a localised "until <date>" subtitle for a timed pause', () => {
      const until = Date.parse('2099-01-02T03:04:00Z');
      renderHeader({ pause: { paused: true, until, indefinite: false } });
      const expected = messagesEn.pausedUntilDate(new Date(until).toLocaleString('en'));
      expect(screen.getByText(expected)).toBeTruthy();
    });
  });

  describe('active hero variants', () => {
    it('snoozed: shows the snoozed copy, a localised "until" subtitle, and a "resume now" CTA', async () => {
      const onResumeSite = vi.fn();
      const until = Date.parse('2099-01-02T03:04:00Z');
      renderHeader({ snoozedUntil: until, actions: noopActions({ onResumeSite }) });

      expect(screen.getByText(messagesEn.pageStatus.snoozedTitle)).toBeTruthy();
      expect(
        screen.getByText(messagesEn.pausedUntilDate(new Date(until).toLocaleString('en'))),
      ).toBeTruthy();
      // No priority chain on a snoozed (inert) host.
      expect(screen.queryByText(messagesEn.priorityLabel)).toBeNull();

      await userEvent.click(screen.getByRole('button', { name: messagesEn.pause.resume }));
      expect(onResumeSite).toHaveBeenCalledTimes(1);
    });

    it('exempt: shows the exempt copy and an "enable for site" CTA', async () => {
      const onEnableForSite = vi.fn();
      renderHeader({ exempt: true, actions: noopActions({ onEnableForSite }) });

      expect(screen.getByText(messagesEn.pageStatus.exemptTitle)).toBeTruthy();
      expect(screen.getByText(messagesEn.pageStatus.exemptDetail)).toBeTruthy();
      await userEvent.click(
        screen.getByRole('button', { name: messagesEn.pageStatus.enableSiteCta }),
      );
      expect(onEnableForSite).toHaveBeenCalledTimes(1);
    });

    it('noPage: shows the open-a-website message with no chain or CTA', () => {
      renderHeader({ hasPage: false });
      expect(screen.getByText(messagesEn.pageStatus.noPage)).toBeTruthy();
      expect(screen.queryByText(messagesEn.priorityLabel)).toBeNull();
      expect(screen.queryByRole('button')).toBeNull();
    });

    it('reload: shows the reload message and fires onReloadTab', async () => {
      const onReloadTab = vi.fn();
      renderHeader({ hidden: null, actions: noopActions({ onReloadTab }) });

      expect(screen.getByText(messagesEn.pageStatus.reload)).toBeTruthy();
      await userEvent.click(screen.getByRole('button', { name: messagesEn.pageStatus.reloadCta }));
      expect(onReloadTab).toHaveBeenCalledTimes(1);
    });

    it('hiding: titles with the concealed language names and shows the chain', () => {
      renderHeader({ hidden: hiddenSummary({ languages: ['ru'] }) });
      expect(screen.getByText(messagesEn.pageStatus.hiding(['Russian']))).toBeTruthy();
      // Working states show the preferred-order chain.
      expect(screen.getByText(messagesEn.priorityLabel)).toBeTruthy();
    });

    it('hiding (feed-only): uses the generic title when no picker language was hidden', () => {
      renderHeader({ hidden: hiddenSummary({ feedCurtained: 2 }) });
      expect(screen.getByText(messagesEn.pageStatus.hiding([]))).toBeTruthy();
    });

    it('blocked: shows the blocked title + detail for a blocked page language', () => {
      renderHeader({ hidden: hiddenSummary({ pageLang: 'ru' }) });
      expect(screen.getByText(messagesEn.pageStatus.blockedTitle('Russian'))).toBeTruthy();
      expect(screen.getByText(messagesEn.pageStatus.blockedDetail)).toBeTruthy();
    });

    it('served: shows the served-in title for a preferred page language', () => {
      renderHeader({ hidden: hiddenSummary({ pageLang: 'uk' }) });
      expect(screen.getByText(messagesEn.pageStatus.servedIn('Ukrainian'))).toBeTruthy();
    });

    it('clean: shows the all-clear when nothing is blocked', () => {
      renderHeader({ hidden: hiddenSummary({ pageLang: null }) });
      expect(screen.getByText(messagesEn.pageStatus.clean)).toBeTruthy();
    });

    it('renders the priority chain pills (primary first) for a working state', () => {
      renderHeader({
        settings: settings({ priority: ['uk', 'en'] }),
        hidden: hiddenSummary({ pageLang: 'uk' }),
      });
      // Localised names rendered as pills (uk → Ukrainian, en → English).
      expect(screen.getByText('Ukrainian')).toBeTruthy();
      expect(screen.getByText('English')).toBeTruthy();
      // The chain group is labelled for screen readers.
      expect(
        screen.getByRole('group', { name: messagesEn.priority(['Ukrainian', 'English']) }),
      ).toBeTruthy();
    });
  });
});
