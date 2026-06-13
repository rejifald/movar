import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { fakeBrowser } from 'wxt/testing';
import { browser } from 'wxt/browser';
import { defaultSettings } from '@movar/settings';
import type { MovarSettings } from '@movar/settings';
import { I18nProvider } from '../../lib/i18n';
import { messagesEn } from '../../lib/i18n/messages-en';
import { SettingsImportExport } from './SettingsImportExport';

const io = messagesEn.options.io;

function renderIo(onImport: (s: MovarSettings) => void = vi.fn()) {
  render(
    <I18nProvider uiLanguage="en">
      <SettingsImportExport onImport={onImport} />
    </I18nProvider>,
  );
  return onImport;
}

function fileInput(): HTMLInputElement {
  return document.querySelector<HTMLInputElement>('input[type="file"]')!;
}

function dropFile(contents: string): void {
  const file = new File([contents], 'movar-settings.json', { type: 'application/json' });
  fireEvent.change(fileInput(), { target: { files: [file] } });
}

beforeEach(() => {
  fakeBrowser.reset();
  vi.spyOn(browser.i18n, 'getUILanguage').mockReturnValue('en');
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('SettingsImportExport — export', () => {
  it('downloads a JSON blob of the current stored settings', async () => {
    await fakeBrowser.storage.sync.set({
      settings: { ...defaultSettings, priority: ['en', 'uk'] },
    });
    let captured: Blob | null = null;
    vi.spyOn(URL, 'createObjectURL').mockImplementation((blob) => {
      captured = blob as Blob;
      return 'blob:movar';
    });
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    renderIo();
    fireEvent.click(screen.getByText(io.export));

    await waitFor(() => {
      expect(captured).not.toBeNull();
    });
    const parsed = JSON.parse(await captured!.text()) as MovarSettings;
    expect(parsed.priority).toEqual(['en', 'uk']);
  });
});

describe('SettingsImportExport — import', () => {
  it('applies a valid imported file via onImport', async () => {
    const onImport = renderIo();
    dropFile(JSON.stringify({ ...defaultSettings, priority: ['de', 'en'] }));

    await waitFor(() => {
      expect(onImport).toHaveBeenCalled();
    });
    expect((onImport as ReturnType<typeof vi.fn>).mock.calls[0]![0].priority).toEqual(['de', 'en']);
  });

  it('corrects a locked-language violation before applying', async () => {
    const onImport = renderIo();
    dropFile(JSON.stringify({ ...defaultSettings, priority: ['ru', 'uk'], blocked: [] }));

    await waitFor(() => {
      expect(onImport).toHaveBeenCalled();
    });
    const applied = (onImport as ReturnType<typeof vi.fn>).mock.calls[0]![0] as MovarSettings;
    expect(applied.blocked).toContain('ru');
    expect(applied.priority).not.toContain('ru');
  });

  it('rejects malformed JSON with a localized error and does not apply', async () => {
    const onImport = renderIo();
    dropFile('{ not valid json');

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toBe(io.importError);
    });
    expect(onImport).not.toHaveBeenCalled();
  });
});
