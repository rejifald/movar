import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultSettings } from '@movar/settings';
import type { MovarSettings } from '@movar/settings';
import { SettingsTab } from './SettingsTab';
import type { SettingsSource } from '../bridge';
import { messagesEn } from '../i18n/messages-en';

afterEach(() => {
  cleanup();
});

/** An in-memory {@link SettingsSource} fake — the Phase-C test seam. `read`
 *  resolves the seeded settings; `write` records every persisted value so a
 *  test can assert what the tab pushed. */
function fakeSource(initial: MovarSettings): {
  source: SettingsSource;
  writes: MovarSettings[];
} {
  const writes: MovarSettings[] = [];
  let current = initial;
  return {
    writes,
    source: {
      // `await` a resolved microtask so these read as genuinely async ports
      // (the real bridge round-trips through `callNative`), satisfying both the
      // async-must-await and promise-returning-must-be-async lint rules.
      read: async () => {
        await Promise.resolve();
        return current;
      },
      write: async (next) => {
        await Promise.resolve();
        current = next;
        writes.push(next);
      },
    },
  };
}

/** Render the tab and wait for `read()` to resolve (the panel is `null` until
 *  then). Returns the fake so the test can inspect writes. */
async function renderSettled(initial: MovarSettings) {
  const fake = fakeSource(initial);
  render(<SettingsTab source={fake.source} />);
  // The master switch only appears once the panel reveals.
  await screen.findByRole('switch', { name: messagesEn.settings.enabledLabel });
  return fake;
}

describe('SettingsTab — load gating', () => {
  it('renders nothing until source.read() resolves (no flash of defaults)', () => {
    // A read that never resolves during the test — the tab must stay empty.
    // Built with `vi.fn().mockReturnValue(pending)` so the never-resolving
    // promise is forwarded without a hand-rolled async forwarder (which the
    // promise-async / return-await lint rules disallow).
    let resolveRead!: (value: MovarSettings) => void;
    const pending = new Promise<MovarSettings>((resolve) => {
      resolveRead = resolve;
    });
    const source: SettingsSource = {
      read: vi.fn<SettingsSource['read']>().mockReturnValue(pending),
      // `write` is never invoked in this test (no change is made); a bare mock
      // satisfies the port type.
      write: vi.fn<SettingsSource['write']>(),
    };
    const { container } = render(<SettingsTab source={source} />);
    // Pre-read: the tab is empty.
    expect(container.querySelector('.panel')).toBeNull();
    expect(resolveRead).toBeTypeOf('function');
  });

  it('reads settings from the source on mount', async () => {
    const fake = fakeSource(defaultSettings);
    const readSpy = vi.spyOn(fake.source, 'read');
    render(<SettingsTab source={fake.source} />);
    await screen.findByRole('switch', { name: messagesEn.settings.enabledLabel });
    expect(readSpy).toHaveBeenCalledTimes(1);
  });
});

describe('SettingsTab — the "Movar enabled" master switch', () => {
  it('reflects settings.enabled = true', async () => {
    await renderSettled({ ...defaultSettings, enabled: true });
    const master = screen.getByRole('switch', { name: messagesEn.settings.enabledLabel });
    expect((master as HTMLInputElement).checked).toBe(true);
  });

  it('reflects settings.enabled = false', async () => {
    await renderSettled({ ...defaultSettings, enabled: false });
    const master = screen.getByRole('switch', { name: messagesEn.settings.enabledLabel });
    expect((master as HTMLInputElement).checked).toBe(false);
  });

  it('writes the toggled value through the source on change', async () => {
    const fake = await renderSettled({ ...defaultSettings, enabled: true });
    const master = screen.getByRole('switch', { name: messagesEn.settings.enabledLabel });

    master.click();

    await waitFor(() => {
      expect(fake.writes.at(-1)?.enabled).toBe(false);
    });
  });

  it('shows the host master-switch label + help (host catalogue, not @movar/i18n)', async () => {
    await renderSettled(defaultSettings);
    expect(screen.getByText(messagesEn.settings.enabledLabel)).toBeTruthy();
    expect(screen.getByText(messagesEn.settings.enabledHelp)).toBeTruthy();
  });
});

describe('SettingsTab — composed @movar/options-ui sections', () => {
  it('renders the priority, page-content, and allowlist sections', async () => {
    await renderSettled(defaultSettings);
    // Section headings come from @movar/i18n (English here). Priority + content
    // + allowlist are present; their exact copy is owned by the shared package,
    // so assert by role-count rather than brittle strings: ≥2 switches (master +
    // content toggle), an ordered list (priority), and the allowlist add form.
    expect(screen.getAllByRole('switch').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByRole('list')).toBeTruthy(); // priority <ol>
    expect(screen.getByRole('textbox')).toBeTruthy(); // allowlist add input
  });

  it('renders the "how priority works" note (restored from the extension options page)', async () => {
    await renderSettled(defaultSettings);
    // The aside's copy is owned by @movar/i18n (asserted in its own suite), so
    // check the host wiring: the note block renders with non-empty content.
    const note = document.querySelector('.sec-note');
    expect(note).toBeTruthy();
    expect((note?.textContent ?? '').length).toBeGreaterThan(0);
  });

  it('persists a section change (priority reorder) through the source', async () => {
    // Seed a two-language priority so the first item has an enabled "move down".
    const fake = await renderSettled({ ...defaultSettings, priority: ['uk', 'en'] });
    // The shared PrioritySection renders ↓/↑ move buttons; clicking the first
    // "move down" reorders and writes.
    const moveDown = screen
      .getAllByRole('button')
      .find((b) => b.getAttribute('aria-label')?.toLowerCase().includes('down') ?? false);
    expect(moveDown).toBeTruthy();
    moveDown!.click();
    await waitFor(() => {
      expect(fake.writes.at(-1)?.priority).toEqual(['en', 'uk']);
    });
  });
});

describe('SettingsTab — no blocked-language UI', () => {
  it('renders neither the locked-language note nor the full BlockedSection', async () => {
    await renderSettled(defaultSettings);
    // The "Russian is always blocked" note was removed — Russian stays blocked
    // by the `enforceLockedLanguages` invariant in the settings port, with no
    // on-screen affordance.
    expect(document.querySelector('.locked-note')).toBeNull();
    // BlockedSection (the add/remove blocked-language UI) is likewise omitted —
    // no "add blocked" control leaks in.
    expect(screen.queryByRole('button', { name: /blocked/i })).toBeNull();
  });
});

describe('SettingsTab — omitted UI-language picker', () => {
  it('does not render a LanguageSelector (locale follows the device)', async () => {
    await renderSettled(defaultSettings);
    // The host Settings tab omits the UI-language picker. (A `<select>` *does*
    // exist — the shared PrioritySection's "add language" picker — so absence is
    // asserted by the LanguageSelector's own accessible name, not by "no
    // combobox at all".) Its sr-only label is `languageSelector.label`
    // ("Language"); no combobox carries that name here.
    expect(screen.queryByRole('combobox', { name: 'Language' })).toBeNull();
    // And its tell-tale "Auto" UI-language option is absent.
    expect(screen.queryByRole('option', { name: /auto/i })).toBeNull();
  });
});
