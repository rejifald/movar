import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { messagesEn, messagesUk } from '@movar/i18n';
import { VersionLink } from './version-link';

describe('VersionLink', () => {
  it('stamps `v<version>` and links to the anchored changelog', () => {
    render(<VersionLink version="1.6.2" locale="en" label={messagesEn.versionLink} />);

    const link = screen.getByRole('link', { name: "v1.6.2 — what's new" });
    expect(link.getAttribute('href')).toBe('https://movar.fyi/changelog#v1.6.2');
    expect(link.textContent).toBe('v1.6.2');
  });

  it('follows the UI locale to the Ukrainian changelog', () => {
    render(<VersionLink version="1.6.2" locale="uk" label={messagesUk.versionLink} />);

    const link = screen.getByRole('link', { name: 'v1.6.2 — що нового' });
    expect(link.getAttribute('href')).toBe('https://movar.fyi/uk/changelog#v1.6.2');
  });

  // WCAG 2.5.3: the visible text is the whole label, so the accessible name
  // must contain it — a speech-input user says what they see. The regex anchors
  // that the name STARTS with the stamp, which is the contract `versionLink`
  // documents for both catalogues.
  it('opens in a new tab, and its accessible name starts with the visible stamp', () => {
    render(<VersionLink version="1.6.2" locale="en" label={messagesEn.versionLink} />);

    const link = screen.getByRole('link', { name: /^v1\.6\.2/ });
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
  });
});
