import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDebouncedApplyScheduler, MUTATION_DEBOUNCE_MS } from './content-runtime';
import { CURTAIN_HOST_ATTR, HIDDEN_ATTR, TOOLTIP_HOST_ATTR } from './movar-markers';

/** Minimal MutationRecord stand-in — the scheduler reads only `addedNodes`. */
function record(added: Node[]): MutationRecord {
  return { addedNodes: added as unknown as NodeList } as unknown as MutationRecord;
}

function el(attr?: string): HTMLElement {
  const node = document.createElement('div');
  if (attr !== undefined) node.setAttribute(attr, '');
  return node;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('createDebouncedApplyScheduler', () => {
  it('schedules applyOnce after the debounce when a genuine page node is added', () => {
    const apply = vi.fn();
    const onMutations = createDebouncedApplyScheduler(apply);

    onMutations([record([el()])]);
    expect(apply).not.toHaveBeenCalled();
    vi.advanceTimersByTime(MUTATION_DEBOUNCE_MS - 1);
    expect(apply).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2);
    expect(apply).toHaveBeenCalledTimes(1);
  });

  it('does NOT schedule when the only additions are Movar curtain/tooltip nodes', () => {
    const apply = vi.fn();
    const onMutations = createDebouncedApplyScheduler(apply);

    onMutations([record([el(CURTAIN_HOST_ATTR)]), record([el(TOOLTIP_HOST_ATTR)])]);
    vi.advanceTimersByTime(MUTATION_DEBOUNCE_MS * 4);
    expect(apply).not.toHaveBeenCalled();
  });

  it('does NOT schedule for an in-place hide (no added nodes, only a marker attr)', () => {
    // Movar's hide path sets display:none + data-movar-hidden on a *site* node —
    // an attribute mutation, surfaced here as a record with no added nodes.
    const apply = vi.fn();
    const onMutations = createDebouncedApplyScheduler(apply);

    onMutations([record([el(HIDDEN_ATTR)]), record([])]);
    vi.advanceTimersByTime(MUTATION_DEBOUNCE_MS * 4);
    expect(apply).not.toHaveBeenCalled();
  });

  it('still schedules when a page node arrives alongside Movar nodes', () => {
    const apply = vi.fn();
    const onMutations = createDebouncedApplyScheduler(apply);

    onMutations([record([el(CURTAIN_HOST_ATTR)]), record([el()])]);
    vi.advanceTimersByTime(MUTATION_DEBOUNCE_MS);
    expect(apply).toHaveBeenCalledTimes(1);
  });

  it('coalesces a burst of page mutations into a single apply', () => {
    const apply = vi.fn();
    const onMutations = createDebouncedApplyScheduler(apply);

    onMutations([record([el()])]);
    onMutations([record([el()])]);
    onMutations([record([el()])]);
    vi.advanceTimersByTime(MUTATION_DEBOUNCE_MS);
    expect(apply).toHaveBeenCalledTimes(1);
  });

  it('re-arms for a fresh mutation after the previous tick fired', () => {
    const apply = vi.fn();
    const onMutations = createDebouncedApplyScheduler(apply);

    onMutations([record([el()])]);
    vi.advanceTimersByTime(MUTATION_DEBOUNCE_MS);
    expect(apply).toHaveBeenCalledTimes(1);

    onMutations([record([el()])]);
    vi.advanceTimersByTime(MUTATION_DEBOUNCE_MS);
    expect(apply).toHaveBeenCalledTimes(2);
  });
});
