import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { messagesEn } from '../../lib/i18n/messages-en';
import type { HiddenSummary } from '../../lib/messaging';
import { HiddenPanel } from './HiddenPanel';

afterEach(cleanup);

const t = messagesEn.hidden;

// The polite live region (role="status") intentionally mirrors the visible
// summary text for assistive tech, so a single-item summary appears twice. When
// asserting on the VISIBLE element, ignore the live region to disambiguate.
const NOT_LIVE = { ignore: 'script, style, [role="status"]' } as const;

function summary(overrides: Partial<HiddenSummary> = {}): HiddenSummary {
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

describe('HiddenPanel', () => {
  it('always renders the section heading', () => {
    render(<HiddenPanel hidden={summary()} onRestore={vi.fn()} />);
    expect(screen.getByText(t.title)).toBeTruthy();
  });

  it('shows the "nothing hidden" empty message when nothing is concealed', () => {
    render(<HiddenPanel hidden={summary()} onRestore={vi.fn()} />);
    expect(screen.getByText(t.nothing)).toBeTruthy();
    // No restore CTA in the empty state.
    expect(screen.queryByRole('button', { name: t.show })).toBeNull();
  });

  it('shows the "restored" message after a user override with nothing currently hidden', () => {
    render(<HiddenPanel hidden={summary({ userOverride: true })} onRestore={vi.fn()} />);
    expect(screen.getByText(t.restored, NOT_LIVE)).toBeTruthy();
    expect(screen.queryByText(t.nothing)).toBeNull();
  });

  it('lists hidden picker languages, collapsed pickers and feed cards (plural forms)', () => {
    render(
      <HiddenPanel
        hidden={summary({
          languages: ['ru', 'be'],
          containers: 2,
          feedCurtained: 3,
          feedHidden: 2,
        })}
        onRestore={vi.fn()}
      />,
    );

    expect(screen.getByText(t.fromPickers)).toBeTruthy();
    // Localised language names, comma-joined (ru/be → Russian, Belarusian).
    expect(screen.getByText('Russian, Belarusian')).toBeTruthy();
    expect(screen.getByText(t.collapsed(2))).toBeTruthy();
    expect(screen.getByText(t.feedCurtained(3))).toBeTruthy();
    expect(screen.getByText(t.feedHidden(2))).toBeTruthy();
    // The restore CTA and the reload hint appear in the populated branch.
    expect(screen.getByRole('button', { name: t.show })).toBeTruthy();
    expect(screen.getByText(t.reload)).toBeTruthy();
  });

  it('omits the picker-languages line when only feed cards are hidden', () => {
    render(<HiddenPanel hidden={summary({ feedHidden: 1 })} onRestore={vi.fn()} />);
    // Singular feed-card copy, and no "Hidden from pickers" label.
    expect(screen.getByText(t.feedHidden(1), NOT_LIVE)).toBeTruthy();
    expect(screen.queryByText(t.fromPickers)).toBeNull();
    expect(screen.queryByText(t.collapsed(1))).toBeNull();
  });

  it('calls onRestore when "show everything" is clicked', async () => {
    const onRestore = vi.fn();
    render(<HiddenPanel hidden={summary({ containers: 1 })} onRestore={onRestore} />);
    await userEvent.click(screen.getByRole('button', { name: t.show }));
    expect(onRestore).toHaveBeenCalledTimes(1);
  });

  describe('polite live region', () => {
    it('exposes a polite role="status" region rolling up the concealment summary', () => {
      render(
        <HiddenPanel hidden={summary({ languages: ['ru'], feedHidden: 2 })} onRestore={vi.fn()} />,
      );
      const region = screen.getByRole('status');
      expect(region.getAttribute('aria-live')).toBe('polite');
      expect(region.getAttribute('aria-atomic')).toBe('true');
      // Rolled-up summary, built from the same locale strings as the visible list.
      expect(region.textContent).toContain('Russian');
      expect(region.textContent).toContain(t.feedHidden(2));
    });

    it('announces the restored outcome after a reveal', () => {
      render(<HiddenPanel hidden={summary({ userOverride: true })} onRestore={vi.fn()} />);
      expect(screen.getByRole('status').textContent).toBe(t.restored);
    });

    it('stays silent (empty region) when nothing is hidden and there was no reveal', () => {
      render(<HiddenPanel hidden={summary()} onRestore={vi.fn()} />);
      expect(screen.getByRole('status').textContent).toBe('');
    });
  });
});
