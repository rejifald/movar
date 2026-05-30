import { afterEach, beforeEach, vi } from 'vitest';
import { detachAllTooltips } from './tooltip';
import { detachAllCurtains } from './curtain';

beforeEach(() => {
  document.body.innerHTML = '';
  document.head.innerHTML = '';
  document.documentElement.removeAttribute('lang');
});

afterEach(() => {
  if (document.querySelector('[data-movar-tooltip]')) {
    detachAllTooltips();
  }
  if (document.querySelector('[data-movar-curtain]')) {
    detachAllCurtains();
  }
  vi.useRealTimers();
});
