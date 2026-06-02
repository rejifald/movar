import { describe, expect, it } from 'vitest';
import { attachCurtain, setAllCurtainsColorScheme } from './curtain';
import { getHost, setBody } from './dom-test-helpers';

// Global teardown lives in test-setup.ts: detachAllCurtains runs in
// afterEach whenever a [data-movar-curtain] host remains.

describe('attachCurtain — colorScheme option', () => {
  it('omitting colorScheme leaves the host attribute unset (CSS media query controls)', () => {
    setBody('<div id="t"></div>');
    const target = document.querySelector<HTMLElement>('#t')!;

    attachCurtain(target, { mode: 'cover', title: 'x', actions: [] });

    const host = getHost();
    expect(host).not.toBeNull();
    expect(host!.hasAttribute('data-movar-color-scheme')).toBe(false);
  });

  it('explicit colorScheme="dark" sets the attribute', () => {
    setBody('<div id="t"></div>');
    const target = document.querySelector<HTMLElement>('#t')!;

    attachCurtain(target, {
      mode: 'cover',
      title: 'x',
      actions: [],
      colorScheme: 'dark',
    });

    const host = getHost();
    expect(host?.getAttribute('data-movar-color-scheme')).toBe('dark');
  });

  it('explicit colorScheme="light" sets the attribute', () => {
    setBody('<div id="t"></div>');
    const target = document.querySelector<HTMLElement>('#t')!;

    attachCurtain(target, {
      mode: 'replace',
      title: 'x',
      actions: [],
      colorScheme: 'light',
    });

    const host = getHost();
    expect(host?.getAttribute('data-movar-color-scheme')).toBe('light');
  });
});

describe('setAllCurtainsColorScheme — live re-skin sweeper', () => {
  it('sets the attribute on every existing curtain host', () => {
    setBody('<div id="a"></div><div id="b"></div><div id="c"></div>');
    attachCurtain(document.querySelector<HTMLElement>('#a')!, {
      mode: 'replace',
      title: 'A',
      actions: [],
    });
    attachCurtain(document.querySelector<HTMLElement>('#b')!, {
      mode: 'cover',
      title: 'B',
      actions: [],
    });
    attachCurtain(document.querySelector<HTMLElement>('#c')!, {
      mode: 'cover',
      title: 'C',
      actions: [],
      // Pre-set to light so the sweeper has to overwrite, not just add.
      colorScheme: 'light',
    });

    setAllCurtainsColorScheme('dark');

    for (const host of document.querySelectorAll<HTMLElement>('[data-movar-curtain]')) {
      expect(host.getAttribute('data-movar-color-scheme')).toBe('dark');
    }
  });

  it('overwrites a previously-set color scheme (light → dark and back)', () => {
    setBody('<div id="t"></div>');
    attachCurtain(document.querySelector<HTMLElement>('#t')!, {
      mode: 'cover',
      title: 'x',
      actions: [],
      colorScheme: 'light',
    });

    setAllCurtainsColorScheme('dark');
    expect(getHost()?.getAttribute('data-movar-color-scheme')).toBe('dark');

    setAllCurtainsColorScheme('light');
    expect(getHost()?.getAttribute('data-movar-color-scheme')).toBe('light');
  });

  it('is a no-op when there are zero curtains on the page', () => {
    setBody('<div></div>');
    expect(() => setAllCurtainsColorScheme('dark')).not.toThrow();
  });

  it('only touches curtains under the supplied root', () => {
    setBody(`
      <section id="left"><div id="a"></div></section>
      <section id="right"><div id="b"></div></section>
    `);
    attachCurtain(document.querySelector<HTMLElement>('#a')!, {
      mode: 'cover',
      title: 'A',
      actions: [],
    });
    attachCurtain(document.querySelector<HTMLElement>('#b')!, {
      mode: 'cover',
      title: 'B',
      actions: [],
    });

    setAllCurtainsColorScheme('dark', document.querySelector<HTMLElement>('#left')!);

    const leftHost = document
      .querySelector<HTMLElement>('#left')!
      .querySelector<HTMLElement>('[data-movar-curtain]');
    const rightHost = document
      .querySelector<HTMLElement>('#right')!
      .querySelector<HTMLElement>('[data-movar-curtain]');
    expect(leftHost?.getAttribute('data-movar-color-scheme')).toBe('dark');
    expect(rightHost?.hasAttribute('data-movar-color-scheme')).toBe(false);
  });
});
