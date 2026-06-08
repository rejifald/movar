import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { defaultSettings } from '@movar/settings';
import type { MovarSettings } from '@movar/settings';
import { messagesEn } from '../../lib/i18n/messages-en';
import { displayLanguage } from './shared';
import { PrioritySection } from './PrioritySection';

afterEach(cleanup);

const t = messagesEn.options.priority;
// Default (English) render → aria-labels use the 'en' locale name.
const enName = (code: string): string => displayLanguage(code, 'en');

function withPriority(priority: MovarSettings['priority']): MovarSettings {
  return { ...defaultSettings, priority };
}

describe('PrioritySection', () => {
  it('renders the priority list in order, numbered from 1', () => {
    render(<PrioritySection settings={withPriority(['uk', 'en'])} onChange={vi.fn()} />);
    const items = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    // Each row leads with its 1-based rank — map over the rows (no indexing into
    // a possibly-undefined element); textContent is a non-null string here, so
    // it reads cleanly under both the type-checker and the linter.
    expect(items.map((li) => li.textContent.charAt(0))).toEqual(['1', '2']);
  });

  it('disables move-up on the first row and move-down on the last row', () => {
    render(<PrioritySection settings={withPriority(['uk', 'en'])} onChange={vi.fn()} />);
    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: t.moveUp(enName('uk')) }).disabled,
    ).toBe(true);
    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: t.moveDown(enName('en')) }).disabled,
    ).toBe(true);
  });

  it('moves a language down, persisting the reordered list', async () => {
    const onChange = vi.fn();
    render(<PrioritySection settings={withPriority(['uk', 'en'])} onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: t.moveDown(enName('uk')) }));
    expect(onChange.mock.calls[0]![0].priority).toEqual(['en', 'uk']);
  });

  it('moves a language up, persisting the reordered list', async () => {
    const onChange = vi.fn();
    render(<PrioritySection settings={withPriority(['uk', 'en'])} onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: t.moveUp(enName('en')) }));
    expect(onChange.mock.calls[0]![0].priority).toEqual(['en', 'uk']);
  });

  it('removes a non-last-remaining language, persisting the filtered list', async () => {
    const onChange = vi.fn();
    render(<PrioritySection settings={withPriority(['uk', 'en'])} onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: t.remove(enName('uk')) }));
    expect(onChange.mock.calls[0]![0].priority).toEqual(['en']);
  });

  it('disables remove on the sole remaining language (the >1 invariant)', async () => {
    const onChange = vi.fn();
    render(<PrioritySection settings={withPriority(['uk'])} onChange={onChange} />);
    const removeBtn = screen.getByRole<HTMLButtonElement>('button', {
      name: t.remove(enName('uk')),
    });
    expect(removeBtn.disabled).toBe(true);
    // Even forcing a click is a no-op — the guard short-circuits.
    await userEvent.click(removeBtn);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('marks the first row as primary (accent surface) and not the rest', () => {
    render(<PrioritySection settings={withPriority(['uk', 'en'])} onChange={vi.fn()} />);
    const items = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(items[0]!.className).toContain('bg-accent-surface');
    expect(items[1]!.className).not.toContain('bg-accent-surface');
  });

  it('adds a language picked from the add picker, appended to the end', async () => {
    const onChange = vi.fn();
    render(<PrioritySection settings={withPriority(['uk', 'en'])} onChange={onChange} />);
    await userEvent.selectOptions(screen.getByRole('combobox', { name: t.addLabel }), 'de');
    await userEvent.click(screen.getByRole('button', { name: t.addLabel }));
    expect(onChange.mock.calls[0]![0].priority).toEqual(['uk', 'en', 'de']);
  });

  it('never offers the locked language (Russian) in the add picker', () => {
    render(<PrioritySection settings={withPriority(['uk', 'en'])} onChange={vi.fn()} />);
    // Russian is locked-blocked → excluded from `addable`.
    expect(screen.queryByRole('option', { name: `${enName('ru')} (ru)` })).toBeNull();
    // …while a regular language is offered.
    expect(screen.getByRole('option', { name: `${enName('de')} (de)` })).toBeTruthy();
  });

  it('hides the add picker once every addable (non-locked) language is in the list', () => {
    // All supported languages except locked 'ru' → addable is empty → no picker.
    render(
      <PrioritySection
        settings={withPriority(['uk', 'en', 'de', 'fr', 'es', 'it', 'pl'])}
        onChange={vi.fn()}
      />,
    );
    expect(screen.queryByRole('combobox', { name: t.addLabel })).toBeNull();
  });
});
