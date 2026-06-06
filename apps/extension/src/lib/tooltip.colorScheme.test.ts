import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { attachTooltip, detachAllTooltips, setAllTooltipsColorScheme } from './tooltip';

function getHosts(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('[data-movar-tooltip]')];
}

function setBody(html: string): void {
  document.body.innerHTML = html;
}

beforeEach(() => {
  document.body.innerHTML = '';
  vi.useFakeTimers();
});

afterEach(() => {
  detachAllTooltips();
  vi.useRealTimers();
});

describe('attachTooltip — colorScheme option', () => {
  it('omitting colorScheme leaves the host attribute unset', () => {
    setBody('<a id="anchor" href="#">UA</a>');
    const anchor = document.querySelector<HTMLAnchorElement>('#anchor')!;
    attachTooltip(anchor, { title: 'x' });

    const host = getHosts()[0]!;
    expect(host.hasAttribute('data-movar-color-scheme')).toBe(false);
  });

  it('explicit colorScheme="dark" sets the host attribute', () => {
    setBody('<a id="anchor" href="#">UA</a>');
    const anchor = document.querySelector<HTMLAnchorElement>('#anchor')!;
    attachTooltip(anchor, { title: 'x', colorScheme: 'dark' });

    expect(getHosts()[0]!.getAttribute('data-movar-color-scheme')).toBe('dark');
  });

  it('explicit colorScheme="light" sets the host attribute', () => {
    setBody('<a id="anchor" href="#">UA</a>');
    const anchor = document.querySelector<HTMLAnchorElement>('#anchor')!;
    attachTooltip(anchor, { title: 'x', colorScheme: 'light' });

    expect(getHosts()[0]!.getAttribute('data-movar-color-scheme')).toBe('light');
  });
});

describe('setAllTooltipsColorScheme — live re-skin sweeper', () => {
  it('sets the attribute on every existing tooltip host', () => {
    setBody('<a id="a" href="#">A</a><a id="b" href="#">B</a>');
    attachTooltip(document.querySelector<HTMLElement>('#a')!, { title: 'A' });
    attachTooltip(document.querySelector<HTMLElement>('#b')!, {
      title: 'B',
      colorScheme: 'light',
    });

    setAllTooltipsColorScheme('dark');
    for (const host of getHosts()) {
      expect(host.getAttribute('data-movar-color-scheme')).toBe('dark');
    }
  });

  it('overwrites a previously-set color scheme', () => {
    setBody('<a id="anchor" href="#">x</a>');
    attachTooltip(document.querySelector<HTMLElement>('#anchor')!, {
      title: 'x',
      colorScheme: 'light',
    });

    setAllTooltipsColorScheme('dark');
    expect(getHosts()[0]!.getAttribute('data-movar-color-scheme')).toBe('dark');

    setAllTooltipsColorScheme('light');
    expect(getHosts()[0]!.getAttribute('data-movar-color-scheme')).toBe('light');
  });

  it('is a no-op when no tooltips are attached', () => {
    expect(() => {
      setAllTooltipsColorScheme('dark');
    }).not.toThrow();
  });

  it('only touches tooltips under the supplied root', () => {
    setBody(`
      <section id="left"><a id="a" href="#">A</a></section>
      <section id="right"><a id="b" href="#">B</a></section>
    `);
    attachTooltip(document.querySelector<HTMLElement>('#a')!, { title: 'A' });
    attachTooltip(document.querySelector<HTMLElement>('#b')!, { title: 'B' });

    // Hosts mount under document.body, not under the anchor section — pass
    // a root that excludes them all to confirm the sweeper respects scoping.
    const emptyRoot = document.createElement('section');
    document.body.append(emptyRoot);
    setAllTooltipsColorScheme('dark', emptyRoot);

    for (const host of getHosts()) {
      expect(host.hasAttribute('data-movar-color-scheme')).toBe(false);
    }
  });
});
