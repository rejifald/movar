import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { announce, ANNOUNCE_DEBOUNCE_MS, teardownLiveRegion } from './live-region';

function getRegion(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-movar-live]');
}

beforeEach(() => {
  document.body.innerHTML = '';
  vi.useFakeTimers();
});

afterEach(() => {
  teardownLiveRegion();
  vi.useRealTimers();
});

describe('live-region announce', () => {
  it('does not create the region until the debounce elapses', () => {
    announce('hidden');
    expect(getRegion()).toBeNull();
    vi.advanceTimersByTime(ANNOUNCE_DEBOUNCE_MS);
    expect(getRegion()?.textContent).toBe('hidden');
  });

  it('mounts a visually-hidden polite status region', () => {
    announce('hidden');
    vi.advanceTimersByTime(ANNOUNCE_DEBOUNCE_MS);
    const region = getRegion()!;
    expect(region.getAttribute('role')).toBe('status');
    expect(region.getAttribute('aria-live')).toBe('polite');
    expect(region.getAttribute('aria-atomic')).toBe('true');
    expect(region.parentElement).toBe(document.body);
    // Clipped, not display:none — AT must still read it.
    expect(region.style.position).toBe('absolute');
    expect(region.style.width).toBe('1px');
  });

  it('coalesces a burst into a single write with the latest message (no per-card spam)', () => {
    announce('hid 1');
    announce('hid 2');
    announce('hid 3');
    vi.advanceTimersByTime(ANNOUNCE_DEBOUNCE_MS);
    expect(getRegion()?.textContent).toBe('hid 3');
  });

  it('reuses the one region across announcements (no duplicates)', () => {
    announce('hidden');
    vi.advanceTimersByTime(ANNOUNCE_DEBOUNCE_MS);
    announce('revealed');
    vi.advanceTimersByTime(ANNOUNCE_DEBOUNCE_MS);
    expect(document.querySelectorAll('[data-movar-live]')).toHaveLength(1);
    expect(getRegion()?.textContent).toBe('revealed');
  });

  it('teardown removes the region and cancels a pending announcement', () => {
    announce('hidden');
    teardownLiveRegion();
    vi.advanceTimersByTime(ANNOUNCE_DEBOUNCE_MS * 2);
    expect(getRegion()).toBeNull();
  });

  it('re-creates the region after teardown', () => {
    announce('first');
    vi.advanceTimersByTime(ANNOUNCE_DEBOUNCE_MS);
    teardownLiveRegion();
    expect(getRegion()).toBeNull();

    announce('again');
    vi.advanceTimersByTime(ANNOUNCE_DEBOUNCE_MS);
    expect(getRegion()?.textContent).toBe('again');
  });
});
