import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { defaultSettings } from '@movar/settings';
import type { MovarSettings } from '@movar/settings';
import { messagesEn } from '../../lib/i18n/messages-en';
import { PageContentSection } from './PageContentSection';

afterEach(cleanup);

const t = messagesEn.options.pageContent;

function withContentMod(contentModification: boolean): MovarSettings {
  return { ...defaultSettings, contentModification };
}

describe('PageContentSection', () => {
  it('renders the title, intro, and an unchecked toggle when off', () => {
    render(<PageContentSection settings={withContentMod(false)} onChange={vi.fn()} />);
    expect(screen.getByText(t.title)).toBeTruthy();
    expect(screen.getByText(t.intro)).toBeTruthy();
    expect(screen.getByText(t.toggleLabel)).toBeTruthy();
    expect(screen.getByRole<HTMLInputElement>('checkbox').checked).toBe(false);
  });

  it('reflects contentModification=true as the checked state', () => {
    render(<PageContentSection settings={withContentMod(true)} onChange={vi.fn()} />);
    expect(screen.getByRole<HTMLInputElement>('checkbox').checked).toBe(true);
  });

  it('turns the setting on, persisting contentModification=true', async () => {
    const onChange = vi.fn();
    render(<PageContentSection settings={withContentMod(false)} onChange={onChange} />);
    await userEvent.click(screen.getByRole('checkbox'));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]![0].contentModification).toBe(true);
  });

  it('turns the setting off again, persisting contentModification=false', async () => {
    const onChange = vi.fn();
    render(<PageContentSection settings={withContentMod(true)} onChange={onChange} />);
    await userEvent.click(screen.getByRole('checkbox'));
    expect(onChange.mock.calls[0]![0].contentModification).toBe(false);
  });
});
