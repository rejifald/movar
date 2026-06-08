import { describe, expect, it } from 'vitest';
import { messagesEn } from './messages-en';

/**
 * English noun agreement for the two count-bearing popup strings. Mirrors
 * messages-uk.test.ts: English only splits one vs other, but a regression in the
 * Intl.PluralRules wiring would still read "1 cards" / "2 card", so pin both
 * sides of the boundary.
 */
describe('messagesEn plurals — hidden.feedHidden', () => {
  it('uses the singular noun for n=1', () => {
    expect(messagesEn.hidden.feedHidden(1)).toBe('1 card hidden in the feed');
  });

  it('uses the plural noun for every other count', () => {
    expect(messagesEn.hidden.feedHidden(0)).toBe('0 cards hidden in the feed');
    expect(messagesEn.hidden.feedHidden(2)).toBe('2 cards hidden in the feed');
    expect(messagesEn.hidden.feedHidden(21)).toBe('21 cards hidden in the feed');
  });
});

describe('messagesEn plurals — hidden.collapsed', () => {
  it('uses the singular noun for n=1', () => {
    expect(messagesEn.hidden.collapsed(1)).toBe('Collapsed 1 picker with only one option left');
  });

  it('uses the plural noun for n>1', () => {
    expect(messagesEn.hidden.collapsed(3)).toBe('Collapsed 3 pickers with only one option left');
  });
});

// The remaining string-builder functions (name interpolation, conditional
// prompts) carry their own branches; drive each one directly so the popup/
// options call sites can't regress their wording or their conditionals.

describe('messagesEn — pageStatus interpolation', () => {
  it('interpolates the language name into the served/blocked lines', () => {
    expect(messagesEn.pageStatus.servedIn('Ukrainian')).toBe('This page is in Ukrainian');
    expect(messagesEn.pageStatus.blockedTitle('Russian')).toBe('This page is in Russian');
  });

  it('lists hidden picker languages, with a generic fallback for the empty case', () => {
    // Non-empty → "X, Y hidden on this page"; empty → the feed-only generic
    // line (e.g. YouTube, where no picker language was hidden).
    expect(messagesEn.pageStatus.hiding(['Russian', 'Belarusian'])).toBe(
      'Russian, Belarusian hidden on this page',
    );
    expect(messagesEn.pageStatus.hiding([])).toBe('Blocked content hidden on this page');
  });
});

describe('messagesEn — priority + paused interpolation', () => {
  it('joins priority names with arrows', () => {
    expect(messagesEn.priority(['Ukrainian', 'English'])).toBe('Priority Ukrainian → English');
  });

  it('formats the paused-until date', () => {
    expect(messagesEn.pausedUntilDate('5 PM')).toBe('Until 5 PM');
  });
});

describe('messagesEn — report mailto builders', () => {
  it('subject: includes the host when present, drops it when null', () => {
    expect(messagesEn.report.subject('example.com')).toBe('Movar — issue on example.com');
    expect(messagesEn.report.subject(null)).toBe('Movar — issue');
  });

  it('bodyPrompt: page-specific vs page-less wording', () => {
    expect(messagesEn.report.bodyPrompt(true)).toContain("what's wrong on this page");
    expect(messagesEn.report.bodyPrompt(false)).toContain('Describe the issue');
  });
});

describe('messagesEn — options action labels', () => {
  it('priority move/remove labels interpolate the language', () => {
    expect(messagesEn.options.priority.moveUp('Ukrainian')).toBe('Move Ukrainian up');
    expect(messagesEn.options.priority.moveDown('English')).toBe('Move English down');
    expect(messagesEn.options.priority.remove('Russian')).toBe('Remove Russian');
  });

  it('blocked unblock/locked labels interpolate the language', () => {
    expect(messagesEn.options.blocked.unblock('German')).toBe('Unblock German');
    expect(messagesEn.options.blocked.lockedHint('Russian')).toBe('Russian is always blocked');
  });

  it('allowlist remove interpolates the domain', () => {
    expect(messagesEn.options.allowlist.remove('example.com')).toBe('Remove example.com');
  });
});
