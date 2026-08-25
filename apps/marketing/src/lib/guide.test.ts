/*
 * The guide hub's routing, grouping and plural helpers.
 *
 * These are small, but three of them are the kind of small that breaks
 * silently: a checklist link that resolves to the wrong shape 404s rather than
 * failing a build, `detectTokens` decides which cards get tagged as the
 * reader's own, and the plural rule is now shared by two different nouns.
 */
import { describe, expect, it } from 'vitest';

import {
  GUIDE_GROUPS,
  GUIDE_INDEX_HREF,
  GUIDE_MATCH_TOKENS,
  checklistHref,
  checklistLinkLabel,
  detectTokens,
  guideGroupAnchor,
  guidePageHref,
  guideStrings,
  pluralForm,
} from './guide';

describe('pluralForm', () => {
  /* Not a singular/plural switch: the teens are the exception a naive `n % 10`
   * gets wrong, and 11 is the one everyone forgets. */
  const CASES: readonly (readonly [number, 'one' | 'few' | 'many'])[] = [
    [0, 'many'],
    [1, 'one'],
    [2, 'few'],
    [4, 'few'],
    [5, 'many'],
    [11, 'many'],
    [12, 'many'],
    [14, 'many'],
    [15, 'many'],
    [21, 'one'],
    [22, 'few'],
    [25, 'many'],
    [101, 'one'],
    [111, 'many'],
  ];

  for (const [count, expected] of CASES) {
    it(`${count} takes the ${expected} form`, () => {
      expect(pluralForm(count)).toBe(expected);
    });
  }
});

describe('checklist links', () => {
  it('sends a page item to that page', () => {
    expect(checklistHref('page:klaviatura')).toBe(`${GUIDE_INDEX_HREF}/klaviatura`);
  });

  it('sends an OS-dependent item to the group block instead of guessing a platform', () => {
    // «Мова інтерфейсу системи» has four different pages depending on the
    // reader's OS, so it points at the block listing all four.
    expect(checklistHref('group:device')).toBe(`#${guideGroupAnchor('device')}`);
  });

  it('labels both forms', () => {
    expect(checklistLinkLabel('page:klaviatura')).toBe('Клавіатури');
    expect(checklistLinkLabel('group:device')).toBe('Пристрій');
  });

  it('labels every item the checklist actually renders', () => {
    // An unlabelled row renders a link with no text — invisible, and only a
    // reader would ever notice.
    for (const group of guideStrings.checklist.groups) {
      for (const item of group.items) {
        expect(checklistLinkLabel(item.to), item.id).not.toBe('');
        expect(checklistHref(item.to), item.id).not.toBe('');
      }
    }
  });

  it('points every group item at a group that exists', () => {
    const anchors = new Set(GUIDE_GROUPS.map((group) => `#${guideGroupAnchor(group.id)}`));

    for (const group of guideStrings.checklist.groups) {
      for (const item of group.items.filter((entry) => entry.to.startsWith('group:'))) {
        expect(anchors.has(checklistHref(item.to)), item.id).toBe(true);
      }
    }
  });
});

describe('detectTokens', () => {
  it('emits one OS and one browser, most specific first', () => {
    expect(
      detectTokens(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0',
      ),
    ).toEqual(['windows', 'edge']);
  });

  it('does not read Chrome as Safari, though its UA says both', () => {
    expect(
      detectTokens(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
      ),
    ).toEqual(['macos', 'chrome']);
  });

  it('emits nothing it cannot see', () => {
    expect(detectTokens('SomeCrawler/1.0')).toEqual([]);
  });

  it('only ever emits tokens a page is allowed to claim', () => {
    // The collection schema is built from `GUIDE_MATCH_TOKENS`, so a card can
    // only claim a platform this can emit. The other direction — that every
    // emitted token is in the list — is what makes the pairing total.
    const agents = [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:130.0) Gecko/20100101 Firefox/130.0',
    ];

    for (const agent of agents) {
      for (const token of detectTokens(agent)) {
        expect(GUIDE_MATCH_TOKENS).toContain(token);
      }
    }
  });
});

describe('guide routes', () => {
  it('keeps every page under the Ukrainian-only hub', () => {
    expect(guidePageHref('chrome')).toBe(`${GUIDE_INDEX_HREF}/chrome`);
    expect(GUIDE_INDEX_HREF.startsWith('/uk/')).toBe(true);
  });

  it('gives every group a distinct anchor', () => {
    const anchors = GUIDE_GROUPS.map((group) => guideGroupAnchor(group.id));

    expect(new Set(anchors).size).toBe(GUIDE_GROUPS.length);
  });
});
