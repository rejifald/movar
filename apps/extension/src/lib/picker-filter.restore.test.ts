import { describe, expect, it } from 'vitest';
import { findLanguagePickers } from '@movar/lang-pickers/extract';
import { detachAllTooltips } from './tooltip';
import { HIDDEN_ATTR } from '@movar/lang-pickers/types';
import type { Picker } from '@movar/lang-pickers/types';
import {
  setBody,
  setupTwoLanguagePicker,
  getTooltipHosts,
  expectEntryCurtained,
} from '@movar/lang-pickers/picker.test-utils';
import {
  filterWithTestPresenter as filterPickers,
  describeNodes,
} from './picker-filter.test-utils';

/** Every DOM write `run` makes inside `target`, synchronously. */
function recordWrites(target: HTMLElement, run: () => void): MutationRecord[] {
  const observer = new MutationObserver(() => {});
  observer.observe(target, {
    subtree: true,
    childList: true,
    attributes: true,
    characterData: true,
  });
  run();
  const records = observer.takeRecords();
  observer.disconnect();
  return records;
}

describe('filterPickers — survivor tooltip re-fire', () => {
  // annotateSurvivingLinks always detaches a link's previously-attached
  // tooltip first (detachSurvivorTooltip), before deciding what to do next.
  // Two outcomes exercise that:
  //  - a link that survives BOTH passes gets its body refreshed instead of
  //    stacking a duplicate (UA here);
  //  - a link that WAS a survivor but is hidden by the second pass has its
  //    stale tooltip detached rather than orphaned — host removed from
  //    `document.body`, entry dropped from tooltip.ts's registry (DE here;
  //    regression coverage for movar#303, which used to `continue` on a
  //    HIDDEN_ATTR link before reaching the detach).

  it('refreshes a surviving link tooltip body when the hidden set grows', () => {
    setBody(`
      <div id="picker">
        <a id="ua" href="/ua/x">UA</a>
        <a id="ru" href="/ru/x">RU</a>
        <a id="de" href="/de/x">DE</a>
      </div>
    `);
    // First pass blocks RU only — UA + DE survive; UA's tooltip lists "русск".
    filterPickers(findLanguagePickers(), ['uk', 'de'], { blocked: ['ru'] });

    // Second pass also blocks DE. UA survives again: its existing tooltip is
    // detached and re-attached with the refreshed hidden list (ru + de). DE
    // stops surviving and its pass-1 tooltip is detached along with it —
    // not left behind (movar#303) — so exactly one host remains.
    filterPickers(findLanguagePickers(), ['uk'], { blocked: ['ru', 'de'] });

    expect(getTooltipHosts()).toHaveLength(1);
    const bodyText =
      getTooltipHosts()[0]!.shadowRoot!.querySelector('.body')?.textContent.toLowerCase() ?? '';
    expect(bodyText).toContain('русск');
    expect(bodyText).toContain('deutsch');
  });

  it('detaches a survivor tooltip (host + registry entry) when the link is later hidden', () => {
    // movar#303: annotateSurvivingLinks's `if (link.el.hasAttribute(HIDDEN_ATTR))
    // continue;` used to run BEFORE the detach-existing branch, so a link
    // that had a survivor tooltip attached and later became HIDDEN_ATTR (a
    // subsequent pass hides it, or an SPA replaces it with a fresh node
    // carrying the marker) kept its old tooltip forever: the host — appended
    // to document.body, outside the picker subtree — was never removed, and
    // its AttachState stayed in tooltip.ts's registry.
    setupTwoLanguagePicker();
    filterPickers(findLanguagePickers(), ['uk'], { blocked: ['ru'] });
    // UA survives (RU is hidden) and gets a survivor tooltip.
    expect(getTooltipHosts()).toHaveLength(1);

    // UA becomes ineligible after its tooltip was attached. Re-running the
    // very same filter pass must not leave UA's now-stale tooltip behind.
    document.querySelector<HTMLAnchorElement>('#ua')!.setAttribute('data-movar-hidden', '');
    filterPickers(findLanguagePickers(), ['uk'], { blocked: ['ru'] });

    // No orphaned host anywhere in the document...
    expect(getTooltipHosts()).toHaveLength(0);
    // ...and nothing left in the registry for the page-wide sweep to find.
    detachAllTooltips();
    expect(getTooltipHosts()).toHaveLength(0);
  });
});

describe('filterPickers — per-picker restore un-hides divider elements', () => {
  // restorePickerInPlace un-hides not just the classified links but also the
  // `<span class="sep">` divider siblings that hideUselessDividers collapsed.
  // Exercises the divider-child un-hide loop (removeAttribute + display reset)
  // that the link-only and text-divider restores don't reach.

  it('reinstates a hidden separator span when the picker is shown again', () => {
    // EN | UA | RU, RU blocked → the `|` before RU is stranded and hidden.
    setBody(`
      <div id="picker">
        <a id="en" href="/en/x">EN</a>
        <span class="sep">|</span>
        <a id="ua" href="/ua/x">UA</a>
        <span class="sep">|</span>
        <a id="ru" href="/ru/x">RU</a>
      </div>
    `);
    filterPickers(findLanguagePickers(), ['uk', 'en'], { blocked: ['ru'] });
    const seps = document.querySelectorAll<HTMLElement>('.sep');
    expect(seps[1]!.style.display).toBe('none'); // UA | RU — hidden
    expect(seps[1]!.hasAttribute('data-movar-hidden')).toBe(true);

    // Restore via a surviving link's tooltip action → restorePickerInPlace.
    const en = document.querySelector<HTMLAnchorElement>('#en')!;
    en.focus();
    getTooltipHosts()[0]!.shadowRoot!.querySelector<HTMLButtonElement>('.action')!.click();

    // The stranded `|` is back: marker cleared and display reset.
    expect(seps[1]!.hasAttribute('data-movar-hidden')).toBe(false);
    expect(seps[1]!.style.getPropertyValue('display')).toBe('');
  });
});

describe("filterPickers — per-picker restore preserves an element's own inline display (#300)", () => {
  // hideElement snapshots the site's own inline `display` (+ priority) into
  // ORIGINAL_DISPLAY_ATTR / ORIGINAL_DISPLAY_PRIORITY_ATTR "so it can be put
  // back verbatim". restorePickerInPlace must actually read that snapshot on
  // restore instead of unconditionally removeProperty-ing `display`, which
  // would wipe an element's own inline display rather than restore it.

  it("restores a link's own inline display verbatim instead of clearing it", () => {
    setBody(`
      <div id="picker">
        <a id="ua" href="/ua/x">UA</a>
        <a id="ru" href="/ru/x" style="display: inline-flex">RU</a>
      </div>
    `);
    filterPickers(findLanguagePickers(), ['uk'], { blocked: ['ru'] });
    const ru = document.querySelector<HTMLAnchorElement>('#ru')!;
    expect(ru.style.display).toBe('none');

    // Restore via a surviving link's tooltip action → restorePickerInPlace.
    const ua = document.querySelector<HTMLAnchorElement>('#ua')!;
    ua.focus();
    getTooltipHosts()[0]!.shadowRoot!.querySelector<HTMLButtonElement>('.action')!.click();

    // RU's own inline-flex is back — not cleared — and the snapshot attrs are gone.
    expect(ru.style.getPropertyValue('display')).toBe('inline-flex');
    expect(ru.hasAttribute('data-movar-original-display')).toBe(false);
    expect(ru.hasAttribute('data-movar-original-display-priority')).toBe(false);
  });

  it("restores a link's own !important display priority, not just the value", () => {
    setBody(`
      <div id="picker">
        <a id="ua" href="/ua/x">UA</a>
        <a id="ru" href="/ru/x" style="display: inline-flex !important">RU</a>
      </div>
    `);
    filterPickers(findLanguagePickers(), ['uk'], { blocked: ['ru'] });
    const ru = document.querySelector<HTMLAnchorElement>('#ru')!;
    expect(ru.style.display).toBe('none');

    const ua = document.querySelector<HTMLAnchorElement>('#ua')!;
    ua.focus();
    getTooltipHosts()[0]!.shadowRoot!.querySelector<HTMLButtonElement>('.action')!.click();

    expect(ru.style.getPropertyValue('display')).toBe('inline-flex');
    expect(ru.style.getPropertyPriority('display')).toBe('important');
  });

  it("restores a stranded divider's own inline display verbatim (the other restoreOriginalDisplay call site)", () => {
    // Same contract, exercised through the divider-sibling un-hide loop in
    // restorePickerInPlace rather than the classified-link loop above.
    setBody(`
      <div id="picker">
        <a id="en" href="/en/x">EN</a>
        <span class="sep">|</span>
        <a id="ua" href="/ua/x">UA</a>
        <span class="sep" style="display: inline-flex">|</span>
        <a id="ru" href="/ru/x">RU</a>
      </div>
    `);
    filterPickers(findLanguagePickers(), ['uk', 'en'], { blocked: ['ru'] });
    const seps = document.querySelectorAll<HTMLElement>('.sep');
    expect(seps[1]!.style.display).toBe('none'); // UA | RU — stranded, hidden

    const en = document.querySelector<HTMLAnchorElement>('#en')!;
    en.focus();
    getTooltipHosts()[0]!.shadowRoot!.querySelector<HTMLButtonElement>('.action')!.click();

    expect(seps[1]!.style.getPropertyValue('display')).toBe('inline-flex');
    expect(seps[1]!.hasAttribute('data-movar-original-display')).toBe(false);
  });
});

describe('filterPickers — hideElement is idempotent on an already-hidden link', () => {
  // hideElement bails immediately when the element already carries HIDDEN_ATTR,
  // so it never re-snapshots the original display. A site that pre-hides a
  // picker entry with its own inline display:none must keep that snapshot
  // intact across a filter pass.
  it('does not re-snapshot an entry the site already hid', () => {
    setBody(`
      <div id="picker">
        <a id="ua" href="/ua/x">UA</a>
        <a id="ru" href="/ru/x" data-movar-hidden="pre-existing" style="display: none">RU</a>
        <a id="en" href="/en/x">EN</a>
      </div>
    `);
    const result = filterPickers(findLanguagePickers(), ['uk', 'en'], { blocked: ['ru'] });
    // RU was already marked hidden — filterPickerLinks skips it, so it is NOT
    // re-reported in hiddenLinks and its original marker survives untouched.
    expect(result.hiddenLinks.map((l) => l.language)).not.toContain('ru');
    expect(
      document.querySelector<HTMLAnchorElement>('#ru')!.getAttribute('data-movar-hidden'),
    ).toBe('pre-existing');
  });
});

describe('filterPickers — regional-variant duplicates of a blocked language (movar#293)', () => {
  // normalizeBCP47 already collapses ru-RU/ru-UA to the base 'ru', so the
  // language MATCH isn't the problem — dedupByLanguage (extract.ts) then
  // keeps only the first same-language entry in picker.links for display.
  // Pre-fix, filterPickerLinks only ever looked at picker.links, so it hid
  // just that first RU anchor; the second RU regional-variant link was
  // never referenced again and stayed fully visible and clickable — the
  // blocked language leaked through it.

  it('hides EVERY regional-variant duplicate of a blocked base language, not just the first', () => {
    setBody(`
      <div id="picker">
        <a id="ru-ru" href="/x" hreflang="ru-RU">RU</a>
        <a id="ru-ua" href="/y" hreflang="ru-UA">RU</a>
        <a id="uk" href="/z" hreflang="uk">UK</a>
      </div>
    `);
    const result = filterPickers(findLanguagePickers(), ['uk'], { blocked: ['ru'] });
    expect(document.querySelector<HTMLElement>('#ru-ru')!.style.display).toBe('none');
    expect(document.querySelector<HTMLElement>('#ru-ua')!.style.display).toBe('none');
    expect(result.hiddenLinks.map((l) => l.language)).toEqual(['ru', 'ru']);
    // The non-blocked language is untouched.
    expect(document.querySelector<HTMLElement>('#uk')!.style.display).toBe('');
  });

  it('does not over-match — a non-blocked language with duplicates stays fully visible', () => {
    setBody(`
      <div id="picker">
        <a id="en-us" href="/x" hreflang="en-US">EN</a>
        <a id="en-gb" href="/y" hreflang="en-GB">EN</a>
        <a id="ru" href="/z" hreflang="ru">RU</a>
      </div>
    `);
    const result = filterPickers(findLanguagePickers(), ['uk', 'en'], { blocked: ['ru'] });
    expect(document.querySelector<HTMLElement>('#en-us')!.style.display).toBe('');
    expect(document.querySelector<HTMLElement>('#en-gb')!.style.display).toBe('');
    expect(result.hiddenLinks.map((l) => l.language)).toEqual(['ru']);
  });

  it('restores every regional-variant duplicate (not just the deduped display entry) on per-picker restore', () => {
    setBody(`
      <div id="picker">
        <a id="ru-ru" href="/x" hreflang="ru-RU">RU</a>
        <a id="ru-ua" href="/y" hreflang="ru-UA">RU</a>
        <a id="uk" href="/z" hreflang="uk">UK</a>
      </div>
    `);
    filterPickers(findLanguagePickers(), ['uk'], { blocked: ['ru'] });
    expect(document.querySelector<HTMLElement>('#ru-ru')!.style.display).toBe('none');
    expect(document.querySelector<HTMLElement>('#ru-ua')!.style.display).toBe('none');

    const uk = document.querySelector<HTMLAnchorElement>('#uk')!;
    uk.focus();
    getTooltipHosts()[0]!.shadowRoot!.querySelector<HTMLButtonElement>('.action')!.click();

    expect(document.querySelector<HTMLElement>('#ru-ru')!.style.display).toBe('');
    expect(document.querySelector<HTMLElement>('#ru-ua')!.style.display).toBe('');
    expect(document.querySelector<HTMLElement>('#ru-ru')!.hasAttribute('data-movar-hidden')).toBe(
      false,
    );
    expect(document.querySelector<HTMLElement>('#ru-ua')!.hasAttribute('data-movar-hidden')).toBe(
      false,
    );
  });
});

describe('filterPickers — what the unguarded re-run is load-bearing for (#586)', () => {
  // #586 proposes skipping a picker whose state signature is unchanged, so the
  // four separator passes stop re-running on every observer tick. Both cases
  // below pass today and FAIL under that guard when it is keyed on the
  // hidden-language set, because neither of them changes it.
  //
  // They are here as characterization, not as a fix: they pin the two things
  // any such guard has to keep working, neither of which the rest of this file
  // covers. See the issue for the prototype that fails them.

  const NBSP = '\u00A0';

  it('hides a blocked duplicate that arrives after the first pass', () => {
    setBody(`
      <div id="picker">
        <a id="ru" href="/x" hreflang="ru">RU</a>
        <a id="uk" href="/y" hreflang="uk">UK</a>
        <a id="en" href="/z" hreflang="en">EN</a>
      </div>
    `);
    filterPickers(findLanguagePickers(), ['uk', 'en'], { blocked: ['ru'] });
    filterPickers(findLanguagePickers(), ['uk', 'en'], { blocked: ['ru'] });
    expect(document.querySelector<HTMLElement>('#ru')!.style.display).toBe('none');

    // The site adds a regional variant of the language that is ALREADY hidden.
    // dedupByLanguage keeps it out of picker.links, so collectHiddenLanguages
    // still reports exactly ['ru'] — a signature built from that cannot see
    // this arrive. Skipping the picker on it would skip filterPickerLinks,
    // which is what hides, and the blocked language leaks through the new
    // element exactly as it did in movar#293.
    const extra = document.createElement('a');
    extra.id = 'ru-ua';
    extra.href = '/w';
    extra.setAttribute('hreflang', 'ru-UA');
    extra.textContent = 'RU';
    document.querySelector<HTMLElement>('#picker')!.append(extra);

    filterPickers(findLanguagePickers(), ['uk', 'en'], { blocked: ['ru'] });
    expect(document.querySelector<HTMLElement>('#ru-ua')!.style.display).toBe('none');
  });

  it('re-trims a container separator the site re-rendered back', () => {
    setBody(
      `<div id="picker">UA${NBSP}|${NBSP}<a id="ru" href="https://e.com/ru">RU</a>${NBSP}|${NBSP}<a id="en" href="https://e.com/en">EN</a></div>`,
    );
    const trimmed = [
      'el:span[text-divider]:UA',
      'el:a[hidden]:RU',
      'el:span[text-divider]:',
      'el:a:EN',
    ];
    const container = document.querySelector<HTMLElement>('#picker')!;

    filterPickers(findLanguagePickers(), ['uk', 'en'], { blocked: ['ru'] });
    // A second tick, so the picker is in the steady state a guard would be
    // skipping from — one pass in, the hidden-language set has not settled yet.
    filterPickers(findLanguagePickers(), ['uk', 'en'], { blocked: ['ru'] });
    expect(describeNodes(container)).toEqual(trimmed);

    // The site re-renders its own separator back as a bare text node while
    // Movar's hides stay in place — an SPA repainting the strip around the
    // entry it did not touch. The hidden-language set does not move, so a
    // signature guard would skip and leave the separator stranded for the life
    // of the page. Re-running the passes unguarded is what repairs it, which is
    // the same property trimOrphanSeparators' own doc comment relies on for its
    // snapshot: the repetition is the repair, not waste.
    const stray = container.querySelectorAll<HTMLElement>('[data-movar-kind="text-divider"]')[1]!;
    stray.replaceWith(
      container.ownerDocument.createTextNode(stray.getAttribute('data-movar-original-text')!),
    );
    expect(describeNodes(container)).not.toEqual(trimmed);

    filterPickers(findLanguagePickers(), ['uk', 'en'], { blocked: ['ru'] });
    expect(describeNodes(container)).toEqual(trimmed);
  });

  // Two more, added with the guard. NEITHER proves the guard fires — a skip and
  // an idempotent re-run are indistinguishable on screen, which is the whole
  // difficulty here; the saving is measured, not asserted (see the commit).
  // What they do pin is worth more than that:
  //
  //   - the first CORRECTS the issue. #586 says the passes "write to the DOM"
  //     on every tick. They do not: hideElement, hideEdgeBorderSide and both
  //     trims all early-out once their work is done, so a steady tick is reads
  //     only. This passes on main, unguarded, and is here so that stays true —
  //     a future pass that writes unconditionally would be caught by it rather
  //     than by a page janking.
  //   - the second pins what the guard's signature has to be KEYED ON. Keyed on
  //     structure and text alone it would not see a site re-applying its own
  //     inline style over Movar's, and the repair would never run. It is the
  //     attributes in the signature that make it fail-safe.
  it('writes nothing on a tick where the picker has not changed (true on main too)', () => {
    setBody(
      `<div id="picker"><a id="uk" href="/uk" hreflang="uk">UK</a><span class="divider">|</span><a id="ru" href="/ru" hreflang="ru">RU</a><span class="divider">|</span><a id="en" href="/en" hreflang="en">EN</a></div>`,
    );
    const container = document.querySelector<HTMLElement>('#picker')!;
    filterPickers(findLanguagePickers(), ['uk', 'en'], { blocked: ['ru'] });
    filterPickers(findLanguagePickers(), ['uk', 'en'], { blocked: ['ru'] });

    const records = recordWrites(container, () => {
      filterPickers(findLanguagePickers(), ['uk', 'en'], { blocked: ['ru'] });
    });

    expect(records).toEqual([]);
  });

  it('repairs a hide the site dropped, which only an attribute-keyed guard sees', () => {
    setBody(
      `<div id="picker"><a id="uk" href="/uk" hreflang="uk">UK</a><span class="divider">|</span><a id="ru" href="/ru" hreflang="ru">RU</a><span class="divider">|</span><a id="en" href="/en" hreflang="en">EN</a></div>`,
    );
    const container = document.querySelector<HTMLElement>('#picker')!;
    filterPickers(findLanguagePickers(), ['uk', 'en'], { blocked: ['ru'] });
    filterPickers(findLanguagePickers(), ['uk', 'en'], { blocked: ['ru'] });

    // The site re-renders the divider Movar had hidden, dropping the hide with
    // it. Nothing about the hidden-language set moved.
    const divider = container.querySelectorAll<HTMLElement>('.divider')[0]!;
    divider.removeAttribute('style');
    divider.removeAttribute(HIDDEN_ATTR);

    const records = recordWrites(container, () => {
      filterPickers(findLanguagePickers(), ['uk', 'en'], { blocked: ['ru'] });
    });

    expect(records.length).toBeGreaterThan(0);
    expect(divider.style.display).toBe('none');
  });
});

describe('restorePickerInPlace — container shapes beyond plain anchors', () => {
  it('restores past an inline SVG icon in the picker container', () => {
    // A globe icon beside the entries is an SVGElement, not an HTMLElement: it
    // has no inline display of ours to put back, and the restore must step over
    // it rather than trip on it.
    setBody(`
      <div id="picker"><svg id="globe" width="16" height="16"><circle r="4"></circle></svg
      ><a id="ua" href="/ua/x">UA</a><a id="ru" href="/ru/x">RU</a><a id="en" href="/en/x">EN</a></div>
    `);
    filterPickers(findLanguagePickers(), ['uk', 'en'], { blocked: ['ru'] });
    expect(document.querySelector<HTMLElement>('#ru')!.style.display).toBe('none');

    getTooltipHosts()[0]!.shadowRoot!.querySelector<HTMLButtonElement>('.action')!.click();

    const ru = document.querySelector<HTMLElement>('#ru')!;
    expect(ru.style.display).toBe('');
    expect(ru.hasAttribute(HIDDEN_ATTR)).toBe(false);
    expect(document.querySelector('#picker')!.firstElementChild?.id).toBe('globe');
  });

  it('un-hides an <option> row of a listbox without inventing a label for it', () => {
    // `<option>` rows outside a `<select>` read as a LIST picker, so they are
    // hidden outright (display + the `hidden` attribute older engines need)
    // and explained by a chip — never relabelled in place. The restore has to
    // clear `hidden` too, and find no label snapshot to put back.
    setBody(`
      <div id="picker" role="listbox"><option id="opt-uk" value="uk">Українська</option
      ><option id="opt-ru" value="ru">Русский</option
      ><option id="opt-en" value="en">English</option></div>
    `);
    filterPickers(findLanguagePickers(), ['uk', 'en'], { blocked: ['ru'] });
    const ru = document.querySelector<HTMLOptionElement>('#opt-ru')!;
    expect(ru.hidden).toBe(true);
    expect(ru.hasAttribute('data-movar-original-text')).toBe(false);

    expectEntryCurtained('#opt-ru')
      .shadowRoot!.querySelector<HTMLButtonElement>('button.chip')!
      .click();

    expect(ru.hidden).toBe(false);
    expect(ru.disabled).toBe(false);
    expect(ru.style.display).toBe('');
    expect(ru.textContent).toBe('Русский');
    expect(ru.hasAttribute(HIDDEN_ATTR)).toBe(false);
  });

  it('hides and restores a caller-built picker that carries no allLinks', () => {
    // `allLinks` is optional on Picker: a caller that never deduped passes only
    // `links`, and both the hide and the restore fall back to it.
    setupTwoLanguagePicker();
    const [found] = findLanguagePickers();
    const picker: Picker = { container: found!.container, links: found!.links, layout: 'inline' };

    const result = filterPickers([picker], ['uk'], { blocked: ['ru'] });

    const ru = document.querySelector<HTMLElement>('#ru')!;
    expect(result.hiddenLinks.map((l) => l.language)).toEqual(['ru']);
    expect(ru.style.display).toBe('none');

    getTooltipHosts()[0]!.shadowRoot!.querySelector<HTMLButtonElement>('.action')!.click();

    expect(ru.style.display).toBe('');
    expect(ru.hasAttribute(HIDDEN_ATTR)).toBe(false);
  });
});
