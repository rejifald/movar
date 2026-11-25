import { describe, expect, it } from 'vitest';
import { findLanguagePickers } from '@movar/lang-pickers/extract';
import { filterPickers as filterPickersWithPresenter } from './picker-filter';
import { testContentPresenter } from './dom.test-utils';
import { teardownContentModification } from './content-modification';
import {
  setBody,
  setupSelectPicker,
  getMarkedOptions,
  getTooltipHosts,
} from '@movar/lang-pickers/picker.test-utils';
import { filterWithTestPresenter as filterPickers } from './picker.filter.test-utils';

describe('filterPickers — native <select> marks the option in place', () => {
  // An <option> can carry neither a chip (it may not contain an element) nor a
  // hover (every <option> reports a 0x0 box even with the control on screen).
  // It CAN carry text, which is the whole mark: the blocked option is disabled
  // and relabelled where it stands, so nothing is drawn on the page and the
  // evidence appears only when the visitor opens the control. See
  // concealOption for the full argument, including why this replaced a badge
  // floating beside the control.

  const NEUTRAL_LABEL = 'Movar: hidden';

  it('disables the blocked option and leaves it in the list', () => {
    setupSelectPicker(); // uk / ru / en
    const result = filterPickers(findLanguagePickers(), ['uk', 'en'], { blocked: ['ru'] });

    const ru = document.querySelector<HTMLOptionElement>('option[value="ru"]')!;
    // `disabled`, not `hidden`: the option stays in the list so every
    // `options[i]` index and `selectedIndex` a site computes is untouched, and
    // it is unreachable by pointer, keyboard and type-ahead all the same.
    expect(ru.disabled).toBe(true);
    expect(ru.hidden).toBe(false);
    expect(ru.style.getPropertyValue('display')).toBe('');
    expect(result.hiddenLinks.map((l) => l.language)).toEqual(['ru']);
  });

  it('keeps the hidden marker the popup summary counts', () => {
    // buildHiddenSummary re-reads every `[data-movar-hidden]` element off the
    // DOM — that is the ONLY channel the popup's hidden panel has, and the one
    // this surface now leans on entirely for the way back. Changing HOW an
    // entry goes out of reach must never change whether Movar recorded it.
    setupSelectPicker();
    filterPickers(findLanguagePickers(), ['uk', 'en'], { blocked: ['ru'] });

    const ru = document.querySelector<HTMLOptionElement>('option[value="ru"]')!;
    expect(ru.getAttribute('data-movar-hidden')).toBe('not-in-priority');
  });

  it('adds nothing to the page at all', () => {
    // The badge this replaced was a real element on document.body, tracked
    // against the control by hand. The point of the change is that there is now
    // nothing to track, so the assertion is a count of everything Movar could
    // have added.
    setBody(`
      <header id="bar">
        <select id="lang-select">
          <option value="uk">Українська</option>
          <option value="ru">Русский</option>
          <option value="en">English</option>
        </select>
        <button id="after">Menu</button>
      </header>
    `);
    const bar = document.querySelector<HTMLElement>('#bar')!;
    const select = document.querySelector<HTMLSelectElement>('#lang-select')!;
    const before = { bars: bar.children.length, options: select.options.length };

    filterPickers(findLanguagePickers(), ['uk', 'en'], { blocked: ['ru'] });

    expect(document.querySelectorAll('[data-movar-curtain]')).toHaveLength(0);
    expect(getTooltipHosts()).toHaveLength(0);
    // The site's own tree is untouched, so `select + button` rules,
    // :last-child, nth-child and flex gap counts all keep working — and so does
    // any index arithmetic over the control's own options.
    expect(select.nextElementSibling).toBe(document.querySelector('#after'));
    expect(bar.children.length).toBe(before.bars);
    expect(select.options.length).toBe(before.options);
    expect(select.style.getPropertyValue('display')).toBe('');
  });

  it('relabels neutrally, without naming the language it took away', () => {
    // Same reasoning as the in-row chip: this label sits in a list OF language
    // names, so an endonym here reads as one more language to pick.
    setupSelectPicker();
    filterPickers(findLanguagePickers(), ['uk', 'en'], { blocked: ['ru'] });

    const ru = document.querySelector<HTMLOptionElement>('option[value="ru"]')!;
    expect(ru.textContent).toBe(NEUTRAL_LABEL);
    expect(ru.textContent.toLowerCase()).not.toContain('русск');
    // The original is snapshotted verbatim so the restore is exact.
    expect(ru.getAttribute('data-movar-original-text')).toBe('Русский');
  });

  it('names a language once even when two regional variants were hidden', () => {
    // allLinks carries the pre-dedup set, so ru-RU and ru-UA are two hidden
    // entries for one language. The mark and the popup summary both read that
    // list; without the dedup the same language would be announced twice.
    setBody(`
      <select id="lang-select">
        <option value="uk" hreflang="uk" selected>Українська</option>
        <option value="ru-ru" hreflang="ru-RU">Русский (Россия)</option>
        <option value="ru-ua" hreflang="ru-UA">Русский (Украина)</option>
      </select>
    `);
    const result = filterPickers(findLanguagePickers(), ['uk'], { blocked: ['ru'] });

    // Both variants go — the leak movar#293 was about.
    expect(result.hiddenLinks).toHaveLength(2);
    for (const value of ['ru-ru', 'ru-ua']) {
      expect(document.querySelector<HTMLOptionElement>(`option[value="${value}"]`)!.disabled).toBe(
        true,
      );
    }
  });

  it('leaves the surviving options untouched', () => {
    setupSelectPicker();
    filterPickers(findLanguagePickers(), ['uk', 'en'], { blocked: ['ru'] });

    for (const value of ['uk', 'en']) {
      const option = document.querySelector<HTMLOptionElement>(`option[value="${value}"]`)!;
      expect(option.disabled).toBe(false);
      expect(option.hasAttribute('data-movar-original-text')).toBe(false);
    }
  });

  it('hides the option outright in hide mode, with no mark', () => {
    // No presenter IS hide mode: applyContentModification passes one only when
    // concealMode is 'curtain'. Nothing is owed an explanation, so the option
    // just goes — the same thing a list row does.
    setupSelectPicker();
    filterPickersWithPresenter(findLanguagePickers(), ['uk', 'en'], { blocked: ['ru'] });

    const ru = document.querySelector<HTMLOptionElement>('option[value="ru"]')!;
    expect(ru.hidden).toBe(true);
    expect(ru.disabled).toBe(false);
    expect(ru.textContent).toBe('Русский');
    expect(getMarkedOptions()).toHaveLength(0);
  });

  it('never re-snapshots its own label across MutationObserver re-fires', () => {
    // The failure this guards is silent and permanent: a re-fire that read the
    // current text back would store "Movar: hidden" AS the original, and the
    // restore would then put the mark back instead of the language.
    setupSelectPicker();
    filterPickers(findLanguagePickers(), ['uk', 'en'], { blocked: ['ru'] });
    filterPickers(findLanguagePickers(), ['uk', 'en'], { blocked: ['ru'] });
    filterPickers(findLanguagePickers(), ['uk', 'en'], { blocked: ['ru'] });

    const ru = document.querySelector<HTMLOptionElement>('option[value="ru"]')!;
    expect(ru.getAttribute('data-movar-original-text')).toBe('Русский');
    expect(ru.textContent).toBe(NEUTRAL_LABEL);
  });

  it('restores a hide-mode option, which carries no snapshot to put back', () => {
    // The restore runs unmarkOption over every hidden entry, marked or not. An
    // option concealed in hide mode has no ORIGINAL_TEXT_ATTR, so the undo has
    // to be a no-op on the text rather than blanking it — the shape a blind
    // `textContent = getAttribute(...)` would get wrong.
    setupSelectPicker();
    filterPickersWithPresenter(findLanguagePickers(), ['uk', 'en'], { blocked: ['ru'] });
    const ru = document.querySelector<HTMLOptionElement>('option[value="ru"]')!;
    expect(ru.hidden).toBe(true);

    teardownContentModification(testContentPresenter);

    expect(ru.textContent).toBe('Русский');
    expect(ru.hidden).toBe(false);
    expect(ru.disabled).toBe(false);
    expect(ru.hasAttribute('data-movar-hidden')).toBe(false);
  });

  it('re-labels when the UI locale changes under a live page', () => {
    // The reason this layout has an `attach` arm at all. A locale change
    // re-runs the filter WITHOUT a teardown, over an option that already
    // carries HIDDEN_ATTR and so is skipped by the conceal guard — the same
    // staleness `copyRevision` exists to catch for the shadow-DOM surfaces.
    // Without the refresh pass the page keeps the previous language's mark for
    // its lifetime.
    setupSelectPicker();
    let label = 'Movar: hidden';
    const relabelling = { ...testContentPresenter, pickerHiddenOptionLabel: () => label };

    filterPickersWithPresenter(
      findLanguagePickers(),
      ['uk', 'en'],
      { blocked: ['ru'] },
      relabelling,
    );
    const ru = document.querySelector<HTMLOptionElement>('option[value="ru"]')!;
    expect(ru.textContent).toBe('Movar: hidden');

    label = 'Movar: приховано';
    filterPickersWithPresenter(
      findLanguagePickers(),
      ['uk', 'en'],
      { blocked: ['ru'] },
      relabelling,
    );

    expect(ru.textContent).toBe('Movar: приховано');
    // The snapshot is still the site's own text, not either mark — a re-label
    // must never be mistaken for a fresh conceal.
    expect(ru.getAttribute('data-movar-original-text')).toBe('Русский');
  });

  it('restores the option verbatim — text, enabled state and marker', () => {
    setupSelectPicker();
    filterPickers(findLanguagePickers(), ['uk', 'en'], { blocked: ['ru'] });

    // The way back for this surface is the page-wide sweep, which is what the
    // popup's "Show everything" drives — there is no on-page control to click.
    teardownContentModification(testContentPresenter);

    const ru = document.querySelector<HTMLOptionElement>('option[value="ru"]')!;
    expect(ru.textContent).toBe('Русский');
    expect(ru.disabled).toBe(false);
    expect(ru.hidden).toBe(false);
    expect(ru.hasAttribute('data-movar-hidden')).toBe(false);
    expect(ru.hasAttribute('data-movar-original-text')).toBe(false);
  });
});

describe('filterPickers — divider element edge cases', () => {
  // hideUselessDividers walks the container's direct children with a
  // two-pointer scan for the nearest link-bearing sibling on each side.
  // These cases drive the branches where a side has NO link, where the
  // link sits inside a wrapper, and where a candidate child contains no
  // classified link at all (childIsHidden's empty-contained guard).

  it('hides a leading divider that has no link to its left (container edge)', () => {
    // `| EN UA` — the leading `|` has nothing on its left, so leftLink stays
    // null → leftHidden is true → the stranded leading separator is hidden.
    setBody(`
      <div id="picker">
        <span class="sep">|</span>
        <a id="en" href="/en/x">EN</a>
        <a id="ua" href="/ua/x">UA</a>
        <a id="ru" href="/ru/x">RU</a>
      </div>
    `);
    filterPickers(findLanguagePickers(), ['uk', 'en'], { blocked: ['ru'] });
    // The leading separator is orphaned (no left link) and hidden.
    expect(document.querySelector<HTMLElement>('.sep')!.style.display).toBe('none');
  });

  it('finds the adjacent link past a comment node between entries', () => {
    // Sites emit comments and stray text between picker entries (template
    // engines, SSR hydration markers). `adjacentElement` walks past every
    // non-element node to reach the real neighbour; stopping at the first node
    // would read "no link on this side" and strand the separator visible.
    setBody(`
      <div id="picker">
        <a id="ua" href="/ua/x">UA</a>
        <span class="sep">|</span>
        <!-- hydration marker -->
        <a id="ru" href="/ru/x">RU</a>
      </div>
    `);
    filterPickers(findLanguagePickers(), ['uk'], { blocked: ['ru'] });

    expect(document.querySelector<HTMLElement>('#ru')!.style.display).toBe('none');
    expect(document.querySelector<HTMLElement>('.sep')!.style.display).toBe('none');
  });

  it('hides a divider whose adjacent link is wrapped in a non-link element', () => {
    // The classified link is the <a>, but it lives inside a <span> wrapper
    // that is the container's direct child. childIsHidden must look INTO the
    // wrapper (child.contains(link.el)) to see the hidden link, then hide the
    // neighbouring `|`.
    setBody(`
      <div id="picker">
        <span class="wrap"><a id="ua" href="/ua/x">UA</a></span>
        <span class="sep">|</span>
        <span class="wrap"><a id="ru" href="/ru/x">RU</a></span>
      </div>
    `);
    filterPickers(findLanguagePickers(), ['uk'], { blocked: ['ru'] });
    expect(document.querySelector<HTMLAnchorElement>('#ru')!.style.display).toBe('none');
    // RU's wrapper holds the only hidden link, so the `|` before it is stranded.
    expect(document.querySelector<HTMLElement>('.sep')!.style.display).toBe('none');
  });
});
