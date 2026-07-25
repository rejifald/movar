import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { defaultSettings } from '@movar/settings';
import type { MovarSettings } from '@movar/settings';
import { messagesEn } from '@movar/i18n';
import { displayLanguage } from './shared';
import { PrioritySection } from './PrioritySection';

afterEach(cleanup);

const t = messagesEn.options.priority;
// Default (English) render → aria-labels use the 'en' locale name.
const enName = (code: string): string => displayLanguage(code, 'en');

function withPriority(priority: MovarSettings['priority']): MovarSettings {
  return { ...defaultSettings, priority };
}

/** Mirrors `App.update`: a real stateful `onChange` that actually re-renders
 *  `PrioritySection` with the new list, unlike the no-op `vi.fn()` used
 *  everywhere else in this file. The focus-restoration tests below need the
 *  list to genuinely reorder/shrink — that's the exact condition the
 *  no-op-onChange tests can't exercise (see #313: it's why the regression
 *  went uncovered). */
function StatefulPrioritySection({ initial }: Readonly<{ initial: MovarSettings['priority'] }>) {
  const [settings, setSettings] = useState(withPriority(initial));
  return <PrioritySection settings={settings} onChange={setSettings} />;
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

  it('supports a 3+ language list — reorder a middle entry and remove it (#125)', async () => {
    const onChange = vi.fn();
    // Three non-ru targets, including a Latin diaspora language (pl).
    render(<PrioritySection settings={withPriority(['pl', 'uk', 'en'])} onChange={onChange} />);
    expect(within(screen.getByRole('list')).getAllByRole('listitem')).toHaveLength(3);

    // The middle entry can move both ways (each click acts on the rendered list).
    await userEvent.click(screen.getByRole('button', { name: t.moveUp(enName('uk')) }));
    expect(onChange.mock.calls[0]![0].priority).toEqual(['uk', 'pl', 'en']);
    onChange.mockClear();
    await userEvent.click(screen.getByRole('button', { name: t.moveDown(enName('uk')) }));
    expect(onChange.mock.calls[0]![0].priority).toEqual(['pl', 'en', 'uk']);

    // And it can be removed (length 3 > 1, so the >1 guard allows it).
    onChange.mockClear();
    await userEvent.click(screen.getByRole('button', { name: t.remove(enName('uk')) }));
    expect(onChange.mock.calls[0]![0].priority).toEqual(['pl', 'en']);
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

  // #313 — keyboard focus was dropped to <body> whenever a move/remove
  // disabled or unmounted the very control the user had just activated. The
  // tests above all pass a no-op `onChange`, so the list never actually
  // re-renders and never exercises this path — these use `StatefulPrioritySection`
  // instead, which really applies the update (mirroring `App.update`).
  describe('keyboard focus restoration after move/remove (#313)', () => {
    it('promoting a row to the top moves focus to its still-enabled Move-down', async () => {
      render(<StatefulPrioritySection initial={['uk', 'en']} />);
      const moveUpEn = screen.getByRole('button', { name: t.moveUp(enName('en')) });
      moveUpEn.focus();

      await userEvent.click(moveUpEn);

      // 'en' is now row 0 — Move-up just disabled under the focused control,
      // which is exactly what used to blur focus to <body>.
      expect(document.activeElement).not.toBe(document.body);
      expect(document.activeElement).toBe(
        screen.getByRole('button', { name: t.moveDown(enName('en')) }),
      );
    });

    it('demoting a row to the bottom moves focus to its still-enabled Move-up', async () => {
      render(<StatefulPrioritySection initial={['uk', 'en']} />);
      const moveDownUk = screen.getByRole('button', { name: t.moveDown(enName('uk')) });
      moveDownUk.focus();

      await userEvent.click(moveDownUk);

      // 'uk' is now the last row — Move-down just disabled under the focused control.
      expect(document.activeElement).not.toBe(document.body);
      expect(document.activeElement).toBe(
        screen.getByRole('button', { name: t.moveUp(enName('uk')) }),
      );
    });

    it('removing a middle row moves focus to the remove button of the row that shifts into its slot', async () => {
      render(<StatefulPrioritySection initial={['pl', 'uk', 'en']} />);
      const removeUk = screen.getByRole('button', { name: t.remove(enName('uk')) });
      removeUk.focus();

      await userEvent.click(removeUk);

      // 'uk' (row 1) unmounts; 'en' (formerly row 2) shifts up into row 1.
      expect(document.activeElement).not.toBe(document.body);
      expect(document.activeElement).toBe(
        screen.getByRole('button', { name: t.remove(enName('en')) }),
      );
    });

    it('removing the last row moves focus to the previous row’s remove button', async () => {
      render(<StatefulPrioritySection initial={['pl', 'uk', 'en']} />);
      const removeEn = screen.getByRole('button', { name: t.remove(enName('en')) });
      removeEn.focus();

      await userEvent.click(removeEn);

      // 'en' (the last row) unmounts with nothing to shift into its slot, so
      // focus falls back to the new last row, 'uk'.
      expect(document.activeElement).not.toBe(document.body);
      expect(document.activeElement).toBe(
        screen.getByRole('button', { name: t.remove(enName('uk')) }),
      );
    });
  });
});
