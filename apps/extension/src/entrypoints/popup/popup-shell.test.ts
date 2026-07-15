import { describe, expect, it } from 'vitest';
import { size } from '@movar/theme';
import { POPUP_WIDTH_CLASS } from './popup-shell';

describe('POPUP_WIDTH_CLASS', () => {
  // The class is a scannable literal, but the *value* is the design token's to
  // own. This guards the literal against drifting from `size.popup` — the whole
  // reason the three shell surfaces share one constant instead of retyping it.
  it('stays in sync with @movar/theme size.popup', () => {
    expect(POPUP_WIDTH_CLASS).toBe(`w-[${size.popup}]`);
  });
});
