import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockInstance } from 'vitest';
import { browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing';
import { defaultSettings } from '@movar/settings';
import type { MovarSettings } from '@movar/settings';
import type { SnippetVerdict } from '@movar/lang-detect';
import { findLanguagePickers } from '@movar/lang-pickers/extract';
import { ORIGINAL_TEXT_ATTR, RESTORED_ATTR, TEXT_DIVIDER_KIND } from '@movar/lang-pickers/types';
import type { PageContentModel } from '@movar/page-content/types';
import { YOUTUBE_EXTRACTOR } from '@movar/page-content/youtube';
import {
  applyContentModification,
  revealAllContent,
  teardownContentModification,
} from './content-modification';
import { createContentPresenter } from '../dynamic/features/curtain-ui';
import type { ProvisionedContentPresenter } from '../dynamic/features/curtain-ui';
import { detachAllCurtains } from './curtain';
import { detachAllTooltips } from './tooltip';

// Stable marker strings this module sweeps; kept local so the assertions read
// independently of the production source's private constants.
const HIDDEN_ATTR = 'data-movar-hidden';
const BLURRED_ATTR = 'data-movar-content-blurred';
const REVEALED_ATTR = 'data-movar-revealed';
const CURTAIN_ATTR = 'data-movar-curtain';
const COLOR_SCHEME_ATTR = 'data-movar-color-scheme';

function settingsWith(overrides: Partial<MovarSettings> = {}): MovarSettings {
  return { ...defaultSettings, blocked: ['ru'], priority: ['uk', 'en'], ...overrides };
}

function youtubeModel(): PageContentModel {
  return YOUTUBE_EXTRACTOR.extract(document);
}

async function testPresenter(): Promise<ProvisionedContentPresenter> {
  return createContentPresenter({ host: 'www.youtube.com', locale: 'en' });
}

/** Spy on runtime.sendMessage as a loose mock. wxt's fake-browser types
 *  sendMessage as `Promise<void>`, but the background worker actually replies
 *  with classifier verdicts — so we widen the spy to mock a real reply. */
function spySendMessage(): MockInstance<(message: unknown) => Promise<unknown>> {
  return vi.spyOn(browser.runtime, 'sendMessage');
}

/** The classifier runs in the background worker; the content bridge messages
 *  it via runtime.sendMessage. We stub that boundary so the verdict is
 *  deterministic and no real worker is needed. */
function stubClassifier(verdicts: (SnippetVerdict | null)[]): void {
  spySendMessage().mockResolvedValue(verdicts);
}

/** A YouTube search-result card the extractor recognises (title + channel). */
function ytCard(title: string, channel = ''): string {
  return `
    <ytd-video-renderer>
      <a id="video-title">${title}</a>
      <ytd-channel-name><div id="text"><a>${channel}</a></div></ytd-channel-name>
    </ytd-video-renderer>
  `;
}

beforeEach(() => {
  fakeBrowser.reset();
  document.body.innerHTML = '';
});

afterEach(() => {
  // Sweep any curtain/tooltip the apply path attached so it doesn't leak into
  // the next test's document (test-setup.ts also does this defensively).
  teardownContentModification();
  detachAllTooltips();
  detachAllCurtains();
  vi.restoreAllMocks();
});

// ─── applyContentModification — picker path ───────────────────────────────

describe('applyContentModification — language pickers', () => {
  it('strips a blocked-language link and records one correction per hidden language', async () => {
    document.body.innerHTML = `
      <div id="picker">
        <a id="ua" href="/ua/x">UA</a>
        <a id="en" href="/en/x">EN</a>
        <a id="ru" href="/ru/x">RU</a>
      </div>`;
    const corrections = await applyContentModification({
      settings: settingsWith(),
      pageLang: 'uk',
      target: 'uk',
      pickers: findLanguagePickers(),
      model: null,
    });

    // RU stripped; the kept languages stay visible (blocked-only semantics:
    // languages outside priority but unblocked are tolerated, not curtained).
    expect(document.querySelector<HTMLElement>('#ru')!.style.display).toBe('none');
    expect(document.querySelector<HTMLElement>('#ua')!.style.display).toBe('');
    expect(document.querySelector<HTMLElement>('#en')!.style.display).toBe('');
    // Exactly one correction (ru → preferred lang); the 'dom' mechanism is
    // stamped by the orchestrator when it batch-logs the returned corrections.
    expect(corrections).toEqual([{ fromLang: 'ru', toLang: 'uk' }]);
  });

  it('records each distinct hidden language once, not once per link', async () => {
    // Two RU anchors plus a DE one in the same picker. Even though two links
    // carry ru, the per-language Set dedup means a single ru correction.
    document.body.innerHTML = `
      <div id="picker">
        <a id="ua" href="/ua/x">UA</a>
        <a id="ru1" href="/ru/x">RU</a>
        <a id="ru2" href="/ru/y">Русский</a>
        <a id="de" href="/de/x">DE</a>
      </div>`;
    const corrections = await applyContentModification({
      settings: settingsWith({ blocked: ['ru', 'de'] }),
      pageLang: 'uk',
      target: 'uk',
      pickers: findLanguagePickers(),
      model: null,
    });
    const hiddenLangs = corrections.map((c) => c.fromLang).toSorted((a, b) => a.localeCompare(b));
    expect(hiddenLangs).toEqual(['de', 'ru']);
  });

  it('falls back to pageLang for the correction target when no explicit target is set', async () => {
    document.body.innerHTML = `
      <div id="picker"><a id="ua" href="/ua/x">UA</a><a id="ru" href="/ru/x">RU</a></div>`;
    const corrections = await applyContentModification({
      settings: settingsWith(),
      pageLang: 'uk',
      target: undefined, // no resolved target this tick
      pickers: findLanguagePickers(),
      model: null,
    });
    expect(corrections).toContainEqual({ fromLang: 'ru', toLang: 'uk' });
  });

  it('uses an empty-string target when neither target nor pageLang is known', async () => {
    document.body.innerHTML = `
      <div id="picker"><a id="ua" href="/ua/x">UA</a><a id="ru" href="/ru/x">RU</a></div>`;
    const corrections = await applyContentModification({
      settings: settingsWith(),
      pageLang: null,
      target: undefined,
      pickers: findLanguagePickers(),
      model: null,
    });
    expect(corrections).toContainEqual({ fromLang: 'ru', toLang: '' });
  });

  it('is a no-op when there are no pickers (records nothing)', async () => {
    const corrections = await applyContentModification({
      settings: settingsWith(),
      pageLang: 'uk',
      target: 'uk',
      pickers: [],
      model: null,
    });
    expect(corrections).toEqual([]);
  });

  it('records nothing when the picker holds no blocked-language links', async () => {
    // Only UA + EN present; with ru blocked there is nothing to strip.
    document.body.innerHTML = `
      <div id="picker"><a id="ua" href="/ua/x">UA</a><a id="en" href="/en/x">EN</a></div>`;
    const corrections = await applyContentModification({
      settings: settingsWith(),
      pageLang: 'uk',
      target: 'uk',
      pickers: findLanguagePickers(),
      model: null,
    });
    expect(corrections).toEqual([]);
    expect(document.querySelector<HTMLElement>('#ua')!.style.display).toBe('');
  });
});

// ─── applyContentModification — content-card path ─────────────────────────

describe('applyContentModification — content cards', () => {
  it('gates the content filter to profiled codes — a profile-less target (de) is not over-concealed (#125)', async () => {
    // A Latin diaspora target (`de`) in priority: the redirect layer is
    // multi-target, but the detector ships no `de` profile, so the content
    // filter must NOT treat German as a recognizable language — else a German
    // card could be over-concealed. The card classifies as nothing among the
    // (Cyrillic) candidates → null verdict → stays visible.
    document.body.innerHTML = ytCard('Ein deutscher Titel über Softwaretests');
    const send = spySendMessage().mockResolvedValue([null]);

    const corrections = await applyContentModification({
      settings: settingsWith({ priority: ['uk', 'de'], blocked: ['ru'], concealMode: 'hide' }),
      pageLang: 'uk',
      target: 'uk',
      pickers: [],
      model: youtubeModel(),
    });

    // The worker classify request carries only PROFILED candidate codes — `de`
    // (no shipped profile) is dropped; `ru` (blocked) and `uk` stay.
    const classifyCall = send.mock.calls.find(
      ([m]) => (m as { type?: string }).type === 'movar:classifySnippets',
    );
    expect(classifyCall).toBeDefined();
    const { candidateCodes } = classifyCall![0] as { candidateCodes: string[] };
    expect(candidateCodes).not.toContain('de');
    expect(candidateCodes).toContain('ru');
    expect(candidateCodes).toContain('uk');

    // The German card is left visible — neither blurred nor hard-hidden.
    const card = document.querySelector<HTMLElement>('ytd-video-renderer')!;
    expect(card.getAttribute(BLURRED_ATTR)).toBeNull();
    expect(card.getAttribute(HIDDEN_ATTR)).toBeNull();
    expect(corrections).toEqual([]);
  });

  it('blurs a Russian YouTube card and records a content correction', async () => {
    const presenter = await testPresenter();
    try {
      document.body.innerHTML = ytCard('Всё, что нужно знать о тестировании');
      stubClassifier([{ language: 'ru', margin: 1, rung: 1, discriminating: true }]);
      const corrections = await applyContentModification({
        settings: settingsWith(),
        pageLang: 'uk',
        target: 'uk',
        pickers: [],
        model: youtubeModel(),
        presenter,
      });
      const card = document.querySelector<HTMLElement>('ytd-video-renderer')!;
      expect(card.getAttribute(BLURRED_ATTR)).toBe('ru');
      expect(card.querySelector(`[${CURTAIN_ATTR}]`)).not.toBeNull();
      expect(corrections).toContainEqual({ fromLang: 'ru', toLang: 'uk' });
    } finally {
      presenter.teardown();
    }
  });

  it('hard-hides in hide mode and escalates cards curtained on an earlier pass', async () => {
    const presenter = await testPresenter();
    try {
      document.body.innerHTML = ytCard('Всё, что нужно знать о тестировании');
      spySendMessage()
        .mockResolvedValueOnce([{ language: 'ru', margin: 1, rung: 1 }])
        .mockResolvedValueOnce([{ language: 'ru', margin: 1, rung: 1 }]);

      await applyContentModification({
        settings: settingsWith({ concealMode: 'curtain' }),
        pageLang: 'uk',
        target: 'uk',
        pickers: [],
        model: youtubeModel(),
        presenter,
      });
      const first = document.querySelector<HTMLElement>('ytd-video-renderer')!;
      expect(first.getAttribute(BLURRED_ATTR)).toBe('ru');
      expect(first.querySelector(`[${CURTAIN_ATTR}]`)).not.toBeNull();

      document.body.insertAdjacentHTML('beforeend', ytCard('Ещё один русский тест'));
      const corrections = await applyContentModification({
        settings: settingsWith({ concealMode: 'hide' }),
        pageLang: 'uk',
        target: 'uk',
        pickers: [],
        model: youtubeModel(),
        cleanupPresenter: presenter,
      });
      const cards = [...document.querySelectorAll<HTMLElement>('ytd-video-renderer')];

      expect(cards[0]!.hasAttribute(BLURRED_ATTR)).toBe(false);
      expect(cards[0]!.getAttribute(HIDDEN_ATTR)).toBe('content-filter:escalated:ru');
      expect(cards[0]!.style.display).toBe('none');
      expect(cards[1]!.getAttribute(HIDDEN_ATTR)?.startsWith('content-filter:')).toBe(true);
      expect(cards[1]!.style.display).toBe('none');
      expect(document.querySelector(`[${CURTAIN_ATTR}]`)).toBeNull();
      expect(corrections).toEqual([{ fromLang: 'ru', toLang: 'uk' }]);
    } finally {
      presenter.teardown();
    }
  });

  it('does nothing on a host with no registered content extractor', async () => {
    // A null injected model means no site extractor matched, so the content path
    // bails before ever messaging the worker.
    document.body.innerHTML = ytCard('Всё, что нужно знать о тестировании');
    const send = vi.spyOn(browser.runtime, 'sendMessage');
    const corrections = await applyContentModification({
      settings: settingsWith(),
      pageLang: 'uk',
      target: 'uk',
      pickers: [],
      model: null,
    });
    expect(send).not.toHaveBeenCalled();
    expect(corrections).toEqual([]);
  });

  it('does nothing when nothing is blocked (empty blocked list short-circuits)', async () => {
    document.body.innerHTML = ytCard('Всё, что нужно знать о тестировании');
    const send = vi.spyOn(browser.runtime, 'sendMessage');
    const corrections = await applyContentModification({
      settings: settingsWith({ blocked: [] }),
      pageLang: 'uk',
      target: 'uk',
      pickers: [],
      model: youtubeModel(),
    });
    // blocked.length === 0 → the content filter is never engaged.
    expect(send).not.toHaveBeenCalled();
    expect(document.querySelector(`[${BLURRED_ATTR}]`)).toBeNull();
    expect(corrections).toEqual([]);
  });

  it('keeps a Ukrainian card (classifier abstains for non-blocked languages)', async () => {
    const presenter = await testPresenter();
    try {
      document.body.innerHTML = ytCard('Як зробити тест українською мовою');
      // uk is enabled, so even a confident uk verdict means "keep".
      stubClassifier([{ language: 'uk', margin: 1, rung: 1, discriminating: true }]);
      const corrections = await applyContentModification({
        settings: settingsWith(),
        pageLang: 'uk',
        target: 'uk',
        pickers: [],
        model: youtubeModel(),
        presenter,
      });
      expect(document.querySelector(`[${BLURRED_ATTR}]`)).toBeNull();
      expect(corrections).toEqual([]);
    } finally {
      presenter.teardown();
    }
  });
});

// ─── teardownContentModification ──────────────────────────────────────────

describe('teardownContentModification', () => {
  it('removes a blur curtain attached by the content path', async () => {
    const presenter = await testPresenter();
    try {
      document.body.innerHTML = ytCard('Всё, что нужно знать о тестировании');
      spySendMessage().mockResolvedValue([{ language: 'ru', margin: 1, rung: 1 }]);
      await applyContentModification({
        settings: settingsWith(),
        pageLang: 'uk',
        target: 'uk',
        pickers: [],
        model: youtubeModel(),
        presenter,
      });
      const card = document.querySelector<HTMLElement>('ytd-video-renderer')!;
      expect(card.hasAttribute(BLURRED_ATTR)).toBe(true);

      teardownContentModification(presenter);

      // Curtain detached and the blurred marker swept — but NOT marked revealed
      // (teardown is "undo what we did", not "user opted in").
      expect(card.querySelector(`[${CURTAIN_ATTR}]`)).toBeNull();
      expect(card.hasAttribute(BLURRED_ATTR)).toBe(false);
      expect(card.hasAttribute(REVEALED_ATTR)).toBe(false);
    } finally {
      presenter.teardown();
    }
  });

  it('un-hides a display:none link and restores HTMLOptionElement.hidden', () => {
    // Two HIDDEN_ATTR shapes the picker filter produces: an inline-styled link
    // and an <option hidden> inside a <select> switcher.
    document.body.innerHTML = `
      <a id="ru-link" ${HIDDEN_ATTR}="x" style="display: none;">RU</a>
      <select><option id="ru-opt" ${HIDDEN_ATTR}="x">Русский</option></select>`;
    const opt = document.querySelector<HTMLOptionElement>('#ru-opt')!;
    opt.hidden = true;

    teardownContentModification();

    const link = document.querySelector<HTMLElement>('#ru-link')!;
    expect(link.hasAttribute(HIDDEN_ATTR)).toBe(false);
    expect(link.style.display).toBe('');
    expect(opt.hasAttribute(HIDDEN_ATTR)).toBe(false);
    expect(opt.hidden).toBe(false);
  });

  it('restores in-place text mutations from ORIGINAL_TEXT_ATTR verbatim', () => {
    // trimOrphanSeparators rewrites a shared text node ("UA  |  " → "UA") and
    // stashes the original; teardown must put the verbatim text back.
    document.body.innerHTML = `<span id="label" ${ORIGINAL_TEXT_ATTR}="UA  |  ">UA</span>`;
    teardownContentModification();
    const label = document.querySelector<HTMLElement>('#label')!;
    expect(label.textContent).toBe('UA  |  ');
    expect(label.hasAttribute(ORIGINAL_TEXT_ATTR)).toBe(false);
  });

  it('replaces a text-divider marker span with the original separator text node', () => {
    // text-divider wrapper spans are structural — teardown swaps the whole
    // element back for a plain text node holding the original separator.
    document.body.innerHTML =
      `<div id="host"><span id="div" data-movar-kind="${TEXT_DIVIDER_KIND}" ` +
      `${ORIGINAL_TEXT_ATTR}=" | ">x</span></div>`;
    teardownContentModification();
    const host = document.querySelector<HTMLElement>('#host')!;
    // The span is gone, replaced by a text node carrying the separator.
    expect(host.querySelector('#div')).toBeNull();
    expect(host.textContent).toBe(' | ');
  });

  it('treats an empty stashed ORIGINAL_TEXT value as the original (restores to empty)', () => {
    // Edge of the restore branch: a present-but-empty marker is a real value
    // (the original text was ""), so teardown writes the empty string back and
    // strips the marker — it must not throw or skip the sweep.
    document.body.innerHTML = `<span id="label" ${ORIGINAL_TEXT_ATTR}="">UA</span>`;
    expect(() => {
      teardownContentModification();
    }).not.toThrow();
    const label = document.querySelector<HTMLElement>('#label')!;
    expect(label.textContent).toBe('');
    expect(label.hasAttribute(ORIGINAL_TEXT_ATTR)).toBe(false);
  });

  it('clears per-picker RESTORED_ATTR markers (global sweep outranks per-picker restore)', () => {
    document.body.innerHTML = `<div id="picker" ${RESTORED_ATTR}="true"></div>`;
    teardownContentModification();
    expect(document.querySelector<HTMLElement>('#picker')!.hasAttribute(RESTORED_ATTR)).toBe(false);
  });

  it('is a safe no-op on a pristine document (nothing concealed)', () => {
    document.body.innerHTML = `<div id="clean"><p>hello</p></div>`;
    const before = document.body.innerHTML;
    expect(() => {
      teardownContentModification();
    }).not.toThrow();
    expect(document.body.innerHTML).toBe(before);
  });
});

// ─── revealAllContent ─────────────────────────────────────────────────────

describe('revealAllContent', () => {
  it('marks every blurred card REVEALED before tearing the curtains down', () => {
    // Pre-seed two blurred cards (as the content filter would leave them).
    document.body.innerHTML = `
      <div id="a" ${BLURRED_ATTR}="ru"></div>
      <div id="b" ${BLURRED_ATTR}="ru"></div>`;
    revealAllContent();

    // Both cards now carry the explicit user-opt-in REVEALED marker (the key
    // difference from teardown), and the blurred marker is gone.
    expect(document.querySelectorAll(`[${REVEALED_ATTR}="true"]`)).toHaveLength(2);
    expect(document.querySelectorAll(`[${BLURRED_ATTR}]`)).toHaveLength(0);
  });

  it('leaves a REVEALED card untouched so a future filter pass skips it', () => {
    document.body.innerHTML = `<div id="a" ${REVEALED_ATTR}="true"></div>`;
    revealAllContent();
    expect(document.querySelector<HTMLElement>('#a')!.getAttribute(REVEALED_ATTR)).toBe('true');
  });
});

// ─── curtain presenter ────────────────────────────────────────────────────

describe('curtain presenter', () => {
  it('re-skins a live blur curtain to the new page color scheme', async () => {
    const presenter = await testPresenter();
    try {
      document.body.innerHTML = ytCard('Всё, что нужно знать о тестировании');
      spySendMessage().mockResolvedValue([{ language: 'ru', margin: 1, rung: 1 }]);
      await applyContentModification({
        settings: settingsWith(),
        pageLang: 'uk',
        target: 'uk',
        pickers: [],
        model: youtubeModel(),
        presenter,
      });
      const host = document.querySelector<HTMLElement>(`[${CURTAIN_ATTR}]`)!;

      presenter.setColorScheme('dark');
      expect(host.getAttribute(COLOR_SCHEME_ATTR)).toBe('dark');

      // A second sweep overwrites, proving it re-skins live (not just sets once).
      presenter.setColorScheme('light');
      expect(host.getAttribute(COLOR_SCHEME_ATTR)).toBe('light');
    } finally {
      presenter.teardown();
    }
  });

  it("uses the presenter's current color scheme for newly-attached curtains", async () => {
    const presenter = await testPresenter();
    try {
      presenter.setColorScheme('dark');
      document.body.innerHTML = ytCard('Всё, що потрібно знати про тестування');
      spySendMessage().mockResolvedValue([{ language: 'ru', margin: 1, rung: 1 }]);
      await applyContentModification({
        settings: settingsWith(),
        pageLang: 'uk',
        target: 'uk',
        pickers: [],
        model: youtubeModel(),
        presenter,
      });
      const host = document.querySelector<HTMLElement>(`[${CURTAIN_ATTR}]`)!;
      expect(host.getAttribute(COLOR_SCHEME_ATTR)).toBe('dark');
    } finally {
      presenter.teardown();
    }
  });
});
