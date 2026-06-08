import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { messagesEn } from '../../lib/i18n/messages-en';
import { ContentToggle } from './ContentToggle';

afterEach(cleanup);

describe('ContentToggle', () => {
  it('renders the (default English) label and description, unchecked', () => {
    render(<ContentToggle enabled={false} onChange={vi.fn()} />);
    const checkbox = screen.getByRole<HTMLInputElement>('checkbox');
    expect(checkbox.checked).toBe(false);
    // getByText throws if absent, so this asserts the label rendered.
    expect(screen.getByText(messagesEn.contentToggle.label)).toBeTruthy();
    expect(screen.getByTestId('content-toggle-description').textContent).toBe(
      messagesEn.contentToggle.description,
    );
  });

  it('reflects the enabled prop as the checked state', () => {
    render(<ContentToggle enabled onChange={vi.fn()} />);
    expect(screen.getByRole<HTMLInputElement>('checkbox').checked).toBe(true);
  });

  it('calls onChange with the toggled value when clicked', async () => {
    const onChange = vi.fn();
    render(<ContentToggle enabled={false} onChange={onChange} />);
    await userEvent.click(screen.getByRole('checkbox'));
    expect(onChange).toHaveBeenCalledWith(true);
  });
});
