import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { defaultSettings } from '@movar/settings';
import type { MovarSettings } from '@movar/settings';
import { messagesEn } from '@movar/i18n';
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
    switchSuppressed: false,
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
    expect(resolveHero(hiddenSummary(), true, true, settings())).toEqual({
      kind: 'exempt',
      untilUpdate: false,
    });
  });

  it('carries untilUpdate through when the exemption came from the crash screen', () => {
    expect(resolveHero(hiddenSummary(), true, true, settings(), null, true)).toEqual({
      kind: 'exempt',
      untilUpdate: true,
    });
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
      untilUpdate: false,
    });
  });
});

// ─── StatusHeader rendering ───────────────────────────────────────────────
describe('StatusHeader', () => {
  describe('off state', () => {
    it('shows the off hero with a "turn on" CTA and no priority chain', async () => {
      const onTurnOn = vi.fn();
      renderHeader({ settings: settings({ enabled: false }), actions: noopActions({ onTurnOn }) });

      expect(screen.getByText(messagesEn.offTitle)).toBeTruthy();
      expect(screen.getByText(messagesEn.offMessage)).toBeTruthy();
      // Substring match: the label renders inline ("Priority: Ukrainian › …"),
      // so an exact-text query would be null even when the line IS shown.
      expect(screen.queryByText(`${messagesEn.priorityLabel}:`, { exact: false })).toBeNull();

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
      // No priority line on a snoozed (inert) host.
      expect(screen.queryByText(`${messagesEn.priorityLabel}:`, { exact: false })).toBeNull();

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

    it('exempt via crash-screen disable: shows the until-update detail instead', () => {
      renderHeader({ exempt: true, disabledUntilUpdate: true });

      expect(screen.getByText(messagesEn.pageStatus.exemptTitle)).toBeTruthy();
      expect(screen.getByText(messagesEn.pageStatus.exemptUntilUpdateDetail)).toBeTruthy();
      expect(screen.queryByText(messagesEn.pageStatus.exemptDetail)).toBeNull();
    });

    it('noPage: shows the open-a-website message with no chain or CTA', () => {
      renderHeader({ hasPage: false });
      expect(screen.getByText(messagesEn.pageStatus.noPage)).toBeTruthy();
      expect(screen.queryByText(`${messagesEn.priorityLabel}:`, { exact: false })).toBeNull();
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
      // Working states show the priority line.
      expect(screen.getByText(`${messagesEn.priorityLabel}:`, { exact: false })).toBeTruthy();
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

    it('renders the priority line (primary first) for a working state', () => {
      renderHeader({
        settings: settings({ priority: ['uk', 'en'] }),
        hidden: hiddenSummary({ pageLang: 'uk' }),
      });
      // One text line, label first, localised names in priority order
      // (uk → Ukrainian, en → English) joined by chevrons.
      const line = screen.getByText(`${messagesEn.priorityLabel}:`, { exact: false });
      expect(line.textContent).toBe(`${messagesEn.priorityLabel}: Ukrainian › English`);
    });
  });

  describe('crashed state', () => {
    it('renders the crash hero (title, description, reload) instead of the live status', () => {
      // Even with a normal, working snapshot, `crashed` forces the crash hero —
      // the popup's ErrorBoundary fallback (popup/CrashFallback) mounts a crashed
      // StatusHeader so a failed popup still reads as Movar.
      renderHeader({ crashed: true, hidden: hiddenSummary({ pageLang: 'uk' }) });

      expect(screen.getByText(messagesEn.errorBoundary.title)).toBeTruthy();
      expect(screen.getByText(messagesEn.errorBoundary.description)).toBeTruthy();
      expect(screen.getByRole('button', { name: messagesEn.errorBoundary.reload })).toBeTruthy();
      // Still the Movar brand bar, and no page-status/priority chain leaks through.
      expect(screen.getAllByText('Movar').length).toBeGreaterThan(0);
      expect(screen.queryByText(messagesEn.pageStatus.servedIn('Ukrainian'))).toBeNull();
    });

    it('drives the reload button with onReloadTab', async () => {
      const onReloadTab = vi.fn();
      renderHeader({ crashed: true, actions: noopActions({ onReloadTab }) });

      await userEvent.click(screen.getByRole('button', { name: messagesEn.errorBoundary.reload }));
      expect(onReloadTab).toHaveBeenCalledTimes(1);
    });
  });
});
