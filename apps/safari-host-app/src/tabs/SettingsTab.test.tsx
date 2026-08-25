import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultSettings } from '@movar/settings';
import type { MovarSettings } from '@movar/settings';
import { messagesEn as sharedEn } from '@movar/i18n';
import { SettingsTab } from './SettingsTab';
import type { SettingsSource } from '../bridge';

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
  // The content-filtering switch only appears once the panel reveals. It took
  // over as the settle signal from the "Movar enabled" master switch, which the
  // tab no longer has — Safari's own extension settings are the system-provided
  // version of that control (see the component's header).
  await screen.findByRole('switch', { name: sharedEn.contentToggle.label });
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
    await screen.findByRole('switch', { name: sharedEn.contentToggle.label });
    expect(readSpy).toHaveBeenCalledTimes(1);
  });
});

describe('SettingsTab — no master switch', () => {
  it('renders no control that writes settings.enabled', async () => {
    const fake = await renderSettled({ ...defaultSettings, enabled: true });

    // Exactly one switch remains — content filtering. The "Movar enabled"
    // master switch is gone: Safari's own extension settings are the
    // system-provided version of it, and this tab was the only surface in the
    // whole product that could write `enabled: false` (the extension's single
    // live writer, the popup's off-state hero, only ever writes `true`).
    const switches = screen.getAllByRole('switch');
    expect(switches).toHaveLength(1);
    // …and it is the content-filtering one. Matched by accessible NAME rather
    // than by an attribute: the shared `Switch` names itself from an adjacent
    // label element, not from `aria-label`, so reading the attribute would
    // assert the absence of an implementation detail instead of the identity.
    expect(screen.getByRole('switch', { name: sharedEn.contentToggle.label })).toBe(switches[0]);

    // And no interaction on this tab can flip the stored flag. Clicking the one
    // switch there is writes `contentModification`, never `enabled`.
    switches[0]!.click();
    await waitFor(() => {
      expect(fake.writes.length).toBeGreaterThan(0);
    });
    expect(fake.writes.every((written) => written.enabled)).toBe(true);
  });
});

describe('SettingsTab — composed @movar/options-ui sections', () => {
  it('renders the priority, page-content, and allowlist sections', async () => {
    await renderSettled(defaultSettings);
    // Section headings come from @movar/i18n (English here). Priority + content
    // + allowlist are present; their exact copy is owned by the shared package,
    // so assert by role-count rather than brittle strings: the content-filtering
    // switch, an ordered list (priority), and the allowlist add form.
    expect(screen.getAllByRole('switch').length).toBeGreaterThanOrEqual(1);
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
  it('renders neither the locked-language note nor any block-list editing control', async () => {
    await renderSettled(defaultSettings);
    // The "Russian is always blocked" note was removed — Russian stays blocked
    // by the `enforceLockedLanguages` invariant in the settings port, with no
    // on-screen affordance.
    expect(document.querySelector('.locked-note')).toBeNull();
    // No block-list editing control leaks in either. Since #89 the list is derived
    // from `priority` and the `BlockedSection` component no longer exists anywhere.
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
