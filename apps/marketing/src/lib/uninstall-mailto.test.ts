import { describe, expect, it } from 'vitest';
import { SUPPORT_EMAIL } from '@movar/brand';
import { buildUninstallMailto } from './uninstall-mailto';
import { strings } from '../i18n';

describe('buildUninstallMailto', () => {
  it('addresses the support inbox', () => {
    expect(buildUninstallMailto('S', 'B').startsWith(`mailto:${SUPPORT_EMAIL}?`)).toBe(true);
  });

  it('encodes the subject and body so an em-dash survives the URL', () => {
    const href = buildUninstallMailto('Movar — after uninstall', 'Say what happened.');
    const query = new URLSearchParams(href.slice(href.indexOf('?') + 1));
    expect(query.get('subject')).toBe('Movar — after uninstall');
    expect(query.get('body')).toBe('Say what happened.\n\n\n');
  });

  // The whole point of the page: it can only ever hand the reader a draft.
  // Anything that posted somewhere would need a backend, which the
  // network-silent promise forbids.
  it('is a mailto and nothing else', () => {
    for (const lang of ['en', 'uk'] as const) {
      const t = strings[lang].uninstall;
      for (const row of t.rows) {
        expect(buildUninstallMailto(row.subject, t.bodyPrompt).startsWith('mailto:')).toBe(true);
      }
    }
  });
});

describe('uninstall copy', () => {
  it('ships every row in both locales', () => {
    expect(strings.en.uninstall.rows).toHaveLength(3);
    expect(strings.uk.uninstall.rows).toHaveLength(3);
  });

  // Each subject names the uninstall so an exit report is filterable in the
  // inbox without being opened, and so a reply lands in the right context.
  it('names the uninstall in every subject', () => {
    for (const lang of ['en', 'uk'] as const) {
      for (const row of strings[lang].uninstall.rows) {
        expect(row.subject.toLowerCase()).toMatch(/uninstall|видалення/);
      }
    }
  });

  // The Ukrainian rows are in the reader's own voice, where a first-person past
  // tense would force a gender ("я хотів" / "я хотіла"). There is no neutral
  // form, so the copy avoids the construction entirely — present tense in row 1,
  // the site as grammatical subject in row 2. This pins that.
  it('never puts a gendered first-person past in the Ukrainian rows', () => {
    for (const row of strings.uk.uninstall.rows) {
      expect(row.label).not.toMatch(/\bя\s+\S+(?:в|ла)\b/u);
    }
  });
});
