import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { fakeBrowser } from 'wxt/testing';
import { browser } from 'wxt/browser';
import type { CorrectionEvent } from '@movar/events';
import { messagesEn } from '@movar/i18n';
import { InsightsSection } from './InsightsSection';

const EVENTS_KEY = 'movar:events';
const NOW = 1_700_000_000_000;
const DAY_MS = 86_400_000;

beforeEach(() => {
  fakeBrowser.reset();
  // InsightsSection aggregates against Date.now(); pin it so the week window is
  // deterministic relative to the seeded timestamps.
  vi.spyOn(Date, 'now').mockReturnValue(NOW);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function event(overrides: Partial<CorrectionEvent> = {}): CorrectionEvent {
  return {
    timestamp: NOW,
    domain: 'example.com',
    mechanism: 'cookie',
    fromLang: 'ru',
    toLang: 'uk',
    ...overrides,
  };
}

async function seed(events: CorrectionEvent[]): Promise<void> {
  await fakeBrowser.storage.local.set({ [EVENTS_KEY]: events });
}

describe('InsightsSection', () => {
  it('renders the section heading', async () => {
    render(<InsightsSection />);
    expect(await screen.findByText(messagesEn.options.insights.title)).toBeTruthy();
  });

  it('shows the quiet empty state when the log is absent', async () => {
    render(<InsightsSection />);
    expect(await screen.findByText(messagesEn.options.insights.empty)).toBeTruthy();
  });

  it('renders week + total counts from a seeded log', async () => {
    await seed([
      event({ domain: 'a.com', timestamp: NOW - DAY_MS }), // this week
      event({ domain: 'b.com', timestamp: NOW - 10 * DAY_MS }), // older, still in 30d window
    ]);
    render(<InsightsSection />);

    await waitFor(() => {
      expect(screen.getByText(messagesEn.options.insights.thisWeek(1))).toBeTruthy();
    });
    expect(screen.getByText(messagesEn.options.insights.total(2))).toBeTruthy();
  });

  it('lists top steered sites with their counts', async () => {
    await seed([
      event({ domain: 'busy.com' }),
      event({ domain: 'busy.com' }),
      event({ domain: 'quiet.com' }),
    ]);
    render(<InsightsSection />);

    await waitFor(() => {
      expect(screen.getByText('busy.com')).toBeTruthy();
    });
    expect(screen.getByText('quiet.com')).toBeTruthy();
    expect(screen.getByText(messagesEn.options.insights.siteCount(2))).toBeTruthy();
    expect(screen.getByText(messagesEn.options.insights.topSitesLabel)).toBeTruthy();
  });

  it('renders the per-mechanism breakdown with i18n labels', async () => {
    await seed([
      event({ mechanism: 'cookie' }),
      event({ mechanism: 'header' }),
      event({ mechanism: 'header' }),
    ]);
    render(<InsightsSection />);

    await waitFor(() => {
      expect(screen.getByText(messagesEn.options.insights.byMechanismLabel)).toBeTruthy();
    });
    expect(screen.getByText(messagesEn.options.insights.mechanism.cookie)).toBeTruthy();
    expect(screen.getByText(messagesEn.options.insights.mechanism.header)).toBeTruthy();
  });

  it('splits engine-tagged from sync-tier corrections', async () => {
    await seed([
      event({ detectionEngine: 'cld3' }),
      event(), // sync tier (no engine)
    ]);
    render(<InsightsSection />);

    await waitFor(() => {
      expect(screen.getByText(messagesEn.options.insights.byEngineLabel)).toBeTruthy();
    });
    expect(screen.getByText('cld3')).toBeTruthy();
    expect(screen.getByText(messagesEn.options.insights.syncTier)).toBeTruthy();
  });

  it('hides the sync-tier row when every correction carries an engine', async () => {
    await seed([event({ detectionEngine: 'cld3' })]);
    render(<InsightsSection />);

    await waitFor(() => {
      expect(screen.getByText('cld3')).toBeTruthy();
    });
    expect(screen.queryByText(messagesEn.options.insights.syncTier)).toBeNull();
  });

  it('never writes back to the corrections log', async () => {
    await seed([event()]);
    const setSpy = vi.spyOn(browser.storage.local, 'set');
    render(<InsightsSection />);

    await waitFor(() => {
      expect(screen.getByText(messagesEn.options.insights.total(1))).toBeTruthy();
    });
    expect(setSpy).not.toHaveBeenCalled();
  });
});
