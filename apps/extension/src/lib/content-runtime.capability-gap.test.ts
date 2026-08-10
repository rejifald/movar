/**
 * The capability-gap sentinel: when a chunk concealment cannot run without goes
 * missing, the page must SAY so.
 *
 * Regression context — a Google SERP arrived with a Russian result still
 * visible and not one `data-movar-*` mark on it. That DOM is exactly what a
 * clean, fully-scanned page looks like too (a kept card carries no mark of its
 * own beyond CONTENT_CHECKED, and a pass that never ran stamps nothing at all),
 * so "the capability failed to load" could not be told apart from "there was
 * nothing to hide" without rebuilding the extension with logging. This sentinel
 * is that distinction, and these tests pin it.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { markCapabilityGap } from './content-runtime';
import { CAPABILITY_GAP_ATTR, MOVAR_OWNED_SELECTOR } from './movar-markers';
import type { CapabilityNeeds } from './capabilities';
import type { ConcealFeatureModule } from './capability-loader';

/** Stand-ins: the sentinel only tests these for null, never calls into them. */
const CONCEAL = {} as ConcealFeatureModule;
const MODEL = { extract: () => ({ extractor: 'google', nodes: [] }) };

const NEEDS_BOTH: CapabilityNeeds = {
  conceal: 'features/conceal.js',
  model: 'models/google.js',
  presenter: null,
};

function root(): Element {
  return document.documentElement;
}

afterEach(() => {
  root().removeAttribute(CAPABILITY_GAP_ATTR);
});

describe('markCapabilityGap', () => {
  it('leaves no mark when every needed chunk loaded', () => {
    markCapabilityGap(NEEDS_BOTH, CONCEAL, MODEL);
    expect(root().hasAttribute(CAPABILITY_GAP_ATTR)).toBe(false);
  });

  it('names the conceal chunk when it is needed but missing', () => {
    markCapabilityGap(NEEDS_BOTH, null, MODEL);
    expect(root().getAttribute(CAPABILITY_GAP_ATTR)).toBe('features/conceal.js');
  });

  it('names the model chunk when it is needed but missing', () => {
    markCapabilityGap(NEEDS_BOTH, CONCEAL, null);
    expect(root().getAttribute(CAPABILITY_GAP_ATTR)).toBe('models/google.js');
  });

  it('names every missing chunk — the observed outage took out all of them at once', () => {
    markCapabilityGap(NEEDS_BOTH, null, null);
    expect(root().getAttribute(CAPABILITY_GAP_ATTR)).toBe('features/conceal.js models/google.js');
  });

  it('does not flag a host with no model of its own', () => {
    // resolveModelChunk returns null off google/youtube; concealment still runs
    // (picker filtering), so a null model there is normal, not a gap.
    markCapabilityGap(
      { conceal: 'features/conceal.js', model: null, presenter: null },
      CONCEAL,
      null,
    );
    expect(root().hasAttribute(CAPABILITY_GAP_ATTR)).toBe(false);
  });

  it('does not flag a missing presenter — curtain mode degrades to a hard hide', () => {
    markCapabilityGap(
      {
        conceal: 'features/conceal.js',
        model: 'models/google.js',
        presenter: 'features/curtain-ui.js',
      },
      CONCEAL,
      MODEL,
    );
    expect(root().hasAttribute(CAPABILITY_GAP_ATTR)).toBe(false);
  });

  it('clears the mark once a later tick provisions the chunk', () => {
    // Pairs with the loader no longer memoizing failures: a transient miss is
    // recoverable, so the sentinel must describe the page NOW, not its worst tick.
    markCapabilityGap(NEEDS_BOTH, null, null);
    markCapabilityGap(NEEDS_BOTH, CONCEAL, MODEL);
    expect(root().hasAttribute(CAPABILITY_GAP_ATTR)).toBe(false);
  });

  it('is NOT part of the Movar-owned selector', () => {
    // The sentinel sits on <html>, an ancestor of every node. In the owned
    // selector (consulted via closest()) it would make every page mutation read
    // as Movar's own and silence the apply loop for the whole page.
    expect(MOVAR_OWNED_SELECTOR).not.toContain(CAPABILITY_GAP_ATTR);
  });
});
