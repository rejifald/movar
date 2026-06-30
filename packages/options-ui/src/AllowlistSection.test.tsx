import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { defaultSettings } from '@movar/settings';
import type { MovarSettings } from '@movar/settings';
import { messagesEn } from '@movar/i18n';
import { AllowlistSection } from './AllowlistSection';

afterEach(cleanup);

const t = messagesEn.options.allowlist;

function withAllowlist(allowlist: string[]): MovarSettings {
  return { ...defaultSettings, allowlist };
}

describe('AllowlistSection', () => {
  it('shows the empty-state copy when no sites are exempt', () => {
    render(<AllowlistSection settings={withAllowlist([])} onChange={vi.fn()} />);
    expect(screen.getByText(t.empty)).toBeTruthy();
    // No list is rendered in the empty state.
    expect(screen.queryByRole('list')).toBeNull();
  });

  it('renders one chip per exempt domain', () => {
    render(
      <AllowlistSection settings={withAllowlist(['example.com', 'foo.org'])} onChange={vi.fn()} />,
    );
    const items = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(items.map((li) => li.textContent)).toEqual([
      expect.stringContaining('example.com'),
      expect.stringContaining('foo.org'),
    ]);
    // The empty-state line is gone once there are entries.
    expect(screen.queryByText(t.empty)).toBeNull();
  });

  it('removes a domain via its remove button, persisting the filtered list', async () => {
    const onChange = vi.fn();
    render(
      <AllowlistSection settings={withAllowlist(['example.com', 'foo.org'])} onChange={onChange} />,
    );
    await userEvent.click(screen.getByRole('button', { name: t.remove('example.com') }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]![0].allowlist).toEqual(['foo.org']);
  });

  it('adds a normalised domain on submit', async () => {
    const onChange = vi.fn();
    render(<AllowlistSection settings={withAllowlist([])} onChange={onChange} />);
    const input = screen.getByRole('textbox', { name: t.inputLabel });
    // Mixed case + scheme + path — all stripped by normaliseDomain before persisting.
    await userEvent.type(input, 'HTTPS://www.Example.com/path');
    await userEvent.click(screen.getByRole('button', { name: t.addButton }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]![0].allowlist).toEqual(['example.com']);
  });

  it('rejects a malformed domain with an inline error and does not call onChange', async () => {
    const onChange = vi.fn();
    render(<AllowlistSection settings={withAllowlist([])} onChange={onChange} />);
    await userEvent.type(screen.getByRole('textbox', { name: t.inputLabel }), 'not a domain');
    await userEvent.click(screen.getByRole('button', { name: t.addButton }));
    expect(screen.getByText(t.errorBadDomain)).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('rejects a duplicate (after normalisation) with the duplicate error', async () => {
    const onChange = vi.fn();
    render(<AllowlistSection settings={withAllowlist(['example.com'])} onChange={onChange} />);
    // Different casing / www, but normalises to the existing entry.
    await userEvent.type(screen.getByRole('textbox', { name: t.inputLabel }), 'www.EXAMPLE.com');
    await userEvent.click(screen.getByRole('button', { name: t.addButton }));
    expect(screen.getByText(t.errorDuplicate)).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('does nothing when the input normalises to empty', async () => {
    const onChange = vi.fn();
    render(<AllowlistSection settings={withAllowlist([])} onChange={onChange} />);
    // Whitespace + a bare scheme normalise to '' → early return, no error, no onChange.
    await userEvent.type(screen.getByRole('textbox', { name: t.inputLabel }), '   ');
    await userEvent.click(screen.getByRole('button', { name: t.addButton }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByText(t.errorBadDomain)).toBeNull();
    expect(screen.queryByText(t.errorDuplicate)).toBeNull();
  });

  it('clears a shown error as soon as the user edits the input', async () => {
    render(<AllowlistSection settings={withAllowlist([])} onChange={vi.fn()} />);
    const input = screen.getByRole('textbox', { name: t.inputLabel });
    await userEvent.type(input, 'bad');
    await userEvent.click(screen.getByRole('button', { name: t.addButton }));
    expect(screen.getByText(t.errorBadDomain)).toBeTruthy();
    // Typing one more character clears the error (onChange of the input resets it).
    await userEvent.type(input, 'x');
    expect(screen.queryByText(t.errorBadDomain)).toBeNull();
  });
});
