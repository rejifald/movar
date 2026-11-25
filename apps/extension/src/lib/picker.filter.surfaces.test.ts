import { describe, expect, it } from 'vitest';
import { findLanguagePickers } from '@movar/lang-pickers/extract';
import { filterPickers as filterPickersWithPresenter } from './picker-filter';
import {
  setBody,
  setupTwoLanguagePicker,
  setupSelectPicker,
  expectEntryCurtained,
  getMarkedOptions,
  getEntryCurtainHosts,
  getTooltipHosts,
  setupListboxPicker,
} from '@movar/lang-pickers/picker.test-utils';
import { filterWithTestPresenter as filterPickers } from './picker.filter.test-utils';

/** What a teardown does to the page: drop every injected host, leaving the
 *  module-level bookkeeping behind exactly as the real sweeps do. */
function sweepInjectedHosts(): void {
  for (const host of document.querySelectorAll('[data-movar-curtain], [data-movar-tooltip]')) {
    host.remove();
  }
  for (const el of document.querySelectorAll('[data-movar-restored]')) {
    el.removeAttribute('data-movar-restored');
  }
}

/** jsdom lays nothing out, so every offsetHeight is 0 and a measured row has to
 *  be declared. The numbers these tests use are the ones measured in Chromium on
 *  the e2e fixtures: 28px option rows, a 37px group header. */
function stubHeight(selector: string, px: number): void {
  Object.defineProperty(document.querySelector<HTMLElement>(selector)!, 'offsetHeight', {
    value: px,
    configurable: true,
  });
}

/** The grouped-listbox shape: a `role="presentation"` header as the FIRST child,
 *  the option rows under it. Heights are stubbed by the caller. */
function setupGroupedListbox(): void {
  setBody(`
    <div data-slot="popover">
      <ul id="picker" role="listbox">
        <li role="presentation" id="group-head">Популярні</li>
        <li role="option" id="opt-uk" value="uk">Українська</li>
        <li role="option" id="opt-ru" value="ru">Русский</li>
        <li role="option" id="opt-en" value="en">English</li>
      </ul>
    </div>
  `);
}

describe('filterPickers — list-shaped pickers get an in-row chip, never tooltips', () => {
  // The bigfive-test.com report: its language `<Select>` portals 42
  // `<li role="option">` rows into a dropdown, nine of which are languages
  // Movar classifies. The survivor tooltip attaches to EVERY survivor, so
  // hovering the list to read the options opened a panel over the rows around
  // the cursor — at a z-index above the site's own popover — and picking any
  // other language meant dodging eight of them.
  it('attaches no survivor tooltips to a listbox picker', () => {
    setupListboxPicker();
    filterPickers(findLanguagePickers(), ['uk', 'en'], { blocked: ['ru'] });
    expect(getTooltipHosts()).toHaveLength(0);
  });

  it('stands a chip in the hidden row instead, marked as Movar rather than as an option', () => {
    setupListboxPicker();
    filterPickers(findLanguagePickers(), ['uk', 'en'], { blocked: ['ru'] });

    const host = expectEntryCurtained('#opt-ru');
    expect(host.dataset['skin']).toBe('chip');
    // The row it replaces owned a full-width line, so the curtain takes the
    // whole slot rather than leaving most of the row blank.
    expect(host.dataset['block']).toBe('true');
    // The VISIBLE text names Movar, not the language: a row reading "русский"
    // among "Polish" and "Spanish" reads as an option to pick, and clicking it
    // restores rather than switches.
    const label = host.shadowRoot!.querySelector('.chip__label')?.textContent ?? '';
    expect(label).toBe('Movar: hidden');
    expect(label.toLowerCase()).not.toContain('русск');
    // The language it stands for survives in the hover / screen-reader copy.
    const described = host.shadowRoot!.querySelector('.chip')?.getAttribute('aria-label') ?? '';
    expect(described.toLowerCase()).toContain('русск');
    expect(host.getAttribute('title')?.toLowerCase()).toContain('русск');
    expect(getEntryCurtainHosts()).toHaveLength(1);
  });

  it('floors the chip at the row height, measured off a still-visible sibling', () => {
    // jsdom reports every offsetHeight as 0, so the sibling rows are given one.
    // The hidden row is deliberately NOT given one: the measurement has to come
    // from a sibling, since the entry's own box is gone by the time a chip goes
    // up (filterPickerLinks hides before cleanupSurvivingContainer marks).
    setupListboxPicker();
    for (const row of document.querySelectorAll<HTMLElement>('li[role="option"]')) {
      if (row.id === 'opt-ru') continue;
      Object.defineProperty(row, 'offsetHeight', { value: 28, configurable: true });
    }
    filterPickers(findLanguagePickers(), ['uk', 'en'], { blocked: ['ru'] });

    expect(expectEntryCurtained('#opt-ru').style.minHeight).toBe('28px');
  });

  it('sizes to its own content when no sibling can be measured', () => {
    // Every offsetHeight is 0 here (jsdom's default), which is also the real
    // case of a list rendered but not laid out. No floor beats a 0px one.
    setupListboxPicker();
    filterPickers(findLanguagePickers(), ['uk', 'en'], { blocked: ['ru'] });

    expect(expectEntryCurtained('#opt-ru').style.minHeight).toBe('');
  });

  it('leaves every surviving row untouched and clickable', () => {
    setupListboxPicker();
    filterPickers(findLanguagePickers(), ['uk', 'en'], { blocked: ['ru'] });
    for (const code of ['de', 'en', 'fr', 'uk']) {
      expect(document.querySelector<HTMLElement>(`#opt-${code}`)!.style.display).toBe('');
    }
  });

  it('restores the picker in place when the chip is clicked', () => {
    setupListboxPicker();
    filterPickers(findLanguagePickers(), ['uk', 'en'], { blocked: ['ru'] });

    const host = expectEntryCurtained('#opt-ru');
    host.shadowRoot!.querySelector<HTMLButtonElement>('button.chip')!.click();

    const entry = document.querySelector<HTMLElement>('#opt-ru')!;
    // Back to the site's own display value, not the `none !important` the chip
    // snapshotted when it took the slot.
    expect(entry.style.display).toBe('');
    expect(entry.hasAttribute('data-movar-hidden')).toBe(false);
    expect(getEntryCurtainHosts()).toHaveLength(0);
    expect(
      document.querySelector<HTMLElement>('#picker')!.hasAttribute('data-movar-restored'),
    ).toBe(true);
  });

  it('stays at one chip across MutationObserver re-fires', () => {
    setupListboxPicker();
    filterPickers(findLanguagePickers(), ['uk', 'en'], { blocked: ['ru'] });
    filterPickers(findLanguagePickers(), ['uk', 'en'], { blocked: ['ru'] });
    filterPickers(findLanguagePickers(), ['uk', 'en'], { blocked: ['ru'] });
    expect(getEntryCurtainHosts()).toHaveLength(1);
  });

  it('marks one chip per hidden LANGUAGE while hiding every regional duplicate', () => {
    setBody(`
      <div data-slot="popover">
        <ul id="picker" role="listbox">
          <li role="option" id="opt-uk" value="uk">Українська</li>
          <li role="option" id="opt-ru" value="ru-RU">Русский</li>
          <li role="option" id="opt-ru-ua" value="ru-UA">Русский (Украина)</li>
        </ul>
      </div>
    `);
    filterPickers(findLanguagePickers(), ['uk'], { blocked: ['ru'] });
    expect(getEntryCurtainHosts()).toHaveLength(1);
    expect(document.querySelector<HTMLElement>('#opt-ru')!.style.display).toBe('none');
    expect(document.querySelector<HTMLElement>('#opt-ru-ua')!.style.display).toBe('none');
  });

  it('still uses the survivor tooltip for an inline strip', () => {
    // The other shape keeps the old surface: a header strip's cleanup passes
    // close the gap completely, so there is no row left to mark.
    setBody(`
      <nav>
        <ul id="picker" class="lang-switcher">
          <li><a hreflang="ru" href="/ru/">Русский</a></li>
          <li><a hreflang="uk" href="/">Українська</a></li>
          <li><a hreflang="en" href="/en/">English</a></li>
        </ul>
      </nav>
    `);
    filterPickers(findLanguagePickers(), ['uk', 'en'], { blocked: ['ru'] });
    expect(getEntryCurtainHosts()).toHaveLength(0);
    expect(getTooltipHosts().length).toBeGreaterThan(0);
  });
});

describe('filterPickers — surfaces survive the sweeps that do not know about them', () => {
  // The page-wide sweeps (detachAllCurtains / detachAllTooltips) resolve handles
  // off the DOM and cannot reach picker-filter's module-level maps. Guards keyed
  // on presence alone therefore read "already marked" after a pause/resume,
  // settings toggle or "Show everything" — and attached nothing, re-hiding the
  // entry with no explanation and no way back.

  it('re-marks a list row after a sweep', () => {
    setupListboxPicker();
    filterPickers(findLanguagePickers(), ['uk', 'en'], { blocked: ['ru'] });
    expect(getEntryCurtainHosts()).toHaveLength(1);

    sweepInjectedHosts();
    filterPickers(findLanguagePickers(), ['uk', 'en'], { blocked: ['ru'] });

    expect(getEntryCurtainHosts()).toHaveLength(1);
  });

  it('survives a sweep on a native <select>, having no host to sweep', () => {
    // The sibling cases re-mark because the sweep resolves injected hosts off
    // the DOM and takes theirs down. This layout has no host at all — the mark
    // is the option's own label — so the sweep cannot reach it, and the
    // re-filter must not double-apply or re-snapshot.
    setupSelectPicker();
    filterPickers(findLanguagePickers(), ['uk', 'en'], { blocked: ['ru'] });
    expect(getMarkedOptions()).toHaveLength(1);

    sweepInjectedHosts();
    expect(getMarkedOptions()).toHaveLength(1);

    filterPickers(findLanguagePickers(), ['uk', 'en'], { blocked: ['ru'] });

    const ru = document.querySelector<HTMLOptionElement>('option[value="ru"]')!;
    expect(getMarkedOptions()).toHaveLength(1);
    expect(ru.getAttribute('data-movar-original-text')).toBe('Русский');
  });

  it('re-marks an inline strip after a sweep', () => {
    setupTwoLanguagePicker();
    filterPickers(findLanguagePickers(), ['uk'], { blocked: ['ru'] });
    expect(getTooltipHosts().length).toBeGreaterThan(0);

    sweepInjectedHosts();
    filterPickers(findLanguagePickers(), ['uk'], { blocked: ['ru'] });

    expect(getTooltipHosts().length).toBeGreaterThan(0);
  });
});

describe('filterPickers — a conceal-mode flip takes every surface with it', () => {
  // settings-reaction applies a bare concealMode change WITHOUT a teardown, so
  // the next pass simply runs with no presenter. Every mark path must treat that
  // as "remove what you put up", not as "nothing changed".

  it('drops the survivor tooltip when the presenter goes away', () => {
    setupTwoLanguagePicker();
    filterPickers(findLanguagePickers(), ['uk'], { blocked: ['ru'] });
    expect(getTooltipHosts().length).toBeGreaterThan(0);

    filterPickersWithPresenter(findLanguagePickers(), ['uk'], { blocked: ['ru'] });

    expect(getTooltipHosts()).toHaveLength(0);
  });

  it('drops the in-row chip when the presenter goes away', () => {
    setupListboxPicker();
    filterPickers(findLanguagePickers(), ['uk', 'en'], { blocked: ['ru'] });
    expect(getEntryCurtainHosts()).toHaveLength(1);

    filterPickersWithPresenter(findLanguagePickers(), ['uk', 'en'], { blocked: ['ru'] });

    expect(getEntryCurtainHosts()).toHaveLength(0);
  });

  it('drops the in-place option mark when the presenter goes away', () => {
    // Same contract as the in-row chip above: no visible presentation means no
    // explanation is owed, so the mark comes off and the option hides outright.
    setupSelectPicker();
    filterPickers(findLanguagePickers(), ['uk', 'en'], { blocked: ['ru'] });
    expect(getMarkedOptions()).toHaveLength(1);

    filterPickersWithPresenter(findLanguagePickers(), ['uk', 'en'], { blocked: ['ru'] });

    const ru = document.querySelector<HTMLOptionElement>('option[value="ru"]')!;
    expect(getMarkedOptions()).toHaveLength(0);
    expect(ru.textContent).toBe('Русский');
    expect(ru.disabled).toBe(false);
    expect(ru.hidden).toBe(true);
    // Still concealed, and still counted by the popup — only differently.
    expect(ru.getAttribute('data-movar-hidden')).toBe('not-in-priority');
  });
});

describe('filterPickers — a layout verdict that changes takes its old surface down', () => {
  it('removes inline-era tooltips once the picker reads as a list', () => {
    // react-aria stamps role="listbox" after hydration, so Movar's first pass
    // can read 'inline' and the next 'list'. Each path used to detach only its
    // own kind, leaving the tooltips as hover traps over the very rows the chip
    // was added to protect.
    setBody(`
      <div data-slot="popover">
        <ul id="picker">
          <li id="opt-uk" value="uk">Українська</li>
          <li id="opt-ru" value="ru">Русский</li>
          <li id="opt-en" value="en">English</li>
        </ul>
      </div>
    `);
    filterPickers(findLanguagePickers(), ['uk', 'en'], { blocked: ['ru'] });
    expect(getTooltipHosts().length).toBeGreaterThan(0);
    expect(getEntryCurtainHosts()).toHaveLength(0);

    // Hydration lands: the rows gain their roles.
    const list = document.querySelector<HTMLElement>('#picker')!;
    list.setAttribute('role', 'listbox');
    for (const row of list.children) row.setAttribute('role', 'option');
    filterPickers(findLanguagePickers(), ['uk', 'en'], { blocked: ['ru'] });

    expect(getEntryCurtainHosts()).toHaveLength(1);
    expect(getTooltipHosts()).toHaveLength(0);
  });

  it('removes list-era chips once the picker stops reading as a list', () => {
    // The mirror of the case above, and the arm that LAYOUT_SURFACES now
    // derives rather than naming: a site that tears its listbox roles back off
    // (a popover recycled into a plain strip) reads as 'list' on one pass and
    // 'inline' on the next. The chips have to come down with it, or they stand
    // in rows that are no longer rows.
    const list = setupListboxPicker();
    filterPickers(findLanguagePickers(), ['uk', 'en'], { blocked: ['ru'] });
    expect(getEntryCurtainHosts()).toHaveLength(1);
    expect(getTooltipHosts()).toHaveLength(0);

    list.removeAttribute('role');
    for (const row of list.children) row.removeAttribute('role');
    filterPickers(findLanguagePickers(), ['uk', 'en'], { blocked: ['ru'] });

    expect(getEntryCurtainHosts()).toHaveLength(0);
    expect(getTooltipHosts().length).toBeGreaterThan(0);
  });
});

describe('filterPickers — restore covers rows the Picker snapshot never saw', () => {
  it('detaches the chip of an entry added after the snapshot', () => {
    // picker.links is a snapshot. A row the site adds later is hidden by a later
    // pass and carries its own chip; restoring from the first chip un-hid that
    // row but left its chip standing, and clicking the orphan wrote
    // `display:none !important` back onto an entry with no HIDDEN_ATTR — gone,
    // and unreachable by any later pass or sweep.
    setupListboxPicker();
    filterPickers(findLanguagePickers(), ['uk', 'en'], { blocked: ['ru'] });
    const first = expectEntryCurtained('#opt-ru');

    const list = document.querySelector<HTMLElement>('#picker')!;
    const added = document.createElement('li');
    added.setAttribute('role', 'option');
    added.id = 'opt-be';
    added.setAttribute('value', 'be');
    added.textContent = 'Беларуская';
    list.append(added);
    filterPickers(findLanguagePickers(), ['uk', 'en'], { blocked: ['ru', 'be'] });
    expect(getEntryCurtainHosts()).toHaveLength(2);

    first.shadowRoot!.querySelector<HTMLButtonElement>('button.chip')!.click();

    // Both rows are back and NO chip is left behind claiming otherwise.
    expect(getEntryCurtainHosts()).toHaveLength(0);
    for (const id of ['#opt-ru', '#opt-be']) {
      const row = document.querySelector<HTMLElement>(id)!;
      expect(row.style.getPropertyValue('display')).toBe('');
      expect(row.hasAttribute('data-movar-hidden')).toBe(false);
    }
  });
});

describe('filterPickers — a chip measured in a closed dropdown gets its height later', () => {
  it('rebuilds the chip once the row has a box', () => {
    // A list picker is usually inside a dropdown that is closed when the filter
    // runs, where every row measures 0. Keyed only on its language, the chip
    // kept the floorless height it was born with forever.
    setupListboxPicker();
    filterPickers(findLanguagePickers(), ['uk', 'en'], { blocked: ['ru'] });
    expect(expectEntryCurtained('#opt-ru').style.minHeight).toBe('');

    // The dropdown opens: the rows now have a box.
    for (const row of document.querySelectorAll<HTMLElement>('li[role="option"]')) {
      Object.defineProperty(row, 'offsetHeight', { value: 28, configurable: true });
    }
    filterPickers(findLanguagePickers(), ['uk', 'en'], { blocked: ['ru'] });

    expect(expectEntryCurtained('#opt-ru').style.minHeight).toBe('28px');
    expect(getEntryCurtainHosts()).toHaveLength(1);
  });
});

describe('filterPickers — a chip in a grouped list measures rows, not whatever is first', () => {
  // "A list picker's rows are uniform by construction" is true of the ROWS. The
  // child list holds more than rows: a group header, a separator, a "clear
  // selection" affordance — all of them deliberately not row-shaped. Measured in
  // Chromium on the grouped fixture, taking the first visible sibling took the
  // header: a 37px floor under 28px rows, one band taller than the whole list.

  it('skips a role="presentation" header taller than the rows', () => {
    setupGroupedListbox();
    stubHeight('#group-head', 37);
    stubHeight('#opt-uk', 28);
    stubHeight('#opt-en', 28);

    filterPickers(findLanguagePickers(), ['uk', 'en'], { blocked: ['ru'] });

    expect(expectEntryCurtained('#opt-ru').style.minHeight).toBe('28px');
  });

  it('takes the commonest row height, not the first one it finds', () => {
    // A row whose label wrapped to two lines is the same defect in miniature,
    // and role-matching alone would not catch it — it IS a row.
    setupListboxPicker();
    const rows = [...document.querySelectorAll<HTMLElement>('li[role="option"]')];
    for (const row of rows) {
      Object.defineProperty(row, 'offsetHeight', { value: 28, configurable: true });
    }
    Object.defineProperty(rows[0]!, 'offsetHeight', { value: 52, configurable: true });

    filterPickers(findLanguagePickers(), ['uk', 'en'], { blocked: ['ru'] });

    expect(expectEntryCurtained('#opt-ru').style.minHeight).toBe('28px');
  });

  it('falls back to a differently-shaped sibling when the row has no peers', () => {
    // One classified row among unclassifiable ones is the common case; one row,
    // full stop, is not — but when it happens the shape of the list is all there
    // is to go on, and a floor off the header beats no floor at all.
    setBody(`
      <div data-slot="popover">
        <ul id="picker" role="listbox">
          <li role="presentation" id="group-head">Популярні</li>
          <li role="option" id="opt-ru" value="ru">Русский</li>
          <li id="opt-uk" value="uk">Українська</li>
        </ul>
      </div>
    `);
    stubHeight('#group-head', 37);
    stubHeight('#opt-uk', 37);

    filterPickers(findLanguagePickers(), ['uk'], { blocked: ['ru'] });

    expect(expectEntryCurtained('#opt-ru').style.minHeight).toBe('37px');
  });
});
