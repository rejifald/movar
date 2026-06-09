import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { defaultSettings } from '@movar/settings';
import type { MovarSettings } from '@movar/settings';
import { messagesEn } from '../../lib/i18n/messages-en';
import { PageContentSection } from './PageContentSection';

afterEach(cleanup);

function withContentMod(contentModification: boolean): MovarSettings {
  return { ...defaultSettings, contentModification };
}

describe('PageContentSection', () => {
  it('renders the title and popup-style switch copy when off', () => {
    render(<PageContentSection settings={withContentMod(false)} onChange={vi.fn()} />);
    expect(screen.getByText(messagesEn.options.pageContent.title)).toBeTruthy();
    expect(screen.getByText(messagesEn.contentToggle.label)).toBeTruthy();
    expect(screen.getByTestId('content-toggle-description').textContent).toBe(
      messagesEn.contentToggle.description,
    );
    expect(screen.getByRole<HTMLInputElement>('switch').checked).toBe(false);
    expect(screen.queryByRole('radiogroup')).toBeNull();
  });

  it('reflects contentModification=true as the checked state', () => {
    render(<PageContentSection settings={withContentMod(true)} onChange={vi.fn()} />);
    expect(screen.getByRole<HTMLInputElement>('switch').checked).toBe(true);
    expect(screen.getByRole('radiogroup')).toBeTruthy();
  });

  it('turns the setting on, persisting contentModification=true', async () => {
    const onChange = vi.fn();
    render(<PageContentSection settings={withContentMod(false)} onChange={onChange} />);
    await userEvent.click(screen.getByRole('switch'));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]![0].contentModification).toBe(true);
  });

  it('turns the setting off again, persisting contentModification=false', async () => {
    const onChange = vi.fn();
    render(<PageContentSection settings={withContentMod(true)} onChange={onChange} />);
    await userEvent.click(screen.getByRole('switch'));
    expect(onChange.mock.calls[0]![0].contentModification).toBe(false);
  });

  it('persists conceal-mode changes from the shared control', async () => {
    const onChange = vi.fn();
    render(<PageContentSection settings={withContentMod(true)} onChange={onChange} />);
    await userEvent.click(screen.getByRole('radio', { name: messagesEn.concealMode.hide.label }));
    expect(onChange.mock.calls[0]![0].concealMode).toBe('hide');
  });
});
