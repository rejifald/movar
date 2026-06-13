import { afterEach, describe, expect, it } from 'vitest';
import {
  CONTENT_BLURRED_ATTR,
  CONTENT_CHECKED_ATTR,
  CURTAIN_HOST_ATTR,
  HIDDEN_ATTR,
  isMovarOwnedMutation,
  isMovarOwnedNode,
  MOVAR_OWNED_SELECTOR,
  REVEALED_ATTR,
  TOOLTIP_HOST_ATTR,
} from './movar-markers';

afterEach(() => {
  document.body.innerHTML = '';
});

/** A MutationRecord is structurally an object exposing `addedNodes`; the
 *  predicate only reads that, so a minimal stand-in is faithful and avoids
 *  the microtask timing of a real MutationObserver. */
function record(added: Node[]): MutationRecord {
  return { addedNodes: added as unknown as NodeList } as unknown as MutationRecord;
}

function el(attr?: string): HTMLElement {
  const node = document.createElement('div');
  if (attr !== undefined) node.setAttribute(attr, '');
  return node;
}

describe('isMovarOwnedNode', () => {
  it.each([
    ['curtain host', CURTAIN_HOST_ATTR],
    ['tooltip host', TOOLTIP_HOST_ATTR],
    ['hard-hidden card', HIDDEN_ATTR],
    ['blurred card', CONTENT_BLURRED_ATTR],
    ['revealed node', REVEALED_ATTR],
    ['checked sentinel', CONTENT_CHECKED_ATTR],
  ])('treats a %s as Movar-owned', (_label, attr) => {
    expect(isMovarOwnedNode(el(attr))).toBe(true);
  });

  it('treats a node nested inside a Movar element as owned', () => {
    const host = el(CURTAIN_HOST_ATTR);
    const inner = el();
    host.append(inner);
    expect(isMovarOwnedNode(inner)).toBe(true);
  });

  it('treats a plain page element as not owned', () => {
    expect(isMovarOwnedNode(el())).toBe(false);
  });

  it('treats a bare text node as not owned (a genuine page addition)', () => {
    expect(isMovarOwnedNode(document.createTextNode('hello'))).toBe(false);
  });

  it('exposes a selector covering every marker attribute', () => {
    for (const attr of [
      CURTAIN_HOST_ATTR,
      TOOLTIP_HOST_ATTR,
      HIDDEN_ATTR,
      CONTENT_BLURRED_ATTR,
      REVEALED_ATTR,
      CONTENT_CHECKED_ATTR,
    ]) {
      expect(MOVAR_OWNED_SELECTOR).toContain(`[${attr}]`);
    }
  });
});

describe('isMovarOwnedMutation', () => {
  it('is true when every added node is Movar-owned', () => {
    expect(isMovarOwnedMutation([record([el(CURTAIN_HOST_ATTR), el(TOOLTIP_HOST_ATTR)])])).toBe(
      true,
    );
  });

  it('is false when any record adds a genuine page node', () => {
    expect(isMovarOwnedMutation([record([el(CURTAIN_HOST_ATTR)]), record([el()])])).toBe(false);
  });

  it('is false for a single record mixing Movar and page nodes', () => {
    expect(isMovarOwnedMutation([record([el(TOOLTIP_HOST_ATTR), el()])])).toBe(false);
  });

  it('treats a pure removal (no added nodes) as not a page change', () => {
    // `[].every` is vacuously true: a record that only removes nodes doesn't
    // add blockable content, so it must not re-arm the apply loop.
    expect(isMovarOwnedMutation([record([])])).toBe(true);
  });
});
