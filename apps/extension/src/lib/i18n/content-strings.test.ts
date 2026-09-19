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
      'Movar — Ukrainian. Click to show the language switcher.',
    );
  });

  it('uses the sigil-only chip label when no language survived', () => {
    expect(en.pickerHidden.chipLabel(null)).toBe(
      'Movar hid this language switcher — click to show',
    );
  });

  it('keeps the in-row chip label free of any language name', () => {
    // It stands in a list OF language names; naming one there reads as an
    // option rather than as Movar's mark.
    expect(en.pickerEntry.label).toBe('Movar: hidden');
  });

  it('names the HIDDEN language in the in-row entry description', () => {
    // Opposite sense to pickerHidden's label, which names what SURVIVED — this
    // chip stands in the row the language used to occupy.
    expect(en.pickerEntry.chipLabel('Russian')).toBe(
      'Movar hid the Russian option — click to show',
    );
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
      'Мовар — українська. Натисніть, щоб показати перемикач мов.',
    );
    expect(uk.pickerEntry.label).toBe('Мовар: приховано');
    expect(uk.pickerEntry.chipLabel('русский')).toBe(
      'Мовар приховав варіант русский — натисніть, щоб показати',
    );
    expect(uk.pickerSurvivor.body(['російська'])).toBe('Мовар приховав: російська.');
    expect(uk.contentHidden.descriptionForLanguage('ru')).toBe('Російською мовою');
    expect(uk.contentHidden.descriptionForLanguage('bg')).toBe('Мова не у вашому списку');
    expect(uk.contentHidden.show).toBe('Показати');
  });

  it('carries the polite live-region announcements in both locales', () => {
    const en = adaptContentStrings(contentStringsEn);
    expect(en.liveRegion.concealed).toBe('Movar hid content in blocked languages on this page');
    expect(en.liveRegion.revealed).toBe('Movar restored everything on this page');
    const uk = adaptContentStrings(contentStringsUk);
    expect(uk.liveRegion.concealed).toBe(
      'Мовар приховав вміст заблокованими мовами на цій сторінці',
    );
    expect(uk.liveRegion.revealed).toBe('Мовар відновив усе на цій сторінці');
  });
});
