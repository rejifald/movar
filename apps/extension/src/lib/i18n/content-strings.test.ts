import { describe, expect, it } from 'vitest';
import { adaptContentStrings } from './content-strings';
import { contentStringsEn } from './content-strings-en';
import { contentStringsUk } from './content-strings-uk';

// The adapter rebuilds the interpolating/branching curtain functions from plain
// data. These cases pin it to the exact outputs the hand-written function
// catalogues produced before the data split, so the call sites stay unchanged.
describe('adaptContentStrings', () => {
  const en = adaptContentStrings(contentStringsEn);

  it('interpolates the endonym into the picker chip label', () => {
    expect(en.pickerHidden.chipLabel('Ukrainian')).toBe(
      'Movar — Ukrainian. Click to show the language picker.',
    );
  });

  it('uses the sigil-only chip label when no language survived', () => {
    expect(en.pickerHidden.chipLabel(null)).toBe('Movar hid this language picker — click to show');
  });

  it('joins the hidden endonyms into the survivor body', () => {
    expect(en.pickerSurvivor.body(['Russian', 'Belarusian'])).toBe(
      'Movar hid: Russian, Belarusian.',
    );
  });

  it('gives Russian a tailored description + aria-label, others the generic', () => {
    expect(en.contentHidden.descriptionForLanguage('ru')).toBe('In Russian');
    expect(en.contentHidden.descriptionForLanguage('bg')).toBe('Language not in your list');
    expect(en.contentHidden.ariaLabelForLanguage('ru')).toBe('Movar: Russian content hidden');
    expect(en.contentHidden.ariaLabelForLanguage('bg')).toBe('Movar: content hidden');
  });

  it('passes the plain strings through unchanged', () => {
    expect(en.pickerHidden.show).toBe('Show');
    expect(en.pickerSurvivor.title).toBe('Some options hidden');
    expect(en.pickerSurvivor.show).toBe('Show hidden options');
    expect(en.contentHidden.title).toBe('Content hidden');
    expect(en.contentHidden.show).toBe('Show');
  });

  it('adapts Ukrainian the same way', () => {
    const uk = adaptContentStrings(contentStringsUk);
    expect(uk.pickerHidden.chipLabel('українська')).toBe(
      'Movar — українська. Натисніть, щоб показати перемикач мов.',
    );
    expect(uk.pickerSurvivor.body(['російська'])).toBe('Movar приховав: російська.');
    expect(uk.contentHidden.descriptionForLanguage('ru')).toBe('Російською мовою');
    expect(uk.contentHidden.descriptionForLanguage('bg')).toBe('Мова не у вашому списку');
    expect(uk.contentHidden.show).toBe('Показати');
  });

  it('carries the polite live-region announcements in both locales', () => {
    const en = adaptContentStrings(contentStringsEn);
    expect(en.liveRegion.concealed).toBe('Movar hid blocked-language content on this page');
    expect(en.liveRegion.revealed).toBe('Movar restored everything on this page');
    const uk = adaptContentStrings(contentStringsUk);
    expect(uk.liveRegion.concealed).toBe('Movar приховав заблокований вміст на цій сторінці');
    expect(uk.liveRegion.revealed).toBe('Movar відновив усе на цій сторінці');
  });
});
