import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';
import { browser } from 'wxt/browser';
import { getContentMessages, loadContentMessages, setContentLocale } from './content';
import { contentStringsUk } from './content-strings-uk';

/** fakeBrowser types sendMessage as `Promise<void>`; widen so we can stub a
 *  ContentStrings reply. */
function spySendMessage(): MockInstance<(message: unknown) => Promise<unknown>> {
  return vi.spyOn(browser.runtime, 'sendMessage');
}

afterEach(() => {
  // setContentLocale resets the module cache to the English fallback.
  setContentLocale('en');
  vi.restoreAllMocks();
});

describe('content i18n facade', () => {
  it('defaults to the bundled English curtain strings', () => {
    expect(getContentMessages().contentHidden.descriptionForLanguage('ru')).toBe('In Russian');
  });

  it('does not message the worker for English (it is the bundled fallback)', async () => {
    const send = spySendMessage();
    setContentLocale('en');
    await loadContentMessages();
    expect(send).not.toHaveBeenCalled();
    expect(getContentMessages().pickerHidden.show).toBe('Show');
  });

  it('fetches the active locale from the worker and caches it for sync reads', async () => {
    const send = spySendMessage().mockResolvedValue(contentStringsUk);
    setContentLocale('uk');
    await loadContentMessages();
    expect(send).toHaveBeenCalledWith({ type: 'movar:contentStrings', locale: 'uk' });
    expect(getContentMessages().pickerHidden.show).toBe('Показати');
    expect(getContentMessages().contentHidden.descriptionForLanguage('ru')).toBe(
      'Російською мовою',
    );
  });

  it('keeps the English fallback when the worker is unreachable', async () => {
    spySendMessage().mockRejectedValue(new Error('no receiver'));
    setContentLocale('uk');
    await loadContentMessages();
    expect(getContentMessages().pickerHidden.show).toBe('Show');
  });

  it('fetches at most once across repeated load calls (idempotent)', async () => {
    const send = spySendMessage().mockResolvedValue(contentStringsUk);
    setContentLocale('uk');
    await loadContentMessages();
    await loadContentMessages();
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('retries when the worker returns no catalogue payload', async () => {
    const send = spySendMessage()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(contentStringsUk);
    setContentLocale('uk');

    await loadContentMessages();
    expect(getContentMessages().pickerHidden.show).toBe('Show');

    await loadContentMessages();
    expect(send).toHaveBeenCalledTimes(2);
    expect(getContentMessages().pickerHidden.show).toBe('Показати');
  });
});
