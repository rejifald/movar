import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup } from '@testing-library/react';
import { mountApp } from './mount-app';

afterEach(cleanup);

beforeEach(() => {
  document.body.innerHTML = '';
});

function Hello() {
  return <p data-testid="mounted">hello from app</p>;
}

describe('mountApp', () => {
  it('mounts the app into the #root element', () => {
    const root = document.createElement('div');
    root.id = 'root';
    document.body.append(root);

    act(() => {
      mountApp(Hello);
    });

    const mounted = document.querySelector('[data-testid="mounted"]');
    expect(mounted).not.toBeNull();
    expect(mounted?.textContent).toBe('hello from app');
    // It rendered *inside* the #root container, not loose in the body.
    expect(root.contains(mounted)).toBe(true);
  });

  it('is a no-op when #root is absent', () => {
    // No #root in the document — mountApp must bail without throwing.
    expect(() => {
      mountApp(Hello);
    }).not.toThrow();
    expect(document.querySelector('[data-testid="mounted"]')).toBeNull();
  });
});
