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
    expect(messagesEn.hidden.feedHidden(1)).toBe('1 card hidden');
  });

  it('uses the plural noun for every other count', () => {
    expect(messagesEn.hidden.feedHidden(0)).toBe('0 cards hidden');
    expect(messagesEn.hidden.feedHidden(2)).toBe('2 cards hidden');
    expect(messagesEn.hidden.feedHidden(21)).toBe('21 cards hidden');
  });
});

describe('messagesEn plurals — hidden.feedCurtained', () => {
  it('uses the singular noun for n=1', () => {
    expect(messagesEn.hidden.feedCurtained(1)).toBe('1 card behind a curtain');
  });

  it('uses the plural noun for every other count', () => {
    expect(messagesEn.hidden.feedCurtained(2)).toBe('2 cards behind a curtain');
    expect(messagesEn.hidden.feedCurtained(21)).toBe('21 cards behind a curtain');
  });
});

describe('messagesEn plurals — hidden.collapsed', () => {
  it('uses the singular noun for n=1', () => {
    expect(messagesEn.hidden.collapsed(1)).toBe(
      'Hid 1 language switcher with only one option left',
    );
  });

  it('uses the plural noun for n>1', () => {
    expect(messagesEn.hidden.collapsed(3)).toBe(
      'Hid 3 language switchers with only one option left',
    );
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
    expect(messagesEn.pageStatus.hiding([])).toBe('Some content is hidden on this page');
  });
});

describe('messagesEn — paused interpolation', () => {
  it('formats the paused-until date', () => {
    expect(messagesEn.pausedUntilDate('5 PM')).toBe('Until 5 PM');
  });
});

describe('messagesEn — report mailto builders', () => {
  it('subject: includes the host when present, drops it when null', () => {
    expect(messagesEn.report.subject('example.com')).toBe('Movar — problem on example.com');
    expect(messagesEn.report.subject(null)).toBe('Movar — problem');
  });

  it('bodyPrompt: page-specific vs page-less wording', () => {
    expect(messagesEn.report.bodyPrompt(true)).toContain("what's wrong on this page");
    expect(messagesEn.report.bodyPrompt(false)).toContain('Describe the problem');
  });
});

describe('messagesEn — options action labels', () => {
  it('priority move/remove labels interpolate the language', () => {
    expect(messagesEn.options.priority.moveUp('Ukrainian')).toBe('Move Ukrainian up');
    expect(messagesEn.options.priority.moveDown('English')).toBe('Move English down');
    expect(messagesEn.options.priority.remove('Russian')).toBe('Remove Russian');
  });

  it('allowlist remove interpolates the domain', () => {
    expect(messagesEn.options.allowlist.remove('example.com')).toBe('Remove example.com');
  });
});

describe('messagesEn — conceal mode copy', () => {
  it('keeps the legend and options grammatically parallel', () => {
    expect(messagesEn.concealMode.legend).toBe('What happens to hidden content');
    expect(messagesEn.concealMode.curtain).toEqual({
      label: 'Keep behind a curtain',
      description: 'It stays in place, blurred — click to look',
    });
    expect(messagesEn.concealMode.hide).toEqual({
      label: 'Hide',
      description: 'It disappears and the page closes the gap',
    });
  });
});

describe('messagesEn — insights counts', () => {
  it('pluralises the this-week correction count', () => {
    expect(messagesEn.options.insights.thisWeek(1)).toBe('1 correction this week');
    expect(messagesEn.options.insights.thisWeek(0)).toBe('0 corrections this week');
    expect(messagesEn.options.insights.thisWeek(7)).toBe('7 corrections this week');
  });

  it('formats the retention-window total', () => {
    expect(messagesEn.options.insights.total(42)).toBe('42 in the last 30 days');
  });

  it('pluralises the per-site correction count', () => {
    expect(messagesEn.options.insights.siteCount(1)).toBe('1 correction');
    expect(messagesEn.options.insights.siteCount(3)).toBe('3 corrections');
  });

  it('carries a label for every correction mechanism', () => {
    expect(messagesEn.options.insights.mechanism).toEqual({
      header: 'Asked the site',
      cookie: 'Saved the choice on the site',
      localStorage: 'Saved the choice in the browser',
      redirect: 'Opened the right address',
      dom: 'Changed things on the page',
      search: 'Added a hint to a search',
      'search-retry': 'Searched again',
    });
  });

  it('names both language sources without naming a detector', () => {
    expect(messagesEn.options.insights.source).toEqual({
      declared: 'The page said so',
      read: 'Movar read the text',
    });
  });

  it('keeps detector vocabulary out of the insights copy', () => {
    // docs/copy.md bans "engine" / "sync tier" here: they name the
    // implementation, not the act. This section was the last surface leaking
    // raw detector ids, so guard the whole block, not just the two new rows.
    const copy = [
      messagesEn.options.insights.title,
      messagesEn.options.insights.empty,
      messagesEn.options.insights.topSitesLabel,
      messagesEn.options.insights.byMechanismLabel,
      messagesEn.options.insights.bySourceLabel,
      ...Object.values(messagesEn.options.insights.mechanism),
      ...Object.values(messagesEn.options.insights.source),
    ].join(' | ');

    for (const banned of ['engine', 'sync tier', 'franc', 'cld', 'chrome-ai']) {
      expect(copy.toLowerCase()).not.toContain(banned);
    }
  });
});

describe('messagesEn onboarding — interpolated strings', () => {
  it('numbers each step', () => {
    expect(messagesEn.onboarding.stepLabel(2, 4)).toBe('Step 2 of 4');
  });

  it('names the browser in the pin + access step bodies', () => {
    expect(messagesEn.onboarding.steps.pin.body('Chrome')).toContain('Chrome');
    expect(messagesEn.onboarding.access.chromium.body('Edge')).toContain('Edge');
  });
});
