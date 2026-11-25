import { afterEach, describe, expect, it, vi } from 'vitest';
import { findLanguagePickers } from '@movar/lang-pickers/extract';
import { filterPickers as filterPickersWithPresenter } from './picker-filter';
import { testContentPresenter } from './dom.test-utils';
import { detachAllCurtains } from './curtain';
import {
  setBody,
  setupTwoLanguagePicker,
  setupSelectPicker,
  expectEntryCurtained,
  getEntryCurtainHosts,
  getTooltipHosts,
  setupListboxPicker,
} from '@movar/lang-pickers/picker.test-utils';
import { filterWithTestPresenter as filterPickers } from './picker-filter.test-utils';

describe('filterPickers — a dropdown that opens without touching the DOM', () => {
  /** jsdom ships no ResizeObserver, so the slot watcher is never built unless
   *  one is installed — which is also why every other test in this file
   *  exercises the no-observer path for free. This fake makes it reachable and
   *  records what got observed, which is half the behaviour under test. */
  class FakeResizeObserver {
    static instances: FakeResizeObserver[] = [];
    readonly observed: Element[] = [];
    disconnected = false;
    constructor(readonly cb: () => void) {
      FakeResizeObserver.instances.push(this);
    }
    observe(el: Element): void {
      this.observed.push(el);
    }
    unobserve(el: Element): void {
      this.observed.splice(this.observed.indexOf(el), 1);
    }
    disconnect(): void {
      this.disconnected = true;
    }
  }

  function installFakeObserver(): typeof FakeResizeObserver {
    FakeResizeObserver.instances = [];
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    return FakeResizeObserver;
  }

  /** The module keeps ONE observer for the whole page and drops it when the last
   *  watcher goes, so a test that leaves a chip standing would hand the next one
   *  a live observer from a stubbed class that no longer exists. The page-wide
   *  sweep is what a real teardown runs, and it releases the watcher through the
   *  chip's own onDetach — so it is also the honest way to reset. */
  afterEach(() => {
    detachAllCurtains();
    vi.unstubAllGlobals();
  });

  /** The dropdown opens: every row gains a box, and NOTHING is added or removed
   *  — which is the whole problem, since childList is all the content script's
   *  page-wide observer watches. */
  function openDropdown(Fake: typeof FakeResizeObserver, px = 28): void {
    for (const row of document.querySelectorAll<HTMLElement>('li[role="option"]')) {
      Object.defineProperty(row, 'offsetHeight', { value: px, configurable: true });
    }
    Fake.instances[0]!.cb();
  }

  it('watches the picker container while a chip is standing', () => {
    const Fake = installFakeObserver();
    setupListboxPicker();

    filterPickers(findLanguagePickers(), ['uk', 'en'], { blocked: ['ru'] });

    expect(Fake.instances).toHaveLength(1);
    expect(Fake.instances[0]!.observed).toEqual([document.querySelector('#picker')]);
  });

  it('stops watching a container the site has removed', () => {
    // The watcher holds the container in a module-level Map, and a ResizeObserver
    // callback is the only thing that runs after an SPA drops the picker: nothing
    // else would ever notice. Without the disconnected arm the entry — and the
    // element it keys — stay reachable for the life of the page.
    const Fake = installFakeObserver();
    setupListboxPicker();
    filterPickers(findLanguagePickers(), ['uk', 'en'], { blocked: ['ru'] });
    const observer = Fake.instances[0]!;
    expect(observer.observed).toHaveLength(1);

    document.querySelector('#picker')!.remove();
    observer.cb();

    expect(observer.observed).toEqual([]);
    expect(observer.disconnected).toBe(true);
  });

  it('keeps the shared observer alive while another picker is still watched', () => {
    // One observer serves the whole page, so unwatching one container must not
    // disconnect the other's. Two list pickers, one removed.
    const Fake = installFakeObserver();
    setupListboxPicker();
    const second = document.createElement('div');
    second.innerHTML = document
      .querySelector('#picker')!
      .outerHTML.replace('id="picker"', 'id="picker-2"');
    document.body.append(second);
    filterPickers(findLanguagePickers(), ['uk', 'en'], { blocked: ['ru'] });
    const observer = Fake.instances[0]!;
    expect(observer.observed).toHaveLength(2);

    document.querySelector('#picker')!.remove();
    observer.cb();

    expect(observer.observed).toEqual([document.querySelector('#picker-2')]);
    expect(observer.disconnected).toBe(false);
  });

  it('re-floors the chip when the rows gain a box, with no second pass', () => {
    // The defect: the only page-wide re-apply triggers are a childList observer
    // and wxt:locationchange, and a `.dropdown-menu.show` class toggle is
    // neither. Measured in Chromium before this watcher: a 21px chip against
    // 28px rows, for the life of the page.
    const Fake = installFakeObserver();
    setupListboxPicker();
    filterPickers(findLanguagePickers(), ['uk', 'en'], { blocked: ['ru'] });
    expect(expectEntryCurtained('#opt-ru').style.minHeight).toBe('');

    openDropdown(Fake);

    expect(expectEntryCurtained('#opt-ru').style.minHeight).toBe('28px');
    // Rebuilt, not doubled — and still one chip after the observation that the
    // rebuild's own re-registration triggers.
    expect(getEntryCurtainHosts()).toHaveLength(1);
  });

  it('settles: a re-measure that changes nothing rebuilds nothing', () => {
    // The rebuild changes the container's height, which is another resize. The
    // key is what stops that becoming a loop.
    const Fake = installFakeObserver();
    setupListboxPicker();
    filterPickers(findLanguagePickers(), ['uk', 'en'], { blocked: ['ru'] });
    openDropdown(Fake);
    const settled = expectEntryCurtained('#opt-ru');

    Fake.instances[0]!.cb();

    expect(expectEntryCurtained('#opt-ru')).toBe(settled);
  });

  it('stops watching, and disconnects, once the page-wide sweep takes the chip', () => {
    // "Turn Movar off" detaches every curtain by resolving handles off the DOM;
    // it cannot reach this module's registries, so the watcher has to come down
    // from the chip's own onDetach or it survives the teardown.
    const Fake = installFakeObserver();
    setupListboxPicker();
    filterPickers(findLanguagePickers(), ['uk', 'en'], { blocked: ['ru'] });

    detachAllCurtains();

    expect(Fake.instances[0]!.observed).toEqual([]);
    expect(Fake.instances[0]!.disconnected).toBe(true);
  });

  it('installs no watcher when the presenter declines to mount', () => {
    const Fake = installFakeObserver();
    setupListboxPicker();

    filterPickersWithPresenter(
      findLanguagePickers(),
      ['uk', 'en'],
      { blocked: ['ru'] },
      { ...testContentPresenter, attachPickerEntryCurtain: () => null },
    );

    expect(Fake.instances).toHaveLength(0);
  });

  it('drops the chip of a row the site removed instead of re-attaching to nothing', () => {
    // The watcher is the one caller that can re-enter markHiddenEntries with a
    // `picker.links` snapshot older than the DOM it names. A replace-mode
    // curtain inserts itself BEFORE its target, so an entry whose parent is gone
    // is not a smaller chip — it is a throw, inside a ResizeObserver callback.
    const Fake = installFakeObserver();
    setupListboxPicker();
    filterPickers(findLanguagePickers(), ['uk', 'en'], { blocked: ['ru'] });
    document.querySelector<HTMLElement>('#opt-ru')!.remove();

    openDropdown(Fake);

    expect(getEntryCurtainHosts()).toHaveLength(0);
  });
});

describe('filterPickers — a locale change refreshes the copy', () => {
  it('rebuilds a surface whose words would now render differently', () => {
    // A locale-only settings change re-runs the filter with no teardown, so a
    // surface keyed only on the languages it names kept the old language's copy.
    setupTwoLanguagePicker();
    const enPresenter = { ...testContentPresenter, copyRevision: () => 'en' };
    const ukPresenter = { ...testContentPresenter, copyRevision: () => 'uk' };

    filterPickersWithPresenter(findLanguagePickers(), ['uk'], { blocked: ['ru'] }, enPresenter);
    const first = getTooltipHosts()[0]!;

    filterPickersWithPresenter(findLanguagePickers(), ['uk'], { blocked: ['ru'] }, ukPresenter);

    const hosts = getTooltipHosts();
    expect(hosts.length).toBeGreaterThan(0);
    expect(hosts[0]).not.toBe(first);
  });
});

describe('filterPickers — a presenter that declines to mount', () => {
  // Every attach method on ContentPresenter is declared `PresenterHandle | null`.
  // A presenter that is visible but returns null for a given surface must leave
  // the filter working and the bookkeeping empty, not half-registered.
  const decliningPresenter = {
    ...testContentPresenter,
    attachPickerEntryCurtain: () => null,
    pickerHiddenOptionLabel: () => 'Movar: hidden',
    attachPickerSurvivorTooltip: () => null,
  };

  it('still hides, and registers nothing, on a list picker', () => {
    setupListboxPicker();
    const result = filterPickersWithPresenter(
      findLanguagePickers(),
      ['uk', 'en'],
      { blocked: ['ru'] },
      decliningPresenter,
    );

    expect(result.hiddenLinks.map((l) => l.language)).toEqual(['ru']);
    expect(getEntryCurtainHosts()).toHaveLength(0);
  });

  it('still marks a native <select>, which needs nothing mounted', () => {
    // The sibling layouts degrade here: a presenter that declines to mount
    // leaves them hiding the entry with nothing to explain it. This one does
    // not depend on the curtain-UI chunk at all — its mark is a string of copy
    // and two DOM properties — so a declining presenter costs it nothing.
    setupSelectPicker();
    filterPickersWithPresenter(
      findLanguagePickers(),
      ['uk', 'en'],
      { blocked: ['ru'] },
      decliningPresenter,
    );

    const ru = document.querySelector<HTMLOptionElement>('option[value="ru"]')!;
    expect(ru.disabled).toBe(true);
    expect(ru.textContent).toBe('Movar: hidden');
    expect(document.querySelectorAll('[data-movar-curtain]')).toHaveLength(0);
  });

  it('still hides, and registers nothing, on an inline strip', () => {
    setupTwoLanguagePicker();
    filterPickersWithPresenter(
      findLanguagePickers(),
      ['uk'],
      { blocked: ['ru'] },
      decliningPresenter,
    );

    expect(document.querySelector<HTMLElement>('#ru')!.style.display).toBe('none');
    expect(getTooltipHosts()).toHaveLength(0);
  });
});

describe('restorePickerInPlace — a text-divider wrapper with no snapshot', () => {
  it('removes the wrapper rather than leaving a fake entry behind', () => {
    // trimContainerTextSeparators always records the original text, so a
    // wrapper without it is one a site re-render (or another extension) left
    // in the container. There is nothing to put back, so the structural span
    // goes — leaving it would strand a node the picker never rendered.
    setBody(`
      <div id="picker">
        <a id="ua" href="/ua/x">UA</a>
        <span data-movar-kind="text-divider">|</span>
        <a id="ru" href="/ru/x">RU</a>
        <a id="en" href="/en/x">EN</a>
      </div>
    `);
    filterPickers(findLanguagePickers(), ['uk', 'en'], { blocked: ['ru'] });
    const orphan = document.querySelector<HTMLElement>('[data-movar-kind="text-divider"]')!;
    expect(orphan.hasAttribute('data-movar-original-text')).toBe(false);

    getTooltipHosts()[0]!.shadowRoot!.querySelector<HTMLButtonElement>('.action')!.click();

    expect(document.querySelector('[data-movar-kind="text-divider"]')).toBeNull();
    expect(document.querySelector<HTMLElement>('#ru')!.style.display).toBe('');
  });
});
