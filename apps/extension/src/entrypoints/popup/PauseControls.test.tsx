import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { messagesEn } from '@movar/i18n';
import type { PauseState } from '../../lib/pause';
import { PauseControls } from './PauseControls';

afterEach(cleanup);

const t = messagesEn.pause;

const NOT_PAUSED: PauseState = { paused: false, until: null, indefinite: false };
const PAUSED: PauseState = { paused: true, until: null, indefinite: true };

describe('PauseControls', () => {
  it('offers each pause duration as its own button when not paused', () => {
    render(<PauseControls pause={NOT_PAUSED} onPause={vi.fn()} onResume={vi.fn()} />);

    expect(screen.getByText(t.title)).toBeTruthy();
    // One button per duration, labelled from the catalogue.
    expect(screen.getByRole('button', { name: t.durations['1h'] })).toBeTruthy();
    expect(screen.getByRole('button', { name: t.durations.indefinite })).toBeTruthy();
    // The resume affordance is hidden while running.
    expect(screen.queryByRole('button', { name: t.resume })).toBeNull();
  });

  it('calls onPause with the chosen duration', async () => {
    const onPause = vi.fn();
    render(<PauseControls pause={NOT_PAUSED} onPause={onPause} onResume={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: t.durations['1h'] }));
    expect(onPause).toHaveBeenCalledWith('1h');

    await userEvent.click(screen.getByRole('button', { name: t.durations.indefinite }));
    expect(onPause).toHaveBeenCalledWith('indefinite');
  });

  it('shows only a resume button when paused', () => {
    render(<PauseControls pause={PAUSED} onPause={vi.fn()} onResume={vi.fn()} />);

    expect(screen.getByRole('button', { name: t.resume })).toBeTruthy();
    // Duration choices and the title are gone in the paused state.
    expect(screen.queryByText(t.title)).toBeNull();
    expect(screen.queryByRole('button', { name: t.durations['1h'] })).toBeNull();
  });

  it('calls onResume when the resume button is clicked', async () => {
    const onResume = vi.fn();
    render(<PauseControls pause={PAUSED} onPause={vi.fn()} onResume={onResume} />);

    await userEvent.click(screen.getByRole('button', { name: t.resume }));
    expect(onResume).toHaveBeenCalledTimes(1);
  });

  it('offers the per-site snooze affordance when onSnoozeSite is provided', async () => {
    const onSnoozeSite = vi.fn();
    render(
      <PauseControls
        pause={NOT_PAUSED}
        onPause={vi.fn()}
        onResume={vi.fn()}
        onSnoozeSite={onSnoozeSite}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: t.snoozeSite }));
    expect(onSnoozeSite).toHaveBeenCalledTimes(1);
  });

  it('hides the snooze affordance when onSnoozeSite is omitted (no eligible page)', () => {
    render(<PauseControls pause={NOT_PAUSED} onPause={vi.fn()} onResume={vi.fn()} />);
    expect(screen.queryByRole('button', { name: t.snoozeSite })).toBeNull();
  });

  it('hides the snooze affordance while globally paused', () => {
    render(
      <PauseControls pause={PAUSED} onPause={vi.fn()} onResume={vi.fn()} onSnoozeSite={vi.fn()} />,
    );
    expect(screen.queryByRole('button', { name: t.snoozeSite })).toBeNull();
  });

  it('offers the permanent exempt affordance when onExemptSite is provided', async () => {
    const onExemptSite = vi.fn();
    render(
      <PauseControls
        pause={NOT_PAUSED}
        onPause={vi.fn()}
        onResume={vi.fn()}
        onExemptSite={onExemptSite}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: t.exemptSite }));
    expect(onExemptSite).toHaveBeenCalledTimes(1);
  });

  it('hides the exempt affordance when onExemptSite is omitted (no eligible page / already exempt)', () => {
    render(<PauseControls pause={NOT_PAUSED} onPause={vi.fn()} onResume={vi.fn()} />);
    expect(screen.queryByRole('button', { name: t.exemptSite })).toBeNull();
  });

  it('hides the exempt affordance while globally paused', () => {
    render(
      <PauseControls pause={PAUSED} onPause={vi.fn()} onResume={vi.fn()} onExemptSite={vi.fn()} />,
    );
    expect(screen.queryByRole('button', { name: t.exemptSite })).toBeNull();
  });
});
