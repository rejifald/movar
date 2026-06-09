import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { messagesEn } from '../../lib/i18n/messages-en';
import type { ConcealMode } from '@movar/settings';
import { ContentToggle } from './ContentToggle';

afterEach(cleanup);

function renderToggle(
  over: Partial<{
    enabled: boolean;
    concealMode: ConcealMode;
    onToggle: (next: boolean) => void;
    onConcealModeChange: (next: ConcealMode) => void;
  }> = {},
) {
  const props = {
    enabled: false,
    concealMode: 'curtain' as ConcealMode,
    onToggle: vi.fn(),
    onConcealModeChange: vi.fn(),
    ...over,
  };
  render(
    <ContentToggle
      enabled={props.enabled}
      concealMode={props.concealMode}
      onToggle={props.onToggle}
      onConcealModeChange={props.onConcealModeChange}
    />,
  );
  return props;
}

describe('ContentToggle', () => {
  it('renders the (default English) label and description, switched off', () => {
    renderToggle({ enabled: false });
    const toggle = screen.getByRole<HTMLInputElement>('switch');
    expect(toggle.checked).toBe(false);
    // getByText throws if absent, so this asserts the label rendered.
    expect(screen.getByText(messagesEn.contentToggle.label)).toBeTruthy();
    expect(screen.getByTestId('content-toggle-description').textContent).toBe(
      messagesEn.contentToggle.description,
    );
    // The conceal-mode selector is hidden while filtering is off.
    expect(screen.queryByRole('radiogroup')).toBeNull();
  });

  it('reflects the enabled prop and reveals the conceal-mode selector when on', () => {
    renderToggle({ enabled: true });
    expect(screen.getByRole<HTMLInputElement>('switch').checked).toBe(true);
    expect(screen.getByRole('radiogroup')).toBeTruthy();
    expect(screen.getByText(messagesEn.concealMode.curtain.label)).toBeTruthy();
    expect(screen.getByText(messagesEn.concealMode.hide.label)).toBeTruthy();
  });

  it('calls onToggle with the toggled value when the switch is clicked', async () => {
    const { onToggle } = renderToggle({ enabled: false });
    await userEvent.click(screen.getByRole('switch'));
    expect(onToggle).toHaveBeenCalledWith(true);
  });

  it('calls onConcealModeChange when a different mode is picked', async () => {
    const { onConcealModeChange } = renderToggle({ enabled: true, concealMode: 'curtain' });
    await userEvent.click(screen.getByRole('radio', { name: messagesEn.concealMode.hide.label }));
    expect(onConcealModeChange).toHaveBeenCalledWith('hide');
  });
});
